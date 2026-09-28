import { describe, expect, it } from 'vitest'
import { runScaleProfile, type JourneyExecutor, type ScaleRunProfile } from './scaleRunner'

const digest = `sha256:${'b'.repeat(64)}`
const profile: ScaleRunProfile = {
  id: 'sustained-5', version: 'policy-v1', phase: 'sustained', source: 'live', workloadImageDigest: digest,
  evaluationSetVersion: 'eval-v1', target: 'test-target', concurrency: 3, journeys: 7,
}

describe('correlated scale runner', () => {
  it('bounds concurrency and emits one correlated proof envelope', async () => {
    let active = 0
    let maximum = 0
    const execute: JourneyExecutor = async ({ journeyId, sequence }) => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active -= 1
      return {
        journeyId, startedAtMs: sequence * 1000, completedAtMs: sequence * 1000 + 500, completed: true, queueLatencyMs: 25,
        error: false, timedOut: false, correlationComplete: true, qualityScore: 0.96, policyCompliant: true, unauthorizedActions: 0,
        inference: { model: 'model-a', endpoint: 'gateway', requests: 2, latencyMs: [100, 200], inputTokens: 100, outputTokens: 25 },
      }
    }
    const result = await runScaleProfile(profile, execute, async () => ({
      telemetrySource: 'approved', cpuRequestedCores: 8, cpuUtilizationPercent: 60, hardwareIdentity: 'Intel Xeon 6',
    }), new AbortController().signal, 'run-test')

    expect(maximum).toBeLessThanOrEqual(3)
    expect(result.workload).toMatchObject({ attemptedJourneys: 7, completedJourneys: 7, errorCount: 0 })
    expect(result.correlation).toEqual({ expectedJourneys: 7, completeJourneys: 7 })
    expect(result.inference).toMatchObject({ requestCount: 14, inputTokens: 700, outputTokens: 175 })
    expect(result.authority).toEqual({ automatedPromotion: false, humanReviewRequired: true, reviewerDisposition: 'pending' })
  })

  it('records incomplete correlation instead of hiding it', async () => {
    const execute: JourneyExecutor = async ({ journeyId, sequence }) => ({
      journeyId, startedAtMs: sequence, completedAtMs: sequence + 1, completed: true, error: false, timedOut: false, queueLatencyMs: 1,
      correlationComplete: sequence !== 2, qualityScore: 1, policyCompliant: true, unauthorizedActions: 0,
      inference: { model: 'model-a', endpoint: 'gateway', requests: 1, latencyMs: [1], inputTokens: 1, outputTokens: 1 },
    })
    const result = await runScaleProfile({ ...profile, journeys: 3 }, execute, async () => ({
      telemetrySource: 'approved', cpuRequestedCores: 8, cpuUtilizationPercent: 50,
    }), new AbortController().signal, 'run-correlation')
    expect(result.correlation).toEqual({ expectedJourneys: 3, completeJourneys: 2 })
  })

  it('rejects mutable image profiles before executing', async () => {
    let called = false
    await expect(runScaleProfile({ ...profile, workloadImageDigest: 'latest' }, async () => {
      called = true
      throw new Error('should not run')
    }, async () => ({ telemetrySource: 'none', cpuRequestedCores: 0, cpuUtilizationPercent: 0 }), new AbortController().signal)).rejects.toThrow(/immutable/)
    expect(called).toBe(false)
  })

  it('honors cancellation before scheduling work', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('Cancelled', 'AbortError'))
    await expect(runScaleProfile(profile, async () => { throw new Error('should not run') }, async () => ({
      telemetrySource: 'none', cpuRequestedCores: 0, cpuUtilizationPercent: 0,
    }), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
