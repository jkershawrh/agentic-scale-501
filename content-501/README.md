# Agentic AI 501 — Scale and Certify

Act as the qualification engineer for a governed agent service preparing for a larger rollout. Execute a participant-owned workload through baseline, sustained load, bounded local pressure, and recovery. Then produce a human-reviewed, portable evidence package.

## What you do

1. [Prepare](modules/00-preflight.md) a unique qualification run.
2. [Declare](modules/01-declare.md) the invariant comparison identity.
3. [Execute a baseline](modules/02-baseline.md).
4. [Increase concurrency](modules/03-sustain.md).
5. [Apply bounded pressure](modules/04-controlled-pressure.md).
6. [Remove pressure and prove recovery](modules/05-recovery.md).
7. [Generate and review the scorecard](modules/06-score-review.md).
8. [Package the evidence](modules/07-close-handoff.md).

The commands write to `$HOME/agentic-501-evidence` and produce `$HOME/agentic-501-evidence.tgz` containing the profile, four proof envelopes, report, human decision, and SHA-256 manifest.

## Evidence boundary

This is real namespace-local participant execution with evidence source `offline`. It teaches and proves the qualification method. It does not claim production capacity, approved Intel Xeon utilization, shared-model performance, or Launchpad certification. Automated promotion remains disabled and final disposition remains human-owned.

Start with:

```bash
node content-501/tools/qualification-runner.mjs init --scenario customer-support-triage-readiness
```
