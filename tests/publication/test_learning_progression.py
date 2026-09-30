from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OVERVIEW = ROOT / "showroom/modules/ROOT/pages/index.adoc"
CLOSE = ROOT / "showroom/modules/ROOT/pages/07-close-handoff.adoc"


def test_501_connects_story_and_learning_method_to_401_and_601():
    content = OVERVIEW.read_text()
    for marker in (
        "== Story",
        "Show → Learn → Do → Prove",
        "Agentic AI 401",
        "Agentic AI 601",
        "REHEARSAL",
    ):
        assert marker in content


def test_501_cleanup_is_truthful_for_rehearsal_and_future_live_runs():
    content = CLOSE.read_text()
    assert "== Cleanup and Reclaim Boundary" in content
    assert "No target environment or Launchpad state was changed" in content
    assert "zero residue" in content
    assert "Launchpad reclaim" in content


def test_501_does_not_invent_operator_or_inference_dependencies():
    content = OVERVIEW.read_text()
    assert "installs no optional OpenShift Operator" in content
    assert "provisions no model" in content
    assert "not proof that a model ran" in content
    assert "future LIVE qualification" in content
