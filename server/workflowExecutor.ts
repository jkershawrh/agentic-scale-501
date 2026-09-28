import type { JourneyExecutor, ScaleRunProfile } from '../src/proof/scaleRunner'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface WorkflowStep {
  status: string
  started_at?: string | null
  completed_at?: string | null
  model?: string | null
  inference?: { latency_ms?: number | null } | null
}

interface WorkflowResponse {
  steps: WorkflowStep[]
  total_latency_ms: number
  run_id: string
  journey_id?: string | null
  case_id?: string | null
  started_at?: string | null
  completed_at?: string | null
  proof?: {
    schema_version: string
    evidence: { status: string; items: unknown[] }
    policy: { policy_id: string; evaluation_status: string; result: string; authority: string }
    inference: {
      source_state: string
      telemetry_status: string
      model_name?: string | null
      endpoint_identity?: string | null
      latency_ms?: number | null
      input_tokens?: number | null
      output_tokens?: number | null
    }
    human_review: { required: boolean; status: string; reviewer_profile: string; automatic_action_executed: boolean }
  } | null
}

export interface WorkflowJourneyExecutorOptions {
  baseUrl: string
  workflowType?: 'auto' | 'lightweight' | 'standard' | 'comprehensive' | 'general'
  serviceToken?: string
  fetch?: FetchLike
  queryForCase: (input: { sequence: number; journeyId: string; profile: ScaleRunProfile }) => string
  evaluateQuality: (input: { response: WorkflowResponse; sequence: number; profile: ScaleRunProfile }) => Promise<number>
  measureQueueLatencyMs: (input: { response: WorkflowResponse; sequence: number; profile: ScaleRunProfile }) => Promise<number>
  policyResultIsCompliant: (result: string) => boolean
  maxAttempts?: number
  retryDelayMs?: number
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const timestamp = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value))

function parseWorkflowResponse(value: unknown): WorkflowResponse {
  if (!object(value) || !Array.isArray(value.steps) || !finite(value.total_latency_ms) || !text(value.run_id)) {
    throw new Error('Workflow endpoint returned an invalid response')
  }
  for (const step of value.steps) {
    if (!object(step) || !text(step.status)) throw new Error('Workflow endpoint returned an invalid step')
  }
  return value as unknown as WorkflowResponse
}

const requestHeaders = (token: string | undefined, runId: string, journeyId: string, idempotencyKey: string) => ({
  'content-type': 'application/json',
  'x-agentic-run-id': runId,
  'x-agentic-journey-id': journeyId,
  'idempotency-key': idempotencyKey,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

const retryable = (status: number) => status === 429 || status === 502 || status === 503 || status === 504

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason)
  const timer = setTimeout(resolve, milliseconds)
  signal.addEventListener('abort', () => {
    clearTimeout(timer)
    reject(signal.reason)
  }, { once: true })
})

export function createWorkflowJourneyExecutor(options: WorkflowJourneyExecutorOptions): JourneyExecutor {
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) throw new Error('Workflow baseUrl must use HTTP or HTTPS')
  const fetchImpl = options.fetch ?? fetch
  const maxAttempts = options.maxAttempts ?? 3
  const retryDelayMs = options.retryDelayMs ?? 100
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('maxAttempts must be between 1 and 3')
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 1_000) throw new Error('retryDelayMs must be between 0 and 1000')

  return async ({ runId, journeyId, sequence, profile }, signal) => {
    const caseId = `${profile.evaluationSetVersion}:${sequence}`
    const idempotencyKey = `${runId}:${journeyId}:${caseId}`
    const requestedAt = Date.now()
    let response: Response | undefined
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await fetchImpl(`${baseUrl}/api/v1/workflow`, {
        method: 'POST',
        headers: requestHeaders(options.serviceToken, runId, journeyId, idempotencyKey),
        body: JSON.stringify({
          query: options.queryForCase({ sequence, journeyId, profile }),
          workflow_type: options.workflowType ?? 'comprehensive',
          journey_id: journeyId,
          case_id: caseId,
        }),
        signal,
      })
      if (response.ok || !retryable(response.status) || attempt === maxAttempts) break
      await response.body?.cancel()
      await wait(retryDelayMs * (2 ** (attempt - 1)), signal)
    }
    const receivedAt = Date.now()
    if (!response) throw new Error('Workflow endpoint returned no response')
    if (!response.ok) throw new Error(`Workflow endpoint returned HTTP ${response.status}`)
    const workflow = parseWorkflowResponse(await response.json())
    const qualityScore = await options.evaluateQuality({ response: workflow, sequence, profile })
    const queueLatencyMs = await options.measureQueueLatencyMs({ response: workflow, sequence, profile })
    if (!finite(qualityScore) || qualityScore > 1) throw new Error('Quality evaluator returned an invalid score')
    if (!finite(queueLatencyMs)) throw new Error('Queue latency evaluator returned an invalid measurement')

    const proof = workflow.proof
    const inferenceLatency: number[] = []
    for (const step of workflow.steps) {
      const latency = step.inference?.latency_ms
      if (finite(latency)) inferenceLatency.push(latency)
    }
    const aggregateLatency = proof?.inference.latency_ms
    if (inferenceLatency.length === 0 && finite(aggregateLatency)) inferenceLatency.push(aggregateLatency)
    const workflowStarted = workflow.started_at
    const workflowCompleted = workflow.completed_at
    const startedAtMs = timestamp(workflowStarted) ? Date.parse(workflowStarted) : requestedAt
    const completedAtMs = timestamp(workflowCompleted) ? Date.parse(workflowCompleted) : receivedAt
    const stepsCorrelated = workflow.steps.length > 0 && workflow.steps.every((step) => timestamp(step.started_at) && timestamp(step.completed_at))
    const correlationComplete = workflow.journey_id === journeyId
      && workflow.case_id === caseId
      && timestamp(workflow.started_at)
      && timestamp(workflow.completed_at)
      && stepsCorrelated
      && proof?.schema_version === 'agentic-journey-proof/v1'
      && proof.evidence.status === 'complete'
      && proof.policy.evaluation_status === 'evaluated'
      && proof.inference.telemetry_status === 'complete'

    const policyCompliant = proof?.policy.evaluation_status === 'evaluated'
      && proof.policy.authority === 'recommend_only'
      && options.policyResultIsCompliant(proof.policy.result)
      && proof.human_review.required === true
      && proof.human_review.automatic_action_executed === false

    return {
      journeyId,
      startedAtMs,
      completedAtMs: Math.max(completedAtMs, startedAtMs),
      completed: workflow.steps.length > 0 && workflow.steps.every((step) => step.status === 'completed'),
      error: workflow.steps.some((step) => step.status === 'failed'),
      timedOut: false,
      queueLatencyMs,
      correlationComplete: Boolean(correlationComplete),
      qualityScore,
      policyCompliant,
      unauthorizedActions: proof?.human_review.automatic_action_executed ? 1 : 0,
      inference: {
        model: proof?.inference.model_name || workflow.steps.find((step) => text(step.model))?.model || 'unreported',
        endpoint: proof?.inference.endpoint_identity || `${baseUrl}/api/v1/workflow`,
        requests: inferenceLatency.length,
        latencyMs: inferenceLatency,
        inputTokens: finite(proof?.inference.input_tokens) ? (proof?.inference.input_tokens as number) : 0,
        outputTokens: finite(proof?.inference.output_tokens) ? (proof?.inference.output_tokens as number) : 0,
      },
    }
  }
}
