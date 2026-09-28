# Agentic AI 501 observability and controlled-failure contract

Status: **contract defined; runtime integration gated**  
Scope: contracts for evidence collection, correlation, approved Intel hardware telemetry, bounded failure experiments, and recovery evaluation.  
Non-claim: this package does not deploy a collector, approve a hardware source, inject a fault, enforce runtime approval, or certify a workload.

## Capability status

| Capability | Contract | Runtime status | Certification use now |
|---|---|---|---|
| End-to-end run and journey correlation | `contracts/telemetry/correlation-event.schema.json` | Runtime-gated; no complete collector path is connected | No |
| OpenTelemetry naming and propagation | `contracts/telemetry/semantic-conventions.v1.json` | Runtime-gated | No |
| Evidence provenance and content digests | Correlation event `provenance` object | Runtime-gated | No |
| Approved Intel identity/allocation/utilization source | `contracts/telemetry/intel-hardware-source.schema.json` | No approved live declaration is shipped | No |
| Guarded controlled-failure profile | `contracts/failure/failure-profile.schema.json` | Driver, target allowlist, and authorization enforcement unimplemented | No |
| Deterministic recovery assertion | `contracts/failure/recovery-assertion.schema.json` | Evaluator and live inputs runtime-gated | No |
| Fail-closed decision rules | `contracts/failure/fail-closed-rules.v1.json` | Contract only; enforcement runtime-gated | No |
| Human promotion authority | Existing proof-envelope authority boundary | Launchpad-owned; unchanged by this package | Human review only |

Examples are deliberately labeled `rehearsal`, `runtime-gated`, `pending`, `UNBOUND`, or `UNIMPLEMENTED`. They test the contracts and make no live deployment claim.

## Correlation model

One declared scale run has one `runId`. Each submitted workflow has one `journeyId` and one W3C `traceId`. The journey root span is the parent of agent, MCP tool, inference, policy, and scoring spans. Resource observations may be emitted by an infrastructure collector, but must carry the same run and journey identifiers through an explicit workload-to-pod binding; time-window joins are insufficient.

```text
runId
  journeyId == traceId scope
    journey root span
      agent step (stepId stable, attempt increments)
        MCP tool call
        inference request
      policy evaluation
      quality score
      workload/pod resource observation
      failure execution (pressure/recovery only)
      recovery assertion (recovery only)
```

Required join keys are `runId`, `journeyId`, W3C `traceId`, and `spanId`. A step also requires `stepId` and `attempt`; a failure event also requires a failure profile and execution identifier. Identifiers must be generated at the scale runner or authoritative boundary and propagated, never reconstructed from log text, timestamps, or ordering.

The minimum complete journey contains journey start/end, every declared agent step, every attempted MCP and inference call, one policy result, one quality result, and the target binding needed for resource evidence. A pressure/recovery journey also requires failure apply/remove receipts and a recovery result. Duplicate identifiers, broken parentage, mixed run IDs, absent required spans, or clock uncertainty beyond the admitted source limit make the journey incomplete.

## OpenTelemetry rules

- Use W3C Trace Context. One journey is one trace; retries remain in that trace.
- Put only `agentic501.run.id` and `agentic501.journey.id` in baggage. Do not put prompts, responses, credentials, personal data, or raw tool payloads in baggage.
- Prefer stable OpenTelemetry names such as `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `server.address`, and `error.type`. Repository-specific fields use `agentic501.*`.
- Span status describes operation success, not policy or certification success. Record policy and recovery as explicit attributes/events.
- Metrics must retain bounded dimensions. `runId`, `journeyId`, `traceId`, prompts, and user text belong in traces/evidence records, not metric labels.
- Secrets, authorization tokens, prompts, responses, and raw evidence payloads are not telemetry attributes. Store approved raw records separately and reference them by SHA-256 digest.
- Unknown `agentic501.*` fields are rejected until the semantic-convention contract is revised.

## Evidence provenance

Every admitted event records its evidence class, producing system and record ID, collector identity/version, payload SHA-256, clock source and uncertainty, capture mode, and implementation status. Derived evidence additionally records the deterministic transform and all input digests.

Evidence classes have intentionally different authority:

- `observed`: captured from an implemented runtime source. This is necessary but not sufficient for certification.
- `derived`: deterministically calculated from retained inputs. It inherits the weakest trust and implementation state of its inputs.
- `rehearsal`: presentation or workflow rehearsal evidence. It can exercise the UI but cannot support certification.
- `synthetic`: generated test data. It validates tooling only.

Raw source records must be retained for independent review, with access controls and retention appropriate to the certification environment. A digest without an accessible source record is incomplete provenance. Manual captures and copied dashboard values are not admissible scale proof.

## Approved Intel hardware telemetry source

An Intel hardware claim is available only when a source declaration validates and all of these conditions hold:

1. The named authority has approved the exact source, target scope, collector version, and deployment digest; approval is current and not revoked.
2. Runtime identity reports `GenuineIntel`, family/model/model name, microcode, and logical CPU count from a retained source record.
3. Kubernetes or equivalent immutable identifiers bind cluster, node, pod, and container to the measured journey. Labels or node names alone are not sufficient.
4. At minimum, CPU request and CPU usage are collected from documented sources with units and aggregation windows. Limits, utilization, throttling, and pressure are required when used in a claim.
5. Transport is authenticated, clocks are synchronized within the admitted error, and raw identity/resource records are retained.
6. Collection frequency and gaps are recorded. Missing samples are missing evidence, never zero usage.
7. Allocation and utilization are reported separately. A request, limit, host capacity, and observed usage must not be substituted for one another.
8. Virtualized CPU identity limitations, shared-host effects, counter resets, scrape gaps, and aggregation caveats are disclosed.

The included `pending-intel-source.json` is a negative-authority example: it is structurally valid but pending, unbound, and runtime-gated. It cannot substantiate Intel placement or performance.

## Guarded failure lifecycle

A controlled failure is admitted only after the baseline and sustained phases have complete evidence and before any mutation occurs:

1. Resolve the immutable profile version and digest.
2. Resolve the exact cluster UID, namespace, workload selector, and target UID set.
3. Verify the target set against an independently managed allowlist.
4. Acquire a short-lived, single-use authorization bound to the run, profile, target, and request digest, with separation of duties.
5. Confirm collector health, correlation completeness, rollback readiness, error budget, and that no other failure is active.
6. Emit an intent record, apply through an approved idempotent driver, and retain its receipt.
7. Continuously enforce duration, replica, percentage, target, error-budget, correlation, and authority guards.
8. Abort and roll back on any guard breach; removal is attempted even if evidence collection fails.
9. Verify the failure is absent using an independent read path, then begin the recovery window.
10. Evaluate all recovery checks. The result is `inconclusive` when evidence is absent and `failed` when an observed threshold or safety assertion is violated.

Profiles with `runtime-gated` or `unimplemented` status must set `enabled: false`. Schema validity is never execution authorization. Production targets are not in the allowed environment enum.

## Recovery assertions

Recovery is not equivalent to a healthy HTTP response. It requires proof that:

- the injected condition was removed and the service became ready before the declared deadline;
- complete correlation resumed without silently dropping failed journeys;
- post-recovery quality and policy compliance meet their declared thresholds on the fixed evaluation set;
- no unauthorized action occurred;
- no component certified or promoted automatically; and
- where claimed, resources returned to the declared operating envelope.

Every check references retained evidence digests. All required checks must pass for `outcome: passed`. A passed result must also be `observed` and `implemented`; a gated or rehearsal result is forced to `inconclusive`. Even a valid passed result is evidence for a human reviewer, never promotion authority.

## Fail-closed behavior

`contracts/failure/fail-closed-rules.v1.json` is the machine-readable rule inventory. The governing default is **inconclusive and no promotion**. In particular:

- missing/invalid evidence is not converted to a favorable value;
- a telemetry outage during pressure aborts the experiment and invalidates the run;
- mismatched targets or authorization prevent fault application;
- guard breaches trigger rollback;
- unproven removal is a failed recovery requiring operator action;
- absent policy enforcement or any unauthorized mutation rejects the run; and
- certification and promotion remain human-owned.

## Validation and integration gates

Run the contract checks from the repository root:

```bash
python3 contracts/telemetry/validate_contracts.py
```

Before changing any status to implemented, integration evidence must demonstrate propagation across the runner, orchestrator, all agents, MCP, inference, policy, scorer, infrastructure collector, and failure driver. The review must also approve an Intel source declaration, target allowlist, authorization issuer, rollback path, retention policy, and negative tests for every fail-closed rule. None of those gates is satisfied by this contract package alone.
