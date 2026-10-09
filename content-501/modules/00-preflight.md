# 0. Prepare

Create a unique learner-owned run and decision record:

```bash
rm -rf "$HOME/agentic-501-evidence" "$HOME/agentic-501-evidence.tgz"
node content-501/tools/qualification-runner.mjs init --scenario customer-support-triage-readiness
cat "$HOME/agentic-501-evidence/qualification-profile.json" | jq
```

Pass when the profile exists and you can explain why the runner may recommend but cannot certify.
