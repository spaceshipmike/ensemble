"""Tests for doctor and drift detection."""

import json
from unittest.mock import patch

from mcpoyle.config import (
    ClientAssignment,
    McpoyleConfig,
    Server,
    Skill,
    compute_entry_hash,
)
from mcpoyle.doctor import Check, run_doctor
from mcpoyle.sync import DriftInfo, _detect_drift


# ── Hashing ──────────────────────────────────────────────────


def test_compute_entry_hash_deterministic():
    entry = {"command": "echo", "args": ["hello"], "__mcpoyle": True}
    h1 = compute_entry_hash(entry)
    h2 = compute_entry_hash(entry)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_compute_entry_hash_ignores_marker():
    with_marker = {"command": "echo", "__mcpoyle": True}
    without_marker = {"command": "echo"}
    assert compute_entry_hash(with_marker) == compute_entry_hash(without_marker)


def test_compute_entry_hash_order_independent():
    a = {"command": "echo", "args": ["hello"]}
    b = {"args": ["hello"], "command": "echo"}
    assert compute_entry_hash(a) == compute_entry_hash(b)


def test_compute_entry_hash_different_content():
    a = {"command": "echo"}
    b = {"command": "cat"}
    assert compute_entry_hash(a) != compute_entry_hash(b)


# ── Drift detection ──────────────────────────────────────────


def test_detect_drift_no_stored_hashes():
    managed = {"s1": {"command": "echo", "__mcpoyle": True}}
    result = _detect_drift(managed, {})
    assert result == []


def test_detect_drift_no_change():
    entry = {"command": "echo", "__mcpoyle": True}
    stored = {"s1": compute_entry_hash(entry)}
    result = _detect_drift({"s1": entry}, stored)
    assert result == []


def test_detect_drift_with_change():
    original = {"command": "echo", "__mcpoyle": True}
    modified = {"command": "cat", "__mcpoyle": True}
    stored = {"s1": compute_entry_hash(original)}
    result = _detect_drift({"s1": modified}, stored)
    assert len(result) == 1
    assert result[0].name == "s1"


# ── Doctor checks ────────────────────────────────────────────


def test_doctor_empty_config():
    cfg = McpoyleConfig()
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    assert result.errors == 0
    assert result.warnings == 0
    assert result.server_count == 0
    assert result.skill_count == 0


def test_doctor_empty_env_var():
    cfg = McpoyleConfig(servers=[
        Server(name="s1", command="echo", env={"API_KEY": ""}),
    ])
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    assert result.errors == 1
    assert any("empty env var" in c.message for c in result.checks)


def test_doctor_disabled_server_skipped():
    cfg = McpoyleConfig(servers=[
        Server(name="s1", command="echo", enabled=False, env={"API_KEY": ""}),
    ])
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    # Disabled servers are skipped for env var and binary checks
    assert result.errors == 0


def test_doctor_unreachable_binary():
    cfg = McpoyleConfig(servers=[
        Server(name="s1", command="definitely-not-a-real-binary-xyz123"),
    ])
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    assert result.warnings >= 1
    assert any("not found on $PATH" in c.message for c in result.checks)


def test_doctor_never_synced_client():
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="echo")],
        clients=[ClientAssignment(id="claude-code", last_synced=None)],
    )
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    assert isinstance(result.warnings, int)


def test_doctor_result_to_dict():
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(McpoyleConfig())
    d = result.to_dict()
    assert "errors" in d
    assert "warnings" in d
    assert "checks" in d
    assert "score" in d
    assert "maxScore" in d
    assert "scorePct" in d
    assert "categoryScores" in d
    assert isinstance(d["checks"], list)


# ── Structured scoring ──────────────────────────────────────


def test_doctor_score_all_clean():
    """A clean config should score 100%."""
    cfg = McpoyleConfig()
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    assert result.score_pct == 100  # No checks = 100%


def test_doctor_score_with_errors():
    """Errors should reduce the score."""
    cfg = McpoyleConfig(servers=[
        Server(name="s1", command="echo", env={"KEY": ""}),
    ])
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    assert result.score_pct < 100
    assert result.earned_score < result.max_score


def test_doctor_check_has_structured_fields():
    """Check objects should have id, category, maxPoints, earnedPoints, fix."""
    cfg = McpoyleConfig(servers=[
        Server(name="s1", command="echo", env={"KEY": ""}),
    ])
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    for check in result.checks:
        assert hasattr(check, "id")
        assert hasattr(check, "category")
        assert hasattr(check, "max_points")
        assert hasattr(check, "earned_points")
        assert hasattr(check, "fix")


def test_doctor_category_scores():
    cfg = McpoyleConfig(servers=[
        Server(name="s1", command="echo"),
    ])
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    scores = result.category_scores()
    assert isinstance(scores, dict)
    for cat, (earned, maximum) in scores.items():
        assert earned >= 0
        assert maximum >= earned


# ── Skills health checks ────────────────────────────────────


def test_doctor_skill_missing_dependency():
    """Skills with missing server dependencies should produce a warning."""
    cfg = McpoyleConfig(
        skills=[Skill(name="sk1", enabled=True, dependencies=["missing-server"])],
    )
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    assert any("depends on missing server" in c.message for c in result.checks)


def test_doctor_skill_dependency_satisfied():
    """Skills with satisfied dependencies should pass."""
    cfg = McpoyleConfig(
        servers=[Server(name="github-mcp", command="gh")],
        skills=[Skill(name="sk1", enabled=True, dependencies=["github-mcp"])],
    )
    with patch("mcpoyle.doctor.CLIENTS", {}):
        result = run_doctor(cfg)
    dep_checks = [c for c in result.checks if c.id.startswith("skill-dep-")]
    assert all(c.earned_points > 0 for c in dep_checks)


def test_doctor_skill_broken_symlink(tmp_path, monkeypatch):
    """Broken skill symlinks should produce a warning."""
    from mcpoyle.clients import ClientDef

    # Create a broken symlink
    skills_dir = tmp_path / "skills"
    skills_dir.mkdir()
    broken = skills_dir / "broken-skill"
    broken.symlink_to(tmp_path / "nonexistent")

    fake_client = ClientDef(
        id="test-client", name="Test", config_path=str(tmp_path / "fake.json"),
        servers_key="mcpServers", detect_paths=[str(tmp_path / "fake.json")],
        skills_dir=str(skills_dir),
    )
    # Make it "installed"
    (tmp_path / "fake.json").write_text("{}")

    with patch("mcpoyle.doctor.CLIENTS", {"test-client": fake_client}):
        result = run_doctor(McpoyleConfig())

    assert any("broken skill symlink" in c.message for c in result.checks)


# ── Config round-trip with server_hashes ─────────────────────


def test_client_assignment_hashes_round_trip():
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="echo")],
        clients=[ClientAssignment(
            id="claude-desktop",
            server_hashes={"s1": "abc123"},
        )],
    )
    d = cfg.to_dict()
    cfg2 = McpoyleConfig.from_dict(d)
    assert cfg2.clients[0].server_hashes == {"s1": "abc123"}


def test_client_assignment_no_hashes_defaults_empty():
    """Existing configs without server_hashes should load with empty dict."""
    d = {"id": "claude-desktop", "group": "g1"}
    assignment = ClientAssignment.from_dict(d)
    assert assignment.server_hashes == {}
