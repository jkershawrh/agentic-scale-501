import { createHash } from 'node:crypto'

type JsonPrimitive = string | number | boolean
type DriverReceipt = Readonly<Record<string, unknown>>

export type FailureType = 'dependency-latency' | 'dependency-unavailable' | 'inference-rate-limit' | 'cpu-contention' | 'worker-termination'
export type AbortCondition = 'authority-boundary-violation' | 'correlation-loss' | 'collector-unavailable' | 'target-drift' | 'error-budget-exhausted' | 'rollback-deadline-risk' | 'unexpected-blast-radius'

export interface FailureTarget {
  environment: 'ephemeral-lab' | 'certification'
  clusterUid: string
  namespace: string
  selector: string
  allowlistRef: string
}

export interface FailureProfile {
  schemaVersion: 'agentic-501-failure-profile/v1'
  id: string
  version: string
  implementationStatus: 'runtime-gated' | 'unimplemented' | 'implemented'
  enabled: boolean
  failureType: FailureType
  target: FailureTarget
  guards: {
    maximumDurationSeconds: number
    maximumAffectedReplicas: number
    maximumAffectedPercent: number
    oneFailureAtATime: boolean
    automaticRollback: boolean
    abortConditions: AbortCondition[]
  }
  authorization: {
    required: boolean
    singleUse: boolean
    expiresAfterSeconds: number
    separationOfDuties: boolean
    tokenBinding: Array<'runId' | 'profileId' | 'profileVersion' | 'targetClusterUid' | 'targetNamespace' | 'requestDigest'>
  }
  apply: { driver: string; parameters: Record<string, JsonPrimitive> }
  rollback: { driver: string; deadlineSeconds: number; verifyCommandId: string }
  evidence: {
    requiredEventTypes: Array<'failure.applied' | 'failure.removed' | 'recovery.asserted' | 'policy.evaluated'>
    retainRawDriverReceipt: boolean
    redactSecrets: boolean
  }
}

export interface AuthorizationBinding {
  runId: string
  profileId: string
  profileVersion: string
  targetClusterUid: string
  targetNamespace: string
  requestDigest: string
}

export interface AuthorizationGrant {
  tokenId: string
  approvedBy: string
  expiresAt: string
  binding: AuthorizationBinding
}

export interface ControlledPressureRequest {
  runId: string
  requestedBy: string
  requestDigest: string
  profile: FailureProfile
  profileDigest: string
  authorization: AuthorizationGrant
  plan: { durationSeconds: number; affectedReplicas: number }
}

export interface TargetInspection {
  target: FailureTarget
  eligibleReplicas: number
}

export interface DriverCommand {
  executionId: string
  runId: string
  requestDigest: string
  profileDigest: string
  profile: Readonly<FailureProfile>
  target: Readonly<FailureTarget>
  durationSeconds: number
  affectedReplicas: number
}

export interface VerificationResult {
  verified: boolean
  evidenceDigest: string
  detail?: string
}

export interface FailureReceipt {
  schemaVersion: 'agentic-501-failure-receipt/v1'
  receiptId: string
  eventType: 'failure.applied' | 'failure.removed' | 'failure.rejected'
  outcome: 'applied' | 'removed' | 'rolled-back' | 'rejected' | 'rollback-unverified'
  recordedAt: string
  executionId?: string
  runId?: string
  requestDigest?: string
  profileId?: string
  profileVersion?: string
  profileDigest?: string
  target?: FailureTarget
  reason?: string
  verification?: VerificationResult
  rawDriverReceiptDigest?: string
}

export type AppliedFailureReceipt = FailureReceipt & {
  eventType: 'failure.applied'
  outcome: 'applied'
  executionId: string
}

export interface ControlledPressureDependencies {
  allowlist: { containsExactTarget(target: Readonly<FailureTarget>): Promise<boolean> }
  authorization: { consumeOnce(grant: Readonly<AuthorizationGrant>, expected: Readonly<AuthorizationBinding>): Promise<boolean> }
  inspector: { inspect(target: Readonly<FailureTarget>): Promise<TargetInspection> }
  actuator: {
    apply(command: Readonly<DriverCommand>, signal?: AbortSignal): Promise<DriverReceipt>
    remove(command: Readonly<DriverCommand>, signal?: AbortSignal): Promise<DriverReceipt>
  }
  verifier: {
    verifyApplied(command: Readonly<DriverCommand>, driverReceipt: DriverReceipt): Promise<VerificationResult>
    verifyRemoved(command: Readonly<DriverCommand>, driverReceipt: DriverReceipt): Promise<VerificationResult>
  }
  receipts: { record(receipt: Readonly<FailureReceipt>): Promise<void> }
  now?: () => Date
  createId?: () => string
  scheduler?: { schedule(callback: () => void, delayMs: number): unknown; cancel(handle: unknown): void }
}

export interface ControlledPressureBoundaryOptions {
  enabled?: boolean
  maximumDurationSeconds?: number
  maximumAffectedReplicas?: number
  maximumAffectedPercent?: number
  dependencies: ControlledPressureDependencies
}

export class FailureBoundaryError extends Error {
  constructor(readonly code: string, message: string, readonly receipt: FailureReceipt) {
    super(message)
    this.name = 'FailureBoundaryError'
  }
}

const shaPattern = /^sha256:[0-9a-f]{64}$/
const requiredBindings = ['runId', 'profileId', 'profileVersion', 'targetClusterUid', 'targetNamespace', 'requestDigest'] as const

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`

export const digestFailureProfile = (profile: FailureProfile): string => digest(profile)

const targetsEqual = (left: FailureTarget, right: FailureTarget) =>
  left.environment === right.environment && left.clusterUid === right.clusterUid && left.namespace === right.namespace
  && left.selector === right.selector && left.allowlistRef === right.allowlistRef

const bindingsEqual = (left: AuthorizationBinding, right: AuthorizationBinding) =>
  requiredBindings.every((key) => left[key] === right[key])

const defaultScheduler = {
  schedule: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
  cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

interface Execution {
  command: DriverCommand
  timer?: unknown
  detachAbort?: () => void
  removal?: Promise<FailureReceipt>
  removed?: FailureReceipt
}

export interface ControlledPressureBoundary {
  apply(request: ControlledPressureRequest, signal?: AbortSignal): Promise<AppliedFailureReceipt>
  remove(executionId: string, reason?: string): Promise<FailureReceipt>
  abort(executionId: string, condition: AbortCondition): Promise<FailureReceipt>
}

export function createControlledPressureBoundary(options: ControlledPressureBoundaryOptions): ControlledPressureBoundary {
  const enabled = options.enabled ?? false
  const maximumDurationSeconds = options.maximumDurationSeconds ?? 300
  const maximumAffectedReplicas = options.maximumAffectedReplicas ?? 1
  const maximumAffectedPercent = options.maximumAffectedPercent ?? 25
  const dependencies = options.dependencies
  const now = dependencies.now ?? (() => new Date())
  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID())
  const scheduler = dependencies.scheduler ?? defaultScheduler
  const applyReceipts = new Map<string, { fingerprint: string; receipt: AppliedFailureReceipt }>()
  const applyInFlight = new Map<string, { fingerprint: string; operation: Promise<AppliedFailureReceipt> }>()
  const executions = new Map<string, Execution>()
  let activeExecutionId: string | undefined

  const makeReceipt = (partial: Omit<FailureReceipt, 'schemaVersion' | 'receiptId' | 'recordedAt'>): FailureReceipt => ({
    schemaVersion: 'agentic-501-failure-receipt/v1', receiptId: createId(), recordedAt: now().toISOString(), ...partial,
  })

  const reject = async (code: string, message: string, request?: ControlledPressureRequest): Promise<never> => {
    const receipt = makeReceipt({
      eventType: 'failure.rejected', outcome: 'rejected', reason: code,
      runId: request?.runId, requestDigest: request?.requestDigest, profileId: request?.profile.id,
      profileVersion: request?.profile.version, profileDigest: request?.profileDigest,
    })
    await dependencies.receipts.record(receipt)
    throw new FailureBoundaryError(code, message, receipt)
  }

  const validateStaticProfile = async (request: ControlledPressureRequest) => {
    const { profile } = request
    if (!enabled) await reject('BOUNDARY_DISABLED', 'Controlled pressure is disabled', request)
    if (profile.schemaVersion !== 'agentic-501-failure-profile/v1' || profile.implementationStatus !== 'implemented' || !profile.enabled) {
      await reject('PROFILE_NOT_ENABLED', 'The failure profile is not implemented and enabled', request)
    }
    if (digestFailureProfile(profile) !== request.profileDigest || !shaPattern.test(request.profileDigest)) {
      await reject('PROFILE_IDENTITY_MISMATCH', 'The immutable failure profile identity does not match its content', request)
    }
    if (!shaPattern.test(request.requestDigest)) await reject('REQUEST_DIGEST_INVALID', 'The request digest is not an immutable sha256 digest', request)
    if (!profile.guards.oneFailureAtATime || !profile.guards.automaticRollback) {
      await reject('GUARDS_NOT_FAIL_CLOSED', 'Required concurrency and rollback guards are absent', request)
    }
    if (!profile.authorization.required || !profile.authorization.singleUse || !profile.authorization.separationOfDuties
      || !requiredBindings.every((binding) => profile.authorization.tokenBinding.includes(binding))) {
      await reject('AUTHORIZATION_POLICY_INVALID', 'The profile does not require complete single-use authorization binding', request)
    }
    if (!profile.evidence.retainRawDriverReceipt || !profile.evidence.redactSecrets) {
      await reject('EVIDENCE_POLICY_INVALID', 'Driver receipt retention and secret redaction are required', request)
    }
    if (profile.apply.driver !== profile.rollback.driver) await reject('ROLLBACK_DRIVER_MISMATCH', 'Apply and rollback must use the same injected driver', request)
  }

  const rollback = async (execution: Execution, reason: string): Promise<FailureReceipt> => {
    if (execution.removed) return execution.removed
    if (execution.removal) return execution.removal
    execution.removal = (async () => {
      if (execution.timer !== undefined) scheduler.cancel(execution.timer)
      execution.detachAbort?.()
      let rawReceipt: DriverReceipt
      try {
        rawReceipt = await dependencies.actuator.remove(execution.command)
      } catch (error) {
        const receipt = makeReceipt({
          eventType: 'failure.removed', outcome: 'rollback-unverified', reason: `${reason}: actuator removal failed`,
          executionId: execution.command.executionId, runId: execution.command.runId, requestDigest: execution.command.requestDigest,
          profileId: execution.command.profile.id, profileVersion: execution.command.profile.version,
          profileDigest: execution.command.profileDigest, target: execution.command.target,
        })
        await dependencies.receipts.record(receipt)
        throw new FailureBoundaryError('ROLLBACK_FAILED', error instanceof Error ? error.message : 'Rollback failed', receipt)
      }
      let verification: VerificationResult
      try {
        verification = await dependencies.verifier.verifyRemoved(execution.command, rawReceipt)
      } catch (error) {
        verification = {
          verified: false,
          evidenceDigest: digest({ verificationError: error instanceof Error ? error.message : 'unknown' }),
          detail: 'Independent removal verification failed',
        }
      }
      const receipt = makeReceipt({
        eventType: 'failure.removed', outcome: verification.verified ? (reason === 'completed' ? 'removed' : 'rolled-back') : 'rollback-unverified', reason,
        executionId: execution.command.executionId, runId: execution.command.runId, requestDigest: execution.command.requestDigest,
        profileId: execution.command.profile.id, profileVersion: execution.command.profile.version,
        profileDigest: execution.command.profileDigest, target: execution.command.target, verification,
        rawDriverReceiptDigest: digest(rawReceipt),
      })
      await dependencies.receipts.record(receipt)
      execution.removed = receipt
      if (activeExecutionId === execution.command.executionId) activeExecutionId = undefined
      if (!verification.verified) throw new FailureBoundaryError('ROLLBACK_UNVERIFIED', 'Independent verification could not prove removal', receipt)
      return receipt
    })()
    return execution.removal
  }

  const applyOnce = async (request: ControlledPressureRequest, signal?: AbortSignal): Promise<AppliedFailureReceipt> => {
    await validateStaticProfile(request)
    if (signal?.aborted) await reject('REQUEST_ABORTED', 'The request was aborted before admission', request)
    if (activeExecutionId) await reject('FAILURE_ALREADY_ACTIVE', 'Only one controlled failure may be active', request)

    const inspection = await dependencies.inspector.inspect(request.profile.target).catch(() =>
      reject('TARGET_INSPECTION_UNAVAILABLE', 'Independent target inspection is unavailable', request))
    if (!targetsEqual(inspection.target, request.profile.target)) await reject('TARGET_DRIFT', 'The inspected target does not exactly match the immutable profile target', request)
    if (!Number.isInteger(inspection.eligibleReplicas) || inspection.eligibleReplicas < 1) await reject('TARGET_EMPTY', 'The exact target has no eligible replicas', request)
    let allowlisted = false
    try {
      allowlisted = await dependencies.allowlist.containsExactTarget(request.profile.target)
    } catch {
      await reject('ALLOWLIST_UNAVAILABLE', 'The exact target allowlist is unavailable', request)
    }
    if (!allowlisted) await reject('TARGET_NOT_ALLOWLISTED', 'The exact target is not allowlisted', request)

    const { durationSeconds, affectedReplicas } = request.plan
    const affectedPercent = affectedReplicas / inspection.eligibleReplicas * 100
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1
      || durationSeconds > request.profile.guards.maximumDurationSeconds || durationSeconds > maximumDurationSeconds
      || !Number.isInteger(affectedReplicas) || affectedReplicas < 1
      || affectedReplicas > request.profile.guards.maximumAffectedReplicas || affectedReplicas > maximumAffectedReplicas
      || affectedPercent > request.profile.guards.maximumAffectedPercent || affectedPercent > maximumAffectedPercent) {
      await reject('GUARD_EXCEEDED', 'Duration or independently calculated blast radius exceeds a guard', request)
    }

    const expectedBinding: AuthorizationBinding = {
      runId: request.runId, profileId: request.profile.id, profileVersion: request.profile.version,
      targetClusterUid: request.profile.target.clusterUid, targetNamespace: request.profile.target.namespace,
      requestDigest: request.requestDigest,
    }
    const expiration = Date.parse(request.authorization.expiresAt)
    if (!bindingsEqual(request.authorization.binding, expectedBinding)
      || request.authorization.tokenId.trim().length === 0
      || request.authorization.approvedBy === request.requestedBy
      || !Number.isFinite(expiration) || expiration <= now().getTime()
      || expiration - now().getTime() > request.profile.authorization.expiresAfterSeconds * 1000) {
      await reject('AUTHORIZATION_INVALID', 'Authorization is expired, self-approved, or not bound to this exact request', request)
    }
    let consumed = false
    try {
      consumed = await dependencies.authorization.consumeOnce(request.authorization, expectedBinding)
    } catch {
      await reject('AUTHORIZATION_UNAVAILABLE', 'The single-use authorization store is unavailable', request)
    }
    if (!consumed) {
      await reject('AUTHORIZATION_REUSED', 'Authorization is invalid or has already been consumed', request)
    }

    const immutableProfile = structuredClone(request.profile)
    const command: DriverCommand = {
      executionId: createId(), runId: request.runId, requestDigest: request.requestDigest, profileDigest: request.profileDigest,
      profile: immutableProfile, target: structuredClone(request.profile.target), durationSeconds, affectedReplicas,
    }
    const execution: Execution = { command }
    executions.set(command.executionId, execution)
    activeExecutionId = command.executionId

    let rawReceipt: DriverReceipt
    try {
      rawReceipt = await dependencies.actuator.apply(command, signal)
    } catch (error) {
      await rollback(execution, signal?.aborted ? 'request-aborted' : 'apply-failed')
      throw new FailureBoundaryError('APPLY_FAILED', error instanceof Error ? error.message : 'Apply failed', execution.removed!)
    }

    let verification: VerificationResult
    try {
      verification = await dependencies.verifier.verifyApplied(command, rawReceipt)
    } catch {
      const rolledBack = await rollback(execution, 'apply-verification-unavailable')
      throw new FailureBoundaryError('APPLY_UNVERIFIED', 'Independent apply verification is unavailable', rolledBack)
    }
    if (!verification.verified || signal?.aborted) {
      const rolledBack = await rollback(execution, signal?.aborted ? 'request-aborted' : 'apply-verification-failed')
      throw new FailureBoundaryError('APPLY_UNVERIFIED', 'Independent verification could not prove bounded pressure', rolledBack)
    }

    const receipt = makeReceipt({
      eventType: 'failure.applied', outcome: 'applied', executionId: command.executionId, runId: request.runId,
      requestDigest: request.requestDigest, profileId: request.profile.id, profileVersion: request.profile.version,
      profileDigest: request.profileDigest, target: command.target, verification, rawDriverReceiptDigest: digest(rawReceipt),
    }) as AppliedFailureReceipt
    try {
      await dependencies.receipts.record(receipt)
    } catch (error) {
      const rolledBack = await rollback(execution, 'receipt-recording-failed')
      throw new FailureBoundaryError('RECEIPT_FAILED', error instanceof Error ? error.message : 'Receipt recording failed', rolledBack)
    }
    const fingerprint = digest(request)
    applyReceipts.set(request.requestDigest, { fingerprint, receipt })
    execution.timer = scheduler.schedule(() => { void rollback(execution, 'duration-expired').catch(() => undefined) }, durationSeconds * 1000)
    if (signal) {
      const onAbort = () => { void rollback(execution, 'request-aborted').catch(() => undefined) }
      signal.addEventListener('abort', onAbort, { once: true })
      execution.detachAbort = () => signal.removeEventListener('abort', onAbort)
    }
    return receipt
  }

  return {
    apply(request, signal) {
      const snapshot = structuredClone(request)
      const fingerprint = digest(snapshot)
      const completed = applyReceipts.get(snapshot.requestDigest)
      if (completed) {
        if (completed.fingerprint !== fingerprint) return reject('IDEMPOTENCY_CONFLICT', 'The request digest was reused for different input', snapshot)
        return Promise.resolve(completed.receipt)
      }
      const inFlight = applyInFlight.get(snapshot.requestDigest)
      if (inFlight) {
        if (inFlight.fingerprint !== fingerprint) return reject('IDEMPOTENCY_CONFLICT', 'The request digest is already in use for different input', snapshot)
        return inFlight.operation
      }
      const operation = applyOnce(snapshot, signal).finally(() => applyInFlight.delete(snapshot.requestDigest))
      applyInFlight.set(snapshot.requestDigest, { fingerprint, operation })
      return operation
    },
    remove(executionId, reason = 'completed') {
      const execution = executions.get(executionId)
      if (!execution) {
        const receipt = makeReceipt({ eventType: 'failure.rejected', outcome: 'rejected', executionId, reason: 'UNKNOWN_EXECUTION' })
        return dependencies.receipts.record(receipt).then(() => { throw new FailureBoundaryError('UNKNOWN_EXECUTION', 'Unknown failure execution', receipt) })
      }
      return rollback(execution, reason)
    },
    abort(executionId, condition) {
      const execution = executions.get(executionId)
      if (!execution) {
        const receipt = makeReceipt({ eventType: 'failure.rejected', outcome: 'rejected', executionId, reason: 'UNKNOWN_EXECUTION' })
        return dependencies.receipts.record(receipt).then(() => { throw new FailureBoundaryError('UNKNOWN_EXECUTION', 'Unknown failure execution', receipt) })
      }
      return rollback(execution, condition)
    },
  }
}
