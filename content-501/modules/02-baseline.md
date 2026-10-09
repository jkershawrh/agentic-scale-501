# 2. Baseline

Execute the low-concurrency reference:

```bash
python3 $HOME/agentic-501/qualification-runner.py run baseline
jq '{phase,source,concurrency:.profile.concurrency,workload,correlation,quality,policy,authority}' \
  "$HOME/agentic-501-evidence/baseline.json"
```

Record p95 latency, quality, correlation, provenance, and the zero-unauthorized-action boundary.
