# 1. Declare: freeze the comparison contract

## Objective

Declare what is held fixed, what intentionally changes, what evidence is mandatory, and what condition ends the run.

## Read the declaration

```bash
sed -n '1,240p' content-501/templates/profile-declaration.yaml
```

The rehearsal holds these identities fixed across all four phases:

- profile family and version;
- workload image digest;
- evaluation set version;
- target label;
- policy and quality-scorer versions;
- model and inference endpoint;
- telemetry source;
- `runId`.

The phase and intended load level may change. During a future controlled-pressure phase, only the pre-approved pressure condition may change. Quiet changes to the image, evaluation set, policy, model, or target invalidate comparison.

## Failure budget and stop conditions

The repository's threshold file is `draft-not-approved`. Use its values to learn how a deterministic scorecard is structured, not to claim an approved service envelope.

Stop or classify the evidence as inconclusive if:

- a required identity or proof field is absent;
- a phase is mislabeled or the source changes;
- correlation is incomplete;
- the pressure condition is not admitted or cannot be removed;
- the runtime attempts to certify or promote;
- safe restoration cannot be confirmed.

## Learner checkpoint

In the learner record, write:

1. the invariant comparison identity;
2. the single changed condition at each stage;
3. the source classification;
4. one stop condition;
5. the person or role that owns final disposition.

**Pass when:** another reviewer could detect an apples-to-oranges comparison from your declaration alone.
