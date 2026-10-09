import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildReport, executePhase, initialize } from '../content-501/tools/qualification-runner.mjs'

const workspace = await mkdtemp(path.join(os.tmpdir(), 'agentic-501-runner-'))
try {
  const profile = await initialize(workspace, 'claims-triage-readiness')
  assert.match(profile.runId, /^a501-/)
  for (const phase of ['baseline', 'sustained', 'pressure', 'recovery']) await executePhase(workspace, phase)
  const result = await buildReport(workspace)
  const report = await readFile(result.reportPath, 'utf8')
  const pressure = JSON.parse(await readFile(path.join(workspace, 'pressure.json'), 'utf8'))
  const recovery = JSON.parse(await readFile(path.join(workspace, 'recovery.json'), 'utf8'))
  assert.match(report, /participant-owned namespace-local execution/)
  assert.match(report, /HUMAN REVIEW REQUIRED/)
  assert.equal(pressure.pressure.removed, false)
  assert.equal(recovery.pressure.removed, true)
  assert.equal(recovery.runId, profile.runId)
  assert.equal(result.evidenceFiles.length, 8)
  console.log('qualification runner: PASS')
} finally {
  await rm(workspace, { recursive: true, force: true })
}
