import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FailureBoundaryError,
  createControlledPressureBoundary,
  digestFailureProfile,
  type AuthorizationGrant,
  type ControlledPressureDependencies,
  type FailureProfile,
  type FailureTarget,
} from './failureDriver'

const target: FailureTarget = {
  environment: 'ephemeral-lab', clusterUid: 'cluster-1', namespace: 'proof', selector: 'app=evidence', allowlistRef: 'failure-targets/v1',
}

const profile: FailureProfile = {
  schemaVersion: 'agentic-501-failure-profile/v1', id: 'dependency-latency-small', version: '1.0.0', implementationStatus: 'implemented', enabled: true,
  failureType: 'dependency-latency', target,
  guards: {
    maximumDurationSeconds: 60, maximumAffectedReplicas: 1, maximumAffectedPercent: 25,
    oneFailureAtATime: true, automaticRollback: true,
    abortConditions: ['authority-boundary-violation', 'correlation-loss', 'unexpected-blast-radius'],
  },
  authorization: {
    required: true, singleUse: true, expiresAfterSeconds: 300, separationOfDuties: true,
    tokenBinding: ['runId', 'profileId', 'profileVersion', 'targetClusterUid', 'targetNamespace', 'requestDigest'],
  },
  apply: { driver: 'injected-test-actuator', parameters: { latencyMs: 500 } },
  rollback: { driver: 'injected-test-actuator', deadlineSeconds: 30, verifyCommandId: 'verify-no-latency' },
  evidence: { requiredEventTypes: ['failure.applied', 'failure.removed', 'recovery.asserted'], retainRawDriverReceipt: true, redactSecrets: true },
}

const requestDigest = `sha256:${'a'.repeat(64)}`
const grant = (overrides: Partial<AuthorizationGrant> = {}): AuthorizationGrant => ({
  tokenId: 'single-use-token', approvedBy: 'reviewer', expiresAt: '2026-09-28T12:05:00.000Z',
  binding: {
    runId: 'run-1', profileId: profile.id, profileVersion: profile.version, targetClusterUid: target.clusterUid,
    targetNamespace: target.namespace, requestDigest,
  },
  ...overrides,
})

const makeRequest = () => ({
  runId: 'run-1', requestedBy: 'operator', requestDigest, profile, profileDigest: digestFailureProfile(profile), authorization: grant(),
  plan: { durationSeconds: 30, affectedReplicas: 1 },
})

const makeDependencies = (): ControlledPressureDependencies => ({
  allowlist: { containsExactTarget: vi.fn(async () => true) },
  authorization: { consumeOnce: vi.fn(async () => true) },
  inspector: { inspect: vi.fn(async () => ({ target, eligibleReplicas: 5 })) },
  actuator: {
    apply: vi.fn(async () => ({ operationId: 'driver-apply-1', detail: 'secret-free' })),
    remove: vi.fn(async () => ({ operationId: 'driver-remove-1' })),
  },
  verifier: {
    verifyApplied: vi.fn(async () => ({ verified: true, evidenceDigest: `sha256:${'b'.repeat(64)}` })),
    verifyRemoved: vi.fn(async () => ({ verified: true, evidenceDigest: `sha256:${'c'.repeat(64)}` })),
  },
  receipts: { record: vi.fn(async () => undefined) },
  now: () => new Date('2026-09-28T12:00:00.000Z'),
  createId: (() => { let sequence = 0; return () => `id-${++sequence}` })(),
  scheduler: { schedule: vi.fn(() => 'timer-1'), cancel: vi.fn() },
})

describe('controlled pressure boundary', () => {
  let dependencies: ControlledPressureDependencies

  beforeEach(() => { dependencies = makeDependencies() })

  it('is disabled by default and does not consume authorization or touch the actuator', async () => {
    const boundary = createControlledPressureBoundary({ dependencies })
    await expect(boundary.apply(makeRequest())).rejects.toMatchObject({ code: 'BOUNDARY_DISABLED' })
    expect(dependencies.authorization.consumeOnce).not.toHaveBeenCalled()
    expect(dependencies.actuator.apply).not.toHaveBeenCalled()
    expect(dependencies.receipts.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'failure.rejected', outcome: 'rejected' }))
  })

  it('requires an exact inspected target and exact allowlist membership before consuming authorization', async () => {
    vi.mocked(dependencies.inspector.inspect).mockResolvedValue({ target: { ...target, namespace: 'other' }, eligibleReplicas: 5 })
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    await expect(boundary.apply(makeRequest())).rejects.toMatchObject({ code: 'TARGET_DRIFT' })
    expect(dependencies.allowlist.containsExactTarget).not.toHaveBeenCalled()
    expect(dependencies.authorization.consumeOnce).not.toHaveBeenCalled()
  })

  it('binds one-time authorization to the immutable profile and complete request identity', async () => {
    const request = makeRequest()
    request.profile.apply.parameters.latencyMs = 900
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    await expect(boundary.apply(request)).rejects.toMatchObject({ code: 'PROFILE_IDENTITY_MISMATCH' })

    vi.mocked(dependencies.authorization.consumeOnce).mockResolvedValue(false)
    await expect(boundary.apply(makeRequest())).rejects.toMatchObject({ code: 'AUTHORIZATION_REUSED' })
    expect(dependencies.actuator.apply).not.toHaveBeenCalled()
  })

  it.each([
    ['duration', { durationSeconds: 61, affectedReplicas: 1 }],
    ['replica count', { durationSeconds: 30, affectedReplicas: 2 }],
    ['affected percent', { durationSeconds: 30, affectedReplicas: 1 }],
  ])('rejects a plan exceeding the %s guard', async (guard, plan) => {
    if (guard === 'affected percent') vi.mocked(dependencies.inspector.inspect).mockResolvedValue({ target, eligibleReplicas: 3 })
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    await expect(boundary.apply({ ...makeRequest(), plan })).rejects.toMatchObject({ code: 'GUARD_EXCEEDED' })
    expect(dependencies.authorization.consumeOnce).not.toHaveBeenCalled()
    expect(dependencies.actuator.apply).not.toHaveBeenCalled()
  })

  it('applies once, independently verifies, emits a redacted receipt, and replays idempotently', async () => {
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    const first = await boundary.apply(makeRequest())
    const replay = await boundary.apply(makeRequest())

    expect(replay).toEqual(first)
    expect(dependencies.authorization.consumeOnce).toHaveBeenCalledTimes(1)
    expect(dependencies.actuator.apply).toHaveBeenCalledTimes(1)
    expect(dependencies.verifier.verifyApplied).toHaveBeenCalledTimes(1)
    expect(first).toMatchObject({ eventType: 'failure.applied', outcome: 'applied', profileDigest: digestFailureProfile(profile) })
    expect(JSON.stringify(first)).not.toContain('single-use-token')
    expect(first.rawDriverReceiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(dependencies.scheduler?.schedule).toHaveBeenCalledWith(expect.any(Function), 30_000)
  })

  it('rejects a conflicting idempotency replay without another authorization or actuator call', async () => {
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    await boundary.apply(makeRequest())
    await expect(boundary.apply({ ...makeRequest(), requestedBy: 'different-operator' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(dependencies.authorization.consumeOnce).toHaveBeenCalledTimes(1)
    expect(dependencies.actuator.apply).toHaveBeenCalledTimes(1)
  })

  it('removes once, verifies removal independently, and replays removal idempotently', async () => {
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    const applied = await boundary.apply(makeRequest())
    const first = await boundary.remove(applied.executionId, 'completed')
    const replay = await boundary.remove(applied.executionId, 'completed')

    expect(replay).toEqual(first)
    expect(dependencies.actuator.remove).toHaveBeenCalledTimes(1)
    expect(dependencies.verifier.verifyRemoved).toHaveBeenCalledTimes(1)
    expect(first).toMatchObject({ eventType: 'failure.removed', outcome: 'removed', reason: 'completed' })
  })

  it('rolls back and verifies removal when post-apply verification fails', async () => {
    vi.mocked(dependencies.verifier.verifyApplied).mockResolvedValue({ verified: false, evidenceDigest: `sha256:${'d'.repeat(64)}`, detail: 'not observed' })
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })

    await expect(boundary.apply(makeRequest())).rejects.toBeInstanceOf(FailureBoundaryError)
    expect(dependencies.actuator.remove).toHaveBeenCalledTimes(1)
    expect(dependencies.verifier.verifyRemoved).toHaveBeenCalledTimes(1)
    expect(dependencies.receipts.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'failure.removed', outcome: 'rolled-back' }))
  })

  it('also rolls back when independent apply verification is unavailable', async () => {
    vi.mocked(dependencies.verifier.verifyApplied).mockRejectedValue(new Error('verifier offline'))
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    await expect(boundary.apply(makeRequest())).rejects.toMatchObject({ code: 'APPLY_UNVERIFIED' })
    expect(dependencies.actuator.remove).toHaveBeenCalledTimes(1)
    expect(dependencies.verifier.verifyRemoved).toHaveBeenCalledTimes(1)
  })

  it('rolls back an active execution on an explicit abort condition', async () => {
    const boundary = createControlledPressureBoundary({ enabled: true, dependencies })
    const applied = await boundary.apply(makeRequest())
    const receipt = await boundary.abort(applied.executionId, 'correlation-loss')
    expect(receipt).toMatchObject({ outcome: 'rolled-back', reason: 'correlation-loss' })
    expect(dependencies.actuator.remove).toHaveBeenCalledTimes(1)
  })
})
