export type ProofSource = 'live' | 'rehearsal' | 'offline'
export type ScalePhase = 'baseline' | 'sustained' | 'pressure' | 'recovery'

export interface ScaleProofEnvelope {
  schemaVersion: 'agentic-scale-proof/v1'
  source: ProofSource
  collectedAt: string
  phase: ScalePhase
  runId: string
  profile: {
    id: string
    version: string
    workloadImageDigest: string
    evaluationSetVersion: string
    target: string
    concurrency: number
  }
  workload: {
    attemptedJourneys: number
    completedJourneys: number
    errorCount: number
    timeoutCount: number
    throughputPerMinute: number
    latencyMs: { p50: number; p95: number }
    queueLatencyMs: { p50: number; p95: number }
  }
  correlation: {
    expectedJourneys: number
    completeJourneys: number
  }
  inference: {
    model: string
    endpoint: string
    requestCount: number
    latencyMs: { p50: number; p95: number }
    inputTokens: number
    outputTokens: number
  }
  policy: {
    version: string
    evaluatedJourneys: number
    compliantJourneys: number
    unauthorizedActions: number
  }
  quality: {
    scorerVersion: string
    evaluatedJourneys: number
    score: number
  }
  resources: {
    telemetrySource: string
    cpuRequestedCores: number
    cpuUtilizationPercent: number
    hardwareIdentity?: string
  }
  pressure?: {
    condition: string
    admitted: boolean
    removed: boolean
  }
  recovery?: {
    recovered: boolean
    recoveryMs: number
    postRecoveryQualityScore: number
  }
  authority: {
    automatedPromotion: boolean
    humanReviewRequired: boolean
    reviewerDisposition: 'pending' | 'supported' | 'conditional' | 'rejected'
  }
}

export interface ProofIssue {
  path: string
  message: string
}

const finiteNonNegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0

export function validateProofEnvelope(proof: ScaleProofEnvelope): ProofIssue[] {
  const issues: ProofIssue[] = []
  if (proof.schemaVersion !== 'agentic-scale-proof/v1') issues.push({ path: 'schemaVersion', message: 'must be agentic-scale-proof/v1' })
  if (!['live', 'rehearsal', 'offline'].includes(proof.source)) issues.push({ path: 'source', message: 'is invalid' })
  if (!['baseline', 'sustained', 'pressure', 'recovery'].includes(proof.phase)) issues.push({ path: 'phase', message: 'is invalid' })
  const requireText = (path: string, value: unknown) => {
    if (!nonEmpty(value)) issues.push({ path, message: 'is required' })
  }
  const requireNumber = (path: string, value: unknown) => {
    if (!finiteNonNegative(value)) issues.push({ path, message: 'must be a finite non-negative number' })
  }

  requireText('runId', proof.runId)
  requireText('collectedAt', proof.collectedAt)
  requireText('profile.id', proof.profile?.id)
  requireText('profile.version', proof.profile?.version)
  if (!proof.profile?.workloadImageDigest?.startsWith('sha256:')) {
    issues.push({ path: 'profile.workloadImageDigest', message: 'must be an immutable sha256 digest' })
  }
  requireText('profile.evaluationSetVersion', proof.profile?.evaluationSetVersion)
  requireText('profile.target', proof.profile?.target)
  requireNumber('profile.concurrency', proof.profile?.concurrency)

  for (const [key, value] of Object.entries(proof.workload ?? {})) {
    if (key !== 'latencyMs' && key !== 'queueLatencyMs') requireNumber(`workload.${key}`, value)
  }
  requireNumber('workload.latencyMs.p50', proof.workload?.latencyMs?.p50)
  requireNumber('workload.latencyMs.p95', proof.workload?.latencyMs?.p95)
  requireNumber('workload.queueLatencyMs.p50', proof.workload?.queueLatencyMs?.p50)
  requireNumber('workload.queueLatencyMs.p95', proof.workload?.queueLatencyMs?.p95)
  requireNumber('correlation.expectedJourneys', proof.correlation?.expectedJourneys)
  requireNumber('correlation.completeJourneys', proof.correlation?.completeJourneys)

  requireText('inference.model', proof.inference?.model)
  requireText('inference.endpoint', proof.inference?.endpoint)
  requireNumber('inference.requestCount', proof.inference?.requestCount)
  requireNumber('inference.latencyMs.p50', proof.inference?.latencyMs?.p50)
  requireNumber('inference.latencyMs.p95', proof.inference?.latencyMs?.p95)
  requireNumber('inference.inputTokens', proof.inference?.inputTokens)
  requireNumber('inference.outputTokens', proof.inference?.outputTokens)

  requireText('policy.version', proof.policy?.version)
  requireNumber('policy.evaluatedJourneys', proof.policy?.evaluatedJourneys)
  requireNumber('policy.compliantJourneys', proof.policy?.compliantJourneys)
  requireNumber('policy.unauthorizedActions', proof.policy?.unauthorizedActions)
  requireText('quality.scorerVersion', proof.quality?.scorerVersion)
  requireNumber('quality.evaluatedJourneys', proof.quality?.evaluatedJourneys)
  requireNumber('quality.score', proof.quality?.score)

  requireText('resources.telemetrySource', proof.resources?.telemetrySource)
  requireNumber('resources.cpuRequestedCores', proof.resources?.cpuRequestedCores)
  requireNumber('resources.cpuUtilizationPercent', proof.resources?.cpuUtilizationPercent)

  if ((proof.phase === 'pressure' || proof.phase === 'recovery') && !proof.pressure) {
    issues.push({ path: 'pressure', message: `is required for ${proof.phase}` })
  }
  if (proof.phase === 'recovery' && !proof.recovery) {
    issues.push({ path: 'recovery', message: 'is required for recovery' })
  }
  if (proof.authority?.automatedPromotion !== false) {
    issues.push({ path: 'authority.automatedPromotion', message: 'must be false' })
  }
  if (proof.authority?.humanReviewRequired !== true) {
    issues.push({ path: 'authority.humanReviewRequired', message: 'must be true' })
  }
  return issues
}

export function parseProofEnvelope(input: unknown): ScaleProofEnvelope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Scale proof response must be an object')
  const proof = input as ScaleProofEnvelope
  const issues = validateProofEnvelope(proof)
  if (issues.length > 0) throw new Error(`Invalid scale proof: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`)
  return proof
}
