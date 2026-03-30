"""Tests for the registry module."""

from unittest.mock import patch, MagicMock

import httpx

from mcpoyle.registry import (
    EnvVarSpec,
    ParsedSource,
    RegistryServer,
    ServerDetail,
    get_glama,
    get_official,
    get_server,
    parse_source,
    search_glama,
    search_official,
    search_registries,
    translate_to_server_config,
)


def _mock_response(json_data, status_code=200):
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.raise_for_status.return_value = None
    if status_code >= 400:
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=resp,
        )
    return resp


# ── search_official ─────────────────────────────────────────────


@patch("mcpoyle.registry.httpx.get")
def test_search_official(mock_get):
    mock_get.return_value = _mock_response({
        "servers": [
            {
                "name": "filesystem",
                "description": "A filesystem MCP server",
                "packages": [{"transport": {"type": "stdio"}}],
            },
            {
                "name": "brave-search",
                "description": "Brave search API",
                "packages": [{"transport": {"type": "stdio"}}],
            },
        ]
    })
    results = search_official("file")
    assert len(results) == 2
    assert results[0].name == "filesystem"
    assert results[0].source == "official"


@patch("mcpoyle.registry.httpx.get")
def test_search_official_error(mock_get):
    mock_get.side_effect = httpx.ConnectError("timeout")
    results = search_official("test")
    assert results == []


# ── search_glama ────────────────────────────────────────────────


@patch("mcpoyle.registry.httpx.get")
def test_search_glama(mock_get):
    mock_get.return_value = _mock_response({
        "data": {
            "servers": {
                "edges": [
                    {"node": {"name": "postgres", "namespace": "glama", "description": "PostgreSQL server"}},
                    {"node": {"name": "slack", "namespace": "glama", "description": "Slack integration"}},
                ]
            }
        }
    })
    results = search_glama("database")
    assert len(results) == 2
    assert results[0].name == "glama/postgres"
    assert results[0].source == "glama"


@patch("mcpoyle.registry.httpx.get")
def test_search_glama_error(mock_get):
    mock_get.side_effect = httpx.ConnectError("timeout")
    results = search_glama("test")
    assert results == []


# ── search_registries (unified) ─────────────────────────────────


@patch("mcpoyle.registry.search_glama")
@patch("mcpoyle.registry.search_official")
def test_search_registries_deduplicates(mock_official, mock_glama):
    mock_official.return_value = [
        RegistryServer(name="filesystem", description="Official", source="official", qualified_id="filesystem"),
    ]
    mock_glama.return_value = [
        RegistryServer(name="glama/filesystem", description="Glama", source="glama", qualified_id="glama/filesystem"),
        RegistryServer(name="glama/slack", description="Slack", source="glama", qualified_id="glama/slack"),
    ]
    results = search_registries("file")
    # "filesystem" from official and "glama/filesystem" should deduplicate (same base name)
    names = [r.name for r in results]
    assert "filesystem" in names
    assert "glama/slack" in names
    # Should not have both filesystem entries
    filesystem_count = sum(1 for r in results if "filesystem" in r.name.lower())
    assert filesystem_count == 1


# ── get_official ────────────────────────────────────────────────


@patch("mcpoyle.registry.httpx.get")
def test_get_official(mock_get):
    mock_get.return_value = _mock_response({
        "servers": [{
            "name": "filesystem",
            "description": "A filesystem server",
            "packages": [{
                "registryType": "npm",
                "identifier": "@modelcontextprotocol/server-filesystem",
                "transport": {"type": "stdio"},
                "environmentVariables": [
                    {"name": "ROOT_DIR", "description": "Root directory", "required": True},
                ],
            }],
        }]
    })
    detail = get_official("filesystem")
    assert detail is not None
    assert detail.name == "filesystem"
    assert detail.registry_type == "npm"
    assert detail.package_identifier == "@modelcontextprotocol/server-filesystem"
    assert len(detail.env_vars) == 1
    assert detail.env_vars[0].name == "ROOT_DIR"


@patch("mcpoyle.registry.httpx.get")
def test_get_official_not_found(mock_get):
    mock_get.return_value = _mock_response({"servers": []})
    assert get_official("nonexistent") is None


# ── get_glama ───────────────────────────────────────────────────


@patch("mcpoyle.registry.httpx.get")
def test_get_glama(mock_get):
    mock_get.return_value = _mock_response({
        "name": "postgres",
        "namespace": "glama",
        "description": "PostgreSQL MCP server",
        "url": "https://github.com/example/postgres-mcp",
        "environmentVariablesJsonSchema": {
            "properties": {
                "DATABASE_URL": {"description": "Connection string"},
                "POOL_SIZE": {"description": "Connection pool size"},
            },
            "required": ["DATABASE_URL"],
        },
        "tools": [
            {"name": "query"},
            {"name": "list_tables"},
        ],
    })
    detail = get_glama("glama/postgres")
    assert detail is not None
    assert detail.name == "glama/postgres"
    assert len(detail.env_vars) == 2
    assert detail.env_vars[0].name == "DATABASE_URL"
    assert detail.env_vars[0].required is True
    assert detail.env_vars[1].required is False
    assert len(detail.tools) == 2


# ── get_server (unified) ───────────────────────────────────────


@patch("mcpoyle.registry.get_glama")
@patch("mcpoyle.registry.get_official")
def test_get_server_tries_both(mock_official, mock_glama):
    mock_official.return_value = None
    mock_glama.return_value = ServerDetail(name="test", description="Test", source="glama")
    result = get_server("test")
    assert result is not None
    assert result.source == "glama"


@patch("mcpoyle.registry.get_official")
def test_get_server_with_source(mock_official):
    mock_official.return_value = ServerDetail(name="test", description="Test", source="official")
    result = get_server("test", source="official")
    assert result is not None
    assert result.source == "official"


# ── translate_to_server_config ──────────────────────────────────


def test_translate_npm():
    detail = ServerDetail(
        name="@org/mcp-server-filesystem",
        description="FS server",
        source="official",
        registry_type="npm",
        package_identifier="@org/mcp-server-filesystem",
    )
    config = translate_to_server_config(detail)
    assert config["command"] == "npx"
    assert config["args"] == ["-y", "@org/mcp-server-filesystem"]
    assert config["name"] == "filesystem"  # prefix stripped


def test_translate_pypi():
    detail = ServerDetail(
        name="mcp-server-sqlite",
        description="SQLite server",
        source="official",
        registry_type="pypi",
        package_identifier="mcp-server-sqlite",
    )
    config = translate_to_server_config(detail)
    assert config["command"] == "uvx"
    assert config["args"] == ["mcp-server-sqlite"]
    assert config["name"] == "sqlite"  # prefix stripped


def test_translate_no_package():
    detail = ServerDetail(
        name="some-server",
        description="No package",
        source="glama",
    )
    config = translate_to_server_config(detail)
    assert config["command"] == ""
    assert config["args"] == []


# ── Quality signals ────────────────────────────────────────────


def test_registry_server_quality_signals():
    s = RegistryServer(
        name="test", description="desc", source="official",
        stars=42, last_updated="2025-01-01", has_readme=True, installs=1000,
    )
    assert s.stars == 42
    assert s.installs == 1000
    assert s.has_readme is True


def test_server_detail_quality_signals():
    d = ServerDetail(
        name="test", description="desc", source="official",
        stars=10, last_updated="2025-06-15", has_readme=True, installs=500,
    )
    assert d.stars == 10
    assert d.installs == 500


# ── Security summary ───────────────────────────────────────────


def test_security_summary_clean():
    d = ServerDetail(name="test", description="desc", source="official")
    sec = d.security_summary
    assert sec["risk_flags"] == []
    assert sec["command"] == "(unknown)"


def test_security_summary_with_secrets():
    d = ServerDetail(
        name="test", description="desc", source="official",
        env_vars=[EnvVarSpec(name="API_TOKEN", required=True)],
        package_identifier="@test/server",
    )
    sec = d.security_summary
    assert "requires-secrets" in sec["risk_flags"]
    assert sec["command"] == "@test/server"


def test_security_summary_network_transport():
    d = ServerDetail(
        name="test", description="desc", source="official",
        transport="sse",
    )
    sec = d.security_summary
    assert "network-transport" in sec["risk_flags"]


def test_security_summary_many_tools():
    d = ServerDetail(
        name="test", description="desc", source="official",
        tools=[f"tool-{i}" for i in range(25)],
    )
    sec = d.security_summary
    assert "many-tools" in sec["risk_flags"]


# ── Unified source parser ─────────────────────────────────────


def test_parse_source_npm():
    r = parse_source("npm:@modelcontextprotocol/server-filesystem")
    assert r.type == "npm"
    assert r.identifier == "@modelcontextprotocol/server-filesystem"
    assert "filesystem" in r.name


def test_parse_source_pypi():
    r = parse_source("pip:mcp-server-git")
    assert r.type == "pypi"
    assert r.identifier == "mcp-server-git"


def test_parse_source_github():
    r = parse_source("github:owner/repo")
    assert r.type == "github"
    assert r.identifier == "owner/repo"


def test_parse_source_github_inferred():
    r = parse_source("owner/some-repo")
    assert r.type == "github"
    assert r.identifier == "owner/some-repo"


def test_parse_source_url():
    r = parse_source("https://example.com/mcp-server")
    assert r.type == "url"


def test_parse_source_path():
    r = parse_source("/usr/local/bin/my-server")
    assert r.type == "path"


def test_parse_source_path_relative():
    r = parse_source("./my-server")
    assert r.type == "path"


def test_parse_source_path_tilde():
    r = parse_source("~/bin/server")
    assert r.type == "path"


def test_parse_source_scoped_npm():
    r = parse_source("@scope/package-name")
    assert r.type == "registry"
    assert r.identifier == "@scope/package-name"


def test_parse_source_plain_name():
    r = parse_source("some-server")
    assert r.type == "registry"
    assert r.identifier == "some-server"


def test_parse_source_name_cleaning():
    r = parse_source("npm:mcp-server-filesystem")
    assert r.name == "filesystem"  # cleaned prefix
