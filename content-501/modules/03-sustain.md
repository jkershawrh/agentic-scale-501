# 3. Sustain

Increase concurrency and compare it with baseline:

```bash
python3 $HOME/agentic-501/qualification-runner.py run sustained
jq -s 'map({phase,concurrency:.profile.concurrency,completed:.workload.completedJourneys,p95:.workload.latencyMs.p95,throughput:.workload.throughputPerMinute,quality:.quality.score,correlation})' \
  "$HOME/agentic-501-evidence/baseline.json" "$HOME/agentic-501-evidence/sustained.json"
```

Success requires useful work, quality, policy, correlation, and authority—not throughput alone.
