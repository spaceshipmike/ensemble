---
version: 0.12.0
status: active
last_updated: 2026-03-13
synopsis:
  short: "Central manager for MCP servers and Claude Code plugins across AI clients"
  medium: "mcpoyle is a CLI and TUI tool that centrally manages MCP server configurations and Claude Code plugins across multiple AI clients. It provides a single registry, group-based organization, and automatic sync to each client's native config format."
  readme: "mcpoyle eliminates the pain of maintaining MCP server configurations across Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, and JetBrains. Define your servers once, organize them into groups, assign groups to clients or projects, and sync. For Claude Code, mcpoyle extends to full plugin lifecycle management — install, uninstall, enable, disable — and marketplace registration. The CLI surface is optimized for scripting and AI agents; the TUI dashboard provides a human-friendly overview with keyboard-driven navigation and sync previews."
  tech-stack: [Python 3.12+, click, Textual, httpx, hatch, uv, JSON config]
  patterns: [additive sync, central registry, group-based assignment, path-rule auto-assignment, project-registry integration, multi-registry search, presentation-agnostic core, operations layer, content-hash drift detection, deterministic health audit]
  goals: [single source of truth for MCP configs, cross-client sync, plugin lifecycle management, registry discovery + install, project-aware scoping, CLI + TUI surfaces]
---

# mcpoyle

A CLI tool for centrally managing MCP server configurations and Claude Code plugins across AI clients.

## Philosophy

mcpoyle is designed to be equally useful for humans and AI agents. Every action a user can take from the CLI, an agent should be able to take programmatically. This means: structured output where it matters, deterministic behavior, no interactive prompts in the default path, and clear exit codes. An agent managing a fleet of projects should be able to script mcpoyle the same way a human uses it interactively. For hands-on human use, the TUI dashboard provides a visual overview with keyboard-driven navigation, while the CLI remains the programmatic and agent-optimized surface.

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

mcpoyle registry search <query>           # search MCP server registries
mcpoyle registry show <id>               # show server details from registry
mcpoyle registry add <id>                 # install server from registry

mcpoyle plugins list                      # list all plugins (installed + enabled state)
mcpoyle plugins install <name> [--marketplace <name>]
mcpoyle plugins uninstall <name>
mcpoyle plugins enable <name>
mcpoyle plugins disable <name>
mcpoyle plugins show <name>               # show plugin details
mcpoyle plugins import                    # import existing plugins into mcpoyle registry

mcpoyle marketplaces list                 # list known marketplaces
mcpoyle marketplaces add <name> --repo <owner/repo>
mcpoyle marketplaces add <name> --path /local/dir
mcpoyle marketplaces remove <name>
mcpoyle marketplaces show <name>          # show marketplace details + plugins

mcpoyle groups add-plugin <group> <plugin>
mcpoyle groups remove-plugin <group> <plugin>

mcpoyle rules list                        # list all path rules
mcpoyle rules add <path> <group>          # auto-assign group to projects under path
mcpoyle rules remove <path>

mcpoyle scope <name> --project <path>     # move server/plugin to project-only

mcpoyle projects                          # list registry projects with MCP server status

mcpoyle doctor                            # audit config health across all clients
mcpoyle doctor --json                     # structured output for scripting

mcpoyle tui                               # open interactive TUI dashboard
mcpoyle reference                         # show full command reference
```

## TUI Surface

`mcp tui` opens a full-screen terminal dashboard built with Textual. The TUI provides a visual overview of all mcpoyle-managed state and supports toggle/action operations without requiring users to remember CLI syntax. For detailed edits (server command, args, env vars), users drop to the CLI or edit config directly — the TUI is not a form editor.

### Dashboard

The dashboard uses a tabbed interface with five tabs. Each tab takes the full screen, keeping the layout clean and readable. Tabs are navigated with number keys (1-5) or by clicking.

- **Servers & Plugins** (tab 1, default) — servers table on top, plugins table below. Servers show enabled/disabled state, command, and group membership. Plugins show enabled state, marketplace, and managed status.
- **Groups** (tab 2) — lists groups with member counts (servers and plugins) and description.
- **Clients** (tab 3) — lists detected clients with install status, assigned group, and last sync timestamp (or "never" if not yet synced).
- **Marketplaces** (tab 4) — lists registered marketplaces with source type (GitHub/local) and detail.
- **Projects** (tab 5) — lists active projects from the project registry with assigned group, MCP server count, and filesystem paths. Only visible when the registry database is available.

### Navigation

- 1/2/3/4/5 switches between tabs
- Arrow keys navigate within the active table (up/down through items)
- Tab switches focus between tables when a tab has multiple (e.g., servers and plugins)
- Esc closes a modal
- Standard keyboard conventions throughout — no vim bindings as default

### Actions

The TUI supports toggle and action operations on the selected item:

- **Enable/disable** servers and plugins (toggles the enabled state in the registry)
- **Assign** servers or plugins to groups (via command palette)
- **Trigger sync** for an individual client or all clients
- **Remove** servers or plugins from the registry

All mutations flow through the operations layer, the same code path the CLI uses.

### Sync Preview

When triggering a sync from the TUI, a preview panel appears before any writes occur:

- Shows the diff of what would be written to each client's config file
- Displays both server and plugin changes, grouped by client
- The user confirms to apply or cancels to return to the dashboard
- Equivalent to `mcpoyle sync --dry-run` followed by `mcpoyle sync`

### Command Palette

Ctrl+P opens a searchable command palette overlay:

- Lists all available actions: sync, add server, assign group, enable/disable, remove, etc.
- Fuzzy search matching — typing narrows the list in real time
- Selecting an action executes it against the currently highlighted item or prompts for a target

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
  ],
  "rules": [
    {"path": "~/Code/work", "group": "work"}
  ]
}
```

When `group` is `null`, the client receives all enabled servers (default behavior).

### Project-Level Assignments (Claude Code)

Claude Code supports per-project MCP server configs stored in `~/.claude.json` under `projects.<absolute-path>.mcpServers`. mcpoyle can assign different groups to different projects:

- **Global assignment** (`mcpoyle assign claude-code dev-tools`) — writes to the top-level `mcpServers` in `~/.claude.json`
- **Project assignment** (`mcpoyle assign claude-code dev-tools --project ~/Code/myapp`) — writes to `projects./Users/mike/Code/myapp.mcpServers` in `~/.claude.json`

Project assignments are tracked in the central config under `clients[].projects`. On sync, both the global and all project-level assignments are synced. The `--project` flag is only valid for `claude-code`.

## Path Rules

Path rules auto-assign groups to Claude Code projects based on their folder location. Instead of manually assigning a group to each project, you define a rule like "all projects under `~/Code/work/` get the `work` group" — and mcpoyle applies it automatically on sync.

### Rule Definition

```json
{
  "rules": [
    {"path": "~/Code/work", "group": "work"},
    {"path": "~/Code/personal", "group": "personal"}
  ]
}
```

The `path` field is a prefix — any project whose absolute path starts with the rule's resolved path matches. Tilde (`~`) expansion is applied before matching. The most specific (longest) matching prefix wins when multiple rules overlap.

### How Rules Apply

During `mcpoyle sync claude-code`, mcpoyle scans all project paths in `~/.claude.json` → `projects`. For each project that has no explicit assignment (via `mcpoyle assign`), mcpoyle checks the rules list for a matching prefix. If a rule matches, the project is automatically assigned to that rule's group and synced.

Explicit assignments always override rules. A project assigned via `mcpoyle assign claude-code dev-tools --project ~/Code/work/myapp` keeps `dev-tools` even if a rule says `~/Code/work` → `work`.

### CLI

```
mcpoyle rules list                        # list all path rules
mcpoyle rules add <path> <group>          # add a rule (group must exist)
mcpoyle rules remove <path>               # remove a rule
```

## Project Registry Integration

mcpoyle can optionally read from the project-registry SQLite database (`~/.local/share/project-registry/registry.db`) for project-aware scoping. This enables project-name-based assignments instead of relying solely on path rules, and gives the TUI a projects view.

### What It Provides

The registry knows which projects exist, what type they are (`project` or `area_of_focus`), their status (`active`, `archived`, etc.), and their filesystem paths. mcpoyle reads this to:

- **Validate projects** — when assigning servers to a project, mcpoyle can confirm the project exists and resolve its path automatically
- **Name-based assignment** — `mcpoyle assign claude-code dev-tools --project chorus` instead of requiring the full path
- **TUI projects view** — a tab showing registry projects with their assigned MCP servers and groups
- **Enriched sync** — during sync, use registry project paths alongside (or instead of) path rules to determine which groups apply

### Database Schema (read-only)

mcpoyle reads three tables from the registry:

- `projects` — `name`, `display_name`, `type`, `status`
- `project_paths` — filesystem paths per project (a project can have multiple paths, e.g., code + thinking surface)
- `project_fields` — extended key-value fields per project (e.g., `tech_stack`, `short_description`)

### Graceful Fallback

If the registry database doesn't exist or is inaccessible, mcpoyle falls back to current behavior — path rules and explicit assignments work as before. The registry is optional infrastructure, not a hard dependency.

### Resolution Order

When resolving which group a project gets during sync:

1. **Explicit assignment** (`mcpoyle assign --project`) — always wins
2. **Registry lookup** — if the project path matches a registry project with a group assignment
3. **Path rules** — prefix-based auto-assignment
4. **Default** — no group, receives all enabled servers

### CLI Enhancements

```
mcpoyle assign claude-code dev-tools --project chorus   # resolve project name via registry
mcpoyle projects                                        # list registry projects with MCP server status
```

### TUI Enhancement

The TUI gains a **Projects** tab showing all active registry projects with:

- Project name and type
- Assigned group (if any)
- Number of MCP servers in scope
- Filesystem paths

### Future: Write-Back

In a future version, mcpoyle may write `mcp_servers` back to the registry's `project_fields` table, making mcpoyle a producer as well as a consumer. This is deferred to keep the initial integration read-only and low-risk.

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

`mcpoyle plugins install <name>` registers a plugin from a known marketplace. mcpoyle:

1. Resolves the marketplace (explicit `--marketplace`, single marketplace auto-select, or defaults to `claude-plugins-official`)
2. Sets `"name@marketplace": true` in `~/.claude/settings.json` → `enabledPlugins`
3. Adds entry to mcpoyle's central config

Claude Code handles fetching plugin source to `~/.claude/plugins/cache/` automatically when it sees the `enabledPlugins` entry.

`mcpoyle plugins uninstall <name>` reverses this: removes from `enabledPlugins`, removes from groups, removes from mcpoyle's central config.

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
      "name": "my-plugins",
      "source": {"source": "directory", "path": "/Users/mike/Code/my-plugins"}
    }
  ]
}
```

When writing to Claude Code's `settings.json` → `extraKnownMarketplaces`, mcpoyle uses Claude Code's native format:

```json
{
  "extraKnownMarketplaces": {
    "my-plugins": {
      "source": {
        "source": "directory",
        "path": "/Users/mike/Code/my-plugins"
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

### Drift Detection

On each sync, mcpoyle computes a content hash (SHA-256) of every managed server/plugin config it writes. These hashes are stored in the central config alongside the `last_synced` timestamp. On the next sync, before writing, mcpoyle re-reads the client config and hashes the current state of each managed entry. If a hash differs from what mcpoyle last wrote, the entry was modified outside mcpoyle.

When drift is detected, `mcpoyle sync` reports it:

```
⚠ claude-desktop: server "ctx" was modified outside mcpoyle
  Use --force to overwrite, or --adopt to update mcpoyle's registry
```

Behavior:
- **Default** — warn and skip the drifted entry (don't overwrite manual edits)
- **`--force`** — overwrite with mcpoyle's version
- **`--adopt`** — update mcpoyle's central config to match the manually-edited version

`mcpoyle sync --dry-run` includes drift warnings in its output.

## Doctor

`mcpoyle doctor` runs a deterministic health audit across all managed configs — no network calls, no LLM. It checks for common issues and reports them with severity levels (error, warning, info).

### Checks

| Check | Severity | What it detects |
|-------|----------|-----------------|
| Missing env vars | error | Server env references an `op://` or variable that isn't set |
| Orphaned entries | warning | Server in a client config with `__mcpoyle` marker but not in central registry |
| Stale configs | warning | Client hasn't been synced since a server was added/modified |
| Config parse errors | error | Client config file exists but contains invalid JSON/TOML |
| Drift detected | warning | Managed entry was modified outside mcpoyle (same hash check as sync) |
| Unreachable binary | warning | Server command binary not found on `$PATH` |

### Output

```
$ mcpoyle doctor
✓ Central config valid (17 servers, 4 groups, 3 plugins)
✓ claude-desktop: config valid, in sync
⚠ cursor: server "prm" has missing env var GITHUB_TOKEN
⚠ claude-code: 2 orphaned entries (run mcpoyle sync to clean up)
✗ windsurf: config file contains invalid JSON

2 errors, 2 warnings
```

`mcpoyle doctor --json` outputs structured results for scripting.

## Registry

mcpoyle integrates with MCP server registries to discover, browse, and install servers without manually constructing configs. Two registries are supported out of the box, both with public APIs requiring no authentication:

- **Official MCP Registry** (`registry.modelcontextprotocol.io`) — the canonical upstream source (~10K servers). Returns structured package metadata with `registryType`, transport, and environment variable specifications.
- **Glama** (`glama.ai`) — the largest enriched directory (~19K servers, 70+ categories). Returns environment variable JSON schemas and hosting attributes. Good for non-dev tools (finance, marketing, productivity, etc.).

### Search

`mcpoyle registry search <query>` searches both registries, deduplicates results by name, and displays a merged list. Results show:

- Server name and description
- Source registry
- Transport type (stdio/HTTP)
- Popularity indicator (use count or download count when available)

### Show

`mcpoyle registry show <id>` fetches full details for a server from its source registry:

- Description and homepage
- Transport type and connection details
- Required environment variables (with descriptions when available)
- Available tools (when the registry provides them)
- Estimated token cost — approximate context window tokens for the server's tool definitions (name + description + schema, ~4 chars/token heuristic)

### Install

`mcpoyle registry add <id>` resolves the server config from the registry and adds it to mcpoyle's central config. The translation from registry metadata to mcpoyle's server format follows these rules:

| Registry Type | Command | Args |
|--------------|---------|------|
| `npm` | `npx` | `["-y", "<identifier>"]` |
| `pypi` | `uvx` | `["<identifier>"]` |

If the server requires environment variables, mcpoyle prompts for each one (or accepts them via `--env KEY=VAL` flags). Values containing `op://` references are stored as-is.

The server is added to the central config but not synced — run `mcpoyle sync` to push it to clients.

### Future Registry Support

Additional registries (Smithery, PulseMCP, MCP Scoreboard) can be added as opt-in sources when the user provides API keys. MCP Scoreboard provides quality grades across six dimensions (schema, protocol, reliability, docs, security, usability). The registry architecture is designed to support multiple backends with a unified search interface.

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
| Gemini CLI | `~/.gemini/settings.json` | JSON | No |
| Codex CLI | `~/.codex/config.toml` | TOML | No |
| Copilot CLI | `~/.copilot/mcp-config.json` | JSON | No |
| Copilot JetBrains | `~/.config/github-copilot/mcp.json` | JSON | No |
| Amazon Q | `~/.aws/amazonq/mcp.json` | JSON | No |
| Cline | `globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | JSON | No |
| Roo Code | `globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` | JSON | No |

**Note:** VS Code uses `mcp.servers` (dot-separated key path) instead of `mcpServers`. Zed uses `context_servers`. Some clients require a `"type": "stdio"` field in server entries. Codex CLI uses TOML format instead of JSON. Cline and Roo Code store configs in VS Code's `globalStorage` directory.

## Tech Stack

- **Language:** Python 3.12+
- **CLI framework:** click
- **TUI framework:** Textual
- **HTTP client:** httpx (for registry API calls)
- **Distribution:** uv / PyPI (`uvx mcpoyle`)
- **Config:** JSON (serde-style, no external DB)
- **Secrets:** 1Password CLI (`op://`) references in env values — mcpoyle stores the references, not plaintext

## Non-Goals

- Running or proxying MCP servers — mcpoyle only manages configs
- Server runtime health checks or monitoring — `mcpoyle doctor` audits config files, not running processes
- Multi-machine sync (single machine only)
- Marketplace auto-update management — controlled via Claude Code's UI, not JSON
- Plugin development tooling — mcpoyle manages installed plugins, not authoring
- Project/local plugin scopes (v0.4) — deferred until Claude Code stabilizes scope bugs

## Architecture

Core logic is organized into four layers: data model, operations, sync engine, and presentation. The CLI and TUI are both thin presentation layers over a shared operations + sync + config core. All mutations (install, uninstall, enable, disable, assign, scope, etc.) live in the operations layer, never in presentation code. All operations return structured data (dataclasses, dicts, result objects) — never print directly.

| Module | Role |
|--------|------|
| `config.py` | Data model (Server, Plugin, Marketplace, Group, etc.) and JSON I/O |
| `clients.py` | Client definitions, detection, config file read/write, CC settings helpers |
| `operations.py` | Business logic for all mutations (install, uninstall, enable, disable, assign, scope, etc.) — shared by CLI and TUI |
| `projects.py` | Project registry reader — reads project-registry SQLite DB for project-aware scoping |
| `sync.py` | Sync engine — resolves servers/plugins per client, writes configs |
| `registry.py` | MCP server registry clients (Official, Glama) — search, show, install |
| `cli.py` | Thin click wrapper that formats and displays |
| `tui.py` | Textual TUI dashboard — visual presentation layer |

## Design Principles

1. **Additive only on sync** — mcpoyle manages its own servers in client configs. It never deletes servers it didn't create. A `__mcpoyle` marker comment or metadata key identifies managed entries.
2. **Backwards compatible defaults** — no group assignment = sync all enabled servers, same as Conductor's current behavior.
3. **Idempotent** — running `mcpoyle sync` twice produces the same result.
4. **No daemon** — runs on demand, no file watching, no background process.
5. **Dry-run support** — `mcpoyle sync --dry-run` shows what would change without writing.
6. **Config backup** — before writing to any client's config file for the first time, mcpoyle creates a `.mcpoyle-backup` copy alongside the original. Subsequent writes do not overwrite the backup.

## Future

- **Multi-group assignments** — Allow projects and clients to be assigned multiple groups, with resolved servers/plugins being the union. Currently limited to one group each.
- **Project registry write-back** — Write `mcp_servers` to the project-registry's `project_fields` table, making mcpoyle a producer as well as a consumer.
- **Additional registries** — Smithery and PulseMCP as opt-in sources with API key configuration.
- **SkillsGate integration** — SkillsGate (`skillsgate.ai`) is an open marketplace for AI agent skills (coding workflows, prompt libraries). Different from MCP servers but complementary — could integrate as a skills discovery source alongside Claude Code plugins.

## Changelog

- **0.12.0** — Add content-hash drift detection to sync engine (warn on manual edits, `--force`/`--adopt` flags). Add `mcpoyle doctor` command for deterministic config health auditing (env vars, orphaned entries, stale configs, parse errors, unreachable binaries). Inspired by patterns in Caliber (ai-setup).
- **0.11.0** — Integrate project-registry for project-aware scoping. Read-only SQLite integration: name-based project assignment, `mcpoyle projects` command, Projects tab in TUI. Add `projects.py` module. Registry is optional with graceful fallback.
- **0.10.0** — Expand supported clients from 8 to 15 (add Gemini CLI, Codex CLI, Copilot CLI/JetBrains, Amazon Q, Cline, Roo Code). Add config backup before first sync. Add token cost estimates to registry show. Note MCP Scoreboard as future registry source.
- **0.9.0** — Integrate MCP server registries (Official MCP Registry + Glama). Search, show, and install servers from public registries with automatic config translation (npm→npx, pypi→uvx). Add httpx dependency. Note SkillsGate as future integration.
- **0.8.0** — Shift TUI from 5-panel simultaneous layout to 4-tab interface: Servers & Plugins (combined), Groups, Clients, Marketplaces
- **0.7.0** — Document path rules feature; fix CLI Surface to include rules, scope, tui, reference commands; correct plugin install/uninstall flow description
- **0.6.0** — Add TUI dashboard (Textual) via `mcp tui` subcommand; extract operations layer from CLI for shared business logic
- **0.5.0** — Add `scope` command for moving servers/plugins from global to project-only. Project-level plugin sync writes to `.claude/settings.local.json` with auto-workaround for CC bug #27247. Auto-creates groups when transitioning from "all servers" mode.
- **0.4.0** — Correct plugin spec against official docs: use `enabledPlugins` as source of truth (not `installed_plugins.json`), fix marketplace source format (`"source"` not `"type"`, `"directory"` not `"local"`), drop auto-update toggle (UI-only), scope to user-only for v1 due to CC scope bugs, add reserved marketplace name validation
- **0.3.0** — Add Claude Code plugin lifecycle management and marketplace registration
- **0.2.0** — Add project-level MCP server assignments for Claude Code
- **0.1.0** — Initial spec
