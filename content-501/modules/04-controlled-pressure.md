# 4. Controlled pressure: cross one named boundary

## Objective

Observe system behavior with one admitted pressure condition while the workload identity and evaluation set remain fixed.

## RUN NOW — LOCAL REHEARSAL

```bash
node content-501/tools/rehearsal-check.mjs --phase pressure
```

The fixture's condition is a narrative rehearsal. It does not inject a fault into OpenShift, the model gateway, or any Intel-backed target.

Review:

- `pressure.condition` is specific and attributable;
- `pressure.admitted` is true;
- `pressure.removed` remains false during this phase;
- errors, timeouts, queueing, retry behavior, quality, and policy are still measured;
- no unauthorized action or automatic promotion occurs.

## GATED FUTURE LIVE EXECUTION — DO NOT RUN

A live pressure action is permitted only when the declaration names the exact reversible mechanism, owner, start condition, maximum duration, abort threshold, restoration step, and post-restoration check. Generic commands and improvised fault injection are outside this lab.

If admission, boundedness, or reversibility is missing, skip injection and mark the stage inconclusive.

## Learner checkpoint

State the admitted condition, its intended blast radius, the evidence that must remain intact, the abort condition, and the restoration proof you would require.

**Pass when:** your plan tests one condition and protects the participant namespace, shared model gateway, and promotion boundary.
