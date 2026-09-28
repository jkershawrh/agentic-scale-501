import { describe, expect, it } from 'vitest'
import type { ScaleProofEnvelope } from '../proof/contract'
import { parseScaleProofResponse, toPresentationProof } from './demoAdapter'

const proof = (phase: ScaleProofEnvelope['phase'] = 'sustained'): ScaleProofEnvelope => ({
  schemaVersion: 'agentic-scale-proof/v1', source: 'live', collectedAt: '2026-09-28T12:00:00Z', phase, runId: 'run-live-1',
  profile: { id: phase, version: 'v1', workloadImageDigest: `sha256:${'c'.repeat(64)}`, evaluationSetVersion: 'eval-v1', target: 'target', concurrency: 5 },
  workload: { attemptedJourneys: 25, completedJourneys: 25, errorCount: 0, timeoutCount: 0, throughputPerMinute: 11.24, latencyMs: { p50: 5000, p95: 12000 }, queueLatencyMs: { p50: 100, p95: 321 } },
  correlation: { expectedJourneys: 25, completeJourneys: 25 },
  inference: { model: 'model-a', endpoint: 'gateway', requestCount: 75, latencyMs: { p50: 700, p95: 1400 }, inputTokens: 25000, outputTokens: 5000 },
  policy: { version: 'policy-v1', evaluatedJourneys: 25, compliantJourneys: 25, unauthorizedActions: 0 },
  quality: { scorerVersion: 'quality-v1', evaluatedJourneys: 25, score: 0.95 },
  resources: { telemetrySource: 'approved', cpuRequestedCores: 78, cpuUtilizationPercent: 72, hardwareIdentity: 'Intel Xeon 6' },
  pressure: phase === 'pressure' || phase === 'recovery' ? { condition: 'bounded pressure', admitted: true, removed: phase === 'recovery' } : undefined,
  recovery: phase === 'recovery' ? { recovered: true, recoveryMs: 6200, postRecoveryQualityScore: 0.96 } : undefined,
  authority: { automatedPromotion: false, humanReviewRequired: true, reviewerDisposition: 'pending' },
})

describe('501 live presentation adapter contract', () => {
  it('accepts only a complete live envelope for the requested phase', () => {
    expect(parseScaleProofResponse(proof(), 'sustained').runId).toBe('run-live-1')
  })
  it('rejects rehearsal responses from the live endpoint', () => {
    expect(() => parseScaleProofResponse({ ...proof(), source: 'rehearsal' }, 'sustained')).toThrow(/instead of live/)
  })
  it('rejects a phase mismatch', () => {
    expect(() => parseScaleProofResponse(proof('baseline'), 'sustained')).toThrow(/baseline proof for sustained/)
  })
  it('rejects a runner that claims human disposition authority', () => {
    expect(() => parseScaleProofResponse({ ...proof(), authority: { automatedPromotion: false, humanReviewRequired: true, reviewerDisposition: 'supported' } }, 'sustained')).toThrow(/cannot issue/)
  })
  it('maps measured fields without changing their meaning', () => {
    expect(toPresentationProof(proof())).toEqual({ journeys: 25, throughput: 11.2, queue_p95_ms: 321, proof_complete: '25 / 25', disposition: 'human review pending' })
  })
})
