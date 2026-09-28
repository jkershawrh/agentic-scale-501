# Agentic AI 501 scale API boundary

`createScaleRunHandler` implements the web-standard request boundary for `POST /api/scale/run`.
`main.ts` attaches it to a Node 22 native HTTP listener with `/healthz`, `/readyz`, bounded request
handling, caller-disconnect cancellation, and graceful SIGTERM/SIGINT draining.

The executable defaults to `EVIDENCE_SOURCE=rehearsal`. In that mode it injects deterministic local
journey and resource observations and performs no network I/O. Build and run it with:

```bash
npm run build:server
npm run start:server
```

Live mode is fail-closed. It requires `LIVE_EXECUTION_ENABLED=true` and
`LIVE_EXECUTION_APPROVED=true`, explicit approvals and configuration for the workflow, deterministic
quality set, independent queue measurement, and approved Intel telemetry, plus
`FAULT_GATE_CONFIGURED=true`, `FAULT_GATE_APPROVED=true`, and
`FAULT_INJECTION_ENABLED=false`. Missing configuration prevents listener startup. Tokens are used
only in server-side dependency requests and are never included in API errors or lifecycle logs.

The JSON request has one top-level field:

```json
{
  "profile": {
    "id": "sustained-5",
    "version": "policy-v1",
    "phase": "sustained",
    "workloadImageDigest": "sha256:<64 hex characters>",
    "evaluationSetVersion": "eval-v1",
    "target": "declared-target",
    "concurrency": 5,
    "journeys": 25
  }
}
```

The server configuration—not the caller—owns the proof source. Rehearsal and offline handlers are
available directly. A live handler additionally requires `liveEvidenceAcknowledged: true`; that flag
only controls honest labeling and does not connect any live system.

The boundary rejects unknown request fields, mutable image references, phase-invalid evidence,
profiles outside configured concurrency/journey limits, and malformed injected observations. Every
successful envelope retains the contract's fixed human authority boundary:

```json
{
  "automatedPromotion": false,
  "humanReviewRequired": true,
  "reviewerDisposition": "pending"
}
```

Run the isolated server checks from the repository root:

```bash
./node_modules/.bin/vitest run --config server/vitest.config.ts
./node_modules/.bin/tsc -p server/tsconfig.json
```

`createWorkflowJourneyExecutor` maps the canonical multi-agent
`POST /api/v1/workflow` response into one 501 journey observation. It requires
separate quality and queue-latency evaluators because the source response does
not natively prove those measurements. Complete correlation additionally
requires matching caller IDs, timestamps for every step, complete evidence,
evaluated policy, complete inference telemetry, and a pending human boundary.

`createApprovedIntelResourceCollector` accepts resource evidence only from an
implemented, unexpired, approved source declaration over HTTPS. The returned
observation must match the declared collector, retained source-record digest,
Intel identity, run, profile, target, cluster, node, pod, and container binding.
Pending, revoked, expired, unbound, or generic resource metrics fail closed.
