"""Business logic for all mutations — shared by CLI and TUI.

Every function takes a McpoyleConfig (and optional CC settings helpers),
performs the mutation in-memory, and returns a structured result. Callers
are responsible for saving the config and formatting output.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from mcpoyle.clients import (
    CLIENTS,
    get_enabled_plugins,
    get_extra_marketplaces,
    read_cc_settings,
    set_enabled_plugins,
    set_extra_marketplaces,
    write_cc_settings,
)
from mcpoyle.config import (
    ClientAssignment,
    Group,
    Marketplace,
    MarketplaceSource,
    McpoyleConfig,
    Plugin,
    ProjectAssignment,
    Server,
)


# ── Result types ────────────────────────────────────────────────


@dataclass
class OpResult:
    """Base result for all operations."""
    ok: bool = True
    error: str = ""
    messages: list[str] = field(default_factory=list)


@dataclass
class ServerResult(OpResult):
    server: Server | None = None


@dataclass
class PluginResult(OpResult):
    plugin: Plugin | None = None


@dataclass
class MarketplaceResult(OpResult):
    marketplace: Marketplace | None = None


@dataclass
class AssignResult(OpResult):
    client_id: str = ""
    group: str | None = None
    project_path: str | None = None


@dataclass
class ScopeResult(OpResult):
    item_type: str = ""  # "server" or "plugin"
    item_name: str = ""
    global_group: str = ""
    project_group: str = ""
    project_path: str = ""


@dataclass
class ImportPluginsResult(OpResult):
    imported: list[Plugin] = field(default_factory=list)


@dataclass
class GroupResult(OpResult):
    group: Group | None = None


# ── Server operations ───────────────────────────────────────────


def add_server(
    cfg: McpoyleConfig,
    name: str,
    command: str,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
    transport: str = "stdio",
) -> ServerResult:
    if cfg.get_server(name):
        return ServerResult(ok=False, error=f"Server '{name}' already exists.")

    server = Server(
        name=name,
        command=command,
        args=args or [],
        env=env or {},
        transport=transport,
    )
    cfg.servers.append(server)
    return ServerResult(server=server, messages=[f"Added server '{name}'."])


def remove_server(cfg: McpoyleConfig, name: str) -> ServerResult:
    server = cfg.get_server(name)
    if not server:
        return ServerResult(ok=False, error=f"Server '{name}' not found.")

    cfg.servers.remove(server)
    for group in cfg.groups:
        if name in group.servers:
            group.servers.remove(name)
    return ServerResult(server=server, messages=[f"Removed server '{name}'."])


def enable_server(cfg: McpoyleConfig, name: str) -> ServerResult:
    server = cfg.get_server(name)
    if not server:
        return ServerResult(ok=False, error=f"Server '{name}' not found.")
    server.enabled = True
    return ServerResult(server=server, messages=[f"Enabled server '{name}'."])


def disable_server(cfg: McpoyleConfig, name: str) -> ServerResult:
    server = cfg.get_server(name)
    if not server:
        return ServerResult(ok=False, error=f"Server '{name}' not found.")
    server.enabled = False
    return ServerResult(server=server, messages=[f"Disabled server '{name}'."])


# ── Group operations ────────────────────────────────────────────


def create_group(cfg: McpoyleConfig, name: str, description: str = "") -> GroupResult:
    if cfg.get_group(name):
        return GroupResult(ok=False, error=f"Group '{name}' already exists.")
    group = Group(name=name, description=description)
    cfg.groups.append(group)
    return GroupResult(group=group, messages=[f"Created group '{name}'."])


def delete_group(cfg: McpoyleConfig, name: str) -> GroupResult:
    group = cfg.get_group(name)
    if not group:
        return GroupResult(ok=False, error=f"Group '{name}' not found.")
    cfg.groups.remove(group)
    for client in cfg.clients:
        if client.group == name:
            client.group = None
    return GroupResult(group=group, messages=[f"Deleted group '{name}'."])


def add_server_to_group(cfg: McpoyleConfig, group_name: str, server_name: str) -> OpResult:
    group = cfg.get_group(group_name)
    if not group:
        return OpResult(ok=False, error=f"Group '{group_name}' not found.")
    if not cfg.get_server(server_name):
        return OpResult(ok=False, error=f"Server '{server_name}' not found.")
    if server_name in group.servers:
        return OpResult(messages=[f"Server '{server_name}' already in group '{group_name}'."])
    group.servers.append(server_name)
    return OpResult(messages=[f"Added '{server_name}' to group '{group_name}'."])


def remove_server_from_group(cfg: McpoyleConfig, group_name: str, server_name: str) -> OpResult:
    group = cfg.get_group(group_name)
    if not group:
        return OpResult(ok=False, error=f"Group '{group_name}' not found.")
    if server_name not in group.servers:
        return OpResult(ok=False, error=f"Server '{server_name}' not in group '{group_name}'.")
    group.servers.remove(server_name)
    return OpResult(messages=[f"Removed '{server_name}' from group '{group_name}'."])


def add_plugin_to_group(cfg: McpoyleConfig, group_name: str, plugin_name: str) -> OpResult:
    group = cfg.get_group(group_name)
    if not group:
        return OpResult(ok=False, error=f"Group '{group_name}' not found.")
    if not cfg.get_plugin(plugin_name):
        return OpResult(ok=False, error=f"Plugin '{plugin_name}' not found.")
    if plugin_name in group.plugins:
        return OpResult(messages=[f"Plugin '{plugin_name}' already in group '{group_name}'."])
    group.plugins.append(plugin_name)
    return OpResult(messages=[f"Added '{plugin_name}' to group '{group_name}'."])


def remove_plugin_from_group(cfg: McpoyleConfig, group_name: str, plugin_name: str) -> OpResult:
    group = cfg.get_group(group_name)
    if not group:
        return OpResult(ok=False, error=f"Group '{group_name}' not found.")
    if plugin_name not in group.plugins:
        return OpResult(ok=False, error=f"Plugin '{plugin_name}' not in group '{group_name}'.")
    group.plugins.remove(plugin_name)
    return OpResult(messages=[f"Removed '{plugin_name}' from group '{group_name}'."])


# ── Assignment operations ───────────────────────────────────────


def assign_client(
    cfg: McpoyleConfig,
    client_id: str,
    group: str | None,
    assign_all: bool = False,
    project_path: str | None = None,
) -> AssignResult:
    if client_id not in CLIENTS:
        return AssignResult(
            ok=False,
            error=f"Unknown client: {client_id}",
            messages=[f"Valid clients: {', '.join(CLIENTS.keys())}"],
        )

    if project_path and client_id != "claude-code":
        return AssignResult(ok=False, error="--project is only supported for claude-code.")

    if assign_all:
        group = None
    elif not group:
        return AssignResult(ok=False, error="Specify a group name or use --all.")
    elif not cfg.get_group(group):
        return AssignResult(ok=False, error=f"Group '{group}' not found.")

    assignment = cfg.get_client(client_id)
    if not assignment:
        assignment = ClientAssignment(id=client_id)
        cfg.clients.append(assignment)

    client_name = CLIENTS[client_id].name

    if project_path:
        # Try resolving as project name via registry if it doesn't look like a path
        if not project_path.startswith(("/", "~", ".")):
            from mcpoyle.projects import resolve_project_path
            resolved = resolve_project_path(project_path)
            if resolved:
                project_path = resolved
        abs_path = str(Path(project_path).expanduser().resolve())
        proj = assignment.get_project(abs_path)
        if not proj:
            proj = ProjectAssignment(path=abs_path, group=group)
            assignment.projects.append(proj)
        else:
            proj.group = group
        if group:
            msg = f"Assigned group '{group}' to Claude Code project {abs_path}."
        else:
            msg = f"Assigned all enabled servers to Claude Code project {abs_path}."
        return AssignResult(client_id=client_id, group=group, project_path=abs_path, messages=[msg])
    else:
        assignment.group = group
        if group:
            msg = f"Assigned group '{group}' to {client_name}."
        else:
            msg = f"Assigned all enabled servers to {client_name}."
        return AssignResult(client_id=client_id, group=group, messages=[msg])


def unassign_client(
    cfg: McpoyleConfig,
    client_id: str,
    project_path: str | None = None,
) -> AssignResult:
    if client_id not in CLIENTS:
        return AssignResult(ok=False, error=f"Unknown client: {client_id}")

    if project_path and client_id != "claude-code":
        return AssignResult(ok=False, error="--project is only supported for claude-code.")

    client_name = CLIENTS[client_id].name
    assignment = cfg.get_client(client_id)
    if not assignment:
        return AssignResult(client_id=client_id, messages=[f"No assignment for {client_name}."])

    if project_path:
        if not project_path.startswith(("/", "~", ".")):
            from mcpoyle.projects import resolve_project_path
            resolved = resolve_project_path(project_path)
            if resolved:
                project_path = resolved
        abs_path = str(Path(project_path).expanduser().resolve())
        proj = assignment.get_project(abs_path)
        if proj:
            assignment.projects.remove(proj)
            return AssignResult(client_id=client_id, project_path=abs_path, messages=[f"Removed project assignment for {abs_path}."])
        else:
            return AssignResult(client_id=client_id, messages=[f"No project assignment for {abs_path}."])
    else:
        assignment.group = None
        return AssignResult(
            client_id=client_id,
            messages=[f"Unassigned {client_name} — will receive all enabled servers."],
        )


# ── Scope operation ─────────────────────────────────────────────


def scope_item(cfg: McpoyleConfig, name: str, project_path: str) -> ScopeResult:
    abs_path = str(Path(project_path).expanduser().resolve())
    project_basename = Path(abs_path).name

    server = cfg.get_server(name)
    plugin = cfg.get_plugin(name)
    if not server and not plugin:
        return ScopeResult(ok=False, error=f"'{name}' is not a known server or plugin.")

    item_type = "server" if server else "plugin"

    # Ensure claude-code client assignment exists
    assignment = cfg.get_client("claude-code")
    if not assignment:
        assignment = ClientAssignment(id="claude-code")
        cfg.clients.append(assignment)

    messages: list[str] = []

    # Step 1: Ensure global uses a group (not "all")
    if not assignment.group:
        global_group_name = "claude-code-global"
        global_group = cfg.get_group(global_group_name)
        if not global_group:
            global_group = Group(
                name=global_group_name,
                description="Auto-created global group for Claude Code",
                servers=[s.name for s in cfg.servers if s.enabled],
                plugins=[p.name for p in cfg.plugins if p.enabled],
            )
            cfg.groups.append(global_group)
            messages.append(f"Created group '{global_group_name}' with all enabled items.")
        assignment.group = global_group_name
    else:
        global_group_name = assignment.group
        global_group = cfg.get_group(global_group_name)
        if not global_group:
            return ScopeResult(ok=False, error=f"Global group '{global_group_name}' not found.")

    # Step 2: Ensure project has a group assignment
    proj = assignment.get_project(abs_path)
    if not proj:
        proj = ProjectAssignment(path=abs_path)
        assignment.projects.append(proj)

    if not proj.group:
        proj_group_name = project_basename
        if cfg.get_group(proj_group_name) and proj_group_name == global_group_name:
            proj_group_name = f"{project_basename}-project"
        proj_group = cfg.get_group(proj_group_name)
        if not proj_group:
            proj_group = Group(
                name=proj_group_name,
                description=f"Servers and plugins for {project_basename}",
                servers=list(global_group.servers),
                plugins=list(global_group.plugins),
            )
            cfg.groups.append(proj_group)
            messages.append(f"Created group '{proj_group_name}' for project.")
        proj.group = proj_group_name
    else:
        proj_group_name = proj.group
        proj_group = cfg.get_group(proj_group_name)
        if not proj_group:
            return ScopeResult(ok=False, error=f"Project group '{proj_group_name}' not found.")

    # Step 3: Add to project group, remove from global group
    if item_type == "server":
        if name not in proj_group.servers:
            proj_group.servers.append(name)
        if name in global_group.servers:
            global_group.servers.remove(name)
    else:
        if name not in proj_group.plugins:
            proj_group.plugins.append(name)
        if name in global_group.plugins:
            global_group.plugins.remove(name)

    messages.extend([
        f"Scoped {item_type} '{name}' to project {abs_path}.",
        f"  removed from: {global_group_name} (global)",
        f"  added to:     {proj_group_name} (project)",
        "Run 'mcpoyle sync claude-code' to apply.",
    ])

    return ScopeResult(
        item_type=item_type,
        item_name=name,
        global_group=global_group_name,
        project_group=proj_group_name,
        project_path=abs_path,
        messages=messages,
    )


# ── Marketplace operations ──────────────────────────────────────


def _marketplace_source_to_cc(source: MarketplaceSource) -> dict:
    """Convert a MarketplaceSource to Claude Code's native format."""
    d: dict = {"source": source.source}
    if source.source == "github" and source.repo:
        d["repo"] = source.repo
    elif source.source == "directory" and source.path:
        d["path"] = source.path
    elif source.url:
        d["url"] = source.url
    return d


def add_marketplace(
    cfg: McpoyleConfig,
    name: str,
    repo: str | None = None,
    local_path: str | None = None,
) -> MarketplaceResult:
    if name in Marketplace.RESERVED_NAMES:
        return MarketplaceResult(ok=False, error=f"'{name}' is a reserved marketplace name.")

    if cfg.get_marketplace(name):
        return MarketplaceResult(ok=False, error=f"Marketplace '{name}' already exists.")

    if not repo and not local_path:
        return MarketplaceResult(ok=False, error="Specify --repo or --path.")

    if repo:
        source = MarketplaceSource(source="github", repo=repo)
    else:
        abs_path = str(Path(local_path).expanduser().resolve())
        source = MarketplaceSource(source="directory", path=abs_path)

    marketplace = Marketplace(name=name, source=source)
    cfg.marketplaces.append(marketplace)

    # Write to Claude Code settings
    settings = read_cc_settings()
    extra = get_extra_marketplaces(settings)
    extra[name] = {"source": _marketplace_source_to_cc(source)}
    set_extra_marketplaces(settings, extra)
    write_cc_settings(settings)

    return MarketplaceResult(marketplace=marketplace, messages=[f"Added marketplace '{name}'."])


def remove_marketplace(cfg: McpoyleConfig, name: str) -> MarketplaceResult:
    marketplace = cfg.get_marketplace(name)
    if not marketplace:
        return MarketplaceResult(ok=False, error=f"Marketplace '{name}' not found.")

    cfg.marketplaces.remove(marketplace)

    # Remove from Claude Code settings
    settings = read_cc_settings()
    extra = get_extra_marketplaces(settings)
    if name in extra:
        del extra[name]
        set_extra_marketplaces(settings, extra)
        write_cc_settings(settings)

    return MarketplaceResult(marketplace=marketplace, messages=[f"Removed marketplace '{name}'."])


# ── Plugin operations ───────────────────────────────────────────


def install_plugin(
    cfg: McpoyleConfig,
    name: str,
    marketplace_name: str | None = None,
) -> PluginResult:
    if cfg.get_plugin(name):
        return PluginResult(ok=False, error=f"Plugin '{name}' is already installed.")

    # Resolve marketplace
    if marketplace_name:
        marketplace = cfg.get_marketplace(marketplace_name)
        if not marketplace:
            return PluginResult(ok=False, error=f"Marketplace '{marketplace_name}' not found.")
    elif len(cfg.marketplaces) == 1:
        marketplace_name = cfg.marketplaces[0].name
    elif cfg.marketplaces:
        return PluginResult(ok=False, error="Multiple marketplaces available. Specify --marketplace.")
    else:
        marketplace_name = "claude-plugins-official"

    if not marketplace_name:
        marketplace_name = "claude-plugins-official"

    plugin = Plugin(name=name, marketplace=marketplace_name, enabled=True, managed=True)
    cfg.plugins.append(plugin)

    # Write to Claude Code enabledPlugins
    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)
    enabled[plugin.qualified_name] = True
    set_enabled_plugins(settings, enabled)
    write_cc_settings(settings)

    return PluginResult(plugin=plugin, messages=[f"Installed plugin '{name}' from {marketplace_name}."])


def uninstall_plugin(cfg: McpoyleConfig, name: str) -> PluginResult:
    plugin = cfg.get_plugin(name)
    if not plugin:
        return PluginResult(ok=False, error=f"Plugin '{name}' not found.")

    # Remove from enabledPlugins
    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)
    if plugin.qualified_name in enabled:
        del enabled[plugin.qualified_name]
        set_enabled_plugins(settings, enabled)
        write_cc_settings(settings)

    # Remove from groups
    for group in cfg.groups:
        if plugin.name in group.plugins:
            group.plugins.remove(plugin.name)

    cfg.plugins.remove(plugin)
    return PluginResult(plugin=plugin, messages=[f"Uninstalled plugin '{name}'."])


def enable_plugin(cfg: McpoyleConfig, name: str) -> PluginResult:
    plugin = cfg.get_plugin(name)
    if not plugin:
        return PluginResult(ok=False, error=f"Plugin '{name}' not found.")

    plugin.enabled = True

    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)
    enabled[plugin.qualified_name] = True
    set_enabled_plugins(settings, enabled)
    write_cc_settings(settings)

    return PluginResult(plugin=plugin, messages=[f"Enabled plugin '{name}'."])


def disable_plugin(cfg: McpoyleConfig, name: str) -> PluginResult:
    plugin = cfg.get_plugin(name)
    if not plugin:
        return PluginResult(ok=False, error=f"Plugin '{name}' not found.")

    plugin.enabled = False

    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)
    enabled[plugin.qualified_name] = False
    set_enabled_plugins(settings, enabled)
    write_cc_settings(settings)

    return PluginResult(plugin=plugin, messages=[f"Disabled plugin '{name}'."])


def import_plugins(cfg: McpoyleConfig) -> ImportPluginsResult:
    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)

    imported: list[Plugin] = []
    for qualified_name, is_enabled in enabled.items():
        if "@" in qualified_name:
            pname, mkt = qualified_name.rsplit("@", 1)
        else:
            pname, mkt = qualified_name, ""

        if cfg.get_plugin(pname):
            continue

        plugin = Plugin(name=pname, marketplace=mkt, enabled=bool(is_enabled), managed=False)
        cfg.plugins.append(plugin)
        imported.append(plugin)

    if imported:
        return ImportPluginsResult(
            imported=imported,
            messages=[f"Imported {len(imported)} plugin(s)."],
        )
    return ImportPluginsResult(messages=["No new plugins to import."])


# ── Rules operations ────────────────────────────────────────────


def add_rule(cfg: McpoyleConfig, path: str, group: str) -> OpResult:
    from mcpoyle.config import PathRule

    if not cfg.get_group(group):
        return OpResult(ok=False, error=f"Group '{group}' not found.")

    abs_path = str(Path(path).expanduser().resolve())

    for r in cfg.rules:
        if r.resolved_path == abs_path:
            return OpResult(ok=False, error=f"Rule for '{abs_path}' already exists (→ {r.group}).")

    cfg.rules.append(PathRule(path=path, group=group))
    return OpResult(messages=[
        f"Added rule: {path} → {group}",
        "Projects under this path will get this group on next sync.",
    ])


def remove_rule(cfg: McpoyleConfig, path: str) -> OpResult:
    abs_path = str(Path(path).expanduser().resolve())
    rule = next((r for r in cfg.rules if r.resolved_path == abs_path), None)
    if not rule:
        return OpResult(ok=False, error=f"No rule for '{path}'.")

    cfg.rules.remove(rule)
    return OpResult(messages=[f"Removed rule for '{path}'."])
