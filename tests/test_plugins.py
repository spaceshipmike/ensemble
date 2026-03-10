"""Tests for plugin and marketplace data model and operations."""

from __future__ import annotations

import json
from pathlib import Path

from mcpoyle.config import (
    Group,
    Marketplace,
    MarketplaceSource,
    McpoyleConfig,
    Plugin,
    Server,
    Settings,
)
from mcpoyle.clients import (
    get_enabled_plugins,
    get_extra_marketplaces,
    set_enabled_plugins,
    set_extra_marketplaces,
)


def test_plugin_from_dict():
    p = Plugin.from_dict({"name": "clangd-lsp", "marketplace": "official", "enabled": True, "managed": True})
    assert p.name == "clangd-lsp"
    assert p.marketplace == "official"
    assert p.enabled is True
    assert p.managed is True


def test_plugin_qualified_name():
    p = Plugin(name="clangd-lsp", marketplace="claude-plugins-official")
    assert p.qualified_name == "clangd-lsp@claude-plugins-official"

    p2 = Plugin(name="standalone", marketplace="")
    assert p2.qualified_name == "standalone"


def test_marketplace_from_dict():
    m = Marketplace.from_dict({
        "name": "homelab",
        "source": {"source": "directory", "path": "/local/dir"},
    })
    assert m.name == "homelab"
    assert m.source.source == "directory"
    assert m.source.path == "/local/dir"


def test_marketplace_github_source():
    m = Marketplace.from_dict({
        "name": "my-plugins",
        "source": {"source": "github", "repo": "myorg/claude-plugins"},
    })
    assert m.source.source == "github"
    assert m.source.repo == "myorg/claude-plugins"


def test_marketplace_reserved_names():
    assert "claude-plugins-official" in Marketplace.RESERVED_NAMES
    assert "anthropic-marketplace" in Marketplace.RESERVED_NAMES
    assert "my-marketplace" not in Marketplace.RESERVED_NAMES


def test_settings_defaults():
    s = Settings.from_dict({})
    assert s.adopt_unmanaged_plugins is False

    s2 = Settings.from_dict({"adopt_unmanaged_plugins": True})
    assert s2.adopt_unmanaged_plugins is True


def test_config_with_plugins_round_trip():
    cfg = McpoyleConfig(
        servers=[Server(name="ctx", command="npx")],
        groups=[Group(name="dev", servers=["ctx"], plugins=["clangd-lsp"])],
        plugins=[Plugin(name="clangd-lsp", marketplace="official", enabled=True, managed=True)],
        marketplaces=[Marketplace(name="homelab", source=MarketplaceSource(source="directory", path="/local"))],
        settings=Settings(adopt_unmanaged_plugins=True),
    )
    d = cfg.to_dict()
    cfg2 = McpoyleConfig.from_dict(d)

    assert len(cfg2.plugins) == 1
    assert cfg2.plugins[0].name == "clangd-lsp"
    assert cfg2.plugins[0].marketplace == "official"
    assert len(cfg2.marketplaces) == 1
    assert cfg2.marketplaces[0].name == "homelab"
    assert cfg2.marketplaces[0].source.path == "/local"
    assert cfg2.settings.adopt_unmanaged_plugins is True
    assert cfg2.groups[0].plugins == ["clangd-lsp"]


def test_config_without_plugins_loads():
    """Config files without plugin/marketplace fields load with defaults."""
    d = {
        "servers": [{"name": "ctx", "command": "npx"}],
        "groups": [{"name": "dev", "servers": ["ctx"]}],
        "clients": [],
    }
    cfg = McpoyleConfig.from_dict(d)
    assert cfg.plugins == []
    assert cfg.marketplaces == []
    assert cfg.settings.adopt_unmanaged_plugins is False
    assert cfg.groups[0].plugins == []


def test_get_plugin():
    cfg = McpoyleConfig(
        plugins=[
            Plugin(name="clangd-lsp", marketplace="official"),
            Plugin(name="ts-lsp", marketplace="official"),
        ]
    )
    assert cfg.get_plugin("clangd-lsp") is not None
    assert cfg.get_plugin("clangd-lsp@official") is not None
    assert cfg.get_plugin("nonexistent") is None


def test_get_marketplace():
    cfg = McpoyleConfig(
        marketplaces=[Marketplace(name="homelab", source=MarketplaceSource(source="directory", path="/x"))]
    )
    assert cfg.get_marketplace("homelab") is not None
    assert cfg.get_marketplace("nonexistent") is None


def test_resolve_plugins_no_group():
    cfg = McpoyleConfig(
        plugins=[
            Plugin(name="a", marketplace="m", enabled=True),
            Plugin(name="b", marketplace="m", enabled=False),
        ]
    )
    resolved = cfg.resolve_plugins("claude-code")
    assert len(resolved) == 1
    assert resolved[0].name == "a"


def test_resolve_plugins_with_group():
    from mcpoyle.config import ClientAssignment
    cfg = McpoyleConfig(
        plugins=[
            Plugin(name="a", marketplace="m", enabled=True),
            Plugin(name="b", marketplace="m", enabled=True),
        ],
        groups=[Group(name="minimal", plugins=["a"])],
        clients=[ClientAssignment(id="claude-code", group="minimal")],
    )
    resolved = cfg.resolve_plugins("claude-code")
    assert len(resolved) == 1
    assert resolved[0].name == "a"


def test_group_with_plugins():
    g = Group.from_dict({"name": "dev", "servers": ["ctx"], "plugins": ["clangd-lsp"]})
    assert g.plugins == ["clangd-lsp"]
    assert g.servers == ["ctx"]


def test_enabled_plugins_helpers():
    settings = {}
    assert get_enabled_plugins(settings) == {}

    set_enabled_plugins(settings, {"clangd-lsp@official": True})
    assert settings["enabledPlugins"] == {"clangd-lsp@official": True}
    assert get_enabled_plugins(settings) == {"clangd-lsp@official": True}


def test_extra_marketplaces_helpers():
    settings = {}
    assert get_extra_marketplaces(settings) == {}

    set_extra_marketplaces(settings, {"homelab": {"source": {"source": "directory", "path": "/x"}}})
    assert "homelab" in settings["extraKnownMarketplaces"]
    assert get_extra_marketplaces(settings)["homelab"]["source"]["source"] == "directory"
