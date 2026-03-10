# MCPoyle

A CLI tool for centrally managing MCP server configurations across multiple AI clients.

## The Problem

Each AI client maintains its own MCP server config in its own file. Adding a new server means editing configs for Claude Desktop, Claude Code, Cursor, VS Code, and others — each with slightly different formats and paths. There's no way to give different clients different sets of servers.

## What MCPoyle Does

- **One registry** — define each MCP server once in a central config
- **Groups** — organize servers into named sets (e.g., "dev-tools", "work", "personal")
- **Per-client assignments** — assign different groups to different clients
- **Per-project assignments** — give Claude Code projects their own server sets
- **Import** — pull in existing servers from any client's config (including Claude Code project-level configs)
- **Sync** — write the right servers to the right clients with one command
- **Additive only** — never touches servers it didn't create

## Install

```bash
# From source
uv tool install /path/to/mcpoyle

# From PyPI (coming soon)
uvx mcpoyle
```

Requires Python 3.12+.

## Quick Start

```bash
# Import your existing servers from Claude Desktop
mcp import claude-desktop

# See what was imported
mcp list

# Create a group and add servers to it
mcp groups create dev-tools --description "Core development servers"
mcp groups add-server dev-tools ctx
mcp groups add-server dev-tools prm

# Assign the group to a client
mcp assign claude-desktop dev-tools

# Preview what would change
mcp sync --dry-run

# Sync for real
mcp sync
```

## Per-Project Servers (Claude Code)

Assign different server groups to different Claude Code projects:

```bash
mcp assign claude-code dev-tools --project ~/Code/my-app
mcp assign claude-code minimal --project ~/Code/scripts
mcp sync claude-code
```

## Supported Clients

| Client | Detection | Config Path |
|--------|-----------|-------------|
| Claude Desktop | `/Applications/Claude.app` | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Code | `~/.claude.json` | `~/.claude.json` (global + per-project) |
| Cursor | `/Applications/Cursor.app` | `~/.cursor/mcp.json` |
| VS Code | `/Applications/Visual Studio Code.app` | `~/Library/Application Support/Code/User/settings.json` |
| Windsurf | `/Applications/Windsurf.app` | `~/.windsurf/mcp.json` |
| Zed | `/Applications/Zed.app` | `~/.config/zed/settings.json` |
| JetBrains | `~/.config/JetBrains/*/mcp.json` | `~/.config/JetBrains/*/mcp.json` |

## Command Reference

Run `mcp reference` for the full command reference, or see [COMMANDS.md](COMMANDS.md).

```
mcp list                                List all servers
mcp add <name> --command <cmd>          Add a server
mcp remove <name>                       Remove a server
mcp enable/disable <name>              Toggle a server
mcp show <name>                         Show server details

mcp groups list                         List groups
mcp groups create <name>                Create a group
mcp groups add-server <group> <server>  Add server to group

mcp clients                             Detect installed clients
mcp assign <client> <group>             Assign group to client
mcp assign <client> <group> --project   Per-project (Claude Code)

mcp sync [--dry-run]                    Sync all clients
mcp import <client>                     Import existing servers
```

## How Sync Works

1. MCPoyle reads the client's config file
2. Removes entries tagged with `__mcpoyle` (previously managed)
3. Writes the current resolved server set (all tagged with `__mcpoyle`)
4. Servers not managed by MCPoyle are never touched

Sync is **idempotent** — running it twice produces the same result. Config files are **backed up** (`.bak`) before each write.

## Configuration

Central config lives at `~/.config/mcpoyle/config.json`, created automatically on first use.

MCPoyle stores env values as-is. For secrets, use secret manager references (e.g., `op://Dev/...` for 1Password) rather than plaintext — MCPoyle will pass them through and your runtime can resolve them.

## License

MIT
