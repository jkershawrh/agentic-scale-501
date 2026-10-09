from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OVERVIEW = ROOT / "showroom/modules/ROOT/pages/index.adoc"
CLOSE = ROOT / "showroom/modules/ROOT/pages/07-close-handoff.adoc"


def test_501_connects_story_and_learning_method_to_401_and_601():
    content = OVERVIEW.read_text()
    for marker in (
        "== Your mission",
        "Show → Learn → Do → Prove",
        "participant-owned",
        "OFFLINE",
        "agentic-501-evidence.tgz",
    ):
        assert marker in content


def test_501_cleanup_is_truthful_for_rehearsal_and_future_live_runs():
    content = CLOSE.read_text()
    assert "== Cleanup and reclaim boundary" in content
    assert "workload ran only inside your terminal process" in content
    assert "evidence files remain intentionally" in content
    assert "Launchpad still owns" in content


def test_501_does_not_invent_operator_or_inference_dependencies():
    content = OVERVIEW.read_text()
    assert "does not inject a cluster fault" in content
    assert "does not claim production capacity" in content
    assert "approved Intel Xeon utilization" in content


def test_501_requires_learner_execution_and_a_portable_leave_behind():
    pages = ROOT / "showroom/modules/ROOT/pages"
    expected = {
        "00-preflight.adoc": "qualification-runner.mjs init",
        "02-baseline.adoc": "qualification-runner.mjs run baseline",
        "03-sustain.adoc": "qualification-runner.mjs run sustained",
        "04-controlled-pressure.adoc": "qualification-runner.mjs run pressure",
        "05-recovery.adoc": "qualification-runner.mjs run recovery",
        "06-score-review.adoc": "qualification-runner.mjs report",
        "07-close-handoff.adoc": "qualification-runner.mjs package",
    }
    for filename, command in expected.items():
        assert command in (pages / filename).read_text()
    assert "evidence-manifest.sha256" in CLOSE.read_text()
