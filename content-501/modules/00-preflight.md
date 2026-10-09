# 0. Prepare

Create a unique learner-owned run and decision record:

```bash
rm -rf "$HOME/agentic-501-evidence" "$HOME/agentic-501-evidence.tgz"
mkdir -p "$HOME/agentic-501"
curl -fsSLo "$HOME/agentic-501/qualification-runner.py" \
  http://127.0.0.1:8080/www/agentic-scale-501/_attachments/tools/qualification-runner.py
python3 -m py_compile "$HOME/agentic-501/qualification-runner.py"
python3 $HOME/agentic-501/qualification-runner.py init --scenario customer-support-triage-readiness
cat "$HOME/agentic-501-evidence/qualification-profile.json" | jq
```

Pass when the profile exists and you can explain why the runner may recommend but cannot certify.
