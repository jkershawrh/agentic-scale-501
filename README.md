# Agentic AI 501 — Scale and Certify

This workspace is the post-401 Agentic AI presentation and lab-design surface. It applies the Triforce presentation pattern to one question: **what remains true when a governed multi-agent workload is placed under useful load and controlled failure?**

## Current state

Implemented and testable now:

- A business-first presentation with a guided technical architecture.
- A fixed journey: declare, baseline, sustain, pressure, recover, certify.
- Source-labeled rehearsal adapters for every measured stage.
- Explicit human authority and fail-closed certification language.
- Offline assets and a production Vite build.
- An executable Node 22 scale service with health, readiness, bounded request handling, cancellation, and graceful shutdown.
- A deterministic, network-free rehearsal runtime as the safe default.
- Fail-closed live startup that requires separately configured workflow, quality, queue, Intel telemetry, and fault-gate dependencies.
- Native Antora/Showroom content with exactly eight ordered learner stages and source-exact evidence downloads.
- A draft discovery blueprint tied to `multi-agent-quickstart` revision `d9529ad7caa3b1e5c335085f7e023ebb49e19900`.

Gated and not represented as completed live proof:

- Connection of `/api/scale/run` to approved production dependencies.
- Runtime proof from an approved human-approval boundary.
- Approved live end-to-end correlation and proof-scoring evidence.
- Controlled fault-injection and bounded-recovery evidence from the target environment.
- Approved Intel Xeon identity, allocation, and utilization telemetry from the target environment.
- Immutable image publication and Launchpad 1 / 5 / 25-seat certification.

Until those gates are satisfied, all displayed measurements are visibly labeled `REHEARSAL` and cannot support promotion.

## Run locally

```bash
npm install
npm run check
npm run dev
```

## Key files

- `demo-blueprint.yaml` — discovery, architecture, claims, gaps, and validation plan.
- `story.brief.yaml` — the narrative contract.
- `src/demo.config.ts` — the guided presentation.
- `src/live/demoAdapter.ts` — contract-validating live endpoints that reject malformed, wrong-phase, non-live, or authority-overreaching responses before the UI can display them as proof.
- `contracts/agentic-scale-proof.schema.json` — shared proof-envelope contract for the workload, collector, scorer, Launchpad adapter, and UI.
- `contracts/thresholds.draft.json` — deliberately unapproved starter thresholds; these cannot be used as certification policy until reviewed.
- `src/proof/scorer.ts` — deterministic, fail-closed certification scorer.
- `src/proof/scaleRunner.ts` — bounded, cancellable journey runner that emits the shared correlated proof envelope and cannot grant promotion authority.
- `server/workflowExecutor.ts` — server-side adapter for the canonical multi-agent `/api/v1/workflow` contract; requires independent quality and queue-latency evaluators and fails correlation closed when source evidence is incomplete.
- `content-501/` — eight-stage Showroom-style rehearsal journey, worksheets, proof fixtures, facilitator guidance, and handoff.
- `contracts/telemetry/` and `contracts/failure/` — correlation, OpenTelemetry, Intel source-admission, controlled-failure, recovery, and fail-closed contracts.
- `server/quality.ts` — deterministic exact-value, classification, and retrieval evaluator with no LLM judge or promotion thresholds.
- `server/failureDriver.ts` — disabled-by-default, allowlisted, single-use controlled-pressure lifecycle with independent verification and rollback.
- `server/main.ts` — executable HTTP entrypoint for `/healthz`, `/readyz`, and `/api/scale/run`.
- `showroom/` and `site.yml` — native Antora component, navigation, validation, and RHDP Showroom build.
- `packaging/` and `deploy/` — AMD64-only pre-image plan, hardened OpenShift manifests, health/readiness contracts, runtime Secret references, and supply-chain gates.

The next release step is to create and publish immutable AMD64 image digests, then connect live dependencies only after Agentic 401 certification establishes the prerequisite governed workload. Launchpad certification remains a separate 1 / 5 / 25-seat evidence exercise.
