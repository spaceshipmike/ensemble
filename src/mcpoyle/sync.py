"""Sync logic — resolve servers for clients and write configs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from mcpoyle.clients import (
    CLIENTS,
    ProjectImport,
    ensure_project_enabled_plugins_key,
    get_enabled_plugins,
    get_extra_marketplaces,
    get_managed_servers,
    get_managed_servers_nested,
    import_project_servers,
    import_servers_from_client,
    project_servers_key,
    read_cc_settings,
    read_client_config,
    read_project_settings,
    server_to_client_entry,
    set_enabled_plugins,
    set_extra_marketplaces,
    write_cc_settings,
    write_client_config,
    write_project_settings,
    write_servers_nested,
)
from mcpoyle.config import ClientAssignment, Marketplace, McpoyleConfig, ProjectAssignment, Server, compute_entry_hash


@dataclass
class DriftInfo:
    """A server entry that was modified outside mcpoyle."""
    name: str
    current_hash: str
    stored_hash: str


def _detect_drift(managed: dict, stored_hashes: dict[str, str]) -> list[DriftInfo]:
    """Compare current managed entries against stored hashes to detect manual edits."""
    drifted = []
    for name, entry in managed.items():
        if name in stored_hashes:
            current_hash = compute_entry_hash(entry)
            if current_hash != stored_hashes[name]:
                drifted.append(DriftInfo(name=name, current_hash=current_hash, stored_hash=stored_hashes[name]))
    return drifted


def _diff_actions(
    label: str,
    new_entries: dict,
    managed: dict,
    dry_run: bool,
    stored_hashes: dict[str, str] | None = None,
    force: bool = False,
    adopt: bool = False,
) -> tuple[list[str], bool, list[DriftInfo]]:
    """Compare new vs managed entries and return action descriptions, whether changes exist, and drift info."""
    # Detect drift before computing diff
    drifted: list[DriftInfo] = []
    if stored_hashes:
        drifted = _detect_drift(managed, stored_hashes)

    to_add = set(new_entries.keys()) - set(managed.keys())
    to_remove = set(managed.keys()) - set(new_entries.keys())
    to_update = {
        k for k in set(new_entries.keys()) & set(managed.keys())
        if new_entries[k] != managed[k]
    }

    # Handle drifted entries
    drifted_names = {d.name for d in drifted}
    skipped_names: set[str] = set()
    for d in drifted:
        if d.name in to_update:
            if force:
                pass  # will be overwritten as part of to_update
            elif adopt:
                # Remove from to_update — keep the manual edit
                to_update.discard(d.name)
            else:
                # Default: skip drifted entry
                to_update.discard(d.name)
                skipped_names.add(d.name)

    if not to_add and not to_remove and not to_update and not skipped_names:
        return [f"{label}: already in sync"], False, drifted

    actions = []
    for name in sorted(skipped_names):
        actions.append(f"  ⚠ {name} was modified outside mcpoyle (use --force to overwrite, --adopt to keep)")
    for name in sorted(to_add):
        actions.append(f"  + {name}")
    for name in sorted(to_remove):
        actions.append(f"  - {name}")
    for name in sorted(to_update):
        suffix = " (overwriting manual edit)" if name in drifted_names and force else ""
        actions.append(f"  ~ {name}{suffix}")

    if dry_run:
        actions.insert(0, f"{label}: would sync")
    else:
        actions.append(f"{label}: synced")

    return actions, True, drifted


def sync_client(
    config: McpoyleConfig,
    client_id: str,
    dry_run: bool = False,
    project: str | None = None,
    force: bool = False,
    adopt: bool = False,
) -> list[str]:
    """Sync servers to a client. Returns list of action descriptions.

    If project is specified (Claude Code only), sync only that project's config.
    force: overwrite manually-edited entries
    adopt: update mcpoyle's registry to match manually-edited entries
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

    assignment = config.get_client(client_id)
    stored_hashes = assignment.server_hashes if assignment else {}

    paths = client_def.resolved_paths
    if not paths:
        return [f"{client_def.name}: no config files found"]

    for path in paths:
        existing = read_client_config(path)
        managed = get_managed_servers(existing, client_def.servers_key)
        label = f"{client_def.name} ({path.name})"

        diff_actions, has_changes, drifted = _diff_actions(
            label, new_entries, managed, dry_run,
            stored_hashes=stored_hashes, force=force, adopt=adopt,
        )
        actions.extend(diff_actions)

        # Handle --adopt: update mcpoyle's server registry from manual edits
        if adopt and drifted and not dry_run:
            for d in drifted:
                if d.name in managed:
                    _adopt_server_entry(config, d.name, managed[d.name])

        # Build the entries to actually write (skip drifted unless force)
        if has_changes and not dry_run:
            drifted_names = {d.name for d in drifted}
            skipped = drifted_names - (set() if force else set())
            if not force and not adopt:
                # Remove drifted entries from new_entries so they aren't overwritten
                entries_to_write = {k: v for k, v in new_entries.items() if k not in drifted_names}
                # Re-add drifted entries with their current (manual) values
                for name in drifted_names:
                    if name in managed:
                        entries_to_write[name] = managed[name]
            else:
                entries_to_write = new_entries

            write_client_config(path, existing, client_def.servers_key, entries_to_write)

            # Store hashes of what we wrote
            if not assignment:
                assignment = ClientAssignment(id=client_id)
                config.clients.append(assignment)
            assignment.server_hashes = {
                name: compute_entry_hash(entry)
                for name, entry in entries_to_write.items()
            }
            assignment.last_synced = datetime.now(timezone.utc).isoformat()

    # Also sync any project-level assignments for Claude Code
    if client_id == "claude-code":
        if not assignment:
            assignment = config.get_client(client_id)
        if not assignment:
            assignment = ClientAssignment(id=client_id)
            config.clients.append(assignment)

        # Sync explicitly assigned projects
        for proj in assignment.projects:
            proj_actions = _sync_project(config, client_id, proj.path, dry_run)
            actions.extend(proj_actions)

        # Apply path rules to projects discovered in ~/.claude.json
        if config.rules:
            rule_actions = _apply_path_rules(config, assignment, paths, dry_run)
            actions.extend(rule_actions)

        # Sync plugins and marketplaces to Claude Code settings
        plugin_actions = _sync_cc_plugins(config, client_id, dry_run)
        actions.extend(plugin_actions)

    return actions


def _adopt_server_entry(config: McpoyleConfig, name: str, entry: dict) -> None:
    """Update mcpoyle's server registry to match a manually-edited client entry."""
    server = config.get_server(name)
    if not server:
        return
    server.command = entry.get("command", server.command)
    server.args = entry.get("args", server.args)
    server.env = entry.get("env", server.env)
    transport = entry.get("transport", "stdio")
    if transport:
        server.transport = transport


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

    diff_actions, has_changes, _drifted = _diff_actions(label, new_entries, managed, dry_run)

    if has_changes and not dry_run:
        write_servers_nested(path, key_path, new_entries)
        proj.last_synced = datetime.now(timezone.utc).isoformat()

    # Sync project-level plugins to .claude/settings.local.json
    plugins = config.resolve_plugins(client_id, group_name=proj.group)
    if plugins:
        plugin_actions = _sync_project_plugins(config, plugins, abs_path, dry_run)
        diff_actions.extend(plugin_actions)

    return diff_actions


def _sync_project_plugins(
    config: McpoyleConfig,
    plugins: list,
    project_path: str,
    dry_run: bool,
) -> list[str]:
    """Sync plugins to a project's .claude/settings.local.json."""
    actions = []
    new_enabled = {p.qualified_name: p.enabled for p in plugins}

    local_settings = read_project_settings(project_path, local=True)
    current_enabled = get_enabled_plugins(local_settings)

    has_changes = False
    for qname, state in new_enabled.items():
        if current_enabled.get(qname) != state:
            symbol = "+" if state else "~"
            actions.append(f"  {symbol} plugin {qname} → {'enabled' if state else 'disabled'}")
            has_changes = True

    if has_changes:
        label = f"project plugins ({project_path})"
        if dry_run:
            actions.insert(0, f"{label}: would sync to .claude/settings.local.json")
        else:
            # Workaround for CC bug #27247: ensure enabledPlugins key exists in settings.json
            ensure_project_enabled_plugins_key(project_path)
            current_enabled.update(new_enabled)
            set_enabled_plugins(local_settings, current_enabled)
            write_project_settings(project_path, local_settings, local=True)
            actions.append(f"{label}: synced to .claude/settings.local.json")

    return actions


def _apply_path_rules(
    config: McpoyleConfig,
    assignment: ClientAssignment,
    cc_config_paths: list[Path],
    dry_run: bool,
) -> list[str]:
    """Discover projects in ~/.claude.json that match path rules but have no explicit assignment."""
    actions = []
    explicitly_assigned = {p.path for p in assignment.projects}

    # Scan ~/.claude.json for project paths
    for config_path in cc_config_paths:
        cc_data = read_client_config(config_path)
        projects = cc_data.get("projects", {})
        if not isinstance(projects, dict):
            continue

        for proj_path in projects:
            if proj_path in explicitly_assigned:
                continue

            rule = config.match_rule(proj_path)
            if not rule:
                continue

            # Auto-assign this project via the rule
            proj = ProjectAssignment(path=proj_path, group=rule.group)
            assignment.projects.append(proj)
            explicitly_assigned.add(proj_path)

            proj_actions = _sync_project(config, "claude-code", proj_path, dry_run)
            if proj_actions:
                proj_actions.insert(0, f"  (matched rule: {rule.path} → {rule.group})")
            actions.extend(proj_actions)

    return actions


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


def sync_all(
    config: McpoyleConfig,
    dry_run: bool = False,
    force: bool = False,
    adopt: bool = False,
) -> dict[str, list[str]]:
    """Sync all detected clients."""
    results = {}
    for client_id, client_def in CLIENTS.items():
        if client_def.is_installed:
            results[client_id] = sync_client(config, client_id, dry_run, force=force, adopt=adopt)
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
