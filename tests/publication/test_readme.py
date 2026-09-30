from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]


def test_publication_structure():
    required = [
        "README.md",
        "site.yml",
        "showroom/antora.yml",
        "showroom/modules/ROOT/nav.adoc",
        "tests/validation_matrix.yaml",
        "tests/claim_registry.yaml",
        "tests/benchmark_rubric.yaml",
        "handoff/launchpad-handoff.yaml",
    ]
    assert [path for path in required if not (ROOT / path).is_file()] == []


def test_readme_declares_required_quickstart_sections():
    content = (ROOT / "README.md").read_text()
    for heading in (
        "## Table of contents",
        "## Overview",
        "## Architecture",
        "## Requirements",
        "## Deploy",
        "## Repository structure",
        "## Tags",
        "## References",
    ):
        assert heading in content


def test_evidence_artifacts_are_nonempty():
    for name, key in (
        ("validation_matrix.yaml", "stages"),
        ("claim_registry.yaml", "claims"),
        ("benchmark_rubric.yaml", "benchmarks"),
    ):
        document = yaml.safe_load((ROOT / "tests" / name).read_text())
        assert document[key]


def test_handoff_remains_fail_closed():
    handoff = yaml.safe_load((ROOT / "handoff/launchpad-handoff.yaml").read_text())
    authority = handoff["factory_receipt"]["authority"]
    assert authority["orderable"] is False
    assert authority["certified"] is False
    assert authority["promotion_eligible"] is False


def test_presentation_probes_allow_bounded_nginx_startup():
    template = (
        ROOT / "charts/agentic-scale-501/templates/presentation.yaml"
    ).read_text()
    assert "startupProbe:" in template
    assert "timeoutSeconds: 5" in template
    assert "failureThreshold: 12" in template


def test_release_workflow_enforces_publication_contracts():
    workflow = (ROOT / ".github/workflows/release.yml").read_text()
    assert "python -m pytest -q tests/publication" in workflow
    assert "Build Linux AMD64 candidate without publishing" in workflow
    assert "Publish and verify exact digest" in workflow
    assert "Retain vulnerability inventory even when the gate fails" in workflow


def test_qualifier_runtime_removes_unused_package_managers():
    containerfile = (ROOT / "Containerfile").read_text()
    assert "cgr.dev/chainguard/node@sha256:" in containerfile
    assert "FROM scratch" in containerfile
    assert "rm -rf /node-root/usr/lib/node_modules" in containerfile
    assert "/node-root/usr/bin/npm" in containerfile
    assert 'ENTRYPOINT ["/usr/bin/node"]' in containerfile
    assert "USER 65532" in containerfile
