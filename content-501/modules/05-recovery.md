# 5. Recovery

Remove pressure and execute the recovery phase:

```bash
python3 $HOME/agentic-501/qualification-runner.py run recovery
jq '{pressure,recovery,p95:.workload.latencyMs.p95,quality:.quality.score,correlation,policy}' \
  "$HOME/agentic-501-evidence/recovery.json"
```

Pass when pressure is removed, recovery is recorded, quality returns toward baseline, correlation is complete, and unauthorized actions remain zero.
