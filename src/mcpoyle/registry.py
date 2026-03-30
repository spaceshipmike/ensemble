"""MCP server registry integration — search, browse, and install from public registries.

Uses a RegistryAdapter protocol for pluggable backends with TTL-based file caching.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable

import httpx

OFFICIAL_BASE = "https://registry.modelcontextprotocol.io/v0"
GLAMA_BASE = "https://glama.ai/api/mcp/v1"

_TIMEOUT = 10.0

CACHE_DIR = Path.home() / ".config" / "mcpoyle" / "cache" / "registry"


# ── Result types ────────────────────────────────────────────────


@dataclass
class RegistryServer:
    """A server from a registry search result."""
    name: str
    description: str
    source: str  # "official" or "glama" or "skills-catalog"
    transport: str = "stdio"  # "stdio", "sse", "http"
    popularity: int = 0
    qualified_id: str = ""  # identifier for get/install
    # Quality signals
    stars: int = 0
    last_updated: str = ""  # ISO 8601
    has_readme: bool = False
    installs: int = 0


@dataclass
class ServerDetail:
    """Full details for a single server from a registry."""
    name: str
    description: str
    source: str
    transport: str = "stdio"
    homepage: str = ""
    env_vars: list[EnvVarSpec] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    tools_raw_chars: int = 0  # total chars of tool name+description+schema text
    # For install: the package info
    registry_type: str = ""  # "npm", "pypi", "oci"
    package_identifier: str = ""
    package_args: list[str] = field(default_factory=list)
    # Quality signals
    stars: int = 0
    last_updated: str = ""
    has_readme: bool = False
    installs: int = 0

    @property
    def security_summary(self) -> dict:
        """Pre-install security summary: show command, env vars, risk flags."""
        flags: list[str] = []
        if any(ev.name.upper() in ("API_KEY", "SECRET", "TOKEN", "PASSWORD") or
               "SECRET" in ev.name.upper() or "TOKEN" in ev.name.upper()
               for ev in self.env_vars):
            flags.append("requires-secrets")
        if self.transport in ("sse", "http", "streamable-http"):
            flags.append("network-transport")
        if len(self.tools) > 20:
            flags.append("many-tools")
        return {
            "command": self.package_identifier or "(unknown)",
            "env_vars": [{"name": ev.name, "required": ev.required} for ev in self.env_vars],
            "risk_flags": flags,
            "tool_count": len(self.tools),
            "transport": self.transport,
        }

    @property
    def estimated_token_cost(self) -> int:
        """Estimate context window tokens for tool definitions (~4 chars/token)."""
        if self.tools_raw_chars > 0:
            return self.tools_raw_chars // 4
        # Fallback: estimate from tool count (avg ~200 tokens per tool)
        return len(self.tools) * 200 if self.tools else 0


@dataclass
class EnvVarSpec:
    """An environment variable required by a server."""
    name: str
    description: str = ""
    required: bool = False


# ── Cache ─────────────────────────────────────────────────────


def _default_cache_ttl() -> int:
    """Get cache TTL from config, default 3600 seconds (1 hour)."""
    config_path = Path.home() / ".config" / "mcpoyle" / "config.json"
    try:
        if config_path.exists():
            cfg = json.loads(config_path.read_text())
            settings = cfg.get("settings", {})
            return int(settings.get("registry_cache_ttl", 3600))
    except (json.JSONDecodeError, ValueError, TypeError):
        pass
    return 3600


def _cache_key(prefix: str, query: str) -> str:
    """Generate a safe filename for a cache entry."""
    h = hashlib.sha256(f"{prefix}:{query}".encode()).hexdigest()[:16]
    return f"{prefix}_{h}.json"


def _read_cache(key: str, ttl: int | None = None) -> dict | None:
    """Read a cached response if it exists and is not expired."""
    if ttl is None:
        ttl = _default_cache_ttl()
    path = CACHE_DIR / key
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        if time.time() - data.get("timestamp", 0) > ttl:
            path.unlink(missing_ok=True)
            return None
        return data.get("payload")
    except (json.JSONDecodeError, OSError):
        return None


def _write_cache(key: str, payload) -> None:
    """Write a response to the cache."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / key
    try:
        path.write_text(json.dumps({"timestamp": time.time(), "payload": payload}))
    except OSError:
        pass  # Cache write failure is non-fatal


def clear_cache() -> int:
    """Clear all cached registry responses. Returns count of files removed."""
    if not CACHE_DIR.exists():
        return 0
    count = 0
    for f in CACHE_DIR.glob("*.json"):
        f.unlink(missing_ok=True)
        count += 1
    return count


# ── Registry Adapter Protocol ─────────────────────────────────


@runtime_checkable
class RegistryAdapter(Protocol):
    """Protocol for registry backends."""

    @property
    def name(self) -> str: ...

    @property
    def base_url(self) -> str: ...

    def search(self, query: str, limit: int = 20, use_cache: bool = True) -> list[RegistryServer]: ...

    def show(self, server_id: str, use_cache: bool = True) -> ServerDetail | None: ...


# ── Official MCP Registry Adapter ─────────────────────────────


class OfficialRegistryAdapter:
    """Adapter for the Official MCP Registry."""

    @property
    def name(self) -> str:
        return "official"

    @property
    def base_url(self) -> str:
        return OFFICIAL_BASE

    def search(self, query: str, limit: int = 20, use_cache: bool = True) -> list[RegistryServer]:
        """Search the Official MCP Registry."""
        cache_key = _cache_key("official_search", f"{query}:{limit}")
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                return [RegistryServer(**s) for s in cached]

        try:
            resp = httpx.get(
                f"{OFFICIAL_BASE}/servers",
                params={"search": query, "limit": limit},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return []

        data = resp.json()
        servers = data if isinstance(data, list) else data.get("servers", [])
        results = []
        for s in servers:
            name = s.get("name", "") or s.get("qualifiedName", "")
            desc = s.get("description", "")
            transport = "stdio"
            packages = s.get("packages", [])
            if packages:
                pkg = packages[0]
                transport = pkg.get("transport", {}).get("type", "stdio") if isinstance(pkg.get("transport"), dict) else "stdio"

            results.append(RegistryServer(
                name=name,
                description=desc[:120] if desc else "",
                source="official",
                transport=transport,
                qualified_id=name,
            ))

        if use_cache and results:
            _write_cache(cache_key, [{"name": r.name, "description": r.description, "source": r.source, "transport": r.transport, "qualified_id": r.qualified_id} for r in results])

        return results

    def show(self, server_id: str, use_cache: bool = True) -> ServerDetail | None:
        """Get full details for a server from the Official MCP Registry."""
        cache_key = _cache_key("official_show", server_id)
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                return _detail_from_cache(cached)

        try:
            resp = httpx.get(
                f"{OFFICIAL_BASE}/servers",
                params={"search": server_id, "limit": 5},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return None

        data = resp.json()
        servers = data if isinstance(data, list) else data.get("servers", [])

        # Find exact match
        match = None
        for s in servers:
            name = s.get("name", "") or s.get("qualifiedName", "")
            if name == server_id or name.endswith(f"/{server_id}"):
                match = s
                break
        if not match and servers:
            match = servers[0]
        if not match:
            return None

        name = match.get("name", "") or match.get("qualifiedName", "")
        desc = match.get("description", "")
        homepage = match.get("repository", {}).get("url", "") if isinstance(match.get("repository"), dict) else ""

        # Extract package info
        packages = match.get("packages", [])
        registry_type = ""
        package_id = ""
        package_args: list[str] = []
        transport = "stdio"
        env_vars: list[EnvVarSpec] = []
        tools: list[str] = []

        if packages:
            pkg = packages[0]
            registry_type = pkg.get("registryType", "")
            package_id = pkg.get("identifier", "") or pkg.get("name", "")
            transport_info = pkg.get("transport", {})
            if isinstance(transport_info, dict):
                transport = transport_info.get("type", "stdio")

            for arg in pkg.get("packageArguments", []):
                if isinstance(arg, dict):
                    package_args.append(arg.get("name", ""))

            for ev in pkg.get("environmentVariables", []):
                if isinstance(ev, dict):
                    env_vars.append(EnvVarSpec(
                        name=ev.get("name", ""),
                        description=ev.get("description", ""),
                        required=ev.get("required", False),
                    ))

        tools_raw_chars = 0
        for tool in match.get("tools", []):
            if isinstance(tool, dict):
                tools.append(tool.get("name", ""))
                tools_raw_chars += len(str(tool))

        detail = ServerDetail(
            name=name,
            description=desc,
            source="official",
            transport=transport,
            homepage=homepage,
            env_vars=env_vars,
            tools=tools,
            tools_raw_chars=tools_raw_chars,
            registry_type=registry_type,
            package_identifier=package_id,
            package_args=package_args,
        )

        if use_cache:
            _write_cache(cache_key, _detail_to_cache(detail))

        return detail


# ── Glama Registry Adapter ────────────────────────────────────


class GlamaRegistryAdapter:
    """Adapter for the Glama MCP directory."""

    @property
    def name(self) -> str:
        return "glama"

    @property
    def base_url(self) -> str:
        return GLAMA_BASE

    def search(self, query: str, limit: int = 20, use_cache: bool = True) -> list[RegistryServer]:
        """Search the Glama MCP directory."""
        cache_key = _cache_key("glama_search", f"{query}:{limit}")
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                return [RegistryServer(**s) for s in cached]

        try:
            resp = httpx.get(
                f"{GLAMA_BASE}/servers",
                params={"query": query, "first": limit},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return []

        data = resp.json()
        servers_raw = []
        if isinstance(data, dict):
            if "data" in data:
                edges = data.get("data", {}).get("servers", {}).get("edges", [])
                servers_raw = [e.get("node", e) for e in edges]
            elif "servers" in data:
                servers_raw = data["servers"]
            elif "edges" in data:
                servers_raw = [e.get("node", e) for e in data["edges"]]

        results = []
        for s in servers_raw:
            name = s.get("name", "") or s.get("slug", "")
            namespace = s.get("namespace", "")
            qualified = f"{namespace}/{name}" if namespace else name
            desc = s.get("description", "")

            transport = "stdio"
            attrs = s.get("attributes", [])
            if isinstance(attrs, list):
                for attr in attrs:
                    if isinstance(attr, str) and "remote" in attr.lower():
                        transport = "http"

            results.append(RegistryServer(
                name=qualified or name,
                description=desc[:120] if desc else "",
                source="glama",
                transport=transport,
                qualified_id=qualified or name,
            ))

        if use_cache and results:
            _write_cache(cache_key, [{"name": r.name, "description": r.description, "source": r.source, "transport": r.transport, "qualified_id": r.qualified_id} for r in results])

        return results

    def show(self, server_id: str, use_cache: bool = True) -> ServerDetail | None:
        """Get full details for a server from Glama."""
        cache_key = _cache_key("glama_show", server_id)
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                return _detail_from_cache(cached)

        try:
            resp = httpx.get(
                f"{GLAMA_BASE}/servers/{server_id}",
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return None

        s = resp.json()
        name = s.get("name", "") or s.get("slug", "")
        namespace = s.get("namespace", "")
        qualified = f"{namespace}/{name}" if namespace else name
        desc = s.get("description", "")
        homepage = s.get("url", "") or s.get("repository", {}).get("url", "") if isinstance(s.get("repository"), dict) else s.get("url", "")

        env_vars: list[EnvVarSpec] = []
        env_schema = s.get("environmentVariablesJsonSchema", {})
        if isinstance(env_schema, dict):
            props = env_schema.get("properties", {})
            required_keys = env_schema.get("required", [])
            for key, val in props.items():
                if isinstance(val, dict):
                    env_vars.append(EnvVarSpec(
                        name=key,
                        description=val.get("description", ""),
                        required=key in required_keys,
                    ))

        tools: list[str] = []
        tools_raw_chars = 0
        for tool in s.get("tools", []):
            if isinstance(tool, dict):
                tools.append(tool.get("name", ""))
                tools_raw_chars += len(str(tool))

        detail = ServerDetail(
            name=qualified,
            description=desc,
            source="glama",
            transport="stdio",
            homepage=homepage,
            env_vars=env_vars,
            tools=tools,
            tools_raw_chars=tools_raw_chars,
        )

        if use_cache:
            _write_cache(cache_key, _detail_to_cache(detail))

        return detail


# ── Cache serialization helpers ───────────────────────────────


def _detail_to_cache(d: ServerDetail) -> dict:
    """Convert ServerDetail to a JSON-serializable dict for caching."""
    return {
        "name": d.name, "description": d.description, "source": d.source,
        "transport": d.transport, "homepage": d.homepage,
        "env_vars": [{"name": e.name, "description": e.description, "required": e.required} for e in d.env_vars],
        "tools": d.tools, "tools_raw_chars": d.tools_raw_chars,
        "registry_type": d.registry_type, "package_identifier": d.package_identifier,
        "package_args": d.package_args,
        "stars": d.stars, "last_updated": d.last_updated,
        "has_readme": d.has_readme, "installs": d.installs,
    }


def _detail_from_cache(c: dict) -> ServerDetail:
    """Reconstruct ServerDetail from cached dict."""
    return ServerDetail(
        name=c["name"], description=c["description"], source=c["source"],
        transport=c.get("transport", "stdio"), homepage=c.get("homepage", ""),
        env_vars=[EnvVarSpec(**e) for e in c.get("env_vars", [])],
        tools=c.get("tools", []), tools_raw_chars=c.get("tools_raw_chars", 0),
        registry_type=c.get("registry_type", ""), package_identifier=c.get("package_identifier", ""),
        package_args=c.get("package_args", []),
        stars=c.get("stars", 0), last_updated=c.get("last_updated", ""),
        has_readme=c.get("has_readme", False), installs=c.get("installs", 0),
    )


# ── Adapter registry ──────────────────────────────────────────


_ADAPTERS: list[RegistryAdapter] = [
    OfficialRegistryAdapter(),
    GlamaRegistryAdapter(),
]


def get_adapters() -> list[RegistryAdapter]:
    """Return all registered adapters."""
    return list(_ADAPTERS)


# ── Backward-compatible API (delegates to adapters) ───────────


def search_official(query: str, limit: int = 20) -> list[RegistryServer]:
    return OfficialRegistryAdapter().search(query, limit)


def get_official(server_id: str) -> ServerDetail | None:
    return OfficialRegistryAdapter().show(server_id)


def search_glama(query: str, limit: int = 20) -> list[RegistryServer]:
    return GlamaRegistryAdapter().search(query, limit)


def get_glama(server_id: str) -> ServerDetail | None:
    return GlamaRegistryAdapter().show(server_id)


def search_registries(query: str, limit: int = 10, use_cache: bool = True) -> list[RegistryServer]:
    """Search all registries and deduplicate by name."""
    # Use module-level functions for backward compatibility with test patching
    official = search_official(query, limit)
    glama = search_glama(query, limit)

    seen: set[str] = set()
    results: list[RegistryServer] = []

    for s in official:
        key = s.name.lower().rsplit("/", 1)[-1]
        if key not in seen:
            seen.add(key)
            results.append(s)

    for s in glama:
        key = s.name.lower().rsplit("/", 1)[-1]
        if key not in seen:
            seen.add(key)
            results.append(s)

    return results[:limit * 2]


def get_server(server_id: str, source: str | None = None, use_cache: bool = True) -> ServerDetail | None:
    """Get full details for a server, trying the specified source or both."""
    if source == "official":
        return get_official(server_id)
    if source == "glama":
        return get_glama(server_id)

    # Try official first, then glama
    result = get_official(server_id)
    if result:
        return result
    return get_glama(server_id)


# ── Config translation ─────────────────────────────────────────


def translate_to_server_config(detail: ServerDetail) -> dict:
    """Translate registry server detail to mcpoyle Server kwargs.

    Returns a dict with keys: name, command, args, env, transport.
    """
    command = ""
    args: list[str] = []

    if detail.registry_type == "npm" and detail.package_identifier:
        command = "npx"
        args = ["-y", detail.package_identifier]
    elif detail.registry_type == "pypi" and detail.package_identifier:
        command = "uvx"
        args = [detail.package_identifier]
    elif detail.package_identifier:
        # Fallback: assume npm-style
        command = "npx"
        args = ["-y", detail.package_identifier]

    # Append any package arguments
    args.extend(detail.package_args)

    # Clean name for use as server name
    name = detail.name.rsplit("/", 1)[-1]
    # Remove common prefixes/suffixes
    for prefix in ("mcp-server-", "server-", "mcp-"):
        if name.startswith(prefix):
            name = name[len(prefix):]
            break

    result = {
        "name": name,
        "command": command,
        "args": args,
        "env": {},
        "transport": detail.transport,
    }
    # For HTTP-based servers, include URL if available
    if detail.transport in ("sse", "http", "streamable-http") and detail.homepage:
        result["url"] = detail.homepage
    return result


# ── Unified source parser ─────────────────────────────────────


@dataclass
class ParsedSource:
    """Result of parsing a source string."""
    type: str  # "registry", "npm", "pypi", "github", "url", "path"
    identifier: str  # the resolved identifier
    name: str = ""  # suggested name for the server/skill


def parse_source(source: str) -> ParsedSource:
    """Infer source type from a user-provided string.

    Handles:
      - Registry IDs: @scope/name or plain name (tries registry lookup)
      - NPM packages: npm:package-name
      - PyPI packages: pip:package-name or pypi:package-name
      - GitHub repos: github:owner/repo or owner/repo (with /)
      - URLs: http:// or https://
      - Local paths: starts with / or ~ or .
    """
    source = source.strip()

    # Explicit prefix protocols
    if source.startswith("npm:"):
        pkg = source[4:]
        name = pkg.rsplit("/", 1)[-1]
        return ParsedSource(type="npm", identifier=pkg, name=_clean_name(name))

    if source.startswith(("pip:", "pypi:")):
        pkg = source.split(":", 1)[1]
        return ParsedSource(type="pypi", identifier=pkg, name=_clean_name(pkg))

    if source.startswith("github:"):
        repo = source[7:]
        name = repo.rsplit("/", 1)[-1] if "/" in repo else repo
        return ParsedSource(type="github", identifier=repo, name=_clean_name(name))

    # URL
    if source.startswith(("http://", "https://")):
        name = source.rsplit("/", 1)[-1].split("?")[0].split("#")[0]
        return ParsedSource(type="url", identifier=source, name=_clean_name(name or "server"))

    # Local path
    if source.startswith(("/", "~", ".")):
        from pathlib import Path
        name = Path(source).expanduser().name
        return ParsedSource(type="path", identifier=source, name=_clean_name(name))

    # @scope/name pattern — likely npm or registry
    if source.startswith("@") and "/" in source:
        name = source.rsplit("/", 1)[-1]
        return ParsedSource(type="registry", identifier=source, name=_clean_name(name))

    # owner/repo pattern — likely github
    if "/" in source and not source.startswith("@"):
        name = source.rsplit("/", 1)[-1]
        return ParsedSource(type="github", identifier=source, name=_clean_name(name))

    # Plain name — assume registry lookup
    return ParsedSource(type="registry", identifier=source, name=_clean_name(source))


def _clean_name(name: str) -> str:
    """Clean a name for use as a server/skill identifier."""
    for prefix in ("mcp-server-", "server-", "mcp-", "@"):
        if name.startswith(prefix):
            name = name[len(prefix):]
    for suffix in ("-mcp", "-server"):
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    return name or "unnamed"
