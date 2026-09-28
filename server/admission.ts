import type { ProofIssue, ProofSource, ScalePhase } from '../src/proof/contract'
import type { ScaleRunProfile } from '../src/proof/scaleRunner'

type JsonObject = Record<string, unknown>

export interface AdmissionLimits {
  maxConcurrency: number
  maxJourneys: number
  source: ProofSource
}

export class ProfileAdmissionError extends Error {
  constructor(readonly issues: ProofIssue[]) {
    super('Scale profile admission failed')
    this.name = 'ProfileAdmissionError'
  }
}

const phases: ScalePhase[] = ['baseline', 'sustained', 'pressure', 'recovery']
const bodyKeys = new Set(['profile'])
const profileKeys = new Set([
  'id',
  'version',
  'phase',
  'workloadImageDigest',
  'evaluationSetVersion',
  'target',
  'concurrency',
  'journeys',
  'pressure',
  'recovery',
])
const pressureKeys = new Set(['condition', 'admitted', 'removed'])
const recoveryKeys = new Set(['recovered', 'recoveryMs', 'postRecoveryQualityScore'])

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

const reportUnknownKeys = (value: JsonObject, allowed: Set<string>, path: string, issues: ProofIssue[]) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push({ path: path ? `${path}.${key}` : key, message: 'is not allowed' })
  }
}

const requireText = (value: unknown, path: string, issues: ProofIssue[]) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) {
    issues.push({ path, message: 'must be a non-empty string of at most 256 characters' })
  }
}

const requirePositiveInteger = (value: unknown, path: string, maximum: number, issues: ProofIssue[]) => {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    issues.push({ path, message: `must be an integer between 1 and ${maximum}` })
  }
}

const validatePressure = (value: unknown, issues: ProofIssue[]) => {
  if (!isObject(value)) {
    issues.push({ path: 'profile.pressure', message: 'must be an object' })
    return
  }
  reportUnknownKeys(value, pressureKeys, 'profile.pressure', issues)
  requireText(value.condition, 'profile.pressure.condition', issues)
  if (typeof value.admitted !== 'boolean') issues.push({ path: 'profile.pressure.admitted', message: 'must be a boolean' })
  if (typeof value.removed !== 'boolean') issues.push({ path: 'profile.pressure.removed', message: 'must be a boolean' })
}

const validateRecovery = (value: unknown, issues: ProofIssue[]) => {
  if (!isObject(value)) {
    issues.push({ path: 'profile.recovery', message: 'must be an object' })
    return
  }
  reportUnknownKeys(value, recoveryKeys, 'profile.recovery', issues)
  if (typeof value.recovered !== 'boolean') issues.push({ path: 'profile.recovery.recovered', message: 'must be a boolean' })
  if (typeof value.recoveryMs !== 'number' || !Number.isFinite(value.recoveryMs) || value.recoveryMs < 0) {
    issues.push({ path: 'profile.recovery.recoveryMs', message: 'must be a finite non-negative number' })
  }
  if (typeof value.postRecoveryQualityScore !== 'number' || !Number.isFinite(value.postRecoveryQualityScore)
    || value.postRecoveryQualityScore < 0 || value.postRecoveryQualityScore > 1) {
    issues.push({ path: 'profile.recovery.postRecoveryQualityScore', message: 'must be a number between 0 and 1' })
  }
}

export function admitScaleRunRequest(input: unknown, limits: AdmissionLimits): ScaleRunProfile {
  const issues: ProofIssue[] = []
  if (!isObject(input)) throw new ProfileAdmissionError([{ path: '', message: 'request body must be an object' }])
  reportUnknownKeys(input, bodyKeys, '', issues)

  if (!isObject(input.profile)) {
    issues.push({ path: 'profile', message: 'must be an object' })
    throw new ProfileAdmissionError(issues)
  }

  const candidate = input.profile
  reportUnknownKeys(candidate, profileKeys, 'profile', issues)
  requireText(candidate.id, 'profile.id', issues)
  requireText(candidate.version, 'profile.version', issues)
  requireText(candidate.evaluationSetVersion, 'profile.evaluationSetVersion', issues)
  requireText(candidate.target, 'profile.target', issues)
  if (typeof candidate.workloadImageDigest !== 'string' || !/^sha256:[a-fA-F0-9]{64}$/.test(candidate.workloadImageDigest)) {
    issues.push({ path: 'profile.workloadImageDigest', message: 'must be an immutable sha256 digest' })
  }
  if (typeof candidate.phase !== 'string' || !phases.includes(candidate.phase as ScalePhase)) {
    issues.push({ path: 'profile.phase', message: 'must be baseline, sustained, pressure, or recovery' })
  }
  requirePositiveInteger(candidate.concurrency, 'profile.concurrency', limits.maxConcurrency, issues)
  requirePositiveInteger(candidate.journeys, 'profile.journeys', limits.maxJourneys, issues)

  const phase = candidate.phase as ScalePhase
  if (phase === 'pressure' || phase === 'recovery') {
    if (candidate.pressure === undefined) issues.push({ path: 'profile.pressure', message: `is required for ${phase}` })
    else validatePressure(candidate.pressure, issues)
  } else if (candidate.pressure !== undefined) {
    issues.push({ path: 'profile.pressure', message: `is not allowed for ${phase}` })
  }
  if (phase === 'recovery') {
    if (candidate.recovery === undefined) issues.push({ path: 'profile.recovery', message: 'is required for recovery' })
    else validateRecovery(candidate.recovery, issues)
  } else if (candidate.recovery !== undefined) {
    issues.push({ path: 'profile.recovery', message: `is not allowed for ${phase}` })
  }

  if (issues.length > 0) throw new ProfileAdmissionError(issues)

  return {
    id: candidate.id as string,
    version: candidate.version as string,
    phase,
    source: limits.source,
    workloadImageDigest: candidate.workloadImageDigest as string,
    evaluationSetVersion: candidate.evaluationSetVersion as string,
    target: candidate.target as string,
    concurrency: candidate.concurrency as number,
    journeys: candidate.journeys as number,
    pressure: candidate.pressure as ScaleRunProfile['pressure'],
    recovery: candidate.recovery as ScaleRunProfile['recovery'],
  }
}
