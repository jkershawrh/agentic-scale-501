# 2. Baseline: establish the reference state

## Objective

Inspect a low-concurrency rehearsal envelope and establish a reference for latency, quality, policy, inference, resources, and proof completeness.

## RUN NOW — LOCAL REHEARSAL

```bash
node content-501/tools/rehearsal-check.mjs --phase baseline
```

Then inspect the envelope:

```bash
sed -n '1,240p' content-501/fixtures/baseline.rehearsal.json
```

## Evidence review

Trace these joins rather than reading one headline metric:

1. `runId` joins the phase to the declared run.
2. `correlation.completeJourneys` accounts for every expected journey.
3. `policy` shows evaluated, compliant, and unauthorized activity.
4. `quality` identifies the scorer and evaluation count.
5. `inference` attributes model, endpoint, latency, and token use.
6. `resources` names its telemetry source; a rehearsal hardware label is not approved hardware proof.
7. `authority` preserves human review and disables automated promotion.

## Learner checkpoint

Record the baseline p95 journey latency, inference p95, quality score, policy compliance, correlation ratio, and source. Add the sentence: “These are rehearsal fixture values, not observed OpenShift or Intel performance.”

**Pass when:** your baseline note includes source and provenance, not just performance numbers.
