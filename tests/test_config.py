"""Tests for config module."""

from mcpoyle.config import Group, McpoyleConfig, ProjectAssignment, Server, ServerOrigin, Skill, ClientAssignment


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


def test_skill_from_dict():
    s = Skill.from_dict({
        "name": "git-workflow",
        "enabled": True,
        "description": "Git best practices",
        "path": "/home/user/.config/mcpoyle/skills/git-workflow/SKILL.md",
        "origin": "manual",
        "dependencies": ["github-mcp"],
        "tags": ["git", "workflow"],
        "mode": "pin",
    })
    assert s.name == "git-workflow"
    assert s.enabled is True
    assert s.dependencies == ["github-mcp"]
    assert s.tags == ["git", "workflow"]
    assert s.mode == "pin"


def test_skill_defaults():
    s = Skill(name="minimal")
    assert s.enabled is True
    assert s.origin == ""
    assert s.dependencies == []
    assert s.tags == []
    assert s.mode == "pin"


def test_config_round_trip_with_skills():
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="cmd1")],
        groups=[Group(name="g1", servers=["s1"], skills=["sk1"])],
        skills=[Skill(name="sk1", description="A skill", origin="manual", tags=["test"])],
    )
    d = cfg.to_dict()
    cfg2 = McpoyleConfig.from_dict(d)
    assert len(cfg2.skills) == 1
    assert cfg2.skills[0].name == "sk1"
    assert cfg2.skills[0].description == "A skill"
    assert cfg2.skills[0].tags == ["test"]
    # Group includes skills
    assert cfg2.groups[0].skills == ["sk1"]


def test_group_with_skills():
    g = Group.from_dict({
        "name": "full-group",
        "servers": ["s1"],
        "plugins": ["p1"],
        "skills": ["sk1", "sk2"],
    })
    assert g.skills == ["sk1", "sk2"]


def test_resolve_skills_no_group():
    cfg = McpoyleConfig(
        skills=[
            Skill(name="sk1", enabled=True),
            Skill(name="sk2", enabled=False),
            Skill(name="sk3", enabled=True),
        ],
        clients=[ClientAssignment(id="test-client")],
    )
    resolved = cfg.resolve_skills("test-client")
    assert [s.name for s in resolved] == ["sk1", "sk3"]


def test_resolve_skills_with_group():
    cfg = McpoyleConfig(
        skills=[
            Skill(name="sk1", enabled=True),
            Skill(name="sk2", enabled=True),
        ],
        groups=[Group(name="g1", skills=["sk1"])],
        clients=[ClientAssignment(id="test-client", group="g1")],
    )
    resolved = cfg.resolve_skills("test-client")
    assert [s.name for s in resolved] == ["sk1"]


def test_server_origin_trust_tier():
    o = ServerOrigin.from_dict({"source": "registry", "trust_tier": "official"})
    assert o.trust_tier == "official"

    o2 = ServerOrigin.from_dict({"source": "manual"})
    assert o2.trust_tier == "local"  # default


def test_get_skill():
    cfg = McpoyleConfig(skills=[Skill(name="sk1")])
    assert cfg.get_skill("sk1") is not None
    assert cfg.get_skill("missing") is None
