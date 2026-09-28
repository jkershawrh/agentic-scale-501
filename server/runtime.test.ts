import { afterEach, describe, expect, it } from 'vitest'
import { loadRuntimeConfig } from './config'
import { createScaleService } from './runtime'

const services: Array<ReturnType<typeof createScaleService>> = []
afterEach(async () => Promise.all(services.splice(0).map((service) => service.stop())))

const digest = `sha256:${'a'.repeat(64)}`
const profile = {
  id: 'rehearsal-sustained',
  version: 'policy-v1',
  phase: 'sustained',
  workloadImageDigest: digest,
  evaluationSetVersion: 'eval-v1',
  target: 'local-rehearsal',
  concurrency: 2,
  journeys: 3,
}

describe('executable scale service', () => {
  it('serves health, readiness, and deterministic rehearsal proof', async () => {
    const service = createScaleService(loadRuntimeConfig({ PORT: '0' }))
    services.push(service)
    const { port } = await service.start()
    const baseUrl = `http://127.0.0.1:${port}`

    expect(await (await fetch(`${baseUrl}/healthz`)).json()).toEqual({ status: 'ok' })
    expect(await (await fetch(`${baseUrl}/readyz`)).json()).toEqual({ status: 'ready' })

    const response = await fetch(`${baseUrl}/api/scale/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile }),
    })
    const proof = await response.json()
    expect(response.status).toBe(200)
    expect(proof).toMatchObject({
      source: 'rehearsal',
      workload: { attemptedJourneys: 3, completedJourneys: 3 },
      correlation: { expectedJourneys: 3, completeJourneys: 3 },
      resources: { telemetrySource: 'deterministic-local-rehearsal' },
      authority: { automatedPromotion: false, humanReviewRequired: true, reviewerDisposition: 'pending' },
    })
  })

  it('enforces the configured body limit through the existing handler', async () => {
    const service = createScaleService(loadRuntimeConfig({ PORT: '0', MAX_BODY_BYTES: '32' }))
    services.push(service)
    const { port } = await service.start()
    const response = await fetch(`http://127.0.0.1:${port}/api/scale/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile }),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: { code: 'payload_too_large' } })
  })

  it('becomes unready before graceful shutdown completes', async () => {
    const service = createScaleService(loadRuntimeConfig({ PORT: '0' }))
    services.push(service)
    await service.start()
    expect(service.isReady()).toBe(true)
    await service.stop()
    expect(service.isReady()).toBe(false)
  })
})
