# 2. Baseline

Execute the low-concurrency reference:

```bash
node content-501/tools/qualification-runner.mjs run baseline
jq '{phase,source,concurrency:.profile.concurrency,workload,correlation,quality,policy,authority}' \
  "$HOME/agentic-501-evidence/baseline.json"
```

Record p95 latency, quality, correlation, provenance, and the zero-unauthorized-action boundary.
