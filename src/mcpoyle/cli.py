"""CLI commands for mcpoyle."""

from __future__ import annotations

import click

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
    load_config,
    save_config,
)
from mcpoyle.sync import do_import, sync_all, sync_client


@click.group()
@click.pass_context
def cli(ctx: click.Context) -> None:
    """Centrally manage MCP server configurations across AI clients."""
    ctx.ensure_object(dict)
    ctx.obj["config"] = load_config()


def _save(ctx: click.Context) -> None:
    save_config(ctx.obj["config"])


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
    cfg: McpoyleConfig = ctx.obj["config"]
    if cfg.get_server(name):
        click.echo(f"Server '{name}' already exists.", err=True)
        raise SystemExit(1)

    env = {}
    for pair in env_pairs:
        if "=" not in pair:
            click.echo(f"Invalid env format: {pair} (expected KEY=VAL)", err=True)
            raise SystemExit(1)
        k, v = pair.split("=", 1)
        env[k] = v

    server = Server(name=name, command=cmd, args=list(args_), env=env, transport=transport)
    cfg.servers.append(server)
    _save(ctx)
    click.echo(f"Added server '{name}'.")


@cli.command()
@click.argument("name")
@click.pass_context
def remove(ctx: click.Context, name: str) -> None:
    """Remove a server."""
    cfg: McpoyleConfig = ctx.obj["config"]
    server = cfg.get_server(name)
    if not server:
        click.echo(f"Server '{name}' not found.", err=True)
        raise SystemExit(1)

    cfg.servers.remove(server)
    # Also remove from any groups
    for group in cfg.groups:
        if name in group.servers:
            group.servers.remove(name)
    _save(ctx)
    click.echo(f"Removed server '{name}'.")


@cli.command()
@click.argument("name")
@click.pass_context
def enable(ctx: click.Context, name: str) -> None:
    """Enable a server."""
    cfg: McpoyleConfig = ctx.obj["config"]
    server = cfg.get_server(name)
    if not server:
        click.echo(f"Server '{name}' not found.", err=True)
        raise SystemExit(1)
    server.enabled = True
    _save(ctx)
    click.echo(f"Enabled server '{name}'.")


@cli.command()
@click.argument("name")
@click.pass_context
def disable(ctx: click.Context, name: str) -> None:
    """Disable a server."""
    cfg: McpoyleConfig = ctx.obj["config"]
    server = cfg.get_server(name)
    if not server:
        click.echo(f"Server '{name}' not found.", err=True)
        raise SystemExit(1)
    server.enabled = False
    _save(ctx)
    click.echo(f"Disabled server '{name}'.")


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
    cfg: McpoyleConfig = ctx.obj["config"]
    if cfg.get_group(name):
        click.echo(f"Group '{name}' already exists.", err=True)
        raise SystemExit(1)
    cfg.groups.append(Group(name=name, description=description))
    _save(ctx)
    click.echo(f"Created group '{name}'.")


@groups_group.command("delete")
@click.argument("name")
@click.pass_context
def groups_delete(ctx: click.Context, name: str) -> None:
    """Delete a group."""
    cfg: McpoyleConfig = ctx.obj["config"]
    group = cfg.get_group(name)
    if not group:
        click.echo(f"Group '{name}' not found.", err=True)
        raise SystemExit(1)
    cfg.groups.remove(group)
    # Clear assignments pointing to this group
    for client in cfg.clients:
        if client.group == name:
            client.group = None
    _save(ctx)
    click.echo(f"Deleted group '{name}'.")


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
    cfg: McpoyleConfig = ctx.obj["config"]
    group = cfg.get_group(group_name)
    if not group:
        click.echo(f"Group '{group_name}' not found.", err=True)
        raise SystemExit(1)
    if not cfg.get_server(server_name):
        click.echo(f"Server '{server_name}' not found.", err=True)
        raise SystemExit(1)
    if server_name in group.servers:
        click.echo(f"Server '{server_name}' already in group '{group_name}'.")
        return
    group.servers.append(server_name)
    _save(ctx)
    click.echo(f"Added '{server_name}' to group '{group_name}'.")


@groups_group.command("remove-server")
@click.argument("group_name")
@click.argument("server_name")
@click.pass_context
def groups_remove_server(ctx: click.Context, group_name: str, server_name: str) -> None:
    """Remove a server from a group."""
    cfg: McpoyleConfig = ctx.obj["config"]
    group = cfg.get_group(group_name)
    if not group:
        click.echo(f"Group '{group_name}' not found.", err=True)
        raise SystemExit(1)
    if server_name not in group.servers:
        click.echo(f"Server '{server_name}' not in group '{group_name}'.", err=True)
        raise SystemExit(1)
    group.servers.remove(server_name)
    _save(ctx)
    click.echo(f"Removed '{server_name}' from group '{group_name}'.")


@groups_group.command("add-plugin")
@click.argument("group_name")
@click.argument("plugin_name")
@click.pass_context
def groups_add_plugin(ctx: click.Context, group_name: str, plugin_name: str) -> None:
    """Add a plugin to a group."""
    cfg: McpoyleConfig = ctx.obj["config"]
    group = cfg.get_group(group_name)
    if not group:
        click.echo(f"Group '{group_name}' not found.", err=True)
        raise SystemExit(1)
    if not cfg.get_plugin(plugin_name):
        click.echo(f"Plugin '{plugin_name}' not found.", err=True)
        raise SystemExit(1)
    if plugin_name in group.plugins:
        click.echo(f"Plugin '{plugin_name}' already in group '{group_name}'.")
        return
    group.plugins.append(plugin_name)
    _save(ctx)
    click.echo(f"Added '{plugin_name}' to group '{group_name}'.")


@groups_group.command("remove-plugin")
@click.argument("group_name")
@click.argument("plugin_name")
@click.pass_context
def groups_remove_plugin(ctx: click.Context, group_name: str, plugin_name: str) -> None:
    """Remove a plugin from a group."""
    cfg: McpoyleConfig = ctx.obj["config"]
    group = cfg.get_group(group_name)
    if not group:
        click.echo(f"Group '{group_name}' not found.", err=True)
        raise SystemExit(1)
    if plugin_name not in group.plugins:
        click.echo(f"Plugin '{plugin_name}' not in group '{group_name}'.", err=True)
        raise SystemExit(1)
    group.plugins.remove(plugin_name)
    _save(ctx)
    click.echo(f"Removed '{plugin_name}' from group '{group_name}'.")


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
    cfg: McpoyleConfig = ctx.obj["config"]
    if client not in CLIENTS:
        click.echo(f"Unknown client: {client}", err=True)
        click.echo(f"Valid clients: {', '.join(CLIENTS.keys())}")
        raise SystemExit(1)

    if project_path and client != "claude-code":
        click.echo("--project is only supported for claude-code.", err=True)
        raise SystemExit(1)

    if assign_all:
        group = None
    elif not group:
        click.echo("Specify a group name or use --all.", err=True)
        raise SystemExit(1)
    elif not cfg.get_group(group):
        click.echo(f"Group '{group}' not found.", err=True)
        raise SystemExit(1)

    assignment = cfg.get_client(client)
    if not assignment:
        assignment = ClientAssignment(id=client)
        cfg.clients.append(assignment)

    if project_path:
        from pathlib import Path
        abs_path = str(Path(project_path).expanduser().resolve())
        proj = assignment.get_project(abs_path)
        if not proj:
            proj = ProjectAssignment(path=abs_path, group=group)
            assignment.projects.append(proj)
        else:
            proj.group = group
        _save(ctx)
        if group:
            click.echo(f"Assigned group '{group}' to Claude Code project {abs_path}.")
        else:
            click.echo(f"Assigned all enabled servers to Claude Code project {abs_path}.")
    else:
        assignment.group = group
        _save(ctx)
        if group:
            click.echo(f"Assigned group '{group}' to {CLIENTS[client].name}.")
        else:
            click.echo(f"Assigned all enabled servers to {CLIENTS[client].name}.")


@cli.command()
@click.argument("client")
@click.option("--project", "project_path", default=None, help="Project path (Claude Code only)")
@click.pass_context
def unassign(ctx: click.Context, client: str, project_path: str | None) -> None:
    """Remove group assignment from a client (reverts to all servers)."""
    cfg: McpoyleConfig = ctx.obj["config"]
    if client not in CLIENTS:
        click.echo(f"Unknown client: {client}", err=True)
        raise SystemExit(1)

    if project_path and client != "claude-code":
        click.echo("--project is only supported for claude-code.", err=True)
        raise SystemExit(1)

    assignment = cfg.get_client(client)
    if not assignment:
        click.echo(f"No assignment for {CLIENTS[client].name}.")
        return

    if project_path:
        from pathlib import Path
        abs_path = str(Path(project_path).expanduser().resolve())
        proj = assignment.get_project(abs_path)
        if proj:
            assignment.projects.remove(proj)
            _save(ctx)
            click.echo(f"Removed project assignment for {abs_path}.")
        else:
            click.echo(f"No project assignment for {abs_path}.")
    else:
        assignment.group = None
        _save(ctx)
        click.echo(f"Unassigned {CLIENTS[client].name} — will receive all enabled servers.")


# ── Sync commands ────────────────────────────────────────────────


@cli.command()
@click.argument("client", required=False)
@click.option("--dry-run", is_flag=True, help="Show what would change without writing")
@click.option("--project", "project_path", default=None, help="Project path (Claude Code only)")
@click.pass_context
def sync(ctx: click.Context, client: str | None, dry_run: bool, project_path: str | None) -> None:
    """Sync server configs to clients."""
    cfg: McpoyleConfig = ctx.obj["config"]
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
        actions = sync_client(cfg, client, dry_run)
        for a in actions:
            click.echo(a)
    else:
        results = sync_all(cfg, dry_run)
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


# ── Registry commands (stub) ────────────────────────────────────


@cli.group("registry")
def registry_group() -> None:
    """Search and install from the Smithery registry."""


@registry_group.command("search")
@click.argument("query")
def registry_search(query: str) -> None:
    """Search the Smithery registry."""
    click.echo("Registry search is not yet implemented.")


@registry_group.command("add")
@click.argument("id_")
def registry_add(id_: str) -> None:
    """Install a server from the Smithery registry."""
    click.echo("Registry install is not yet implemented.")


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
    cfg: McpoyleConfig = ctx.obj["config"]

    if name in Marketplace.RESERVED_NAMES:
        click.echo(f"'{name}' is a reserved marketplace name.", err=True)
        raise SystemExit(1)

    if cfg.get_marketplace(name):
        click.echo(f"Marketplace '{name}' already exists.", err=True)
        raise SystemExit(1)

    if not repo and not local_path:
        click.echo("Specify --repo or --path.", err=True)
        raise SystemExit(1)

    if repo:
        source = MarketplaceSource(source="github", repo=repo)
    else:
        from pathlib import Path
        abs_path = str(Path(local_path).expanduser().resolve())
        source = MarketplaceSource(source="directory", path=abs_path)

    marketplace = Marketplace(name=name, source=source)
    cfg.marketplaces.append(marketplace)
    _save(ctx)

    # Write to Claude Code settings
    settings = read_cc_settings()
    extra = get_extra_marketplaces(settings)
    extra[name] = {"source": _marketplace_source_to_cc(source)}
    set_extra_marketplaces(settings, extra)
    write_cc_settings(settings)

    click.echo(f"Added marketplace '{name}'.")


@marketplaces_group.command("remove")
@click.argument("name")
@click.pass_context
def marketplaces_remove(ctx: click.Context, name: str) -> None:
    """Remove a marketplace."""
    cfg: McpoyleConfig = ctx.obj["config"]
    marketplace = cfg.get_marketplace(name)
    if not marketplace:
        click.echo(f"Marketplace '{name}' not found.", err=True)
        raise SystemExit(1)

    cfg.marketplaces.remove(marketplace)
    _save(ctx)

    # Remove from Claude Code settings
    settings = read_cc_settings()
    extra = get_extra_marketplaces(settings)
    if name in extra:
        del extra[name]
        set_extra_marketplaces(settings, extra)
        write_cc_settings(settings)

    click.echo(f"Removed marketplace '{name}'.")


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
    cfg: McpoyleConfig = ctx.obj["config"]

    if cfg.get_plugin(name):
        click.echo(f"Plugin '{name}' is already installed.", err=True)
        raise SystemExit(1)

    # Resolve marketplace
    if marketplace_name:
        marketplace = cfg.get_marketplace(marketplace_name)
        if not marketplace:
            click.echo(f"Marketplace '{marketplace_name}' not found.", err=True)
            raise SystemExit(1)
    elif len(cfg.marketplaces) == 1:
        marketplace = cfg.marketplaces[0]
        marketplace_name = marketplace.name
    elif cfg.marketplaces:
        click.echo("Multiple marketplaces available. Specify --marketplace.", err=True)
        raise SystemExit(1)
    else:
        # Default to official marketplace
        marketplace_name = "claude-plugins-official"

    if not marketplace_name:
        marketplace_name = "claude-plugins-official"

    plugin = Plugin(name=name, marketplace=marketplace_name, enabled=True, managed=True)
    cfg.plugins.append(plugin)
    _save(ctx)

    # Write to Claude Code enabledPlugins
    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)
    enabled[plugin.qualified_name] = True
    set_enabled_plugins(settings, enabled)
    write_cc_settings(settings)

    click.echo(f"Installed plugin '{name}' from {marketplace_name}.")


@plugins_group.command("uninstall")
@click.argument("name")
@click.pass_context
def plugins_uninstall(ctx: click.Context, name: str) -> None:
    """Uninstall a plugin."""
    cfg: McpoyleConfig = ctx.obj["config"]
    plugin = cfg.get_plugin(name)
    if not plugin:
        click.echo(f"Plugin '{name}' not found.", err=True)
        raise SystemExit(1)

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
    _save(ctx)
    click.echo(f"Uninstalled plugin '{name}'.")


@plugins_group.command("enable")
@click.argument("name")
@click.pass_context
def plugins_enable(ctx: click.Context, name: str) -> None:
    """Enable a plugin."""
    cfg: McpoyleConfig = ctx.obj["config"]
    plugin = cfg.get_plugin(name)
    if not plugin:
        click.echo(f"Plugin '{name}' not found.", err=True)
        raise SystemExit(1)

    plugin.enabled = True
    _save(ctx)

    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)
    enabled[plugin.qualified_name] = True
    set_enabled_plugins(settings, enabled)
    write_cc_settings(settings)

    click.echo(f"Enabled plugin '{name}'.")


@plugins_group.command("disable")
@click.argument("name")
@click.pass_context
def plugins_disable(ctx: click.Context, name: str) -> None:
    """Disable a plugin."""
    cfg: McpoyleConfig = ctx.obj["config"]
    plugin = cfg.get_plugin(name)
    if not plugin:
        click.echo(f"Plugin '{name}' not found.", err=True)
        raise SystemExit(1)

    plugin.enabled = False
    _save(ctx)

    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)
    enabled[plugin.qualified_name] = False
    set_enabled_plugins(settings, enabled)
    write_cc_settings(settings)

    click.echo(f"Disabled plugin '{name}'.")


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
    cfg: McpoyleConfig = ctx.obj["config"]
    settings = read_cc_settings()
    enabled = get_enabled_plugins(settings)

    imported = 0
    for qualified_name, is_enabled in enabled.items():
        # Parse "name@marketplace" format
        if "@" in qualified_name:
            pname, mkt = qualified_name.rsplit("@", 1)
        else:
            pname, mkt = qualified_name, ""

        if cfg.get_plugin(pname):
            continue

        plugin = Plugin(name=pname, marketplace=mkt, enabled=bool(is_enabled), managed=False)
        cfg.plugins.append(plugin)
        imported += 1
        click.echo(f"  + {pname} @ {mkt}")

    if imported:
        _save(ctx)
        click.echo(f"Imported {imported} plugin(s).")
    else:
        click.echo("No new plugins to import.")


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

  Supported clients: claude-desktop, claude-code, cursor, vscode, windsurf, zed, jetbrains

ASSIGNMENTS
  mcp assign <client> <group>           Assign a group to a client.
  mcp assign <client> --all             Assign all enabled servers (default behavior).
  mcp assign <client> <group>           Assign a group to a Claude Code project.
        --project <path>                (--project is Claude Code only)
  mcp unassign <client>                 Remove assignment (reverts to all servers).
  mcp unassign <client>                 Remove a project-level assignment.
        --project <path>                (--project is Claude Code only)

SYNC
  mcp sync                              Sync all detected clients.
  mcp sync <client>                     Sync one client.
  mcp sync <client> --project <path>    Sync one Claude Code project.
  mcp sync --dry-run                    Preview changes without writing files.

  Sync is additive-only: servers not managed by mcp are never touched.
  Managed entries are tagged with a __mcpoyle marker in the client config.
  Client configs are backed up (.bak) before each write.
  Sync is idempotent — running it twice produces the same result.
  For Claude Code, sync also updates plugins and marketplaces.

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

MARKETPLACES (Claude Code)
  mcp marketplaces list                 List all registered marketplaces.
  mcp marketplaces add <name>           Register a marketplace. Options:
        --repo <owner/repo>               GitHub repository source
        --path <dir>                      Local directory source
  mcp marketplaces remove <name>        Remove a marketplace.
  mcp marketplaces show <name>          Show marketplace details and plugins.

REGISTRY (coming soon)
  mcp registry search <query>           Search the Smithery registry.
  mcp registry add <id>                 Install from the registry.

CONFIG
  Central config: ~/.config/mcpoyle/config.json (created automatically).

  Claude Code project-level assignments write to ~/.claude.json under
  projects.<absolute-path>.mcpServers. Different projects can use different groups.

  Plugin state: ~/.claude/settings.json → enabledPlugins
  Marketplaces: ~/.claude/settings.json → extraKnownMarketplaces

EXAMPLES
  mcp import claude-desktop                          Import existing servers
  mcp groups create dev-tools --description "Dev"    Create a group
  mcp groups add-server dev-tools ctx                Add server to group
  mcp assign claude-desktop dev-tools                Assign group to client
  mcp assign claude-code minimal --project ~/Code/x  Per-project assignment
  mcp sync                                           Sync everything
  mcp sync --dry-run                                 Preview first
  mcp plugins install clangd-lsp                     Install a plugin
  mcp marketplaces add home --path ~/Code/my-mkt     Register local marketplace\
"""


@cli.command("reference")
def reference_cmd() -> None:
    """Show the full command reference (for humans and LLMs)."""
    click.echo(FULL_HELP)
