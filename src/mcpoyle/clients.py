"""Client definitions, detection, and config file read/write."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from mcpoyle.config import Server

MCPOYLE_MARKER = "__mcpoyle"


@dataclass
class ClientDef:
    id: str
    name: str
    config_path: str  # unexpanded path (~ allowed)
    servers_key: str  # top-level JSON key for MCP servers
    detect_paths: list[str] | None = None  # paths to check for detection
    glob_pattern: bool = False  # True for JetBrains-style glob paths

    @property
    def resolved_paths(self) -> list[Path]:
        p = Path(self.config_path).expanduser()
        if self.glob_pattern:
            return sorted(p.parent.parent.glob(p.parent.name + "/" + p.name))
        return [p]

    @property
    def is_installed(self) -> bool:
        if self.glob_pattern:
            return len(self.resolved_paths) > 0
        if self.detect_paths:
            return any(Path(p).expanduser().exists() for p in self.detect_paths)
        # Default: check if the config file itself exists
        return Path(self.config_path).expanduser().exists()


# Client definitions
CLIENTS: dict[str, ClientDef] = {}

_client_defs = [
    ClientDef(
        id="claude-desktop",
        name="Claude Desktop",
        config_path="~/Library/Application Support/Claude/claude_desktop_config.json",
        servers_key="mcpServers",
        detect_paths=[
            "/Applications/Claude.app",
            "~/Library/Application Support/Claude/claude_desktop_config.json",
        ],
    ),
    ClientDef(
        id="claude-code",
        name="Claude Code",
        config_path="~/.claude.json",
        servers_key="mcpServers",
        detect_paths=["~/.claude.json"],
    ),
    ClientDef(
        id="cursor",
        name="Cursor",
        config_path="~/.cursor/mcp.json",
        servers_key="mcpServers",
        detect_paths=[
            "/Applications/Cursor.app",
            "~/.cursor/mcp.json",
        ],
    ),
    ClientDef(
        id="vscode",
        name="VS Code (Copilot)",
        config_path="~/Library/Application Support/Code/User/settings.json",
        servers_key="mcp.servers",
        detect_paths=[
            "/Applications/Visual Studio Code.app",
            "~/Library/Application Support/Code/User/settings.json",
        ],
    ),
    ClientDef(
        id="windsurf",
        name="Windsurf",
        config_path="~/.windsurf/mcp.json",
        servers_key="mcpServers",
        detect_paths=[
            "/Applications/Windsurf.app",
            "~/.windsurf/mcp.json",
        ],
    ),
    ClientDef(
        id="zed",
        name="Zed",
        config_path="~/.config/zed/settings.json",
        servers_key="context_servers",
        detect_paths=[
            "/Applications/Zed.app",
            "~/.config/zed/settings.json",
        ],
    ),
    ClientDef(
        id="jetbrains",
        name="JetBrains",
        config_path="~/.config/JetBrains/*/mcp.json",
        servers_key="mcpServers",
        glob_pattern=True,
    ),
]

for _c in _client_defs:
    CLIENTS[_c.id] = _c


def server_to_client_entry(server: Server) -> dict:
    """Convert a Server to the dict format used in client configs."""
    entry: dict = {MCPOYLE_MARKER: True}
    if server.command:
        entry["command"] = server.command
    if server.args:
        entry["args"] = server.args
    if server.env:
        entry["env"] = server.env
    if server.transport and server.transport != "stdio":
        entry["transport"] = server.transport
    return entry


def read_client_config(path: Path) -> dict:
    """Read a client's config file, returning empty dict if missing."""
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def get_managed_servers(config: dict, servers_key: str) -> dict:
    """Extract mcpoyle-managed server entries from a client config."""
    servers = _get_nested(config, servers_key)
    if not isinstance(servers, dict):
        return {}
    return {k: v for k, v in servers.items() if isinstance(v, dict) and v.get(MCPOYLE_MARKER)}


def get_unmanaged_servers(config: dict, servers_key: str) -> dict:
    """Extract non-mcpoyle server entries from a client config."""
    servers = _get_nested(config, servers_key)
    if not isinstance(servers, dict):
        return {}
    return {k: v for k, v in servers.items() if not (isinstance(v, dict) and v.get(MCPOYLE_MARKER))}


def write_client_config(path: Path, config: dict, servers_key: str, new_servers: dict) -> None:
    """Write merged servers into a client config file, backing up first."""
    if path.exists():
        shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))

    # Merge: keep unmanaged, replace managed with new
    existing = read_client_config(path) if path.exists() else {}
    unmanaged = get_unmanaged_servers(existing, servers_key)
    merged = {**unmanaged, **new_servers}
    _set_nested(existing, servers_key, merged)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(existing, indent=2) + "\n")


def _entry_to_server(name: str, entry: dict) -> Server | None:
    """Convert a single server entry dict to a Server, skipping managed entries."""
    if not isinstance(entry, dict):
        return None
    if entry.get(MCPOYLE_MARKER):
        return None
    return Server(
        name=name,
        command=entry.get("command", ""),
        args=entry.get("args", []),
        env=entry.get("env", {}),
        transport=entry.get("transport", "stdio"),
    )


def import_servers_from_client(config: dict, servers_key: str) -> list[Server]:
    """Extract server definitions from a client config as Server objects."""
    servers_dict = _get_nested(config, servers_key)
    if not isinstance(servers_dict, dict):
        return []
    result = []
    for name, entry in servers_dict.items():
        server = _entry_to_server(name, entry)
        if server:
            result.append(server)
    return result


@dataclass
class ProjectImport:
    """Result of importing servers from a Claude Code project."""
    path: str
    servers: list[Server]


def import_project_servers(config: dict) -> list[ProjectImport]:
    """Scan all Claude Code projects in ~/.claude.json for MCP servers."""
    projects = config.get("projects", {})
    if not isinstance(projects, dict):
        return []
    results = []
    for proj_path, proj_data in projects.items():
        if not isinstance(proj_data, dict):
            continue
        servers_dict = proj_data.get("mcpServers", {})
        if not isinstance(servers_dict, dict) or not servers_dict:
            continue
        servers = []
        for name, entry in servers_dict.items():
            server = _entry_to_server(name, entry)
            if server:
                servers.append(server)
        if servers:
            results.append(ProjectImport(path=proj_path, servers=servers))
    return results


def project_servers_key(project_path: str) -> list[str]:
    """Return the JSON key path for a Claude Code project's mcpServers.

    Claude Code stores project configs in ~/.claude.json under:
      projects -> <absolute-path> -> mcpServers
    We return a list of key segments to navigate this structure.
    """
    abs_path = str(Path(project_path).expanduser().resolve())
    return ["projects", abs_path, "mcpServers"]


def get_managed_servers_nested(config: dict, key_path: list[str]) -> dict:
    """Like get_managed_servers but with a list key path (for project-level)."""
    servers = _get_nested_list(config, key_path)
    if not isinstance(servers, dict):
        return {}
    return {k: v for k, v in servers.items() if isinstance(v, dict) and v.get(MCPOYLE_MARKER)}


def get_unmanaged_servers_nested(config: dict, key_path: list[str]) -> dict:
    """Like get_unmanaged_servers but with a list key path."""
    servers = _get_nested_list(config, key_path)
    if not isinstance(servers, dict):
        return {}
    return {k: v for k, v in servers.items() if not (isinstance(v, dict) and v.get(MCPOYLE_MARKER))}


def write_servers_nested(path: Path, key_path: list[str], new_servers: dict) -> None:
    """Write servers to a nested key path within a JSON config file."""
    if path.exists():
        shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))

    existing = read_client_config(path) if path.exists() else {}
    unmanaged = get_unmanaged_servers_nested(existing, key_path)
    merged = {**unmanaged, **new_servers}
    _set_nested_list(existing, key_path, merged)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(existing, indent=2) + "\n")


# ── Claude Code settings helpers ─────────────────────────────────

CLAUDE_CODE_SETTINGS_PATH = Path.home() / ".claude" / "settings.json"


def read_cc_settings() -> dict:
    """Read Claude Code's settings.json."""
    if not CLAUDE_CODE_SETTINGS_PATH.exists():
        return {}
    return json.loads(CLAUDE_CODE_SETTINGS_PATH.read_text())


def write_cc_settings(settings: dict) -> None:
    """Write Claude Code's settings.json, backing up first."""
    if CLAUDE_CODE_SETTINGS_PATH.exists():
        shutil.copy2(
            CLAUDE_CODE_SETTINGS_PATH,
            CLAUDE_CODE_SETTINGS_PATH.with_suffix(".json.bak"),
        )
    CLAUDE_CODE_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLAUDE_CODE_SETTINGS_PATH.write_text(json.dumps(settings, indent=2) + "\n")


def get_enabled_plugins(settings: dict) -> dict:
    """Get enabledPlugins from CC settings."""
    return settings.get("enabledPlugins", {})


def set_enabled_plugins(settings: dict, plugins: dict) -> None:
    """Set enabledPlugins in CC settings."""
    settings["enabledPlugins"] = plugins


def get_extra_marketplaces(settings: dict) -> dict:
    """Get extraKnownMarketplaces from CC settings."""
    return settings.get("extraKnownMarketplaces", {})


def set_extra_marketplaces(settings: dict, marketplaces: dict) -> None:
    """Set extraKnownMarketplaces in CC settings."""
    settings["extraKnownMarketplaces"] = marketplaces


def _get_nested(d: dict, key: str):
    """Get a value from a dict using a dot-separated key path."""
    return _get_nested_list(d, key.split("."))


def _set_nested(d: dict, key: str, value):
    """Set a value in a dict using a dot-separated key path."""
    _set_nested_list(d, key.split("."), value)


def _get_nested_list(d: dict, parts: list[str]):
    """Get a value from a dict using a list of key segments."""
    current = d
    for part in parts:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _set_nested_list(d: dict, parts: list[str], value):
    """Set a value in a dict using a list of key segments."""
    current = d
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value
