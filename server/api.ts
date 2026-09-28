import { parseProofEnvelope, type ProofSource } from '../src/proof/contract'
import {
  runScaleProfile,
  type JourneyExecutor,
  type JourneyObservation,
  type ResourceCollector,
  type ResourceObservation,
} from '../src/proof/scaleRunner'
import { admitScaleRunRequest, ProfileAdmissionError } from './admission'

export interface ScaleRunApiDependencies {
  source: ProofSource
  executeJourney: JourneyExecutor
  collectResources: ResourceCollector
  /** Required to prevent an environment from accidentally presenting synthetic evidence as live. */
  liveEvidenceAcknowledged?: true
  timeoutMs?: number
  maxConcurrency?: number
  maxJourneys?: number
  maxBodyBytes?: number
  createRunId?: () => string
}

type ErrorCode = 'invalid_json' | 'invalid_profile' | 'run_timeout' | 'run_cancelled' | 'run_failed'

class RunTimeoutError extends Error {
  constructor() {
    super('Scale run timed out')
    this.name = 'RunTimeoutError'
  }
}

class RunCancelledError extends Error {
  constructor() {
    super('Scale run was cancelled')
    this.name = 'RunCancelledError'
  }
}

const json = (status: number, body: unknown, headers?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  },
})

const error = (status: number, code: ErrorCode, message: string, issues?: ProfileAdmissionError['issues']) => json(status, {
  error: { code, message, ...(issues ? { issues } : {}) },
})

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown, minimum = 0, maximum = Number.POSITIVE_INFINITY) => (
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
)
const integer = (value: unknown, minimum = 0) => Number.isInteger(value) && (value as number) >= minimum
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0

const exactKeys = (value: Record<string, unknown>, expected: string[]) => {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function validateJourneyObservation(value: unknown, journeyId: string): asserts value is JourneyObservation {
  if (!isObject(value) || !exactKeys(value, [
    'journeyId', 'startedAtMs', 'completedAtMs', 'completed', 'error', 'timedOut', 'queueLatencyMs',
    'correlationComplete', 'qualityScore', 'policyCompliant', 'unauthorizedActions', 'inference',
  ])) throw new Error('Injected journey executor returned an invalid observation')
  if (value.journeyId !== journeyId || !finite(value.startedAtMs) || !finite(value.completedAtMs)
    || (value.completedAtMs as number) < (value.startedAtMs as number) || !finite(value.queueLatencyMs)
    || !finite(value.qualityScore, 0, 1) || !integer(value.unauthorizedActions)
    || ['completed', 'error', 'timedOut', 'correlationComplete', 'policyCompliant'].some((key) => typeof value[key] !== 'boolean')) {
    throw new Error('Injected journey executor returned an invalid observation')
  }
  const inference = value.inference
  if (!isObject(inference) || !exactKeys(inference, ['model', 'endpoint', 'requests', 'latencyMs', 'inputTokens', 'outputTokens'])
    || !text(inference.model) || !text(inference.endpoint) || !integer(inference.requests)
    || !Array.isArray(inference.latencyMs) || !inference.latencyMs.every((item) => finite(item))
    || !integer(inference.inputTokens) || !integer(inference.outputTokens)) {
    throw new Error('Injected journey executor returned an invalid observation')
  }
}

function validateResourceObservation(value: unknown): asserts value is ResourceObservation {
  if (!isObject(value)) throw new Error('Injected resource collector returned an invalid observation')
  const allowed = ['telemetrySource', 'cpuRequestedCores', 'cpuUtilizationPercent', 'hardwareIdentity']
  if (!Object.keys(value).every((key) => allowed.includes(key)) || !text(value.telemetrySource)
    || !finite(value.cpuRequestedCores) || !finite(value.cpuUtilizationPercent, 0, 100)
    || (value.hardwareIdentity !== undefined && !text(value.hardwareIdentity))) {
    throw new Error('Injected resource collector returned an invalid observation')
  }
}

const raceWithAbort = async <T>(startWork: () => Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) throw signal.reason
  let rejectAbort: (reason: unknown) => void = () => undefined
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const onAbort = () => rejectAbort(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([startWork(), aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

const positiveIntegerConfig = (value: number, name: string) => {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
}

export function createScaleRunHandler(dependencies: ScaleRunApiDependencies) {
  const timeoutMs = dependencies.timeoutMs ?? 30_000
  const maxConcurrency = dependencies.maxConcurrency ?? 25
  const maxJourneys = dependencies.maxJourneys ?? 500
  const maxBodyBytes = dependencies.maxBodyBytes ?? 64 * 1024
  positiveIntegerConfig(timeoutMs, 'timeoutMs')
  positiveIntegerConfig(maxConcurrency, 'maxConcurrency')
  positiveIntegerConfig(maxJourneys, 'maxJourneys')
  positiveIntegerConfig(maxBodyBytes, 'maxBodyBytes')
  if (!['live', 'rehearsal', 'offline'].includes(dependencies.source)) throw new Error('source must be live, rehearsal, or offline')
  if (dependencies.source === 'live' && dependencies.liveEvidenceAcknowledged !== true) {
    throw new Error('Live evidence acknowledgement is required before labeling scale proof as live')
  }

  const executeJourney: JourneyExecutor = async (input, signal) => {
    const observation = await dependencies.executeJourney(input, signal)
    validateJourneyObservation(observation, input.journeyId)
    return observation
  }
  const collectResources: ResourceCollector = async (input, signal) => {
    const observation = await dependencies.collectResources(input, signal)
    validateResourceObservation(observation)
    return {
      telemetrySource: observation.telemetrySource,
      cpuRequestedCores: observation.cpuRequestedCores,
      cpuUtilizationPercent: observation.cpuUtilizationPercent,
      ...(observation.hardwareIdentity ? { hardwareIdentity: observation.hardwareIdentity } : {}),
    }
  }

  return async function handleScaleRun(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/api/scale/run') return json(404, { error: { code: 'not_found', message: 'Route not found.' } })
    if (request.method !== 'POST') return json(405, { error: { code: 'method_not_allowed', message: 'Use POST.' } }, { allow: 'POST' })
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return json(415, { error: { code: 'unsupported_media_type', message: 'Use application/json.' } })
    }

    const declaredLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
      return json(413, { error: { code: 'payload_too_large', message: 'Request body is too large.' } })
    }

    let body: unknown
    try {
      const raw = await request.text()
      if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) {
        return json(413, { error: { code: 'payload_too_large', message: 'Request body is too large.' } })
      }
      body = JSON.parse(raw)
    } catch {
      return error(400, 'invalid_json', 'Request body must contain valid JSON.')
    }

    let profile
    try {
      profile = admitScaleRunRequest(body, { source: dependencies.source, maxConcurrency, maxJourneys })
    } catch (cause) {
      if (cause instanceof ProfileAdmissionError) {
        return error(400, 'invalid_profile', 'Scale profile was not admitted.', cause.issues)
      }
      return error(400, 'invalid_profile', 'Scale profile was not admitted.')
    }

    const runId = dependencies.createRunId?.() ?? crypto.randomUUID()
    if (!text(runId)) return error(500, 'run_failed', 'Scale run could not be initialized.')
    const runController = new AbortController()
    const onClientAbort = () => runController.abort(new RunCancelledError())
    if (request.signal.aborted) onClientAbort()
    else request.signal.addEventListener('abort', onClientAbort, { once: true })
    const timer = setTimeout(() => runController.abort(new RunTimeoutError()), timeoutMs)

    try {
      const proof = await raceWithAbort(
        () => runScaleProfile(profile, executeJourney, collectResources, runController.signal, runId),
        runController.signal,
      )
      const parsed = parseProofEnvelope(proof)
      if (parsed.source !== dependencies.source
        || parsed.authority.automatedPromotion !== false
        || parsed.authority.humanReviewRequired !== true
        || parsed.authority.reviewerDisposition !== 'pending') {
        throw new Error('Scale runner crossed the evidence source or human authority boundary')
      }
      return json(200, parsed)
    } catch (cause) {
      if (cause instanceof RunTimeoutError || runController.signal.reason instanceof RunTimeoutError) {
        return error(504, 'run_timeout', 'Scale run exceeded the server time limit.')
      }
      if (cause instanceof RunCancelledError || runController.signal.reason instanceof RunCancelledError) {
        return error(499, 'run_cancelled', 'Scale run was cancelled by the caller.')
      }
      return error(502, 'run_failed', 'Scale run failed at an injected dependency.')
    } finally {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', onClientAbort)
    }
  }
}
