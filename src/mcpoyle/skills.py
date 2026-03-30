"""Skill store — read/write SKILL.md files with minimal frontmatter parser."""

from __future__ import annotations

from pathlib import Path

from mcpoyle.config import SKILLS_DIR, Skill


def _skill_dir(name: str) -> Path:
    """Return the canonical directory for a skill."""
    return SKILLS_DIR / name


def skill_md_path(name: str) -> Path:
    """Return the path to a skill's SKILL.md file."""
    return _skill_dir(name) / "SKILL.md"


# ── Minimal frontmatter parser (no PyYAML) ─────────────────────


def parse_frontmatter(text: str) -> tuple[dict[str, str | list[str]], str]:
    """Parse YAML-like frontmatter delimited by --- lines.

    Returns (metadata_dict, body_text). Supports:
      - key: value (string)
      - key: [item1, item2] (inline list)
      - key: true/false (kept as string)

    Does NOT support nested structures, multi-line values, or full YAML.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, text

    # Find closing ---
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        return {}, text

    meta: dict[str, str | list[str]] = {}
    for line in lines[1:end_idx]:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()

        # Parse inline list: [item1, item2, item3]
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1]
            items = [item.strip().strip("'\"") for item in inner.split(",") if item.strip()]
            meta[key] = items
        else:
            # Strip quotes if present
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            meta[key] = val

    body = "\n".join(lines[end_idx + 1:]).strip()
    return meta, body


def format_frontmatter(meta: dict[str, str | list[str]], body: str) -> str:
    """Format metadata and body into a SKILL.md string with frontmatter."""
    lines = ["---"]
    for key, val in meta.items():
        if isinstance(val, list):
            items = ", ".join(val)
            lines.append(f"{key}: [{items}]")
        else:
            lines.append(f"{key}: {val}")
    lines.append("---")
    lines.append("")
    if body:
        lines.append(body)
    return "\n".join(lines) + "\n"


def skill_to_frontmatter(skill: Skill, body: str = "") -> str:
    """Convert a Skill to SKILL.md content."""
    meta: dict[str, str | list[str]] = {
        "name": skill.name,
        "enabled": "true" if skill.enabled else "false",
    }
    if skill.description:
        meta["description"] = skill.description
    if skill.origin:
        meta["origin"] = skill.origin
    if skill.dependencies:
        meta["dependencies"] = skill.dependencies
    if skill.tags:
        meta["tags"] = skill.tags
    if skill.mode and skill.mode != "pin":
        meta["mode"] = skill.mode
    return format_frontmatter(meta, body)


def frontmatter_to_skill(text: str, name_override: str = "") -> tuple[Skill, str]:
    """Parse SKILL.md content into a Skill and body text."""
    meta, body = parse_frontmatter(text)
    name = name_override or str(meta.get("name", ""))
    enabled_val = str(meta.get("enabled", "true")).lower()
    enabled = enabled_val not in ("false", "0", "no")
    deps = meta.get("dependencies", [])
    if isinstance(deps, str):
        deps = [d.strip() for d in deps.split(",") if d.strip()]
    tags = meta.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    skill = Skill(
        name=name,
        enabled=enabled,
        description=str(meta.get("description", "")),
        origin=str(meta.get("origin", "")),
        dependencies=deps,
        tags=tags,
        mode=str(meta.get("mode", "pin")),
    )
    return skill, body


# ── Store operations ───────────────────────────────────────────


def read_skill_md(name: str) -> tuple[Skill, str] | None:
    """Read a skill from the canonical store. Returns (Skill, body) or None."""
    path = skill_md_path(name)
    if not path.exists():
        return None
    text = path.read_text()
    skill, body = frontmatter_to_skill(text, name_override=name)
    skill.path = str(path)
    return skill, body


def write_skill_md(skill: Skill, body: str = "") -> Path:
    """Write a skill to the canonical store. Returns the SKILL.md path."""
    path = skill_md_path(skill.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = skill_to_frontmatter(skill, body)
    path.write_text(content)
    skill.path = str(path)
    return path


def delete_skill_md(name: str) -> bool:
    """Remove a skill's directory from the canonical store."""
    import shutil
    skill_dir = _skill_dir(name)
    if skill_dir.exists():
        shutil.rmtree(skill_dir)
        return True
    return False


def list_skill_dirs() -> list[str]:
    """List all skill names in the canonical store."""
    if not SKILLS_DIR.exists():
        return []
    return sorted(
        d.name for d in SKILLS_DIR.iterdir()
        if d.is_dir() and (d / "SKILL.md").exists()
    )
