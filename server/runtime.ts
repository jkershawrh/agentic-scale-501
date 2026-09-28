import { createScaleRunHandler, type ScaleRunApiDependencies } from './api'
import { loadRuntimeConfig, type RuntimeConfig, type RuntimeEnvironment } from './config'
import { createScaleHttpService } from './httpServer'
import { createLiveDependencies } from './liveRuntime'
import { createRehearsalDependencies } from './rehearsalRuntime'

export type RuntimeDependencyOverrides = Pick<ScaleRunApiDependencies, 'executeJourney' | 'collectResources' | 'createRunId'>

export function createScaleService(
  config: RuntimeConfig,
  dependencyOverrides?: RuntimeDependencyOverrides,
) {
  const dependencies = dependencyOverrides ?? (config.source === 'live'
    ? createLiveDependencies(config)
    : createRehearsalDependencies())
  const handler = createScaleRunHandler({
    source: config.source,
    executeJourney: dependencies.executeJourney,
    collectResources: dependencies.collectResources,
    createRunId: dependencyOverrides?.createRunId,
    timeoutMs: config.runTimeoutMs,
    maxBodyBytes: config.maxBodyBytes,
    maxConcurrency: config.maxConcurrency,
    maxJourneys: config.maxJourneys,
    ...(config.source === 'live' ? { liveEvidenceAcknowledged: true as const } : {}),
  })
  return createScaleHttpService(config, handler)
}

export function createScaleServiceFromEnvironment(env: RuntimeEnvironment = process.env) {
  return createScaleService(loadRuntimeConfig(env))
}
