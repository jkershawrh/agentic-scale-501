import { describe, expect, it } from 'vitest'
import type { ScaleProofEnvelope } from './contract'
import { scoreScaleProof, type ApprovedScaleThresholds } from './scorer'

const thresholds: ApprovedScaleThresholds = {
  minimumCompletedJourneys: 25,
  maximumErrorRate: 0.02,
  maximumTimeoutRate: 0.01,
  minimumQualityScore: 0.9,
  minimumCorrelationRate: 1,
  maximumP95LatencyMs: 15_000,
  maximumRecoveryMs: 30_000,
  requireIntelHardwareIdentity: true,
}

const validProof = (overrides: Partial<ScaleProofEnvelope> = {}): ScaleProofEnvelope => ({
  schemaVersion: 'agentic-scale-proof/v1', source: 'live', collectedAt: '2026-09-28T12:00:00Z', phase: 'recovery', runId: 'run-501-001',
  profile: { id: 'sustained-25', version: 'v1', workloadImageDigest: `sha256:${'a'.repeat(64)}`, evaluationSetVersion: 'eval-v1', target: 'flightpath', concurrency: 5 },
  workload: { attemptedJourneys: 25, completedJourneys: 25, errorCount: 0, timeoutCount: 0, throughputPerMinute: 10, latencyMs: { p50: 5000, p95: 12000 }, queueLatencyMs: { p50: 100, p95: 300 } },
  correlation: { expectedJourneys: 25, completeJourneys: 25 },
  inference: { model: 'approved-model', endpoint: 'model-gateway', requestCount: 75, latencyMs: { p50: 700, p95: 1400 }, inputTokens: 25000, outputTokens: 5000 },
  policy: { version: 'policy-v1', evaluatedJourneys: 25, compliantJourneys: 25, unauthorizedActions: 0 },
  quality: { scorerVersion: 'quality-v1', evaluatedJourneys: 25, score: 0.95 },
  resources: { telemetrySource: 'approved-target-telemetry', cpuRequestedCores: 78, cpuUtilizationPercent: 72, hardwareIdentity: 'Intel Xeon 6' },
  pressure: { condition: 'bounded inference pressure', admitted: true, removed: true },
  recovery: { recovered: true, recoveryMs: 6200, postRecoveryQualityScore: 0.95 },
  authority: { automatedPromotion: false, humanReviewRequired: true, reviewerDisposition: 'supported' },
  ...overrides,
})

describe('fail-closed 501 scorer', () => {
  it('supports only complete live proof with human disposition', () => {
    expect(scoreScaleProof(validProof(), thresholds).outcome).toBe('supported')
  })

  it('keeps rehearsal evidence inconclusive', () => {
    expect(scoreScaleProof(validProof({ source: 'rehearsal' }), thresholds).outcome).toBe('inconclusive')
  })

  it('rejects policy violations even when availability is healthy', () => {
    const proof = validProof({ policy: { version: 'policy-v1', evaluatedJourneys: 25, compliantJourneys: 24, unauthorizedActions: 1 } })
    const result = scoreScaleProof(proof, thresholds)
    expect(result.outcome).toBe('rejected')
    expect(result.reasons.join(' ')).toMatch(/Unauthorized|policy/)
  })

  it('rejects quality loss under load', () => {
    const proof = validProof({ quality: { scorerVersion: 'quality-v1', evaluatedJourneys: 25, score: 0.7 } })
    expect(scoreScaleProof(proof, thresholds).outcome).toBe('rejected')
  })

  it('is inconclusive without approved Intel telemetry', () => {
    const proof = validProof({ resources: { telemetrySource: 'generic', cpuRequestedCores: 78, cpuUtilizationPercent: 72 } })
    const result = scoreScaleProof(proof, thresholds)
    expect(result.outcome).toBe('inconclusive')
    expect(result.issues[0].path).toBe('resources.hardwareIdentity')
  })

  it('is conditional when the sample is below the approved minimum', () => {
    const proof = validProof({
      workload: { attemptedJourneys: 10, completedJourneys: 10, errorCount: 0, timeoutCount: 0, throughputPerMinute: 10, latencyMs: { p50: 5000, p95: 12000 }, queueLatencyMs: { p50: 100, p95: 300 } },
      correlation: { expectedJourneys: 10, completeJourneys: 10 },
    })
    expect(scoreScaleProof(proof, thresholds).outcome).toBe('conditional')
  })

  it('rejects failed or unbounded recovery', () => {
    const proof = validProof({ recovery: { recovered: false, recoveryMs: 45_000, postRecoveryQualityScore: 0.95 } })
    expect(scoreScaleProof(proof, thresholds).outcome).toBe('rejected')
  })

  it('is inconclusive when immutable workload identity is absent', () => {
    const proof = validProof({ profile: { ...validProof().profile, workloadImageDigest: 'latest' } })
    expect(scoreScaleProof(proof, thresholds).outcome).toBe('inconclusive')
  })
})
