import type { ProofSource } from '../src/proof/contract'

export interface HttpRuntimeConfig {
  host: string
  port: number
  requestTimeoutMs: number
  shutdownTimeoutMs: number
  runTimeoutMs: number
  maxBodyBytes: number
  maxConcurrency: number
  maxJourneys: number
}

export interface RehearsalRuntimeConfig extends HttpRuntimeConfig {
  source: 'rehearsal'
}

export interface LiveRuntimeConfig extends HttpRuntimeConfig {
  source: 'live'
  workflow: {
    baseUrl: string
    serviceToken: string
    querySetPath: string
    compliantPolicyResults: string[]
  }
  quality: { evaluationSetPath: string }
  queue: { endpoint: string; serviceToken: string }
  intelTelemetry: {
    endpoint: string
    serviceToken: string
    sourceDeclarationPath: string
    approvedTarget: string
  }
  faultGate: { profilePath: string; injectionEnabled: false }
}

export type RuntimeConfig = RehearsalRuntimeConfig | LiveRuntimeConfig
export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export class RuntimeConfigError extends Error {
  constructor(readonly missingOrInvalid: string[]) {
    super(`Runtime configuration is incomplete or invalid: ${missingOrInvalid.join(', ')}`)
    this.name = 'RuntimeConfigError'
  }
}

const integer = (env: RuntimeEnvironment, name: string, fallback: number, minimum = 1, maximum = 2_147_483_647) => {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RuntimeConfigError([name])
  return value
}

const required = (env: RuntimeEnvironment, names: string[], issues: string[]) => {
  const values: Record<string, string> = {}
  for (const name of names) {
    const value = env[name]
    if (typeof value !== 'string' || value.trim().length === 0) issues.push(name)
    else values[name] = value
  }
  return values
}

const approved = (env: RuntimeEnvironment, name: string, issues: string[]) => {
  if (env[name] !== 'true') issues.push(name)
}

const disabled = (env: RuntimeEnvironment, name: string, issues: string[]) => {
  if (env[name] !== 'false') issues.push(name)
}

const httpsUrl = (value: string | undefined, name: string, issues: string[]) => {
  if (!value) return
  try {
    if (new URL(value).protocol !== 'https:') issues.push(name)
  } catch {
    issues.push(name)
  }
}

export function loadRuntimeConfig(env: RuntimeEnvironment = process.env): RuntimeConfig {
  const source = (env.EVIDENCE_SOURCE ?? 'rehearsal') as ProofSource
  const common: HttpRuntimeConfig = {
    host: env.HOST?.trim() || '0.0.0.0',
    port: integer(env, 'PORT', 8080, 0, 65_535),
    requestTimeoutMs: integer(env, 'HTTP_REQUEST_TIMEOUT_MS', 35_000),
    shutdownTimeoutMs: integer(env, 'SHUTDOWN_TIMEOUT_MS', 10_000),
    runTimeoutMs: integer(env, 'RUN_TIMEOUT_MS', 30_000),
    maxBodyBytes: integer(env, 'MAX_BODY_BYTES', 64 * 1024),
    maxConcurrency: integer(env, 'MAX_CONCURRENCY', 25),
    maxJourneys: integer(env, 'MAX_JOURNEYS', 500),
  }

  if (common.requestTimeoutMs <= common.runTimeoutMs) {
    throw new RuntimeConfigError(['HTTP_REQUEST_TIMEOUT_MS'])
  }

  if (source === 'rehearsal') {
    if (env.LIVE_EXECUTION_ENABLED === 'true') throw new RuntimeConfigError(['EVIDENCE_SOURCE', 'LIVE_EXECUTION_ENABLED'])
    if (env.FAULT_INJECTION_ENABLED === 'true') throw new RuntimeConfigError(['FAULT_INJECTION_ENABLED'])
    return { ...common, source }
  }

  if (source !== 'live') throw new RuntimeConfigError(['EVIDENCE_SOURCE'])

  const issues: string[] = []
  approved(env, 'LIVE_EXECUTION_ENABLED', issues)
  approved(env, 'LIVE_EXECUTION_APPROVED', issues)
  approved(env, 'WORKFLOW_GATE_APPROVED', issues)
  approved(env, 'QUALITY_GATE_APPROVED', issues)
  approved(env, 'QUEUE_GATE_APPROVED', issues)
  approved(env, 'INTEL_TELEMETRY_GATE_APPROVED', issues)
  approved(env, 'FAULT_GATE_CONFIGURED', issues)
  approved(env, 'FAULT_GATE_APPROVED', issues)
  disabled(env, 'FAULT_INJECTION_ENABLED', issues)

  const values = required(env, [
    'WORKFLOW_BASE_URL',
    'WORKFLOW_SERVICE_TOKEN',
    'WORKFLOW_QUERY_SET_PATH',
    'WORKFLOW_COMPLIANT_POLICY_RESULTS',
    'QUALITY_EVALUATION_SET_PATH',
    'QUEUE_MEASUREMENT_URL',
    'QUEUE_SERVICE_TOKEN',
    'INTEL_TELEMETRY_URL',
    'INTEL_TELEMETRY_SERVICE_TOKEN',
    'INTEL_TELEMETRY_SOURCE_PATH',
    'INTEL_APPROVED_TARGET',
    'FAULT_GATE_PROFILE_PATH',
  ], issues)
  httpsUrl(values.WORKFLOW_BASE_URL, 'WORKFLOW_BASE_URL', issues)
  httpsUrl(values.QUEUE_MEASUREMENT_URL, 'QUEUE_MEASUREMENT_URL', issues)
  httpsUrl(values.INTEL_TELEMETRY_URL, 'INTEL_TELEMETRY_URL', issues)

  const compliantPolicyResults = values.WORKFLOW_COMPLIANT_POLICY_RESULTS
    ?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
  if (compliantPolicyResults.length === 0) issues.push('WORKFLOW_COMPLIANT_POLICY_RESULTS')

  if (issues.length > 0) throw new RuntimeConfigError([...new Set(issues)])

  return {
    ...common,
    source,
    workflow: {
      baseUrl: values.WORKFLOW_BASE_URL,
      serviceToken: values.WORKFLOW_SERVICE_TOKEN,
      querySetPath: values.WORKFLOW_QUERY_SET_PATH,
      compliantPolicyResults,
    },
    quality: { evaluationSetPath: values.QUALITY_EVALUATION_SET_PATH },
    queue: { endpoint: values.QUEUE_MEASUREMENT_URL, serviceToken: values.QUEUE_SERVICE_TOKEN },
    intelTelemetry: {
      endpoint: values.INTEL_TELEMETRY_URL,
      serviceToken: values.INTEL_TELEMETRY_SERVICE_TOKEN,
      sourceDeclarationPath: values.INTEL_TELEMETRY_SOURCE_PATH,
      approvedTarget: values.INTEL_APPROVED_TARGET,
    },
    faultGate: { profilePath: values.FAULT_GATE_PROFILE_PATH, injectionEnabled: false },
  }
}
