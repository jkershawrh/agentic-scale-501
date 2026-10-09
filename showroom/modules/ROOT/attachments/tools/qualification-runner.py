#!/usr/bin/env python3
"""Participant-owned, deterministic Agentic AI 501 qualification runner."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import statistics
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

PHASES = ("baseline", "sustained", "pressure", "recovery")
SETTINGS = {
    "baseline": {"concurrency": 1, "journeys": 4, "delay_ms": 8, "quality": 0.97},
    "sustained": {"concurrency": 5, "journeys": 15, "delay_ms": 12, "quality": 0.95},
    "pressure": {"concurrency": 5, "journeys": 15, "delay_ms": 45, "quality": 0.91},
    "recovery": {"concurrency": 5, "journeys": 10, "delay_ms": 10, "quality": 0.96},
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(len(ordered) * fraction + 0.999999) - 1))
    return round(ordered[index], 2)


def initialize(workspace: Path, scenario: str) -> dict:
    workspace.mkdir(parents=True, exist_ok=True)
    profile = {
        "schemaVersion": "agentic-501-learner-profile/v1",
        "runId": f"a501-{uuid.uuid4()}",
        "scenario": scenario,
        "profileId": "participant-owned-qualification",
        "profileVersion": "v1",
        "workloadImageDigest": "sha256:" + hashlib.sha256(b"agentic-501-bounded-local-workload-v1").hexdigest(),
        "evaluationSetVersion": "eval-local-v1",
        "target": "participant-terminal-local-runner",
        "authority": {"automatedPromotion": False, "humanReviewRequired": True},
        "createdAt": now(),
    }
    write_json(workspace / "qualification-profile.json", profile)
    (workspace / "learner-decision.md").write_text(
        f"# Learner qualification decision\n\nScenario: {scenario}\n\n"
        "## Decision\n\n- [ ] REHEARSAL COMPLETE\n- [ ] INCONCLUSIVE\n\n"
        "## Evidence-backed reason\n\nWrite your decision here.\n\n"
        "## What is not proved\n\nThis namespace-local run does not prove production capacity, "
        "approved Intel Xeon telemetry, or Launchpad certification.\n",
        encoding="utf-8",
    )
    return profile


def execute_phase(workspace: Path, phase: str) -> dict:
    if phase not in PHASES:
        raise ValueError(f"Unknown phase: {phase}")
    profile = json.loads((workspace / "qualification-profile.json").read_text(encoding="utf-8"))
    settings = SETTINGS[phase]
    durations: list[float] = []
    queue: list[int] = []
    started = time.perf_counter()
    for offset in range(0, settings["journeys"], settings["concurrency"]):
        batch = range(offset + 1, min(settings["journeys"], offset + settings["concurrency"]) + 1)
        batch_started = time.perf_counter()
        planned = [settings["delay_ms"] + (sequence % 4) * 3 for sequence in batch]
        time.sleep(max(planned) / 1000)
        elapsed = (time.perf_counter() - batch_started) * 1000
        durations.extend(round(elapsed - (max(planned) - delay), 2) for delay in planned)
        queue.extend(sequence % 3 for sequence in batch)
    elapsed_ms = max((time.perf_counter() - started) * 1000, 1)
    envelope = {
        "schemaVersion": "agentic-scale-proof/v1",
        "source": "offline",
        "collectedAt": now(),
        "phase": phase,
        "runId": profile["runId"],
        "profile": {
            "id": profile["profileId"], "version": profile["profileVersion"],
            "workloadImageDigest": profile["workloadImageDigest"],
            "evaluationSetVersion": profile["evaluationSetVersion"], "target": profile["target"],
            "concurrency": settings["concurrency"],
        },
        "workload": {
            "attemptedJourneys": settings["journeys"], "completedJourneys": len(durations),
            "errorCount": 0, "timeoutCount": 0,
            "throughputPerMinute": round(len(durations) / elapsed_ms * 60000, 2),
            "latencyMs": {"p50": percentile(durations, 0.5), "p95": percentile(durations, 0.95)},
            "queueLatencyMs": {"p50": percentile(queue, 0.5), "p95": percentile(queue, 0.95)},
        },
        "correlation": {"expectedJourneys": settings["journeys"], "completeJourneys": len(durations)},
        "inference": {
            "model": "deterministic-local-policy-engine",
            "endpoint": "local://participant-terminal/qualification-runner",
            "requestCount": settings["journeys"],
            "latencyMs": {"p50": percentile(durations, 0.5), "p95": percentile(durations, 0.95)},
            "inputTokens": 0, "outputTokens": 0,
        },
        "policy": {"version": "bounded-local-v1", "evaluatedJourneys": settings["journeys"], "compliantJourneys": settings["journeys"], "unauthorizedActions": 0},
        "quality": {"scorerVersion": "deterministic-local-v1", "evaluatedJourneys": settings["journeys"], "score": settings["quality"]},
        "resources": {"telemetrySource": "participant-process-observation-not-hardware-telemetry", "cpuRequestedCores": 0, "cpuUtilizationPercent": 0},
        "authority": {"automatedPromotion": False, "humanReviewRequired": True, "reviewerDisposition": "pending"},
    }
    if phase in ("pressure", "recovery"):
        envelope["pressure"] = {"condition": "bounded-local-dependency-latency", "admitted": True, "removed": phase == "recovery"}
    if phase == "recovery":
        envelope["recovery"] = {"recovered": True, "recoveryMs": round(elapsed_ms), "postRecoveryQualityScore": settings["quality"]}
    write_json(workspace / f"{phase}.json", envelope)
    return envelope


def build_report(workspace: Path) -> Path:
    profile = json.loads((workspace / "qualification-profile.json").read_text(encoding="utf-8"))
    envelopes = [json.loads((workspace / f"{phase}.json").read_text(encoding="utf-8")) for phase in PHASES]
    identities = {(item["runId"], item["profile"]["id"], item["profile"]["version"], item["profile"]["workloadImageDigest"], item["profile"]["evaluationSetVersion"], item["profile"]["target"]) for item in envelopes}
    if len(identities) != 1:
        raise ValueError("Comparison identity changed across phases")
    if any(item["source"] != "offline" for item in envelopes):
        raise ValueError("Learner evidence source must remain offline")
    baseline, sustained, pressure, recovery = envelopes
    rows = "\n".join(
        f'| {item["phase"]} | {item["profile"]["concurrency"]} | {item["workload"]["completedJourneys"]}/{item["workload"]["attemptedJourneys"]} | {item["workload"]["latencyMs"]["p95"]} ms | {item["quality"]["score"]:.2f} | {item["correlation"]["completeJourneys"]}/{item["correlation"]["expectedJourneys"]} |'
        for item in envelopes
    )
    report = workspace / "qualification-report.md"
    report.write_text(
        f'# Agentic AI 501 qualification report\n\nRun ID: {profile["runId"]}  \nScenario: {profile["scenario"]}  \n'
        "Evidence source: OFFLINE — participant-owned namespace-local execution  \n"
        "Machine recommendation: REHEARSAL COMPLETE — HUMAN REVIEW REQUIRED\n\n"
        "| Phase | Concurrency | Completed | p95 latency | Quality | Correlation |\n|---|---:|---:|---:|---:|---:|\n"
        f"{rows}\n\n## What changed\n\n"
        f'- Sustained concurrency increased from {baseline["profile"]["concurrency"]} to {sustained["profile"]["concurrency"]}.\n'
        f'- Controlled pressure increased p95 latency from {sustained["workload"]["latencyMs"]["p95"]} ms to {pressure["workload"]["latencyMs"]["p95"]} ms.\n'
        f'- Pressure was removed: {str(recovery["pressure"]["removed"]).lower()}; recovered: {str(recovery["recovery"]["recovered"]).lower()}.\n'
        f'- Recovery p95 returned to {recovery["workload"]["latencyMs"]["p95"]} ms with quality {recovery["quality"]["score"]:.2f}.\n\n'
        "## Authority boundary\n\nThe runner cannot certify or promote this workload. A human reviewer must select "
        "REHEARSAL COMPLETE or INCONCLUSIVE in learner-decision.md. This run does not prove production capacity, "
        "approved Intel Xeon utilization, or Launchpad certification.\n",
        encoding="utf-8",
    )
    files = ["qualification-profile.json", *(f"{phase}.json" for phase in PHASES), "qualification-report.md", "learner-decision.md"]
    manifest = "\n".join(f'{hashlib.sha256((workspace / name).read_bytes()).hexdigest()}  {name}' for name in files) + "\n"
    (workspace / "evidence-manifest.sha256").write_text(manifest, encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("init", "run", "report", "package"))
    parser.add_argument("phase", nargs="?", choices=PHASES)
    parser.add_argument("--workspace", type=Path, default=Path.home() / "agentic-501-evidence")
    parser.add_argument("--scenario", default="governed-service-readiness")
    args = parser.parse_args()
    if args.command == "init":
        profile = initialize(args.workspace, args.scenario)
        print(f'Initialized participant-owned qualification run {profile["runId"]}\nWorkspace: {args.workspace}')
    elif args.command == "run":
        if not args.phase:
            parser.error("run requires a phase")
        envelope = execute_phase(args.workspace, args.phase)
        print(f'{args.phase}: {envelope["workload"]["completedJourneys"]}/{envelope["workload"]["attemptedJourneys"]} completed, p95={envelope["workload"]["latencyMs"]["p95"]}ms, quality={envelope["quality"]["score"]:.2f}')
    elif args.command == "report":
        print(f"Report: {build_report(args.workspace)}\nMachine recommendation: REHEARSAL COMPLETE — HUMAN REVIEW REQUIRED")
    else:
        build_report(args.workspace)
        archive = Path(str(args.workspace) + ".tgz")
        subprocess.run(["tar", "-czf", str(archive), "-C", str(args.workspace.parent), args.workspace.name], check=True)
        print(f"Evidence package: {archive}")


if __name__ == "__main__":
    main()
