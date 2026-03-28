"""MCP server registry integration — search, browse, and install from public registries."""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx

OFFICIAL_BASE = "https://registry.modelcontextprotocol.io/v0"
GLAMA_BASE = "https://glama.ai/api/mcp/v1"

_TIMEOUT = 10.0


# ── Result types ────────────────────────────────────────────────


@dataclass
class RegistryServer:
    """A server from a registry search result."""
    name: str
    description: str
    source: str  # "official" or "glama"
    transport: str = "stdio"  # "stdio", "sse", "http"
    popularity: int = 0
    qualified_id: str = ""  # identifier for get/install


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


# ── Official MCP Registry ──────────────────────────────────────


def search_official(query: str, limit: int = 20) -> list[RegistryServer]:
    """Search the Official MCP Registry."""
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
    return results


def get_official(server_id: str) -> ServerDetail | None:
    """Get full details for a server from the Official MCP Registry."""
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

        # Package arguments
        for arg in pkg.get("packageArguments", []):
            if isinstance(arg, dict):
                package_args.append(arg.get("name", ""))

        # Environment variables
        for ev in pkg.get("environmentVariables", []):
            if isinstance(ev, dict):
                env_vars.append(EnvVarSpec(
                    name=ev.get("name", ""),
                    description=ev.get("description", ""),
                    required=ev.get("required", False),
                ))

    # Tools
    tools_raw_chars = 0
    for tool in match.get("tools", []):
        if isinstance(tool, dict):
            tools.append(tool.get("name", ""))
            # Accumulate chars for token cost estimate
            tools_raw_chars += len(str(tool))

    return ServerDetail(
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


# ── Glama Registry ─────────────────────────────────────────────


def search_glama(query: str, limit: int = 20) -> list[RegistryServer]:
    """Search the Glama MCP directory."""
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
    # Glama returns { data: { servers: { edges: [...] } } } or { servers: [...] }
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

        # Determine transport from attributes
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
    return results


def get_glama(server_id: str) -> ServerDetail | None:
    """Get full details for a server from Glama."""
    # server_id might be "namespace/slug" or just "slug"
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

    # Environment variables from JSON schema
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

    # Tools
    tools: list[str] = []
    tools_raw_chars = 0
    for tool in s.get("tools", []):
        if isinstance(tool, dict):
            tools.append(tool.get("name", ""))
            tools_raw_chars += len(str(tool))

    return ServerDetail(
        name=qualified,
        description=desc,
        source="glama",
        transport="stdio",
        homepage=homepage,
        env_vars=env_vars,
        tools=tools,
        tools_raw_chars=tools_raw_chars,
    )


# ── Unified search ─────────────────────────────────────────────


def search_registries(query: str, limit: int = 10) -> list[RegistryServer]:
    """Search both registries and deduplicate by name."""
    official = search_official(query, limit)
    glama = search_glama(query, limit)

    # Deduplicate: prefer official if both have same name
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


def get_server(server_id: str, source: str | None = None) -> ServerDetail | None:
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
