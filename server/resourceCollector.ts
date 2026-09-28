import type { ResourceCollector } from '../src/proof/scaleRunner'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface IntelTelemetrySourceDeclaration {
  schemaVersion: 'agentic-501-intel-hardware-source/v1'
  sourceId: string
  implementationStatus: 'runtime-gated' | 'unimplemented' | 'implemented'
  approval: { status: 'pending' | 'approved' | 'revoked'; authority: string; scope: string; reviewedAt: string; expiresAt?: string }
  collector: { name: string; version: string; deploymentDigest: string; transport: 'otlp-grpc' | 'otlp-http' | 'prometheus-scrape' }
  targetBinding: { clusterUid: string; nodeUid: string; podUid: string; containerId: string; observedAt: string }
  identity: { vendor: 'GenuineIntel'; family: number; model: number; modelName: string; microcode: string; logicalCpuCount: number; sourceRecordDigest: string }
  measurements: string[]
  integrity: { authenticatedTransport: true; clockSynchronized: true; maxClockErrorMs: number; retentionDays: number; rawRecordsRetained: true }
  limitations: string[]
}

export interface ResourceTelemetryObservation {
  schemaVersion: 'agentic-501-resource-observation/v1'
  sourceId: string
  runId: string
  profileId: string
  target: string
  capturedAt: string
  targetBinding: { clusterUid: string; nodeUid: string; podUid: string; containerId: string }
  hardwareIdentity: string
  cpuRequestedCores: number
  cpuUsageCores: number
  cpuUtilizationPercent: number
  sourceRecordDigest: string
}

export interface ApprovedResourceCollectorOptions {
  endpoint: string
  serviceToken?: string
  declaration: IntelTelemetrySourceDeclaration
  fetch?: FetchLike
  now?: () => Date
  targetIsApproved: (input: { declaredScope: string; requestedTarget: string; observation: ResourceTelemetryObservation }) => boolean
}

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const digest = (value: unknown): value is string => text(value) && /^sha256:[0-9a-f]{64}$/.test(value)
const timestamp = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value))
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function validateDeclaration(declaration: IntelTelemetrySourceDeclaration, now: Date) {
  if (declaration.schemaVersion !== 'agentic-501-intel-hardware-source/v1'
    || declaration.implementationStatus !== 'implemented'
    || declaration.approval.status !== 'approved'
    || !text(declaration.approval.authority)
    || !text(declaration.approval.scope)
    || !timestamp(declaration.approval.reviewedAt)
    || (declaration.approval.expiresAt !== undefined && (!timestamp(declaration.approval.expiresAt) || Date.parse(declaration.approval.expiresAt) <= now.getTime()))
    || declaration.identity.vendor !== 'GenuineIntel'
    || !declaration.identity.modelName.includes('Intel')
    || !digest(declaration.identity.sourceRecordDigest)
    || !digest(declaration.collector.deploymentDigest)
    || declaration.integrity.authenticatedTransport !== true
    || declaration.integrity.clockSynchronized !== true
    || declaration.integrity.rawRecordsRetained !== true
    || !declaration.measurements.includes('cpu.request.cores')
    || !declaration.measurements.includes('cpu.usage.cores')) {
    throw new Error('Intel telemetry source is not implemented, approved, current, and complete')
  }
}

function parseObservation(value: unknown): ResourceTelemetryObservation {
  if (!object(value)
    || value.schemaVersion !== 'agentic-501-resource-observation/v1'
    || !text(value.sourceId) || !text(value.runId) || !text(value.profileId) || !text(value.target)
    || !timestamp(value.capturedAt) || !text(value.hardwareIdentity)
    || !finite(value.cpuRequestedCores) || !finite(value.cpuUsageCores)
    || !finite(value.cpuUtilizationPercent) || value.cpuUtilizationPercent > 100
    || !digest(value.sourceRecordDigest) || !object(value.targetBinding)
    || !text(value.targetBinding.clusterUid) || !text(value.targetBinding.nodeUid)
    || !text(value.targetBinding.podUid) || !text(value.targetBinding.containerId)) {
    throw new Error('Resource telemetry endpoint returned an invalid observation')
  }
  return value as unknown as ResourceTelemetryObservation
}

export function createApprovedIntelResourceCollector(options: ApprovedResourceCollectorOptions): ResourceCollector {
  const endpoint = options.endpoint
  if (!endpoint.startsWith('https://')) throw new Error('Approved resource telemetry requires HTTPS')
  validateDeclaration(options.declaration, (options.now ?? (() => new Date()))())
  const fetchImpl = options.fetch ?? fetch

  return async ({ runId, profile }, signal) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(options.serviceToken ? { authorization: `Bearer ${options.serviceToken}` } : {}) },
      body: JSON.stringify({ runId, profileId: profile.id, target: profile.target }),
      signal,
    })
    if (!response.ok) throw new Error(`Resource telemetry endpoint returned HTTP ${response.status}`)
    const observation = parseObservation(await response.json())
    const binding = options.declaration.targetBinding
    if (observation.sourceId !== options.declaration.sourceId
      || observation.runId !== runId
      || observation.profileId !== profile.id
      || observation.target !== profile.target
      || observation.sourceRecordDigest !== options.declaration.identity.sourceRecordDigest
      || observation.hardwareIdentity !== options.declaration.identity.modelName
      || observation.targetBinding.clusterUid !== binding.clusterUid
      || observation.targetBinding.nodeUid !== binding.nodeUid
      || observation.targetBinding.podUid !== binding.podUid
      || observation.targetBinding.containerId !== binding.containerId
      || !options.targetIsApproved({ declaredScope: options.declaration.approval.scope, requestedTarget: profile.target, observation })) {
      throw new Error('Resource observation does not match the approved Intel source and target binding')
    }
    return {
      telemetrySource: `${options.declaration.sourceId}@${options.declaration.collector.version}`,
      cpuRequestedCores: observation.cpuRequestedCores,
      cpuUtilizationPercent: observation.cpuUtilizationPercent,
      hardwareIdentity: observation.hardwareIdentity,
    }
  }
}
