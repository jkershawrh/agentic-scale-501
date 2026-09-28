#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const toolDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(toolDirectory, '..', '..')
const fixtureDirectory = path.join(repositoryRoot, 'content-501', 'fixtures')
const phases = ['baseline', 'sustained', 'pressure', 'recovery']
const requiredTopLevel = [
  'schemaVersion', 'source', 'collectedAt', 'phase', 'runId', 'profile',
  'workload', 'correlation', 'inference', 'policy', 'quality', 'resources', 'authority',
]

function fail(message) {
  throw new Error(message)
}

function requireFields(value, fields, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${location} must be an object`)
  for (const field of fields) {
    if (!(field in value)) fail(`${location}.${field} is required`)
  }
}

function validateEnvelope(envelope, expectedPhase) {
  requireFields(envelope, requiredTopLevel, expectedPhase)
  if (envelope.schemaVersion !== 'agentic-scale-proof/v1') fail(`${expectedPhase}.schemaVersion is not agentic-scale-proof/v1`)
  if (envelope.source !== 'rehearsal') fail(`${expectedPhase}.source must remain rehearsal in this lab`)
  if (envelope.phase !== expectedPhase) fail(`${expectedPhase}.phase is ${envelope.phase}`)
  if (!/^sha256:[a-fA-F0-9]{64}$/.test(envelope.profile.workloadImageDigest ?? '')) fail(`${expectedPhase}.profile.workloadImageDigest is not immutable`)

  requireFields(envelope.profile, ['id', 'version', 'workloadImageDigest', 'evaluationSetVersion', 'target', 'concurrency'], `${expectedPhase}.profile`)
  requireFields(envelope.workload, ['attemptedJourneys', 'completedJourneys', 'errorCount', 'timeoutCount', 'throughputPerMinute', 'latencyMs', 'queueLatencyMs'], `${expectedPhase}.workload`)
  requireFields(envelope.correlation, ['expectedJourneys', 'completeJourneys'], `${expectedPhase}.correlation`)
  requireFields(envelope.inference, ['model', 'endpoint', 'requestCount', 'latencyMs', 'inputTokens', 'outputTokens'], `${expectedPhase}.inference`)
  requireFields(envelope.policy, ['version', 'evaluatedJourneys', 'compliantJourneys', 'unauthorizedActions'], `${expectedPhase}.policy`)
  requireFields(envelope.quality, ['scorerVersion', 'evaluatedJourneys', 'score'], `${expectedPhase}.quality`)
  requireFields(envelope.resources, ['telemetrySource', 'cpuRequestedCores', 'cpuUtilizationPercent'], `${expectedPhase}.resources`)
  requireFields(envelope.authority, ['automatedPromotion', 'humanReviewRequired', 'reviewerDisposition'], `${expectedPhase}.authority`)

  if (envelope.correlation.completeJourneys > envelope.correlation.expectedJourneys) fail(`${expectedPhase}.correlation cannot exceed expected journeys`)
  if (envelope.quality.score < 0 || envelope.quality.score > 1) fail(`${expectedPhase}.quality.score must be between 0 and 1`)
  if (envelope.authority.automatedPromotion !== false) fail(`${expectedPhase} violates the automated-promotion boundary`)
  if (envelope.authority.humanReviewRequired !== true) fail(`${expectedPhase} must require human review`)
  if (envelope.authority.reviewerDisposition !== 'pending') fail(`${expectedPhase} fixture cannot claim a reviewer disposition`)
  if (!String(envelope.resources.telemetrySource).includes('rehearsal')) fail(`${expectedPhase} resource telemetry must be visibly rehearsal-sourced`)

  if (expectedPhase === 'pressure' || expectedPhase === 'recovery') {
    requireFields(envelope.pressure, ['condition', 'admitted', 'removed'], `${expectedPhase}.pressure`)
    if (envelope.pressure.admitted !== true) fail(`${expectedPhase} pressure condition was not admitted`)
  }
  if (expectedPhase === 'pressure' && envelope.pressure.removed !== false) fail('pressure.pressure.removed must remain false during pressure')
  if (expectedPhase === 'recovery') {
    requireFields(envelope.recovery, ['recovered', 'recoveryMs', 'postRecoveryQualityScore'], 'recovery.recovery')
    if (envelope.pressure.removed !== true) fail('recovery must show that pressure was removed')
  }
}

function comparisonIdentity(envelope) {
  return JSON.stringify({
    runId: envelope.runId,
    profileId: envelope.profile.id,
    profileVersion: envelope.profile.version,
    workloadImageDigest: envelope.profile.workloadImageDigest,
    evaluationSetVersion: envelope.profile.evaluationSetVersion,
    target: envelope.profile.target,
    model: envelope.inference.model,
    endpoint: envelope.inference.endpoint,
    policyVersion: envelope.policy.version,
    scorerVersion: envelope.quality.scorerVersion,
    telemetrySource: envelope.resources.telemetrySource,
  })
}

function line(envelope) {
  const correlation = `${envelope.correlation.completeJourneys}/${envelope.correlation.expectedJourneys}`
  return `${envelope.phase.padEnd(10)} source=${envelope.source.padEnd(9)} completed=${String(envelope.workload.completedJourneys).padStart(2)} p95=${String(envelope.workload.latencyMs.p95).padStart(5)}ms quality=${envelope.quality.score.toFixed(2)} correlation=${correlation}`
}

const schema = JSON.parse(await readFile(path.join(repositoryRoot, 'contracts', 'agentic-scale-proof.schema.json'), 'utf8'))
const thresholds = JSON.parse(await readFile(path.join(repositoryRoot, 'contracts', 'thresholds.draft.json'), 'utf8'))
if (schema.properties?.schemaVersion?.const !== 'agentic-scale-proof/v1') fail('Repository proof schema version is unexpected')
if (thresholds.status !== 'draft-not-approved') fail('This checker expects thresholds to remain explicitly unapproved')

const envelopes = new Map()
for (const phase of phases) {
  const envelope = JSON.parse(await readFile(path.join(fixtureDirectory, `${phase}.rehearsal.json`), 'utf8'))
  validateEnvelope(envelope, phase)
  envelopes.set(phase, envelope)
}

const identities = new Set([...envelopes.values()].map(comparisonIdentity))
if (identities.size !== 1) fail('Cross-phase comparison identity changed')

const phaseFlag = process.argv.indexOf('--phase')
const compareFlag = process.argv.indexOf('--compare')
if (phaseFlag >= 0) {
  const phase = process.argv[phaseFlag + 1]
  if (!envelopes.has(phase)) fail(`Unknown phase: ${phase ?? '(missing)'}`)
  console.log(line(envelopes.get(phase)))
} else if (compareFlag >= 0) {
  const requested = (process.argv[compareFlag + 1] ?? '').split(',').filter(Boolean)
  if (requested.length < 2 || requested.some((phase) => !envelopes.has(phase))) fail('Use --compare with two or more comma-separated phase names')
  for (const phase of requested) console.log(line(envelopes.get(phase)))
} else {
  for (const phase of phases) console.log(line(envelopes.get(phase)))
}

console.log('')
console.log('REHEARSAL ONLY — 4 contract-shaped envelopes validated; certification remains unavailable.')
console.log('Threshold status: draft-not-approved | Authority: human review pending | Automated promotion: false')
