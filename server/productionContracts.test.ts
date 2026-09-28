import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const load = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Record<string, unknown>

describe('Agentic AI 501 production orchestration contracts', () => {
  it('pins role cards to bounded tools and recommend-only authority', () => {
    const registry = load('contracts/orchestration/agent-registry.v1.json')
    expect(registry.schemaVersion).toBe('agentic-501-agent-registry/v1')
    expect(registry.sourceRevision).toBe('43889bc9444f9ef07f5b1a88e7de534af9647264')
    expect(registry.defaultAuthority).toBe('recommend_only')

    const agents = registry.agents as Array<Record<string, unknown>>
    expect(agents.map((agent) => agent.id)).toEqual(['researcher', 'analyst', 'executor'])
    expect(agents.every((agent) => Array.isArray(agent.allowedTools))).toBe(true)
    expect(agents.every((agent) => agent.authority === 'recommend_only')).toBe(true)
  })

  it('defines fail-closed MCP tool, retry, timeout, and idempotency semantics', () => {
    const contract = load('contracts/orchestration/mcp-tool-contract.v1.json')
    expect(contract.schemaVersion).toBe('agentic-501-mcp-tool-contract/v1')
    expect(contract.defaultDecision).toBe('deny')
    expect(contract.requiredCorrelation).toEqual(['run_id', 'journey_id', 'agent_id', 'tool_call_id'])
    expect(contract.retry).toMatchObject({ maxAttempts: 3, backoff: 'bounded_exponential' })
    expect(contract.timeout).toMatchObject({ required: true, onExpiry: 'cancel_and_record' })
    expect(contract.idempotency).toMatchObject({ requiredForMutations: true, replayResult: 'same_outcome' })
  })

  it('keeps policy deterministic and final authority human-owned', () => {
    const policy = load('contracts/orchestration/policy.v1.json')
    expect(policy.schemaVersion).toBe('agentic-501-policy/v1')
    expect(policy.engine).toBe('deterministic')
    expect(policy.automatedPromotion).toBe(false)
    expect(policy.humanReviewRequired).toBe(true)
    expect(policy.onMissingEvidence).toBe('inconclusive')
    expect(policy.onPolicyError).toBe('deny')
  })
})
