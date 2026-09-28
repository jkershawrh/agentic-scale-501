import { describe, expect, it, vi } from 'vitest'
import type { ScaleRunProfile } from '../src/proof/scaleRunner'
import { createWorkflowJourneyExecutor } from './workflowExecutor'

const profile: ScaleRunProfile = {
  id: 'baseline', version: 'policy-v1', phase: 'baseline', source: 'rehearsal', workloadImageDigest: `sha256:${'d'.repeat(64)}`,
  evaluationSetVersion: 'eval-v1', target: 'test', concurrency: 1, journeys: 1,
}

const sourceResponse = () => ({
  steps: [{ status: 'completed', started_at: '2026-09-28T12:00:00.000Z', completed_at: '2026-09-28T12:00:01.000Z', model: 'granite', inference: { latency_ms: 400 } }],
  total_latency_ms: 1000,
  run_id: 'source-run', journey_id: 'scale-run:journey:1', case_id: 'eval-v1:1',
  started_at: '2026-09-28T12:00:00.000Z', completed_at: '2026-09-28T12:00:01.000Z',
  proof: {
    schema_version: 'agentic-journey-proof/v1', evidence: { status: 'complete', items: [{ id: 'e1' }] },
    policy: { policy_id: 'policy-v1', evaluation_status: 'evaluated', result: 'allow', authority: 'recommend_only' },
    inference: { source_state: 'live', telemetry_status: 'complete', model_name: 'granite', endpoint_identity: 'maas', latency_ms: 400, input_tokens: 100, output_tokens: 20 },
    human_review: { required: true, status: 'pending', reviewer_profile: 'operator', automatic_action_executed: false },
  },
})

const executor = (fetchImpl: typeof fetch) => createWorkflowJourneyExecutor({
  baseUrl: 'https://workload.example', serviceToken: 'server-only-token', fetch: fetchImpl,
  queryForCase: ({ sequence }) => `case ${sequence}`,
  evaluateQuality: async () => 0.96,
  measureQueueLatencyMs: async () => 35,
  policyResultIsCompliant: (result) => result === 'allow',
})

describe('canonical workflow journey executor', () => {
  it('maps complete source proof without granting action authority', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(sourceResponse()), { status: 200, headers: { 'content-type': 'application/json' } }))
    const observation = await executor(fetchImpl)({ runId: 'scale-run', journeyId: 'scale-run:journey:1', sequence: 1, profile }, new AbortController().signal)
    expect(observation).toMatchObject({ completed: true, correlationComplete: true, qualityScore: 0.96, policyCompliant: true, unauthorizedActions: 0, queueLatencyMs: 35 })
    expect(observation.inference).toMatchObject({ model: 'granite', endpoint: 'maas', inputTokens: 100, outputTokens: 20 })
    const call = fetchImpl.mock.calls[0] as unknown as [string | URL | Request, RequestInit]
    const init = call[1]
    expect(init?.headers).toMatchObject({ authorization: 'Bearer server-only-token' })
    expect(JSON.parse(String(init?.body))).toEqual({ query: 'case 1', workflow_type: 'comprehensive', journey_id: 'scale-run:journey:1', case_id: 'eval-v1:1' })
  })

  it('marks the journey incomplete when source correlation or telemetry is incomplete', async () => {
    const response = sourceResponse()
    response.proof.inference.telemetry_status = 'partial'
    const observation = await executor(async () => new Response(JSON.stringify(response), { status: 200 }))(
      { runId: 'scale-run', journeyId: 'scale-run:journey:1', sequence: 1, profile }, new AbortController().signal,
    )
    expect(observation.correlationComplete).toBe(false)
  })

  it('requires separately measured quality and queue latency', async () => {
    const configured = createWorkflowJourneyExecutor({
      baseUrl: 'https://workload.example', fetch: async () => new Response(JSON.stringify(sourceResponse()), { status: 200 }),
      queryForCase: () => 'case', evaluateQuality: async () => Number.NaN, measureQueueLatencyMs: async () => 0,
      policyResultIsCompliant: () => true,
    })
    await expect(configured({ runId: 'scale-run', journeyId: 'scale-run:journey:1', sequence: 1, profile }, new AbortController().signal)).rejects.toThrow(/Quality evaluator/)
  })

  it('does not accept automatic action as compliant policy', async () => {
    const response = sourceResponse()
    response.proof.human_review.automatic_action_executed = true
    const observation = await executor(async () => new Response(JSON.stringify(response), { status: 200 }))(
      { runId: 'scale-run', journeyId: 'scale-run:journey:1', sequence: 1, profile }, new AbortController().signal,
    )
    expect(observation.policyCompliant).toBe(false)
    expect(observation.unauthorizedActions).toBe(1)
  })
})
