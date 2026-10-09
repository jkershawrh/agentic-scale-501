# 4. Controlled pressure

Apply one bounded latency condition inside the local runner:

```bash
python3 $HOME/agentic-501/qualification-runner.py run pressure
jq '{pressure,p95:.workload.latencyMs.p95,quality:.quality.score,errors:.workload.errorCount,unauthorized:.policy.unauthorizedActions}' \
  "$HOME/agentic-501-evidence/pressure.json"
```

The runner cannot delete pods, change cluster resources, call a shared model, or affect another seat. Pass when the one condition is visible, attributable, active, and policy-safe.
