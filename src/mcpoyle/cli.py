"""CLI commands for mcpoyle."""

from __future__ import annotations

import click

from mcpoyle.clients import CLIENTS
from mcpoyle.config import (
    ClientAssignment,
    Group,
    McpoyleConfig,
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
        click.echo(f"  {g.name} ({len(g.servers)} servers){desc}")


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
    if not group.servers:
        click.echo("  (no servers)")
    else:
        for sname in group.servers:
            server = cfg.get_server(sname)
            if server:
                status = click.style("on", fg="green") if server.enabled else click.style("off", fg="red")
                click.echo(f"  {sname} [{status}]")
            else:
                click.echo(f"  {sname} [missing]")


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

IMPORT
  mcp import <client>                   Import servers from a client's existing config
                                        into the central registry. Skips duplicates and
                                        already-managed entries. For Claude Code, also
                                        scans all project-level mcpServers.

REGISTRY (coming soon)
  mcp registry search <query>           Search the Smithery registry.
  mcp registry add <id>                 Install from the registry.

CONFIG
  Central config: ~/.config/mcpoyle/config.json (created automatically).

  Claude Code project-level assignments write to ~/.claude.json under
  projects.<absolute-path>.mcpServers. Different projects can use different groups.

EXAMPLES
  mcp import claude-desktop                          Import existing servers
  mcp groups create dev-tools --description "Dev"    Create a group
  mcp groups add-server dev-tools ctx                Add server to group
  mcp assign claude-desktop dev-tools                Assign group to client
  mcp assign claude-code minimal --project ~/Code/x  Per-project assignment
  mcp sync                                           Sync everything
  mcp sync --dry-run                                 Preview first\
"""


@cli.command("reference")
def reference_cmd() -> None:
    """Show the full command reference (for humans and LLMs)."""
    click.echo(FULL_HELP)
