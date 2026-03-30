"""Tests for skills module — SKILL.md I/O and frontmatter parsing."""

from pathlib import Path

from mcpoyle.config import Skill
from mcpoyle.skills import (
    delete_skill_md,
    format_frontmatter,
    frontmatter_to_skill,
    list_skill_dirs,
    parse_frontmatter,
    read_skill_md,
    skill_to_frontmatter,
    write_skill_md,
)


def test_parse_frontmatter_basic():
    text = "---\nname: test-skill\ndescription: A test\n---\n\nBody content here."
    meta, body = parse_frontmatter(text)
    assert meta["name"] == "test-skill"
    assert meta["description"] == "A test"
    assert body == "Body content here."


def test_parse_frontmatter_lists():
    text = "---\ntags: [git, workflow, automation]\ndependencies: [server-a, server-b]\n---\n\nBody"
    meta, body = parse_frontmatter(text)
    assert meta["tags"] == ["git", "workflow", "automation"]
    assert meta["dependencies"] == ["server-a", "server-b"]


def test_parse_frontmatter_no_frontmatter():
    text = "Just a plain document"
    meta, body = parse_frontmatter(text)
    assert meta == {}
    assert body == "Just a plain document"


def test_parse_frontmatter_empty_list():
    text = "---\ntags: []\n---\n\nBody"
    meta, body = parse_frontmatter(text)
    assert meta["tags"] == []


def test_parse_frontmatter_quoted_values():
    text = '---\nname: "my skill"\ndescription: \'quoted desc\'\n---\n\nBody'
    meta, body = parse_frontmatter(text)
    assert meta["name"] == "my skill"
    assert meta["description"] == "quoted desc"


def test_format_frontmatter():
    meta = {"name": "test", "tags": ["a", "b"]}
    result = format_frontmatter(meta, "Some body text")
    assert result.startswith("---\n")
    assert "name: test" in result
    assert "tags: [a, b]" in result
    assert "Some body text" in result


def test_skill_to_frontmatter_round_trip():
    skill = Skill(
        name="git-workflow",
        enabled=True,
        description="Git best practices",
        origin="manual",
        dependencies=["github-mcp"],
        tags=["git", "workflow"],
        mode="pin",
    )
    content = skill_to_frontmatter(skill, "# Git Workflow\n\nUse conventional commits.")
    skill2, body = frontmatter_to_skill(content)
    assert skill2.name == "git-workflow"
    assert skill2.enabled is True
    assert skill2.description == "Git best practices"
    assert skill2.dependencies == ["github-mcp"]
    assert skill2.tags == ["git", "workflow"]
    assert skill2.mode == "pin"
    assert "conventional commits" in body


def test_frontmatter_to_skill_disabled():
    text = "---\nname: disabled-skill\nenabled: false\n---\n\nBody"
    skill, body = frontmatter_to_skill(text)
    assert skill.name == "disabled-skill"
    assert skill.enabled is False


def test_frontmatter_to_skill_name_override():
    text = "---\nname: original\n---\n\nBody"
    skill, body = frontmatter_to_skill(text, name_override="override")
    assert skill.name == "override"


def test_write_read_skill_md(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    skill = Skill(
        name="test-skill",
        description="A test skill",
        origin="manual",
        tags=["test"],
    )
    path = write_skill_md(skill, "# Test\n\nInstructions here.")
    assert path.exists()
    assert path.name == "SKILL.md"

    result = read_skill_md("test-skill")
    assert result is not None
    read_skill, body = result
    assert read_skill.name == "test-skill"
    assert read_skill.description == "A test skill"
    assert "Instructions here" in body
    assert read_skill.path == str(path)


def test_read_skill_md_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    assert read_skill_md("nonexistent") is None


def test_delete_skill_md(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    skill = Skill(name="to-delete")
    write_skill_md(skill, "temp")
    assert delete_skill_md("to-delete") is True
    assert read_skill_md("to-delete") is None
    assert delete_skill_md("to-delete") is False


def test_list_skill_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    write_skill_md(Skill(name="alpha"), "a")
    write_skill_md(Skill(name="beta"), "b")
    names = list_skill_dirs()
    assert names == ["alpha", "beta"]


def test_list_skill_dirs_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    assert list_skill_dirs() == []


def test_frontmatter_to_skill_track_mode():
    text = "---\nname: tracked\nmode: track\n---\n\nBody"
    skill, body = frontmatter_to_skill(text)
    assert skill.mode == "track"


def test_skill_to_frontmatter_omits_defaults():
    """Pin mode should be omitted from frontmatter since it's the default."""
    skill = Skill(name="minimal", mode="pin")
    content = skill_to_frontmatter(skill)
    assert "mode:" not in content


def test_skill_to_frontmatter_includes_track_mode():
    """Track mode should be explicitly written."""
    skill = Skill(name="tracked", mode="track")
    content = skill_to_frontmatter(skill)
    assert "mode: track" in content
