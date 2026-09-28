import type { ProofSource, ScalePhase, ScaleProofEnvelope } from './contract'

export interface ScaleRunProfile {
  id: string
  version: string
  phase: ScalePhase
  source: ProofSource
  workloadImageDigest: string
  evaluationSetVersion: string
  target: string
  concurrency: number
  journeys: number
  pressure?: ScaleProofEnvelope['pressure']
  recovery?: ScaleProofEnvelope['recovery']
}

export interface JourneyObservation {
  journeyId: string
  startedAtMs: number
  completedAtMs: number
  completed: boolean
  error: boolean
  timedOut: boolean
  queueLatencyMs: number
  correlationComplete: boolean
  qualityScore: number
  policyCompliant: boolean
  unauthorizedActions: number
  inference: {
    model: string
    endpoint: string
    requests: number
    latencyMs: number[]
    inputTokens: number
    outputTokens: number
  }
}

export interface ResourceObservation {
  telemetrySource: string
  cpuRequestedCores: number
  cpuUtilizationPercent: number
  hardwareIdentity?: string
}

export type JourneyExecutor = (
  input: { runId: string; journeyId: string; sequence: number; profile: ScaleRunProfile },
  signal: AbortSignal,
) => Promise<JourneyObservation>

export type ResourceCollector = (
  input: { runId: string; profile: ScaleRunProfile },
  signal: AbortSignal,
) => Promise<ResourceObservation>

const percentile = (values: number[], quantile: number) => {
  if (values.length === 0) return 0
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)]
}

const ensureRunnable = (profile: ScaleRunProfile) => {
  if (!profile.workloadImageDigest.match(/^sha256:[a-fA-F0-9]{64}$/)) throw new Error('Scale profile requires an immutable workload image digest')
  if (!Number.isInteger(profile.concurrency) || profile.concurrency < 1) throw new Error('Scale profile concurrency must be a positive integer')
  if (!Number.isInteger(profile.journeys) || profile.journeys < 1) throw new Error('Scale profile journeys must be a positive integer')
  if (profile.phase === 'recovery' && !profile.recovery) throw new Error('Recovery profile requires recovery evidence')
}

export async function runScaleProfile(
  profile: ScaleRunProfile,
  execute: JourneyExecutor,
  collectResources: ResourceCollector,
  signal: AbortSignal,
  runId: string = crypto.randomUUID(),
): Promise<ScaleProofEnvelope> {
  ensureRunnable(profile)
  const observations: JourneyObservation[] = []
  let sequence = 0

  const worker = async () => {
    while (true) {
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
      const current = sequence++
      if (current >= profile.journeys) return
      const journeyId = `${runId}:journey:${current + 1}`
      observations.push(await execute({ runId, journeyId, sequence: current + 1, profile }, signal))
    }
  }

  await Promise.all(Array.from({ length: Math.min(profile.concurrency, profile.journeys) }, worker))
  const resources = await collectResources({ runId, profile }, signal)
  const startedAt = Math.min(...observations.map((item) => item.startedAtMs))
  const completedAt = Math.max(...observations.map((item) => item.completedAtMs))
  const elapsedMinutes = Math.max(completedAt - startedAt, 1) / 60_000
  const completed = observations.filter((item) => item.completed)
  const inferenceLatency = observations.flatMap((item) => item.inference.latencyMs)
  const quality = completed.length > 0 ? completed.reduce((sum, item) => sum + item.qualityScore, 0) / completed.length : 0
  const model = observations[0]?.inference.model ?? ''
  const endpoint = observations[0]?.inference.endpoint ?? ''

  return {
    schemaVersion: 'agentic-scale-proof/v1',
    source: profile.source,
    collectedAt: new Date(completedAt).toISOString(),
    phase: profile.phase,
    runId,
    profile: {
      id: profile.id,
      version: profile.version,
      workloadImageDigest: profile.workloadImageDigest,
      evaluationSetVersion: profile.evaluationSetVersion,
      target: profile.target,
      concurrency: profile.concurrency,
    },
    workload: {
      attemptedJourneys: observations.length,
      completedJourneys: completed.length,
      errorCount: observations.filter((item) => item.error).length,
      timeoutCount: observations.filter((item) => item.timedOut).length,
      throughputPerMinute: completed.length / elapsedMinutes,
      latencyMs: {
        p50: percentile(observations.map((item) => item.completedAtMs - item.startedAtMs), 0.5),
        p95: percentile(observations.map((item) => item.completedAtMs - item.startedAtMs), 0.95),
      },
      queueLatencyMs: {
        p50: percentile(observations.map((item) => item.queueLatencyMs), 0.5),
        p95: percentile(observations.map((item) => item.queueLatencyMs), 0.95),
      },
    },
    correlation: {
      expectedJourneys: observations.length,
      completeJourneys: observations.filter((item) => item.correlationComplete && item.journeyId.startsWith(`${runId}:journey:`)).length,
    },
    inference: {
      model,
      endpoint,
      requestCount: observations.reduce((sum, item) => sum + item.inference.requests, 0),
      latencyMs: { p50: percentile(inferenceLatency, 0.5), p95: percentile(inferenceLatency, 0.95) },
      inputTokens: observations.reduce((sum, item) => sum + item.inference.inputTokens, 0),
      outputTokens: observations.reduce((sum, item) => sum + item.inference.outputTokens, 0),
    },
    policy: {
      version: profile.version,
      evaluatedJourneys: observations.length,
      compliantJourneys: observations.filter((item) => item.policyCompliant).length,
      unauthorizedActions: observations.reduce((sum, item) => sum + item.unauthorizedActions, 0),
    },
    quality: { scorerVersion: profile.evaluationSetVersion, evaluatedJourneys: completed.length, score: quality },
    resources,
    pressure: profile.pressure,
    recovery: profile.recovery,
    authority: { automatedPromotion: false, humanReviewRequired: true, reviewerDisposition: 'pending' },
  }
}
