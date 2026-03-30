"""Tests for sync and client modules."""

import json

from mcpoyle.clients import (
    CLIENTS,
    MCPOYLE_MARKER,
    get_managed_servers,
    get_unmanaged_servers,
    import_servers_from_client,
    server_to_client_entry,
)
from mcpoyle.config import ClientAssignment, McpoyleConfig, Server, Skill
from mcpoyle.sync import sync_skills


def test_server_to_client_entry():
    s = Server(name="test", command="echo", args=["hello"], env={"KEY": "val"})
    entry = server_to_client_entry(s)
    assert entry[MCPOYLE_MARKER] is True
    assert entry["command"] == "echo"
    assert entry["args"] == ["hello"]
    assert entry["env"] == {"KEY": "val"}
    assert "transport" not in entry  # stdio is default, omitted


def test_server_to_client_entry_non_stdio():
    s = Server(name="test", command="echo", transport="sse")
    entry = server_to_client_entry(s)
    assert entry["transport"] == "sse"


def test_get_managed_servers():
    config = {
        "mcpServers": {
            "managed": {"command": "cmd1", MCPOYLE_MARKER: True},
            "unmanaged": {"command": "cmd2"},
        }
    }
    managed = get_managed_servers(config, "mcpServers")
    assert "managed" in managed
    assert "unmanaged" not in managed


def test_get_unmanaged_servers():
    config = {
        "mcpServers": {
            "managed": {"command": "cmd1", MCPOYLE_MARKER: True},
            "unmanaged": {"command": "cmd2"},
        }
    }
    unmanaged = get_unmanaged_servers(config, "mcpServers")
    assert "unmanaged" in unmanaged
    assert "managed" not in unmanaged


def test_import_servers_from_client():
    config = {
        "mcpServers": {
            "existing": {"command": "cmd1"},
            "managed": {"command": "cmd2", MCPOYLE_MARKER: True},
        }
    }
    servers = import_servers_from_client(config, "mcpServers")
    assert len(servers) == 1
    assert servers[0].name == "existing"
    assert servers[0].command == "cmd1"


def test_write_and_read_round_trip(tmp_path):
    from mcpoyle.clients import write_client_config, read_client_config

    path = tmp_path / "test_config.json"

    # Write an initial config with unmanaged server
    path.write_text(json.dumps({
        "mcpServers": {
            "user-server": {"command": "my-server"}
        }
    }))

    # Sync managed servers
    new_servers = {
        "s1": {"command": "cmd1", MCPOYLE_MARKER: True},
        "s2": {"command": "cmd2", MCPOYLE_MARKER: True},
    }
    write_client_config(path, {}, "mcpServers", new_servers)

    # Read back
    result = read_client_config(path)
    servers = result["mcpServers"]

    # Unmanaged server preserved
    assert "user-server" in servers
    assert MCPOYLE_MARKER not in servers["user-server"]

    # Managed servers written
    assert "s1" in servers
    assert servers["s1"][MCPOYLE_MARKER] is True
    assert "s2" in servers

    # Backup created (one-time .mcpoyle-backup)
    assert path.with_name(path.name + ".mcpoyle-backup").exists()


def test_nested_project_servers(tmp_path):
    """Test reading/writing project-level servers in Claude Code config."""
    from mcpoyle.clients import (
        get_managed_servers_nested,
        get_unmanaged_servers_nested,
        write_servers_nested,
        read_client_config,
    )

    path = tmp_path / "claude.json"
    path.write_text(json.dumps({
        "mcpServers": {"global-server": {"command": "cmd1"}},
        "projects": {
            "/Users/test/myapp": {
                "mcpServers": {
                    "user-server": {"command": "cmd2"},
                }
            }
        }
    }))

    key_path = ["projects", "/Users/test/myapp", "mcpServers"]

    # Write managed servers to project level
    new_servers = {
        "proj-s1": {"command": "cmd3", MCPOYLE_MARKER: True},
    }
    write_servers_nested(path, key_path, new_servers)

    result = read_client_config(path)

    # Global servers untouched
    assert "global-server" in result["mcpServers"]

    # Project-level: unmanaged preserved, managed added
    proj_servers = result["projects"]["/Users/test/myapp"]["mcpServers"]
    assert "user-server" in proj_servers
    assert "proj-s1" in proj_servers
    assert proj_servers["proj-s1"][MCPOYLE_MARKER] is True


def test_import_project_servers():
    from mcpoyle.clients import import_project_servers

    config = {
        "mcpServers": {"global-server": {"command": "cmd1"}},
        "projects": {
            "/Users/test/app1": {
                "mcpServers": {
                    "proj-server-1": {"command": "cmd2", "args": ["--flag"]},
                    "managed": {"command": "cmd3", MCPOYLE_MARKER: True},
                },
            },
            "/Users/test/app2": {
                "mcpServers": {},
            },
            "/Users/test/app3": {
                "mcpServers": {
                    "proj-server-2": {"command": "cmd4"},
                },
            },
        },
    }

    results = import_project_servers(config)
    assert len(results) == 2  # app2 has no servers, skipped

    app1 = next(r for r in results if r.path == "/Users/test/app1")
    assert len(app1.servers) == 1  # managed entry skipped
    assert app1.servers[0].name == "proj-server-1"
    assert app1.servers[0].args == ["--flag"]

    app3 = next(r for r in results if r.path == "/Users/test/app3")
    assert len(app3.servers) == 1
    assert app3.servers[0].name == "proj-server-2"


def test_client_def_skills_dir():
    """Skills-capable clients have skills_dir set."""
    assert CLIENTS["claude-code"].skills_dir == "~/.claude/skills"
    assert CLIENTS["cursor"].skills_dir == "~/.cursor/skills"
    assert CLIENTS["codex-cli"].skills_dir == "~/.codex/skills"
    assert CLIENTS["windsurf"].skills_dir == "~/.windsurf/skills"
    assert CLIENTS["opencode"].skills_dir == "~/.opencode/skills"
    assert CLIENTS["amp"].skills_dir == "~/.ampcode/skills"
    # Non-skills clients have empty skills_dir
    assert CLIENTS["claude-desktop"].skills_dir == ""


def test_sync_skills_creates_symlinks(tmp_path, monkeypatch):
    """Skills should be symlinked from canonical store to client skills dir."""
    canonical = tmp_path / "canonical"
    client_dir = tmp_path / "client_skills"

    # Write a skill to canonical store
    (canonical / "my-skill").mkdir(parents=True)
    (canonical / "my-skill" / "SKILL.md").write_text("---\nname: my-skill\n---\n\nContent")

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", canonical)

    # Patch the client def to use tmp_path
    from unittest.mock import patch
    from mcpoyle.clients import ClientDef
    fake_client = ClientDef(
        id="test-client", name="Test", config_path="", servers_key="",
        skills_dir=str(client_dir),
    )
    with patch.dict("mcpoyle.sync.CLIENTS", {"test-client": fake_client}):
        cfg = McpoyleConfig(
            skills=[Skill(name="my-skill", enabled=True)],
            clients=[ClientAssignment(id="test-client")],
        )
        result = sync_skills(cfg, "test-client")

    assert result.created == 1
    target = client_dir / "my-skill"
    assert target.exists()
    assert target.is_symlink()
    assert (target / "SKILL.md").exists()


def test_sync_skills_removes_untracked(tmp_path, monkeypatch):
    """Skills removed from config should be cleaned up in client dir."""
    canonical = tmp_path / "canonical"
    client_dir = tmp_path / "client_skills"

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", canonical)

    # Pre-create a managed symlink that's no longer wanted
    client_dir.mkdir(parents=True)
    old_skill = client_dir / "old-skill"
    old_skill.mkdir()
    (old_skill / ".mcpoyle-managed").write_text("managed by mcpoyle\n")

    from unittest.mock import patch
    from mcpoyle.clients import ClientDef
    fake_client = ClientDef(
        id="test-client", name="Test", config_path="", servers_key="",
        skills_dir=str(client_dir),
    )
    with patch.dict("mcpoyle.sync.CLIENTS", {"test-client": fake_client}):
        cfg = McpoyleConfig(
            skills=[],  # No skills desired
            clients=[ClientAssignment(id="test-client")],
        )
        result = sync_skills(cfg, "test-client")

    assert result.removed == 1
    assert not (client_dir / "old-skill").exists()


def test_sync_skills_copy_fallback(tmp_path, monkeypatch):
    """If symlink fails, should fall back to copy."""
    canonical = tmp_path / "canonical"
    client_dir = tmp_path / "client_skills"

    (canonical / "copy-skill").mkdir(parents=True)
    (canonical / "copy-skill" / "SKILL.md").write_text("---\nname: copy-skill\n---\n\nContent")

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", canonical)

    from unittest.mock import patch
    from mcpoyle.clients import ClientDef
    import os

    fake_client = ClientDef(
        id="test-client", name="Test", config_path="", servers_key="",
        skills_dir=str(client_dir),
    )

    # Make symlink fail
    original_symlink = os.symlink
    def failing_symlink(src, dst, *args, **kwargs):
        raise OSError("Symlinks not supported")

    with patch.dict("mcpoyle.sync.CLIENTS", {"test-client": fake_client}):
        with patch("pathlib.Path.symlink_to", side_effect=OSError("Symlinks not supported")):
            cfg = McpoyleConfig(
                skills=[Skill(name="copy-skill", enabled=True)],
                clients=[ClientAssignment(id="test-client")],
            )
            result = sync_skills(cfg, "test-client")

    target = client_dir / "copy-skill"
    assert target.exists()
    assert not target.is_symlink()  # Should be a copy, not symlink
    assert (target / "SKILL.md").exists()
    assert (target / ".mcpoyle-managed").exists()


def test_sync_skills_dry_run(tmp_path, monkeypatch):
    """Dry run should not create files."""
    canonical = tmp_path / "canonical"
    client_dir = tmp_path / "client_skills"

    (canonical / "dry-skill").mkdir(parents=True)
    (canonical / "dry-skill" / "SKILL.md").write_text("---\nname: dry-skill\n---\n\nContent")

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", canonical)

    from unittest.mock import patch
    from mcpoyle.clients import ClientDef
    fake_client = ClientDef(
        id="test-client", name="Test", config_path="", servers_key="",
        skills_dir=str(client_dir),
    )
    with patch.dict("mcpoyle.sync.CLIENTS", {"test-client": fake_client}):
        cfg = McpoyleConfig(
            skills=[Skill(name="dry-skill", enabled=True)],
            clients=[ClientAssignment(id="test-client")],
        )
        result = sync_skills(cfg, "test-client", dry_run=True)

    assert result.created == 1
    assert not client_dir.exists()  # Nothing written


def test_sync_skills_no_skills_dir():
    """Clients without skills_dir should get a clear message."""
    cfg = McpoyleConfig()
    result = sync_skills(cfg, "claude-desktop")
    assert "no skills directory" in result.actions[0]


def test_sync_skills_backup_manifest(tmp_path, monkeypatch):
    """Sync should write a backup manifest before modifying."""
    canonical = tmp_path / "canonical"
    client_dir = tmp_path / "client_skills"

    (canonical / "new-skill").mkdir(parents=True)
    (canonical / "new-skill" / "SKILL.md").write_text("---\nname: new-skill\n---\n\nContent")

    # Pre-existing managed skill
    client_dir.mkdir(parents=True)
    old = client_dir / "existing"
    old.mkdir()
    (old / ".mcpoyle-managed").write_text("managed by mcpoyle\n")

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", canonical)

    from unittest.mock import patch
    from mcpoyle.clients import ClientDef
    fake_client = ClientDef(
        id="test-client", name="Test", config_path="", servers_key="",
        skills_dir=str(client_dir),
    )
    with patch.dict("mcpoyle.sync.CLIENTS", {"test-client": fake_client}):
        cfg = McpoyleConfig(
            skills=[Skill(name="new-skill", enabled=True)],
            clients=[ClientAssignment(id="test-client")],
        )
        sync_skills(cfg, "test-client")

    manifest = client_dir / ".mcpoyle-backup-manifest"
    assert manifest.exists()
    assert "existing" in manifest.read_text()
