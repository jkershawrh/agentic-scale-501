import type { LiveDataAdapter } from '../types'
import { parseProofEnvelope, type ScalePhase, type ScaleProofEnvelope } from '../proof/contract'
import { registerAdapter } from './adapters'

type PresentationProof = Record<string, string | number>
const collectedAt = '2026-09-28T00:00:00.000Z'

const rehearsals: Record<ScalePhase, PresentationProof> = {
  baseline: { journeys: 10, p95_latency_ms: 12400, quality: 'REHEARSAL threshold', policy: '10 / 10 rehearsal', disposition: 'REHEARSAL only' },
  sustained: { journeys: 30, throughput: 12, queue_p95_ms: 840, proof_complete: 'REHEARSAL fixture', disposition: 'REHEARSAL only' },
  pressure: { condition: 'inference pressure rehearsal', errors: 2, policy: 'fail-closed target', disposition: 'REHEARSAL conditional' },
  recovery: { recovery_ms: 6200, quality: 'REHEARSAL baseline', proof_complete: 'REHEARSAL fixture', disposition: 'human review required' },
}

export function parseScaleProofResponse(input: unknown, expectedPhase: ScalePhase): ScaleProofEnvelope {
  const proof = parseProofEnvelope(input)
  if (proof.source !== 'live') throw new Error(`Scale endpoint returned ${proof.source} data instead of live evidence`)
  if (proof.phase !== expectedPhase) throw new Error(`Scale endpoint returned ${proof.phase} proof for ${expectedPhase}`)
  if (proof.authority.reviewerDisposition !== 'pending') throw new Error('Scale runner cannot issue a reviewer disposition')
  return proof
}

export function toPresentationProof(proof: ScaleProofEnvelope): PresentationProof {
  const complete = `${proof.correlation.completeJourneys} / ${proof.correlation.expectedJourneys}`
  const policy = `${proof.policy.compliantJourneys} / ${proof.policy.evaluatedJourneys} compliant`
  const disposition = 'human review pending'
  if (proof.phase === 'baseline') return {
    journeys: proof.workload.completedJourneys,
    p95_latency_ms: Math.round(proof.workload.latencyMs.p95),
    quality: `${(proof.quality.score * 100).toFixed(1)}%`,
    policy,
    disposition,
  }
  if (proof.phase === 'sustained') return {
    journeys: proof.workload.completedJourneys,
    throughput: Number(proof.workload.throughputPerMinute.toFixed(1)),
    queue_p95_ms: Math.round(proof.workload.queueLatencyMs.p95),
    proof_complete: complete,
    disposition,
  }
  if (proof.phase === 'pressure') return {
    condition: proof.pressure?.condition ?? 'missing',
    errors: proof.workload.errorCount,
    policy,
    disposition,
  }
  return {
    recovery_ms: Math.round(proof.recovery?.recoveryMs ?? 0),
    quality: `${((proof.recovery?.postRecoveryQualityScore ?? proof.quality.score) * 100).toFixed(1)}%`,
    proof_complete: complete,
    disposition,
  }
}

function createScaleProofAdapter(phase: ScalePhase): LiveDataAdapter<PresentationProof> {
  return {
    id: `scale-${phase}`,
    timeoutMs: 120_000,
    rehearsal: { collectedAt, data: rehearsals[phase] },
    async load(signal) {
      const response = await fetch(`/api/scale/run?profile=${phase}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: phase }), signal,
      })
      if (!response.ok) throw new Error(`Scale endpoint returned HTTP ${response.status}`)
      return toPresentationProof(parseScaleProofResponse(await response.json(), phase))
    },
  }
}

for (const phase of ['baseline', 'sustained', 'pressure', 'recovery'] as const) registerAdapter(createScaleProofAdapter(phase))
