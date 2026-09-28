# Agentic AI 501 learner journey

## Scale and certify a governed agentic workload

This Showroom-style lab asks one question: **what remains true when a governed multi-agent workload is placed under useful load and controlled pressure?**

The lab produces a reviewable proof package, not an automatic promotion. The current repository supports a safe **REHEARSAL** path. Live OpenShift execution, approved Intel hardware telemetry, fault injection, and Launchpad certification remain gated.

## Journey map

| Stage | Learner outcome | Evidence | Current mode |
|---|---|---|---|
| [0. Preflight](modules/00-preflight.md) | Prove the lab and prerequisite state | readiness record | Executable locally |
| [1. Declare](modules/01-declare.md) | Freeze the comparison contract | declared profile | Executable locally |
| [2. Baseline](modules/02-baseline.md) | Inspect low-load proof | baseline envelope | Rehearsal fixture |
| [3. Sustain](modules/03-sustain.md) | Compare useful load with baseline | sustained envelope | Rehearsal fixture |
| [4. Controlled pressure](modules/04-controlled-pressure.md) | Test a named, bounded condition | pressure envelope | Rehearsal fixture; live injection gated |
| [5. Recovery](modules/05-recovery.md) | Verify removal and bounded recovery | recovery envelope | Rehearsal fixture |
| [6. Score and review](modules/06-score-review.md) | Make a fail-closed recommendation | scorecard | Learner review; thresholds unapproved |
| [7. Close and handoff](modules/07-close-handoff.md) | State only what the evidence supports | handoff record | Executable locally; certification gated |

## Learning objectives

By the end, a learner can:

1. distinguish functional success from a measured operating envelope;
2. keep workload image, evaluation set, target, policy, model, and run correlation attributable;
3. compare baseline, sustained, pressure, and recovery evidence without treating availability as success;
4. fail closed when telemetry or proof is missing;
5. preserve the boundary between a machine-generated recommendation and a human certification decision.

## Safe execution contract

Commands labeled **RUN NOW — LOCAL REHEARSAL** read repository files and write nothing outside the learner's own worksheet. Commands labeled **GATED FUTURE LIVE EXECUTION** are explanatory only and must not be run until every gate in [Preflight](modules/00-preflight.md) is approved.

Start the lab:

```bash
cd /Users/jkershaw/Documents/agentic-scale-501
node content-501/tools/rehearsal-check.mjs
```

Expected classification:

```text
REHEARSAL ONLY — 4 contract-shaped envelopes validated; certification remains unavailable.
```

## Proof vocabulary

Every phase uses `agentic-scale-proof/v1` and carries:

- `source`: `live`, `rehearsal`, or `offline`;
- `runId` and immutable comparison identity;
- workload, correlation, inference, policy, quality, and resource evidence;
- pressure and recovery evidence when the phase requires it;
- `automatedPromotion: false`, `humanReviewRequired: true`, and a human-owned disposition.

The proof contract is defined in [`../contracts/agentic-scale-proof.schema.json`](../contracts/agentic-scale-proof.schema.json). The values in [`../contracts/thresholds.draft.json`](../contracts/thresholds.draft.json) are deliberately unapproved and cannot certify a run.

## Completion standard

Complete every learner checkpoint in [`templates/learner-record.md`](templates/learner-record.md). A valid lab completion can conclude **rehearsal complete** or **inconclusive**. It cannot conclude that the workload is live-certified.
