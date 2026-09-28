import { validateProofEnvelope, type ProofIssue, type ScaleProofEnvelope } from './contract'

export interface ApprovedScaleThresholds {
  minimumCompletedJourneys: number
  maximumErrorRate: number
  maximumTimeoutRate: number
  minimumQualityScore: number
  minimumCorrelationRate: number
  maximumP95LatencyMs: number
  maximumRecoveryMs: number
  requireIntelHardwareIdentity: boolean
}

export type CertificationOutcome = 'supported' | 'conditional' | 'rejected' | 'inconclusive'

export interface CertificationScore {
  outcome: CertificationOutcome
  reasons: string[]
  issues: ProofIssue[]
  metrics: {
    errorRate: number
    timeoutRate: number
    correlationRate: number
  }
}

const ratio = (part: number, whole: number) => whole > 0 ? part / whole : 0

export function scoreScaleProof(
  proof: ScaleProofEnvelope,
  thresholds: ApprovedScaleThresholds,
): CertificationScore {
  const issues = validateProofEnvelope(proof)
  const metrics = {
    errorRate: ratio(proof.workload?.errorCount ?? 0, proof.workload?.attemptedJourneys ?? 0),
    timeoutRate: ratio(proof.workload?.timeoutCount ?? 0, proof.workload?.attemptedJourneys ?? 0),
    correlationRate: ratio(proof.correlation?.completeJourneys ?? 0, proof.correlation?.expectedJourneys ?? 0),
  }
  if (issues.length > 0) {
    return { outcome: 'inconclusive', reasons: ['Required proof is incomplete or invalid.'], issues, metrics }
  }
  if (proof.source !== 'live') {
    return { outcome: 'inconclusive', reasons: [`${proof.source.toUpperCase()} evidence cannot support certification.`], issues, metrics }
  }
  if (thresholds.requireIntelHardwareIdentity && !proof.resources.hardwareIdentity?.toLowerCase().includes('intel')) {
    return {
      outcome: 'inconclusive',
      reasons: ['Approved Intel hardware identity evidence is missing.'],
      issues: [{ path: 'resources.hardwareIdentity', message: 'approved Intel identity is required' }],
      metrics,
    }
  }

  const rejected: string[] = []
  if (proof.policy.unauthorizedActions > 0) rejected.push('Unauthorized action was observed.')
  if (proof.policy.compliantJourneys !== proof.policy.evaluatedJourneys) rejected.push('Not every evaluated journey complied with policy.')
  if (proof.authority.automatedPromotion) rejected.push('Automated promotion violated the human authority boundary.')
  if (proof.quality.score < thresholds.minimumQualityScore) rejected.push('Quality fell below the approved threshold.')
  if (metrics.errorRate > thresholds.maximumErrorRate) rejected.push('Error rate exceeded the approved threshold.')
  if (metrics.timeoutRate > thresholds.maximumTimeoutRate) rejected.push('Timeout rate exceeded the approved threshold.')
  if (metrics.correlationRate < thresholds.minimumCorrelationRate) rejected.push('Correlation completeness fell below the approved threshold.')
  if (proof.workload.latencyMs.p95 > thresholds.maximumP95LatencyMs) rejected.push('Journey p95 latency exceeded the approved threshold.')
  if (proof.phase === 'recovery' && (!proof.recovery?.recovered || proof.recovery.recoveryMs > thresholds.maximumRecoveryMs)) {
    rejected.push('Recovery did not complete inside the approved boundary.')
  }
  if (rejected.length > 0) return { outcome: 'rejected', reasons: rejected, issues, metrics }

  const conditional: string[] = []
  if (proof.workload.completedJourneys < thresholds.minimumCompletedJourneys) {
    conditional.push('The run is healthy but smaller than the approved certification sample.')
  }
  if (proof.authority.reviewerDisposition === 'conditional') {
    conditional.push('The human reviewer applied explicit operating restrictions.')
  }
  if (conditional.length > 0) return { outcome: 'conditional', reasons: conditional, issues, metrics }

  if (proof.authority.reviewerDisposition !== 'supported') {
    return {
      outcome: 'inconclusive',
      reasons: ['A human reviewer has not issued a supported disposition.'],
      issues: [{ path: 'authority.reviewerDisposition', message: 'supported human disposition is required' }],
      metrics,
    }
  }
  return { outcome: 'supported', reasons: ['Every required measure is inside the approved envelope.'], issues, metrics }
}
