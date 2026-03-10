"""Tests for sync and client modules."""

import json

from mcpoyle.clients import (
    MCPOYLE_MARKER,
    get_managed_servers,
    get_unmanaged_servers,
    import_servers_from_client,
    server_to_client_entry,
)
from mcpoyle.config import Server


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

    # Backup created
    assert path.with_suffix(".json.bak").exists()


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
