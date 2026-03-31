---
version: 1.0.1
status: active
last_updated: 2026-03-30
synopsis:
  short: "Central manager for MCP servers, skills, and plugins across AI clients"
  medium: "Ensemble is a library-first TypeScript toolkit that centrally manages MCP servers, agent skills (SKILL.md files), and Claude Code plugins across 17 AI clients. It exposes pure-function operations with Zod-validated schemas, a CLI for direct use, and package exports for app integration."
  readme: "Ensemble eliminates the pain of maintaining MCP server configurations, agent skills, and Claude Code plugins across Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, JetBrains, and 10 more clients. Define your servers and skills once, organize them into groups, assign groups to clients or projects, and sync. The library-first architecture means every operation is a pure function — load config, call an operation, save config — making Ensemble equally useful as a standalone CLI and as an imported dependency for app-level consumers like Chorus. Skills are SKILL.md files managed via a canonical store with symlink fan-out to each client's skills directory. Registry integration supports extensible backends with trust-tier classification, quality signals, metadata caching, and local capability search. A unified source parser accepts GitHub repos, local paths, and registry slugs through a single command. Zod schemas are exported for runtime validation by consumers."
  tech-stack: [TypeScript, Commander.js, Zod, Vitest, Biome, tsup, npm, better-sqlite3, proper-lockfile, smol-toml, JSON config]
  patterns: [library-first architecture, pure-function operations, Zod schema exports, additive sync, central registry, group-based assignment, path-rule auto-assignment, project-registry integration, multi-registry search, extensible registry adapters, registry metadata caching, server provenance tracking, tool metadata storage, context cost awareness, local capability search, presentation-agnostic core, operations layer, content-hash drift detection, deterministic health audit, guided onboarding, marker-based coexistence, canonical store + symlink fan-out, trust-tier classification, unified source parser, collision detection, pin/track provenance modes, dependency intelligence, pre-install security summary, deterministic config scoring, profile-as-plugin packaging, builtin meta-skill]
  goals: [single source of truth for MCP configs, cross-client sync, plugin lifecycle management, skill lifecycle management, registry discovery + install, project-aware scoping, library API for app consumers, CLI surface, server provenance and capability search, trust-tiered content safety]
---

# Ensemble

A library-first TypeScript toolkit for centrally managing MCP server configurations, agent skills, and Claude Code plugins across AI clients.

## Philosophy

Ensemble is designed to be equally useful as an imported library, a CLI tool, and a scripting target. Every operation is a pure function that takes a config object and returns an updated config plus a result — no side effects, no hidden state. This means an app like Chorus can import Ensemble's operations directly, a human can use the CLI, and an AI agent can script the CLI for fleet management. Structured output where it matters, deterministic behavior, no interactive prompts in the default path, and clear exit codes. The CLI is a thin wrapper over the library; the library is the real product.

## Problem

Each AI client (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, JetBrains) maintains its own MCP server config in its own format. Adding a server means editing multiple files. There's no way to assign different server sets to different clients.

Claude Code also has a plugin/marketplace system with configuration in `~/.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`) and a plugin cache at `~/.claude/plugins/cache/`. Managing plugins — installing, enabling, organizing across projects — requires manual JSON editing or the Claude Code UI. The native scope system (user/project/local) has known bugs around cross-scope visibility, making programmatic management even more valuable.

AI clients are also gaining support for agent skills — instruction files (SKILL.md) that live in client-specific directories and teach agents workflows, coding patterns, and domain knowledge. Skills are a different artifact type from servers (runtime processes) and plugins (code extensions): they're static markdown files with YAML frontmatter. Each client uses its own skills directory path, creating the same fragmentation problem that exists for server configs.

## Solution

A TypeScript library and CLI that manages a central registry of servers, skills, and plugins, organizes them into groups, and syncs the right configuration to the right clients. Servers sync via config-entry writes; skills sync via canonical store with symlink fan-out to each client's skills directory. For Claude Code, this extends to full plugin lifecycle management: install, uninstall, enable, disable, and marketplace registration. App consumers (like Chorus) import Ensemble as a dependency and call operations directly.

## Core Concepts

- **Server** — an MCP server definition (name, command, args, env, transport, and optionally url, auth, origin, and tool metadata). Servers are runtime processes that provide tools to AI agents.
- **Skill** — an agent instruction file (SKILL.md with YAML frontmatter: name, description, and optionally dependencies, tags). Skills are static markdown files that teach agents workflows, coding patterns, and domain knowledge. They are not runtime processes (servers) or code extensions (plugins).
- **Plugin** — a Claude Code plugin (name, marketplace, scope, enabled state)
- **Marketplace** — a source of plugins (GitHub repo or local directory)
- **Group** — a named collection of servers, skills, and/or plugins (e.g., "dev-tools", "work", "personal")
- **Client** — an AI application that consumes MCP servers and optionally skills (detected automatically)
- **Sync** — writing the correct servers, skills, and plugin state to each client's config and skills directory, filtered by group assignment. Servers sync via config-entry writes; skills sync via symlink fan-out from the canonical store.
- **Origin** — provenance metadata tracking where a server or skill was imported from, when, by what method, and its trust tier
- **Trust Tier** — classification of registry content: `official` (verified publishers), `community` (unverified registry content), `local` (user-defined). Displayed in search results and `show` output.

## Library API

Ensemble is published as `ensemble` on npm. The package exposes multiple entry points so consumers import only what they need.

### Package Exports

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./operations": "./dist/operations.js",
    "./schemas": "./dist/schemas.js",
    "./clients": "./dist/clients.js",
    "./registry": "./dist/registry.js",
    "./sync": "./dist/sync.js",
    "./skills": "./dist/skills.js",
    "./search": "./dist/search.js",
    "./doctor": "./dist/doctor.js"
  }
}
```

### Config Loading Pattern

Config I/O is separated from operations. The consumer is responsible for loading and saving config — Ensemble never reads or writes files inside an operation function. This keeps operations pure and testable.

```ts
import { loadConfig, saveConfig } from 'ensemble';
import { addServer, removeServer, enableServer } from 'ensemble/operations';

// Load once
const config = loadConfig();                          // reads ~/.config/ensemble/config.json
// Mutate via pure functions
const result = addServer(config, { name: 'ctx', command: 'npx', args: ['tsx', 'index.ts'], transport: 'stdio' });
// Save when ready
saveConfig(result.config);
```

`loadConfig(path?)` reads and validates the config file, returning a typed `EnsembleConfig`. `saveConfig(config, path?)` writes the config atomically (write-to-temp then rename). Both use the default path `~/.config/ensemble/config.json` when no path is provided.

### Operations as Pure Functions

Every operation follows the same signature pattern:

```ts
type OperationResult<T> = { config: EnsembleConfig; result: T };

function addServer(config: EnsembleConfig, params: AddServerParams): OperationResult<Server>;
function removeServer(config: EnsembleConfig, name: string): OperationResult<{ removed: Server }>;
function enableServer(config: EnsembleConfig, name: string): OperationResult<Server>;
function disableServer(config: EnsembleConfig, name: string): OperationResult<Server>;
function assignGroup(config: EnsembleConfig, clientId: string, group: string, project?: string): OperationResult<void>;
function unassignGroup(config: EnsembleConfig, clientId: string, project?: string): OperationResult<void>;
// ... same pattern for skills, plugins, groups, marketplaces, rules
```

Operations take an immutable config and return a new config plus a typed result. They never perform I/O. Side effects (file writes, network calls) live in `sync`, `registry`, and `config` modules.

### Zod Schema Exports

All data types are defined as Zod schemas and exported for runtime validation by consumers:

```ts
import { ServerSchema, SkillSchema, EnsembleConfigSchema, GroupSchema } from 'ensemble/schemas';

// Validate external data
const server = ServerSchema.parse(untrustedInput);

// Infer types
import type { Server, Skill, EnsembleConfig } from 'ensemble/schemas';
```

Schemas serve as both runtime validators and TypeScript type sources (via `z.infer`). This eliminates the need for separate type definitions and validation logic.

### Client Resolution API

```ts
import { resolveServers, resolveSkills, resolvePlugins } from 'ensemble';
import { detectClients } from 'ensemble/clients';

const clients = detectClients();                         // scan for installed AI clients
const servers = resolveServers(config, 'cursor');        // servers that would sync to Cursor
const skills = resolveSkills(config, 'claude-code');     // skills that would sync to Claude Code
```

The resolve functions live in `config.ts` and are re-exported from the root `ensemble` package. `detectClients` is in `clients.ts`. Resolution applies group filtering, path rules, and project-level overrides — the same logic the sync engine uses, exposed for consumers who need to inspect without writing.

### Registry API

```ts
import { searchRegistry, showRegistry, resolveFromRegistry } from 'ensemble/registry';

const results = await searchRegistry('database');            // searches all enabled backends
const detail = await showRegistry('postgres');                // full server details from registry
const serverConfig = await resolveFromRegistry('postgres');   // ready-to-add server config
```

Registry functions are async (they make network calls). Results include trust tier, quality signals, and transport details.

### Integration Guidance

For app consumers like Chorus:

1. **Add `ensemble` as a dependency** — `npm install ensemble`
2. **Load config at app startup** — call `loadConfig()` once, pass to operations as needed
3. **Use operations for mutations** — pure functions, easy to integrate into any state management
4. **Use schemas for validation** — validate user input or external data with Zod schemas before passing to operations
5. **Use resolution APIs for display** — `resolveServers` and `resolveSkills` answer "what would this client see?" without writing anything
6. **Call sync explicitly** — `syncClient(config, clientId)` writes to the client's config; the consumer decides when

Ensemble manages configs and sync. It does NOT spawn, proxy, or manage live MCP server connections. That responsibility stays with the consuming app or the AI client itself.

## CLI Surface

```
ensemble list                              # list all servers
ensemble add <name> --command <cmd> [--args ...] [--env KEY=VAL ...]   # explicit server add
                                              # (or use unified: ensemble add <source> — see below)
ensemble remove <name>
ensemble enable <name>
ensemble disable <name>
ensemble show <name>                       # show server details

ensemble groups list                       # list all groups
ensemble groups create <name> [--description ...]
ensemble groups delete <name>
ensemble groups show <name>                # show group members
ensemble groups add-server <group> <server>
ensemble groups remove-server <group> <server>

ensemble clients                           # detect installed clients + sync status
ensemble assign <client> <group>           # assign a group to a client
ensemble assign <client> --all             # assign all enabled servers (default)
ensemble assign <client> <group> --project ~/Code/myapp  # project-level (Claude Code only)
ensemble unassign <client>                 # revert to syncing all servers
ensemble unassign <client> --project ~/Code/myapp         # unassign project-level

ensemble sync [<client>]                   # sync all or one client
ensemble sync claude-code --project ~/Code/myapp          # sync a specific project
ensemble import <client>                   # import servers from a client's config

ensemble registry search <query>           # search MCP server registries
ensemble registry show <id>               # show server details from registry
ensemble registry add <id>                 # install server from registry
ensemble registry backends                 # list available registry backends

ensemble search <query>                    # search local servers by capability (tools, descriptions)

ensemble add <source>                          # (FUTURE) unified add — infers type from source format:
                                              #   owner/repo (GitHub), ./local/path, registry:slug, full URL
ensemble add <source> --type server|skill      # (FUTURE) explicit type when inference is ambiguous

ensemble skills list                           # list all skills
ensemble skills add <name> --from <source>     # (FUTURE) add skill from GitHub repo, local path, or catalog
ensemble skills remove <name>
ensemble skills show <name>                    # show skill details (frontmatter, dependencies, trust tier)
ensemble skills search <query>                 # search skills catalog (claude-plugins.dev)
ensemble skills sync [<client>]                # sync skills to client skills directories (symlink fan-out)
ensemble skills sync --dry-run                 # preview skill sync plan (file operations, backup)

ensemble plugins list                      # list all plugins (installed + enabled state)
ensemble plugins install <name> [--marketplace <name>]
ensemble plugins uninstall <name>
ensemble plugins enable <name>
ensemble plugins disable <name>
ensemble plugins show <name>               # show plugin details
ensemble plugins import                    # import existing plugins into ensemble registry

ensemble marketplaces list                 # list known marketplaces
ensemble marketplaces add <name> --repo <owner/repo>
ensemble marketplaces add <name> --path /local/dir
ensemble marketplaces remove <name>
ensemble marketplaces show <name>          # show marketplace details + plugins

ensemble groups add-skill <group> <skill>
ensemble groups remove-skill <group> <skill>
ensemble groups add-plugin <group> <plugin>
ensemble groups remove-plugin <group> <plugin>
ensemble groups export <group> --as-plugin     # compile group into a CC plugin (profile-as-plugin)

ensemble rules list                        # list all path rules
ensemble rules add <path> <group>          # auto-assign group to projects under path
ensemble rules remove <path>

ensemble scope <name> --project <path>     # move server/plugin to project-only

ensemble projects                          # list registry projects with MCP server status

ensemble collisions                        # detect scope conflicts between global and project groups
ensemble deps                              # show skill dependency status

ensemble migrate [--dry-run]               # migrate from mcpoyle to Ensemble

ensemble registry cache-clear              # clear file-based registry response cache

ensemble init                              # guided first-run setup
ensemble doctor                            # audit config health across all clients
ensemble doctor --json                     # structured output for scripting

ensemble reference                         # show full command reference
```

The CLI binary is `ensemble` with `ens` as a short alias. Built with Commander.js as a thin wrapper over the operations and sync modules.

## Config

Central config at `~/.config/ensemble/config.json`:

```json
{
  "servers": [
    {
      "name": "ctx",
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/index.ts", "serve"],
      "env": {},
      "origin": {
        "source": "import",
        "client": "cursor",
        "timestamp": "2026-03-01T12:00:00Z"
      }
    },
    {
      "name": "remote-db",
      "enabled": true,
      "transport": "http",
      "url": "https://mcp.example.com/db",
      "auth_type": "bearer",
      "auth_ref": "op://Dev/remote-db/token",
      "tools": [
        {"name": "query", "description": "Run a read-only SQL query"},
        {"name": "schema", "description": "List tables and columns"}
      ]
    }
  ],
  "skills": [
    {
      "name": "git-workflow",
      "enabled": true,
      "description": "Git branching and PR workflow instructions",
      "path": "~/.config/ensemble/skills/git-workflow/SKILL.md",
      "origin": {
        "source": "catalog",
        "catalog_id": "git-workflow",
        "trust_tier": "community",
        "timestamp": "2026-03-30T12:00:00Z"
      },
      "dependencies": ["github-mcp"],
      "tags": ["git", "workflow"]
    }
  ],
  "groups": [
    {
      "name": "dev-tools",
      "description": "Core development MCP servers",
      "servers": ["ctx", "prm", "knowmarks"],
      "skills": ["git-workflow"],
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

### Migration from mcpoyle

On first run, Ensemble detects the legacy mcpoyle installation and migrates automatically:

- **Config file:** `~/.config/mcpoyle/config.json` is copied to `~/.config/ensemble/config.json`. The original is preserved as a backup.
- **Skills store:** `~/.config/mcpoyle/skills/` is moved to `~/.config/ensemble/skills/`. Symlinks in client skills directories are updated to point to the new canonical paths.
- **Cache:** `~/.config/mcpoyle/cache/` is moved to `~/.config/ensemble/cache/`.
- **Client markers:** `__mcpoyle` markers in client config files are replaced with `__ensemble` during the next sync.
- **Meta-skill:** The `mcpoyle-usage` builtin skill is replaced with `ensemble-usage`.

Migration is idempotent — running it again after completion is a no-op. If both `~/.config/mcpoyle/` and `~/.config/ensemble/` exist, Ensemble uses `~/.config/ensemble/` and does not re-migrate.

### Server Model Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique server identifier |
| `enabled` | yes | Whether the server is active |
| `transport` | yes | `"stdio"`, `"http"`, `"sse"`, or `"streamable-http"` |
| `command` | stdio only | Executable command |
| `args` | stdio only | Command arguments |
| `env` | no | Environment variables (may contain `op://` refs) |
| `url` | http only | Server endpoint URL for HTTP/SSE transport |
| `auth_type` | http only | Authentication method: `"bearer"`, `"api-key"`, `"header"` |
| `auth_ref` | http only | Auth credential reference (typically `op://` for 1Password) |
| `origin` | no | Provenance metadata (see below) |
| `tools` | no | Cached tool definitions from registry (see below) |

**Origin tracking.** The optional `origin` object records where a server came from: `source` (one of `"import"`, `"registry"`, `"manual"`), `client` (for imports — which client it was imported from), `registry_id` (for registry installs — the registry identifier), and `timestamp` (ISO 8601). Origin data enriches `doctor` output and drift messages — e.g., "Server 'postgres' (imported from Cursor on 2026-03-01) has drifted."

**Tool metadata.** The optional `tools` array stores tool definitions fetched from the registry at install time. Each entry has `name` and `description`. This avoids discarding metadata after `registry show` output and enables local capability search via `ensemble search`. Tools are populated automatically on `registry add` and can be refreshed with `registry show --update-tools`.

### Skill Model Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique skill identifier (matches directory name in canonical store) |
| `enabled` | yes | Whether the skill is active |
| `description` | yes | One-line description (from SKILL.md frontmatter) |
| `path` | yes | Absolute path to the SKILL.md in the canonical store |
| `origin` | no | Provenance metadata — source, trust tier, timestamp |
| `dependencies` | no | List of MCP server names this skill requires |
| `tags` | no | Freeform tags for categorization and search |
| `mode` | no | `"track"` (follow upstream, default for catalog/registry installs) or `"pin"` (frozen, default for manual/local) |

**SKILL.md format.** A skill is a markdown file with YAML frontmatter containing at minimum `name` and `description`. The markdown body contains the agent instructions. This format is the dominant convention across the skills ecosystem (7/8 reference implementations converge on it).

```markdown
---
name: git-workflow
description: Git branching and PR workflow instructions
dependencies:
  - github-mcp
tags:
  - git
  - workflow
---

# Git Workflow

When working with git repositories, follow these patterns...
```

### Provenance Modes (Pin/Track)

Servers and skills track their update mode via an optional `mode` field on the origin object:

- **`track`** (default for registry/catalog installs) — Ensemble checks upstream for updates and notifies on drift. `ensemble doctor` flags tracked items that have diverged from their source.
- **`pin`** (default for manual/local items) — frozen at the installed version. No upstream checks. The user controls all changes.

`ensemble pin <name>` and `ensemble track <name>` toggle the mode. The mode is informational — Ensemble never auto-updates content. "Track" means "notify me," not "update for me."

### Dependency Intelligence

Skills can declare MCP server dependencies in their frontmatter (`dependencies: [server-name]`). Servers can suggest co-installed peers via an optional `peers` field in the origin object. Dependencies are advisory, not enforced:

- `ensemble skills show <name>` lists dependencies and whether each required server is present in the registry
- `ensemble skills add <name>` warns if dependencies are missing but proceeds with the install
- `ensemble doctor` flags skills with unresolved dependencies as info-level findings

### Project-Level Assignments (Claude Code)

Claude Code supports per-project MCP server configs stored in `~/.claude.json` under `projects.<absolute-path>.mcpServers`. Ensemble can assign different groups to different projects:

- **Global assignment** (`ensemble assign claude-code dev-tools`) — writes to the top-level `mcpServers` in `~/.claude.json`
- **Project assignment** (`ensemble assign claude-code dev-tools --project ~/Code/myapp`) — writes to `projects./Users/mike/Code/myapp.mcpServers` in `~/.claude.json`

Project assignments are tracked in the central config under `clients[].projects`. On sync, both the global and all project-level assignments are synced. The `--project` flag is only valid for `claude-code`.

## Path Rules

Path rules auto-assign groups to Claude Code projects based on their folder location. Instead of manually assigning a group to each project, you define a rule like "all projects under `~/Code/work/` get the `work` group" — and Ensemble applies it automatically on sync.

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

During `ensemble sync claude-code`, Ensemble scans all project paths in `~/.claude.json` → `projects`. For each project that has no explicit assignment (via `ensemble assign`), Ensemble checks the rules list for a matching prefix. If a rule matches, the project is automatically assigned to that rule's group and synced.

Explicit assignments always override rules. A project assigned via `ensemble assign claude-code dev-tools --project ~/Code/work/myapp` keeps `dev-tools` even if a rule says `~/Code/work` → `work`.

### CLI

```
ensemble rules list                        # list all path rules
ensemble rules add <path> <group>          # add a rule (group must exist)
ensemble rules remove <path>               # remove a rule
```

## Skills Management

Skills are the third entity type in Ensemble, alongside servers and plugins. While servers are runtime processes and plugins are code extensions, skills are static instruction files that teach AI agents workflows, coding patterns, and domain knowledge.

### Canonical Store

All skills are written once to a central location at `~/.config/ensemble/skills/<name>/SKILL.md`. This is the single source of truth for skill content. Each skill lives in its own directory to accommodate future multi-file skills (e.g., skills with embedded examples or data files).

### Sync Strategy: Symlink Fan-Out

Skills use a fundamentally different sync strategy from servers. Servers sync by writing entries into client config files (JSON/TOML). Skills sync by creating symlinks from each client's skills directory back to the canonical store:

```
~/.config/ensemble/skills/git-workflow/SKILL.md  (canonical)
    ↓ symlink
~/.claude/skills/git-workflow/SKILL.md
~/.cursor/skills/git-workflow/SKILL.md
~/.codex/skills/git-workflow/SKILL.md
```

**Fallback:** On platforms or filesystems where symlinks fail, Ensemble falls back to file copy. A content hash (SHA-256) of the canonical file is stored to enable drift detection on copied skills.

**Backup strategy.** Because skills sync writes to disk (unlike server sync which writes to config files), `ensemble skills sync` generates a plan of file operations before executing. On first sync to a client's skills directory, Ensemble creates a backup manifest (`~/.config/ensemble/backups/skills-<timestamp>.json`) containing SHA-256 hashes of all files that will be created or overwritten. This enables rollback via `ensemble skills sync --rollback`.

### Client Skills Directory Mapping

Each ClientDef gains an optional `skills_dir` field. Not all clients support skills — this creates an intentional asymmetry. Skills commands silently skip clients without skills support.

| Client | Skills Directory | Status |
|--------|-----------------|--------|
| Claude Code | `~/.claude/skills/<name>/` | Supported |
| Cursor | `~/.cursor/skills/<name>/` | Supported |
| Codex CLI | `~/.codex/skills/<name>/` | Supported |
| Windsurf | `~/.windsurf/skills/<name>/` | Supported |
| VS Code (Copilot) | TBD | Pending confirmation |
| Zed | TBD | Pending confirmation |
| Other clients | — | Not applicable |

The skills directory paths are configured in the client definitions. As clients add skills support, new paths are added without changing the sync logic.

### Builtin Meta-Skill

Ensemble ships a built-in skill (`ensemble-usage`) that teaches AI agents how to use Ensemble itself. This creates a bootstrapping loop: agents with skills support auto-discover Ensemble commands.

The meta-skill is installed automatically on `ensemble init` and contains instructions for `ensemble search`, `ensemble list`, `ensemble sync`, `ensemble skills`, and other commonly useful commands. It is marked with `origin.source: "builtin"` and `origin.trust_tier: "official"`. The meta-skill is excluded from `ensemble skills remove` unless `--force` is used.

### Skills Catalog Integration

The claude-plugins.dev API serves as a skills catalog backend, providing access to ~58K community skills. The API is public, paginated, and requires no authentication.

**Catalog response fields:** `id`, `name`, `namespace`, `sourceUrl`, `description`, `author`, `installs`, `stars`.

`ensemble skills search <query>` searches the catalog. Results show name, description, author, install count, and trust tier (community for all catalog content). `ensemble skills add <name> --from catalog:<id>` fetches the skill from its `sourceUrl` and writes it to the canonical store.

The catalog adapter sits alongside the Official MCP Registry and Glama as a registry backend, but serves skills instead of servers. It is implemented as a registry adapter (see Registry Adapter Pattern) with the same `search`/`show`/`resolve` interface.

### Collision Detection

When `ensemble skills sync` would write a skill that conflicts with one already in the target client's skills directory at a different scope (user-level vs. project-level `.claude/skills/`), Ensemble surfaces the collision:

```
⚠ claude-code: skill "git-workflow" exists at project scope (.claude/skills/git-workflow/)
  Canonical version differs from project version.
  Use --force to overwrite project skill, or --skip to leave project version.
```

Collision detection also applies to server sync: when a server being synced conflicts with one already present in the client config at a different scope (user vs project), Ensemble reports which scope wins based on the client's precedence rules.

## Project Registry Integration

Ensemble can optionally read from the project-registry SQLite database (`~/.local/share/project-registry/registry.db`) via better-sqlite3 for project-aware scoping. This enables project-name-based assignments instead of relying solely on path rules.

### What It Provides

The registry knows which projects exist, what type they are (`project` or `area_of_focus`), their status (`active`, `archived`, etc.), and their filesystem paths. Ensemble reads this to:

- **Validate projects** — when assigning servers to a project, Ensemble can confirm the project exists and resolve its path automatically
- **Name-based assignment** — `ensemble assign claude-code dev-tools --project chorus` instead of requiring the full path
- **Enriched sync** — during sync, use registry project paths alongside (or instead of) path rules to determine which groups apply

### Database Schema (read-only)

Ensemble reads three tables from the registry:

- `projects` — `name`, `display_name`, `type`, `status`
- `project_paths` — filesystem paths per project (a project can have multiple paths, e.g., code + thinking surface)
- `project_fields` — extended key-value fields per project (e.g., `tech_stack`, `short_description`)

### Graceful Fallback

If the registry database doesn't exist or is inaccessible, Ensemble falls back to current behavior — path rules and explicit assignments work as before. The registry is optional infrastructure, not a hard dependency.

### Resolution Order

When resolving which group a project gets during sync:

1. **Explicit assignment** (`ensemble assign --project`) — always wins
2. **Registry lookup** — if the project path matches a registry project with a group assignment
3. **Path rules** — prefix-based auto-assignment
4. **Default** — no group, receives all enabled servers

### CLI Enhancements

```
ensemble assign claude-code dev-tools --project chorus   # resolve project name via registry
ensemble projects                                        # list registry projects with MCP server status
```

### Future: Write-Back

In a future version, Ensemble may write `mcp_servers` back to the registry's `project_fields` table, making Ensemble a producer as well as a consumer. This is deferred to keep the initial integration read-only and low-risk.

## Plugins (Claude Code)

Ensemble manages the full plugin lifecycle for Claude Code. Plugins are identified by short name when unambiguous (e.g., `clangd-lsp`), or by full qualified name when needed (`clangd-lsp@claude-plugins-official`).

### Source of Truth

Claude Code tracks plugin state via `enabledPlugins` in settings files — **not** `installed_plugins.json` (which is an undocumented internal file). Ensemble uses `enabledPlugins` as the canonical source of truth for what's installed and enabled.

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

Plugins managed by Ensemble are tracked in the central config:

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

- `managed: true` — installed/tracked by Ensemble
- `managed: false` — imported or adopted from existing installation
- `adopt_unmanaged_plugins` — when `true`, `ensemble sync` automatically adopts manually-installed plugins into the Ensemble registry. When `false` (default), manually-installed plugins are left untouched; use `ensemble plugins import` to adopt them explicitly.

### Scopes

Claude Code supports three plugin scopes that determine which settings file receives the `enabledPlugins` entry. All scopes cache plugin files at `~/.claude/plugins/cache/` — scope only controls visibility, not file location.

| Scope | Settings file | Use case |
|-------|--------------|----------|
| `user` | `~/.claude/settings.json` | Available globally (default) |
| `project` | `.claude/settings.json` | Team plugins, committed to repo |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |

**Note:** Claude Code's scope system has known bugs (cross-scope visibility issues, `settings.local.json` `enabledPlugins` silently ignored unless the key also exists in `settings.json`). Ensemble v1 supports `user` scope only. Project and local scope support will be added once Claude Code stabilizes these behaviors.

### Install / Uninstall

`ensemble plugins install <name>` registers a plugin from a known marketplace. Ensemble:

1. Resolves the marketplace (explicit `--marketplace`, single marketplace auto-select, or defaults to `claude-plugins-official`)
2. Sets `"name@marketplace": true` in `~/.claude/settings.json` → `enabledPlugins`
3. Adds entry to Ensemble's central config

Claude Code handles fetching plugin source to `~/.claude/plugins/cache/` automatically when it sees the `enabledPlugins` entry.

`ensemble plugins uninstall <name>` reverses this: removes from `enabledPlugins`, removes from groups, removes from Ensemble's central config.

### Enable / Disable

Toggles the plugin's entry in `~/.claude/settings.json` → `enabledPlugins` (`true`/`false`) without removing the cached installation. Also updates the central Ensemble config.

### Import

`ensemble plugins import` scans `enabledPlugins` in `~/.claude/settings.json` and adds any plugins not already in Ensemble's registry. Marks them as `managed: false` initially. Does not modify Claude Code's config — purely additive to Ensemble's central config.

## Marketplaces (Claude Code)

Marketplaces are plugin sources — GitHub repos or local directories containing a `.claude-plugin/marketplace.json` manifest.

### Marketplace Registry

Ensemble tracks marketplaces in its central config:

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

When writing to Claude Code's `settings.json` → `extraKnownMarketplaces`, Ensemble uses Claude Code's native format:

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

Claude Code reserves certain marketplace names: `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `life-sciences`. Ensemble validates against these on `marketplaces add`.

### Add / Remove

`ensemble marketplaces add <name> --repo owner/repo` registers a GitHub-based marketplace in both Ensemble's config and Claude Code's `settings.json` → `extraKnownMarketplaces`.

`ensemble marketplaces add <name> --path /local/dir` registers a local directory marketplace (uses `"source": "directory"` in Claude Code's format).

`ensemble marketplaces remove <name>` removes from both Ensemble's config and Claude Code's `extraKnownMarketplaces`. Does not uninstall plugins from that marketplace.

### Auto-Update

Marketplace auto-update is controlled through Claude Code's UI, not via JSON config files. Ensemble does not manage auto-update settings. The `DISABLE_AUTOUPDATER` and `FORCE_AUTOUPDATE_PLUGINS` environment variables can override update behavior globally.

### Profile-as-Plugin Packaging

Groups can be compiled into a standalone Claude Code plugin via a local marketplace that Ensemble controls. This enables distributing Ensemble bundles as first-class CC plugins without requiring Ensemble on the target machine.

`ensemble groups export <group> --as-plugin` generates a plugin package containing:
- All servers in the group (as a CC plugin that registers MCP servers)
- All skills in the group (bundled as plugin assets)
- A marketplace manifest compatible with Claude Code's plugin system

The generated plugin is written to a local marketplace directory (`~/.config/ensemble/marketplace/`) that Ensemble registers in Claude Code's `extraKnownMarketplaces`. This means the exported group appears as an installable plugin in Claude Code's plugin browser — usable by anyone with access to the marketplace directory, even without Ensemble installed.

## Sync

When a group contains servers, skills, and/or plugins, `ensemble sync` handles all three via their respective strategies:

- **Servers** are synced by writing entries to the target client's config file (JSON/TOML). All clients.
- **Skills** are synced by creating symlinks from the canonical store to the client's skills directory (file-level operations). Only clients with `skills_dir` support.
- **Plugins** are synced to Claude Code's plugin config (Claude Code only).
- Skill entries in groups are silently ignored for clients without skills support. Plugin entries are silently ignored for non-Claude Code clients.

`ensemble sync --dry-run` shows server, skill, and plugin changes. Skills preview shows the file operations (create symlink, update symlink, remove symlink) rather than config diff.

### Drift Detection

On each sync, Ensemble computes a content hash (SHA-256) of every managed server/plugin config it writes. These hashes are stored in the central config alongside the `last_synced` timestamp. On the next sync, before writing, Ensemble re-reads the client config and hashes the current state of each managed entry. If a hash differs from what Ensemble last wrote, the entry was modified outside Ensemble.

When drift is detected, `ensemble sync` reports it with provenance context when available:

```
⚠ claude-desktop: server "ctx" (imported from Cursor on 2026-03-01) was modified outside Ensemble
  Use --force to overwrite, or --adopt to update Ensemble's registry
```

Behavior:
- **Default** — warn and skip the drifted entry (don't overwrite manual edits)
- **`--force`** — overwrite with Ensemble's version
- **`--adopt`** — update Ensemble's central config to match the manually-edited version

`ensemble sync --dry-run` includes drift warnings in its output.

### Context Cost Awareness

When `ensemble sync` would push a large number of servers to a client, it surfaces a tool-count and estimated token cost summary before writing. This extends the existing token cost estimate feature (from `registry show`) to the sync surface.

```
$ ensemble sync cursor
Sync preview for cursor:
  12 servers, 47 tools, ~8,400 estimated context tokens

  ⚠ High tool count — 47 tools may consume significant context window.
    Consider using groups to limit servers per client.

Proceed? [Y/n]
```

The warning threshold is configurable via `settings.sync_cost_warning_threshold` (default: 50 tools). `--dry-run` includes cost summaries without the confirmation prompt. `--yes` skips the prompt.

## Init

`ensemble init` is a guided onboarding command for first-time setup. It walks the user through client detection, optional server import, group creation, and initial assignment — replacing the need to run multiple commands manually.

### Flow

1. **Detect clients** — scans for installed AI clients and displays them with install status and skills support indicator
2. **Auto-discovery display** — before asking what to import, shows a unified view of ALL servers AND skills across ALL detected clients. The user sees the full landscape: which servers and skills exist where, which are duplicated across clients, and which are unique to one client. This overview informs the import decision.
3. **Import existing servers** — the user selects which servers to import from the unified view (or selects all). Deduplication is automatic — servers with identical name+command appearing in multiple clients are imported once.
4. **Import existing skills** — scans each client's skills directory for SKILL.md files. Single-source skills (found in only one client) are auto-migrated to the canonical store. Multi-source skills (same name in multiple clients with different content) are presented as conflicts for the user to resolve — pick one version, or skip and handle manually.
5. **Install meta-skill** — installs the built-in `ensemble-usage` skill to the canonical store and syncs it to all skills-capable clients.
6. **Create groups** — prompts to create one or more groups (e.g., "dev-tools", "work", "personal") with optional descriptions
7. **Assign groups** — for each detected client, prompts to assign a group or keep the default (all enabled servers and skills)
8. **Initial sync** — runs `ensemble sync --dry-run` to preview, then `ensemble sync` on confirmation

### Behavior

- Skips steps that are already done (e.g., if servers already exist in the central config, skip import)
- Non-destructive — never overwrites existing config, only adds
- Can be re-run safely; detects existing state and adjusts prompts
- `ensemble init --auto` skips interactive prompts: imports from all detected clients, creates no groups, assigns all servers to all clients, and syncs

### Output

```
$ ensemble init
Detected clients:
  ✓ Claude Desktop (installed)
  ✓ Claude Code (installed, skills ✓)
  ✓ Cursor (installed, skills ✓)
  · Windsurf (not found)

Servers across all clients:
  Server          Claude Desktop   Claude Code   Cursor
  ctx             ✓                ✓             ✓
  prm             ✓                ·             ✓
  postgres        ·                ✓             ·
  3 unique servers across 3 clients (2 duplicated)

Skills across clients:
  Skill               Claude Code   Cursor
  git-workflow         ✓             ·
  1 skill found in 1 client

Import servers? [A]ll / [s]elect / [n]one: a
  + ctx (npx tsx /path/to/index.ts serve)
  + prm (npx tsx /path/to/prm/index.ts serve)
  + postgres (npx @mcp/postgres)
  Imported 3 servers.

Import skills? [A]ll / [s]elect / [n]one: a
  + git-workflow → ~/.config/ensemble/skills/git-workflow/SKILL.md
  Imported 1 skill.

Installing ensemble-usage meta-skill...
  + ensemble-usage → ~/.config/ensemble/skills/ensemble-usage/SKILL.md

Create a group? [y/N] y
  Group name: dev-tools
  Description: Core development servers and skills

  Add servers to dev-tools:
    [x] ctx
    [x] prm
  Add skills to dev-tools:
    [x] git-workflow
  Added 2 servers and 1 skill to dev-tools.

Assign groups to clients:
  Claude Desktop → dev-tools (servers only — no skills support)
  Claude Code → (all servers + skills)
  Cursor → dev-tools

Preview sync... (dry run)
  Claude Desktop: would sync
    + ctx
    + prm
  Claude Code: would sync
    + ctx, prm, postgres (servers)
    + git-workflow, ensemble-usage (skills → symlink)
  ...

Apply? [Y/n] y
  Claude Desktop: synced
  Claude Code: synced (3 servers, 2 skills)
  Cursor: synced (2 servers, 1 skill)

Setup complete. Run 'ensemble sync' after changes.
```

## Doctor

`ensemble doctor` runs a deterministic health audit across all managed configs — no network calls, no LLM. It checks for common issues and reports them with severity levels (error, warning, info).

### Structured Scoring

Each doctor check produces a structured result with deterministic scoring:

```json
{
  "id": "env-vars",
  "category": "existence",
  "maxPoints": 10,
  "earnedPoints": 8,
  "severity": "error",
  "message": "Server 'postgres' missing env var DATABASE_URL",
  "fix": {
    "command": "ensemble show postgres",
    "description": "Review required environment variables"
  }
}
```

**Scoring categories:**
- **Existence** — required files and configs are present
- **Freshness** — configs are current (no stale sync, no pending changes)
- **Grounding** — referenced paths, binaries, and servers actually exist
- **Cross-platform parity** — clients with the same group assignment have matching configs
- **Skills health** — symlinks are valid, dependencies are resolved, canonical store is consistent

The aggregate score (`earnedPoints / maxPoints` across all checks) gives a single health percentage. `ensemble doctor --json` outputs the full structured results for scripting and dashboards.

### Checks

| Check | Category | Severity | What it detects |
|-------|----------|----------|-----------------|
| Missing env vars | existence | error | Server env references an `op://` or variable that isn't set |
| Orphaned entries | existence | warning | Server/skill in a client config/directory with `__ensemble` marker but not in central registry |
| Stale configs | freshness | warning | Client hasn't been synced since a server/skill was added/modified |
| Config parse errors | existence | error | Client config file exists but contains invalid JSON/TOML |
| Drift detected | freshness | warning | Managed entry was modified outside Ensemble (includes origin context when available) |
| Unreachable binary | grounding | warning | Server command binary not found on `$PATH` |
| Missing tool metadata | grounding | info | Server installed from registry but has no cached tools (suggest `registry show --update-tools`) |
| Broken skill symlink | grounding | error | Skill symlink in client directory points to missing canonical file |
| Unresolved skill deps | grounding | info | Skill declares server dependencies that are not in the registry |
| Tracked item drift | freshness | info | Tracked server/skill has diverged from upstream source |
| Cross-client parity | parity | warning | Clients with the same group assignment have different effective configs |

### Output

```
$ ensemble doctor
✓ Central config valid (17 servers, 5 skills, 4 groups, 3 plugins)
✓ claude-desktop: config valid, in sync
⚠ cursor: server "prm" has missing env var GITHUB_TOKEN
⚠ claude-code: 2 orphaned entries (run ensemble sync to clean up)
✗ windsurf: config file contains invalid JSON
ℹ skill "data-analysis" depends on missing server "pandas-mcp"

Health: 85/100 (85%)
2 errors, 2 warnings, 1 info
```

`ensemble doctor --json` outputs structured results for scripting.

## Registry

Ensemble integrates with MCP server registries to discover, browse, and install servers without manually constructing configs. Two registries are supported out of the box, both with public APIs requiring no authentication:

- **Official MCP Registry** (`registry.modelcontextprotocol.io`) — the canonical upstream source (~10K servers). Returns structured package metadata with `registryType`, transport, and environment variable specifications.
- **Glama** (`glama.ai`) — the largest enriched directory (~19K servers, 70+ categories). Returns environment variable JSON schemas and hosting attributes. Good for non-dev tools (finance, marketing, productivity, etc.).

### Unified Source Parser (Future)

> **Note:** The unified source parser is a planned feature, not part of v1.0. Servers are currently added via `ensemble add <name> --command <cmd>` or `ensemble registry add <id>`.

`ensemble add <source>` will accept multiple source formats and infer the type automatically:

| Source Format | Interpretation | Example |
|--------------|----------------|---------|
| `owner/repo` | GitHub repository | `anthropics/mcp-server-git` |
| `./local/path` or absolute path | Local directory | `./my-skills/git-workflow` |
| `registry:<slug>` | Registry server by slug | `registry:postgres` |
| `catalog:<id>` | Skills catalog by ID | `catalog:git-workflow` |
| Full URL | Fetched and parsed | `https://github.com/...` |

The parser examines the source string and routes to the appropriate handler (registry adapter, catalog adapter, GitHub clone, local import). When the type is ambiguous (e.g., a GitHub repo could contain a server or a skill), Ensemble inspects the repo contents — presence of SKILL.md indicates a skill, presence of package.json/pyproject.toml with MCP server patterns indicates a server. The `--type server|skill` flag overrides inference.

`ensemble add <source>` will be the primary entry point for adding any content. `ensemble skills add <name> --from <source>` will be a convenience alias that skips type inference (always treats the source as a skill). Both will share the same underlying operations layer. Until these are implemented, use `ensemble add <name> --command <cmd>` for servers and `ensemble registry add <id>` for registry installs.

### Search

`ensemble registry search <query>` searches both registries, deduplicates results by name, and displays a merged list. Results show:

- Server name and description
- Source registry
- Transport type (stdio/HTTP)
- Trust tier (official/community/local)
- Quality signals: stars, last-updated date, has-readme (when available from upstream)
- Popularity indicator (use count or download count when available)

### Show

`ensemble registry show <id>` fetches full details for a server from its source registry:

- Description and homepage
- Transport type and connection details
- Required environment variables (with descriptions when available)
- Available tools (when the registry provides them)
- Estimated token cost — approximate context window tokens for the server's tool definitions (name + description + schema, ~4 chars/token heuristic)

### Install

`ensemble registry add <id>` resolves the server config from the registry and adds it to Ensemble's central config. The translation from registry metadata to Ensemble's server format follows these rules:

| Registry Type | Command | Args |
|--------------|---------|------|
| `npm` | `npx` | `["-y", "<identifier>"]` |
| `pypi` | `uvx` | `["<identifier>"]` |

If the server requires environment variables, Ensemble prompts for each one (or accepts them via `--env KEY=VAL` flags). Values containing `op://` references are stored as-is.

**Trust tier assignment.** On install, Ensemble assigns a trust tier based on the source: `official` for verified publishers on the Official MCP Registry, `community` for all other registry/catalog content, `local` for user-defined servers and skills. The trust tier is stored in the origin object and displayed in `show` output.

**Pre-install security summary.** Before completing `registry add`, Ensemble displays a summary of what the server will do:

```
$ ensemble registry add postgres
Installing postgres from Official MCP Registry (official tier)

Security summary:
  Command: npx -y @mcp/postgres
  Env vars: DATABASE_URL (required)
  Transport: stdio
  No suspicious patterns detected.

Proceed? [Y/n]
```

The security summary flags potentially risky patterns: unknown binaries (not from well-known registries like npm/PyPI), excessive environment variable requests, commands that write to system directories, and env values that appear to be hardcoded secrets rather than references. This builds trust for third-party content. `--yes` skips the prompt.

The server is added to the central config but not synced — run `ensemble sync` to push it to clients.

### Registry Adapter Pattern

The registry subsystem uses an adapter architecture so new backends can be added without modifying core search/install logic. Each adapter implements a common interface: `search(query) → Result[]`, `show(id) → Detail`, and `resolve(id) → ServerConfig`. The two built-in adapters (Official MCP Registry, Glama) are loaded by default. Additional adapters (Smithery, PulseMCP, MCP Scoreboard) can be registered as opt-in sources when the user provides API keys.

`ensemble registry backends` lists available backends with their status (enabled/disabled) and last-used timestamp.

### Metadata Caching

Registry API responses are cached locally to avoid repeated network calls during discovery workflows (e.g., `search` followed by `show` followed by `add`). Cache TTL is configurable:

```json
{
  "settings": {
    "registry_cache_ttl": 3600
  }
}
```

`registry_cache_ttl` is the default TTL in seconds (default: 3600 — one hour). Cache is stored at `~/.config/ensemble/cache/registry/`. `ensemble registry cache-clear` empties the cache directory. `registry search --no-cache` bypasses the cache for a single call.

### Tool Metadata Storage

When installing a server from the registry (`registry add`), Ensemble stores the server's tool definitions (name + description) in the central config's `tools` field. This means tool metadata persists beyond `registry show` output and feeds local capability search.

`registry show --update-tools <name>` refreshes the cached tool metadata for an already-installed server from its source registry.

### Quality Signals

Registry search and show results surface upstream quality signals when available. Ensemble normalizes these signals into a lightweight display rather than computing scores locally:

| Signal | Source | Display |
|--------|--------|---------|
| Stars / likes | GitHub, catalog | Star count |
| Last updated | Registry metadata | Relative date ("2 days ago", "6 months ago") |
| Has README | Repository | Boolean indicator |
| Install count | Catalog (claude-plugins.dev) | Install count |
| Verified publisher | Official MCP Registry | Trust tier badge |

Quality signals are shown in `registry search` results (compact: star count + last-updated) and `registry show` output (full detail). They are informational — Ensemble does not gate installs on quality thresholds.

### Local Capability Search

`ensemble search <query>` searches across the user's registered servers and skills by capability — matching against server names, descriptions, tool names/descriptions, and skill names/descriptions/tags. This is a local search (no network calls) using lightweight text matching (BM25-style term frequency scoring over the stored metadata).

```
$ ensemble search "database query"
  postgres (server, 3 matching tools: query, schema, migrate)
  supabase (server, 1 matching tool: sql_query)
  sql-patterns (skill, tags: database, sql, query)
```

Useful for users with many servers and skills who need to find which provides a specific capability.

### Future Registry Support

Additional registries (Smithery, PulseMCP, MCP Scoreboard) can be added as opt-in sources when the user provides API keys. MCP Scoreboard provides quality grades across six dimensions (schema, protocol, reliability, docs, security, usability).

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
| Cline | `~/.vscode/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | JSON | No |
| Roo Code | `~/.vscode/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` | JSON | No |
| OpenCode | `~/.config/opencode/config.json` | JSON | No |
| Amp | `~/.amp/mcp.json` | JSON | No |
| mcpx | `~/.config/mcpx/config.toml` → `servers` | TOML | No |

**Note:** VS Code uses `mcp.servers` (dot-separated key path) instead of `mcpServers`. Zed uses `context_servers`. Some clients require a `"type": "stdio"` field in server entries. Codex CLI and mcpx use TOML format instead of JSON. Cline and Roo Code store configs in VS Code's `globalStorage` directory.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **CLI framework:** Commander.js
- **Validation:** Zod (schemas exported for consumer use)
- **Testing:** Vitest
- **Linting/Formatting:** Biome
- **Build:** tsup (dual CJS/ESM output)
- **Package manager:** npm
- **Distribution:** npm registry (`npm install ensemble` / `npx ensemble`)
- **Config:** JSON (read/write via node:fs)
- **TOML parsing:** smol-toml (for Codex CLI and mcpx configs)
- **File operations:** node:fs (native, for skill sync, migration, backups)
- **File locking:** proper-lockfile (for atomic config writes)
- **SQLite:** better-sqlite3 (for project registry reads)
- **HTTP:** native fetch (for registry API calls)
- **Secrets:** 1Password CLI (`op://`) references in env values — Ensemble stores the references, not plaintext

## Non-Goals

- Running or proxying MCP servers — Ensemble only manages configs
- **Live MCP connections** — Ensemble is config-only. It does not spawn, proxy, or manage running MCP server processes. That responsibility belongs to the consuming app (e.g., Chorus) or the AI client itself.
- **Daemon / background process** — Ensemble runs on demand, no file watching, no long-running service. Validated by examining mcpx's daemon model: the complexity of daemon lifecycle management (startup, shutdown, health, port conflicts) is disproportionate to the config-management problem. On-demand is the correct design.
- Server runtime health checks or monitoring — `ensemble doctor` audits config files, not running processes
- Multi-machine sync (single machine only)
- Marketplace auto-update management — controlled via Claude Code's UI, not JSON
- Plugin development tooling — Ensemble manages installed plugins, not authoring
- Project/local plugin scopes (v1) — deferred until Claude Code stabilizes scope bugs
- **GUI / TUI** — Ensemble provides no graphical interface. Chorus is the GUI layer; it imports Ensemble as a library dependency.

## Architecture

Core logic is organized into four layers: data model, operations, sync engine, and presentation. The CLI is a thin presentation layer over a shared operations + sync + config core. App consumers (like Chorus) import the same operations and sync modules directly. All mutations (install, uninstall, enable, disable, assign, scope, etc.) live in the operations layer, never in presentation code. All operations are pure functions: `(config, params) → { config, result }` — they never perform I/O directly.

```
ensemble/
├── src/
│   ├── schemas.ts        # Zod schemas, TypeScript types (via z.infer), constants
│   ├── config.ts         # loadConfig/saveConfig (atomic writes), query helpers, resolution helpers
│   ├── operations.ts     # Pure business logic (addServer, removeServer, enable, disable, assign, scope, etc.)
│   ├── clients.ts        # Client definitions (17 clients), detection, format adapters
│   ├── sync.ts           # Sync engine — write configs per client, symlink fan-out for skills
│   ├── skills.ts         # Skill store — SKILL.md I/O, canonical store operations
│   ├── search.ts         # BM25-style local capability search
│   ├── registry.ts       # Registry adapters (Official + Glama), quality signals, metadata caching
│   ├── doctor.ts         # Deterministic health audit
│   ├── projects.ts       # Project registry reader (better-sqlite3)
│   └── index.ts          # Public API surface — re-exports for library consumers
├── src/cli/
│   └── index.ts          # Commander.js CLI — thin wrapper over operations
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── biome.json
```

| Module | Role |
|--------|------|
| `schemas.ts` | Zod schemas, TypeScript types (via `z.infer`), constants |
| `config.ts` | `loadConfig`/`saveConfig` with atomic writes, query helpers, resolution helpers (`resolveServers`, `resolveSkills`, `resolvePlugins`) |
| `clients.ts` | Client definitions (17 clients, including `skills_dir`), detection, config file read/write, CC settings helpers |
| `operations.ts` | Pure business logic for all mutations — shared by CLI and library consumers |
| `projects.ts` | Project registry reader — reads project-registry SQLite DB via better-sqlite3 |
| `sync.ts` | Sync engine — dual strategy: config-entry writes for servers, symlink fan-out for skills. Uses resolution helpers from `config.ts` |
| `skills.ts` | Skill store — SKILL.md frontmatter parsing, canonical store CRUD |
| `registry.ts` | Registry adapter framework — search, show, install across extensible backends (servers + skills catalog) |
| `search.ts` | Local capability search — BM25 scoring across servers and skills |
| `doctor.ts` | Deterministic health audit with structured scoring across 5 categories |
| `index.ts` | Public API surface — re-exports for `ensemble`, `ensemble/operations`, `ensemble/schemas`, etc. |
| `cli/index.ts` | Commander.js CLI — thin wrapper that calls operations and formats output |

## Design Principles

1. **Library-first** — Ensemble is a library that happens to have a CLI, not a CLI with importable internals. Operations are pure functions. Config I/O is explicit. Consumers own the read/write lifecycle.
2. **Additive only on sync** — Ensemble manages its own servers in client configs. It never deletes servers it didn't create. A `__ensemble` marker comment or metadata key identifies managed entries.
3. **Backwards compatible defaults** — no group assignment = sync all enabled servers.
4. **Idempotent** — running `ensemble sync` twice produces the same result.
5. **No daemon** — runs on demand, no file watching, no background process. (Validated: see Non-Goals.)
6. **Dry-run support** — `ensemble sync --dry-run` shows what would change without writing.
7. **Config backup** — before writing to any client's config file for the first time, Ensemble creates a `.ensemble-backup` copy alongside the original. Subsequent writes do not overwrite the backup.
8. **Marker-based coexistence** — Ensemble tags every server entry it writes with a `__ensemble: true` marker. On sync, Ensemble reads all servers, preserves entries without the marker untouched, and only manages its own. This means Ensemble coexists safely with other tools that write to the same config files (e.g., ToolHive, Caliber, manual edits). However, other tools that don't use markers may overwrite Ensemble's entries during their own sync. Users running multiple config management tools should sync Ensemble last, or use `ensemble doctor` to detect unexpected changes via drift detection.

## Future

- **Multi-group assignments** — Allow projects and clients to be assigned multiple groups, with resolved servers/plugins being the union. Currently limited to one group each.
- **Project registry write-back** — Write `mcp_servers` to the project-registry's `project_fields` table, making Ensemble a producer as well as a consumer.
- **Additional registries** — Smithery and PulseMCP as opt-in sources with API key configuration.
- **SkillsGate deep integration** — SkillsGate (`skillsgate.ai`) as an additional skills catalog backend alongside claude-plugins.dev. SkillsGate offers lock-file based version pinning and agent-selective removal — features that could enhance Ensemble's skill provenance tracking.
- **Virtual server mapping** — As AI clients add platform-level integrations (Codex apps, Claude Code plugins, Kiro connectors), Ensemble may need to represent non-traditional "servers" that aren't stdio/HTTP processes. A virtual server pattern would map platform features into the familiar server abstraction, allowing them to participate in groups, assignments, and sync like regular servers. Deferred until client ecosystems stabilize.

## Validated Designs

Patterns confirmed by external research that reinforce existing Ensemble decisions:

- **Content-hash drift detection** — Klavis-AI/klavis (open-strata) uses diff-based sync to detect config changes. Ensemble's SHA-256 hash approach achieves the same goal with lower complexity: hash-compare is O(1) per entry vs. full diff computation. No change needed.
- **No-daemon architecture** — lydakis/mcpx uses a daemon model for server proxying. Ensemble's on-demand design avoids daemon lifecycle complexity (startup ordering, crash recovery, port management) since Ensemble manages configs, not running servers.
- **SKILL.md as universal format** — 7/8 researched skill management tools converge on YAML-frontmatter markdown files as the skill format. Ensemble adopts this consensus format rather than inventing a proprietary one.
- **Symlink fan-out as distribution** — 3/8 tools (skillbox, skillsgate, dotagents) use canonical store + symlink fan-out. This is the correct pattern for file-based artifacts: single source of truth with zero-copy distribution. File copy is the correct fallback.
- **Advisory dependencies** — skillsmith models skill-server dependencies as optional metadata rather than hard requirements. Ensemble follows this: dependencies inform the user but never block installation.

## References

- **Klavis-AI/klavis (open-strata)** — Open-source MCP server platform with managed/hosted backends, diff-based sync, and context cost awareness. Informed patterns: context cost awareness on sync (#3), drift detection validation (#6), and the registry adapter concept. Repo: `github.com/Klavis-AI/klavis`.
- **lydakis/mcpx** — MCP server multiplexer with daemon model, auto-discovery, and TOML config. Informed patterns: config auto-discovery display during init (#1), registry metadata caching (#5), no-daemon validation (#4), and virtual server mapping concept (#7). Added as supported client. Repo: `github.com/lydakis/mcpx`.
- **smith-horn/skillsmith** — Trust-tier classification, quality scoring from upstream signals, dependency intelligence, security scanning. Informed patterns: trust tiers, quality signals, dependency modeling, pre-install security summary. Repo: `github.com/smith-horn/skillsmith`.
- **inceptyon-labs/TARS** — Profile-as-plugin packaging, collision detection across scopes, diff-plan-apply with backup, pin/track provenance modes. Informed patterns: profile-as-plugin, collision detection, backup strategy, provenance modes. Repo: `github.com/inceptyon-labs/TARS`.
- **christiananagnostou/skillbox** — Canonical store + symlink fan-out, auto-detect agents, self-referential meta-skill. Informed patterns: symlink distribution, meta-skill concept. Repo: `github.com/christiananagnostou/skillbox`.
- **walidboulanouar/ay-claude-templates** — Multi-source parser, bundle install, manifest dependencies. Informed patterns: unified source parser. Repo: `github.com/walidboulanouar/ay-claude-templates`.
- **caliber-ai-org/ai-setup** — Content-hash state comparison, deterministic scoring with categories, quality gate. Informed patterns: structured doctor scoring. Repo: `github.com/caliber-ai-org/ai-setup`.
- **skillsgate/skillsgate** — Canonical + symlink, lock file, multi-source parser, security scanning. Informed patterns: symlink fan-out validation, security scanning. Repo: `github.com/skillsgate/skillsgate`.
- **lasoons/AgentSkillsManager** — IDE-specific skills directories, cloud catalog (58K skills via claude-plugins.dev API). Informed patterns: client skills directory mapping, skills catalog integration. Repo: `github.com/lasoons/AgentSkillsManager`.
- **iannuttall/dotagents** — Symlink fan-out, migration with conflict detection, backup+undo, skill frontmatter validation, client path mapping. Informed patterns: skills migration, backup strategy, client path mapping. Repo: `github.com/iannuttall/dotagents`.

## Changelog

- **1.0.0** — TypeScript rewrite. Rename mcpoyle → Ensemble. Language: Python → TypeScript. Architecture: library-first with pure-function operations and Zod schema exports. Add Library API section (package exports, config loading pattern, operations as pure functions, Zod schema exports, client resolution API, registry API, integration guidance). CLI: click → Commander.js, binary is `ensemble` with `ens` alias. Build: hatch → tsup, pytest → Vitest, Biome for linting/formatting. Dependencies: httpx → native fetch, dataclasses → Zod, pathlib → node:fs, fcntl → proper-lockfile, tomllib → smol-toml, shutil → node:fs, SQLite via better-sqlite3. Config path: `~/.config/mcpoyle/` → `~/.config/ensemble/`. Marker: `__mcpoyle` → `__ensemble`. Add automatic migration from mcpoyle config, skills store, cache, and client markers. Remove TUI surface (Chorus is the GUI). Remove Textual dependency. Add non-goal: GUI/TUI (Chorus handles UI). Add non-goal: live MCP connections (config-only scope). Add design principle: library-first. Update all CLI examples, config paths, and references for Ensemble naming.
- **0.15.0** — Add skills as third entity type (SKILL.md files with YAML frontmatter). Add canonical store + symlink fan-out sync strategy for skills. Add client skills directory mapping (Claude Code, Cursor, Codex, Windsurf). Add builtin mcpoyle-usage meta-skill. Add skills catalog integration (claude-plugins.dev, ~58K skills). Add unified source parser (`mcpoyle add <source>` infers type from format). Add trust-tier classification (official/community/local) to origin tracking. Add quality signals (stars, last-updated, has-readme) to registry search/show. Add collision detection across scopes for both servers and skills. Add pin/track provenance modes for servers and skills. Add dependency intelligence (skills declare server dependencies). Add pre-install security summary for registry installs. Add deterministic structured scoring to doctor (categories, points, fix suggestions). Add profile-as-plugin packaging (`groups export --as-plugin`). Add skills migration to init flow. Update Group model to include skills. Update sync engine for dual strategy (config-entry + symlink). Update local search to include skills. Research: 16 patterns from 8 external references (skillsmith, TARS, skillbox, ay-claude, caliber, skillsgate, AgentSkillsManager, dotagents).
- **0.14.0** — Incorporate 8 research patterns from Klavis-AI/klavis and lydakis/mcpx. Add HTTP/SSE transport fields (`url`, `auth_type`, `auth_ref`) to Server model. Add server origin/provenance tracking. Add tool metadata storage at install time. Add mcpx as supported client. Add config auto-discovery display to init flow. Add context cost awareness to sync. Add registry adapter pattern for extensible backends. Add registry metadata caching with configurable TTL. Add local capability search (`mcpoyle search`). Validate no-daemon and hash-based drift detection designs. Note virtual server mapping as future pattern.
- **0.13.0** — Add `mcpoyle init` guided onboarding command (detect clients, import servers, create groups, assign, sync). Add marker-based coexistence documentation to Design Principles. Inspired by patterns in ToolHive.
- **0.12.0** — Add content-hash drift detection to sync engine (warn on manual edits, `--force`/`--adopt` flags). Add `mcpoyle doctor` command for deterministic config health auditing (env vars, orphaned entries, stale configs, parse errors, unreachable binaries). Inspired by patterns in Caliber (ai-setup).
- **0.11.0** — Integrate project-registry for project-aware scoping. Read-only SQLite integration: name-based project assignment, `mcpoyle projects` command. Add `projects.py` module. Registry is optional with graceful fallback.
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
