---
version: 0.2.0
status: draft
last_updated: 2026-03-09
---

# mcpoyle

A CLI tool for centrally managing MCP server configurations across multiple AI clients.

## Problem

Each AI client (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, JetBrains) maintains its own MCP server config in its own format. Adding a server means editing multiple files. There's no way to assign different server sets to different clients.

## Solution

A single CLI that manages a central server registry, organizes servers into groups, and syncs the right servers to the right clients.

## Core Concepts

- **Server** — an MCP server definition (name, command, args, env, transport)
- **Group** — a named collection of servers (e.g., "dev-tools", "work", "personal")
- **Client** — an AI application that consumes MCP servers (detected automatically)
- **Sync** — writing the correct servers to each client's config file, filtered by group assignment

## CLI Surface

```
mcpoyle list                              # list all servers
mcpoyle add <name> --command <cmd> [--args ...] [--env KEY=VAL ...]
mcpoyle remove <name>
mcpoyle enable <name>
mcpoyle disable <name>
mcpoyle show <name>                       # show server details

mcpoyle groups list                       # list all groups
mcpoyle groups create <name> [--description ...]
mcpoyle groups delete <name>
mcpoyle groups show <name>                # show group members
mcpoyle groups add-server <group> <server>
mcpoyle groups remove-server <group> <server>

mcpoyle clients                           # detect installed clients + sync status
mcpoyle assign <client> <group>           # assign a group to a client
mcpoyle assign <client> --all             # assign all enabled servers (default)
mcpoyle assign <client> <group> --project ~/Code/myapp  # project-level (Claude Code only)
mcpoyle unassign <client>                 # revert to syncing all servers
mcpoyle unassign <client> --project ~/Code/myapp         # unassign project-level

mcpoyle sync [<client>]                   # sync all or one client
mcpoyle sync claude-code --project ~/Code/myapp          # sync a specific project
mcpoyle import <client>                   # import servers from a client's config

mcpoyle registry search <query>           # search Smithery registry
mcpoyle registry add <id>                 # install from registry
```

## Config

Central config at `~/.config/mcpoyle/config.json`:

```json
{
  "servers": [
    {
      "name": "ctx",
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/index.ts", "serve"],
      "env": {}
    }
  ],
  "groups": [
    {
      "name": "dev-tools",
      "description": "Core development MCP servers",
      "servers": ["ctx", "prm", "knowmarks"]
    }
  ],
  "clients": [
    {
      "id": "claude-desktop",
      "group": "dev-tools",
      "last_synced": "2026-03-09T00:00:00Z"
    },
    {
      "id": "claude-code",
      "group": null,
      "last_synced": "2026-03-09T00:00:00Z",
      "projects": {
        "~/Code/myapp": {
          "group": "dev-tools",
          "last_synced": "2026-03-09T00:00:00Z"
        }
      }
    }
  ]
}
```

When `group` is `null`, the client receives all enabled servers (default behavior).

### Project-Level Assignments (Claude Code)

Claude Code supports per-project MCP server configs stored in `~/.claude.json` under `projects.<absolute-path>.mcpServers`. mcpoyle can assign different groups to different projects:

- **Global assignment** (`mcpoyle assign claude-code dev-tools`) — writes to the top-level `mcpServers` in `~/.claude.json`
- **Project assignment** (`mcpoyle assign claude-code dev-tools --project ~/Code/myapp`) — writes to `projects./Users/mike/Code/myapp.mcpServers` in `~/.claude.json`

Project assignments are tracked in the central config under `clients[].projects`. On sync, both the global and all project-level assignments are synced. The `--project` flag is only valid for `claude-code`.

## Supported Clients

| Client | Config Path | Format |
|--------|-------------|--------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | JSON |
| Claude Code (global) | `~/.claude.json` → `mcpServers` | JSON |
| Claude Code (project) | `~/.claude.json` → `projects.<path>.mcpServers` | JSON |
| Cursor | `~/.cursor/mcp.json` | JSON |
| VS Code (Copilot) | `~/Library/Application Support/Code/User/settings.json` | JSON |
| Windsurf | `~/.windsurf/mcp.json` | JSON |
| Zed | `~/.config/zed/settings.json` | JSON |
| JetBrains | `~/.config/JetBrains/*/mcp.json` | JSON |

## Tech Stack

- **Language:** Python 3.12+
- **CLI framework:** click
- **Distribution:** uv / PyPI (`uvx mcpoyle`)
- **Config:** JSON (serde-style, no external DB)
- **Secrets:** 1Password CLI (`op://`) references in env values — mcpoyle stores the references, not plaintext

## Non-Goals

- GUI / TUI — this is a CLI tool
- Running or proxying MCP servers — mcpoyle only manages configs
- Server health checks or monitoring
- Multi-machine sync (single machine only)

## Design Principles

1. **Additive only on sync** — mcpoyle manages its own servers in client configs. It never deletes servers it didn't create. A `__mcpoyle` marker comment or metadata key identifies managed entries.
2. **Backwards compatible defaults** — no group assignment = sync all enabled servers, same as Conductor's current behavior.
3. **Idempotent** — running `mcpoyle sync` twice produces the same result.
4. **No daemon** — runs on demand, no file watching, no background process.
5. **Dry-run support** — `mcpoyle sync --dry-run` shows what would change without writing.

## Changelog

- **0.2.0** — Add project-level MCP server assignments for Claude Code
- **0.1.0** — Initial spec
