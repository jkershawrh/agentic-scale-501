import type { JourneyExecutor, ResourceCollector } from '../src/proof/scaleRunner'

const rehearsalEpochMs = Date.parse('2026-01-01T00:00:00.000Z')

export function createRehearsalDependencies(): {
  executeJourney: JourneyExecutor
  collectResources: ResourceCollector
} {
  const executeJourney: JourneyExecutor = async ({ journeyId, sequence, profile }, signal) => {
    if (signal.aborted) throw signal.reason
    const startedAtMs = rehearsalEpochMs + sequence * 1_000
    const durationMs = 80 + (sequence % 5) * 10
    return {
      journeyId,
      startedAtMs,
      completedAtMs: startedAtMs + durationMs,
      completed: true,
      error: false,
      timedOut: false,
      queueLatencyMs: 4 + (sequence % 3),
      correlationComplete: true,
      qualityScore: 0.94 + (sequence % 3) * 0.01,
      policyCompliant: true,
      unauthorizedActions: 0,
      inference: {
        model: 'deterministic-rehearsal-model',
        endpoint: 'local://agentic-scale-501/rehearsal',
        requests: 1,
        latencyMs: [40 + (sequence % 4) * 5],
        inputTokens: 32 + sequence,
        outputTokens: 8 + (sequence % 4),
      },
    }
  }

  const collectResources: ResourceCollector = async ({ profile }, signal) => {
    if (signal.aborted) throw signal.reason
    return {
      telemetrySource: 'deterministic-local-rehearsal',
      cpuRequestedCores: Math.max(1, Math.ceil(profile.concurrency / 4)),
      cpuUtilizationPercent: Math.min(90, 20 + profile.concurrency * 2),
      hardwareIdentity: 'rehearsal-only-unverified-hardware',
    }
  }

  return { executeJourney, collectResources }
}
