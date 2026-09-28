import { readFileSync } from 'node:fs'
import { createDeterministicQualityEvaluator } from './quality'
import { createApprovedIntelResourceCollector, type IntelTelemetrySourceDeclaration } from './resourceCollector'
import { createWorkflowJourneyExecutor } from './workflowExecutor'
import type { LiveRuntimeConfig } from './config'

interface QueryCase { sequence: number; query: string }
interface QuerySet { version: string; cases: QueryCase[] }

const readJson = (path: string, label: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`${label} could not be loaded`)
  }
}

const querySet = (input: unknown): QuerySet => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Workflow query set is invalid')
  const candidate = input as Partial<QuerySet>
  if (typeof candidate.version !== 'string' || !Array.isArray(candidate.cases) || candidate.cases.length === 0
    || candidate.cases.some((item) => !Number.isInteger(item?.sequence) || item.sequence < 1 || typeof item.query !== 'string' || item.query.trim() === '')) {
    throw new Error('Workflow query set is invalid')
  }
  if (new Set(candidate.cases.map((item) => item.sequence)).size !== candidate.cases.length) {
    throw new Error('Workflow query set contains duplicate sequences')
  }
  return candidate as QuerySet
}

export function createLiveDependencies(config: LiveRuntimeConfig) {
  const queries = querySet(readJson(config.workflow.querySetPath, 'Workflow query set'))
  const evaluationSet = readJson(config.quality.evaluationSetPath, 'Quality evaluation set')
  const failureProfile = readJson(config.faultGate.profilePath, 'Fault-gate profile') as Record<string, unknown>
  if (failureProfile.schemaVersion !== 'agentic-501-failure-profile/v1'
    || failureProfile.enabled !== false
    || !failureProfile.guards || typeof failureProfile.guards !== 'object'
    || (failureProfile.guards as Record<string, unknown>).oneFailureAtATime !== true
    || (failureProfile.guards as Record<string, unknown>).automaticRollback !== true
    || !failureProfile.evidence || typeof failureProfile.evidence !== 'object'
    || (failureProfile.evidence as Record<string, unknown>).redactSecrets !== true) {
    throw new Error('Fault-gate profile is missing required disabled fail-closed guards')
  }
  const evaluateQuality = createDeterministicQualityEvaluator(evaluationSet)
  const declaration = readJson(config.intelTelemetry.sourceDeclarationPath, 'Intel telemetry source declaration') as IntelTelemetrySourceDeclaration
  const allowedResults = new Set(config.workflow.compliantPolicyResults)

  const executeJourney = createWorkflowJourneyExecutor({
    baseUrl: config.workflow.baseUrl,
    serviceToken: config.workflow.serviceToken,
    queryForCase: ({ sequence, profile }) => {
      if (profile.evaluationSetVersion !== queries.version) throw new Error('Workflow query-set version does not match the run profile')
      const item = queries.cases.find((candidate) => candidate.sequence === sequence)
      if (!item) throw new Error('Workflow query set is incomplete for the requested run')
      return item.query
    },
    evaluateQuality,
    measureQueueLatencyMs: async ({ response, sequence, profile }) => {
      const result = await fetch(config.queue.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.queue.serviceToken}` },
        body: JSON.stringify({ workflowRunId: response.run_id, sequence, profileId: profile.id }),
      })
      if (!result.ok) throw new Error('Queue measurement dependency failed')
      const body = await result.json() as { queueLatencyMs?: unknown }
      if (typeof body.queueLatencyMs !== 'number' || !Number.isFinite(body.queueLatencyMs) || body.queueLatencyMs < 0) {
        throw new Error('Queue measurement dependency returned invalid evidence')
      }
      return body.queueLatencyMs
    },
    policyResultIsCompliant: (result) => allowedResults.has(result),
  })

  const collectResources = createApprovedIntelResourceCollector({
    endpoint: config.intelTelemetry.endpoint,
    serviceToken: config.intelTelemetry.serviceToken,
    declaration,
    targetIsApproved: ({ declaredScope, requestedTarget, observation }) => declaredScope === config.intelTelemetry.approvedTarget
      && requestedTarget === config.intelTelemetry.approvedTarget
      && observation.target === config.intelTelemetry.approvedTarget,
  })

  return { executeJourney, collectResources }
}
