"""Tests for config module."""

from mcpoyle.config import Group, McpoyleConfig, ProjectAssignment, Server, ClientAssignment


def test_server_from_dict():
    s = Server.from_dict({"name": "test", "command": "echo", "args": ["hello"], "enabled": True})
    assert s.name == "test"
    assert s.command == "echo"
    assert s.args == ["hello"]


def test_config_round_trip():
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="cmd1"), Server(name="s2", command="cmd2")],
        groups=[Group(name="g1", servers=["s1"])],
        clients=[ClientAssignment(id="claude-desktop", group="g1")],
    )
    d = cfg.to_dict()
    cfg2 = McpoyleConfig.from_dict(d)
    assert len(cfg2.servers) == 2
    assert cfg2.servers[0].name == "s1"
    assert len(cfg2.groups) == 1
    assert cfg2.groups[0].servers == ["s1"]
    assert cfg2.clients[0].group == "g1"


def test_resolve_servers_no_group():
    cfg = McpoyleConfig(
        servers=[
            Server(name="s1", command="cmd1", enabled=True),
            Server(name="s2", command="cmd2", enabled=False),
            Server(name="s3", command="cmd3", enabled=True),
        ],
        clients=[ClientAssignment(id="test-client")],
    )
    resolved = cfg.resolve_servers("test-client")
    assert [s.name for s in resolved] == ["s1", "s3"]


def test_resolve_servers_with_group():
    cfg = McpoyleConfig(
        servers=[
            Server(name="s1", command="cmd1", enabled=True),
            Server(name="s2", command="cmd2", enabled=True),
            Server(name="s3", command="cmd3", enabled=True),
        ],
        groups=[Group(name="g1", servers=["s1", "s3"])],
        clients=[ClientAssignment(id="test-client", group="g1")],
    )
    resolved = cfg.resolve_servers("test-client")
    assert [s.name for s in resolved] == ["s1", "s3"]


def test_resolve_servers_disabled_in_group():
    cfg = McpoyleConfig(
        servers=[
            Server(name="s1", command="cmd1", enabled=True),
            Server(name="s2", command="cmd2", enabled=False),
        ],
        groups=[Group(name="g1", servers=["s1", "s2"])],
        clients=[ClientAssignment(id="test-client", group="g1")],
    )
    resolved = cfg.resolve_servers("test-client")
    assert [s.name for s in resolved] == ["s1"]


def test_get_server():
    cfg = McpoyleConfig(servers=[Server(name="s1", command="cmd1")])
    assert cfg.get_server("s1") is not None
    assert cfg.get_server("missing") is None


def test_project_assignment_round_trip():
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="cmd1")],
        groups=[Group(name="g1", servers=["s1"])],
        clients=[ClientAssignment(
            id="claude-code",
            group=None,
            projects=[ProjectAssignment(path="/Users/test/project", group="g1")],
        )],
    )
    d = cfg.to_dict()
    # Projects should be serialized as dict keyed by path
    assert "/Users/test/project" in d["clients"][0]["projects"]
    assert d["clients"][0]["projects"]["/Users/test/project"]["group"] == "g1"

    # Round-trip
    cfg2 = McpoyleConfig.from_dict(d)
    assert len(cfg2.clients[0].projects) == 1
    assert cfg2.clients[0].projects[0].path == "/Users/test/project"
    assert cfg2.clients[0].projects[0].group == "g1"


def test_resolve_servers_with_explicit_group():
    cfg = McpoyleConfig(
        servers=[
            Server(name="s1", command="cmd1", enabled=True),
            Server(name="s2", command="cmd2", enabled=True),
        ],
        groups=[
            Group(name="g1", servers=["s1"]),
            Group(name="g2", servers=["s2"]),
        ],
        clients=[ClientAssignment(id="claude-code", group="g1")],
    )
    # Client has g1, but explicitly resolve for g2
    resolved = cfg.resolve_servers("claude-code", group_name="g2")
    assert [s.name for s in resolved] == ["s2"]
