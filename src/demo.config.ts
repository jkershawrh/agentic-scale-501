import type { DemoConfig } from './types'

const technicalTopology = {
  boundary: { label: 'OpenShift participant namespace', detail: 'isolated workload and evidence boundary' },
  entry: { id: 'runner', kind: 'workload driver', label: 'Scale runner', detail: 'immutable profile + evaluation set' },
  primaryPath: [
    { id: 'route', kind: 'route', label: 'Workflow API', detail: 'bounded concurrent journeys', endpoint: 'POST /api/v1/workflow', edgeLabel: 'HTTPS' },
    { id: 'orchestrator', kind: 'service', label: 'Agent orchestrator', detail: 'routing, correlation, and proof envelope', endpoint: ':8000', edgeLabel: 'selects workflow' },
    { id: 'agents', kind: 'deployments', label: 'A2A agents', detail: 'research → analyst → executor', endpoint: 'JSON-RPC', edgeLabel: 'delegates' },
    { id: 'inference', kind: 'external service', label: 'Model endpoint', detail: 'model, endpoint, latency, and tokens', endpoint: 'OpenAI-compatible API', edgeLabel: 'generates' },
  ],
  supportPath: [
    { id: 'evidence', kind: 'MCP', label: 'Evidence tools', detail: 'bounded evidence with provenance', endpoint: 'tools/call', edgeLabel: 'retrieves' },
    { id: 'policy', kind: 'policy', label: 'Policy gate · target', detail: 'approval enforcement is not implemented yet', edgeLabel: 'must evaluate' },
    { id: 'collector', kind: 'telemetry', label: 'Correlated proof', detail: 'journey, inference, policy, resources, lifecycle', edgeLabel: 'joins' },
    { id: 'reviewer', kind: 'authority', label: 'Human reviewer', detail: 'certification and promotion authority', edgeLabel: 'recommends' },
  ],
  optionalPath: { id: 'launchpad', kind: 'external authority', label: 'Launchpad certification', detail: 'independent 1 / 5 / 25-seat proof', edgeLabel: 'later gate' },
}

export const demoConfig: DemoConfig = {
  id: 'agentic-scale-501',
  title: 'Agentic AI 501 — Production Multi-Agent Blueprint',
  subtitle: 'Governed orchestration, evidence, resilience, and human authority on Red Hat × Intel',
  event: 'Agentic AI 501',
  audience: 'Platform leaders and AI reliability engineers',
  cta: 'Prove the envelope before approving promotion.',
  brand: {
    primary: { name: 'Red Hat', logo: '/logos/redhat.svg', alt: 'Red Hat' },
    partner: { name: 'Intel', logo: '/logos/intel.png', alt: 'Intel' },
    attribution: 'Red Hat × Intel',
  },
  acts: [
    { id: 'decision', label: '00', title: 'The Decision', scenes: [
      { id: 'intro', type: 'intro', beat: 'ordinary-world', title: 'One green journey is not a production envelope', subtitle: 'The 401 runtime has internal scale evidence but remains draft and activation-gated. Level 501 asks what must be proven under useful load and controlled failure.', speakerPrompt: 'Separate available implementation evidence from an earned catalog level. State that 501 certification is not enabled.' },
      { id: 'reframe', type: 'reframe', beat: 'stakes', eyebrow: 'The production risk', title: 'Availability alone can hide a failed agentic system', before: 'Add replicas and watch uptime', after: 'Measure quality, policy, evidence, inference, and recovery together', detail: 'If the service stays up while evidence disappears, policy drifts, or answers degrade, scaling failed.', speakerPrompt: 'Make clear that replica count is an input—not the business result.' },
    ] },
    { id: 'architecture', label: '01', title: 'Guided Scale Architecture', scenes: [
      { id: 'guided-architecture', type: 'guided-architecture', beat: 'system-reveal', eyebrow: 'One correlated scale loop', title: 'Every scale claim must answer a harder question', body: 'Reveal the workload, measurement, pressure, recovery, and authority boundaries in order.', layers: [
        { id: 'profile', component: 'Versioned profile', tone: 'primary', question: 'What exactly are we scaling?', answer: 'One immutable workload, model configuration, evaluation set, and declared concurrency profile.', detail: 'Changing the workload while changing load destroys the comparison.', activeNodeIds: ['runner', 'route'] },
        { id: 'journey', component: 'Agentic workload', tone: 'primary', question: 'What must remain functionally correct?', answer: 'The same orchestrator, A2A agents, MCP evidence path, policy checks, and human boundary.', detail: 'Level 501 scales the proven blueprint; it does not invent a new application.', activeNodeIds: ['orchestrator', 'agents', 'evidence'] },
        { id: 'compute', component: 'Inference and compute', tone: 'partner', question: 'Where can pressure accumulate?', answer: 'At inference, queues, agent dependencies, evidence collection, and platform resources.', detail: 'Intel Xeon identity, allocation, and utilization remain blocked until approved target telemetry is connected.', activeNodeIds: ['inference', 'collector'] },
        { id: 'score', component: 'Fail-closed scorer · target', tone: 'success', question: 'How do we prevent a fast but unsafe result from passing?', answer: 'The 501 contract requires quality, evidence completeness, policy compliance, errors, and recovery to be scored together.', detail: 'The current scorer is partial and runtime approval enforcement is a blocking gap.', activeNodeIds: ['policy', 'collector'] },
        { id: 'authority', component: 'Human certification', tone: 'primary', question: 'Who may approve the operating envelope?', answer: 'A human reviewer through independent Launchpad certification.', detail: 'The LLM, scale runner, and presentation have no promotion authority.', activeNodeIds: ['reviewer', 'launchpad'] },
      ], technicalTopology, speakerPrompt: 'Ask each question before revealing the boundary. Do not imply that 501 execution is enabled while 401 remains a prerequisite.' },
    ] },
    { id: 'proof', label: '02', title: 'Measured Scale Journey', scenes: [
      { id: 'live', type: 'live-journey', beat: 'live-proof', eyebrow: 'Source-labeled scale proof', title: 'Hold the workload fixed and change one condition', body: 'The same evidence contract follows baseline, sustained load, controlled pressure, and recovery.', cta: 'Run the measured journey', workspace: { label: 'Open the scale workspace', href: '/' }, nodes: [
        { id: 'profile-node', label: 'Declare', detail: 'immutable profile', tone: 'primary' },
        { id: 'baseline-node', label: 'Baseline', detail: 'quality + correlation', tone: 'primary' },
        { id: 'sustain-node', label: 'Sustain', detail: 'throughput + queues', tone: 'partner' },
        { id: 'pressure-node', label: 'Pressure', detail: 'failure boundary', tone: 'partner' },
        { id: 'recover-node', label: 'Recover', detail: 'same proof contract', tone: 'success' },
        { id: 'decision-node', label: 'Review', detail: 'human disposition', tone: 'primary' },
      ], technicalTopology, steps: [
        { id: 'baseline', title: 'Establish the baseline', detail: 'Verify model identity, evidence correlation, policy result, quality, and journey latency before adding load.', adapterId: 'scale-baseline', activeNode: 1, activeNodeIds: ['runner', 'route', 'orchestrator', 'agents', 'inference', 'evidence', 'policy', 'collector'], resultFields: [{ key: 'journeys', label: 'Completed journeys' }, { key: 'p95_latency_ms', label: 'Journey p95', suffix: 'ms' }, { key: 'quality', label: 'Quality' }, { key: 'policy', label: 'Policy' }] },
        { id: 'sustained', title: 'Hold useful load', detail: 'Increase concurrent journeys and watch throughput, queueing, source-labeled compute evidence, and proof completeness.', adapterId: 'scale-sustained', activeNode: 2, activeNodeIds: ['runner', 'route', 'orchestrator', 'agents', 'inference', 'collector'], resultFields: [{ key: 'journeys', label: 'Completed journeys' }, { key: 'throughput', label: 'Throughput', suffix: '/min' }, { key: 'queue_p95_ms', label: 'Queue p95', suffix: 'ms' }, { key: 'proof_complete', label: 'Proof complete' }] },
        { id: 'pressure', title: 'Model the controlled boundary', detail: 'Review the proposed pressure condition and required denial, backpressure, retry, quality, and policy evidence. Live injection remains disabled.', adapterId: 'scale-pressure', activeNode: 3, activeNodeIds: ['runner', 'orchestrator', 'inference', 'policy', 'collector'], resultFields: [{ key: 'condition', label: 'Condition' }, { key: 'errors', label: 'Errors' }, { key: 'policy', label: 'Policy target' }, { key: 'disposition', label: 'Disposition' }] },
        { id: 'recovery', title: 'Recover, compare, and package', detail: 'Remove pressure and prove bounded recovery without evidence loss or unauthorized action.', adapterId: 'scale-recovery', activeNode: 5, activeNodeIds: ['orchestrator', 'agents', 'inference', 'evidence', 'policy', 'collector', 'reviewer', 'launchpad'], resultFields: [{ key: 'recovery_ms', label: 'Recovery', suffix: 'ms' }, { key: 'quality', label: 'Quality' }, { key: 'proof_complete', label: 'Proof complete' }, { key: 'disposition', label: 'Human disposition' }] },
      ], speakerPrompt: 'State REHEARSAL until a live 501 adapter is enabled. Never treat fixture values as a certification result.' },
      { id: 'tradeoff', type: 'tradeoff', beat: 'trials', eyebrow: 'The decision boundary', title: 'A scale result has three honest outcomes', options: [
        { title: 'Supported', strength: 'Every required measure remains inside the declared envelope.', tradeoff: 'Only for the tested workload, model, target, and profile.' },
        { title: 'Conditional', strength: 'The system remains useful with explicit restrictions.', tradeoff: 'Capacity, recovery, or telemetry blockers must remain visible.' },
        { title: 'Rejected', strength: 'The fail-closed path prevents an unsafe promotion.', tradeoff: 'The workload returns to engineering with evidence—not optimism.' },
      ], decision: 'Missing correlation, quality, policy, CPU, or recovery proof is inconclusive and cannot support promotion.', speakerPrompt: 'The goal is not to force green. The goal is to make the release decision defensible.' },
    ] },
    { id: 'mechanisms', label: '03', title: 'Why It Works', scenes: [
      { id: 'mechanisms', type: 'mechanisms', beat: 'trials', eyebrow: 'Production-scale mechanisms', title: 'Keep the proof comparable, attributable, and recoverable', mechanisms: [
        { id: 'immutable', label: 'Immutable comparison', claim: 'Hold workload and evaluation identity fixed.', detail: 'Every state is attributable to one source, image, model, target, and profile.', tone: 'primary' },
        { id: 'correlation', label: 'End-to-end correlation', claim: 'Join workload, agent, MCP, policy, inference, and lifecycle evidence.', detail: 'A fast response without complete provenance cannot pass.', tone: 'partner' },
        { id: 'fail-closed', label: 'Fail-closed scoring', claim: 'Absence of evidence is not evidence of success.', detail: 'Incomplete telemetry, policy attribution, quality, or recovery returns inconclusive.', tone: 'success' },
      ], speakerPrompt: 'Explain why these mechanisms make the scale result repeatable and reviewable.' },
    ] },
    { id: 'payoff', label: '04', title: 'Evidence & Handoff', scenes: [
      { id: 'payoff', type: 'evidence-payoff', beat: 'transformation', eyebrow: 'What this session established', title: 'Certify the envelope—not the ambition', adapterIds: ['scale-baseline', 'scale-sustained', 'scale-pressure', 'scale-recovery'], fallbackLine: 'Run the measured journey to populate this proof package', evidenceFields: [{ key: 'p95_latency_ms', label: 'Baseline p95', suffix: 'ms' }, { key: 'throughput', label: 'Sustained throughput', suffix: '/min' }, { key: 'recovery_ms', label: 'Recovery', suffix: 'ms' }, { key: 'disposition', label: 'Disposition' }], line1: 'One immutable workload moved through baseline, load, pressure, and recovery.', line2: 'The human reviewer still owns certification and promotion.', cta: 'Continue to the gated 501 lab →', speakerPrompt: 'If the run was rehearsal, say so. Close the presentation before handing off to the lab.' },
    ] },
  ],
  journeyHandoffs: [
    { depth: 'lab', title: 'Agentic AI 501 gated lab', duration: '90–120 minutes', question: 'Can the learner produce a complete, reviewable scale proof package?', technology: 'OpenShift · A2A · MCP · OpenTelemetry · Intel Xeon target telemetry · Launchpad certification', instruction: 'Use planning and evidence review now. Enable live execution only after Agentic 401 is certified and the target proof gates are approved.', href: '/' },
  ],
}
