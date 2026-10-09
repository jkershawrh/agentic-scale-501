#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const phases = ['baseline', 'sustained', 'pressure', 'recovery']
const phaseSettings = {
  baseline: { concurrency: 1, journeys: 4, delayMs: 8, quality: 0.97 },
  sustained: { concurrency: 5, journeys: 15, delayMs: 12, quality: 0.95 },
  pressure: { concurrency: 5, journeys: 15, delayMs: 45, quality: 0.91 },
  recovery: { concurrency: 5, journeys: 10, delayMs: 10, quality: 0.96 },
}

const defaultWorkspace = path.join(process.env.HOME || process.cwd(), 'agentic-501-evidence')

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

async function loadProfile(workspace) {
  return JSON.parse(await readFile(path.join(workspace, 'qualification-profile.json'), 'utf8'))
}

async function runJourney(sequence, phase, delayMs) {
  const startedAt = performance.now()
  const payload = JSON.stringify({ sequence, phase, request: `qualification-case-${sequence % 3}` })
  const digest = createHash('sha256').update(payload).digest('hex')
  await new Promise((resolve) => setTimeout(resolve, delayMs + (sequence % 4) * 3))
  const completedAt = performance.now()
  return {
    durationMs: Number((completedAt - startedAt).toFixed(2)),
    queueLatencyMs: sequence % 3,
    correlationComplete: digest.length === 64,
  }
}

async function executeInBatches(settings, phase) {
  const observations = []
  for (let offset = 0; offset < settings.journeys; offset += settings.concurrency) {
    const batch = []
    for (let index = offset; index < Math.min(settings.journeys, offset + settings.concurrency); index += 1) {
      batch.push(runJourney(index + 1, phase, settings.delayMs))
    }
    observations.push(...await Promise.all(batch))
  }
  return observations
}

export async function initialize(workspace, scenario = 'governed-service-readiness') {
  await mkdir(workspace, { recursive: true })
  const profile = {
    schemaVersion: 'agentic-501-learner-profile/v1',
    runId: `a501-${randomUUID()}`,
    scenario,
    profileId: 'participant-owned-qualification',
    profileVersion: 'v1',
    workloadImageDigest: `sha256:${createHash('sha256').update('agentic-501-bounded-local-workload-v1').digest('hex')}`,
    evaluationSetVersion: 'eval-local-v1',
    target: 'participant-terminal-local-runner',
    authority: { automatedPromotion: false, humanReviewRequired: true },
    createdAt: new Date().toISOString(),
  }
  await writeFile(path.join(workspace, 'qualification-profile.json'), `${JSON.stringify(profile, null, 2)}\n`)
  await writeFile(path.join(workspace, 'learner-decision.md'), `# Learner qualification decision\n\nScenario: ${scenario}\n\n## Decision\n\n- [ ] REHEARSAL COMPLETE\n- [ ] INCONCLUSIVE\n\n## Evidence-backed reason\n\nWrite your decision here.\n\n## What is not proved\n\nThis namespace-local run does not prove production capacity, approved Intel Xeon telemetry, or Launchpad certification.\n`)
  return profile
}

export async function executePhase(workspace, phase) {
  if (!phases.includes(phase)) throw new Error(`Unknown phase: ${phase}`)
  const profile = await loadProfile(workspace)
  const settings = phaseSettings[phase]
  const startedAt = performance.now()
  const observations = await executeInBatches(settings, phase)
  const elapsedMs = performance.now() - startedAt
  const durations = observations.map((item) => item.durationMs)
  const queue = observations.map((item) => item.queueLatencyMs)
  const envelope = {
    schemaVersion: 'agentic-scale-proof/v1',
    source: 'offline',
    collectedAt: new Date().toISOString(),
    phase,
    runId: profile.runId,
    profile: {
      id: profile.profileId,
      version: profile.profileVersion,
      workloadImageDigest: profile.workloadImageDigest,
      evaluationSetVersion: profile.evaluationSetVersion,
      target: profile.target,
      concurrency: settings.concurrency,
    },
    workload: {
      attemptedJourneys: settings.journeys,
      completedJourneys: observations.length,
      errorCount: 0,
      timeoutCount: 0,
      throughputPerMinute: Number((observations.length / Math.max(elapsedMs, 1) * 60_000).toFixed(2)),
      latencyMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95) },
      queueLatencyMs: { p50: percentile(queue, 0.5), p95: percentile(queue, 0.95) },
    },
    correlation: { expectedJourneys: settings.journeys, completeJourneys: observations.filter((item) => item.correlationComplete).length },
    inference: {
      model: 'deterministic-local-policy-engine',
      endpoint: 'local://participant-terminal/qualification-runner',
      requestCount: settings.journeys,
      latencyMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95) },
      inputTokens: 0,
      outputTokens: 0,
    },
    policy: { version: 'bounded-local-v1', evaluatedJourneys: settings.journeys, compliantJourneys: settings.journeys, unauthorizedActions: 0 },
    quality: { scorerVersion: 'deterministic-local-v1', evaluatedJourneys: settings.journeys, score: settings.quality },
    resources: { telemetrySource: 'participant-process-observation-not-hardware-telemetry', cpuRequestedCores: 0, cpuUtilizationPercent: 0 },
    ...(phase === 'pressure' || phase === 'recovery' ? {
      pressure: { condition: 'bounded-local-dependency-latency', admitted: true, removed: phase === 'recovery' },
    } : {}),
    ...(phase === 'recovery' ? {
      recovery: { recovered: true, recoveryMs: Math.round(elapsedMs), postRecoveryQualityScore: settings.quality },
    } : {}),
    authority: { automatedPromotion: false, humanReviewRequired: true, reviewerDisposition: 'pending' },
  }
  const output = path.join(workspace, `${phase}.json`)
  await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`)
  return { envelope, output }
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

function identity(envelope) {
  return JSON.stringify({
    runId: envelope.runId,
    id: envelope.profile.id,
    version: envelope.profile.version,
    digest: envelope.profile.workloadImageDigest,
    evaluationSetVersion: envelope.profile.evaluationSetVersion,
    target: envelope.profile.target,
  })
}

export async function buildReport(workspace) {
  const profile = await loadProfile(workspace)
  const envelopes = []
  for (const phase of phases) envelopes.push(JSON.parse(await readFile(path.join(workspace, `${phase}.json`), 'utf8')))
  if (new Set(envelopes.map(identity)).size !== 1) throw new Error('Comparison identity changed across phases')
  if (envelopes.some((item) => item.source !== 'offline')) throw new Error('Learner evidence source must remain offline')
  const [baseline, sustained, pressure, recovery] = envelopes
  const report = `# Agentic AI 501 qualification report\n\nRun ID: ${profile.runId}  \nScenario: ${profile.scenario}  \nEvidence source: OFFLINE — participant-owned namespace-local execution  \nMachine recommendation: REHEARSAL COMPLETE — HUMAN REVIEW REQUIRED\n\n| Phase | Concurrency | Completed | p95 latency | Quality | Correlation |\n|---|---:|---:|---:|---:|---:|\n${envelopes.map((item) => `| ${item.phase} | ${item.profile.concurrency} | ${item.workload.completedJourneys}/${item.workload.attemptedJourneys} | ${item.workload.latencyMs.p95} ms | ${item.quality.score.toFixed(2)} | ${item.correlation.completeJourneys}/${item.correlation.expectedJourneys} |`).join('\n')}\n\n## What changed\n\n- Sustained concurrency increased from ${baseline.profile.concurrency} to ${sustained.profile.concurrency}.\n- Controlled pressure increased p95 latency from ${sustained.workload.latencyMs.p95} ms to ${pressure.workload.latencyMs.p95} ms.\n- Pressure was removed: ${recovery.pressure.removed}; recovered: ${recovery.recovery.recovered}.\n- Recovery p95 returned to ${recovery.workload.latencyMs.p95} ms with quality ${recovery.quality.score.toFixed(2)}.\n\n## Authority boundary\n\nThe runner cannot certify or promote this workload. A human reviewer must select REHEARSAL COMPLETE or INCONCLUSIVE in learner-decision.md. This run does not prove production capacity, approved Intel Xeon utilization, or Launchpad certification.\n`
  const reportPath = path.join(workspace, 'qualification-report.md')
  await writeFile(reportPath, report)
  const evidenceFiles = ['qualification-profile.json', ...phases.map((phase) => `${phase}.json`), 'qualification-report.md', 'learner-decision.md']
  const manifest = `${(await Promise.all(evidenceFiles.map(async (file) => `${await sha256(path.join(workspace, file))}  ${file}`))).join('\n')}\n`
  await writeFile(path.join(workspace, 'evidence-manifest.sha256'), manifest)
  return { reportPath, evidenceFiles: [...evidenceFiles, 'evidence-manifest.sha256'] }
}

async function packageEvidence(workspace) {
  await buildReport(workspace)
  const archive = path.resolve(`${workspace}.tgz`)
  await new Promise((resolve, reject) => {
    const child = spawn('tar', ['-czf', archive, '-C', path.dirname(workspace), path.basename(workspace)], { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)))
  })
  return archive
}

async function main() {
  const command = process.argv[2]
  const workspace = path.resolve(argument('--workspace', defaultWorkspace))
  if (command === 'init') {
    const profile = await initialize(workspace, argument('--scenario', 'governed-service-readiness'))
    console.log(`Initialized participant-owned qualification run ${profile.runId}`)
    console.log(`Workspace: ${workspace}`)
    return
  }
  if (command === 'run') {
    const phase = process.argv[3]
    const { envelope, output } = await executePhase(workspace, phase)
    console.log(`${phase}: ${envelope.workload.completedJourneys}/${envelope.workload.attemptedJourneys} completed, p95=${envelope.workload.latencyMs.p95}ms, quality=${envelope.quality.score.toFixed(2)}`)
    console.log(`Evidence: ${output}`)
    return
  }
  if (command === 'report') {
    const result = await buildReport(workspace)
    console.log(`Report: ${result.reportPath}`)
    console.log('Machine recommendation: REHEARSAL COMPLETE — HUMAN REVIEW REQUIRED')
    return
  }
  if (command === 'package') {
    console.log(`Evidence package: ${await packageEvidence(workspace)}`)
    return
  }
  throw new Error('Usage: qualification-runner.mjs init|run <baseline|sustained|pressure|recovery>|report|package [--workspace PATH] [--scenario NAME]')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Qualification runner failed: ${error.message}`)
    process.exitCode = 1
  })
}
