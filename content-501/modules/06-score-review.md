# 6. Score and review: fail closed, then hand judgment to a human

## Objective

Build a defensible recommendation without granting the runner certification authority.

## RUN NOW — LOCAL REHEARSAL

```bash
node content-501/tools/rehearsal-check.mjs --summary
```

The checker validates shape and invariants. It deliberately does **not** print `supported`, because:

- every envelope is `source: rehearsal`;
- the threshold status is `draft-not-approved`;
- the Intel identity is a rehearsal label, not approved target telemetry;
- `reviewerDisposition` is `pending`;
- independent Launchpad certification is outside this content path.

## Review order

1. **Admissibility:** correct source, prerequisite, approved profile, immutable identity.
2. **Completeness:** every required field and every correlated journey.
3. **Safety:** no unauthorized action; bounded pressure removed.
4. **Usefulness:** quality, throughput, latency, errors, and timeouts.
5. **Recovery:** restoration and post-recovery quality within approved limits.
6. **Authority:** machine recommendation only; human disposition and promotion.

Use [`../templates/scorecard.md`](../templates/scorecard.md). Missing evidence is `INCONCLUSIVE`, not zero and not pass. A threshold breach is distinct from missing proof.

## Learner checkpoint

Choose `REHEARSAL COMPLETE` or `INCONCLUSIVE`, and cite at least three proof paths. Do not select a live certification outcome.

**Pass when:** a reviewer can reproduce your recommendation and see every blocker without trusting prose alone.
