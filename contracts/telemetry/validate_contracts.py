#!/usr/bin/env python3
"""Validate 501 telemetry/failure schemas, examples, and fail-closed invariants.

Requires Python jsonschema. This is a contract check; it does not contact a runtime.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[2]

CASES = (
    (
        ROOT / "contracts/telemetry/correlation-event.schema.json",
        ROOT / "contracts/telemetry/examples/rehearsal-correlation-event.json",
    ),
    (
        ROOT / "contracts/telemetry/intel-hardware-source.schema.json",
        ROOT / "contracts/telemetry/examples/pending-intel-source.json",
    ),
    (
        ROOT / "contracts/failure/failure-profile.schema.json",
        ROOT / "contracts/failure/examples/gated-dependency-latency.json",
    ),
    (
        ROOT / "contracts/failure/recovery-assertion.schema.json",
        ROOT / "contracts/failure/examples/inconclusive-recovery.json",
    ),
)


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def validator(path: Path) -> Draft202012Validator:
    schema = load(path)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def assert_invalid(checker: Draft202012Validator, instance: dict, label: str) -> None:
    if checker.is_valid(instance):
        raise AssertionError(f"Expected invalid contract case: {label}")


def main() -> None:
    validators: dict[str, Draft202012Validator] = {}
    examples: dict[str, dict] = {}

    for schema_path, example_path in CASES:
        checker = validator(schema_path)
        example = load(example_path)
        errors = sorted(checker.iter_errors(example), key=lambda item: list(item.path))
        if errors:
            details = "\n".join(f"  {list(error.path)}: {error.message}" for error in errors)
            raise AssertionError(f"{example_path} failed {schema_path}:\n{details}")
        validators[schema_path.name] = checker
        examples[example_path.name] = example
        print(f"PASS {example_path.relative_to(ROOT)}")

    semconv = load(ROOT / "contracts/telemetry/semantic-conventions.v1.json")
    names = [entry["name"] for entry in semconv["attributes"]]
    if len(names) != len(set(names)):
        raise AssertionError("semantic convention attribute names must be unique")
    required_correlation = {"agentic501.run.id", "agentic501.journey.id"}
    if not required_correlation.issubset(set(names)):
        raise AssertionError("semantic conventions omit required correlation attributes")
    print("PASS contracts/telemetry/semantic-conventions.v1.json")

    rules = load(ROOT / "contracts/failure/fail-closed-rules.v1.json")
    rule_ids = [rule["id"] for rule in rules["rules"]]
    if len(rule_ids) != len(set(rule_ids)) or rules["defaultDecision"] != "inconclusive-and-no-promotion":
        raise AssertionError("fail-closed rule IDs must be unique and default must deny promotion")
    print("PASS contracts/failure/fail-closed-rules.v1.json")

    correlation = copy.deepcopy(examples["rehearsal-correlation-event.json"])
    correlation["otel"]["traceId"] = "not-a-trace-id"
    assert_invalid(validators["correlation-event.schema.json"], correlation, "malformed trace ID")

    intel = copy.deepcopy(examples["pending-intel-source.json"])
    intel["implementationStatus"] = "implemented"
    assert_invalid(validators["intel-hardware-source.schema.json"], intel, "implemented Intel source without approval")

    profile = copy.deepcopy(examples["gated-dependency-latency.json"])
    profile["enabled"] = True
    assert_invalid(validators["failure-profile.schema.json"], profile, "enabled runtime-gated failure")

    recovery = copy.deepcopy(examples["inconclusive-recovery.json"])
    recovery["outcome"] = "passed"
    recovery["blockers"] = []
    assert_invalid(validators["recovery-assertion.schema.json"], recovery, "passed rehearsal recovery")

    print("PASS fail-closed negative cases")
    print("Validated 4 schemas, 4 examples, 2 rule inventories, and 4 negative cases.")


if __name__ == "__main__":
    main()
