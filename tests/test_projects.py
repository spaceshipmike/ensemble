"""Tests for the project registry reader."""

import sqlite3
from pathlib import Path

from mcpoyle.projects import (
    RegistryProject,
    get_project,
    is_available,
    list_projects,
    resolve_project_path,
)


def _create_test_db(tmp_path: Path) -> Path:
    """Create a test registry database with sample data."""
    db_path = tmp_path / "registry.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL DEFAULT '',
            type TEXT NOT NULL CHECK (type IN ('project', 'area_of_focus')),
            status TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            goals TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE project_paths (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            path TEXT NOT NULL,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            added_by TEXT NOT NULL DEFAULT 'system',
            UNIQUE(project_id, path)
        );
        CREATE TABLE project_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            field_name TEXT NOT NULL,
            field_value TEXT NOT NULL,
            producer TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(project_id, field_name)
        );

        INSERT INTO projects (name, display_name, type, status) VALUES
            ('chorus', 'Chorus App', 'project', 'active'),
            ('mcpoyle', 'McPoyle', 'project', 'active'),
            ('old-project', 'Old Project', 'project', 'archived');

        INSERT INTO project_paths (project_id, path) VALUES
            (1, '/Users/mike/Code/chorus'),
            (1, '/Users/mike/Projects/chorus'),
            (2, '/Users/mike/Code/mcpoyle');

        INSERT INTO project_fields (project_id, field_name, field_value, producer) VALUES
            (1, 'tech_stack', 'Swift, SwiftUI', 'scanner'),
            (2, 'tech_stack', 'Python, Click, Textual', 'scanner');
    """)
    conn.close()
    return db_path


def test_list_projects(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)

    projects = list_projects()
    assert len(projects) == 2  # only active, not archived
    names = {p.name for p in projects}
    assert "chorus" in names
    assert "mcpoyle" in names
    assert "old-project" not in names


def test_list_projects_with_paths(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)

    projects = list_projects()
    chorus = next(p for p in projects if p.name == "chorus")
    assert len(chorus.paths) == 2
    assert "/Users/mike/Code/chorus" in chorus.paths


def test_list_projects_with_fields(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)

    projects = list_projects()
    mcpoyle = next(p for p in projects if p.name == "mcpoyle")
    assert mcpoyle.fields.get("tech_stack") == "Python, Click, Textual"


def test_get_project(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)

    project = get_project("chorus")
    assert project is not None
    assert project.display_name == "Chorus App"
    assert len(project.paths) == 2


def test_get_project_not_found(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)

    assert get_project("nonexistent") is None


def test_resolve_project_path_prefers_code(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)

    path = resolve_project_path("chorus")
    assert path == "/Users/mike/Code/chorus"


def test_resolve_project_path_not_found(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)

    assert resolve_project_path("nonexistent") is None


def test_is_available_true(tmp_path, monkeypatch):
    db_path = _create_test_db(tmp_path)
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", db_path)
    assert is_available() is True


def test_is_available_false(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", tmp_path / "nonexistent.db")
    assert is_available() is False


def test_graceful_fallback_no_db(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.projects.REGISTRY_DB_PATH", tmp_path / "nonexistent.db")
    assert list_projects() == []
    assert get_project("anything") is None
    assert resolve_project_path("anything") is None
