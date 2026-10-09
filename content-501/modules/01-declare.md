# 1. Declare

Freeze the comparison identity:

```bash
jq '{runId,scenario,profileId,profileVersion,workloadImageDigest,evaluationSetVersion,target,authority}' \
  "$HOME/agentic-501-evidence/qualification-profile.json"
```

Do not change the run ID, workload digest, evaluation set, or target after execution begins. Missing evidence, changed identity, incomplete correlation, unremoved pressure, or automated promotion makes the run inconclusive.
