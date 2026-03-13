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
)
from mcpoyle.operations import (
    AssignResult,
    GroupResult,
    ImportPluginsResult,
    OpResult,
    PluginResult,
    ScopeResult,
    ServerResult,
    add_plugin_to_group,
    add_rule,
    add_server,
    add_server_to_group,
    assign_client,
    create_group,
    delete_group,
    disable_plugin,
    disable_server,
    enable_plugin,
    enable_server,
    import_plugins,
    install_plugin,
    remove_marketplace,
    remove_plugin_from_group,
    remove_rule,
    remove_server,
    remove_server_from_group,
    scope_item,
    unassign_client,
    uninstall_plugin,
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
