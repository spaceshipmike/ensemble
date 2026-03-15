"""Project registry reader — reads the project-registry SQLite DB for project-aware scoping.

The registry DB at ~/.local/share/project-registry/registry.db is optional.
All functions return empty results when the DB is absent or inaccessible.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

REGISTRY_DB_PATH = Path.home() / ".local" / "share" / "project-registry" / "registry.db"


@dataclass
class RegistryProject:
    """A project from the project registry."""
    name: str
    display_name: str
    type: str  # "project" or "area_of_focus"
    status: str  # "active", "archived", etc.
    paths: list[str] = field(default_factory=list)
    fields: dict[str, str] = field(default_factory=dict)


def is_available() -> bool:
    """Check if the project registry database exists."""
    return REGISTRY_DB_PATH.exists()


def _connect() -> sqlite3.Connection | None:
    """Open a read-only connection to the registry DB."""
    if not REGISTRY_DB_PATH.exists():
        return None
    try:
        conn = sqlite3.connect(f"file:{REGISTRY_DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error:
        return None


def list_projects(status_filter: str = "active") -> list[RegistryProject]:
    """List projects from the registry, optionally filtered by status."""
    conn = _connect()
    if not conn:
        return []

    try:
        cursor = conn.execute(
            "SELECT id, name, display_name, type, status FROM projects WHERE status = ?",
            (status_filter,),
        )
        projects_by_id: dict[int, RegistryProject] = {}
        for row in cursor:
            projects_by_id[row["id"]] = RegistryProject(
                name=row["name"],
                display_name=row["display_name"] or row["name"],
                type=row["type"],
                status=row["status"],
            )

        if not projects_by_id:
            return list(projects_by_id.values())

        # Fetch paths
        placeholders = ",".join("?" * len(projects_by_id))
        ids = list(projects_by_id.keys())
        for row in conn.execute(
            f"SELECT project_id, path FROM project_paths WHERE project_id IN ({placeholders})",
            ids,
        ):
            if row["project_id"] in projects_by_id:
                projects_by_id[row["project_id"]].paths.append(row["path"])

        # Fetch fields
        for row in conn.execute(
            f"SELECT project_id, field_name, field_value FROM project_fields WHERE project_id IN ({placeholders})",
            ids,
        ):
            if row["project_id"] in projects_by_id:
                projects_by_id[row["project_id"]].fields[row["field_name"]] = row["field_value"]

        return list(projects_by_id.values())
    except sqlite3.Error:
        return []
    finally:
        conn.close()


def get_project(name: str) -> RegistryProject | None:
    """Get a single project by name."""
    conn = _connect()
    if not conn:
        return None

    try:
        row = conn.execute(
            "SELECT id, name, display_name, type, status FROM projects WHERE name = ?",
            (name,),
        ).fetchone()
        if not row:
            return None

        project = RegistryProject(
            name=row["name"],
            display_name=row["display_name"] or row["name"],
            type=row["type"],
            status=row["status"],
        )

        for path_row in conn.execute(
            "SELECT path FROM project_paths WHERE project_id = ?",
            (row["id"],),
        ):
            project.paths.append(path_row["path"])

        for field_row in conn.execute(
            "SELECT field_name, field_value FROM project_fields WHERE project_id = ?",
            (row["id"],),
        ):
            project.fields[field_row["field_name"]] = field_row["field_value"]

        return project
    except sqlite3.Error:
        return None
    finally:
        conn.close()


def resolve_project_path(name: str) -> str | None:
    """Resolve a project name to its primary code path (prefers ~/Code/ paths)."""
    project = get_project(name)
    if not project or not project.paths:
        return None

    # Prefer paths under ~/Code/ (execution surface)
    code_paths = [p for p in project.paths if "/Code/" in p]
    if code_paths:
        return code_paths[0]
    return project.paths[0]
