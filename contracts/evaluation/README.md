# Deterministic quality evaluation contracts

`evaluation-set.schema.json` fixes the cases, scorer version, class-specific expected values, and arithmetic-mean aggregation. It deliberately contains no pass threshold: approval policy must supply one separately.

The scorer supports three deterministic case classes:

- `exact-value`: strict scalar equality or documented whitespace/case normalization;
- `classification`: exact membership and label equality, plus confusion-count macro precision and recall in a full-set report;
- `retrieval`: exact item identifiers, scored with precision, recall, and F1.

Runtime evidence uses `quality-observation.schema.json`. Missing cases, duplicates, unknown versions/classes, undeclared labels, malformed values, and incomplete source evidence are errors. The evaluator never substitutes a favorable score for absent evidence and does not use an LLM as a judge.

`createDeterministicQualityEvaluator` in `server/quality.ts` is compatible with the quality callback accepted by the workflow journey executor. `evaluateQualitySet` produces an audit report without declaring pass/fail or granting promotion authority.
