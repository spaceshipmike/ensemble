---
version: 0.5.0
status: draft
last_updated: 2026-03-10
---

# mcpoyle

A CLI tool for centrally managing MCP server configurations and Claude Code plugins across AI clients.

## Philosophy

mcpoyle is designed to be equally useful for humans and AI agents. Every action a user can take from the CLI, an agent should be able to take programmatically. This means: structured output where it matters, deterministic behavior, no interactive prompts in the default path, and clear exit codes. An agent managing a fleet of projects should be able to script mcpoyle the same way a human uses it interactively.

## Problem

Each AI client (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, JetBrains) maintains its own MCP server config in its own format. Adding a server means editing multiple files. There's no way to assign different server sets to different clients.

Claude Code also has a plugin/marketplace system with configuration in `~/.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`) and a plugin cache at `~/.claude/plugins/cache/`. Managing plugins — installing, enabling, organizing across projects — requires manual JSON editing or the Claude Code UI. The native scope system (user/project/local) has known bugs around cross-scope visibility, making programmatic management even more valuable.

## Solution

A single CLI that manages a central server registry, organizes servers and plugins into groups, and syncs the right configuration to the right clients. For Claude Code, this extends to full plugin lifecycle management: install, uninstall, enable, disable, and marketplace registration.

## Core Concepts

- **Server** — an MCP server definition (name, command, args, env, transport)
- **Plugin** — a Claude Code plugin (name, marketplace, scope, enabled state)
- **Marketplace** — a source of plugins (GitHub repo or local directory)
- **Group** — a named collection of servers and/or plugins (e.g., "dev-tools", "work", "personal")
- **Client** — an AI application that consumes MCP servers (detected automatically)
- **Sync** — writing the correct servers and plugin state to each client's config, filtered by group assignment

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

mcpoyle plugins list                      # list all plugins (installed + enabled state)
mcpoyle plugins install <name> [--marketplace <name>] [--scope user]
mcpoyle plugins uninstall <name>
mcpoyle plugins enable <name> [--scope user]
mcpoyle plugins disable <name> [--scope user]
mcpoyle plugins show <name>               # show plugin details
mcpoyle plugins import                    # import existing plugins into mcpoyle registry

mcpoyle marketplaces list                 # list known marketplaces
mcpoyle marketplaces add <name> --repo <owner/repo>
mcpoyle marketplaces add <name> --path /local/dir
mcpoyle marketplaces remove <name>
mcpoyle marketplaces show <name>          # show marketplace details + plugins

mcpoyle groups add-plugin <group> <plugin>
mcpoyle groups remove-plugin <group> <plugin>
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
      "servers": ["ctx", "prm", "knowmarks"],
      "plugins": ["clangd-lsp", "typescript-lsp"]
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

## Plugins (Claude Code)

mcpoyle manages the full plugin lifecycle for Claude Code. Plugins are identified by short name when unambiguous (e.g., `clangd-lsp`), or by full qualified name when needed (`clangd-lsp@claude-plugins-official`).

### Source of Truth

Claude Code tracks plugin state via `enabledPlugins` in settings files — **not** `installed_plugins.json` (which is an undocumented internal file). mcpoyle uses `enabledPlugins` as the canonical source of truth for what's installed and enabled.

The `enabledPlugins` object maps `"plugin-name@marketplace-name"` → `true|false`:

```json
{
  "enabledPlugins": {
    "clangd-lsp@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "my-plugin@my-marketplace": false
  }
}
```

### Plugin Registry

Plugins managed by mcpoyle are tracked in the central config:

```json
{
  "plugins": [
    {
      "name": "clangd-lsp",
      "marketplace": "claude-plugins-official",
      "enabled": true,
      "managed": true
    }
  ],
  "settings": {
    "adopt_unmanaged_plugins": false
  }
}
```

- `managed: true` — installed/tracked by mcpoyle
- `managed: false` — imported or adopted from existing installation
- `adopt_unmanaged_plugins` — when `true`, `mcpoyle sync` automatically adopts manually-installed plugins into the mcpoyle registry. When `false` (default), manually-installed plugins are left untouched; use `mcpoyle plugins import` to adopt them explicitly.

### Scopes

Claude Code supports three plugin scopes that determine which settings file receives the `enabledPlugins` entry. All scopes cache plugin files at `~/.claude/plugins/cache/` — scope only controls visibility, not file location.

| Scope | Settings file | Use case |
|-------|--------------|----------|
| `user` | `~/.claude/settings.json` | Available globally (default) |
| `project` | `.claude/settings.json` | Team plugins, committed to repo |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |

**Note:** Claude Code's scope system has known bugs (cross-scope visibility issues, `settings.local.json` `enabledPlugins` silently ignored unless the key also exists in `settings.json`). mcpoyle v0.4 supports `user` scope only. Project and local scope support will be added once Claude Code stabilizes these behaviors.

### Install / Uninstall

`mcpoyle plugins install <name>` installs a plugin from a known marketplace. mcpoyle:

1. Resolves the plugin from the marketplace's `marketplace.json`
2. Fetches plugin source (git clone for GitHub, copy for local) to `~/.claude/plugins/cache/`
3. Sets `"name@marketplace": true` in `~/.claude/settings.json` → `enabledPlugins`
4. Adds entry to mcpoyle's central config

`mcpoyle plugins uninstall <name>` reverses this: removes from `enabledPlugins`, cleans up cached files, removes from mcpoyle's central config.

### Enable / Disable

Toggles the plugin's entry in `~/.claude/settings.json` → `enabledPlugins` (`true`/`false`) without removing the cached installation. Also updates the central mcpoyle config.

### Import

`mcpoyle plugins import` scans `enabledPlugins` in `~/.claude/settings.json` and adds any plugins not already in mcpoyle's registry. Marks them as `managed: false` initially. Does not modify Claude Code's config — purely additive to mcpoyle's central config.

## Marketplaces (Claude Code)

Marketplaces are plugin sources — GitHub repos or local directories containing a `.claude-plugin/marketplace.json` manifest.

### Marketplace Registry

mcpoyle tracks marketplaces in its central config:

```json
{
  "marketplaces": [
    {
      "name": "claude-plugins-official",
      "source": {"source": "github", "repo": "anthropics/claude-plugins-official"}
    },
    {
      "name": "homelab",
      "source": {"source": "directory", "path": "/Users/mike/Code/homelab-marketplace"}
    }
  ]
}
```

When writing to Claude Code's `settings.json` → `extraKnownMarketplaces`, mcpoyle uses Claude Code's native format:

```json
{
  "extraKnownMarketplaces": {
    "homelab": {
      "source": {
        "source": "directory",
        "path": "/Users/mike/Code/homelab-marketplace"
      }
    }
  }
}
```

Supported source types: `github` (`repo` field), `directory` (`path` field), `git` (`url` field), `url` (`url` field ending `.git`).

The official marketplace (`claude-plugins-official`) is built-in to Claude Code and does not need to be registered in `extraKnownMarketplaces`.

### Reserved Names

Claude Code reserves certain marketplace names: `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `life-sciences`. mcpoyle validates against these on `marketplaces add`.

### Add / Remove

`mcpoyle marketplaces add <name> --repo owner/repo` registers a GitHub-based marketplace in both mcpoyle's config and Claude Code's `settings.json` → `extraKnownMarketplaces`.

`mcpoyle marketplaces add <name> --path /local/dir` registers a local directory marketplace (uses `"source": "directory"` in Claude Code's format).

`mcpoyle marketplaces remove <name>` removes from both mcpoyle's config and Claude Code's `extraKnownMarketplaces`. Does not uninstall plugins from that marketplace.

### Auto-Update

Marketplace auto-update is controlled through Claude Code's UI, not via JSON config files. mcpoyle does not manage auto-update settings. The `DISABLE_AUTOUPDATER` and `FORCE_AUTOUPDATE_PLUGINS` environment variables can override update behavior globally.

## Sync with Plugins

When a group contains both servers and plugins, `mcpoyle sync` handles both:

- Servers are synced to the target client's config (all clients)
- Plugins are synced to Claude Code's plugin config (Claude Code only)
- Plugin entries in groups are silently ignored for non-Claude Code clients

`mcpoyle sync --dry-run` shows both server and plugin changes.

## Supported Clients

| Client | Config Path | Format | Plugins |
|--------|-------------|--------|---------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | JSON | No |
| Claude Code (MCP) | `~/.claude.json` → `mcpServers` | JSON | — |
| Claude Code (project MCP) | `~/.claude.json` → `projects.<path>.mcpServers` | JSON | — |
| Claude Code (plugins) | `~/.claude/settings.json` → `enabledPlugins` | JSON | Yes |
| Claude Code (marketplaces) | `~/.claude/settings.json` → `extraKnownMarketplaces` | JSON | Yes |
| Cursor | `~/.cursor/mcp.json` | JSON | No |
| VS Code (Copilot) | `~/Library/Application Support/Code/User/settings.json` | JSON | No |
| Windsurf | `~/.windsurf/mcp.json` | JSON | No |
| Zed | `~/.config/zed/settings.json` | JSON | No |
| JetBrains | `~/.config/JetBrains/*/mcp.json` | JSON | No |

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
- Marketplace auto-update management — controlled via Claude Code's UI, not JSON
- Plugin development tooling — mcpoyle manages installed plugins, not authoring
- Project/local plugin scopes (v0.4) — deferred until Claude Code stabilizes scope bugs

## Architecture

Core logic (config, clients, sync, plugins) must remain presentation-agnostic. All operations return structured data (dataclasses, dicts, result objects) — never print directly. The CLI layer is a thin wrapper that formats and displays. This keeps the door open for a TUI or GUI surface without refactoring internals.

## Design Principles

1. **Additive only on sync** — mcpoyle manages its own servers in client configs. It never deletes servers it didn't create. A `__mcpoyle` marker comment or metadata key identifies managed entries.
2. **Backwards compatible defaults** — no group assignment = sync all enabled servers, same as Conductor's current behavior.
3. **Idempotent** — running `mcpoyle sync` twice produces the same result.
4. **No daemon** — runs on demand, no file watching, no background process.
5. **Dry-run support** — `mcpoyle sync --dry-run` shows what would change without writing.

## Changelog

- **0.5.0** — Add `scope` command for moving servers/plugins from global to project-only. Project-level plugin sync writes to `.claude/settings.local.json` with auto-workaround for CC bug #27247. Auto-creates groups when transitioning from "all servers" mode.
- **0.4.0** — Correct plugin spec against official docs: use `enabledPlugins` as source of truth (not `installed_plugins.json`), fix marketplace source format (`"source"` not `"type"`, `"directory"` not `"local"`), drop auto-update toggle (UI-only), scope to user-only for v1 due to CC scope bugs, add reserved marketplace name validation
- **0.3.0** — Add Claude Code plugin lifecycle management and marketplace registration
- **0.2.0** — Add project-level MCP server assignments for Claude Code
- **0.1.0** — Initial spec
