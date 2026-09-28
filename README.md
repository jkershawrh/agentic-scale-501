# Agentic AI 501 — Production Multi-Agent Blueprint

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
- A reviewed discovery blueprint tied to `multi-agent-quickstart` revision `43889bc9444f9ef07f5b1a88e7de534af9647264`.
- Versioned agent-role, MCP/tool, deterministic-policy, evidence, Intel telemetry, and controlled-failure contracts.
- Correlated, idempotent workflow requests with bounded retries for transient dependency failures only.
- A separate Helm chart for the presentation and qualification service, with digest-only images, non-root/read-only workloads, and default-deny networking.
- A pinned GitHub Actions release path that tests the Triforce and Showroom, builds `linux/amd64`, rejects any HIGH/CRITICAL vulnerability, emits SPDX SBOMs, publishes to GHCR, and creates OIDC build-provenance attestations.

Gated and not represented as completed live proof:

- Connection of `/api/scale/run` to approved production dependencies.
- Runtime proof from an approved human-approval boundary.
- Approved live end-to-end correlation and proof-scoring evidence.
- Controlled fault-injection and bounded-recovery evidence from the target environment.
- Approved Intel Xeon identity, allocation, and utilization telemetry from the target environment.
- Immutable image publication and Launchpad 1 / 5 / 25-seat certification.

Until those gates are satisfied, the presentation reports unobserved measurements as `not observed`; it never substitutes authored numbers for live proof. Contract examples remain explicitly non-certifying test data.

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
- `contracts/orchestration/` — pinned role cards, MCP/tool behavior, deterministic policy order, idempotency, retry, timeout, and human-authority contracts.
- `server/quality.ts` — deterministic exact-value, classification, and retrieval evaluator with no LLM judge or promotion thresholds.
- `server/failureDriver.ts` — disabled-by-default, allowlisted, single-use controlled-pressure lifecycle with independent verification and rollback.
- `server/main.ts` — executable HTTP entrypoint for `/healthz`, `/readyz`, and `/api/scale/run`.
- `showroom/` and `site.yml` — native Antora component, navigation, validation, and RHDP Showroom build.
- `charts/agentic-scale-501/` — separate presentation and qualifier workloads with digest-only images and a safe rehearsal default.
- `.github/workflows/release.yml` — pinned verification, GHCR publication, hard zero HIGH/CRITICAL gate, SPDX SBOM, and GitHub OIDC provenance.
- `packaging/` and `deploy/` — AMD64-only pre-image plan, hardened OpenShift manifests, health/readiness contracts, runtime Secret references, and supply-chain gates.

Pushes to `main` publish immutable AMD64 candidates only when the release workflow is green. Live dependencies remain disabled until Agentic 401 certification establishes the prerequisite governed workload. Launchpad certification remains a separate downstream exercise and this repository never changes that state.
