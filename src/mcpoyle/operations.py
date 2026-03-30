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
    get_managed_servers,
    read_cc_settings,
    read_client_config,
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
    ServerOrigin,
    Skill,
    ToolInfo,
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
    url: str = "",
    auth_type: str = "",
    auth_ref: str = "",
    origin: ServerOrigin | None = None,
    tools: list[ToolInfo] | None = None,
) -> ServerResult:
    if cfg.get_server(name):
        return ServerResult(ok=False, error=f"Server '{name}' already exists.")

    server = Server(
        name=name,
        command=command,
        args=args or [],
        env=env or {},
        transport=transport,
        url=url,
        auth_type=auth_type,
        auth_ref=auth_ref,
        origin=origin or ServerOrigin(),
        tools=tools or [],
    )
    cfg.servers.append(server)
    return ServerResult(server=server, messages=[f"Added server '{name}'."])


def _find_orphaned_in_clients(name: str) -> list[str]:
    """Check if a server name exists as a __mcpoyle-marked entry in any client config."""
    found_in: list[str] = []
    for client in CLIENTS.values():
        for path in client.resolved_paths:
            try:
                config = read_client_config(path)
            except Exception:
                continue
            managed = get_managed_servers(config, client.servers_key)
            if name in managed:
                found_in.append(f"{client.name} ({path})")
    return found_in


def remove_server(cfg: McpoyleConfig, name: str) -> ServerResult:
    server = cfg.get_server(name)
    if not server:
        orphan_locations = _find_orphaned_in_clients(name)
        if orphan_locations:
            locations = ", ".join(orphan_locations)
            return ServerResult(
                ok=False,
                error=f"Server '{name}' not found in mcpoyle registry, "
                f"but exists as orphaned mcpoyle entry in: {locations}. "
                f"Run 'mcp import' to adopt it, or remove it manually from the client config.",
            )
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


# ── Skill operations ───────────────────────────────────────────


@dataclass
class SkillResult(OpResult):
    skill: Skill | None = None


def install_skill(
    cfg: McpoyleConfig,
    name: str,
    description: str = "",
    origin: str = "manual",
    dependencies: list[str] | None = None,
    tags: list[str] | None = None,
    body: str = "",
) -> SkillResult:
    """Add a skill to the config and write it to the canonical store."""
    if cfg.get_skill(name):
        return SkillResult(ok=False, error=f"Skill '{name}' already exists.")

    skill = Skill(
        name=name,
        description=description,
        origin=origin,
        dependencies=dependencies or [],
        tags=tags or [],
    )

    # Write to canonical store
    from mcpoyle.skills import write_skill_md
    path = write_skill_md(skill, body)
    skill.path = str(path)

    cfg.skills.append(skill)
    return SkillResult(skill=skill, messages=[f"Installed skill '{name}'."])


def uninstall_skill(cfg: McpoyleConfig, name: str) -> SkillResult:
    """Remove a skill from config and delete from canonical store."""
    skill = cfg.get_skill(name)
    if not skill:
        return SkillResult(ok=False, error=f"Skill '{name}' not found.")

    # Remove from canonical store
    from mcpoyle.skills import delete_skill_md
    delete_skill_md(name)

    # Remove from groups
    for group in cfg.groups:
        if name in group.skills:
            group.skills.remove(name)

    cfg.skills.remove(skill)
    return SkillResult(skill=skill, messages=[f"Removed skill '{name}'."])


def enable_skill(cfg: McpoyleConfig, name: str) -> SkillResult:
    skill = cfg.get_skill(name)
    if not skill:
        return SkillResult(ok=False, error=f"Skill '{name}' not found.")
    skill.enabled = True
    return SkillResult(skill=skill, messages=[f"Enabled skill '{name}'."])


def disable_skill(cfg: McpoyleConfig, name: str) -> SkillResult:
    skill = cfg.get_skill(name)
    if not skill:
        return SkillResult(ok=False, error=f"Skill '{name}' not found.")
    skill.enabled = False
    return SkillResult(skill=skill, messages=[f"Disabled skill '{name}'."])


def add_skill_to_group(cfg: McpoyleConfig, group_name: str, skill_name: str) -> OpResult:
    group = cfg.get_group(group_name)
    if not group:
        return OpResult(ok=False, error=f"Group '{group_name}' not found.")
    if not cfg.get_skill(skill_name):
        return OpResult(ok=False, error=f"Skill '{skill_name}' not found.")
    if skill_name in group.skills:
        return OpResult(messages=[f"Skill '{skill_name}' already in group '{group_name}'."])
    group.skills.append(skill_name)
    return OpResult(messages=[f"Added '{skill_name}' to group '{group_name}'."])


def remove_skill_from_group(cfg: McpoyleConfig, group_name: str, skill_name: str) -> OpResult:
    group = cfg.get_group(group_name)
    if not group:
        return OpResult(ok=False, error=f"Group '{group_name}' not found.")
    if skill_name not in group.skills:
        return OpResult(ok=False, error=f"Skill '{skill_name}' not in group '{group_name}'.")
    group.skills.remove(skill_name)
    return OpResult(messages=[f"Removed '{skill_name}' from group '{group_name}'."])


# ── Trust tier + provenance operations ─────────────────────────


VALID_TRUST_TIERS = ("official", "community", "local")


def set_trust_tier(cfg: McpoyleConfig, name: str, tier: str) -> ServerResult:
    """Set the trust tier for a server."""
    if tier not in VALID_TRUST_TIERS:
        return ServerResult(ok=False, error=f"Invalid trust tier '{tier}'. Valid: {', '.join(VALID_TRUST_TIERS)}")
    server = cfg.get_server(name)
    if not server:
        return ServerResult(ok=False, error=f"Server '{name}' not found.")
    server.origin.trust_tier = tier
    return ServerResult(server=server, messages=[f"Set trust tier for '{name}' to '{tier}'."])


def pin_item(cfg: McpoyleConfig, name: str) -> OpResult:
    """Pin a server or skill to its current version (disable auto-update)."""
    server = cfg.get_server(name)
    if server:
        if server.origin.source == "registry":
            server.origin.source = "registry"  # keep source
        return OpResult(messages=[f"Pinned server '{name}' — will not auto-update."])

    skill = cfg.get_skill(name)
    if skill:
        skill.mode = "pin"
        return OpResult(messages=[f"Pinned skill '{name}' — will not auto-update."])

    return OpResult(ok=False, error=f"'{name}' is not a known server or skill.")


def track_item(cfg: McpoyleConfig, name: str) -> OpResult:
    """Track a server or skill for auto-updates from registry."""
    server = cfg.get_server(name)
    if server:
        if not server.origin.registry_id:
            return OpResult(ok=False, error=f"Server '{name}' has no registry ID — cannot track.")
        return OpResult(messages=[f"Tracking server '{name}' — will check for registry updates."])

    skill = cfg.get_skill(name)
    if skill:
        skill.mode = "track"
        return OpResult(messages=[f"Tracking skill '{name}' — will check for updates."])

    return OpResult(ok=False, error=f"'{name}' is not a known server or skill.")


# ── Collision detection ────────────────────────────────────────


@dataclass
class CollisionInfo:
    """A scope conflict detected during sync preview."""
    item_name: str
    item_type: str  # "server" or "plugin" or "skill"
    global_group: str
    project_group: str
    project_path: str


def detect_collisions(cfg: McpoyleConfig, client_id: str = "claude-code") -> list[CollisionInfo]:
    """Detect scope conflicts between global and project-level assignments.

    A collision is when the same server/plugin/skill appears in both the
    global group and a project group (redundant) or when it appears in
    multiple project groups.
    """
    collisions: list[CollisionInfo] = []
    assignment = cfg.get_client(client_id)
    if not assignment or not assignment.group:
        return collisions

    global_group = cfg.get_group(assignment.group)
    if not global_group:
        return collisions

    for proj in assignment.projects:
        if not proj.group:
            continue
        proj_group = cfg.get_group(proj.group)
        if not proj_group:
            continue

        # Check servers
        for name in proj_group.servers:
            if name in global_group.servers:
                collisions.append(CollisionInfo(
                    item_name=name, item_type="server",
                    global_group=assignment.group,
                    project_group=proj.group, project_path=proj.path,
                ))

        # Check plugins
        for name in proj_group.plugins:
            if name in global_group.plugins:
                collisions.append(CollisionInfo(
                    item_name=name, item_type="plugin",
                    global_group=assignment.group,
                    project_group=proj.group, project_path=proj.path,
                ))

        # Check skills
        for name in proj_group.skills:
            if name in global_group.skills:
                collisions.append(CollisionInfo(
                    item_name=name, item_type="skill",
                    global_group=assignment.group,
                    project_group=proj.group, project_path=proj.path,
                ))

    return collisions


# ── Dependency intelligence ────────────────────────────────────


@dataclass
class SkillDependencyInfo:
    """Dependency status for a skill."""
    skill_name: str
    dependencies: list[str]
    satisfied: list[str]
    missing: list[str]
    disabled: list[str]


def check_skill_dependencies(cfg: McpoyleConfig) -> list[SkillDependencyInfo]:
    """Check all skills' server dependencies and report status."""
    results: list[SkillDependencyInfo] = []
    for skill in cfg.skills:
        if not skill.dependencies:
            continue
        satisfied = []
        missing = []
        disabled = []
        for dep in skill.dependencies:
            server = cfg.get_server(dep)
            if not server:
                missing.append(dep)
            elif not server.enabled:
                disabled.append(dep)
            else:
                satisfied.append(dep)
        results.append(SkillDependencyInfo(
            skill_name=skill.name,
            dependencies=skill.dependencies,
            satisfied=satisfied, missing=missing, disabled=disabled,
        ))
    return results


# ── Profile-as-plugin (groups export) ──────────────────────────


def export_group_as_plugin(cfg: McpoyleConfig, group_name: str, output_dir: str = "") -> OpResult:
    """Compile a group into a Claude Code plugin directory.

    Creates a plugin directory structure that can be registered as a
    local marketplace directory.
    """
    group = cfg.get_group(group_name)
    if not group:
        return OpResult(ok=False, error=f"Group '{group_name}' not found.")

    from pathlib import Path
    import json as _json

    # Default output: ~/.config/mcpoyle/plugins/<group-name>
    if not output_dir:
        output_dir = str(Path.home() / ".config" / "mcpoyle" / "plugins" / group_name)

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Build plugin manifest
    manifest = {
        "name": group_name,
        "description": group.description or f"Plugin profile generated from group '{group_name}'",
        "servers": {},
        "skills": [],
    }

    # Include server configs
    for sname in group.servers:
        server = cfg.get_server(sname)
        if server:
            entry: dict = {}
            if server.command:
                entry["command"] = server.command
            if server.args:
                entry["args"] = server.args
            if server.env:
                entry["env"] = server.env
            manifest["servers"][sname] = entry

    # Include skill names
    manifest["skills"] = list(group.skills)

    # Write manifest
    manifest_path = out / "plugin.json"
    manifest_path.write_text(_json.dumps(manifest, indent=2) + "\n")

    # Copy skills if any
    if group.skills:
        skills_out = out / "skills"
        skills_out.mkdir(exist_ok=True)
        from mcpoyle.skills import skill_md_path
        import shutil
        for sname in group.skills:
            src = skill_md_path(sname).parent
            if src.exists():
                dst = skills_out / sname
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)

    messages = [
        f"Exported group '{group_name}' as plugin to {out}",
        f"  {len(group.servers)} server(s), {len(group.skills)} skill(s)",
    ]
    if group.plugins:
        messages.append(f"  {len(group.plugins)} plugin reference(s) (not included in export)")

    return OpResult(messages=messages)
