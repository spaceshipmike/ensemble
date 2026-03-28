"""Tests for spec v0.14.0 features: server model expansion, TOML, registry adapters, search, cost."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path
from unittest.mock import patch

import pytest

from mcpoyle.config import (
    McpoyleConfig,
    Server,
    ServerOrigin,
    Settings,
    ToolInfo,
)


# ── Server Model Expansion ─────────────────────────────────────


class TestServerModel:
    """Tests for expanded Server dataclass fields."""

    def test_server_http_fields_default_empty(self):
        s = Server(name="test")
        assert s.url == ""
        assert s.auth_type == ""
        assert s.auth_ref == ""

    def test_server_origin_default_empty(self):
        s = Server(name="test")
        assert s.origin.source == ""
        assert s.origin.client == ""
        assert s.origin.registry_id == ""

    def test_server_tools_default_empty(self):
        s = Server(name="test")
        assert s.tools == []

    def test_server_from_dict_with_new_fields(self):
        d = {
            "name": "http-server",
            "transport": "http",
            "url": "http://localhost:8080",
            "auth_type": "bearer",
            "auth_ref": "op://vault/token",
            "origin": {"source": "registry", "registry_id": "test-server", "timestamp": "2026-01-01"},
            "tools": [
                {"name": "read", "description": "Read files"},
                {"name": "write"},
            ],
        }
        s = Server.from_dict(d)
        assert s.url == "http://localhost:8080"
        assert s.auth_type == "bearer"
        assert s.auth_ref == "op://vault/token"
        assert s.origin.source == "registry"
        assert s.origin.registry_id == "test-server"
        assert len(s.tools) == 2
        assert s.tools[0].name == "read"
        assert s.tools[0].description == "Read files"
        assert s.tools[1].name == "write"
        assert s.tools[1].description == ""

    def test_server_from_dict_backward_compatible(self):
        """Old configs without new fields should deserialize cleanly."""
        d = {"name": "old", "command": "npx", "args": ["-y", "foo"], "enabled": True}
        s = Server.from_dict(d)
        assert s.name == "old"
        assert s.url == ""
        assert s.tools == []
        assert s.origin.source == ""

    def test_server_roundtrip_via_config(self):
        """Verify Server survives McpoyleConfig.to_dict() -> from_dict()."""
        server = Server(
            name="roundtrip",
            transport="sse",
            url="http://example.com/sse",
            auth_type="api-key",
            auth_ref="op://vault/key",
            origin=ServerOrigin(source="registry", registry_id="test-id"),
            tools=[ToolInfo(name="tool1", description="A tool")],
        )
        cfg = McpoyleConfig(servers=[server])
        d = cfg.to_dict()
        cfg2 = McpoyleConfig.from_dict(d)
        s = cfg2.servers[0]
        assert s.url == "http://example.com/sse"
        assert s.auth_type == "api-key"
        assert s.origin.source == "registry"
        assert len(s.tools) == 1
        assert s.tools[0].name == "tool1"

    def test_origin_from_dict_handles_none(self):
        o = ServerOrigin.from_dict(None)
        assert o.source == ""

    def test_origin_from_dict_handles_empty(self):
        o = ServerOrigin.from_dict({})
        assert o.source == ""


# ── Server to Client Entry (HTTP transport) ────────────────────


class TestServerToClientEntry:
    def test_http_entry_has_url(self):
        from mcpoyle.clients import server_to_client_entry
        s = Server(name="test", transport="http", url="http://localhost:8080")
        entry = server_to_client_entry(s)
        assert entry["url"] == "http://localhost:8080"
        assert entry["transport"] == "http"
        assert "command" not in entry

    def test_http_entry_with_auth(self):
        from mcpoyle.clients import server_to_client_entry
        s = Server(name="test", transport="sse", url="http://localhost:8080",
                    auth_type="bearer", auth_ref="op://vault/token")
        entry = server_to_client_entry(s)
        assert entry["auth"] == {"type": "bearer", "ref": "op://vault/token"}

    def test_stdio_entry_unchanged(self):
        from mcpoyle.clients import server_to_client_entry
        s = Server(name="test", command="npx", args=["-y", "foo"])
        entry = server_to_client_entry(s)
        assert entry["command"] == "npx"
        assert entry["args"] == ["-y", "foo"]
        assert "url" not in entry

    def test_sse_entry_without_url_falls_to_stdio(self):
        """SSE transport without URL should use stdio-style entry."""
        from mcpoyle.clients import server_to_client_entry
        s = Server(name="test", transport="sse", command="npx", args=["-y", "foo"])
        entry = server_to_client_entry(s)
        assert entry["command"] == "npx"


# ── TOML Support ──────────────────────────────────────────────


class TestTOML:
    def test_dict_to_toml_simple(self):
        from mcpoyle.clients import dict_to_toml
        data = {"key": "value", "number": 42, "flag": True}
        result = dict_to_toml(data)
        parsed = tomllib.loads(result)
        assert parsed["key"] == "value"
        assert parsed["number"] == 42
        assert parsed["flag"] is True

    def test_dict_to_toml_nested(self):
        from mcpoyle.clients import dict_to_toml
        data = {
            "servers": {
                "my-server": {
                    "command": "npx",
                    "args": ["-y", "foo"],
                }
            }
        }
        result = dict_to_toml(data)
        parsed = tomllib.loads(result)
        assert parsed["servers"]["my-server"]["command"] == "npx"
        assert parsed["servers"]["my-server"]["args"] == ["-y", "foo"]

    def test_dict_to_toml_roundtrip_with_mcpoyle_marker(self):
        from mcpoyle.clients import dict_to_toml
        data = {
            "mcp_servers": {
                "test": {
                    "__mcpoyle": True,
                    "command": "uvx",
                    "args": ["test-server"],
                }
            }
        }
        result = dict_to_toml(data)
        parsed = tomllib.loads(result)
        assert parsed["mcp_servers"]["test"]["__mcpoyle"] is True
        assert parsed["mcp_servers"]["test"]["command"] == "uvx"

    def test_read_toml_config(self, tmp_path):
        from mcpoyle.clients import read_toml_config
        toml_file = tmp_path / "config.toml"
        toml_file.write_text('[mcp_servers.test]\ncommand = "npx"\n')
        result = read_toml_config(toml_file)
        assert result["mcp_servers"]["test"]["command"] == "npx"

    def test_read_toml_config_missing(self, tmp_path):
        from mcpoyle.clients import read_toml_config
        result = read_toml_config(tmp_path / "nonexistent.toml")
        assert result == {}

    def test_mcpx_client_exists(self):
        from mcpoyle.clients import CLIENTS
        assert "mcpx" in CLIENTS
        assert CLIENTS["mcpx"].config_format == "toml"
        assert CLIENTS["mcpx"].servers_key == "servers"

    def test_codex_cli_has_toml_format(self):
        from mcpoyle.clients import CLIENTS
        assert CLIENTS["codex-cli"].config_format == "toml"

    def test_write_client_config_toml(self, tmp_path):
        from mcpoyle.clients import write_client_config, MCPOYLE_MARKER
        config_path = tmp_path / "config.toml"
        config = {}
        new_servers = {"test": {MCPOYLE_MARKER: True, "command": "npx", "args": ["-y", "foo"]}}
        write_client_config(config_path, config, "servers", new_servers)
        assert config_path.exists()
        parsed = tomllib.loads(config_path.read_text())
        assert parsed["servers"]["test"]["command"] == "npx"


# ── Registry Adapter Pattern ──────────────────────────────────


class TestRegistryAdapters:
    def test_adapters_satisfy_protocol(self):
        from mcpoyle.registry import OfficialRegistryAdapter, GlamaRegistryAdapter, RegistryAdapter
        assert isinstance(OfficialRegistryAdapter(), RegistryAdapter)
        assert isinstance(GlamaRegistryAdapter(), RegistryAdapter)

    def test_adapter_names(self):
        from mcpoyle.registry import OfficialRegistryAdapter, GlamaRegistryAdapter
        assert OfficialRegistryAdapter().name == "official"
        assert GlamaRegistryAdapter().name == "glama"

    def test_adapter_base_urls(self):
        from mcpoyle.registry import OfficialRegistryAdapter, GlamaRegistryAdapter
        assert "modelcontextprotocol" in OfficialRegistryAdapter().base_url
        assert "glama" in GlamaRegistryAdapter().base_url

    def test_get_adapters_returns_both(self):
        from mcpoyle.registry import get_adapters
        adapters = get_adapters()
        names = [a.name for a in adapters]
        assert "official" in names
        assert "glama" in names


# ── Registry Cache ────────────────────────────────────────────


class TestRegistryCache:
    def test_cache_write_and_read(self, tmp_path):
        from mcpoyle.registry import _write_cache, _read_cache, CACHE_DIR
        with patch("mcpoyle.registry.CACHE_DIR", tmp_path):
            _write_cache("test_key.json", {"hello": "world"})
            result = _read_cache("test_key.json", ttl=3600)
            assert result == {"hello": "world"}

    def test_cache_expired(self, tmp_path):
        from mcpoyle.registry import _write_cache, _read_cache
        import time
        with patch("mcpoyle.registry.CACHE_DIR", tmp_path):
            _write_cache("test_key.json", {"hello": "world"})
            # Read with 0 TTL — should be expired immediately
            result = _read_cache("test_key.json", ttl=0)
            assert result is None

    def test_cache_missing_file(self, tmp_path):
        from mcpoyle.registry import _read_cache
        with patch("mcpoyle.registry.CACHE_DIR", tmp_path):
            result = _read_cache("nonexistent.json")
            assert result is None

    def test_clear_cache(self, tmp_path):
        from mcpoyle.registry import _write_cache, clear_cache
        with patch("mcpoyle.registry.CACHE_DIR", tmp_path):
            _write_cache("a.json", "data1")
            _write_cache("b.json", "data2")
            count = clear_cache()
            assert count == 2
            assert not list(tmp_path.glob("*.json"))


# ── Search ────────────────────────────────────────────────────


class TestSearch:
    def _make_config(self) -> McpoyleConfig:
        return McpoyleConfig(servers=[
            Server(name="github", command="npx", tools=[
                ToolInfo(name="create_issue", description="Create a GitHub issue"),
                ToolInfo(name="list_repos", description="List repositories"),
            ]),
            Server(name="filesystem", command="npx", tools=[
                ToolInfo(name="read_file", description="Read file contents"),
                ToolInfo(name="write_file", description="Write to a file"),
            ]),
            Server(name="slack", command="uvx", tools=[
                ToolInfo(name="send_message", description="Send a Slack message"),
            ]),
        ])

    def test_search_by_name(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "github")
        assert len(results) > 0
        assert results[0].server_name == "github"

    def test_search_by_tool_name(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "read_file")
        assert len(results) > 0
        assert results[0].server_name == "filesystem"

    def test_search_by_description(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "slack message")
        assert len(results) > 0
        assert results[0].server_name == "slack"

    def test_search_no_results(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "zzzznonexistent")
        assert results == []

    def test_search_empty_query(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "")
        assert results == []

    def test_search_empty_config(self):
        from mcpoyle.search import search_servers
        results = search_servers(McpoyleConfig(), "test")
        assert results == []

    def test_search_result_has_matched_fields(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "github")
        assert "name" in results[0].matched_fields

    def test_search_result_has_matched_tools(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "create issue")
        # Should match github server via tool description
        github_results = [r for r in results if r.server_name == "github"]
        assert len(github_results) > 0
        assert "tools" in github_results[0].matched_fields

    def test_search_limit(self):
        from mcpoyle.search import search_servers
        results = search_servers(self._make_config(), "file", limit=1)
        assert len(results) <= 1


# ── Context Cost Awareness ────────────────────────────────────


class TestContextCost:
    def test_cost_summary_no_tools(self):
        from mcpoyle.sync import _context_cost_summary
        servers = [Server(name="test", command="npx")]
        result = _context_cost_summary(servers, Settings())
        assert result == []  # No tools → no summary

    def test_cost_summary_with_tools(self):
        from mcpoyle.sync import _context_cost_summary
        servers = [
            Server(name="test", command="npx", tools=[
                ToolInfo(name="read", description="Read"),
                ToolInfo(name="write", description="Write"),
            ]),
        ]
        result = _context_cost_summary(servers, Settings())
        assert any("2 tools" in a for a in result)

    def test_cost_warning_threshold(self):
        from mcpoyle.sync import _context_cost_summary
        tools = [ToolInfo(name=f"tool{i}", description=f"Tool {i}") for i in range(60)]
        servers = [Server(name="big", command="npx", tools=tools)]
        result = _context_cost_summary(servers, Settings(sync_cost_warning_threshold=50))
        assert any("exceeds warning threshold" in a for a in result)

    def test_cost_below_threshold(self):
        from mcpoyle.sync import _context_cost_summary
        tools = [ToolInfo(name=f"tool{i}", description=f"Tool {i}") for i in range(5)]
        servers = [Server(name="small", command="npx", tools=tools)]
        result = _context_cost_summary(servers, Settings(sync_cost_warning_threshold=50))
        assert not any("exceeds" in a for a in result)


# ── Settings ──────────────────────────────────────────────────


class TestSettings:
    def test_settings_defaults(self):
        s = Settings()
        assert s.registry_cache_ttl == 3600
        assert s.sync_cost_warning_threshold == 50

    def test_settings_from_dict(self):
        s = Settings.from_dict({"registry_cache_ttl": 7200, "sync_cost_warning_threshold": 100})
        assert s.registry_cache_ttl == 7200
        assert s.sync_cost_warning_threshold == 100


# ── Doctor Enhancements ───────────────────────────────────────


class TestDoctorEnhancements:
    def test_missing_tool_metadata_check(self):
        from mcpoyle.doctor import run_doctor
        cfg = McpoyleConfig(servers=[
            Server(name="no-tools", command="npx", enabled=True),
            Server(name="has-tools", command="npx", enabled=True, tools=[ToolInfo(name="t1")]),
        ])
        result = run_doctor(cfg)
        info_checks = [c for c in result.checks if c.severity == "info" and "no tool metadata" in c.message]
        assert len(info_checks) == 1
        assert "no-tools" in info_checks[0].message

    def test_missing_tool_metadata_not_for_disabled(self):
        from mcpoyle.doctor import run_doctor
        cfg = McpoyleConfig(servers=[
            Server(name="disabled-no-tools", command="npx", enabled=False),
        ])
        result = run_doctor(cfg)
        info_checks = [c for c in result.checks if c.severity == "info" and "no tool metadata" in c.message]
        assert len(info_checks) == 0
