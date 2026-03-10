"""Sync logic — resolve servers for clients and write configs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from mcpoyle.clients import (
    CLIENTS,
    ProjectImport,
    get_enabled_plugins,
    get_extra_marketplaces,
    get_managed_servers,
    get_managed_servers_nested,
    import_project_servers,
    import_servers_from_client,
    project_servers_key,
    read_cc_settings,
    read_client_config,
    server_to_client_entry,
    set_enabled_plugins,
    set_extra_marketplaces,
    write_cc_settings,
    write_client_config,
    write_servers_nested,
)
from mcpoyle.config import Marketplace, McpoyleConfig, Server


def _diff_actions(label: str, new_entries: dict, managed: dict, dry_run: bool) -> tuple[list[str], bool]:
    """Compare new vs managed entries and return action descriptions + whether changes exist."""
    to_add = set(new_entries.keys()) - set(managed.keys())
    to_remove = set(managed.keys()) - set(new_entries.keys())
    to_update = {
        k for k in set(new_entries.keys()) & set(managed.keys())
        if new_entries[k] != managed[k]
    }

    if not to_add and not to_remove and not to_update:
        return [f"{label}: already in sync"], False

    actions = []
    for name in sorted(to_add):
        actions.append(f"  + {name}")
    for name in sorted(to_remove):
        actions.append(f"  - {name}")
    for name in sorted(to_update):
        actions.append(f"  ~ {name}")

    if dry_run:
        actions.insert(0, f"{label}: would sync")
    else:
        actions.append(f"{label}: synced")

    return actions, True


def sync_client(
    config: McpoyleConfig,
    client_id: str,
    dry_run: bool = False,
    project: str | None = None,
) -> list[str]:
    """Sync servers to a client. Returns list of action descriptions.

    If project is specified (Claude Code only), sync only that project's config.
    """
    client_def = CLIENTS.get(client_id)
    if not client_def:
        return [f"Unknown client: {client_id}"]

    if project and client_id != "claude-code":
        return [f"Project-level sync is only supported for claude-code, not {client_id}"]

    # Project-level sync for Claude Code
    if project:
        return _sync_project(config, client_id, project, dry_run)

    # Standard global sync
    servers = config.resolve_servers(client_id)
    new_entries = {s.name: server_to_client_entry(s) for s in servers}
    actions = []

    paths = client_def.resolved_paths
    if not paths:
        return [f"{client_def.name}: no config files found"]

    for path in paths:
        existing = read_client_config(path)
        managed = get_managed_servers(existing, client_def.servers_key)
        label = f"{client_def.name} ({path.name})"

        diff_actions, has_changes = _diff_actions(label, new_entries, managed, dry_run)
        actions.extend(diff_actions)

        if has_changes and not dry_run:
            write_client_config(path, existing, client_def.servers_key, new_entries)
            assignment = config.get_client(client_id)
            if assignment:
                assignment.last_synced = datetime.now(timezone.utc).isoformat()

    # Also sync any project-level assignments for Claude Code
    if client_id == "claude-code":
        assignment = config.get_client(client_id)
        if assignment:
            for proj in assignment.projects:
                proj_actions = _sync_project(config, client_id, proj.path, dry_run)
                actions.extend(proj_actions)

        # Sync plugins and marketplaces to Claude Code settings
        plugin_actions = _sync_cc_plugins(config, client_id, dry_run)
        actions.extend(plugin_actions)

    return actions


def _sync_project(
    config: McpoyleConfig,
    client_id: str,
    project_path: str,
    dry_run: bool,
) -> list[str]:
    """Sync servers to a Claude Code project-level config."""
    assignment = config.get_client(client_id)
    if not assignment:
        return [f"No assignment for {client_id}"]

    proj = assignment.get_project(project_path)
    if not proj:
        return [f"No project assignment for {project_path}"]

    servers = config.resolve_servers(client_id, group_name=proj.group)
    new_entries = {s.name: server_to_client_entry(s) for s in servers}

    client_def = CLIENTS[client_id]
    path = client_def.resolved_paths[0]
    key_path = project_servers_key(project_path)
    abs_path = str(Path(project_path).expanduser().resolve())

    existing = read_client_config(path)
    managed = get_managed_servers_nested(existing, key_path)
    label = f"Claude Code project ({abs_path})"

    diff_actions, has_changes = _diff_actions(label, new_entries, managed, dry_run)

    if has_changes and not dry_run:
        write_servers_nested(path, key_path, new_entries)
        proj.last_synced = datetime.now(timezone.utc).isoformat()

    return diff_actions


def _sync_cc_plugins(
    config: McpoyleConfig,
    client_id: str,
    dry_run: bool,
) -> list[str]:
    """Sync plugins and marketplaces to Claude Code's settings.json."""
    actions = []
    settings = read_cc_settings()

    # Sync plugins
    plugins = config.resolve_plugins(client_id)
    new_enabled = {p.qualified_name: p.enabled for p in plugins}
    current_enabled = get_enabled_plugins(settings)

    plugin_changes = False
    for qname, state in new_enabled.items():
        if current_enabled.get(qname) != state:
            symbol = "+" if state else "~"
            actions.append(f"  {symbol} plugin {qname} → {'enabled' if state else 'disabled'}")
            plugin_changes = True
    for qname in current_enabled:
        # Only report removals for plugins we manage
        plugin = config.get_plugin(qname.split("@")[0] if "@" in qname else qname)
        if plugin and plugin.managed and qname not in new_enabled:
            actions.append(f"  - plugin {qname}")
            plugin_changes = True

    if plugin_changes:
        if dry_run:
            actions.insert(0, "Claude Code plugins: would sync")
        else:
            # Merge: update managed plugins, leave unmanaged alone
            managed_names = {p.qualified_name for p in config.plugins if p.managed}
            for qname in list(current_enabled.keys()):
                if qname in managed_names and qname not in new_enabled:
                    del current_enabled[qname]
            current_enabled.update(new_enabled)
            set_enabled_plugins(settings, current_enabled)
            actions.append("Claude Code plugins: synced")
    else:
        actions.append("Claude Code plugins: already in sync")

    # Sync marketplaces
    current_mkts = get_extra_marketplaces(settings)
    new_mkts = {}
    for m in config.marketplaces:
        if m.name not in Marketplace.RESERVED_NAMES:
            source_dict = {"source": m.source.source}
            if m.source.repo:
                source_dict["repo"] = m.source.repo
            elif m.source.path:
                source_dict["path"] = m.source.path
            new_mkts[m.name] = {"source": source_dict}

    mkt_changes = new_mkts != current_mkts
    if mkt_changes:
        to_add = set(new_mkts.keys()) - set(current_mkts.keys())
        to_remove = set(current_mkts.keys()) - set(new_mkts.keys())
        for name in sorted(to_add):
            actions.append(f"  + marketplace {name}")
        for name in sorted(to_remove):
            actions.append(f"  - marketplace {name}")
        if dry_run:
            actions.append("Claude Code marketplaces: would sync")
        else:
            set_extra_marketplaces(settings, new_mkts)
            actions.append("Claude Code marketplaces: synced")

    if (plugin_changes or mkt_changes) and not dry_run:
        write_cc_settings(settings)

    return actions


def sync_all(config: McpoyleConfig, dry_run: bool = False) -> dict[str, list[str]]:
    """Sync all detected clients."""
    results = {}
    for client_id, client_def in CLIENTS.items():
        if client_def.is_installed:
            results[client_id] = sync_client(config, client_id, dry_run)
    return results


@dataclass
class ImportResult:
    """Result of an import operation."""
    servers: list[Server]
    project_imports: list[ProjectImport]


def do_import(config: McpoyleConfig, client_id: str) -> ImportResult:
    """Import servers from a client's config into the central config.

    For Claude Code, also scans all project-level configs.
    """
    client_def = CLIENTS.get(client_id)
    if not client_def:
        return ImportResult(servers=[], project_imports=[])

    imported = []
    for path in client_def.resolved_paths:
        existing = read_client_config(path)
        servers = import_servers_from_client(existing, client_def.servers_key)
        for server in servers:
            if not config.get_server(server.name):
                config.servers.append(server)
                imported.append(server)

    # Scan Claude Code project-level servers
    proj_imports = []
    if client_id == "claude-code":
        for path in client_def.resolved_paths:
            existing = read_client_config(path)
            project_results = import_project_servers(existing)
            for proj in project_results:
                new_servers = []
                for server in proj.servers:
                    if not config.get_server(server.name):
                        config.servers.append(server)
                        new_servers.append(server)
                if new_servers:
                    proj_imports.append(ProjectImport(path=proj.path, servers=new_servers))

    return ImportResult(servers=imported, project_imports=proj_imports)
