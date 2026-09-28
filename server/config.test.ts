import { describe, expect, it } from 'vitest'
import { loadRuntimeConfig, RuntimeConfigError } from './config'

const liveEnvironment = () => ({
  EVIDENCE_SOURCE: 'live',
  LIVE_EXECUTION_ENABLED: 'true',
  LIVE_EXECUTION_APPROVED: 'true',
  WORKFLOW_GATE_APPROVED: 'true',
  QUALITY_GATE_APPROVED: 'true',
  QUEUE_GATE_APPROVED: 'true',
  INTEL_TELEMETRY_GATE_APPROVED: 'true',
  FAULT_GATE_CONFIGURED: 'true',
  FAULT_GATE_APPROVED: 'true',
  FAULT_INJECTION_ENABLED: 'false',
  WORKFLOW_BASE_URL: 'https://workflow.example',
  WORKFLOW_SERVICE_TOKEN: 'workflow-secret',
  WORKFLOW_QUERY_SET_PATH: '/config/queries.json',
  WORKFLOW_COMPLIANT_POLICY_RESULTS: 'allow,reviewed',
  QUALITY_EVALUATION_SET_PATH: '/config/evaluation.json',
  QUEUE_MEASUREMENT_URL: 'https://queue.example/measure',
  QUEUE_SERVICE_TOKEN: 'queue-secret',
  INTEL_TELEMETRY_URL: 'https://telemetry.example/measure',
  INTEL_TELEMETRY_SERVICE_TOKEN: 'telemetry-secret',
  INTEL_TELEMETRY_SOURCE_PATH: '/config/intel-source.json',
  INTEL_APPROVED_TARGET: 'certification-target',
  FAULT_GATE_PROFILE_PATH: '/config/failure-profile.json',
})

describe('runtime configuration', () => {
  it('defaults to a safe rehearsal runtime', () => {
    expect(loadRuntimeConfig({})).toMatchObject({ source: 'rehearsal', host: '0.0.0.0', port: 8080 })
  })

  it('fails live startup closed when independent gates are absent', () => {
    expect(() => loadRuntimeConfig({ EVIDENCE_SOURCE: 'live' })).toThrow(RuntimeConfigError)
    try {
      loadRuntimeConfig({ EVIDENCE_SOURCE: 'live', WORKFLOW_SERVICE_TOKEN: 'do-not-print-me' })
    } catch (cause) {
      expect(String(cause)).not.toContain('do-not-print-me')
      expect(String(cause)).toContain('QUALITY_GATE_APPROVED')
    }
  })

  it('admits complete live configuration while requiring faults to remain disabled', () => {
    const config = loadRuntimeConfig(liveEnvironment())
    expect(config).toMatchObject({
      source: 'live',
      workflow: { baseUrl: 'https://workflow.example', compliantPolicyResults: ['allow', 'reviewed'] },
      intelTelemetry: { approvedTarget: 'certification-target' },
      faultGate: { profilePath: '/config/failure-profile.json', injectionEnabled: false },
    })

    expect(() => loadRuntimeConfig({ ...liveEnvironment(), FAULT_INJECTION_ENABLED: 'true' }))
      .toThrow(/FAULT_INJECTION_ENABLED/)
  })

  it('rejects live dependency endpoints without authenticated transport', () => {
    expect(() => loadRuntimeConfig({ ...liveEnvironment(), QUEUE_MEASUREMENT_URL: 'http://queue.example/measure' }))
      .toThrow(/QUEUE_MEASUREMENT_URL/)
  })
})
