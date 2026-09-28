# 3. Sustain: hold useful load without losing trust

## Objective

Compare a sustained-load rehearsal envelope with baseline while keeping the evaluation and attribution contract fixed.

## RUN NOW — LOCAL REHEARSAL

```bash
node content-501/tools/rehearsal-check.mjs --phase sustained
```

## Compare

Inspect both phases:

```bash
node content-501/tools/rehearsal-check.mjs --compare baseline,sustained
```

Ask:

- Did completed journeys and throughput change as expected?
- Did p95 journey or queue latency change?
- Did error or timeout counts appear?
- Did quality, policy compliance, or correlation completeness drift?
- Is the model, evaluation set, image, target, and policy still attributable?
- Does resource evidence remain explicitly rehearsal-sourced?

An available service with incomplete evidence is not a successful sustained run. Replica count and CPU utilization alone do not define the operating envelope.

## Learner checkpoint

Write one evidence-backed comparison and one limitation. Use “the rehearsal fixture shows…” rather than “the platform sustains…”.

**Pass when:** your comparison covers usefulness and trust—quality, policy, and correlation—not only throughput.
