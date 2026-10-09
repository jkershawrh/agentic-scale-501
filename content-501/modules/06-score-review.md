# 6. Score and decide

Generate the comparison report:

```bash
node content-501/tools/qualification-runner.mjs report
sed -n '1,240p' "$HOME/agentic-501-evidence/qualification-report.md"
```

Review all four phases. Edit `learner-decision.md`, select `REHEARSAL COMPLETE` or `INCONCLUSIVE`, and cite at least three exact evidence paths. The machine cannot certify or promote.
