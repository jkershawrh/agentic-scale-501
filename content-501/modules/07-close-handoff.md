# 7. Package and hand off

Create and verify the leave-behind:

```bash
python3 $HOME/agentic-501/qualification-runner.py package
tar -tzf "$HOME/agentic-501-evidence.tgz"
cd "$HOME/agentic-501-evidence"
sha256sum -c evidence-manifest.sha256
```

The archive is the learner's durable output. It proves participant-owned offline execution and the qualification method—not production capacity, approved Intel telemetry, shared-model performance, or Launchpad certification. Launchpad still owns lab reclamation.
