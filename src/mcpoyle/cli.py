"""CLI commands for mcpoyle."""

from __future__ import annotations

import click

from mcpoyle.clients import CLIENTS
from mcpoyle.config import (
    McpoyleConfig,
    load_config,
    save_config,
)
from mcpoyle.sync import do_import, sync_all, sync_client
from mcpoyle import operations as ops


@click.group()
@click.pass_context
def cli(ctx: click.Context) -> None:
    """Centrally manage MCP server configurations across AI clients."""
    ctx.ensure_object(dict)
    ctx.obj["config"] = load_config()


def _save(ctx: click.Context) -> None:
    save_config(ctx.obj["config"])


def _handle(ctx: click.Context, result: ops.OpResult, save: bool = True) -> None:
    """Handle an operation result: print messages/errors, save if needed, exit on failure."""
    if not result.ok:
        click.echo(result.error, err=True)
        for msg in result.messages:
            click.echo(msg)
        raise SystemExit(1)
    if save:
        _save(ctx)
    for msg in result.messages:
        click.echo(msg)


# ── Server commands ──────────────────────────────────────────────


@cli.command("list")
@click.pass_context
def list_servers(ctx: click.Context) -> None:
    """List all servers."""
    cfg: McpoyleConfig = ctx.obj["config"]
    if not cfg.servers:
        click.echo("No servers configured.")
        return
    for s in cfg.servers:
        status = click.style("on", fg="green") if s.enabled else click.style("off", fg="red")
        click.echo(f"  {s.name} [{status}] — {s.command} {' '.join(s.args)}")


@cli.command()
@click.argument("name")
@click.option("--command", "cmd", required=True, help="Command to run the server")
@click.option("--args", "args_", multiple=True, help="Arguments for the command")
@click.option("--env", "env_pairs", multiple=True, help="Environment variables (KEY=VAL)")
@click.option("--transport", default="stdio", help="Transport type")
@click.pass_context
def add(ctx: click.Context, name: str, cmd: str, args_: tuple[str, ...], env_pairs: tuple[str, ...], transport: str) -> None:
    """Add a new server."""
    env = {}
    for pair in env_pairs:
        if "=" not in pair:
            click.echo(f"Invalid env format: {pair} (expected KEY=VAL)", err=True)
            raise SystemExit(1)
        k, v = pair.split("=", 1)
        env[k] = v

    result = ops.add_server(ctx.obj["config"], name, cmd, list(args_), env, transport)
    _handle(ctx, result)


@cli.command()
@click.argument("name")
@click.pass_context
def remove(ctx: click.Context, name: str) -> None:
    """Remove a server."""
    result = ops.remove_server(ctx.obj["config"], name)
    _handle(ctx, result)


@cli.command()
@click.argument("name")
@click.pass_context
def enable(ctx: click.Context, name: str) -> None:
    """Enable a server."""
    result = ops.enable_server(ctx.obj["config"], name)
    _handle(ctx, result)


@cli.command()
@click.argument("name")
@click.pass_context
def disable(ctx: click.Context, name: str) -> None:
    """Disable a server."""
    result = ops.disable_server(ctx.obj["config"], name)
    _handle(ctx, result)


@cli.command()
@click.argument("name")
@click.pass_context
def show(ctx: click.Context, name: str) -> None:
    """Show server details."""
    cfg: McpoyleConfig = ctx.obj["config"]
    server = cfg.get_server(name)
    if not server:
        click.echo(f"Server '{name}' not found.", err=True)
        raise SystemExit(1)

    status = click.style("enabled", fg="green") if server.enabled else click.style("disabled", fg="red")
    click.echo(f"Name:      {server.name}")
    click.echo(f"Status:    {status}")
    click.echo(f"Transport: {server.transport}")
    click.echo(f"Command:   {server.command}")
    click.echo(f"Args:      {' '.join(server.args) if server.args else '(none)'}")
    if server.env:
        click.echo("Env:")
        for k, v in server.env.items():
            click.echo(f"  {k}={v}")

    # Show group membership
    member_of = [g.name for g in cfg.groups if server.name in g.servers]
    if member_of:
        click.echo(f"Groups:    {', '.join(member_of)}")


# ── Group commands ───────────────────────────────────────────────


@cli.group("groups")
def groups_group() -> None:
    """Manage server groups."""


@groups_group.command("list")
@click.pass_context
def groups_list(ctx: click.Context) -> None:
    """List all groups."""
    cfg: McpoyleConfig = ctx.obj["config"]
    if not cfg.groups:
        click.echo("No groups configured.")
        return
    for g in cfg.groups:
        desc = f" — {g.description}" if g.description else ""
        parts = []
        if g.servers:
            parts.append(f"{len(g.servers)} servers")
        if g.plugins:
            parts.append(f"{len(g.plugins)} plugins")
        counts = ", ".join(parts) if parts else "empty"
        click.echo(f"  {g.name} ({counts}){desc}")


@groups_group.command("create")
@click.argument("name")
@click.option("--description", default="", help="Group description")
@click.pass_context
def groups_create(ctx: click.Context, name: str, description: str) -> None:
    """Create a new group."""
    result = ops.create_group(ctx.obj["config"], name, description)
    _handle(ctx, result)


@groups_group.command("delete")
@click.argument("name")
@click.pass_context
def groups_delete(ctx: click.Context, name: str) -> None:
    """Delete a group."""
    result = ops.delete_group(ctx.obj["config"], name)
    _handle(ctx, result)


@groups_group.command("show")
@click.argument("name")
@click.pass_context
def groups_show(ctx: click.Context, name: str) -> None:
    """Show group members."""
    cfg: McpoyleConfig = ctx.obj["config"]
    group = cfg.get_group(name)
    if not group:
        click.echo(f"Group '{name}' not found.", err=True)
        raise SystemExit(1)
    click.echo(f"Group: {group.name}")
    if group.description:
        click.echo(f"Description: {group.description}")

    if group.servers:
        click.echo("Servers:")
        for sname in group.servers:
            server = cfg.get_server(sname)
            if server:
                status = click.style("on", fg="green") if server.enabled else click.style("off", fg="red")
                click.echo(f"  {sname} [{status}]")
            else:
                click.echo(f"  {sname} [missing]")
    else:
        click.echo("Servers: (none)")

    if group.plugins:
        click.echo("Plugins:")
        for pname in group.plugins:
            plugin = cfg.get_plugin(pname)
            if plugin:
                status = click.style("on", fg="green") if plugin.enabled else click.style("off", fg="red")
                click.echo(f"  {pname} [{status}]")
            else:
                click.echo(f"  {pname} [missing]")


@groups_group.command("add-server")
@click.argument("group_name")
@click.argument("server_name")
@click.pass_context
def groups_add_server(ctx: click.Context, group_name: str, server_name: str) -> None:
    """Add a server to a group."""
    result = ops.add_server_to_group(ctx.obj["config"], group_name, server_name)
    _handle(ctx, result)


@groups_group.command("remove-server")
@click.argument("group_name")
@click.argument("server_name")
@click.pass_context
def groups_remove_server(ctx: click.Context, group_name: str, server_name: str) -> None:
    """Remove a server from a group."""
    result = ops.remove_server_from_group(ctx.obj["config"], group_name, server_name)
    _handle(ctx, result)


@groups_group.command("add-plugin")
@click.argument("group_name")
@click.argument("plugin_name")
@click.pass_context
def groups_add_plugin(ctx: click.Context, group_name: str, plugin_name: str) -> None:
    """Add a plugin to a group."""
    result = ops.add_plugin_to_group(ctx.obj["config"], group_name, plugin_name)
    _handle(ctx, result)


@groups_group.command("remove-plugin")
@click.argument("group_name")
@click.argument("plugin_name")
@click.pass_context
def groups_remove_plugin(ctx: click.Context, group_name: str, plugin_name: str) -> None:
    """Remove a plugin from a group."""
    result = ops.remove_plugin_from_group(ctx.obj["config"], group_name, plugin_name)
    _handle(ctx, result)


# ── Client commands ──────────────────────────────────────────────


@cli.command("clients")
@click.pass_context
def clients_cmd(ctx: click.Context) -> None:
    """Detect installed clients and show sync status."""
    cfg: McpoyleConfig = ctx.obj["config"]
    for client_id, client_def in CLIENTS.items():
        installed = click.style("installed", fg="green") if client_def.is_installed else click.style("not found", fg="yellow")
        assignment = cfg.get_client(client_id)
        group_info = ""
        if assignment:
            if assignment.group:
                group_info = f" | group: {assignment.group}"
            else:
                group_info = " | all servers"
            if assignment.last_synced:
                group_info += f" | last sync: {assignment.last_synced[:19]}"
        click.echo(f"  {client_def.name}: {installed}{group_info}")
        # Show project-level assignments for Claude Code
        if assignment and assignment.projects:
            for proj in assignment.projects:
                proj_group = proj.group if proj.group else "all servers"
                click.echo(f"    project: {proj.path} | {proj_group}")


@cli.command()
@click.argument("client")
@click.argument("group", required=False)
@click.option("--all", "assign_all", is_flag=True, help="Assign all enabled servers (default)")
@click.option("--project", "project_path", default=None, help="Project path (Claude Code only)")
@click.pass_context
def assign(ctx: click.Context, client: str, group: str | None, assign_all: bool, project_path: str | None) -> None:
    """Assign a group to a client."""
    result = ops.assign_client(ctx.obj["config"], client, group, assign_all, project_path)
    _handle(ctx, result)


@cli.command()
@click.argument("client")
@click.option("--project", "project_path", default=None, help="Project path (Claude Code only)")
@click.pass_context
def unassign(ctx: click.Context, client: str, project_path: str | None) -> None:
    """Remove group assignment from a client (reverts to all servers)."""
    result = ops.unassign_client(ctx.obj["config"], client, project_path)
    _handle(ctx, result)


# ── Rules commands ───────────────────────────────────────────────


@cli.group("rules")
def rules_group() -> None:
    """Manage path-based group rules."""


@rules_group.command("list")
@click.pass_context
def rules_list(ctx: click.Context) -> None:
    """List all path rules."""
    cfg: McpoyleConfig = ctx.obj["config"]
    if not cfg.rules:
        click.echo("No path rules configured.")
        return
    for r in cfg.rules:
        click.echo(f"  {r.path} → {r.group}")


@rules_group.command("add")
@click.argument("path")
@click.argument("group")
@click.pass_context
def rules_add(ctx: click.Context, path: str, group: str) -> None:
    """Add a path rule: projects under PATH get GROUP.

    Example: mcpoyle rules add ~/Projects/ assistant
    """
    result = ops.add_rule(ctx.obj["config"], path, group)
    _handle(ctx, result)


@rules_group.command("remove")
@click.argument("path")
@click.pass_context
def rules_remove(ctx: click.Context, path: str) -> None:
    """Remove a path rule."""
    result = ops.remove_rule(ctx.obj["config"], path)
    _handle(ctx, result)


# ── Projects command ─────────────────────────────────────────────


@cli.command("projects")
@click.pass_context
def projects_cmd(ctx: click.Context) -> None:
    """List registry projects with MCP server status."""
    from mcpoyle.projects import is_available, list_projects

    if not is_available():
        click.echo("Project registry not found (~/.local/share/project-registry/registry.db).")
        return

    cfg: McpoyleConfig = ctx.obj["config"]
    projects = list_projects()
    if not projects:
        click.echo("No active projects in registry.")
        return

    for p in projects:
        # Find if any mcpoyle assignment exists for this project's paths
        group_info = "—"
        for path in p.paths:
            for client in cfg.clients:
                proj_assign = client.get_project(path)
                if proj_assign and proj_assign.group:
                    group_info = proj_assign.group
                    break
            if group_info != "—":
                break

        # Count servers in scope
        if group_info != "—":
            group = cfg.get_group(group_info)
            server_count = len(group.servers) if group else 0
        else:
            server_count = len([s for s in cfg.servers if s.enabled])

        paths_str = ", ".join(p.paths[:2])
        if len(p.paths) > 2:
            paths_str += f" (+{len(p.paths) - 2})"

        click.echo(f"  {p.display_name}")
        click.echo(f"    group: {group_info} | {server_count} servers | {paths_str}")


# ── Init command ─────────────────────────────────────────────────


@cli.command("init")
@click.option("--auto", "auto_mode", is_flag=True, help="Non-interactive: import all, no groups, sync all")
@click.pass_context
def init_cmd(ctx: click.Context, auto_mode: bool) -> None:
    """Guided first-run setup.

    Walks through client detection, server import, group creation,
    assignment, and initial sync. Safe to re-run.
    """
    cfg: McpoyleConfig = ctx.obj["config"]

    # Step 1: Detect clients
    click.echo("Detected clients:")
    installed_clients = []
    for client_id, client_def in CLIENTS.items():
        if client_def.is_installed:
            click.echo(f"  {click.style('✓', fg='green')} {client_def.name} (installed)")
            installed_clients.append(client_id)
        else:
            click.echo(f"  {click.style('·', fg='yellow')} {client_def.name} (not found)")
    click.echo()

    if not installed_clients:
        click.echo("No clients detected. Install an AI client and re-run mcpoyle init.")
        return

    # Step 2: Import existing servers
    has_existing = len(cfg.servers) > 0
    if has_existing and not auto_mode:
        click.echo(f"Central config already has {len(cfg.servers)} server(s). Skipping import.\n")
    else:
        for client_id in installed_clients:
            client_name = CLIENTS[client_id].name
            should_import = auto_mode or click.confirm(f"Import servers from {client_name}?", default=True)
            if should_import:
                result = do_import(cfg, client_id)
                if result.servers:
                    for s in result.servers:
                        click.echo(f"  + {s.name} ({s.command} {' '.join(s.args)})")
                    click.echo(f"  Imported {len(result.servers)} server(s) from {client_name}.")
                if result.project_imports:
                    for proj in result.project_imports:
                        click.echo(f"  Imported {len(proj.servers)} server(s) from project {proj.path}.")
        if cfg.servers:
            _save(ctx)
            click.echo()

    # Step 3: Create groups (skip in auto mode)
    if not auto_mode and cfg.servers:
        while click.confirm("Create a group?", default=False):
            name = click.prompt("  Group name")
            desc = click.prompt("  Description", default="")
            result = ops.create_group(cfg, name, desc)
            if not result.ok:
                click.echo(f"  {result.error}")
                continue
            _save(ctx)
            click.echo(f"  Created group '{name}'.")

            # Offer to add servers to the group
            for server in cfg.servers:
                if click.confirm(f"    Add {server.name} to {name}?", default=True):
                    ops.add_server_to_group(cfg, name, server.name)
            _save(ctx)
            click.echo()

    # Step 4: Assign groups to clients
    if not auto_mode and cfg.groups:
        click.echo("Assign groups to clients:")
        for client_id in installed_clients:
            client_name = CLIENTS[client_id].name
            assignment = cfg.get_client(client_id)
            if assignment and assignment.group:
                click.echo(f"  {client_name}: already assigned to '{assignment.group}'")
                continue

            group_names = [g.name for g in cfg.groups]
            click.echo(f"  {client_name}:")
            click.echo(f"    0) all servers (default)")
            for i, gname in enumerate(group_names, 1):
                click.echo(f"    {i}) {gname}")

            choice = click.prompt("    Choice", default="0")
            if choice != "0" and choice.isdigit() and 1 <= int(choice) <= len(group_names):
                group_name = group_names[int(choice) - 1]
                ops.assign_client(cfg, client_id, group_name)
                click.echo(f"    → {group_name}")
            else:
                ops.assign_client(cfg, client_id, None, assign_all=True)
                click.echo(f"    → all servers")
        _save(ctx)
        click.echo()

    # Step 5: Sync
    if not cfg.servers:
        click.echo("No servers to sync. Add servers with 'mcpoyle add' or 'mcpoyle registry add'.")
        return

    if auto_mode:
        click.echo("Syncing all detected clients...")
        results = sync_all(cfg, dry_run=False)
        for cid, actions in results.items():
            for a in actions:
                click.echo(a)
        _save(ctx)
    else:
        click.echo("Preview sync... (dry run)")
        results = sync_all(cfg, dry_run=True)
        for cid, actions in results.items():
            for a in actions:
                click.echo(a)
        click.echo()

        if click.confirm("Apply?", default=True):
            results = sync_all(cfg, dry_run=False)
            for cid, actions in results.items():
                for a in actions:
                    click.echo(a)
            _save(ctx)
        else:
            click.echo("Skipped. Run 'mcpoyle sync' when ready.")

    click.echo()
    click.echo("Setup complete. Run 'mcpoyle tui' to manage, or 'mcpoyle sync' after changes.")


# ── Scope command ────────────────────────────────────────────────


@cli.command()
@click.argument("name")
@click.option("--project", "project_path", required=True, help="Project to scope to")
@click.pass_context
def scope(ctx: click.Context, name: str, project_path: str) -> None:
    """Move a server or plugin from global to project-only scope.

    Removes the item from the global Claude Code assignment and adds it
    to the project's group. If no groups exist yet, they are created
    automatically.
    """
    result = ops.scope_item(ctx.obj["config"], name, project_path)
    _handle(ctx, result)


# ── Sync commands ────────────────────────────────────────────────


@cli.command()
@click.argument("client", required=False)
@click.option("--dry-run", is_flag=True, help="Show what would change without writing")
@click.option("--project", "project_path", default=None, help="Project path (Claude Code only)")
@click.option("--force", is_flag=True, help="Overwrite entries modified outside mcpoyle")
@click.option("--adopt", is_flag=True, help="Update mcpoyle registry to match manual edits")
@click.pass_context
def sync(ctx: click.Context, client: str | None, dry_run: bool, project_path: str | None, force: bool, adopt: bool) -> None:
    """Sync server configs to clients."""
    cfg: McpoyleConfig = ctx.obj["config"]

    if force and adopt:
        click.echo("Cannot use --force and --adopt together.", err=True)
        raise SystemExit(1)

    if dry_run:
        click.echo("Dry run — no files will be modified.\n")

    if project_path:
        if client and client != "claude-code":
            click.echo("--project is only supported for claude-code.", err=True)
            raise SystemExit(1)
        from pathlib import Path
        abs_path = str(Path(project_path).expanduser().resolve())
        actions = sync_client(cfg, "claude-code", dry_run, project=abs_path)
        for a in actions:
            click.echo(a)
    elif client:
        if client not in CLIENTS:
            click.echo(f"Unknown client: {client}", err=True)
            raise SystemExit(1)
        actions = sync_client(cfg, client, dry_run, force=force, adopt=adopt)
        for a in actions:
            click.echo(a)
    else:
        results = sync_all(cfg, dry_run, force=force, adopt=adopt)
        if not results:
            click.echo("No installed clients detected.")
            return
        for cid, actions in results.items():
            for a in actions:
                click.echo(a)

    if not dry_run:
        _save(ctx)


@cli.command("import")
@click.argument("client")
@click.pass_context
def import_cmd(ctx: click.Context, client: str) -> None:
    """Import servers from a client's existing config.

    For Claude Code, also scans all project-level configs.
    """
    cfg: McpoyleConfig = ctx.obj["config"]
    if client not in CLIENTS:
        click.echo(f"Unknown client: {client}", err=True)
        raise SystemExit(1)

    result = do_import(cfg, client)
    if not result.servers and not result.project_imports:
        click.echo("No new servers to import.")
        return

    _save(ctx)

    if result.servers:
        click.echo(f"Imported {len(result.servers)} server(s) from global config:")
        for s in result.servers:
            click.echo(f"  + {s.name}")

    if result.project_imports:
        for proj in result.project_imports:
            click.echo(f"Imported {len(proj.servers)} server(s) from project {proj.path}:")
            for s in proj.servers:
                click.echo(f"  + {s.name}")


# ── Registry commands ────────────────────────────────────────────


@cli.group("registry")
def registry_group() -> None:
    """Search and install MCP servers from public registries."""


@registry_group.command("search")
@click.argument("query")
def registry_search(query: str) -> None:
    """Search MCP server registries."""
    from mcpoyle.registry import search_registries

    results = search_registries(query)
    if not results:
        click.echo("No servers found.")
        return

    for s in results:
        transport = click.style(s.transport, fg="cyan")
        source = click.style(s.source, fg="yellow")
        click.echo(f"  {s.name} [{transport}] ({source})")
        if s.description:
            click.echo(f"    {s.description}")


@registry_group.command("show")
@click.argument("server_id")
def registry_show(server_id: str) -> None:
    """Show server details from registry."""
    from mcpoyle.registry import get_server

    detail = get_server(server_id)
    if not detail:
        click.echo(f"Server '{server_id}' not found.", err=True)
        raise SystemExit(1)

    click.echo(f"Name:        {detail.name}")
    click.echo(f"Source:      {detail.source}")
    click.echo(f"Transport:   {detail.transport}")
    if detail.description:
        click.echo(f"Description: {detail.description}")
    if detail.homepage:
        click.echo(f"Homepage:    {detail.homepage}")
    if detail.registry_type:
        click.echo(f"Package:     {detail.registry_type} — {detail.package_identifier}")
    if detail.env_vars:
        click.echo("Env vars:")
        for ev in detail.env_vars:
            req = " (required)" if ev.required else ""
            desc = f" — {ev.description}" if ev.description else ""
            click.echo(f"  {ev.name}{req}{desc}")
    if detail.tools:
        click.echo(f"Tools:       {', '.join(detail.tools[:10])}")
        if len(detail.tools) > 10:
            click.echo(f"             ... and {len(detail.tools) - 10} more")
    if detail.estimated_token_cost > 0:
        cost = detail.estimated_token_cost
        if cost >= 1000:
            click.echo(f"Token cost:  ~{cost // 1000}K tokens (tool definitions)")
        else:
            click.echo(f"Token cost:  ~{cost} tokens (tool definitions)")


@registry_group.command("add")
@click.argument("server_id")
@click.option("--env", "env_pairs", multiple=True, help="Environment variables (KEY=VAL)")
@click.pass_context
def registry_add(ctx: click.Context, server_id: str, env_pairs: tuple[str, ...]) -> None:
    """Install a server from a registry."""
    from mcpoyle.registry import get_server, translate_to_server_config

    detail = get_server(server_id)
    if not detail:
        click.echo(f"Server '{server_id}' not found in any registry.", err=True)
        raise SystemExit(1)

    if not detail.package_identifier and not detail.registry_type:
        click.echo(f"Server '{server_id}' has no installable package info.", err=True)
        raise SystemExit(1)

    config = translate_to_server_config(detail)

    # Parse env pairs from flags
    env = {}
    for pair in env_pairs:
        if "=" not in pair:
            click.echo(f"Invalid env format: {pair} (expected KEY=VAL)", err=True)
            raise SystemExit(1)
        k, v = pair.split("=", 1)
        env[k] = v

    # Prompt for required env vars not provided via flags
    for ev in detail.env_vars:
        if ev.name not in env and ev.required:
            desc = f" ({ev.description})" if ev.description else ""
            val = click.prompt(f"  {ev.name}{desc}")
            env[ev.name] = val

    config["env"] = env

    # Add via operations layer
    result = ops.add_server(
        ctx.obj["config"],
        name=config["name"],
        command=config["command"],
        args=config["args"],
        env=config["env"],
        transport=config["transport"],
    )
    _handle(ctx, result)


# ── Marketplace commands ─────────────────────────────────────────


@cli.group("marketplaces")
def marketplaces_group() -> None:
    """Manage Claude Code plugin marketplaces."""


@marketplaces_group.command("list")
@click.pass_context
def marketplaces_list(ctx: click.Context) -> None:
    """List all known marketplaces."""
    cfg: McpoyleConfig = ctx.obj["config"]
    if not cfg.marketplaces:
        click.echo("No marketplaces configured.")
        return
    for m in cfg.marketplaces:
        source_info = m.source.source
        if m.source.repo:
            source_info += f" ({m.source.repo})"
        elif m.source.path:
            source_info += f" ({m.source.path})"
        click.echo(f"  {m.name} [{source_info}]")


@marketplaces_group.command("add")
@click.argument("name")
@click.option("--repo", default=None, help="GitHub repository (owner/repo)")
@click.option("--path", "local_path", default=None, help="Local directory path")
@click.pass_context
def marketplaces_add(ctx: click.Context, name: str, repo: str | None, local_path: str | None) -> None:
    """Register a new marketplace."""
    result = ops.add_marketplace(ctx.obj["config"], name, repo, local_path)
    _handle(ctx, result)


@marketplaces_group.command("remove")
@click.argument("name")
@click.pass_context
def marketplaces_remove(ctx: click.Context, name: str) -> None:
    """Remove a marketplace."""
    result = ops.remove_marketplace(ctx.obj["config"], name)
    _handle(ctx, result)


@marketplaces_group.command("show")
@click.argument("name")
@click.pass_context
def marketplaces_show(ctx: click.Context, name: str) -> None:
    """Show marketplace details."""
    cfg: McpoyleConfig = ctx.obj["config"]
    marketplace = cfg.get_marketplace(name)
    if not marketplace:
        click.echo(f"Marketplace '{name}' not found.", err=True)
        raise SystemExit(1)

    click.echo(f"Name:   {marketplace.name}")
    click.echo(f"Source: {marketplace.source.source}")
    if marketplace.source.repo:
        click.echo(f"Repo:   {marketplace.source.repo}")
    if marketplace.source.path:
        click.echo(f"Path:   {marketplace.source.path}")

    # Show plugins from this marketplace
    plugins = [p for p in cfg.plugins if p.marketplace == name]
    if plugins:
        click.echo("Plugins:")
        for p in plugins:
            status = click.style("on", fg="green") if p.enabled else click.style("off", fg="red")
            click.echo(f"  {p.name} [{status}]")


# ── Plugin commands ──────────────────────────────────────────────


@cli.group("plugins")
def plugins_group() -> None:
    """Manage Claude Code plugins."""


@plugins_group.command("list")
@click.pass_context
def plugins_list(ctx: click.Context) -> None:
    """List all plugins."""
    cfg: McpoyleConfig = ctx.obj["config"]
    if not cfg.plugins:
        click.echo("No plugins tracked.")
        return
    for p in cfg.plugins:
        status = click.style("on", fg="green") if p.enabled else click.style("off", fg="red")
        managed = "" if p.managed else " (unmanaged)"
        click.echo(f"  {p.name} [{status}] @ {p.marketplace}{managed}")


@plugins_group.command("install")
@click.argument("name")
@click.option("--marketplace", "marketplace_name", default=None, help="Marketplace to install from")
@click.pass_context
def plugins_install(ctx: click.Context, name: str, marketplace_name: str | None) -> None:
    """Install a plugin from a marketplace."""
    result = ops.install_plugin(ctx.obj["config"], name, marketplace_name)
    _handle(ctx, result)


@plugins_group.command("uninstall")
@click.argument("name")
@click.pass_context
def plugins_uninstall(ctx: click.Context, name: str) -> None:
    """Uninstall a plugin."""
    result = ops.uninstall_plugin(ctx.obj["config"], name)
    _handle(ctx, result)


@plugins_group.command("enable")
@click.argument("name")
@click.pass_context
def plugins_enable(ctx: click.Context, name: str) -> None:
    """Enable a plugin."""
    result = ops.enable_plugin(ctx.obj["config"], name)
    _handle(ctx, result)


@plugins_group.command("disable")
@click.argument("name")
@click.pass_context
def plugins_disable(ctx: click.Context, name: str) -> None:
    """Disable a plugin."""
    result = ops.disable_plugin(ctx.obj["config"], name)
    _handle(ctx, result)


@plugins_group.command("show")
@click.argument("name")
@click.pass_context
def plugins_show(ctx: click.Context, name: str) -> None:
    """Show plugin details."""
    cfg: McpoyleConfig = ctx.obj["config"]
    plugin = cfg.get_plugin(name)
    if not plugin:
        click.echo(f"Plugin '{name}' not found.", err=True)
        raise SystemExit(1)

    status = click.style("enabled", fg="green") if plugin.enabled else click.style("disabled", fg="red")
    managed = "yes" if plugin.managed else "no"
    click.echo(f"Name:        {plugin.name}")
    click.echo(f"Marketplace: {plugin.marketplace}")
    click.echo(f"Status:      {status}")
    click.echo(f"Managed:     {managed}")
    click.echo(f"Qualified:   {plugin.qualified_name}")

    member_of = [g.name for g in cfg.groups if plugin.name in g.plugins]
    if member_of:
        click.echo(f"Groups:      {', '.join(member_of)}")


@plugins_group.command("import")
@click.pass_context
def plugins_import(ctx: click.Context) -> None:
    """Import existing plugins from Claude Code settings."""
    result = ops.import_plugins(ctx.obj["config"])
    if result.imported:
        for p in result.imported:
            click.echo(f"  + {p.name} @ {p.marketplace}")
    _handle(ctx, result, save=bool(result.imported))


# ── Doctor command ───────────────────────────────────────────


@cli.command()
@click.option("--json", "as_json", is_flag=True, help="Output structured JSON for scripting")
@click.pass_context
def doctor(ctx: click.Context, as_json: bool) -> None:
    """Audit config health across all clients."""
    from mcpoyle.doctor import run_doctor

    cfg: McpoyleConfig = ctx.obj["config"]
    result = run_doctor(cfg)

    if as_json:
        import json
        click.echo(json.dumps(result.to_dict(), indent=2))
        return

    # Summary line
    click.echo(f"✓ Central config valid ({result.server_count} servers, {result.group_count} groups, {result.plugin_count} plugins)")

    # Per-check output
    for check in result.checks:
        if check.severity == "error":
            symbol = click.style("✗", fg="red")
        elif check.severity == "warning":
            symbol = click.style("⚠", fg="yellow")
        else:
            symbol = click.style("·", fg="blue")
        click.echo(f"{symbol} {check.client}: {check.message}")

    # Footer
    if result.errors or result.warnings:
        click.echo(f"\n{result.errors} errors, {result.warnings} warnings")
    else:
        click.echo("\nAll checks passed.")


# ── Help command ─────────────────────────────────────────────────


FULL_HELP = """\
mcp — Centrally manage MCP server configurations across AI clients.

SERVERS
  mcp list                              List all servers with status and command.
  mcp add <name> --command <cmd>        Add a server. Options:
        [--args <arg> ...]                --args (repeatable), --env KEY=VAL (repeatable),
        [--env KEY=VAL ...]               --transport <type> (default: stdio)
  mcp remove <name>                     Remove a server (also removes from groups).
  mcp enable <name>                     Enable a server.
  mcp disable <name>                    Disable a server.
  mcp show <name>                       Show full server details and group membership.

GROUPS
  mcp groups list                       List all groups.
  mcp groups create <name>              Create a group. Options: --description <text>
  mcp groups delete <name>              Delete a group (clients revert to all servers).
  mcp groups show <name>                Show group members and their status.
  mcp groups add-server <group> <srv>   Add a server to a group.
  mcp groups remove-server <group> <srv>  Remove a server from a group.
  mcp groups add-plugin <group> <plg>   Add a plugin to a group.
  mcp groups remove-plugin <group> <plg>  Remove a plugin from a group.

CLIENTS
  mcp clients                           Detect installed clients, show assignments and
                                        sync status. Shows project-level assignments
                                        for Claude Code.

  Supported clients: claude-desktop, claude-code, cursor, vscode, windsurf, zed,
    jetbrains, gemini-cli, codex-cli, copilot-cli, copilot-jetbrains, amazon-q, cline, roo-code

ASSIGNMENTS
  mcp assign <client> <group>           Assign a group to a client.
  mcp assign <client> --all             Assign all enabled servers (default behavior).
  mcp assign <client> <group>           Assign a group to a Claude Code project.
        --project <path>                (--project is Claude Code only)
  mcp unassign <client>                 Remove assignment (reverts to all servers).
  mcp unassign <client>                 Remove a project-level assignment.
        --project <path>                (--project is Claude Code only)

RULES
  mcp rules list                        List all path rules.
  mcp rules add <path> <group>          Add a rule: projects under <path> get <group>.
  mcp rules remove <path>               Remove a path rule.

  Rules auto-assign groups to Claude Code projects based on their path.
  Explicit assignments override rules. Most specific prefix wins.

SCOPE
  mcp scope <name> --project <path>     Move a server or plugin from global to
                                        project-only. Auto-creates groups if needed.
                                        Run 'mcp sync claude-code' after to apply.

INIT
  mcp init                              Guided first-run setup: detect clients,
                                        import servers, create groups, assign, sync.
  mcp init --auto                       Non-interactive: import all, skip groups, sync.
                                        Safe to re-run — skips already-done steps.

SYNC
  mcp sync                              Sync all detected clients.
  mcp sync <client>                     Sync one client.
  mcp sync <client> --project <path>    Sync one Claude Code project.
  mcp sync --dry-run                    Preview changes without writing files.
  mcp sync --force                      Overwrite entries modified outside mcpoyle.
  mcp sync --adopt                      Update mcpoyle registry to match manual edits.

  Sync is additive-only: servers not managed by mcp are never touched.
  Managed entries are tagged with a __mcpoyle marker in the client config.
  Client configs are backed up before each write.
  Sync detects manual edits via content hashing — drifted entries are
  warned about and skipped by default. Use --force to overwrite or
  --adopt to accept the manual changes into mcpoyle's registry.
  Sync is idempotent — running it twice produces the same result.
  For Claude Code, sync also updates plugins and marketplaces.
  Project-level plugins write to <project>/.claude/settings.local.json
  (personal, gitignored) with auto-workaround for CC bug #27247.

IMPORT
  mcp import <client>                   Import servers from a client's existing config
                                        into the central registry. Skips duplicates and
                                        already-managed entries. For Claude Code, also
                                        scans all project-level mcpServers.

PLUGINS (Claude Code)
  mcp plugins list                      List all tracked plugins with status.
  mcp plugins install <name>            Install a plugin. Options: --marketplace <name>
  mcp plugins uninstall <name>          Remove a plugin from registry and settings.
  mcp plugins enable <name>             Enable a disabled plugin.
  mcp plugins disable <name>            Disable a plugin without removing it.
  mcp plugins show <name>               Show plugin details and group membership.
  mcp plugins import                    Import existing plugins from Claude Code settings.

  User-level: writes to ~/.claude/settings.json → enabledPlugins
  Project-level: writes to <project>/.claude/settings.local.json (via sync)

MARKETPLACES (Claude Code)
  mcp marketplaces list                 List all registered marketplaces.
  mcp marketplaces add <name>           Register a marketplace. Options:
        --repo <owner/repo>               GitHub repository source
        --path <dir>                      Local directory source
  mcp marketplaces remove <name>        Remove a marketplace.
  mcp marketplaces show <name>          Show marketplace details and plugins.

DOCTOR
  mcp doctor                            Audit config health across all clients.
  mcp doctor --json                     Structured JSON output for scripting.

  Checks: missing env vars, unreachable binaries, orphaned entries,
  stale (never-synced) configs, JSON parse errors, drift detection.

TUI
  mcp tui                               Open the interactive TUI dashboard.

REGISTRY
  mcp registry search <query>           Search MCP server registries (Official + Glama).
  mcp registry show <id>                Show server details from registry.
  mcp registry add <id>                 Install a server from the registry. Options:
        [--env KEY=VAL ...]               Environment variables (repeatable).
                                          Prompts for required vars not provided.

CONFIG
  Central config: ~/.config/mcpoyle/config.json (created automatically).

  Servers:      ~/.claude.json → mcpServers (global)
                ~/.claude.json → projects.<path>.mcpServers (per-project)
  Plugins:      ~/.claude/settings.json → enabledPlugins (global)
                <project>/.claude/settings.local.json → enabledPlugins (per-project)
  Marketplaces: ~/.claude/settings.json → extraKnownMarketplaces

EXAMPLES
  mcp init                                           Guided first-run setup
  mcp init --auto                                    Non-interactive setup
  mcp import claude-desktop                          Import existing servers
  mcp groups create dev-tools --description "Dev"    Create a group
  mcp groups add-server dev-tools ctx                Add server to group
  mcp assign claude-desktop dev-tools                Assign group to client
  mcp assign claude-code minimal --project ~/Code/x  Per-project assignment
  mcp sync                                           Sync everything
  mcp sync --dry-run                                 Preview first
  mcp plugins install clangd-lsp                     Install a plugin
  mcp marketplaces add home --path ~/Code/my-mkt     Register local marketplace
  mcp scope ctx --project ~/Code/myapp               Move ctx to project-only
  mcp tui                                            Open TUI dashboard\
"""


@cli.command("reference")
def reference_cmd() -> None:
    """Show the full command reference (for humans and LLMs)."""
    click.echo(FULL_HELP)


@cli.command()
def tui() -> None:
    """Open the interactive TUI dashboard."""
    from mcpoyle.tui import main as tui_main
    tui_main()
