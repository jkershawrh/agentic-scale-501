import { describe, expect, it, vi } from 'vitest'
import type { ScaleRunProfile } from '../src/proof/scaleRunner'
import { createApprovedIntelResourceCollector, type IntelTelemetrySourceDeclaration, type ResourceTelemetryObservation } from './resourceCollector'

const sha = (character: string) => `sha256:${character.repeat(64)}`
const declaration: IntelTelemetrySourceDeclaration = {
  schemaVersion: 'agentic-501-intel-hardware-source/v1', sourceId: 'approved-intel-source', implementationStatus: 'implemented',
  approval: { status: 'approved', authority: 'telemetry review board', scope: 'flightpath/agentic-501', reviewedAt: '2026-09-28T12:00:00Z', expiresAt: '2027-09-28T12:00:00Z' },
  collector: { name: 'otel-resource-collector', version: '1.0.0', deploymentDigest: sha('a'), transport: 'otlp-grpc' },
  targetBinding: { clusterUid: 'cluster-1', nodeUid: 'node-1', podUid: 'pod-1', containerId: 'container-1', observedAt: '2026-09-28T12:00:00Z' },
  identity: { vendor: 'GenuineIntel', family: 6, model: 173, modelName: 'Intel Xeon 6', microcode: '0x1', logicalCpuCount: 96, sourceRecordDigest: sha('b') },
  measurements: ['cpu.request.cores', 'cpu.usage.cores', 'cpu.utilization.percent'],
  integrity: { authenticatedTransport: true, clockSynchronized: true, maxClockErrorMs: 100, retentionDays: 30, rawRecordsRetained: true },
  limitations: ['Shared-node utilization is scoped to the bound workload container.'],
}
const observation: ResourceTelemetryObservation = {
  schemaVersion: 'agentic-501-resource-observation/v1', sourceId: 'approved-intel-source', runId: 'run-1', profileId: 'baseline', target: 'flightpath/agentic-501', capturedAt: '2026-09-28T12:01:00Z',
  targetBinding: { clusterUid: 'cluster-1', nodeUid: 'node-1', podUid: 'pod-1', containerId: 'container-1' },
  hardwareIdentity: 'Intel Xeon 6', cpuRequestedCores: 8, cpuUsageCores: 4, cpuUtilizationPercent: 50, sourceRecordDigest: sha('b'),
}
const profile: ScaleRunProfile = { id: 'baseline', version: 'v1', phase: 'baseline', source: 'live', workloadImageDigest: sha('c'), evaluationSetVersion: 'eval-v1', target: 'flightpath/agentic-501', concurrency: 1, journeys: 1 }

describe('approved Intel resource collector', () => {
  it('returns resource proof only when source and target bindings match', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(observation), { status: 200 }))
    const collector = createApprovedIntelResourceCollector({ endpoint: 'https://telemetry.example/snapshot', serviceToken: 'server-token', declaration, fetch: fetchImpl, now: () => new Date('2026-09-29T00:00:00Z'), targetIsApproved: ({ requestedTarget }) => requestedTarget === 'flightpath/agentic-501' })
    await expect(collector({ runId: 'run-1', profile }, new AbortController().signal)).resolves.toEqual({ telemetrySource: 'approved-intel-source@1.0.0', cpuRequestedCores: 8, cpuUtilizationPercent: 50, hardwareIdentity: 'Intel Xeon 6' })
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.headers).toMatchObject({ authorization: 'Bearer server-token' })
  })
  it.each([
    ['pending', { ...declaration, implementationStatus: 'runtime-gated' as const, approval: { ...declaration.approval, status: 'pending' as const } }],
    ['revoked', { ...declaration, approval: { ...declaration.approval, status: 'revoked' as const } }],
    ['expired', { ...declaration, approval: { ...declaration.approval, expiresAt: '2026-09-28T12:00:01Z' } }],
  ])('rejects a %s source before collection', (_label, candidate) => {
    expect(() => createApprovedIntelResourceCollector({ endpoint: 'https://telemetry.example', declaration: candidate, now: () => new Date('2026-09-29T00:00:00Z'), targetIsApproved: () => true })).toThrow(/not implemented, approved, current/)
  })
  it('rejects a mismatched workload binding', async () => {
    const collector = createApprovedIntelResourceCollector({ endpoint: 'https://telemetry.example', declaration, fetch: async () => new Response(JSON.stringify({ ...observation, targetBinding: { ...observation.targetBinding, podUid: 'other-pod' } })), now: () => new Date('2026-09-29T00:00:00Z'), targetIsApproved: () => true })
    await expect(collector({ runId: 'run-1', profile }, new AbortController().signal)).rejects.toThrow(/does not match/)
  })
  it('requires authenticated transport at the configured boundary', () => {
    expect(() => createApprovedIntelResourceCollector({ endpoint: 'http://telemetry.example', declaration, targetIsApproved: () => true })).toThrow(/HTTPS/)
  })
})
