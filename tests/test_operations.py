"""Tests for the operations layer."""

from unittest.mock import patch

from mcpoyle.config import (
    ClientAssignment,
    Group,
    Marketplace,
    MarketplaceSource,
    McpoyleConfig,
    Plugin,
    Server,
    Skill,
)
from mcpoyle.operations import (
    AssignResult,
    CollisionInfo,
    GroupResult,
    ImportPluginsResult,
    OpResult,
    PluginResult,
    ScopeResult,
    ServerResult,
    SkillDependencyInfo,
    SkillResult,
    add_plugin_to_group,
    add_rule,
    add_server,
    add_server_to_group,
    add_skill_to_group,
    assign_client,
    check_skill_dependencies,
    create_group,
    delete_group,
    detect_collisions,
    disable_plugin,
    disable_server,
    disable_skill,
    enable_plugin,
    enable_server,
    enable_skill,
    export_group_as_plugin,
    import_plugins,
    install_plugin,
    install_skill,
    pin_item,
    remove_marketplace,
    remove_plugin_from_group,
    remove_rule,
    remove_server,
    remove_server_from_group,
    remove_skill_from_group,
    scope_item,
    set_trust_tier,
    track_item,
    unassign_client,
    uninstall_plugin,
    uninstall_skill,
)


# ── Server operations ───────────────────────────────────────────


def test_add_server():
    cfg = McpoyleConfig()
    result = add_server(cfg, "test", "echo", ["hello"])
    assert result.ok
    assert result.server is not None
    assert result.server.name == "test"
    assert len(cfg.servers) == 1


def test_add_server_duplicate():
    cfg = McpoyleConfig(servers=[Server(name="test", command="echo")])
    result = add_server(cfg, "test", "echo")
    assert not result.ok
    assert "already exists" in result.error


def test_remove_server():
    cfg = McpoyleConfig(
        servers=[Server(name="test", command="echo")],
        groups=[Group(name="g1", servers=["test"])],
    )
    result = remove_server(cfg, "test")
    assert result.ok
    assert len(cfg.servers) == 0
    assert "test" not in cfg.groups[0].servers


def test_remove_server_not_found():
    cfg = McpoyleConfig()
    result = remove_server(cfg, "missing")
    assert not result.ok


def test_enable_disable_server():
    cfg = McpoyleConfig(servers=[Server(name="test", command="echo", enabled=False)])
    result = enable_server(cfg, "test")
    assert result.ok
    assert cfg.servers[0].enabled is True

    result = disable_server(cfg, "test")
    assert result.ok
    assert cfg.servers[0].enabled is False


# ── Group operations ────────────────────────────────────────────


def test_create_group():
    cfg = McpoyleConfig()
    result = create_group(cfg, "dev-tools", "Dev servers")
    assert result.ok
    assert len(cfg.groups) == 1
    assert cfg.groups[0].description == "Dev servers"


def test_create_group_duplicate():
    cfg = McpoyleConfig(groups=[Group(name="dev")])
    result = create_group(cfg, "dev")
    assert not result.ok


def test_delete_group_clears_assignments():
    cfg = McpoyleConfig(
        groups=[Group(name="dev")],
        clients=[ClientAssignment(id="claude-code", group="dev")],
    )
    result = delete_group(cfg, "dev")
    assert result.ok
    assert cfg.clients[0].group is None


def test_add_remove_server_from_group():
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="cmd")],
        groups=[Group(name="g1")],
    )
    result = add_server_to_group(cfg, "g1", "s1")
    assert result.ok
    assert "s1" in cfg.groups[0].servers

    result = remove_server_from_group(cfg, "g1", "s1")
    assert result.ok
    assert "s1" not in cfg.groups[0].servers


def test_add_remove_plugin_from_group():
    cfg = McpoyleConfig(
        plugins=[Plugin(name="p1", marketplace="mkt")],
        groups=[Group(name="g1")],
    )
    result = add_plugin_to_group(cfg, "g1", "p1")
    assert result.ok
    assert "p1" in cfg.groups[0].plugins

    result = remove_plugin_from_group(cfg, "g1", "p1")
    assert result.ok
    assert "p1" not in cfg.groups[0].plugins


# ── Assignment operations ───────────────────────────────────────


def test_assign_client():
    cfg = McpoyleConfig(groups=[Group(name="dev")])
    result = assign_client(cfg, "claude-code", "dev")
    assert result.ok
    assert cfg.get_client("claude-code").group == "dev"


def test_assign_client_unknown():
    cfg = McpoyleConfig()
    result = assign_client(cfg, "nonexistent", "dev")
    assert not result.ok
    assert "Unknown client" in result.error


def test_assign_client_all():
    cfg = McpoyleConfig(
        clients=[ClientAssignment(id="claude-code", group="dev")],
    )
    result = assign_client(cfg, "claude-code", None, assign_all=True)
    assert result.ok
    assert cfg.get_client("claude-code").group is None


def test_unassign_client():
    cfg = McpoyleConfig(
        clients=[ClientAssignment(id="claude-code", group="dev")],
    )
    result = unassign_client(cfg, "claude-code")
    assert result.ok
    assert cfg.get_client("claude-code").group is None


# ── Plugin operations ───────────────────────────────────────────


@patch("mcpoyle.operations.read_cc_settings", return_value={})
@patch("mcpoyle.operations.write_cc_settings")
def test_install_plugin(mock_write, mock_read):
    cfg = McpoyleConfig(
        marketplaces=[Marketplace(name="test-mkt", source=MarketplaceSource(source="directory", path="/tmp"))],
    )
    result = install_plugin(cfg, "test-plugin", "test-mkt")
    assert result.ok
    assert result.plugin.name == "test-plugin"
    assert result.plugin.marketplace == "test-mkt"
    assert len(cfg.plugins) == 1
    mock_write.assert_called_once()


@patch("mcpoyle.operations.read_cc_settings", return_value={})
@patch("mcpoyle.operations.write_cc_settings")
def test_install_plugin_duplicate(mock_write, mock_read):
    cfg = McpoyleConfig(plugins=[Plugin(name="test-plugin", marketplace="mkt")])
    result = install_plugin(cfg, "test-plugin")
    assert not result.ok
    assert "already installed" in result.error


@patch("mcpoyle.operations.read_cc_settings", return_value={"enabledPlugins": {"p1@mkt": True}})
@patch("mcpoyle.operations.write_cc_settings")
def test_uninstall_plugin(mock_write, mock_read):
    cfg = McpoyleConfig(
        plugins=[Plugin(name="p1", marketplace="mkt")],
        groups=[Group(name="g1", plugins=["p1"])],
    )
    result = uninstall_plugin(cfg, "p1")
    assert result.ok
    assert len(cfg.plugins) == 0
    assert "p1" not in cfg.groups[0].plugins


@patch("mcpoyle.operations.read_cc_settings", return_value={})
@patch("mcpoyle.operations.write_cc_settings")
def test_enable_disable_plugin(mock_write, mock_read):
    cfg = McpoyleConfig(plugins=[Plugin(name="p1", marketplace="mkt", enabled=False)])
    result = enable_plugin(cfg, "p1")
    assert result.ok
    assert cfg.plugins[0].enabled is True

    result = disable_plugin(cfg, "p1")
    assert result.ok
    assert cfg.plugins[0].enabled is False


@patch("mcpoyle.operations.read_cc_settings", return_value={
    "enabledPlugins": {"p1@mkt1": True, "p2@mkt2": False}
})
def test_import_plugins(mock_read):
    cfg = McpoyleConfig(plugins=[Plugin(name="p1", marketplace="mkt1")])
    result = import_plugins(cfg)
    assert result.ok
    assert len(result.imported) == 1
    assert result.imported[0].name == "p2"
    assert len(cfg.plugins) == 2


# ── Scope operation ─────────────────────────────────────────────


def test_scope_item_creates_groups():
    cfg = McpoyleConfig(
        servers=[Server(name="ctx", command="npx", enabled=True)],
        plugins=[Plugin(name="p1", marketplace="mkt", enabled=True)],
    )
    result = scope_item(cfg, "ctx", "/tmp/test-project")
    assert result.ok
    assert result.item_type == "server"
    # Should have created a global group and a project group
    assert len(cfg.groups) == 2
    # ctx should be in project group, not global group
    global_g = cfg.get_group("claude-code-global")
    assert global_g is not None
    assert "ctx" not in global_g.servers


def test_scope_item_not_found():
    cfg = McpoyleConfig()
    result = scope_item(cfg, "missing", "/tmp/test")
    assert not result.ok


# ── Rules operations ────────────────────────────────────────────


def test_add_remove_rule():
    cfg = McpoyleConfig(groups=[Group(name="dev")])
    result = add_rule(cfg, "/tmp/projects", "dev")
    assert result.ok
    assert len(cfg.rules) == 1

    result = remove_rule(cfg, "/tmp/projects")
    assert result.ok
    assert len(cfg.rules) == 0


def test_add_rule_group_not_found():
    cfg = McpoyleConfig()
    result = add_rule(cfg, "/tmp/projects", "missing")
    assert not result.ok


# ── Marketplace operations ──────────────────────────────────────


@patch("mcpoyle.operations.read_cc_settings", return_value={})
@patch("mcpoyle.operations.write_cc_settings")
def test_remove_marketplace(mock_write, mock_read):
    cfg = McpoyleConfig(
        marketplaces=[Marketplace(name="test", source=MarketplaceSource(source="directory", path="/tmp"))],
    )
    result = remove_marketplace(cfg, "test")
    assert result.ok
    assert len(cfg.marketplaces) == 0


# ── Result types ────────────────────────────────────────────────


def test_op_result_defaults():
    r = OpResult()
    assert r.ok is True
    assert r.error == ""
    assert r.messages == []


def test_op_result_failure():
    r = OpResult(ok=False, error="Something broke")
    assert not r.ok
    assert r.error == "Something broke"


# ── Skill operations ───────────────────────────────────────────


def test_install_skill(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    cfg = McpoyleConfig()
    result = install_skill(cfg, "test-skill", description="A test", tags=["test"])
    assert result.ok
    assert result.skill is not None
    assert result.skill.name == "test-skill"
    assert len(cfg.skills) == 1
    # File should exist
    assert (tmp_path / "skills" / "test-skill" / "SKILL.md").exists()


def test_install_skill_duplicate(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    cfg = McpoyleConfig(skills=[Skill(name="existing")])
    result = install_skill(cfg, "existing")
    assert not result.ok


def test_uninstall_skill(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    cfg = McpoyleConfig(
        skills=[Skill(name="to-remove")],
        groups=[Group(name="g1", skills=["to-remove"])],
    )
    # Create the skill file
    (tmp_path / "skills" / "to-remove").mkdir(parents=True)
    (tmp_path / "skills" / "to-remove" / "SKILL.md").write_text("test")

    result = uninstall_skill(cfg, "to-remove")
    assert result.ok
    assert len(cfg.skills) == 0
    assert "to-remove" not in cfg.groups[0].skills


def test_enable_disable_skill():
    cfg = McpoyleConfig(skills=[Skill(name="s1")])
    result = disable_skill(cfg, "s1")
    assert result.ok
    assert not cfg.skills[0].enabled

    result = enable_skill(cfg, "s1")
    assert result.ok
    assert cfg.skills[0].enabled


def test_skill_group_operations():
    cfg = McpoyleConfig(
        skills=[Skill(name="sk1")],
        groups=[Group(name="g1")],
    )
    result = add_skill_to_group(cfg, "g1", "sk1")
    assert result.ok
    assert "sk1" in cfg.groups[0].skills

    # Duplicate add
    result = add_skill_to_group(cfg, "g1", "sk1")
    assert result.ok  # Already in group, message but no error

    result = remove_skill_from_group(cfg, "g1", "sk1")
    assert result.ok
    assert "sk1" not in cfg.groups[0].skills


def test_skill_group_not_found():
    cfg = McpoyleConfig(skills=[Skill(name="sk1")])
    result = add_skill_to_group(cfg, "missing", "sk1")
    assert not result.ok


def test_skill_not_found_for_group():
    cfg = McpoyleConfig(groups=[Group(name="g1")])
    result = add_skill_to_group(cfg, "g1", "missing")
    assert not result.ok


# ── Trust tier + provenance operations ─────────────────────────


def test_set_trust_tier():
    from mcpoyle.config import ServerOrigin
    cfg = McpoyleConfig(servers=[Server(name="s1", command="cmd", origin=ServerOrigin(source="registry"))])
    result = set_trust_tier(cfg, "s1", "official")
    assert result.ok
    assert cfg.servers[0].origin.trust_tier == "official"


def test_set_trust_tier_invalid():
    cfg = McpoyleConfig(servers=[Server(name="s1", command="cmd")])
    result = set_trust_tier(cfg, "s1", "bogus")
    assert not result.ok


def test_set_trust_tier_not_found():
    cfg = McpoyleConfig()
    result = set_trust_tier(cfg, "missing", "official")
    assert not result.ok


def test_pin_skill():
    cfg = McpoyleConfig(skills=[Skill(name="sk1", mode="track")])
    result = pin_item(cfg, "sk1")
    assert result.ok
    assert cfg.skills[0].mode == "pin"


def test_track_skill():
    cfg = McpoyleConfig(skills=[Skill(name="sk1", mode="pin")])
    result = track_item(cfg, "sk1")
    assert result.ok
    assert cfg.skills[0].mode == "track"


def test_pin_server():
    from mcpoyle.config import ServerOrigin
    cfg = McpoyleConfig(servers=[Server(name="s1", command="cmd", origin=ServerOrigin(source="registry"))])
    result = pin_item(cfg, "s1")
    assert result.ok


def test_track_server_no_registry_id():
    from mcpoyle.config import ServerOrigin
    cfg = McpoyleConfig(servers=[Server(name="s1", command="cmd", origin=ServerOrigin(source="manual"))])
    result = track_item(cfg, "s1")
    assert not result.ok  # No registry_id


def test_track_server_with_registry_id():
    from mcpoyle.config import ServerOrigin
    cfg = McpoyleConfig(servers=[Server(name="s1", command="cmd", origin=ServerOrigin(source="registry", registry_id="@org/server"))])
    result = track_item(cfg, "s1")
    assert result.ok


def test_pin_track_not_found():
    cfg = McpoyleConfig()
    assert not pin_item(cfg, "missing").ok
    assert not track_item(cfg, "missing").ok


# ── Collision detection ────────────────────────────────────────


def test_detect_collisions_found():
    from mcpoyle.config import ProjectAssignment
    cfg = McpoyleConfig(
        servers=[Server(name="ctx", command="cmd")],
        groups=[
            Group(name="global", servers=["ctx"]),
            Group(name="proj", servers=["ctx"]),
        ],
        clients=[ClientAssignment(
            id="claude-code", group="global",
            projects=[ProjectAssignment(path="/tmp/proj", group="proj")],
        )],
    )
    collisions = detect_collisions(cfg)
    assert len(collisions) == 1
    assert collisions[0].item_name == "ctx"
    assert collisions[0].item_type == "server"


def test_detect_collisions_none():
    from mcpoyle.config import ProjectAssignment
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="cmd"), Server(name="s2", command="cmd")],
        groups=[
            Group(name="global", servers=["s1"]),
            Group(name="proj", servers=["s2"]),
        ],
        clients=[ClientAssignment(
            id="claude-code", group="global",
            projects=[ProjectAssignment(path="/tmp/proj", group="proj")],
        )],
    )
    collisions = detect_collisions(cfg)
    assert len(collisions) == 0


def test_detect_collisions_skill():
    from mcpoyle.config import ProjectAssignment
    cfg = McpoyleConfig(
        skills=[Skill(name="sk1")],
        groups=[
            Group(name="global", skills=["sk1"]),
            Group(name="proj", skills=["sk1"]),
        ],
        clients=[ClientAssignment(
            id="claude-code", group="global",
            projects=[ProjectAssignment(path="/tmp/proj", group="proj")],
        )],
    )
    collisions = detect_collisions(cfg)
    assert len(collisions) == 1
    assert collisions[0].item_type == "skill"


# ── Dependency intelligence ────────────────────────────────────


def test_check_skill_dependencies():
    cfg = McpoyleConfig(
        servers=[Server(name="github-mcp", command="gh")],
        skills=[
            Skill(name="sk1", dependencies=["github-mcp", "missing-server"]),
            Skill(name="sk2", dependencies=[]),
        ],
    )
    results = check_skill_dependencies(cfg)
    assert len(results) == 1  # sk2 has no deps, so not reported
    info = results[0]
    assert info.skill_name == "sk1"
    assert "github-mcp" in info.satisfied
    assert "missing-server" in info.missing


def test_check_skill_dependencies_disabled():
    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="cmd", enabled=False)],
        skills=[Skill(name="sk1", dependencies=["s1"])],
    )
    results = check_skill_dependencies(cfg)
    assert len(results) == 1
    assert "s1" in results[0].disabled


# ── Profile-as-plugin export ──────────────────────────────────


def test_export_group_as_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    # Create a skill in the canonical store
    (tmp_path / "skills" / "sk1").mkdir(parents=True)
    (tmp_path / "skills" / "sk1" / "SKILL.md").write_text("---\nname: sk1\n---\n\nContent")

    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="echo", args=["hello"])],
        skills=[Skill(name="sk1")],
        groups=[Group(name="dev", description="Dev tools", servers=["s1"], skills=["sk1"])],
    )
    output_dir = str(tmp_path / "output")
    result = export_group_as_plugin(cfg, "dev", output_dir)
    assert result.ok

    import json
    manifest = json.loads((tmp_path / "output" / "plugin.json").read_text())
    assert manifest["name"] == "dev"
    assert "s1" in manifest["servers"]
    assert manifest["servers"]["s1"]["command"] == "echo"
    assert "sk1" in manifest["skills"]
    # Skill should be copied
    assert (tmp_path / "output" / "skills" / "sk1" / "SKILL.md").exists()


def test_export_group_not_found():
    cfg = McpoyleConfig()
    result = export_group_as_plugin(cfg, "missing")
    assert not result.ok
