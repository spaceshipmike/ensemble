```yaml
title: Ensemble
spec-version: 2.0.1
spec-format: nlspec-v2
status: active
date: 2026-04-12
author: Michael Lebowitz
synopsis:
  short: "Claude Code extension platform manager — servers, skills, plugins, agents, commands, hooks, and settings across 21 AI clients"
  medium: "Ensemble is a library-first TypeScript toolkit that manages every declarative artifact in .claude/ — MCP servers, skills, plugins, subagents, slash commands, hooks, and settings — across 21 AI clients. The user's owned inventory lives in a single flat library; install state is a property of each library resource, tracked per client and per project, not a tier above or below it. Ensemble exposes pure-function operations with Zod-validated schemas, a CLI with clean pull/add/install/uninstall/remove verbs, an Electron desktop app with a pivot-based sidebar (Library, By Project, By Group, By Client, Marketplace), a TUI-grade discovery experience, safe apply/rollback snapshots, and package exports for app integration."
  readme: "Ensemble is a Claude Code extension platform manager. v2.0 expands scope from MCP servers, skills, and plugins to every declarative resource Claude Code and its siblings consume: subagents (.claude/agents/), slash commands (.claude/commands/), hooks (PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, PreCompact, Stop, Notification), and managed settings.json values (permissions.allow, env, model). Define every resource once, organize into groups, assign groups to clients or projects, and sync across 21 AI clients — Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, JetBrains, Antigravity, CodeBuddy, Qoder, Trae, and 10 more. The library-first architecture means every operation is a pure function — load config, call an operation, save config — making Ensemble equally useful as a standalone CLI, a desktop app, and an imported dependency for app-level consumers like Chorus. Settings.json merges are non-destructive: Ensemble preserves any keys it does not manage, coexisting safely with manual edits and other tools. Every sync run produces a rollback-capable snapshot, so any operation can be undone. The Electron desktop app provides a collapsible Resources sidebar (Servers, Skills, Plugins, Agents, Commands, Hooks, Settings) plus Groups, Clients, Sync, Doctor, Registry, Profiles, and Rules sections. A new `ensemble browse` TUI command provides fuzzy search across installed and discoverable resources, @marketplace-name filter syntax, Card and Slim view modes, and one-key install. Dynamic marketplace registry auto-discovers new marketplaces and notifies on availability. Zod schemas are exported for runtime validation by consumers."
  tech-stack: [TypeScript, Commander.js, Zod, Vitest, Biome, tsup, npm, better-sqlite3, proper-lockfile, smol-toml, JSON config, Electron, React, Tailwind CSS, Playwright, Ink, fuzzysort]
  patterns: [library as primary interface, install-state-as-property, pivot-based IA, library-first architecture, pure-function operations, Zod schema exports, additive sync, non-destructive settings.json merge, central registry, group-based assignment, path-rule auto-assignment, configuration profiles, project-registry integration, setlist capability integration, multi-registry search, extensible registry adapters, dynamic marketplace registry, registry metadata caching, server provenance tracking, tool metadata storage, context cost awareness, group split suggestions, local capability search, fuzzy search across installed + discoverable, marketplace filter syntax, card/slim view modes, query alias expansion, multi-signal quality scoring, usage-based self-learning search, secret scanning, presentation-agnostic core, operations layer, content-hash drift detection, safe apply/rollback snapshots, deterministic health audit, guided onboarding, marker-based coexistence, canonical store + symlink fan-out, trust-tier classification, unified source parser, collision detection, pin/track provenance modes, dependency intelligence, pre-install security summary, deterministic config scoring, profile-as-plugin packaging, builtin meta-skill, monorepo workspaces, sidebar + detail panel layout, collapsible resources sidebar, visual drift diffing, drag-and-drop group assignment, autonomous UI testing, TUI-grade discovery browser, meta-loop (ensemble manages fctry)]
  goals: [single source of truth for all Claude Code extension artifacts, cross-client sync across 21 clients, MCP server lifecycle management, skill lifecycle management, plugin lifecycle management, subagent lifecycle management, slash command lifecycle management, hook lifecycle management, declarative settings.json management, non-destructive settings merge, safe apply with rollback snapshots, registry discovery + install, dynamic marketplace discovery, fuzzy search across installed + discoverable, TUI-grade browse experience, cloud catalog integration (claude-plugins.dev), project-aware scoping, library API for app consumers, CLI surface, desktop app for visual management, server provenance and capability search, trust-tiered content safety, portfolio capability awareness via setlist, secret detection for credential hygiene, self-learning search refinement]
```

# Ensemble

A library-first TypeScript toolkit for centrally managing MCP server configurations, agent skills, and Claude Code plugins across AI clients.

## Philosophy

Ensemble is designed to be equally useful as an imported library, a CLI tool, a desktop app, and a scripting target. Every operation is a pure function that takes a config object and returns an updated config plus a result — no side effects, no hidden state. This means an app like Chorus can import Ensemble's operations directly, a human can use the CLI or the desktop app, and an AI agent can script the CLI for fleet management. Structured output where it matters, deterministic behavior, no interactive prompts in the default CLI path, and clear exit codes. The CLI and desktop app are thin presentation layers over the library; the library is the real product.

## Problem

Each AI client (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, JetBrains, and newer entrants like Antigravity, CodeBuddy, Qoder, and Trae) maintains its own MCP server config in its own format. Adding a server means editing multiple files. There's no way to assign different server sets to different clients. The client ecosystem continues to fragment — each new IDE or agent harness adds its own skills directory, its own plugin conventions, its own settings format.

Claude Code has a plugin/marketplace system with configuration in `~/.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`) and a plugin cache at `~/.claude/plugins/cache/`. But plugins are only one of seven declarative artifact types Claude Code consumes:

1. **MCP servers** (`~/.claude.json` → `mcpServers`)
2. **Skills** (`~/.claude/skills/` or per-project `.claude/skills/`)
3. **Plugins** (`~/.claude/settings.json` → `enabledPlugins`)
4. **Subagents** (`.claude/agents/*.md` with YAML frontmatter)
5. **Slash commands** (`.claude/commands/*.md` with YAML frontmatter)
6. **Hooks** (`~/.claude/settings.json` → `hooks` — PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, PreCompact, Stop, Notification)
7. **Settings** (`~/.claude/settings.json` — `permissions.allow`, `env`, `model`, and dozens of other keys)

Managing any of these — installing, enabling, organizing across projects, keeping them in sync across machines — requires manual JSON/YAML/markdown editing or an ever-growing pile of single-purpose tools. The fragmentation that existed for MCP servers now exists for every resource type in `.claude/`, and the same problem is spreading across sibling clients that adopt the same patterns. A unified management layer is needed.

## Solution

A TypeScript library, CLI, and desktop app that manages a central registry of every Claude Code extension artifact — servers, skills, plugins, subagents, slash commands, hooks, and settings — organizes them into groups, and syncs the right configuration to the right clients. Each resource type has its own sync strategy: servers and plugins sync via config-entry writes, skills and agents and commands sync via canonical store with symlink or file fan-out, hooks sync via non-destructive merge into `settings.json` under the `hooks` key, and managed settings sync via non-destructive key-level merge that preserves any fields Ensemble does not own. Every sync run produces a rollback-capable snapshot: any operation can be undone. The Electron desktop app provides visual management with a collapsible Resources sidebar plus Groups, Clients, Sync, Doctor, Registry, Profiles, and Rules sections. A new TUI-grade browse experience (`ensemble browse`) provides fuzzy search across installed and discoverable resources, `@marketplace-name` filter syntax, Card and Slim view modes, and one-key install. App consumers (like Chorus) import Ensemble as a dependency and call operations directly.

v2.0 reframes Ensemble from "MCP/skills/plugins manager" to a **Claude Code extension platform manager** — managing every declarative artifact in `.claude/` across every AI client that adopts the pattern. The library-first architecture stays. The pure-function operations stay. Only the data model and sync surface grow.

## Core Concepts

### Resource Lifecycle Model (v2.0.1 refinement)

Ensemble's lifecycle is organized around three concepts — **Marketplace**, **Library**, and **Install state** — with **Pivots** as named views over the library. This replaces the earlier implicit hierarchy (marketplace → library → installed) with a flat, property-based model.

- **Marketplace** — a remote discovery surface. GitHub marketplaces, catalogs, and registries (claude-plugins.dev, Official MCP Registry, Glama, community marketplaces like plum's 12). Marketplaces are **not owned by the user**; they are the source from which library pulls happen. Once a resource is pulled, it becomes a library resource and is user-owned, even if later uninstalled from every client.

- **Library** — the user's owned inventory, and **Ensemble's primary interface**. A single flat set of every resource the user has ever pulled from a marketplace or locally authored: servers, skills, plugins, agents, commands, hooks, and settings — all side by side. The library is the canonical store (`~/.config/ensemble/`) and the source of truth from which clients are synced. The library is not a staging area for uninstalled resources; it is the authoritative inventory. A resource's presence in the library is independent of whether it is currently installed anywhere.

- **Install state** — a **property** of a library resource, not a tier. Each library resource carries a per-client/per-project install matrix describing where it is currently installed. A resource may be installed on client A and not on client B, or installed for project X under Claude Code but not for project Y. "Uninstall" removes a resource from a specific (client, project?) scope — it does **not** remove the resource from the library. Only `ensemble remove` deletes a resource from the library entirely.

- **Pivot** — a named view over the library, filtered and faceted along a single dimension. The same library data can be browsed through multiple pivots, and install/uninstall actions are available from **every** pivot via row-level controls. The core pivots:

  | Pivot | Shows | Install gesture |
  |-------|-------|-----------------|
  | **Library** (default) | Every owned resource with install-state indicators (which clients/projects it is installed for). Resource-type filter bar at top. | Toggle install per client/project from the row |
  | **By Project** | Resources installed for a specific project path (Claude Code project scoping) | Install = add to this project's assignment; uninstall = remove |
  | **By Group** | Resources that belong to a named group | Install = assign the group to a client; uninstall = unassign. Removing from group cascades uninstall from any clients using that group. |
  | **By Client** | Resources installed for a specific client | Install/uninstall per this client |
  | **Marketplace** | Resources available to pull that are **not yet in the library** | Pull → adds to library |

  Resource type (server, skill, plugin, agent, command, hook, setting) is a **filter** applied within the Library pivot, not a pivot in its own right. Users who think in resource types filter the Library; users who think in clients, projects, or groups use the corresponding pivot. Same underlying data.

### Resource Types

- **Server** — an MCP server definition (name, command, args, env, transport, and optionally url, auth, origin, and tool metadata). Servers are runtime processes that provide tools to AI agents.
- **Skill** — an agent instruction file (SKILL.md with YAML frontmatter: name, description, and optionally dependencies, tags). Skills are static markdown files that teach agents workflows, coding patterns, and domain knowledge.
- **Plugin** — a Claude Code plugin (name, marketplace, scope, enabled state).
- **Agent** — a Claude Code subagent definition. Stored as `.claude/agents/<name>.md` with YAML frontmatter (`name`, `description`, `tools`, optional `model`) followed by the system prompt body. Agents are invokable personalities with scoped tool access; they are distinct from skills (which teach workflows) and from plugins (which ship code). Ensemble manages user-level agents (`~/.claude/agents/`) and project-level agents (`<project>/.claude/agents/`) as first-class resources.
- **Command** — a Claude Code slash command. Stored as `.claude/commands/<name>.md` with YAML frontmatter (`description`, optional `allowed-tools`, optional `argument-hint`) followed by the prompt body. Commands are user-invoked shortcuts; they fan out to `~/.claude/commands/` or `<project>/.claude/commands/`.
- **Hook** — a Claude Code hook entry stored inside `~/.claude/settings.json` (or `<project>/.claude/settings.json`) under the `hooks` key. Hooks fire on lifecycle events: `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`, `PreCompact`, `Stop`, `Notification`. Each hook declares a matcher and a command to run. Because hooks live inside `settings.json` alongside keys Ensemble does not manage, hook sync uses non-destructive merge.
- **Setting** — a Claude Code configuration value in `settings.json` that Ensemble manages declaratively. Examples: `permissions.allow` (tool allowlists), `env` (environment variable defaults), `model` (default model selection), and other top-level keys. Ensemble owns only the specific keys the user explicitly places under management; every other key in `settings.json` is preserved untouched on every write.
- **Marketplace** — a remote source of pullable resources (GitHub repo, registry, or local directory). Marketplaces are discovery-only; they are never owned by the user. `ensemble pull` copies a resource from a marketplace into the library, after which the resource is library-owned. v2.0 adds a **dynamic marketplace registry** that auto-discovers new marketplaces and notifies when a new one becomes available (pattern from plum).
- **Group** — a named collection of any resource type (servers, skills, plugins, agents, commands, hooks). Settings are client-level, not group-level, because they are client-wide configuration rather than installable units.
- **Client** — an AI application that consumes one or more resource types (detected automatically). v2.0 supports 21 clients (see §Supported Clients).
- **Library membership vs. install state** — two orthogonal axes. Library membership is controlled by `pull` / `add` / `remove`. Install state is controlled by `install` / `uninstall`. Uninstalling a resource from every client leaves it in the library (still owned, still browseable); only `ensemble remove` evicts it from the library.

- **Sync** — writing the currently-installed state of every library resource to each client's filesystem and config. Sync **projects install state into client configs**; it does **not** touch library membership. The library is authoritative; sync is the downstream projection. Per-resource strategy:
  - **Servers, plugins:** config-entry writes (JSON/TOML) — existing strategy.
  - **Skills, agents, commands:** canonical store + symlink (or file) fan-out to each client's resource directory.
  - **Hooks:** non-destructive merge into `settings.json` under the `hooks` key.
  - **Settings:** non-destructive key-level merge into `settings.json` — Ensemble writes only the keys it manages, preserves everything else.
- **Safe apply / rollback snapshot** — every `ensemble sync` run captures a snapshot of each touched file before writing. Snapshots are stored in `~/.config/ensemble/snapshots/<timestamp>/` and can be restored with `ensemble rollback`. This is richer than additive-sync alone: even additive writes produce a rollback point, so manual overrides, bad registry installs, and accidental overwrites are all recoverable. (Pattern from TARS.)
- **Origin** — provenance metadata tracking where any resource (server, skill, plugin, agent, command, hook, setting) was imported from, when, by what method, and its trust tier.
- **Trust Tier** — classification of registry content: `official` (verified publishers), `community` (unverified registry content), `local` (user-defined). Displayed in search results and `show` output for every resource type.

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
    "./agents": "./dist/agents.js",
    "./commands": "./dist/commands.js",
    "./hooks": "./dist/hooks.js",
    "./settings": "./dist/settings.js",
    "./snapshots": "./dist/snapshots.js",
    "./browse": "./dist/browse.js",
    "./search": "./dist/search.js",
    "./doctor": "./dist/doctor.js"
  }
}
```

v2.0 adds five new subpath exports — `agents`, `commands`, `hooks`, `settings`, and `snapshots` — plus the `browse` entry point for the TUI-grade discovery surface. Each resource type module mirrors `skills.ts`: a canonical-store reader/writer plus frontmatter parsing helpers where relevant.

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

// v2.0 — same pattern for every new resource type
function addAgent(config: EnsembleConfig, params: AddAgentParams): OperationResult<Agent>;
function removeAgent(config: EnsembleConfig, name: string): OperationResult<{ removed: Agent }>;
function enableAgent(config: EnsembleConfig, name: string): OperationResult<Agent>;
function disableAgent(config: EnsembleConfig, name: string): OperationResult<Agent>;

function addCommand(config: EnsembleConfig, params: AddCommandParams): OperationResult<Command>;
function removeCommand(config: EnsembleConfig, name: string): OperationResult<{ removed: Command }>;
function enableCommand(config: EnsembleConfig, name: string): OperationResult<Command>;
function disableCommand(config: EnsembleConfig, name: string): OperationResult<Command>;

function addHook(config: EnsembleConfig, params: AddHookParams): OperationResult<Hook>;
function removeHook(config: EnsembleConfig, id: string): OperationResult<{ removed: Hook }>;
function enableHook(config: EnsembleConfig, id: string): OperationResult<Hook>;
function disableHook(config: EnsembleConfig, id: string): OperationResult<Hook>;

function setSetting(config: EnsembleConfig, params: SetSettingParams): OperationResult<Setting>;
function removeSetting(config: EnsembleConfig, key: string): OperationResult<{ removed: Setting }>;

// ... same pattern for skills, plugins, groups, marketplaces, rules
```

All v2.0 operations follow the same immutable `(config, params) → { config, result }` contract. No I/O, no side effects. The new resource types are additions to the data model, not new abstractions — every app consumer that already integrates `addServer` can integrate `addAgent` with identical wiring.

**v2.0.1 — library vs. install-state split.** The operations layer cleanly separates library-membership mutations from install-state mutations. Library mutations change what the user owns; install-state mutations change where an owned resource is projected.

```ts
// Library membership mutations (what the user owns)
function pullFromMarketplace(
  config: EnsembleConfig,
  params: { source: string; type?: ResourceType }
): OperationResult<{ added: LibraryResource }>;

function addToLibrary(
  config: EnsembleConfig,
  params: AddToLibraryParams   // explicit local/manual authoring
): OperationResult<{ added: LibraryResource }>;

function removeFromLibrary(
  config: EnsembleConfig,
  params: { name: string; type: ResourceType }
): OperationResult<{ removed: LibraryResource }>;

// Install-state mutations (where owned resources are projected)
function installResource(
  config: EnsembleConfig,
  params: { name: string; type: ResourceType; client: string; project?: string }
): OperationResult<InstallState>;

function uninstallResource(
  config: EnsembleConfig,
  params: { name: string; type: ResourceType; client: string; project?: string }
): OperationResult<InstallState>;

// Query helpers
function getInstallState(
  config: EnsembleConfig,
  params: { name: string; type: ResourceType }
): InstallState;                            // per-client/per-project matrix

function getLibraryByPivot(
  config: EnsembleConfig,
  pivot: PivotSpec                          // { kind: 'library' | 'project' | 'group' | 'client' | 'marketplace', ... }
): LibraryResource[];
```

Schemas add `InstallState` (a map from `client` → `{ installed: boolean, projects: string[] }`) and `PivotSpec`. Every library resource schema (`ServerSchema`, `SkillSchema`, `PluginSchema`, `AgentSchema`, `CommandSchema`, `HookSchema`, `SettingSchema`) gains an `installState: InstallState` field, replacing per-client enable/disable booleans where they exist. Install state is **never a boolean** on a library resource — it is always a per-client-per-project map, because the same resource can have different install state on different clients or in different projects.

**Clean-slate verb surface.** v2.0.1 is a clean rewrite of the install-state surface, not a backwards-compatible extension. The v1.3 install-state verbs — `installPlugin`, `uninstallPlugin`, `installSkill`, `uninstallSkill`, `enablePlugin`, `disablePlugin`, `enableServer`, `disableServer` — are **deleted outright** from `operations.ts`, the package exports, and the public `ensemble` type surface. There are no JSDoc deprecation annotations, no runtime compatibility shims, no `Legacy`-suffixed wrappers, no migration-gated guards, and no dual-code-path CLI. The only install-state verbs that exist in v2.0.1 are `installResource` and `uninstallResource`.

The library-membership verbs follow the opposite rule: the pre-refinement `addServer`, `addAgent`, `addCommand`, `addHook`, `setSetting`, and their `remove*` counterparts **remain**, because library membership is semantically unchanged and there is no reason to churn those call sites. They route through `addToLibrary` / `removeFromLibrary` with the appropriate `type` tag; under strict library-first semantics (see Design Principles) they leave `installState` empty unless an explicit `install` parameter is passed. `removeServer` / `removeAgent` / … are aliases for `removeFromLibrary` and are destructive — they evict the resource from the library entirely.

Call sites that previously used `enableServer` / `disableServer` / `installPlugin` / etc. for the "assign to one client" semantics must migrate to `installResource` / `uninstallResource`. See §Migration for the cross-repo coordination plan.

Operations take an immutable config and return a new config plus a typed result. They never perform I/O. Side effects (file writes, network calls) live in `sync`, `registry`, and `config` modules.

### Zod Schema Exports

All data types are defined as Zod schemas and exported for runtime validation by consumers:

```ts
import {
  ServerSchema,
  SkillSchema,
  PluginSchema,
  AgentSchema,
  CommandSchema,
  HookSchema,
  SettingSchema,
  EnsembleConfigSchema,
  GroupSchema,
  SnapshotSchema,
  InstallStateSchema,  // v2.0.1 — per-client/per-project install matrix
  PivotSpecSchema,     // v2.0.1 — view descriptor for library pivots
} from 'ensemble/schemas';

// Validate external data
const server = ServerSchema.parse(untrustedInput);
const agent = AgentSchema.parse(agentFrontmatter);
const hook = HookSchema.parse(hookEntry);

// Infer types
import type {
  Server, Skill, Plugin, Agent, Command, Hook, Setting,
  EnsembleConfig, Snapshot,
} from 'ensemble/schemas';
```

`AgentSchema`, `CommandSchema`, `HookSchema`, and `SettingSchema` are new in v2.0. They validate parsed markdown frontmatter (agents, commands) or JSON values (hooks, settings) and are consumable by any app that integrates Ensemble.

Schemas serve as both runtime validators and TypeScript type sources (via `z.infer`). This eliminates the need for separate type definitions and validation logic.

### Client Resolution API

```ts
import {
  resolveServers,
  resolveSkills,
  resolvePlugins,
  resolveAgents,
  resolveCommands,
  resolveHooks,
  resolveSettings,
} from 'ensemble';
import { detectClients } from 'ensemble/clients';

const clients = detectClients();                         // scan for installed AI clients
const servers = resolveServers(config, 'cursor');        // servers that would sync to Cursor
const skills = resolveSkills(config, 'claude-code');     // skills that would sync to Claude Code
const agents = resolveAgents(config, 'claude-code');     // subagents that would sync to Claude Code
const hooks = resolveHooks(config, 'claude-code');       // hooks that would be written to settings.json
const settings = resolveSettings(config, 'claude-code'); // managed settings.json keys
```

The resolve functions live in `config.ts` and are re-exported from the root `ensemble` package. `detectClients` is in `clients.ts`. Resolution applies group filtering, path rules, and project-level overrides — the same logic the sync engine uses, exposed for consumers who need to inspect without writing.

### Registry API

```ts
import {
  searchRegistries,
  showRegistry,
  resolveInstallParams,
  discoverMarketplaces,
  fuzzySearchAll,
} from 'ensemble/registry';

const results = await searchRegistries('database');            // searches all enabled backends
const detail = await showRegistry('postgres');                 // full server details from registry
const installParams = await resolveInstallParams('postgres');  // ready-to-add server config

// v2.0 — dynamic marketplace registry and unified fuzzy search
const newMarketplaces = await discoverMarketplaces();          // auto-discover new marketplaces
const merged = await fuzzySearchAll(config, 'review', {        // fuzzy search installed + discoverable
  filter: '@official',                                         //   @marketplace-name filter syntax
  types: ['skill', 'agent', 'command'],
  view: 'card',                                                //   'card' | 'slim'
});
```

Registry functions are async (they make network calls). Results include trust tier, quality signals, transport details, and resource type. v2.0 adds:

- **`discoverMarketplaces()`** — scans known registry endpoints for new marketplaces and returns any that aren't yet registered in the user's config. The CLI surfaces these as notifications on next invocation. (Pattern from plum's "dynamic registry with auto-update notification.")
- **`fuzzySearchAll(config, query, opts)`** — single search across installed resources and discoverable catalog content, with `@marketplace-name` filter syntax parsed from the query. Returns a unified result stream with `installed: boolean` and `resourceType` fields. This is the engine behind `ensemble browse`. (Pattern from plum.)
- **Cloud catalog integration** — `claude-plugins.dev` (~58K skills) is the canonical skill catalog for `ensemble skills search` and `fuzzySearchAll`. v2.0 formalizes this from opt-in backend to default source. (Pattern from AgentSkillsManager.)

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

### Lifecycle Verbs (v2.0.1)

The CLI exposes five lifecycle verbs that map directly onto the library/install-state split:

```
ensemble pull <source> [--type server|skill|plugin|agent|command|hook]
                                           # marketplace → library
                                           # source: owner/repo, registry:slug, URL, ./path
ensemble pull <source> --install <client> [--project <path>]
                                           # convenience: pull and install in one step

ensemble add <name> --command <cmd> [--args ...] [--env KEY=VAL ...]
                                           # local/manual authoring → library
                                           # strict library-first: leaves install state empty
ensemble add <name> --command <cmd> --install <client> [--project <path>]
                                           # convenience: add and install in one step

ensemble install <name> --client <client> [--project <path>]
                                           # library → installed for a specific (client, project?) scope
ensemble install <name> --group <group>    # install via group assignment

ensemble uninstall <name> --client <client> [--project <path>]
                                           # installed → not-installed for that scope
                                           # NON-DESTRUCTIVE — resource stays in library

ensemble remove <name> [--type <type>]     # library → gone (destructive; confirms)
                                           # cascades uninstall from every client first
```

Verb semantics are strict:

- **`pull`** and **`add`** are the only verbs that create library membership. `pull` is for remote sources; `add` is for explicit local definitions. Both default to **strict library-first** — the resource lands in the library with an empty install matrix and must be installed with a separate `install` call (or the `--install` convenience flag).
- **`install`** and **`uninstall`** mutate install state only. They never create or destroy library membership. `uninstall` removing the last install scope leaves the resource in the library, discoverable under the **Library** pivot with an empty install indicator.
- **`remove`** is the only destructive verb. It evicts a resource from the library entirely and cascades uninstall from every client where it was installed. It confirms before acting unless `--yes` is passed. `remove` and `uninstall` are deliberately different words because they do fundamentally different things; `library-add`/`library-remove` vs. `install`/`uninstall` was considered and rejected as noisier without resolving the ambiguity.

### Library Subcommand

```
ensemble library list [--type <type>] [--installed] [--uninstalled]
                                           # list library with optional filters
                                           # --installed: only resources installed on ≥1 client
                                           # --uninstalled: only resources in library but not installed anywhere
ensemble library show <name> [--type <type>]
                                           # show one resource and its per-client/per-project install matrix
ensemble library pivot project [--project <path>]
                                           # list library as-seen-from a specific project
ensemble library pivot client <client>     # list library as-seen-from a specific client
ensemble library pivot group <group>       # list library as-seen-from a specific group
ensemble library pivot marketplace         # list pullable resources not yet in library
```

`ensemble browse` (the TUI) defaults to the Library pivot with a pivot selector in the top bar.

### Per-Project Install State

Per-project install state is only meaningful where the client supports it. **Claude Code** supports project-scoped servers and plugins; `--project <path>` is accepted for `install`/`uninstall` against `claude-code` and is stored in the install matrix as a per-project entry. For clients that do not support project scoping (every other client in the supported set, as of v2.0.1), passing `--project` is an error that reports "client `<id>` does not support per-project install state; use a user-level install instead." The install matrix for such clients has a single `global` entry per resource rather than a list of project paths. `ensemble library show` renders both cases uniformly.

### One-Shot Import (transitional, v2.0.1 only)

```
ensemble import-legacy [--dry-run]          # translate v1.3 config → v2.0.1 library + install-state matrix
                                            # uses current ~/.config/ensemble/config.json as one input
                                            # and a live scan of every detected client's on-disk config
                                            # as the ground truth for "what is actually installed where"
                                            # writes a backup to ~/.config/ensemble/config.v1.bak.json
                                            # prints a human summary of resources imported and install
                                            # state reconstructed. Runs once. Deleted in a follow-up
                                            # commit after the user confirms the v2.0.1 config is right.
```

`ensemble import-legacy` is explicitly a **throwaway subcommand**, not a permanent part of the CLI. It exists only for the pre-v2 transition window, is run once against the user's single machine, and is removed (along with `src/import-legacy.ts`) in a follow-up commit after the user verifies the translated config. See §Migration for the full rationale.

### Retained Surface

The following commands are **retained unchanged** in v2.0.1. They are library-membership, query, sync, group, and workflow commands whose semantics are unchanged — they route through the v2.0.1 operations layer where appropriate (most legacy `add`/`remove` commands route to `addToLibrary` / `removeFromLibrary`, and group assignment commands route through `installResource` / `uninstallResource` at sync time).

**Deleted in v2.0.1 (clean slate).** The following v1.3 install-state commands are **removed outright** and do not appear below: `ensemble enable <server>`, `ensemble disable <server>`, `ensemble plugins install`, `ensemble plugins uninstall`, `ensemble plugins enable`, `ensemble plugins disable`. Their function is subsumed by `ensemble install` / `ensemble uninstall` from the §Lifecycle Verbs block. Script call sites that relied on them must migrate in the same coordination window as the operations rename (see §Migration).

```
ensemble list                              # list all servers
ensemble add <name> --command <cmd> [--args ...] [--env KEY=VAL ...]   # explicit server add
                                              # (or use unified: ensemble add <source> — see below)
ensemble remove <name>
ensemble show <name>                       # show server details
                                           # (server enable/disable deleted in v2.0.1 — use
                                           #  ensemble install/uninstall from the Lifecycle Verbs block)

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
ensemble plugins show <name>               # show plugin details
ensemble plugins import                    # import existing plugins into ensemble registry
                                           # (plugins install/uninstall/enable/disable deleted
                                           #  in v2.0.1 — use ensemble install/uninstall with
                                           #  --type plugin from the Lifecycle Verbs block)

ensemble marketplaces list                 # list known marketplaces
ensemble marketplaces add <name> --repo <owner/repo>
ensemble marketplaces add <name> --path /local/dir
ensemble marketplaces remove <name>
ensemble marketplaces show <name>          # show marketplace details + plugins

ensemble groups add-skill <group> <skill>
ensemble groups remove-skill <group> <skill>
ensemble groups add-plugin <group> <plugin>
ensemble groups remove-plugin <group> <plugin>
ensemble groups add-agent <group> <agent>
ensemble groups remove-agent <group> <agent>
ensemble groups add-command <group> <command>
ensemble groups remove-command <group> <command>
ensemble groups add-hook <group> <hook>
ensemble groups remove-hook <group> <hook>
ensemble groups export <group> --as-plugin     # compile group into a CC plugin (profile-as-plugin)

ensemble agents list                            # list all subagents
ensemble agents add <name> --from <source>      # add agent from GitHub, local path, or catalog
ensemble agents remove <name>
ensemble agents enable <name>
ensemble agents disable <name>
ensemble agents show <name>                     # show frontmatter (name, description, tools, model) + body preview
ensemble agents search <query>                  # search agent catalog
ensemble agents sync [<client>]                 # sync agents to client agents directories

ensemble commands list                          # list all slash commands
ensemble commands add <name> --from <source>    # add command from GitHub, local path, or catalog
ensemble commands remove <name>
ensemble commands enable <name>
ensemble commands disable <name>
ensemble commands show <name>                   # show frontmatter (description, allowed-tools, argument-hint) + body
ensemble commands search <query>
ensemble commands sync [<client>]

ensemble hooks list                             # list all hooks (grouped by event)
ensemble hooks add --event <event> --matcher <m> --command <cmd> [--name <name>]
                                                 # events: PreToolUse, PostToolUse, SessionStart,
                                                 #         UserPromptSubmit, PreCompact, Stop, Notification
ensemble hooks remove <id>
ensemble hooks enable <id>
ensemble hooks disable <id>
ensemble hooks show <id>
ensemble hooks sync [<client>]                  # merge hooks into client settings.json (non-destructive)

ensemble settings list                          # list all managed settings.json keys
ensemble settings set <key> <value>             # manage a setting declaratively (JSON-parsed value)
ensemble settings unset <key>                   # stop managing a setting (leaves existing value untouched)
ensemble settings show <key>
ensemble settings sync [<client>]               # merge managed keys into settings.json (non-destructive)

ensemble browse                                 # interactive TUI browser: fuzzy search across
                                                 #   installed + discoverable resources, @marketplace
                                                 #   filter syntax, Card/Slim view toggle, one-key install
ensemble browse --view card|slim                # select default view mode
ensemble browse --type server|skill|plugin|agent|command|hook
                                                 # restrict to one resource type
ensemble browse --marketplace <name>             # restrict to one marketplace

ensemble snapshots list                         # list rollback snapshots
ensemble snapshots show <id>                    # show snapshot contents (files touched, sizes)
ensemble rollback <id>                          # restore a snapshot
ensemble rollback --latest                      # restore the most recent sync snapshot

ensemble rules list                        # list all path rules
ensemble rules add <path> <group>          # auto-assign group to projects under path
ensemble rules remove <path>

ensemble profiles save <name>             # snapshot current clients/rules/settings as a named profile
ensemble profiles activate <name>         # restore a profile and sync all clients
ensemble profiles list                    # list saved profiles (marks active)
ensemble profiles show <name>             # show profile details (client count, rules, created date)
ensemble profiles delete <name>           # delete a saved profile

ensemble scope <name> --project <path>     # move server/plugin to project-only

ensemble projects                          # list registry projects with MCP server status

ensemble collisions                        # detect scope conflicts between global and project groups
ensemble deps                              # show skill dependency status

ensemble registry cache-clear              # clear file-based registry response cache

ensemble init                              # guided first-run setup
ensemble doctor                            # audit config health across all clients
ensemble doctor --json                     # structured output for scripting

ensemble reference                         # show full command reference
```

The CLI binary is `ensemble` with `ens` as a short alias. Built with Commander.js as a thin wrapper over the operations and sync modules.

## Migration (v1.3 → v2.0.1)

v2.0.1 replaces v1.3's install-state surface with a clean-slate rewrite. There is no deprecation-by-rename, no migration-gated runtime guard layer, no `Legacy`-suffixed shim, and no wave-based deprecation timeline. The old install-state verbs are **deleted in v2.0.1 itself**, in the same commit that lands the new verbs. The transition is a one-shot import and a coordinated cross-repo rename, nothing more.

### Why clean slate is acceptable here

Ensemble is personal infrastructure with a single known consumer set: the user's own CLI and desktop usage on a single machine, plus exactly one dependent repo (`chorus-app`) that the same user controls. There are no external consumers, no published scripts in third-party projects, no documentation pinned to the old verb names, and no coordination cost with anyone but the user themselves. Under these constraints, "preserve backward compatibility via deprecation → guard → retire" is strictly worse than "rip it out once" — it trades a permanent ongoing code-path tax for avoidance of a single afternoon of coordinated renaming.

This approach **would not apply** to a library with external users. External-consumer migration genuinely needs the compatibility dance: staged deprecation, guard-rail runtime errors, cross-version grace windows. Ensemble just doesn't have those constraints, and the spec records the decision honestly rather than pretending the library is something it isn't.

### One-shot import

A single transitional subsystem — `ensemble import-legacy`, backed by `src/import-legacy.ts` — translates the user's existing v1.3 config shape into a fresh v2.0.1 library plus install-state matrix.

**Inputs.**

1. The current `~/.config/ensemble/config.json` (v1.3 shape — `servers` / `plugins` with `enabled: boolean`, per-client group assignments, etc.).
2. A live filesystem scan of every detected client's actual on-disk config files (Claude Desktop, Claude Code, Cursor, VS Code, and every other client in §Supported Clients). The live scan is the **ground truth** for "what is actually installed where right now." The v1.3 config alone is insufficient because it tracks intent, not outcome.

**Outputs.**

1. A new `~/.config/ensemble/config.json` in the v2.0.1 shape: every server, skill, and plugin is placed in the library; per-client/per-project install state is reconstructed from the disk scan.
2. A backup at `~/.config/ensemble/config.v1.bak.json` — the user's pre-import v1.3 config, untouched, available for rollback.
3. A human-readable summary printed to stdout: "Imported N servers, M skills, K plugins. Install state reconstructed across C clients. Library contains R total resources."

**Ambiguity handling.** If the disk scan finds a resource that exists in a client's config but not in the v1.3 ensemble registry — or vice versa — the script reports the ambiguity, imports the resource conservatively as "in library, not installed" (so nothing is silently dropped), and lets the user correct it manually. There is no clever reconciliation logic: the user is present at the one-time import and can fix anything that looks wrong.

**Lifecycle.** `ensemble import-legacy` is explicitly a **throwaway**, not a permanent subsystem. It runs once on the user's machine, the user confirms the translated config, and then the entire `src/import-legacy.ts` module and its CLI subcommand are **deleted in a follow-up commit**. The spec records the module with this intent so that no future agent is tempted to generalize it, extend it, or preserve it beyond the one-shot window.

### Coordinated cross-repo rename

Once `import-legacy` has landed and the user has run it, the v1.3 install-state verbs are removed from ensemble in one atomic sweep, and chorus-app is updated in lockstep. The scope is small because both repos are controlled by the same user.

- **Ensemble side (~40 call sites, one commit).** The verbs `installPlugin`, `uninstallPlugin`, `installSkill`, `uninstallSkill`, `enablePlugin`, `disablePlugin`, `enableServer`, `disableServer` are removed from `operations.ts`, the package exports, the public types, `cli/index.ts`, and every test file in the same commit. The new verbs `installResource` / `uninstallResource` are the only install-state surface.
- **Chorus side (one file, ~25 lines).** `chorus-app/src/main/services/ensemble-config.ts` is the sole consumer in chorus. Imports of `enablePlugin` / `disablePlugin` / `enableServer` / `disableServer` are replaced with calls into `installResource` / `uninstallResource`. `addServer` / `removeServer` and group operations stay semantically similar but now route through library-first operations — they do not need to be renamed, only updated where they implicitly assumed install-state semantics. Estimated ~25 lines changed.
- **Order.** `import-legacy` lands and runs first (so the on-disk config is already v2.0.1 shape before any rename touches code). Then the ensemble rename sweep and the chorus update land together, in the same coordination window. Then `import-legacy.ts` and its CLI subcommand are deleted.

### Build order

1. Schemas and new operations in ensemble: library model, install-state matrix, 7 resource types, pull/add/install/uninstall/remove verbs on top of `addToLibrary` / `removeFromLibrary` / `installResource` / `uninstallResource`.
2. `src/import-legacy.ts` + `ensemble import-legacy` CLI subcommand.
3. **User runs `ensemble import-legacy` on their machine once**, inspects the translated `~/.config/ensemble/config.json`, and confirms it looks right. `config.v1.bak.json` stays on disk as a rollback anchor for the rest of the build.
4. Coordinated rename sweep: ensemble deletes the 8 v1.3 install-state verbs, adds the v2.0.1 verbs, and updates ~40 call sites (CLI, desktop IPC handlers, tests, library exports) — plus chorus-app updates `ensemble-config.ts` (~25 lines) — all in the same coordination window.
5. `src/import-legacy.ts` and the `ensemble import-legacy` subcommand are **deleted** in a follow-up commit.
6. Everything else on the v2.0.1 track: `sync.ts` rewrite for the library → install-state projection, `settings.ts`, `snapshots.ts`, the remaining resource types (agents, commands, hooks), the 4 new clients, `browse.ts` TUI, and the desktop pivot-based IA rewrite.

## Desktop App

An Electron desktop application providing full visual management of Ensemble's capabilities. The desktop app is a presentation layer over the same library operations that power the CLI — it calls the Ensemble library via Electron IPC, not via CLI subprocess calls. Changes made in the desktop app are immediately visible in the CLI and vice versa, because both read and write the same `~/.config/ensemble/config.json`.

### Why a Desktop App

The CLI is the right interface for agents and scripting. But to understand the ergonomics of Ensemble's operations — how group assignment feels, whether drift detection is legible, whether registry browsing is discoverable — requires a visual surface. The desktop app exists to make Ensemble's full capability set tangible and to inform the ongoing design of the library API through direct use.

### Layout

macOS-style sidebar + detail panel. The sidebar is organized around **pivots over the library**, not around resource types. Resource type is a filter bar at the top of the Library pivot, not a sidebar section — users who think in resource types filter the Library view; users who think in clients, projects, or groups use the corresponding pivot. Install/uninstall actions are available from **every** pivot via row-level controls.

**Pivots** (top of sidebar):

| Sidebar Section | Content |
|----------------|---------|
| **Library** (default) | Every owned resource, regardless of install state. Resource-type filter bar at top (All / Servers / Skills / Plugins / Agents / Commands / Hooks / Settings). Each row shows install-state indicators — a compact matrix of which clients and projects the resource is installed for. Row controls toggle install state per client/project. Default sort: recently pulled. |
| **By Project** | For a selected project path, the resources currently installed for that project (Claude Code only for v2.0.1). Install gesture: add to this project's assignment. Uninstall gesture: remove from this project. |
| **By Group** | For a selected group, the resources that belong to the group. Drag-and-drop membership. Install gesture on a group: assign the group to a client. Uninstall: unassign. Removing a resource from a group cascades uninstall from any clients using that group. |
| **By Client** | For a selected client, the resources currently installed on that client with per-client sync state visible. Install/uninstall per this client. |
| **Marketplace** | Remote discovery surface. Browse catalogs and registries; shows only resources **not yet in the library**. Action on a row: **Pull** → adds to library. A separate "Pull + install on…" menu offers the one-step convenience flow. |

**Workflow** (below the pivots, always visible):

| Sidebar Section | Content |
|----------------|---------|
| **Sync** | One-click sync with visual preview of changes per client; drift detection with side-by-side diff; rollback snapshot indicator. Projects install state into client configs; does not touch library membership. |
| **Doctor** | Visual health report — category scores, fix suggestions with one-click actions where possible |
| **Snapshots** | List of rollback snapshots; inspect contents; one-click restore |
| **Profiles** | Save/activate/show/delete named configuration profiles |
| **Rules** | Path rule management for auto-assignment |

**Information architecture note.** The pivot-based IA replaces v2.0's seven-section Resources group. The motivating insight: **the library is the primary interface, and install state is a property of library resources, not a location above or below them.** Users browse the library through whichever pivot matches their mental model — by project, by group, by client, or by type — and install/uninstall from wherever they are. The same underlying data is viewed five different ways. This keeps the sidebar short (five pivots + five workflow sections = ten total, down from fifteen) and resolves the "where does a server live — Servers or Clients?" ambiguity that the v2.0 layout inherited.

### Visual Extras

Features that go beyond CLI parity — interactions that only make sense in a GUI:

- **Drag-and-drop group assignment** — Drag any resource (server, skill, plugin, agent, command, hook) onto groups. Visual feedback shows current membership.
- **Visual drift detection** — Side-by-side diff showing what changed manually in client configs vs. what Ensemble expects. Overwrite, adopt, or rollback actions inline.
- **Interactive dependency graph** (stretch) — Visualize skill/agent-to-server dependencies as a directed graph. Highlight missing dependencies. Not yet implemented.
- **Registry cards and slim rows** — Rich Card view for registry search results showing trust tier, quality signals, tool count, and one-click install. Slim view toggle collapses each result to a one-line row for dense browsing. Both views apply to installed-resource lists as well. (Pattern from plum.)
- **Unified fuzzy search bar** — A single search field at the top of every resource list searches both installed and discoverable items simultaneously, with `@marketplace-name` filter chips parsed from the query. Results include an "installed" badge and a one-click install button for discoverable entries. (Pattern from plum.)
- **Rollback affordances** — After every sync, a persistent "Undo last sync" button surfaces the latest snapshot. A dedicated Snapshots section provides deeper history with per-file restore granularity. (Pattern from TARS.)

### IPC Architecture

The desktop app uses Electron's contextBridge to expose Ensemble library operations to the React renderer process:

1. **Main process** — Imports the Ensemble library directly (`import { loadConfig, saveConfig } from 'ensemble'`). Registers IPC handlers for each operation category (config, servers, skills, plugins, groups, clients, sync, doctor, registry, profiles, rules).
2. **Preload script** — Exposes a typed `window.ensemble` API to the renderer via `contextBridge.exposeInMainWorld`.
3. **Renderer process** — React components call `window.ensemble.*` methods. Custom hooks (`useConfig`, `useServers`, `useSync`, etc.) wrap the IPC calls with loading states and error handling.

This architecture means the renderer has no direct filesystem or Node.js access — all operations go through the main process, which calls the Ensemble library. The same security boundary Electron enforces for web content.

### Config

The desktop app reads and writes the same `~/.config/ensemble/config.json` used by the CLI. No separate data store.

When the config file changes on disk (e.g., from a CLI command while the app is open), the app detects the change and reloads. This uses `fs.watch` on the config file — the desktop app is the only Ensemble component that watches files, and only its own shared config.

**Stretch:** App-specific preferences (window size, sidebar width, theme, last-active section) will be stored in a separate `~/.config/ensemble/desktop-prefs.json` to avoid polluting the shared config. Not yet implemented — the app currently uses Electron defaults.

### Testing

Playwright with Electron support provides autonomous UI testing:

- **Launch** — Playwright's Electron integration launches the app programmatically, no manual setup.
- **Interaction** — Tests navigate the sidebar, fill forms, click buttons, drag elements, and verify state.
- **Verification** — Screenshot capture and DOM assertions verify layout, content, and behavior.
- **CI** — Playwright tests run headlessly in CI alongside Vitest unit tests.

Tests live in `packages/desktop/e2e/` and use data-testid attributes for stable selectors.

### Distribution

Distribution model is TBD. Options under consideration:

- **npm + npx** — `npx ensemble-desktop` for developers, consistent with CLI distribution.
- **DMG / standalone binary** — macOS app bundle via electron-builder for non-developer users.
- **Both** — npm for developers, GitHub release binary for everyone else.

The packaging configuration (`electron-builder.yml`) supports all options. Distribution decision deferred until the app reaches usable state.

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
  ],
  "settings": {
    "usage_tracking": false,
    "sync_cost_warning_threshold": 50
  },
  "profiles": {},
  "activeProfile": null
}
```

When `group` is `null`, the client receives all enabled servers (default behavior).

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

## Configuration Profiles

Profiles snapshot the current client assignments, path rules, and settings under a named label. This allows switching between different configuration contexts — for example, a "work" profile with corporate servers and rules vs. a "personal" profile with hobby projects.

### What a Profile Captures

A profile stores:
- **Client assignments** — which groups are assigned to which clients (the full `clients` array)
- **Path rules** — the auto-assignment rules (the full `rules` array)
- **Settings** — the settings object (sync cost threshold, usage tracking, etc.)
- **Created timestamp** — when the profile was saved

A profile does **not** capture servers, groups, skills, or plugins. These are shared infrastructure that persists across profiles. Profiles only capture the _assignments_ and _rules_ that determine how that infrastructure maps to clients.

### Operations

All profile operations are pure functions following the standard `(config, params) → { config, result }` pattern:

- **`saveProfile(config, name)`** — Snapshots the current `clients`, `rules`, and `settings` into `config.profiles[name]`. Overwrites if a profile with that name already exists.
- **`activateProfile(config, name)`** — Restores the profile's `clients`, `rules`, and `settings` onto the config and sets `config.activeProfile` to the profile name. The CLI follows activation with a full `syncAllClients` to propagate the restored assignments.
- **`listProfiles(config)`** — Returns all profile names, marking the active profile.
- **`showProfile(config, name)`** — Returns the profile's client count, rule count, and creation timestamp.
- **`deleteProfile(config, name)`** — Removes the profile. If the deleted profile was active, clears `activeProfile`.

### Config Schema

```json
{
  "profiles": {
    "work": {
      "name": "work",
      "clients": [...],
      "rules": [...],
      "settings": {...},
      "createdAt": "2026-04-01T12:00:00Z"
    }
  },
  "activeProfile": "work"
}
```

`profiles` is a record keyed by name. `activeProfile` is nullable — `null` means no profile is active (manual configuration).

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

## Setlist Capability Integration

Ensemble can optionally read from setlist's capability registry via `@setlist/core` to enrich search results, doctor checks, and project views with portfolio-wide capability awareness. This is a read-only interface — Ensemble discovers and surfaces capabilities but never registers them.

### What It Provides

Setlist's capability registry knows what each project can do: named capabilities with types, descriptions, input/output contracts, authentication requirements, invocation models, and intended audiences. Ensemble reads this to:

- **Extend search** — `ensemble search` results include setlist capabilities alongside local servers and skills, giving users a single view of everything available in the portfolio
- **Verify coverage** — doctor checks can detect gaps where a project declares MCP-invoked capabilities but the required servers aren't enabled
- **Enrich project views** — `ensemble projects` shows capability counts when setlist is available, revealing which projects are capability-rich vs. thin

### Capability-Aware Search

When setlist is available, `ensemble search <query>` includes matching capabilities in results. Capabilities appear in a separate group below local servers and skills, showing the capability name, owning project, type, and description.

When a capability declares `invocation_model: "MCP"` and names a specific server, the search result indicates whether that server is currently enabled for the capability's project. This helps users spot capabilities they could activate by enabling a server they already have registered.

```
$ ensemble search "knowledge management"
  Local:
    knowmarks-mcp (server, 4 matching tools: save, search, related, refine)
    research-patterns (skill, tags: knowledge, research)

  Portfolio capabilities (via setlist):
    knowmarks/search — Full-text search across knowledge base (MCP, server: knowmarks-mcp ✓ enabled)
    knowmarks/clustering — Auto-cluster bookmarks by topic (MCP, server: knowmarks-mcp ✓ enabled)
    chorus/knowledge-panel — Surface relevant knowledge in context (internal)
```

### Doctor Capability Check

A new doctor check category: **capability coverage**. For each project with setlist capabilities that reference MCP servers (`invocation_model: "MCP"`), the doctor verifies those servers are enabled for that project. Gaps appear as warnings — not errors, because Ensemble can't know whether a capability is actively used or intentionally left without its server.

| Check | Category | Severity | What it detects |
|-------|----------|----------|-----------------|
| Capability server gap | capability | warning | A setlist capability references an MCP server that isn't enabled for the capability's project |

```
$ ensemble doctor
✓ Central config valid (17 servers, 5 skills, 4 groups, 3 plugins)
✓ claude-desktop: config valid, in sync
⚠ chorus: capability "knowledge-panel" references server "knowmarks-mcp" but it is not enabled
ℹ 3 projects have setlist capabilities (12 total, 11 with servers enabled)

Health: 92/100 (92%)
0 errors, 1 warning, 1 info
```

### Projects Enrichment

When setlist is available, `ensemble projects` appends a capability count to each project row. This gives users a quick sense of which projects expose capabilities to the portfolio.

```
$ ensemble projects
  chorus        active    group: default    servers: 3    capabilities: 5
  archibald     active    group: default    servers: 2    capabilities: 2
  ensemble      active    group: dev-tools  servers: 1    capabilities: 0
  emailer       active    group: default    servers: 1    capabilities: 3
```

### Integration Pattern

Ensemble imports `@setlist/core` as an optional dependency — the same pattern used for `better-sqlite3` with the project registry. At startup, Ensemble attempts to require `@setlist/core`. If the package isn't installed, all capability features are silently disabled: search shows only local results, doctor skips capability checks, and `ensemble projects` omits the capability column.

This is a direct library import, not an MCP connection. Ensemble is a library/CLI that manages configs — it doesn't maintain live MCP connections to query tools at runtime.

### Boundary

Ensemble reads capabilities, never writes them. Capability registration is each project's responsibility, done via setlist's MCP tools or `@setlist/core` directly. Ensemble's role is to surface what's already registered and check whether the infrastructure (MCP servers) is in place to support it.

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

Sync is the projection of **install state** (a property of library resources) into client config files. It never touches library membership — a resource's presence in `~/.config/ensemble/` is unaffected by any sync outcome. The inputs to sync are: the library, each resource's install matrix, path rules, group assignments, and project scopes. The outputs are additive writes to client configs plus a rollback snapshot. Uninstalling a resource from a client and running sync removes it from that client's config (via additive-delete of the Ensemble-marked entry) but leaves the library untouched.

When a group contains any combination of resource types, `ensemble sync` handles all of them via their respective strategies:

- **Servers** are synced by writing entries to the target client's config file (JSON/TOML). All clients.
- **Skills** are synced by creating symlinks from the canonical store to the client's skills directory. Only clients with `skills_dir` support.
- **Plugins** are synced to Claude Code's plugin config (Claude Code only).
- **Agents** are synced by creating symlinks (or file copies, fallback) from the canonical store to the client's agents directory. Claude Code only in v2.0; clients that adopt subagent support (Antigravity, CodeBuddy, Qoder, Trae as they expose equivalents) will be added as they stabilize.
- **Commands** are synced via symlink (or file copy) to the client's commands directory. Claude Code only in v2.0; same extensibility plan as agents.
- **Hooks** are synced by **non-destructive merge** into `~/.claude/settings.json` (or the project-level `.claude/settings.json`) under the `hooks` key. Ensemble reads the existing file, merges its managed hook entries, and writes the result — preserving every key and every hook entry Ensemble does not own. Ensemble-owned hook entries are tagged with a `__ensemble: <id>` sidecar so additive sync can identify them on subsequent runs.
- **Settings** are synced by **non-destructive key-level merge** into `settings.json`. Ensemble owns only the specific keys the user placed under management (via `ensemble settings set`). On every write, Ensemble reads the current file, replaces its managed keys with the desired values, and preserves every other key — `permissions.allow`, `env`, `model`, `hooks` entries Ensemble doesn't own, and any third-party keys — untouched. This is the same preservation pattern plum applies for `permissions.allow` and `hooks`; v2.0 generalizes it to every key in `settings.json`.
- Resource entries in groups are silently ignored for clients that don't support that resource type (e.g., skill entries for Claude Desktop, hook entries for non-Claude-Code clients).

`ensemble sync --dry-run` shows a per-resource-type change preview. File-level resources (skills, agents, commands) show file operations (create symlink, update, remove). Merge-based resources (hooks, settings) show a key-level JSON diff.

### Safe Apply and Rollback Snapshots

Every `ensemble sync` run produces a rollback-capable snapshot before writing. The snapshot captures the pre-sync contents of every file Ensemble is about to touch (client configs, settings.json files, agents/commands/hooks directories) into `~/.config/ensemble/snapshots/<iso-timestamp>/` along with a manifest describing the operation. This is richer than additive-sync alone:

- **Additive sync** protects the user's _unmanaged_ entries from deletion.
- **Rollback snapshots** additionally protect the user's _managed_ entries from mistakes — bad registry installs, accidental group assignment, config rewrites from `--force`, and any other operation that produces an undesired outcome.

After sync, `ensemble rollback --latest` restores the most recent snapshot. `ensemble rollback <id>` restores an arbitrary snapshot. `ensemble snapshots list` and `ensemble snapshots show <id>` inspect history. Snapshots older than `settings.snapshot_retention_days` (default 30) are pruned automatically on each sync.

Snapshot creation is synchronous and blocking — `sync` waits for the snapshot to be written and fsync'd before touching any client file. This makes rollback reliable even if the sync itself crashes midway. (Pattern from TARS's "safe apply/rollback operations.")

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

### Group Split Suggestions

When the context cost summary reveals a high tool count, Ensemble suggests how to split the offending server set into smaller groups. The `suggestGroupSplits` function keyword-categorizes servers based on their names, tool names, and tool descriptions, then proposes logical groupings.

**Categories:** Servers are matched against six keyword categories — `data` (database, sql, postgres, etc.), `code` (git, github, repo, etc.), `web` (http, api, rest, etc.), `file` (filesystem, directory, etc.), `cloud` (aws, gcp, azure, etc.), and `ai` (llm, embedding, vector, etc.). A server can match multiple categories.

**Triggering:** Suggestions are only generated when 5 or more servers are being synced to a client. A category produces a suggestion only when it contains 2 or more servers. Each suggestion names a proposed group (e.g., `data-servers`) and lists the servers that would belong to it.

**Output:** Suggestions appear as part of the `computeContextCost` summary, alongside the tool count and token estimates. They are advisory — the user decides whether to act on them.

## Init

`ensemble init` is a guided onboarding command for first-time setup. It walks the user through client detection, optional server import, group creation, and initial assignment — replacing the need to run multiple commands manually.

### Discovery (discover.ts)

Before the guided flow prompts the user to import, `discover.ts` walks the filesystem looking for existing installed skills and plugins (`.claude/skills/` directories and plugin install locations across detected clients) and produces a `DiscoveryReport`. Its surface is a `DiscoverOptions` input, `discoveredSkillToInstallParams` and `discoveredPluginToInstallParams` helpers, and the report itself.

Under v2.0.1 lifecycle semantics, discover feeds its results into `addToLibrary` (pull local filesystem → library), mirroring how marketplace pulls flow `pullFromMarketplace → addToLibrary`. The filesystem is treated as another source of library candidates, not a parallel store.

Discovery is exposed via the CLI as part of `ensemble init` (the guided-onboarding entry point). The user sees a prompt like "found 12 existing skills and 3 plugins; add to library?" before the standard import and group-assignment steps. `discover.ts` and `tests/discover.test.ts` live in `src/` and are re-exported from `src/index.ts` for library consumers who want to run discovery outside the init flow.

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

### Secret Scanning

Ensemble detects hardcoded credentials in server env values and skill content. Values referencing 1Password (`op://` prefix) are exempt — the scanning specifically targets plaintext secrets that should have been stored in a secret manager.

**Detected patterns:**
| Pattern | Regex signature |
|---------|----------------|
| OpenAI API Key | `sk-[a-zA-Z0-9]{20,}` |
| AWS Access Key | `AKIA[0-9A-Z]{16}` |
| GitHub PAT | `ghp_[a-zA-Z0-9]{36}` |
| GitHub User Token | `ghu_[a-zA-Z0-9]{36}` |
| GitHub Server Token | `ghs_[a-zA-Z0-9]{36}` |
| Slack Token | `xox[bpas]-[a-zA-Z0-9-]+` |
| Private Key | `-----BEGIN.*PRIVATE KEY-----` |
| GitLab PAT | `glpat-[a-zA-Z0-9-]{20}` |

**Two scan targets:**
- **`scanSecrets(env, serverName?)`** — Scans a server's env record. Each violation reports the matched pattern name, the env key, the server name, and a truncated snippet (first 8 characters + `...`).
- **`scanSkillContent(content)`** — Scans the raw text body of a SKILL.md file for embedded secrets.

Both return an array of `SecretViolation` objects. The truncated snippet ensures the full secret is never logged or displayed. This feeds into `doctor` checks and can be used by library consumers for pre-sync validation.

### Local Capability Search

`ensemble search <query>` searches across the user's registered servers and skills by capability — matching against server names, descriptions, tool names/descriptions, and skill names/descriptions/tags. This is a local search (no network calls) using BM25 term frequency scoring over stored metadata, enhanced with query alias expansion, multi-signal quality scoring, and optional usage-based learning.

```
$ ensemble search "database query"
  postgres (server, 3 matching tools: query, schema, migrate)
  supabase (server, 1 matching tool: sql_query)
  sql-patterns (skill, tags: database, sql, query)
```

#### Query Alias Expansion

Before scoring, query terms are expanded through a built-in alias table. Abbreviations and acronyms map to their full forms — `k8s` expands to include `kubernetes`, `db` includes `database`, `auth` includes `authentication` and `authorization`, `ts` includes `typescript`, etc. The alias table covers ~30 common abbreviations across infrastructure, languages, and tooling domains. Expanded terms are OR-joined with the original query, broadening recall without requiring the user to type full terms.

#### Multi-Signal Quality Scoring

Search results blend BM25 text relevance (60% weight) with a quality score (40% weight). The quality score is computed from static signals:

**Server quality signals:**
- Has tool metadata (completeness)
- Origin timestamp recency (decays over 90 days)
- Trust tier (official: 1.0, community: 0.5, local: 0.25)
- Enabled state

**Skill quality signals:**
- Frontmatter completeness (name, description, tags)
- Has declared dependencies (indicates quality)
- Enabled state

Each signal contributes equally. The composite quality score is the average of all signal scores for that item.

#### Usage-Based Self-Learning Search

When `settings.usage_tracking` is enabled, search incorporates historical usage data to boost frequently successful items and demote unreliable ones. Usage data is stored at `~/.config/ensemble/usage.json`.

**Per-item tracking:**
- `invocations` — total times used
- `lastUsed` — ISO timestamp of most recent use
- `successes` / `failures` — outcome counts

**Scoring formula:** For items with 5+ invocations (the cold-start threshold), the usage score blends success rate (70% weight) with recency (30% weight, decaying over 90 days). Items below the threshold receive a neutral score of 0.5, ensuring new items are neither penalized nor promoted. When usage data is active, the quality score becomes a 50/50 blend of the static quality score and the usage score.

**CLI flags:**
- `--no-usage` — skip usage-based scoring for this search (use static quality only)
- `--reset-usage` — clear all usage data and exit

Usage tracking is opt-in via `settings.usage_tracking` (default: `false`). The `recordUsage(name, outcome)` function is available to library consumers for recording outcomes programmatically.

### Future Registry Support

Additional registries (Smithery, PulseMCP, MCP Scoreboard) can be added as opt-in sources when the user provides API keys. MCP Scoreboard provides quality grades across six dimensions (schema, protocol, reliability, docs, security, usability).

## Supported Clients

v2.0 expands from 17 to 21 detected clients. The four new entries — Antigravity, CodeBuddy, Qoder, and Trae — are IDE-class AI clients that consume MCP servers and (to varying degrees) agent skills. AgentSkillsManager validates that skills work across these clients; Ensemble adds them as first-class detection targets and path adapters.

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
| Antigravity | `~/.antigravity/mcp.json` | JSON | No |
| CodeBuddy | `~/.codebuddy/mcp.json` | JSON | No |
| Qoder | `~/.qoder/settings.json` → `mcpServers` | JSON | No |
| Trae | `~/.trae/mcp.json` | JSON | No |

**Note:** VS Code uses `mcp.servers` (dot-separated key path) instead of `mcpServers`. Zed uses `context_servers`. Some clients require a `"type": "stdio"` field in server entries. Codex CLI and mcpx use TOML format instead of JSON. Cline and Roo Code store configs in VS Code's `globalStorage` directory. Exact config paths for Antigravity, CodeBuddy, Qoder, and Trae will be confirmed against each client's current docs during implementation — the paths above are the expected shape but may shift. AgentSkillsManager is the upstream source validating that skills (and therefore Ensemble's resource model) work across these clients.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **CLI framework:** Commander.js
- **Validation:** Zod (schemas exported for consumer use)
- **Testing:** Vitest (library/CLI unit tests), Playwright (desktop E2E tests)
- **Linting/Formatting:** Biome
- **Build:** tsup (library, dual CJS/ESM output), electron-vite (desktop app)
- **Package manager:** npm (workspaces for monorepo)
- **Distribution:** npm registry (`npm install ensemble` / `npx ensemble`); desktop app distribution TBD
- **Config:** JSON (read/write via node:fs)
- **TOML parsing:** smol-toml (for Codex CLI and mcpx configs)
- **TUI rendering:** Ink (React-based terminal UI for `ensemble browse`)
- **Fuzzy matching:** fuzzysort (for fuzzy search across installed + discoverable resources)
- **File operations:** node:fs (native, for skill sync, migration, backups)
- **File locking:** proper-lockfile (for atomic config writes)
- **SQLite:** better-sqlite3 (for project registry reads)
- **HTTP:** native fetch (for registry API calls)
- **Secrets:** 1Password CLI (`op://`) references in env values — Ensemble stores the references, not plaintext
- **Desktop runtime:** Electron
- **Desktop UI:** React + Tailwind CSS
- **Desktop build/packaging:** electron-builder
- **Desktop bundler:** Vite (via electron-vite)

## Non-Goals

- **Library as a backup of client configs** — The library is the authoritative inventory **from which clients are synced**, not a dump of whatever each client happens to have installed. Importing servers from an existing client (via `ensemble import`) seeds the library; from that moment forward the library is the source of truth and clients are projections. Ensemble is not a git-for-client-configs, not a backup service, and not a diff tool across client installations.
- Running or proxying MCP servers — Ensemble only manages configs
- **Live MCP connections** — Ensemble is config-only. It does not spawn, proxy, or manage running MCP server processes. That responsibility belongs to the consuming app (e.g., Chorus) or the AI client itself.
- **Daemon / background process** — The library and CLI run on demand with no file watching and no long-running service. (The desktop app is a long-running Electron process that watches the config file for external changes — this is presentation-layer behavior, not a library concern.) Validated by examining mcpx's daemon model: the complexity of daemon lifecycle management (startup, shutdown, health, port conflicts) is disproportionate to the config-management problem. On-demand is the correct design for the core.
- Server runtime health checks or monitoring — `ensemble doctor` audits config files, not running processes
- Multi-machine sync (single machine only)
- Marketplace auto-update management — controlled via Claude Code's UI, not JSON
- Plugin development tooling — Ensemble manages installed plugins, not authoring
- Project/local plugin scopes (v1) — deferred until Claude Code stabilizes scope bugs
- **Standalone GUI framework** — The desktop app uses Electron + React. Ensemble does not implement a custom UI framework. The `ensemble browse` TUI is built on Ink (React for the terminal) and is presentation-only — it calls the same library operations as the CLI and desktop app, so it does not constitute a separate framework. Chorus remains a separate app consumer that imports Ensemble as a library dependency.

## Architecture

Core logic is organized into four layers: data model, operations, sync engine, and presentation. The CLI and desktop app are both thin presentation layers over a shared operations + sync + config core. App consumers (like Chorus) import the same operations and sync modules directly. All mutations (install, uninstall, enable, disable, assign, scope, etc.) live in the operations layer, never in presentation code. All operations are pure functions: `(config, params) → { config, result }` — they never perform I/O directly.

The project is structured as a monorepo with npm workspaces. The library and CLI remain at the root; the desktop app lives in `packages/desktop/`.

```
ensemble/
├── src/                              # Library + CLI (root package)
│   ├── schemas.ts                    # Zod schemas, TypeScript types (via z.infer), constants
│   ├── config.ts                     # loadConfig/saveConfig (atomic writes), query helpers, resolution helpers
│   ├── operations.ts                 # Pure business logic (addServer, removeServer, enable, disable, assign, scope, etc.)
│   ├── clients.ts                    # Client definitions (17 clients), detection, format adapters
│   ├── sync.ts                       # Sync engine — write configs per client, symlink fan-out, hook/settings merge, snapshot creation
│   ├── skills.ts                     # Skill store — SKILL.md I/O, canonical store operations
│   ├── agents.ts                     # Subagent store — .claude/agents/ frontmatter + canonical store
│   ├── commands.ts                   # Slash command store — .claude/commands/ frontmatter + canonical store
│   ├── hooks.ts                      # Hook store — settings.json non-destructive merge under hooks key
│   ├── settings.ts                   # Settings store — declarative non-destructive key-level merge
│   ├── snapshots.ts                  # Safe apply / rollback snapshots
│   ├── browse.ts                     # TUI-grade discovery engine (fuzzy search + Card/Slim render)
│   ├── search.ts                     # BM25-style local capability search
│   ├── registry.ts                   # Registry adapters (Official + Glama), quality signals, metadata caching, dynamic marketplace discovery
│   ├── doctor.ts                     # Deterministic health audit
│   ├── projects.ts                   # Project registry reader (better-sqlite3)
│   ├── secrets.ts                    # Secret scanning (env values, skill content)
│   ├── usage.ts                      # Usage tracking for self-learning search
│   ├── setlist.ts                    # Setlist capability integration (read-only)
│   └── index.ts                      # Public API surface — re-exports for library consumers
├── src/cli/
│   └── index.ts                      # Commander.js CLI — thin wrapper over operations
├── packages/
│   └── desktop/                      # Electron desktop app
│       ├── src/
│       │   ├── main/                 # Electron main process
│       │   │   ├── index.ts          # App lifecycle, window creation
│       │   │   ├── ipc-handlers.ts   # IPC handlers wrapping Ensemble library operations
│       │   │   └── config-watcher.ts # fs.watch on config.json for external changes
│       │   ├── renderer/             # React renderer
│       │   │   ├── App.tsx           # Root component — sidebar + detail panel layout
│       │   │   ├── components/       # Shared UI components
│       │   │   ├── pages/            # Section pages (Servers, Skills, Plugins, Groups, etc.)
│       │   │   └── hooks/            # React hooks wrapping Ensemble library calls via IPC
│       │   └── preload/              # Electron preload scripts (IPC bridge)
│       │       └── index.ts          # Expose Ensemble operations to renderer via contextBridge
│       ├── e2e/                      # Playwright E2E tests
│       │   └── *.spec.ts             # Autonomous UI tests
│       ├── package.json              # Desktop-specific deps (electron, react, tailwind, playwright)
│       ├── electron-builder.yml      # Build/packaging config
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── electron.vite.config.ts   # Main/preload/renderer build config (electron-vite)
├── package.json                      # Root package.json with workspaces config
├── tsconfig.json
├── tsup.config.ts
└── biome.json
```

| Module | Role |
|--------|------|
| `schemas.ts` | Zod schemas, TypeScript types (via `z.infer`), constants |
| `config.ts` | `loadConfig`/`saveConfig` with atomic writes, query helpers, resolution helpers (`resolveServers`, `resolveSkills`, `resolvePlugins`) |
| `clients.ts` | Client definitions (17 clients, including `skills_dir`), detection, config file read/write, CC settings helpers |
| `operations.ts` | Pure business logic for all mutations — shared by CLI, desktop app, and library consumers |
| `projects.ts` | Project registry reader — reads project-registry SQLite DB via better-sqlite3 |
| `sync.ts` | Sync engine — dual strategy: config-entry writes for servers, symlink fan-out for skills. Uses resolution helpers from `config.ts` |
| `skills.ts` | Skill store — SKILL.md frontmatter parsing, canonical store CRUD |
| `agents.ts` | Subagent store — `.claude/agents/*.md` frontmatter parsing (name, description, tools, model), canonical store CRUD, fan-out to client agents directories |
| `commands.ts` | Slash command store — `.claude/commands/*.md` frontmatter parsing (description, allowed-tools, argument-hint), canonical store CRUD, fan-out to client commands directories |
| `hooks.ts` | Hook store — validation of the 7 lifecycle event types, non-destructive merge into client `settings.json` under the `hooks` key, `__ensemble` tagging for additive detection |
| `settings.ts` | Settings store — declarative management of individual `settings.json` keys with non-destructive key-level merge; per-client diff generation |
| `snapshots.ts` | Safe apply / rollback snapshots — pre-write capture of every file Ensemble touches, restore operations, retention pruning |
| `browse.ts` | TUI-grade discovery engine — fuzzy search across installed + discoverable resources, `@marketplace-name` filter parsing, Card/Slim render modes, drives both `ensemble browse` CLI and the desktop Registry page |
| `registry.ts` | Registry adapter framework — search, show, install across extensible backends; dynamic marketplace discovery with auto-update notification |
| `search.ts` | Local capability search — BM25 scoring across servers and skills |
| `doctor.ts` | Deterministic health audit with structured scoring across 5 categories |
| `secrets.ts` | Secret scanning — regex-based detection of hardcoded secrets in env values and skill content |
| `usage.ts` | Usage tracking — records command/search usage for self-learning search scoring |
| `setlist.ts` | Setlist capability integration — read-only interface to `@setlist/core` for portfolio capability awareness |
| `discover.ts` | Filesystem scan for existing installed skills and plugins; produces a `DiscoveryReport` that feeds `addToLibrary` during `ensemble init` |
| `import-legacy.ts` | **Throwaway.** One-shot v1.3 → v2.0.1 config translator backing `ensemble import-legacy`. Reads the current v1.3 `config.json` plus a live scan of every detected client's on-disk config, writes a v2.0.1-shaped library + install-state matrix, and backs up the original to `config.v1.bak.json`. Runs once on the user's machine during the v2.0.1 transition, then the file and its CLI subcommand are deleted in a follow-up commit. Explicitly not a permanent subsystem — see §Migration. |
| `index.ts` | Public API surface — re-exports for `ensemble`, `ensemble/operations`, `ensemble/schemas`, etc. |
| `cli/index.ts` | Commander.js CLI — thin wrapper that calls operations and formats output |
| `packages/desktop/` | Electron desktop app — React + Tailwind UI over the same library operations via IPC |

## Design Principles

0. **The library is the primary interface. Install state is a property, not a location.** The user's owned inventory lives in a single flat library. Every resource in the library is owned regardless of whether it is currently installed anywhere. Install state is a per-client/per-project property of a library resource — never a tier above or below the library. Uninstalling removes a resource from a client's config; only `ensemble remove` evicts it from the library. Every UI surface must respect this distinction: pivots are views over the same flat library, and install/uninstall is a row-level action available from every view. (v2.0.1 refinement.)
1. **Library-first** — Ensemble is a library that happens to have a CLI and a desktop app, not an app with importable internals. Operations are pure functions. Config I/O is explicit. Consumers — CLI, desktop app, Chorus, or any other app — own the read/write lifecycle.
2. **Additive only on sync** — Ensemble manages its own servers in client configs. It never deletes servers it didn't create. A `__ensemble` marker comment or metadata key identifies managed entries.
3. **Backwards compatible defaults** — no group assignment = sync all enabled servers.
4. **Idempotent** — running `ensemble sync` twice produces the same result.
5. **No daemon** — runs on demand, no file watching, no background process. (Validated: see Non-Goals.)
6. **Dry-run support** — `ensemble sync --dry-run` shows what would change without writing.
7. **Config backup** — before writing to any client's config file for the first time, Ensemble creates a `.ensemble-backup` copy alongside the original. Subsequent writes do not overwrite the backup.
8. **Marker-based coexistence** — Ensemble tags every server entry it writes with a `__ensemble: true` marker. On sync, Ensemble reads all servers, preserves entries without the marker untouched, and only manages its own. This means Ensemble coexists safely with other tools that write to the same config files (e.g., ToolHive, Caliber, manual edits). However, other tools that don't use markers may overwrite Ensemble's entries during their own sync. Users running multiple config management tools should sync Ensemble last, or use `ensemble doctor` to detect unexpected changes via drift detection.
9. **Non-destructive settings.json merge** — Every write to `settings.json` (for hooks or for managed settings keys) is a key-level merge that preserves every field Ensemble does not own. `permissions.allow`, `env`, `model`, third-party keys, and hook entries Ensemble doesn't manage all survive every sync untouched. This is the plum-validated pattern generalized to the entire file. The invariant: after any `ensemble sync`, the set of keys and values in `settings.json` that Ensemble does not manage must be byte-identical to their pre-sync state.
10. **Safe apply with rollback snapshots** — Every `ensemble sync` captures a pre-write snapshot of every file it will touch. Any sync can be undone with `ensemble rollback --latest`. This is in addition to additive sync and marker-based coexistence — the three protections layer. Additive sync prevents deletion of unmanaged entries; markers keep Ensemble's own entries identifiable; snapshots make every operation reversible even when the user asked for it.
11. **Single-user, single-machine is a real constraint and a real license** — Ensemble is personal infrastructure with a single known consumer set: the user's own CLI and desktop usage on one machine, plus exactly one dependent repo (`chorus-app`) that the same user controls. There are no external consumers, no published scripts in third-party projects, and no coordination cost with anyone but the user. This does not make Ensemble sloppy — operations are still pure, additive sync still holds, snapshots still cover every write — but it does change what kinds of churn are affordable. Breaking changes that would be unacceptable for a public library are acceptable here when they simplify the code, because the compatibility cost budget can be **spent once** rather than amortized forever. v2.0.1's migration approach (§Migration) is the canonical example: a clean-slate verb rewrite plus a one-shot import, rather than a deprecation → guard → retire staged dance. Design choices that rely on this principle must say so explicitly, and must not silently generalize to a world Ensemble doesn't live in.

## Future

- **Multi-group assignments** — Allow projects and clients to be assigned multiple groups, with resolved servers/plugins being the union. Currently limited to one group each.
- **Project registry write-back** — Write `mcp_servers` to the project-registry's `project_fields` table, making Ensemble a producer as well as a consumer.
- **Additional registries** — Smithery and PulseMCP as opt-in sources with API key configuration.
- **SkillsGate deep integration** — SkillsGate (`skillsgate.ai`) as an additional skills catalog backend alongside claude-plugins.dev. SkillsGate offers lock-file based version pinning and agent-selective removal — features that could enhance Ensemble's skill provenance tracking.
- **Virtual server mapping** — As AI clients add platform-level integrations (Codex apps, Claude Code plugins, Kiro connectors), Ensemble may need to represent non-traditional "servers" that aren't stdio/HTTP processes. A virtual server pattern would map platform features into the familiar server abstraction, allowing them to participate in groups, assignments, and sync like regular servers. Deferred until client ecosystems stabilize.
- **Capability-driven recommendations** — Use setlist capability metadata to suggest server installations. When a project declares capabilities that reference servers Ensemble doesn't have registered, surface an actionable recommendation during `ensemble doctor` or `ensemble search`.

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
- **inceptyon-labs/TARS** — Profile-as-plugin packaging, collision detection across scopes, diff-plan-apply with backup, pin/track provenance modes. **v2.0 additions:** Centralized hub pattern for managing skills, agents, commands, hooks, MCP servers, and plugins in one visual interface; safe apply/rollback operations as a first-class operation-level safety model; profile-based configuration sharing across projects. Informed patterns: profile-as-plugin, collision detection, backup strategy, provenance modes, rollback snapshots, multi-resource-type scope (agents/commands/hooks as first-class types). Repo: `github.com/inceptyon-labs/TARS`.
- **christiananagnostou/skillbox** — Canonical store + symlink fan-out, auto-detect agents, self-referential meta-skill. **v2.0 framing:** Self-described as "local-first, agent-agnostic skills manager" — the same presentation-agnostic core philosophy Ensemble's library-first architecture embodies. Confirmatory reference for Ensemble's identity. Informed patterns: symlink distribution, meta-skill concept, presentation-agnostic core. Repo: `github.com/christiananagnostou/skillbox`.
- **walidboulanouar/ay-claude-templates** — Multi-source parser, bundle install, manifest dependencies. **v2.0 additions:** Cross-platform package manager scoped to Claude Skills, Agents, Commands, Hooks, Plugins, MCPs, and Settings as seven distinct resource types. Second independent source (alongside TARS) validating that the v2.0 scope expansion is the right direction for a Claude Code extension manager. Informed patterns: unified source parser, seven-resource-type data model, settings as a managed resource. Repo: `github.com/walidboulanouar/ay-claude-templates`.
- **caliber-ai-org/ai-setup** — Content-hash state comparison, deterministic scoring with categories, quality gate. Informed patterns: structured doctor scoring. Repo: `github.com/caliber-ai-org/ai-setup`.
- **skillsgate/skillsgate** — Canonical + symlink, lock file, multi-source parser, security scanning. Informed patterns: symlink fan-out validation, security scanning. Repo: `github.com/skillsgate/skillsgate`.
- **lasoons/AgentSkillsManager** — IDE-specific skills directories, cloud catalog (58K skills via claude-plugins.dev API). **v2.0 additions:** Validates that skill management extends to Antigravity, CodeBuddy, Cursor, Qoder, Trae, Windsurf, and VS Code — driving the 17→21 client expansion. Formalizes claude-plugins.dev as the canonical cloud catalog for Ensemble's skill search. Informed patterns: client skills directory mapping, skills catalog integration, IDE client roster expansion, cloud catalog as default backend. Repo: `github.com/lasoons/AgentSkillsManager`.
- **iannuttall/dotagents** — Symlink fan-out, migration with conflict detection, backup+undo, skill frontmatter validation, client path mapping. Informed patterns: skills migration, backup strategy, client path mapping. Repo: `github.com/iannuttall/dotagents`.
- **itsdevcoffee/plum** — Fast TUI discovering 750+ Claude Code plugins from 12 marketplaces. Features: fuzzy search across installed + discoverable in a single bar, dynamic registry with auto-update notification, `@marketplace-name` filter syntax, Card/Slim view modes, one-key install (`c`/`y`), non-destructive preservation of `settings.json` fields (`permissions.allow`, `hooks`, etc.). **v2.0 additions:** Drives the Part 2 discovery UX upgrade — `ensemble browse` TUI command, dynamic marketplace registry, fuzzy-search-all, filter syntax, view modes, and the generalized non-destructive settings.json merge invariant. Informed patterns: TUI-grade discovery, dynamic marketplace registry, fuzzy search across installed + discoverable, marketplace filter syntax, Card/Slim view modes, one-key install, non-destructive settings.json merge. Repo: `github.com/itsdevcoffee/plum`.
- **bgreenwell/claude-forge** — Hub for plugins, marketplaces, and components. Confirmatory reference for the hub-of-marketplaces model and cross-marketplace discovery. Informed patterns: multi-marketplace aggregation, cross-marketplace component browsing. Repo: `github.com/bgreenwell/claude-forge`.

## Changelog

- **2.0.1** — **v2.0 refinement: library as primary interface; install as property, not tier; pivot-based IA for desktop.** Recast the resource lifecycle model around three concepts (Marketplace, Library, Install state) with Pivot as a named view. The user's owned inventory lives in a single flat library regardless of whether resources are installed anywhere; install state is a per-client/per-project property of each library resource, not a tier above or below it. Rework §Core Concepts with a new "Resource Lifecycle Model" subsection, add Library / Install state / Pivot as first-class concepts, and clarify Marketplace as discovery-only. Split the operations layer into library-membership mutations (`pullFromMarketplace`, `addToLibrary`, `removeFromLibrary`) and install-state mutations (`installResource`, `uninstallResource`), with query helpers `getInstallState` and `getLibraryByPivot`. Add `InstallStateSchema` (per-client/per-project matrix) and `PivotSpecSchema` to the schema exports. Add five lifecycle CLI verbs (`pull`, `add`, `install`, `uninstall`, `remove`) with strict semantics: `pull`/`add` govern library membership, `install`/`uninstall` govern install state non-destructively, and `remove` is the only destructive verb. Adopt **strict library-first** for manual adds — `ensemble add` leaves install state empty by default, with `--install <client>` as a convenience for the one-step case. Add `ensemble library` subcommand group (`list`, `show`, `pivot …`). Replace the v2.0 seven-subsection Resources sidebar with a **pivot-based sidebar**: Library (default, with resource-type filter bar), By Project, By Group, By Client, Marketplace; workflow sections (Sync, Doctor, Snapshots, Profiles, Rules) move below. Clarify §Sync as the projection of install state into client configs — it never touches library membership. Add design principle #0 ("The library is the primary interface. Install state is a property, not a location."). Add non-goal ("library as a backup of client configs"). Address per-project install state scoping: Claude Code supports it; other clients do not, and `--project` against a non-supporting client is an error. No new external references; refinement driven by user insight.
- **2.0.0** — **Level up: Claude Code extension platform manager.** Expand scope from MCP servers, skills, and plugins to every declarative artifact in `.claude/`. Add four new first-class resource types: **agents** (`.claude/agents/*.md` subagents with name/description/tools/model frontmatter), **commands** (`.claude/commands/*.md` slash commands with description/allowed-tools/argument-hint frontmatter), **hooks** (settings.json `hooks` entries across the 7 lifecycle events — PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, PreCompact, Stop, Notification), and **settings** (declarative management of individual settings.json keys). Add corresponding Zod schemas (AgentSchema, CommandSchema, HookSchema, SettingSchema), operations modules (agents.ts, commands.ts, hooks.ts, settings.ts), package exports, CLI subcommand groups, group assignment verbs (add-agent/remove-agent/add-command/remove-command/add-hook/remove-hook), and desktop sidebar sections. Introduce **non-destructive settings.json merge** as a core invariant: every write preserves every key Ensemble does not manage. Introduce **safe apply with rollback snapshots** via new snapshots.ts module — every sync captures a pre-write snapshot to `~/.config/ensemble/snapshots/<timestamp>/`, any sync can be undone with `ensemble rollback --latest`, retention default 30 days. Add **TUI-grade discovery experience**: new `ensemble browse` command with fuzzy search across installed + discoverable resources in a single bar, `@marketplace-name` filter syntax, Card/Slim view modes, one-key install. Add **dynamic marketplace registry** with auto-update notification via `discoverMarketplaces()`. Formalize **claude-plugins.dev cloud catalog** (~58K skills) as the default skill search backend. Expand desktop app sidebar with collapsible **Resources** group containing all 7 resource types plus workflow sections; add Snapshots section. Expand detected clients from 17 to **21**: add **Antigravity, CodeBuddy, Qoder, Trae**. Add design principles: non-destructive settings.json merge (#9), safe apply with rollback snapshots (#10). Tech stack adds Ink (TUI) and fuzzysort. **References:** incorporate 6 new references — TARS v2 (rollback snapshots, multi-resource scope), ay-claude-templates (seven-resource data model, second independent source for scope expansion), plum (discovery UX, non-destructive merge), AgentSkillsManager (client roster expansion, cloud catalog as default), skillbox (presentation-agnostic framing confirmation), claude-forge (multi-marketplace aggregation confirmation). **Framing:** v2.0 reframes Ensemble from "MCP/skills/plugins manager" to "Claude Code extension platform manager" — managing every declarative artifact in `.claude/` across every AI client that adopts the pattern. v2.0 brings Ensemble into direct competition with TARS, AY Platform, and claude-forge; differentiators remain library-first architecture (consumable by Chorus and other apps), pure-function operations, Zod-validated schemas for external consumers, and setlist capability integration. Meta-loop: fctry (itself a plugin shipping commands/agents/hooks/skills) is now a thing Ensemble can install and manage.
- **1.3.1** — Review pass: fix architecture tree to match actual desktop main/ structure (3 files, not 1), correct electron.vite.config.ts filename, fix Registry API example function names (searchRegistries, resolveInstallParams), scope daemon/file-watching non-goal to library/CLI (desktop app legitimately watches config), mark interactive dependency graph as stretch, move desktop-prefs.json to stretch (not yet implemented).
- **1.3.0** — Add Electron desktop app as third presentation layer (alongside CLI and library API). Desktop app provides full CLI parity via macOS-style sidebar + detail panel layout with React + Tailwind. Visual extras: drag-and-drop group assignment, visual drift diffing with side-by-side diff, interactive dependency graphs, registry cards with one-click install. IPC architecture: main process imports Ensemble library, preload script exposes typed API via contextBridge, renderer calls operations through React hooks. Shared config (same config.json as CLI) with fs.watch for live reload. Autonomous UI testing via Playwright with Electron support. Monorepo structure with npm workspaces: library/CLI at root, desktop app at packages/desktop/. Update Non-Goals: replace "no GUI" with "no standalone GUI framework" (Chorus remains a separate consumer). Update Architecture with monorepo layout and desktop modules. Add Electron, React, Tailwind CSS, Playwright to tech stack. Distribution model TBD (npm/DMG/both).
- **1.2.0** — Document 5 code-ahead features. Add configuration profiles section (save/activate/list/show/delete named snapshots of client assignments, rules, and settings). Add secret scanning section (regex detection of 8 credential patterns in server env values and skill content, op:// exempt). Expand local capability search with query alias expansion (~30 abbreviation mappings), multi-signal quality scoring (BM25 60% + quality 40%), and usage-based self-learning search (opt-in via settings.usage_tracking, cold-start threshold of 5 invocations, success rate + recency blended scoring). Add group split suggestions subsection to sync (keyword-categorized server grouping proposals when tool count is high). Add profiles CLI commands, search --no-usage/--reset-usage flags. Update config schema example with settings and profiles fields.
- **1.1.0** — Add setlist capability integration as read-only interface via `@setlist/core` optional dependency. Capability-aware search extends `ensemble search` with portfolio capabilities from setlist. New doctor check category (capability coverage) warns when MCP-invoked capabilities lack enabled servers. `ensemble projects` shows per-project capability counts. Same optional-dependency pattern as project-registry (graceful fallback when `@setlist/core` not installed). Add future item: capability-driven recommendations.
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
