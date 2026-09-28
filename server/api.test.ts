import { describe, expect, it, vi } from 'vitest'
import type { JourneyExecutor, ResourceCollector } from '../src/proof/scaleRunner'
import { createScaleRunHandler } from './api'

const digest = `sha256:${'a'.repeat(64)}`
const profile = {
  id: 'sustained-5',
  version: 'policy-v1',
  phase: 'sustained',
  workloadImageDigest: digest,
  evaluationSetVersion: 'eval-v1',
  target: 'test-target',
  concurrency: 2,
  journeys: 3,
}

const executeJourney: JourneyExecutor = async ({ journeyId, sequence }) => ({
  journeyId,
  startedAtMs: sequence * 1_000,
  completedAtMs: sequence * 1_000 + 100,
  completed: true,
  error: false,
  timedOut: false,
  queueLatencyMs: 5,
  correlationComplete: true,
  qualityScore: 0.95,
  policyCompliant: true,
  unauthorizedActions: 0,
  inference: {
    model: 'test-model',
    endpoint: 'injected-test-boundary',
    requests: 1,
    latencyMs: [50],
    inputTokens: 10,
    outputTokens: 2,
  },
})

const collectResources: ResourceCollector = async () => ({
  telemetrySource: 'injected-test-collector',
  cpuRequestedCores: 4,
  cpuUtilizationPercent: 25,
})

const request = (body: unknown, init: Omit<RequestInit, 'body' | 'method'> = {}) => new Request('http://localhost/api/scale/run', {
  ...init,
  method: 'POST',
  headers: { 'content-type': 'application/json', ...init.headers },
  body: JSON.stringify(body),
})

const handler = (overrides: Partial<Parameters<typeof createScaleRunHandler>[0]> = {}) => createScaleRunHandler({
  source: 'rehearsal',
  executeJourney,
  collectResources,
  createRunId: () => 'run-api-test',
  ...overrides,
})

describe('POST /api/scale/run', () => {
  it('runs an admitted profile through injected boundaries and preserves human authority', async () => {
    const response = await handler()(request({ profile }))
    const proof = await response.json()

    expect(response.status).toBe(200)
    expect(proof).toMatchObject({
      schemaVersion: 'agentic-scale-proof/v1',
      source: 'rehearsal',
      phase: 'sustained',
      runId: 'run-api-test',
      resources: { telemetrySource: 'injected-test-collector' },
      authority: {
        automatedPromotion: false,
        humanReviewRequired: true,
        reviewerDisposition: 'pending',
      },
    })
  })

  it.each([
    ['caller-selected evidence source', { profile: { ...profile, source: 'live' } }],
    ['authority claim', { profile, authority: { reviewerDisposition: 'supported' } }],
    ['unknown profile field', { profile: { ...profile, model: 'invented-model' } }],
    ['mutable image', { profile: { ...profile, workloadImageDigest: 'latest' } }],
    ['fractional concurrency', { profile: { ...profile, concurrency: 1.5 } }],
    ['excess concurrency', { profile: { ...profile, concurrency: 9 } }],
    ['excess journeys', { profile: { ...profile, journeys: 101 } }],
  ])('rejects %s before execution', async (_label, body) => {
    const execute = vi.fn(executeJourney)
    const response = await handler({ executeJourney: execute, maxConcurrency: 8, maxJourneys: 100 })(request(body))
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error.code).toBe('invalid_profile')
    expect(execute).not.toHaveBeenCalled()
  })

  it('requires phase-specific pressure and recovery evidence', async () => {
    const response = await handler()(request({ profile: { ...profile, phase: 'recovery' } }))
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error.issues.map((issue: { path: string }) => issue.path)).toEqual(expect.arrayContaining([
      'profile.pressure',
      'profile.recovery',
    ]))
  })

  it('rejects non-JSON and malformed JSON requests', async () => {
    const nonJson = await handler()(new Request('http://localhost/api/scale/run', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }))
    const malformed = await handler()(new Request('http://localhost/api/scale/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }))

    expect(nonJson.status).toBe(415)
    expect(malformed.status).toBe(400)
  })

  it('only serves the declared method and path', async () => {
    const wrongMethod = await handler()(new Request('http://localhost/api/scale/run'))
    const wrongPath = await handler()(new Request('http://localhost/api/other', { method: 'POST' }))

    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')
    expect(wrongPath.status).toBe(404)
  })

  it('aborts injected work and returns a timeout response', async () => {
    let observedAbort = false
    const execute: JourneyExecutor = async (_input, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        observedAbort = true
        reject(signal.reason)
      }, { once: true })
    })

    const response = await handler({ executeJourney: execute, timeoutMs: 10 })(request({ profile }))
    const result = await response.json()

    expect(response.status).toBe(504)
    expect(result.error.code).toBe('run_timeout')
    expect(observedAbort).toBe(true)
  })

  it('propagates caller cancellation into injected work', async () => {
    const controller = new AbortController()
    let observedAbort = false
    let markStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const execute: JourneyExecutor = async (_input, signal) => new Promise((_resolve, reject) => {
      markStarted()
      signal.addEventListener('abort', () => {
        observedAbort = true
        reject(signal.reason)
      }, { once: true })
    })
    const pending = handler({ executeJourney: execute })(request({ profile }, { signal: controller.signal }))
    await started
    controller.abort(new DOMException('Client disconnected', 'AbortError'))

    const response = await pending
    expect(response.status).toBe(499)
    expect(observedAbort).toBe(true)
  })

  it('does not expose dependency failure details', async () => {
    const response = await handler({
      executeJourney: async () => { throw new Error('secret upstream hostname') },
    })(request({ profile }))
    const result = await response.json()

    expect(response.status).toBe(502)
    expect(result.error).toEqual({ code: 'run_failed', message: 'Scale run failed at an injected dependency.' })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('rejects malformed observations instead of turning them into proof', async () => {
    const response = await handler({
      collectResources: async () => ({
        telemetrySource: 'invented',
        cpuRequestedCores: 4,
        cpuUtilizationPercent: 101,
      }),
    })(request({ profile }))
    const result = await response.json()

    expect(response.status).toBe(502)
    expect(result.error.code).toBe('run_failed')
  })

  it('strips no fields from valid evidence because unknown collector fields fail closed', async () => {
    const response = await handler({
      collectResources: async () => ({
        telemetrySource: 'injected-test-collector',
        cpuRequestedCores: 4,
        cpuUtilizationPercent: 25,
        certification: 'supported',
      } as never),
    })(request({ profile }))

    expect(response.status).toBe(502)
  })

  it('requires an explicit acknowledgement before labeling evidence live', () => {
    expect(() => createScaleRunHandler({
      source: 'live',
      executeJourney,
      collectResources,
    })).toThrow(/live evidence acknowledgement/i)
  })

  it('labels proof live only when the server explicitly opts in', async () => {
    const response = await handler({ source: 'live', liveEvidenceAcknowledged: true })(request({ profile }))
    const proof = await response.json()

    expect(response.status).toBe(200)
    expect(proof.source).toBe('live')
  })
})
