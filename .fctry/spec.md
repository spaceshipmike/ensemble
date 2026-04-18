```yaml
title: Ensemble
spec-version: 2.4.1
spec-format: nlspec-v2
status: active
date: 2026-04-18
author: Michael Lebowitz
synopsis:
  short: "Claude Code extension platform — full lifecycle for MCP servers, skills, plugins, agents, commands, hooks, and settings; MCPs and skills additionally mirror across 16 other AI clients"
  medium: "Ensemble is a Claude-Code-first extension platform manager. It goes depth-first on Claude Code — the full lifecycle for all seven declarative artifact types (MCP servers, skills, plugins, subagents, slash commands, hooks, and managed settings.json values), end-to-end, with safe apply, rollback snapshots, typed variables, profile-as-plugin packaging, and library reconciliation — before expanding breadth. As a shipped narrower offering, MCPs and skills additionally fan out across 16 other AI clients (Claude Desktop, Cursor, VS Code, Windsurf, Zed, JetBrains, Antigravity, CodeBuddy, Qoder, Trae, and more); other client types expand only after the Claude Code experience is right. v2.1.0 declares the Experience POV — frictionless through anticipation, three pillars (project-level tooling management, library building, marketplace discovery), and type-aware install destinations (plugins/agents/commands/hooks/settings install to Claude Code only; MCPs and skills offer multi-client mirroring). v2.0.3 adds a dual-field annotation model: every library item carries a source-owned `description` (auto-populated from upstream and silently refreshed) alongside a user-authored `userNotes` field that is never overwritten by re-import, weighted 2x in local search. v2.0.2 introduced a canonical library store at ~/.config/ensemble/library/ that is independent of any Claude Code scope; install state is a property of each library resource, not a tier above or below it. Ensemble exposes pure-function operations with Zod-validated schemas, a CLI with clean pull/add/install/uninstall/remove verbs, an Electron desktop app with a pivot-based sidebar plus a project × Claude Code matrix view, a discovery engine shared by CLI and desktop Registry, safe apply/rollback snapshots, and package exports for app integration."
  readme: "Ensemble is a Claude Code extension platform manager. It is Claude-Code-first, multi-client second: all seven declarative resource types — MCP servers, skills, plugins, subagents (.claude/agents/), slash commands (.claude/commands/), hooks (PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, PreCompact, Stop, Notification), and managed settings.json values (permissions.allow, env, model) — are managed end-to-end for Claude Code with safe apply, rollback snapshots, typed variables, and library reconciliation. MCPs and skills additionally mirror across these 16 additional clients: Claude Desktop, Cursor, VS Code, Windsurf, Zed, JetBrains, Antigravity, CodeBuddy, Qoder, Trae, and more. Other client types expand type-by-type after the Claude Code experience is right. Every UI surface is frictionless through anticipation: presence, state, scope, provenance, destination, and consequence are rendered ambiently rather than hidden behind navigation. The library-first architecture means every operation is a pure function — load config, call an operation, save config — making Ensemble equally useful as a standalone CLI, a desktop app, and an imported dependency for app-level consumers like Chorus. Settings.json merges are non-destructive: Ensemble preserves any keys it does not manage. Every sync run produces a rollback-capable snapshot. The Electron desktop app provides a pivot-based sidebar, a project × Claude Code matrix view with multi-client mirroring as a secondary dimension for MCPs and skills, inline staged changes with diff preview, and ambient state over modal navigation. A shared discovery engine (`browse.ts`) provides fuzzy search across installed and discoverable resources with @marketplace-name filter syntax; the Electron Registry view and a plain-text `ensemble browse` CLI both consume the same engine. Dynamic marketplace registry auto-discovers new marketplaces. Zod schemas are exported for runtime validation by consumers."
  tech-stack: [TypeScript, Commander.js, Zod, Vitest, Biome, tsup, npm, better-sqlite3, proper-lockfile, smol-toml, JSON config, Electron, React, Tailwind CSS, Playwright, fuzzysort]
  patterns: [frictionless through anticipation, depth-first on Claude Code, project × Claude Code primary axis, type-aware install destinations, ambient state over navigation, dual-field annotations (source description + userNotes), user-authored notes survive re-import, library as primary interface, install-state-as-property, pivot-based IA, library-first architecture, pure-function operations, Zod schema exports, additive sync, non-destructive settings.json merge, central registry, group-based assignment, path-rule auto-assignment, configuration profiles, profiles as live scope, per-(profile, artifact, client) enabled-tool matrix, profile-scoped variables and launchPrompt, typed variables with kind, root-to-leaf variable inheritance, secret redaction at serialization boundary, inherited installations as first-class state, upstream tree-hash drift with GitHub compare URL, atomic temp-write plus Zod-validate plus rename, staged pending changes with diff-then-apply, effective-config preview with per-file provenance, drag-first import with URL as peer, schema-driven resource editors, context cost preview, inline copy feedback, scoped-and-gated restart guidance, undoable at the wizard boundary, persistent layout state, keyboard ergonomics (Escape clears, Cmd+T tabs, Cmd+K palette), progressive consent for credentials, unified Explore surface (featured + search + local + git), preview-before-install gate, attribute brushing for batch decisions, three-tier zoom (heatmap/card/detail), equal-weight sources with single sort vocabulary, usage-based surface-to-top, pins, user collections across types and clients, project-registry integration, setlist capability integration, multi-registry search, extensible registry adapters, dynamic marketplace registry, registry metadata caching, server provenance tracking, tool metadata storage, context cost awareness, group split suggestions, local capability search, library fuzzy search primitive, marketplace filter syntax, query alias expansion, multi-signal quality scoring, usage-based self-learning search, secret scanning, presentation-agnostic core, operations layer, content-hash drift detection, artifact-level stable content hash, published resource detection policy, safe apply/rollback snapshots, snapshot tags with forward-restore semantics, per-client sync-mode table, deterministic health audit, guided onboarding, marker-based coexistence, canonical store + symlink fan-out, trust-tier classification, unified source parser, collision detection, pin/track provenance modes, dependency intelligence, pre-install security summary, deterministic config scoring, profile-as-plugin packaging, builtin meta-skill, monorepo workspaces, sidebar + detail panel layout, collapsible resources sidebar, visual drift diffing, drag-and-drop group assignment, autonomous UI testing, meta-loop (ensemble manages fctry)]
  goals: [frictionless Claude Code extension management through anticipation, depth-first Claude Code coverage for all seven resource types, MCP and skill mirroring across 16 additional AI clients, project-level tooling as primary surface, library as accumulating shelf across all seven types, marketplace discovery as unified explore surface, type-aware install destination rules, single source of truth for all Claude Code extension artifacts, cross-client sync for MCPs and skills, MCP server lifecycle management, skill lifecycle management, plugin lifecycle management, subagent lifecycle management, slash command lifecycle management, hook lifecycle management, declarative settings.json management, non-destructive settings merge, safe apply with rollback snapshots, registry discovery + install, dynamic marketplace discovery, fuzzy search across installed + discoverable, unified browse engine for CLI + desktop, cloud catalog integration (claude-plugins.dev), project-aware scoping, library API for app consumers, CLI surface, desktop app for visual management, server provenance and capability search, trust-tiered content safety, portfolio capability awareness via setlist, secret detection for credential hygiene, self-learning search refinement]
plugin-version: 0.82.0
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

A TypeScript library, CLI, and desktop app that manages a central registry of every Claude Code extension artifact — servers, skills, plugins, subagents, slash commands, hooks, and settings — organizes them into groups, and syncs the right configuration to the right clients. Each resource type has its own sync strategy: servers and plugins sync via config-entry writes, skills and agents and commands sync via canonical store with symlink or file fan-out, hooks sync via non-destructive merge into `settings.json` under the `hooks` key, and managed settings sync via non-destructive key-level merge that preserves any fields Ensemble does not own. Every sync run produces a rollback-capable snapshot: any operation can be undone. The Electron desktop app provides visual management with a collapsible Resources sidebar plus Groups, Clients, Sync, Doctor, Registry, Profiles, and Rules sections. A shared discovery engine (`browse.ts`) provides fuzzy search across installed and discoverable resources with `@marketplace-name` filter syntax; the Electron Registry view and a plain-text `ensemble browse` CLI both consume the same engine. App consumers (like Chorus) import Ensemble as a dependency and call operations directly.

v2.0 reframes Ensemble from "MCP/skills/plugins manager" to a **Claude Code extension platform manager** — managing every declarative artifact in `.claude/`. The library-first architecture stays. The pure-function operations stay. Only the data model and sync surface grow. v2.1.0 sharpens the scope stance: Ensemble is **Claude-Code-first, multi-client second** — all seven resource types land end-to-end for Claude Code before other client surfaces expand; the already-shipped MCP/skills cross-client offering continues as a narrower secondary surface (see §Experience POV).

## Experience POV (v2.1.0)

Ensemble's product voice — the principles every UI surface must satisfy — declared as a first-class spec section rather than left implicit across Desktop App, CLI, Registry, and Marketplaces.

### Frictionless through anticipation

Every UI surface answers the user's next question before they ask it. Presence, state, scope, provenance, destination, and consequence are rendered ambiently — never hidden, never requiring navigation to discover. **Friction is what the user does to discover what's true; Ensemble pays that cost once at render time so the user pays it zero times at interaction time.** This is the single principle that unifies every pillar below — each pillar is a specialization of anticipatory rendering to a specific surface.

### Scope sequencing (load-bearing)

Ensemble goes **depth-first on Claude Code, breadth second.** All seven resource types plus full lifecycle (install, uninstall, remove, safe apply, snapshots, profiles, library reconciliation) land end-to-end for Claude Code before any other client's surface expands. MCPs and skills across 16 other AI clients remain a **shipped narrower offering** — that coverage does not shrink, it simply is not the headline. Other clients expand type-by-type *after* the Claude Code experience is right. This is a stance about sequencing, not about aspiration: the 21-client vision is preserved; the ordering is fixed.

Three pillars organize the anticipation principle across the product's major surfaces: **project-level tooling management** (the primary desktop experience), **library building** (how the user's owned inventory accumulates and gets organized), and **marketplace discovery** (how new resources enter the library). Each pillar has its own principles and its own set of ambient-state requirements.

### Pillar 1 — Project-level tooling management

**Stance:** the primary surface is a **project × Claude Code configuration** view. Multi-client fan-out is a *secondary dimension* available only for MCPs and skills; for plugins, agents, commands, hooks, and settings there is no fan-out dimension because those types install to Claude Code only.

Principles:

- **Project is the primary axis; scope is a badge.** Global scope and project scope are both visible as per-item badges on every row, not as separate views. The user sees where a resource lives without switching context. [sources: ac, sh]
- **Claude Code is the assumed target; other clients are optional mirror targets.** For MCPs and skills, detected additional clients surface as opt-in mirror targets; undetected clients appear dimmed with a "not detected" hint rather than hidden. [bw, cs2, lo]
- **Installation state is ambient.** Every cell renders its state — `direct` / `inherited` / `drift` / `orphan` / `ignored` — without a click. The matrix answers "is this installed here, and how?" at glance time. [sd, ch, cs2, ac]
- **Matrix wire toggles stage; other edits commit immediately.** Toggling a Matrix wiring cell accumulates into a pending set with a diff preview and one **Apply** commits the batch (Cancel discards). Other gestures — library authoring, `userNotes` edits, single-resource installs — commit immediately with inline confirmation, because Apply-staging only pays for itself on the bulk cross-scope decisions the Matrix surfaces. [bw, ph, lo]
- **Effective config is previewable before sync.** Before Apply writes anything, the user can preview the post-sync `settings.json` (and every other touched file) with per-file source provenance — which key came from which managed setting, which hook entry came from which profile. [ac]
- **Progress is ambient, not modal.** Sync progress, scan progress, and long-running operations render as an `N/total` toolbar pill rather than a blocking modal dialog; the user keeps navigating while work proceeds. [sd, bw]

### Pillar 2 — Library building

**Stance:** the library is a **living shelf** that accumulates from multiple sources (marketplace pulls, filesystem discovery, drag-and-drop imports, manual authoring) and gets organized by the user, not by the filesystem. The library is the unit of ownership; its folder structure is an implementation detail.

Principles:

- **Library is unified across all seven types.** Resource type (server / skill / plugin / agent / command / hook / setting) is a filter applied within one library, not a route to a separate page per type. [hv, cs2, bw]
- **Migrate, don't start from scratch.** First-run bootstrap reads Claude Code directories first and populates the library; the user opens the app to their own existing tools, not an empty shelf with an import wizard. [sh, ac, ph]
- **User collections cross client and type boundaries.** Users create named collections ("my debugging set", "research mode") that group resources by *their* taxonomy — orthogonal to profiles (which declare live scope) and to groups (which declare sync assignment). Collections are curation, not deployment. [sb, ch, ph]
- **Pins and usage-based sort.** Frequently-used resources surface to the top automatically; explicit pins override. No manual reordering required for the common case. [sb]
- **Drag-first, form-last.** Dropping a `.md` onto the library begins an import flow; pasting a URL is a peer gesture. Form-based "Add New Resource" is the fallback, not the primary path. [lo, sd, cs2]
- **Schema-driven editors.** Resource editors are generated from the Zod schema — adding a field to `ServerSchema` produces a corresponding form field with validation, not a separate editor rewrite. [ac]
- **Context cost is previewable before commit.** When adding a resource to a profile, group, or active install set, the user sees its approximate context cost in the preview before committing. [lo]
- **`userNotes` is first-class annotation.** The dual-field model (source-owned `description` + user-authored `userNotes`, per §Resource Types, v2.0.3) is the canonical annotation surface; `userNotes` is what the user says about a resource, and nothing in the reconciliation pipeline overwrites it.
- **Copy feedback is inline, not toast.** Clicking "copy" on a resource identifier produces an inline checkmark at the click site rather than a toast banner; confirmation is adjacent to the gesture. [sd]

### Pillar 3 — Marketplace discovery

**Stance:** discovery is a **single Explore surface** blending curated catalogs, live registry search, local directory sources, and git repos — with install state visible in place on every result. Install destinations are **type-aware** (see below); search and browse are unified across sources with a single sort vocabulary.

Principles:

- **One Explore surface.** Featured + search + local + git appear in one scroll with "already in library" dedup. Users do not context-switch between "browse the official marketplace" and "search git"; the source appears as a badge on each result. [sh, oc, ph]
- **Preview before install, always.** Every install gesture requires two explicit clicks: one to preview (manifest, tool list, trust tier, context cost, security summary) and one to confirm install. No single-click drive-by installs. [oc, bw, sd]
- **Multi-client install applies to MCPs and skills only.** The install dialog for an MCP or skill shows an "Install to:" block with detected clients as checkboxes (Claude Code pre-selected). For plugins, agents, commands, hooks, and settings, the install dialog shows a "Scope:" block (global vs. project for Claude Code) with no client picker — those types are Claude-Code-only. [ch, ph]
- **Quality is visible.** Letter-grade / numeric-score / verified-publisher badges render on every result card without hovering. [bw]
- **Updates are reviewable, not silent.** When an installed resource has a new upstream version, the update surfaces with a per-item diff; the user reviews and applies or dismisses. Nothing silently updates after the first pull. [ph, sd]
- **Sources are equal-weight; one sort vocabulary.** `Recently updated`, `Most installed`, `Highest quality` — the same sort options apply across every adapter (official, community, local, git). [sh, cs2]
- **Attribute brushing for batch decisions.** Filters compose (type + trust tier + client compatibility + has-secrets); the user narrows the result set by brushing attributes rather than constructing queries. [hv]
- **Three-tier zoom.** A single zoom control toggles between heatmap (dense overview of many results), card (default browsing), and full detail (manifest + readme + tool list) — one gesture, three zoom levels. [hv]

### Cross-cutting principles

- **Atomic writes everywhere** (v2.0.5; see §Sync / Atomic Write Primitive).
- **Snapshots with forward-restore** (v2.0.5; see §Safe Apply and Rollback Snapshots).
- **Restart guidance is scoped and gated.** After a sync that requires a client restart to pick up changes, the restart hint appears as an inline banner on the affected client's card only — not a global nag, not a modal. Gated by what actually changed. [bw]
- **Undoable at the boundary.** Cancelled wizards clean up their side effects — a cancelled "add from git" deletes the cloned repo, a cancelled OAuth flow tears down the pending auth state, a cancelled import discards the draft library entry. The rule: nothing left behind when the user backs out. [cs2]
- **Layout state is persistent across sessions.** Sidebar width, active pivot, filter chips, sort order, split-pane ratios all survive restart. The user returns to exactly what they had. [cs]
- **Keyboard ergonomics.** Escape clears active filters or closes modals; Cmd+T opens a new tab of the same surface; Cmd+K opens the command palette. [oc, hv]
- **Optional menu-bar peek companion.** A lightweight tray/menu-bar affordance showing sync status and a quick profile switcher is under consideration; noted as an open question, not promised. [sb]
- **Progressive consent for credentials.** Keychain prompts and OAuth flows are gated per-item on first need — the app never pre-fetches credentials for resources the user has not asked to install. [lo]

### Type-aware install destinations

The install-destination rule that organizes Pillar 3's principles, stated once for reference:

| Resource type | Install dialog | Client picker |
|---------------|----------------|---------------|
| **MCP server** | Install to: | Detected clients as checkboxes (CC pre-selected) |
| **Skill** | Install to: | Detected clients as checkboxes (CC pre-selected) |
| **Plugin** | Scope: | None — global or project under Claude Code |
| **Agent** | Scope: | None — global or project under Claude Code |
| **Command** | Scope: | None — global or project under Claude Code |
| **Hook** | Scope: | None — global or project under Claude Code |
| **Setting** | Scope: | None — global or project under Claude Code |

This rule is enforced at the install-dialog layer and is the concrete mechanism behind the "MCPs/skills are the narrower multi-client offering, the other five types are Claude-Code-only" stance. See §Desktop App → Matrix View and §Marketplaces → Install flows for the surfaces that implement it.

### Rejected anti-patterns

Patterns Ensemble explicitly does not adopt, captured so future refs do not re-propose them:

- **Premature generalization across clients** — other clients only get what works end-to-end; breadth is not a headline, depth on Claude Code is. (Replaces the v0.1 draft's "single-client lock-in" framing — the concern is not lock-in but false-uniform coverage.)
- **Brand promises unshipped primitives** — no UI affordance promises a capability that does not ship. [lo]
- **Per-artifact-type page fragmentation** — resource type is a filter, not a route; one library view, seven types. [lo, ph]
- **Auto-select first item on list render** — lists render with no active selection; the user chooses, the app does not pre-choose. [cs2]
- **Auto-probe/register on modal mount** — opening the "add marketplace" modal does not ping the registry; probing happens only on explicit user gesture. [bw]
- **Silent feature scope cuts ("built but disabled")** — disabled features are removed, not hidden behind flags; the UI never gestures at a capability it cannot deliver. [ph]
- **Two sort vocabularies per source** — every adapter uses the same sort keys; no adapter introduces its own. [cs2]
- **Documentation sprawl as craft surrogate** — the app explains itself through its surfaces, not through a README that compensates for opaque UI. [hv]
- **Sidecar files leaking into user filesystem** — Ensemble's bookkeeping stays in `~/.config/ensemble/`, never in `.claude/` or project repos. [ac]
- **Inconsistent error surfaces** — every error renders in the same place with the same visual vocabulary, whether from sync, install, or scan. [oc]
- **Treating multi-client fan-out as the headline** — it is a shipped secondary offering for MCPs and skills, not the product's center of gravity.

### Open questions (parked, not promised)

- **Optional tray/menu-bar peek companion** [sb] — shape and surface TBD.
- **AI compose panel with diff-accept gate** [ch] — if AI-assisted resource authoring lands, every generated change flows through the existing diff-preview-then-apply boundary.
- **Remote update subscription with pin** [ac] — subscribe to upstream updates for a pinned resource with explicit review-before-apply.
- **Context-budget-aware bundling** [lo, bw] — suggest profile composition that fits within a declared context budget.
- **Deploy primer / `ensemble run <profile>`** — parked from the v2.0.5 ATM ref.
- **Shared canonical `~/.agents/skills/` store convention** [sd] — parked from the v2.0.5 SkillDeck ref; now nuanced by the Claude-Code-first stance: relevant for the MCPs/skills cross-client offering, less urgent for CC-only types.

Source key: `oc`=opcode, `bw`=mcp-manager, `cs`=clode-studio, `hv`=claude-code-history-viewer, `sd`=SkillDeck (UX retro pass), `lo`=loadout, `ac`=agent-corral, `ph`=aiplughub, `sb`=skillsbar, `cs2`=agent-skills, `sh`=skills-hub, `ch`=chops. See §References for each entry.

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

**Every library resource type carries two annotation fields** (v2.0.3):

- **`description`** — source-owned, auto-populated from upstream and silently refreshed on re-import. For servers this comes from the registry response; for skills from SKILL.md frontmatter; for plugins from the marketplace manifest; for agents and commands from the file's YAML frontmatter; for settings from Ensemble's built-in key catalog. For hooks, `description` is auto-generated from event + matcher (e.g. `"PostToolUse → Edit"`) and behaves identically to a source-owned description (auto-updates if event/matcher change, never user-editable). The user does not edit `description`; upstream does.
- **`userNotes`** — user-authored, optional, free-form text. Never touched by re-import, re-pull, sync, or any Ensemble-driven refresh. This is where the user says *why* they keep a resource, how it fits their workflow, or what they've configured around it. `userNotes` is the only place user voice is stored for a resource; the source speaks through `description`.

Display contract: userNotes lead when present; description is secondary context. When userNotes is empty, description takes the primary slot — seamless fallback, no "missing notes" indicator. Both always visible in `ensemble show` (labeled `Notes:` and `Description:`). See §CLI Surface for the `ensemble note` verb, §Desktop App for inline editing, §Search for the 2x userNotes weighting, and §Doctor for the silent-refresh informational finding.

- **Server** — an MCP server definition (name, command, args, env, transport, and optionally url, auth, origin, and tool metadata). Servers are runtime processes that provide tools to AI agents.
- **Skill** — an agent instruction file (SKILL.md with YAML frontmatter: name, description, and optionally dependencies, tags). Skills are static markdown files that teach agents workflows, coding patterns, and domain knowledge.
- **Plugin** — a Claude Code plugin (name, marketplace, scope, enabled state).
- **Agent** — a Claude Code subagent definition. Stored as `.claude/agents/<name>.md` with YAML frontmatter (`name`, `description`, `tools`, optional `model`) followed by the system prompt body. Agents are invokable personalities with scoped tool access; they are distinct from skills (which teach workflows) and from plugins (which ship code). Ensemble manages user-level agents (`~/.claude/agents/`) and project-level agents (`<project>/.claude/agents/`) as first-class resources.
- **Command** — a Claude Code slash command. Stored as `.claude/commands/<name>.md` with YAML frontmatter (`description`, optional `allowed-tools`, optional `argument-hint`) followed by the prompt body. Commands are user-invoked shortcuts; they fan out to `~/.claude/commands/` or `<project>/.claude/commands/`.
- **Hook** — a Claude Code hook entry stored inside `~/.claude/settings.json` (or `<project>/.claude/settings.json`) under the `hooks` key. Hooks fire on lifecycle events: `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`, `PreCompact`, `Stop`, `Notification`. Each hook declares a matcher and a command to run. Because hooks live inside `settings.json` alongside keys Ensemble does not manage, hook sync uses non-destructive merge.
- **Setting** — a Claude Code configuration value in `settings.json` that Ensemble manages declaratively. Examples: `permissions.allow` (tool allowlists), `env` (environment variable defaults), `model` (default model selection), and other top-level keys. Ensemble owns only the specific keys the user explicitly places under management; every other key in `settings.json` is preserved untouched on every write.
- **Marketplace** — a remote source of pullable resources (GitHub repo, registry, or local directory). Marketplaces are discovery-only; they are never owned by the user. `ensemble pull` copies a resource from a marketplace into the library, after which the resource is library-owned. Dynamic marketplace auto-discovery (pattern from plum) is deferred to §Future.
- **Group** — a named collection of any resource type (servers, skills, plugins, agents, commands, hooks). Settings are client-level, not group-level, because they are client-wide configuration rather than installable units.
- **Client** — an AI application that consumes one or more resource types (detected automatically). v2.0 supports 21 clients (see §Supported Clients).
- **Library membership vs. install state** — two orthogonal axes. Library membership is controlled by `pull` / `add` / `remove`. Install state is controlled by `install` / `uninstall`. Uninstalling a resource from every client leaves it in the library (still owned, still browseable); only `ensemble remove` evicts it from the library.

#### Typed Variables (v2.0.5)

Resources and profiles may declare **variables** — named values that flow into a resource's command line, env, hook body, or agent system prompt at sync time. Every variable carries a `kind` that is spec-level metadata about how the value must be treated, independent of how it is stored:

| Kind | Purpose | Masking | Storage expectation |
|------|---------|---------|---------------------|
| `text` | Free-form configuration value | None | Plain string in the library manifest |
| `note` | Long-form commentary or docstring | None | Plain string; UI renders multi-line |
| `api-key` | Credential, shown as an API token | Masked in every surface (UI, logs, exports) except when the user explicitly reveals | `op://` reference expected; plaintext is a DOCTOR warning |
| `password` | Credential, shown as a password | Masked identically to `api-key` | `op://` reference expected; plaintext is a DOCTOR warning |

**Inheritance.** Variables declared at profile level propagate down to every member resource unless the member resource declares a variable of the same name, which overrides. This is root-to-leaf: profile → group → resource. The override rule is purely name-based; `kind` on the override must match the inherited `kind` or the override is rejected at validation time — a resource may not silently weaken a parent-declared secret to `text`.

**Relationship to `op://`.** The existing 1Password-reference convention (Design Principle / Secrets: `op://` stays the canonical secret *reference* in stored env values and command args) is unchanged. `kind` is the orthogonal axis: it declares what the value *is*, so the renderer can mask, the sync engine can enforce 1Password lookup, and the scanner can flag plaintext where a reference was expected. A variable with `kind: "api-key"` whose stored value is a plaintext secret rather than an `op://` reference is a DOCTOR warning; a `kind: "api-key"` whose value is already `op://...` is compliant.

Schemas: `ResourceVariableSchema { name: string, kind: 'text' | 'note' | 'api-key' | 'password', value: string, inheritedFrom?: string }` is added to the Zod schema exports and referenced from `ProfileSchema`, `ServerSchema`, `AgentSchema`, `HookSchema`. Existing variable-like fields (server `env`) gain an optional parallel `varKinds: Record<string, VariableKind>` so existing env maps do not have to be rewritten as variable records; the `kind` layer is purely additive for back-compat. (Pattern from DatafyingTech/Claude-Agent-Team-Manager — `src/types/aui-node.ts NodeVariable`.)

#### Detection Policy (v2.0.4)

Each file-based resource type has a **published detection policy** naming which files register a directory as that resource type and which files are explicitly disqualified. The policy is authoritative for every filesystem scan — `discover.ts` init scan, library bootstrap, reconciliation after edits, and the `import-legacy` one-shot all route through the same policy. This prevents namespace-folder false positives: a directory that *contains* nested skills must not itself register as a skill just because it has a `README.md`.

| Resource type | Canonical marker | Legacy-compatible | Explicitly disqualified |
|---------------|------------------|-------------------|-------------------------|
| **Skill** | `SKILL.md` | `skill.md` | `README.md`, `CLAUDE.md`, any other `*.md` |
| **Agent** (v2.0.1 target) | `.claude/agents/<name>.md` with `name` + `description` frontmatter | — | Markdown without the required frontmatter fields |
| **Command** (v2.0.1 target) | `.claude/commands/<name>.md` with `description` frontmatter | — | Markdown without the required frontmatter fields |
| **Hook** (v2.0.1 target) | Entry under `hooks` key in a `settings.json` Ensemble is authorized to read | — | Any other `settings.json` key; standalone markdown |
| **Setting** (v2.0.1 target) | Top-level key in `settings.json` that the user has placed under Ensemble management via `ensemble settings set` | — | Any key Ensemble has not been told to manage |

Policy invariants: (1) the canonical marker wins when both canonical and legacy markers are present in the same directory; (2) disqualified files never promote a directory to a resource, even if they contain plausible-looking frontmatter; (3) the policy is version-stamped and lives in `src/detection-policy.ts` alongside the scanners — changes to the disqualified list are spec-level and bump a spec-version. (Pattern from xingkongliang/skills-manager — `docs/skill-format-detection-spec.md`, which formalizes exactly this discipline for skills. Ensemble generalizes it to all five file-based resource types so the v2.0.1 target modules inherit a consistent scanner contract from day one.)

- **Sync** — writing the currently-installed state of every library resource to each client's filesystem and config. Sync **projects install state into client configs**; it does **not** touch library membership. The library is authoritative; sync is the downstream projection. Per-resource strategy:
  - **Servers, plugins:** config-entry writes (JSON/TOML) — existing strategy.
  - **Skills, agents, commands:** canonical store + symlink (or file) fan-out to each client's resource directory.
  - **Hooks:** non-destructive merge into `settings.json` under the `hooks` key.
  - **Settings:** non-destructive key-level merge into `settings.json` — Ensemble writes only the keys it manages, preserves everything else.
- **Safe apply / rollback snapshot** — every `ensemble sync` run captures a snapshot of each touched file before writing. Snapshots are stored in `~/.config/ensemble/snapshots/<timestamp>/` and can be restored with `ensemble rollback`. This is richer than additive-sync alone: even additive writes produce a rollback point, so manual overrides, bad registry installs, and accidental overwrites are all recoverable. (Pattern from TARS.)
- **Origin** — provenance metadata tracking where any resource (server, skill, plugin, agent, command, hook, setting) was imported from, when, by what method, and its trust tier.
- **Trust Tier** — classification of registry content: `official` (verified publishers), `community` (unverified registry content), `local` (user-defined). Displayed in search results and `show` output for every resource type.

### Library Bootstrap and Drift Lifecycle (v2.0.2)

The library is **Ensemble's canonical inventory**, stored under `~/.config/ensemble/library/` independent of any client scope. Claude Code never reads this directory; it only sees resources that have been projected into `.claude/` via install state. This separation is what makes `Marketplace → Library → Install` a clean flow: the library can hold 500 resources while only 10 are installed anywhere. Implemented in `src/discovery/library-store.ts`; the canonical store is automatically bootstrapped on first desktop-app launch and is visible in DOCTOR alongside drift/orphan reconciliation counts.

A corollary: the library's contents are **not derived from a scan of `~/.claude`**. That was a v2.0.1 bridge assumption and is now retired. Library entries have their own persistent storage and their own identity; scans of client scopes are reconciliation inputs, not the source of truth.

**Bootstrap is automatic, not ceremonial.** On first run against an empty library, Ensemble scans `~/.claude/` and every known project `.claude/` and creates one library entry per unique resource it finds. Every scanned resource also produces install-state entries for the scopes where it was found. After bootstrap, the library mirrors the user's existing setup and the matrix view lights up immediately — there is no import wizard, no multi-step migration, and no empty-state dead end. A user who has never heard of the library concept opens the app and sees their actual tools already there.

**After bootstrap, scans become reconciliation.** A subsequent scan of a client scope can produce three outcomes per resource found:

| State | Condition | Resolution |
|-------|-----------|------------|
| **Match** | On-disk resource matches a library entry by identity and content hash | No action — install state already reflects reality |
| **Orphan** | On-disk resource has no matching library entry | Surface in DOCTOR as an adoption candidate; one-click adopts it into the library |
| **Drift** | Library entry exists but on-disk copy differs | Surface in DOCTOR with a diff and three actions: keep library version (overwrite on next sync), promote on-disk version into the library (rewrite canonical), or fork into a new library entry |

Orphans are never silently auto-adopted after first run — that is how ghost entries creep in. Drift is never silently overwritten — that is how user edits are lost.

**Library store field cleanup (v2.0.3).** Prior to v2.0.3, the library store index (`src/discovery/library.ts`) used a single polymorphic `description` field that, for plugins, actually held the marketplace reference string (`name@marketplace`) — a holdover from the v2.0.1 bridge scan that conflated identity with human-readable copy. Under the dual-field model this overload is removed: plugin identity moves to a dedicated `marketplaceRef` field, `description` becomes the source-owned human description (auto-populated from the plugin manifest), and `userNotes` becomes the user-authored field. No plugin row loses identity information — the migration splits the old `description` string into the correct two fields based on resource type.

**userNotes are never overwritten by reconciliation.** Any reconciliation outcome — match, orphan adoption, drift resolution, re-pull from marketplace, upstream description refresh — leaves `userNotes` exactly as the user last saved it. The source-owned `description` field is fair game for silent replacement; `userNotes` is not. This is the core contract of the dual-field model: user voice wins when they've spoken, and nothing in the reconciliation pipeline ever touches it. The same invariant holds for `ensemble pull` (re-pulling an existing entry updates `description` and content but preserves `userNotes`) and for `ensemble sync` (install-state projection never reads or writes `userNotes`).

**Ignored resources.** A user who explicitly removes a resource from the library still has the file on disk (because `remove` does not delete unmanaged copies, per additive-sync). Without special handling, the next scan would re-detect the file as an orphan and nag forever. The library manifest therefore tracks an `ignored` list of `name@source` identities dismissed by the user; orphan detection skips anything on that list. Re-adopting an ignored entry is a one-click action in DOCTOR.

**Identity and source.** Library entries are keyed by `name@source`, where source is the marketplace the resource came from (`foo@claude-plugins.dev`, `foo@official-mcp`, `foo@local`). Entries adopted from a bootstrap or orphan scan have source `@discovered` until the user manually links them to a marketplace. DOCTOR surfaces "N entries have no marketplace source — link them?" as an affordance but never forces the link; local-authored resources legitimately have no upstream.

**Wire semantics default to move for ensemble-managed resources.** In the v2.0.1 model, wiring a resource from one scope to another was additive — it created a second copy. This was coherent for plugins (which are just enablement flags) but problematic for MCP servers and file-based resources (skills, agents, commands, styles), where two copies drift over time. Under v2.0.2, the default wire gesture is a move: wiring a managed resource to a new scope unwires it from the source in the same operation. The `WireRequest.mode` field accepts `"move"` (default) or `"copy"`; `"copy"` is the old additive behavior and is reserved for explicit fan-out gestures. Wiring a user-authored (unmanaged) resource degrades gracefully: the target is still written, but the source is left in place (`sourceUnwired: false`) because the ensemble-managed marker is the gate for deletion. Implemented in `src/discovery/wire.ts`.

**Library as a wire source.** v2.0.2 also introduces `{ kind: "library" }` as a third `WireScope` variant alongside `global` and `project`. The library is source-only — wire rejects it as a target — and when used as source, wire reads canonical content from `~/.config/ensemble/library/` (the whole skill directory for skills, the inline server def for MCP servers, the marketplace identity for plugins). This is what makes the library the real source of truth: clicking a matrix cell to install a resource at a project scope copies from the canonical store, not from whatever scope the renderer happened to be looking at.

**DOCTOR grows two new categories.** *Library drift* compares every library entry's canonical content against every wired scope's on-disk copy and reports divergence. *Library orphans* reports scanned resources at any scope that have no matching library entry. Both categories are populated by the reconciliation pass above and are actionable — each row has a one-click resolution. Implemented as the DoctorView in the desktop app (`packages/desktop/src/renderer/src/views/DoctorView.tsx`) with sidebar sections for SUMMARY / LIBRARY / DRIFT / ORPHANS / IGNORED, per-row adopt/promote/ignore/unignore/remove actions, and a `LIB N · K DRIFT · M ORPHANS` status badge in the top chrome.

**When to rescan.** Scans run on first open, on window focus (cheap, catches "edit a file, switch back"), and on explicit refresh. A file-watcher over `~/.claude` and active project `.claude/`s is a future enhancement; the focus-based trigger is sufficient for v1 and avoids the complexity of watching an arbitrary number of project directories.

## Library API

Ensemble is published as `ensemble` on npm. The package exposes multiple entry points so consumers import only what they need.

### Package Exports

> **Target status:** The `agents`, `commands`, `hooks`, `settings`, `snapshots`, and `browse` subpath exports depend on the v2.0.1 target modules of the same name — see §Architecture → Modules (v2.0.1 targets). `package.json`'s `exports` field currently ships only the built subset; the six target subpaths land when their modules do.

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

v2.0 adds five new subpath exports — `agents`, `commands`, `hooks`, `settings`, and `snapshots` — plus the `browse` entry point for the discovery engine powering the CLI and desktop Registry. Each resource type module mirrors `skills.ts`: a canonical-store reader/writer plus frontmatter parsing helpers where relevant.

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

> **Target status:** `AgentSchema`, `CommandSchema`, `HookSchema`, `SettingSchema`, `SnapshotSchema`, `InstallStateSchema`, and `PivotSpecSchema` are v2.0.1 targets — they land with the v2.0.1 target modules (see §Architecture → Modules (v2.0.1 targets)). `schemas.ts` today exports the v1.3 surface plus the dual-field annotation refinement (v2.0.3) on the built schemas.

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

**Dual annotation fields (v2.0.3).** Every library resource schema — `ServerSchema`, `SkillSchema`, `PluginSchema`, `AgentSchema`, `CommandSchema`, `HookSchema`, `SettingSchema` — includes both a `description: string` field (source-owned, required, auto-populated from upstream) and an optional `userNotes: string` field (user-authored, never overwritten by re-import). For hooks, `description` is auto-generated from event + matcher and treated as source-owned for contract purposes. Consumers reading a resource can rely on `description` always being present; `userNotes` is present only if the user has added one.

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
} from 'ensemble/registry';

const results = await searchRegistries('database');            // searches all enabled backends
const detail = await showRegistry('postgres');                 // full server details from registry
const installParams = await resolveInstallParams('postgres');  // ready-to-add server config
```

Registry functions are async (they make network calls). Results include trust tier, quality signals, transport details, and resource type.

Dynamic marketplace auto-discovery (`discoverMarketplaces()`) and unified installed-plus-discoverable fuzzy search (`fuzzySearchAll()`) are deferred to §Future — the patterns are documented but not planned for the current cycle.

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

> **Target status:** The top-level lifecycle verbs below (`pull`, `install`, `uninstall`, `remove`, plus the `library` and `browse` subcommands) are the v2.0.1 CLI surface and remain **unbuilt** — `src/cli/index.ts` still ships the v1.3 per-type group grammar. Today's CLI ships a stopgap v1.3-style surface: `agents`, `commands`, `plugins`, `skills`, and `hook` groups each with `list` / `add` / `remove` / `install` / `uninstall` verbs, plus top-level `rollback` and `rollback --list` (for snapshots). The `settings` group is not yet wired (scenario at `#settings` L1879 pending). The full noun-first lifecycle rewrite lands with chunk 8 of the v2.0.1 plan and the coordinated migration (see §Migration). The verb descriptions below are aspirational — they describe the target surface, not what `ensemble --help` outputs today.

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

ensemble note <ref> "text here"            # set the userNotes field on any library item.
                                           # <ref> forms: server:<name>, skill:<name>,
                                           #   plugin:<name>, agent:<name>, command:<name>,
                                           #   hook:<id>, setting:<key>. Passing an empty
                                           #   string ("") clears the note. The source-owned
                                           #   description field is NOT touched by this verb.
ensemble note <ref> --edit                 # open $EDITOR for longer notes; save & close writes.
ensemble note <ref>                        # no args prints the current userNotes to stdout.

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

ensemble browse [query]                          # plain-text search across installed +
                                                 #   discoverable resources, @marketplace-name
                                                 #   filter syntax; one row per result
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

**Detection policy compliance.** `import-legacy` scans filesystem trees through the §Detection Policy, not naive globs. A directory with `README.md` and nested skills does not register as a skill; a legacy `skill.md` still imports correctly; agent/command frontmatter without the required fields is reported as "file present but not a recognizable resource" rather than silently imported. The one-shot translator is the first real exercise of the detection policy, and getting it right during import is cheaper than reconciling namespace-folder false positives after the fact. (Pattern from xingkongliang/skills-manager.)

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
6. Everything else on the v2.0.1 track: `sync.ts` rewrite for the library → install-state projection, `settings.ts`, `snapshots.ts`, the remaining resource types (agents, commands, hooks), the 4 new clients, `browse.ts`, and the desktop pivot-based IA rewrite.

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

#### Matrix View (v2.0.2 — implemented; reframed v2.1.0)

The **Matrix** is a top-level view alongside the pivots, not a pivot itself. It answers a single question that the row-oriented pivots cannot: *where is everything running, all at once?*

**Primary axis (v2.1.0): project × Claude Code resource types.** The matrix's rows are library resources; the columns are Claude Code installation scopes — `GLOBAL` user scope plus every active project. This is the load-bearing view because Ensemble is Claude-Code-first: the primary question the user asks is "what of my tooling is wired into which of my Claude Code projects?" Each cell is a direct wire toggle — filled means installed at that scope, empty means available but not installed, hatched means read-only (hooks). Per §Experience POV / Pillar 1, projects are the primary axis and Claude Code is the assumed target.

**Secondary axis (v2.1.0): multi-client mirroring for MCPs and skills only.** A modifier (toggle in the matrix chrome, or filter chip) reveals a per-row "mirror to other clients" sub-row, visible **only for MCPs and skills** — the two resource types with the already-shipped multi-client cross-fan-out surface. Detected additional clients appear as mirror targets with checkboxes; undetected clients render dimmed with a "not detected" hint rather than hidden. For plugins, agents, commands, hooks, and settings the mirror sub-row is **never** shown because those types are Claude-Code-only (see §Experience POV / Type-aware install destinations). Toggling a mirror checkbox on an MCP or skill row schedules the mirror write as a pending change in the staged-changes set rather than writing immediately (see §Experience POV / Pillar 1 / edits stage as pending).

Structural behavior:

- **Default filter: wired-anywhere.** With a 500-resource library, an unfiltered grid would be unreadable. The matrix defaults to showing only rows that have at least one filled cell in the primary (project × CC) axis. A type filter (servers / skills / agents / …) and a project-status filter (active / archived / unregistered / all) narrow further. A modifier reveals the full library for fan-out planning.
- **Sticky axes.** The first column (resource label + origin glyph) is sticky-left; the header row (project name) is sticky-top. Scrolling a dense matrix never loses context.
- **Row hover dims non-matching rows** — a lightweight stand-in for literal patch-bay cables that highlights one resource's coverage across scopes without SVG overhead.
- **Cell interactions:** single click toggles wire, shift-click is "move here" (unwire from any other scope in the same row, wire to the clicked cell — matches the wire-as-move default for managed resources), long-press opens the resource detail.
- **Legend strip.** A persistent footer row explains WIRED / UNWIRED / READ-ONLY / MANAGED / MIRRORED glyphs so the visual vocabulary is always at hand.

The matrix is not a replacement for the Library pivot — it is complementary. Library pivot is where you browse, search, and manage the shelf; Matrix is where you see and change activation. Both read from the same canonical library, so edits in either view are instantly reflected in the other.

**Installation states (v2.0.5).** A matrix cell answers not just "is this resource installed here?" but "*how* is it installed?" — because some clients read another client's resource directory rather than having their own. Modeling this as a first-class state prevents two failure modes Ensemble has previously stumbled into: (a) silently treating the reading client as the owner of the skill (so sync writes to its dir, clobbering nothing there because nothing was there to begin with), and (b) showing a phantom duplicate row in the matrix for a skill that actually lives once on disk. The cell vocabulary:

| State | Meaning | Matrix cell |
|-------|---------|-------------|
| `direct` | Managed copy (or symlink) living in this client's own resource directory | Filled glyph; writable toggle |
| `inherited` | This client reads another client's resource directory and sees the resource there; Ensemble does not own a copy here | Label-only glyph (`inherited-from: <source-client>`); read-only toggle |
| `drift` | `direct` installation whose on-disk content hash (§Drift Detection) diverges from the library's canonical version | Filled glyph with drift badge; click opens drift resolver |
| `orphan` | On-disk copy with `__ensemble` marker (or matching canonical content) but no library entry; adoption candidate | Hatched glyph; click opens adopt-into-library action |
| `ignored` | User has explicitly removed the resource from the library but the file still exists on disk (per additive-sync); suppressed from orphan nagging | Faint glyph; click opens restore/forget menu |

Client definitions declare when they inherit from another client (e.g., an entry in `clients.ts` saying "this client reads `~/.claude/skills/` by default"). Inherited state is derived at scan time, not configured per-resource — the matrix infers `inherited` for any cell whose resource is resolved through another client's directory rather than the current client's own directory. (Pattern from crossoverJie/SkillDeck — `docs/AGENT-CROSS-DIRECTORY-GUIDE.md` + `Models/SkillInstallation.swift`.)

**Under v2.0.2 the matrix reads its rows from the canonical library store**, not from a live scan of `~/.claude/`. Each `LibraryEntry` is projected into a `DiscoveredTool` with `scope: { kind: "library" }` so that clicking a cell wires from the canonical store to the target scope. The cells still reflect on-disk wire state (via `scanLibraryGlobal` and per-project scans) so the matrix answers both "what's in my library?" (rows) and "where is it actually installed?" (cells) in one view. Project columns default-filter to active-status scopes from the project registry plus `GLOBAL`, with toggles for archived / unregistered / all.

**Patch Bay** (the side-by-side Library + Projects split that shipped as stage 2 of the desktop app) remains as a drill-down alternative to the matrix. The v2.0.1 `patch` tab is retained — the Library pivot described above subsumes its browse role but the split view is still useful for focused per-tool or per-project inspection.

### Visual Extras

Features that go beyond CLI parity — interactions that only make sense in a GUI:

- **Drag-and-drop group assignment** — Drag any resource (server, skill, plugin, agent, command, hook) onto groups. Visual feedback shows current membership.
- **Visual drift detection** — Side-by-side diff showing what changed manually in client configs vs. what Ensemble expects. Overwrite, adopt, or rollback actions inline.
- **Interactive dependency graph** (stretch) — Visualize skill/agent-to-server dependencies as a directed graph. Highlight missing dependencies. Not yet implemented.
- **Registry cards and slim rows** — Rich Card view for registry search results showing trust tier, quality signals, tool count, and one-click install. Slim view toggle collapses each result to a one-line row for dense browsing. Both views apply to installed-resource lists as well. (Pattern from plum.)
- **Unified fuzzy search bar** — A single search field at the top of every resource list searches both installed and discoverable items simultaneously, with `@marketplace-name` filter chips parsed from the query. Results include an "installed" badge and a one-click install button for discoverable entries. (Pattern from plum.)
- **Rollback affordances** — After every sync, a persistent "Undo last sync" button surfaces the latest snapshot. A dedicated Snapshots section provides deeper history with per-file restore granularity. (Pattern from TARS.)

### IPC Architecture

> **Target status:** The sub-router inventory below includes routers that ride with the remaining v2.0.1 target modules — `agents`, `commands`, `hooks`, `settings`, and `browse` — see §Architecture → Modules (v2.0.1 targets). Today's `appRouter` ships the subset tied to built modules; the target sub-routers land when their backing modules do.

The desktop app follows the portfolio's Electron scaffold: an end-to-end type-safe bridge between the React renderer and the Ensemble library, with full Electron sandboxing.

1. **Main process** — Imports the Ensemble library directly (`import { loadConfig, saveConfig } from 'ensemble'`). Exposes every operation as a **tRPC procedure** on a single `appRouter`, organized into namespaced sub-routers (config, servers, groups, projects, library, clients, sync, plugins, marketplaces, skills, rules, profiles, collisions, search, doctor, notes, snapshots). Every procedure validates its input with a Zod schema and returns a typed result. `electron-trpc`'s `createIPCHandler` wires the router to the main window.
2. **Preload script** — Minimal: a single call to `exposeElectronTRPC()` from `electron-trpc/main`. The preload script is intentionally tiny and never contains business logic — it exists only to establish the tRPC bridge under `contextIsolation: true`.
3. **Renderer process** — React components consume the typed tRPC client via `@trpc/react-query` hooks (`trpc.servers.add.useMutation()`, `trpc.doctor.run.useQuery()`, etc.). The renderer never uses `ipcRenderer` directly and never sees a `window.ensemble` global — all calls go through the tRPC client, which inherits its types from `AppRouter` at compile time.

**Security posture.** The renderer runs with `sandbox: true` (enforced via `app.enableSandbox()`), `contextIsolation: true`, `nodeIntegration: false`, and `webSecurity: true`. A strict CSP header is set on every response **in production builds** (`default-src 'self'`); CSP is intentionally disabled in dev so Vite's HMR runtime can inject inline/eval scripts, while the rest of the sandbox guards stay on. Navigation to external URLs is blocked in both modes, and new-window creation is denied (external links open in the default browser via `shell.openExternal`). The `electron-security-check.sh` hook blocks edits that violate these rules.

**Wire format.** Procedures are serialized with [`superjson`](https://github.com/flightcontrolhq/superjson) on both ends so rich types (Dates, Maps, Sets, undefined, BigInt) survive the IPC boundary. The transformer is registered on `initTRPC.create({ transformer: superjson })` in the main process and on `trpc.createClient({ transformer: superjson, links: [ipcLink()] })` in the renderer.

**Testability.** Because procedures are defined on a plain tRPC router, contract tests call them directly via `appRouter.createCaller({})` in Vitest — no Electron runtime needed. E2E tests use Playwright's Electron support against the built app.

This architecture means the renderer has no direct filesystem or Node.js access — all operations go through tRPC procedures in the main process, which call the Ensemble library. The tRPC layer provides type safety, Zod input validation, and testability for free.

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
| `description` | yes | **Source-owned.** One-line description auto-populated from the registry response at install time and silently refreshed on re-pull. Not user-editable. |
| `userNotes` | no | **User-authored.** Free-form note explaining why the user keeps this server, configuration context, or workflow rationale. Never overwritten by re-import. Edited via `ensemble note server:<name>` or inline in the desktop app. |

**Origin tracking.** The optional `origin` object records where a server came from: `source` (one of `"import"`, `"registry"`, `"manual"`), `client` (for imports — which client it was imported from), `registry_id` (for registry installs — the registry identifier), and `timestamp` (ISO 8601). Origin data enriches `doctor` output and drift messages — e.g., "Server 'postgres' (imported from Cursor on 2026-03-01) has drifted."

**Tool metadata.** The optional `tools` array stores tool definitions fetched from the registry at install time. Each entry has `name` and `description`. This avoids discarding metadata after `registry show` output and enables local capability search via `ensemble search`. Tools are populated automatically on `registry add` and can be refreshed with `registry show --update-tools`.

### Skill Model Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique skill identifier (matches directory name in canonical store) |
| `enabled` | yes | Whether the skill is active |
| `description` | yes | **Source-owned.** One-line description from SKILL.md frontmatter. Refreshed on every re-pull of the skill. Not user-editable via `ensemble note`; editing the SKILL.md frontmatter directly is the only way to change it. |
| `userNotes` | no | **User-authored.** Free-form note that lives alongside the skill in the library manifest (not in SKILL.md). Never overwritten by re-pull or frontmatter changes. Edited via `ensemble note skill:<name>` or inline in the desktop app. |
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

#### Plugin Model Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique plugin name |
| `marketplace` | yes | Marketplace identifier (`name@marketplace` forms the full plugin id) |
| `enabled` | yes | Whether the plugin is active in `enabledPlugins` |
| `managed` | yes | `true` if installed via Ensemble, `false` if adopted from existing installation |
| `description` | yes | **Source-owned.** One-line description auto-populated from the marketplace manifest (`plugin.json`) at install time and refreshed on re-pull. Not user-editable. |
| `userNotes` | no | **User-authored.** Free-form note stored in Ensemble's plugin registry (never in the marketplace manifest). Never overwritten by re-pull or marketplace updates. Edited via `ensemble note plugin:<name>`. |
| `origin` | no | Provenance metadata (source marketplace, timestamp, trust tier) |

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

### Type-aware install destinations (v2.1.0)

Every install dialog (desktop Explore surface, `ensemble install`, registry cards, bulk-install actions) branches on the resource type being installed, per §Experience POV → Type-aware install destinations:

- **MCP servers and skills** — install dialog shows an **"Install to:"** block listing detected clients as checkboxes, with Claude Code pre-selected. Undetected clients appear dimmed with a "not detected" hint, not hidden. The user can pick any subset; the multi-client fan-out is the already-shipped narrower offering for these two types. (The existing v2.0 fan-out semantics — symlink default with per-client sync-mode exceptions — apply to the selected set; see §Sync and §Per-Client Sync Mode Table.)
- **Plugins, agents, commands, hooks, settings** — install dialog shows a **"Scope:"** block with `Global (~/.claude/)` vs. `Project` (selected from the active project list) toggle, and no client picker at all. These five types install to Claude Code only under v2.1.0's depth-first stance; other clients expand type-by-type after the Claude Code surface is complete. A plugin install dialog never gestures at "also install to Cursor" because nothing ships behind that gesture; per §Experience POV / Rejected anti-patterns, the app does not gesture at capabilities it cannot deliver.

This rule applies uniformly to every install surface — registry search results, Explore card confirmations, bulk-install from a profile import, `ensemble groups install`, and the desktop matrix's add-resource flow. Registry adapters do not vary the rule; type is the gate. When a marketplace returns a mixed bundle (e.g. a profile containing MCPs, plugins, and agents), the import dialog applies the rule per-item: the MCPs get an "Install to:" block, the plugins/agents get a "Scope:" block, rendered as a single staged set with one Apply (see §Experience POV / Pillar 1 / edits stage as pending changes).

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

**userNotes travel with exports by default (v2.0.3).** When a group is exported, every resource's `userNotes` is included in the generated plugin manifest alongside its source-owned `description`. This is the default because userNotes are frequently the *reason* a group was curated — the rationale for keeping specific servers together, the configuration hints, the "use this instead of X" annotations — and stripping them on export loses the curation story. For export scenarios that need sanitization (sharing a profile publicly, redacting personal commentary), `ensemble groups export <group> --as-plugin --strip-notes` emits the same plugin with every `userNotes` field removed. The desktop export dialog exposes this as an "Include personal notes" checkbox, checked by default.

**Secret redaction at the serialization boundary (v2.0.5).** Every variable whose `kind` is `api-key` or `password` (see §Resource Types → Typed Variables) is redacted by the *serializer*, not the UI. A single `redactForExport(node)` helper applies uniformly to every outbound path: `ensemble groups export --as-plugin`, telemetry payloads, any future remote-sync pathway. The helper walks the record, finds every field whose declared `kind` is a secret kind, and replaces the value with a neutral placeholder (`"<redacted: api-key>"`) while preserving the variable's name, kind, and inheritance metadata so the recipient knows *that* a secret exists without seeing it. This is load-bearing in two ways:

1. The UI never has to know which fields are sensitive — it reads from the library manifest, which keeps `op://` references or plaintext values intact. Redaction happens only at serialization.
2. The guarantee is testable in isolation: a single `redactForExport` unit test suite covers every export pathway at once, so adding a new export surface (e.g., future remote-sync) inherits the redaction guarantee for free.

This is **not user-toggleable**. Unlike `--strip-notes` (which defaults on but can be opted out), secret redaction is unconditional: there is no `--include-secrets` flag, because the stored form is `op://` references and exporting those still leaks the tenancy structure of the user's 1Password vault. The exported plugin's recipient must supply their own credential values through normal variable-binding flow after import. (Pattern from DatafyingTech/Claude-Agent-Team-Manager — `src/types/remote.ts redactNode` + `remote-sync.ts`.)

#### Profiles as Live Scope (v2.0.4)

Export-as-plugin treats a profile as a *one-shot bundle*: capture the group, ship the plugin, be done. v2.0.4 introduces a second, complementary stance — profiles as **switchable live state**. The two stances share the same underlying group definition but answer different questions:

- **Exported profile** — "distribute this curated bundle." Static snapshot, consumed by someone else's machine, no switching semantics.
- **Active profile** — "this is the set of resources I am currently running, switchable atomically." The user names a working mode (e.g. `review`, `debug`, `ship`), and switching to it unsyncs the previous active profile's installed artifacts and syncs the new profile's artifacts in a single reconciliation pass against the declared state. At most one profile is active per client at a time; "no active profile" is the fallback state that leaves prior install state in place.

The same group definition can be exported as a plugin *and* activated as live scope — the two modes are orthogonal.

**Per-(profile, artifact, client) enabled-tool matrix.** Within an active profile, each `(profile, artifact, client)` triple carries an optional **enabled-tool set** — a list of tool names that are allowed to activate for this artifact under this profile on this client. The same skill can be active under profile A for Cursor and Claude Code, under profile B only for Claude Code with a narrower tool subset, and absent from profile C entirely. The enabled-tool set is persisted on the profile, not on the artifact — flipping profiles re-projects the tool matrix without mutating the library.

**Switch UX.** The desktop app exposes a menubar/tray scenario switcher as the primary activation surface; the CLI exposes `ensemble profile activate <name>` and `ensemble profile deactivate` as scripting equivalents. Switching is atomic from the user's perspective — either the full reconcile succeeds and the new profile is active, or the previous active profile remains in place and the failure is surfaced via DOCTOR. Rollback snapshots (§Safe Apply and Rollback Snapshots) cover profile activation just like any other sync.

**Relationship to install state.** Active profiles operate *through* the existing install-state matrix, not around it. Activating a profile is shorthand for "install this profile's (artifact, client) pairs with this enabled-tool set, and uninstall the previously-active profile's pairs that are not in the new set." Library membership is still untouched — only install state and the per-(profile, client) enabled-tool projection move. (Pattern from xingkongliang/skills-manager — `src-tauri/src/commands/scenarios.rs`.)

**Profile as composable unit (v2.0.5).** A profile is not just a group of artifacts plus an enabled-tool matrix — it is a self-contained record that also carries its own **variables** and an optional **launchPrompt**, persisted as one record that survives export and import intact:

- `assignedResources` — the existing mixed-type member list (servers, skills, plugins, agents, commands, hooks, settings) already defined by §Profile-as-Plugin.
- `variables` — profile-scoped typed variables (see §Resource Types → Typed Variables). Variables declared here propagate by inheritance to every member resource, which makes the "agent team" case natural: a subagent depends on a skill, the skill needs an API key, the API key is declared once on the profile and inherited by both.
- `launchPrompt` — optional initial prompt text bundled with the profile. On activation, the desktop app exposes it as a one-click "start session with this profile" affordance; CLI consumers can read it via `ensemble profile show <name> --launch-prompt`. Libraries of curated agent teams often ship with an opinionated opening prompt; carrying it on the profile means exporting the profile exports the prompt too.

The subagent-team case becomes a specific instantiation of this general shape: `profile = { agents, dependent_skills, shared_variables, launchPrompt }`. Exporting the profile (§Profile-as-Plugin Packaging) emits one plugin that contains the agents, their skill dependencies, their shared variables (with secret-kinded values redacted at the serialization boundary — see §Registry / Export), and their launchPrompt. Importing it on another machine gives the recipient a working team with the same inheritance edges and the same launch behavior. This extends — does not replace — the v2.0.4 "Profiles as Live Scope" and v2.0.3 export semantics; `variables` and `launchPrompt` are additive fields on the existing `ProfileSchema`. (Pattern from DatafyingTech/Claude-Agent-Team-Manager — `src/types/aui-node.ts NodeKind group` + `USAGE.md`.)

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
- **Fan-out skips `inherited` targets (v2.0.5).** When a client's effective resource directory is another client's directory (see §Matrix View → Installation states), sync must not write into that directory on the inheriting client's behalf — doing so would clobber the source client's store from under it. The inheritance relationship is declared by the `ClientDef` in `src/clients.ts`. Sync visits inheriting clients for bookkeeping (its install state remains `inherited` against the source client's cell) but emits zero filesystem writes. DOCTOR surfaces an informational line on the first sync that encounters an inherited target, so the user understands why nothing was written.

`ensemble sync --dry-run` shows a per-resource-type change preview. File-level resources (skills, agents, commands) show file operations (create symlink, update, remove). Merge-based resources (hooks, settings) show a key-level JSON diff.

#### Per-Client Sync Mode Table (v2.0.4)

For file-based resource types (skills, agents, commands), the default fan-out mechanism is **symlink** from the canonical store into each client's resource directory. Symlinks are cheap, drift-resistant (editing a symlinked file edits the canonical copy), and keep the canonical store as the single source of truth. But some clients and some platforms do not tolerate symlinks reliably, so Ensemble maintains an **exception table** and a **user-configurable override** per client.

**Default:** symlink. **Exceptions** (baked into each `ClientDef`):

| Client / Platform | Default mode | Reason |
|-------------------|--------------|--------|
| Cursor | `copy` | Cursor's resource-loader dereferences symlinks unreliably across versions; symlinked skills intermittently fail to load. Copy is the safe default until the loader stabilizes. |
| Windows (any client) | `copy` | Windows symlink creation requires elevated privileges or Developer Mode; automatic downgrade from symlink to copy preserves POSIX-shaped configs on Windows hosts. |
| All other clients | `symlink` | Default. |

**User override.** Each client in the user's config accepts an optional `sync_mode: "symlink" | "copy"` field that overrides the per-client default. Setting `sync_mode: "copy"` on a symlink-default client forces copies (useful for sandboxes or network-mount edge cases); setting `sync_mode: "symlink"` on an exception client is allowed but surfaces a DOCTOR warning recording that the user has overridden a known-bad default.

**Copy-mode drift.** When a client is in copy mode, the artifact-level content hash (see §Drift Detection) is the primary way Ensemble knows a copied deployment has fallen out of sync with the canonical store. Symlink-mode drift can only come from the canonical store itself being edited; copy-mode drift is the common case and DOCTOR surfaces it accordingly.

The exception list is deliberately short here — the spec-level statement is "symlink with documented per-client exceptions, Windows auto-downgrades, user-overridable." The full per-client exception list lives in `src/clients.ts` alongside the client definitions, so new clients can ship their sync-mode default without amending this section every time. (Pattern from xingkongliang/skills-manager — `src-tauri/src/core/sync_engine.rs`.)

### Safe Apply and Rollback Snapshots

Every `ensemble sync` run produces a rollback-capable snapshot before writing. The snapshot captures the pre-sync contents of every file Ensemble is about to touch (client configs, settings.json files, agents/commands/hooks directories) into `~/.config/ensemble/snapshots/<iso-timestamp>/` along with a manifest describing the operation. This is richer than additive-sync alone:

- **Additive sync** protects the user's _unmanaged_ entries from deletion.
- **Rollback snapshots** additionally protect the user's _managed_ entries from mistakes — bad registry installs, accidental group assignment, config rewrites from `--force`, and any other operation that produces an undesired outcome.

After sync, `ensemble rollback --latest` restores the most recent snapshot. `ensemble rollback <id>` restores an arbitrary snapshot. `ensemble snapshots list` and `ensemble snapshots show <id>` inspect history. Snapshots older than `settings.snapshot_retention_days` (default 30) are pruned automatically on each sync.

Snapshot creation is synchronous and blocking — `sync` waits for the snapshot to be written and fsync'd before touching any client file. This makes rollback reliable even if the sync itself crashes midway. (Pattern from TARS's "safe apply/rollback operations.")

#### Atomic Write Primitive (v2.0.5)

Every managed-resource writer follows a single cheap-but-load-bearing sequence: **write to `<path>.tmp` → Zod `safeParse` the serialized content → atomic `rename(tmp, path)` only on successful validation → on any failure, unlink the tmp file and throw.** This is the half of the safe-apply story that costs nothing and needs no snapshot infrastructure: it prevents partial or corrupt writes from ever reaching the target path, so a crashed process or a serialization bug can never leave a client config half-written. It complements the snapshot-and-rollback pathway (§Safe Apply and Rollback Snapshots) rather than replacing it — snapshots protect against bad *successful* writes; the atomic primitive protects against bad *in-progress* writes.

Writer contract:
1. Serialize the target state (JSON, TOML, markdown-with-frontmatter, etc.).
2. Run the matching Zod schema's `safeParse` against the serialized content — the shape that will hit disk is the shape that was validated.
3. Write the serialized bytes to `<path>.tmp` in the same directory as `<path>` (same filesystem, so rename is atomic).
4. `fs.rename(tmp, path)` — POSIX-atomic on the same filesystem.
5. On any earlier step throwing, best-effort unlink `<path>.tmp` and rethrow; the original `<path>` is untouched.

Every writer applies this pattern: `sync.ts` (client config writes), `skills.ts` (canonical SKILL.md writes), and the v2.0.1 target writers `agents.ts`, `commands.ts`, `hooks.ts`, `settings.ts` inherit it from day one. The primitive lives in a shared helper (`src/io/atomic-write.ts`) so no writer hand-rolls the sequence. Hook/setting merges still run non-destructive key-level merge *before* entering this sequence — the merged object is what gets validated and written atomically. (Pattern from DatafyingTech/Claude-Agent-Team-Manager — `src/services/file-writer.ts`.)

#### Snapshot Tags and Forward-Restore Semantics (v2.0.4)

Snapshot identity and restore semantics are designed so that restoring a snapshot never destroys newer state. Two invariants make this concrete:

**Tag naming.** Every successful safe-apply emits a timestamped tag of the form `ens-snap-YYYYMMDD-HHMMSS-<shortsha>`, where `<shortsha>` is the first 7 chars of the SHA-256 digest of the snapshot manifest. Tags are immutable once written, monotonically ordered by timestamp, and persisted in `~/.config/ensemble/snapshots/<tag>/`. `ensemble snapshots list` shows tags in reverse-chronological order; `ensemble rollback --latest` resolves to the highest-timestamp tag; `ensemble rollback <tag>` addresses a specific snapshot.

**Forward-restore.** Restoring a snapshot is **additive, not destructive**. `ensemble rollback <tag>` produces a *new* snapshot whose manifest includes the line `restored from <tag>` and whose contents are the restored file state. The newer state that existed immediately before the rollback is preserved in its own snapshot tag (captured just like any other safe-apply) — it is not overwritten, dropped, or orphaned. Walking the snapshot history therefore reads as a linear provenance chain: every state the filesystem has been in is still addressable, and "rollback" is just another forward step that happens to reproduce an earlier state.

This closes the classic rollback footgun where `git reset --hard`-style restore destroys anything committed after the target. Under forward-restore, the user can always roll forward again from the restored state, or roll back further, without ever losing intermediate work. Rollback retention (§Safe Apply and Rollback Snapshots) prunes tags by age, not by position on a branch, so linear provenance survives across the retention window. (Pattern from xingkongliang/skills-manager — `src-tauri/src/core/git_backup.rs`.)

### Drift Detection

On each sync, Ensemble computes a content hash (SHA-256) of every managed server/plugin config it writes. These hashes are stored in the central config alongside the `last_synced` timestamp. On the next sync, before writing, Ensemble re-reads the client config and hashes the current state of each managed entry. If a hash differs from what Ensemble last wrote, the entry was modified outside Ensemble.

**Artifact-level content hash (v2.0.4).** For file-based resources (skills, agents, commands) whose sync unit is a directory rather than a JSON entry, drift detection uses a **stable artifact hash**: SHA-256 computed over the sorted list of relative paths, each file's byte contents, and each file's Unix exec bit, with `.git/`, `.DS_Store`, `Thumbs.db`, and `.gitignore` excluded. Sorting the path list and including the exec bit makes the hash reproducible across platforms and filesystems. The hash is persisted per managed library entry in the canonical store alongside the resource's canonical content. On each sync, before fan-out, Ensemble recomputes the hash of each deployed copy and compares it against the stored source-of-truth hash. The question *"is the deployed copy still identical to the library's canonical version?"* becomes a deterministic boolean rather than a field-by-field heuristic.

This complements — not replaces — the `lastDescriptionHash` used to detect silent description refreshes (§Doctor: "Upstream descriptions refreshed"). Description hashes track a single field that upstream may refresh silently; artifact hashes track the full deployed footprint. Both surface through DOCTOR, but at different severities: description refresh is informational, artifact drift is a warning with a one-click resolution. (Pattern from xingkongliang/skills-manager — `src-tauri/src/core/content_hash.rs`.)

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
- **Capability** — capability-driven integration surfaces (e.g. capabilities declared by setlist-integrated projects that lack a matching managed server in Ensemble) are surfaced as actionable findings rather than hidden gaps

The aggregate score (`earnedPoints / maxPoints` across all checks) gives a single health percentage. `ensemble doctor --json` outputs the full structured results for scripting and dashboards.

### Checks

| Check | Category | Severity | What it detects |
|-------|----------|----------|-----------------|
| Missing env vars | existence | error | Server env references an `op://` or variable that isn't set |
| Orphaned entries | existence | warning | Server/skill in a client config/directory with `__ensemble` marker but not in central registry |
| Stale configs | freshness | warning | Client hasn't been synced since a server/skill was added/modified |
| Config parse errors | existence | error | Client config file exists but contains invalid JSON/TOML |
| Drift detected | freshness | warning | Managed entry was modified outside Ensemble (includes origin context when available). For file-based resources (skills, agents, commands), drift is decided by the v2.0.4 artifact-level content hash — a SHA-256 over sorted relative paths + byte contents + Unix exec bit, with `.git/`, `.DS_Store`, `Thumbs.db`, `.gitignore` excluded — so the check is a deterministic boolean rather than a field-by-field heuristic. For config-entry resources (servers, plugins), the existing entry-level hash applies. |
| Unreachable binary | grounding | warning | Server command binary not found on `$PATH` |
| Missing tool metadata | grounding | info | Server installed from registry but has no cached tools (suggest `registry show --update-tools`) |
| Broken skill symlink | grounding | error | Skill symlink in client directory points to missing canonical file |
| Unresolved skill deps | grounding | info | Skill declares server dependencies that are not in the registry |
| Tracked item drift | freshness | info | Tracked server/skill has diverged from upstream source |
| Upstream drift (v2.0.5) | freshness | warning | Managed artifact's stored `upstreamTreeHash` differs from the remote source's current tree hash. Finding payload includes a `compareUrl` when the source is a GitHub repo (`https://github.com/<owner>/<repo>/compare/<oldSha>...<branch>`) so the user sees the exact upstream diff before pulling. Extends v2.0.4's local artifact-level drift check (local copy vs. library canonical) outward to "upstream has moved since we pulled." |
| Upstream descriptions refreshed | freshness | info | One or more library items had their source-owned `description` field silently updated from upstream since the last run. Reports `"N items had their descriptions updated from upstream since last sync"`; `ensemble doctor --show descriptions-refreshed` lists them with before/after. `userNotes` are never involved. Low-severity, informational only — no action required. |
| Cross-client parity | parity | warning | Clients with the same group assignment have different effective configs |
| Orphan snapshots | capability | info | Snapshot manifests pointing at library entries that have since been deleted. Pruning candidates — reported with snapshot id, timestamp, and the dangling reference(s). |
| Snapshot dir size | capability | warning | `~/.config/ensemble/snapshots/` exceeds the configured byte ceiling (default 500 MB, set via `settings.snapshot_dir_size_warn_mb`). Fires before the retention window catches up to a runaway rate of snapshot growth. |
| Agents/commands drift | freshness | warning | Library entry for an agent or command differs from its fan-out copy on disk (same content-hash strategy as server/skill drift). Extends v2.0.4's artifact-level drift check to the two new file-based resource types added in chunks 4–5. |
| Retention-config visibility | capability | info | Surfaces the active snapshot retention policy (days + size threshold) in the doctor settings summary so the user can inspect current policy without grepping `config.json`. |

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

**Upstream-hash query (v2.0.5).** Adapters SHOULD expose an optional `upstreamHash(id) → { treeHash: string, compareUrlTemplate?: string } | null` method when the underlying source can answer "what is the current upstream content hash?" For GitHub-backed sources (the common case for plugin marketplaces and skill repos), this is the default branch's tree SHA; the adapter also returns a compare-URL template so DOCTOR can substitute in the user's stored `upstreamTreeHash` to produce a direct GitHub compare link. Adapters that cannot answer cheaply (flat registries without a repo concept) return `null`, which means the §Doctor "Upstream drift" check skips them silently. Ensemble caches the upstream hash per managed artifact with the same TTL as registry metadata (§Metadata Caching) so the check is cheap on repeated runs. (Pattern from crossoverJie/SkillDeck — `Services/UpdateChecker.swift` + `CommitHashCache.swift`.)

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

`registry show --update-tools <name>` refreshes the cached tool metadata for an already-installed server from its source registry. Under the v2.0.3 dual-field model, this refresh also silently updates the server's source-owned `description` field from the latest registry response. The companion `userNotes` field — a property of the library entry, not the registry response — is never touched by any `--update-tools` run. Metadata caching is concerned only with source-owned metadata; user-authored annotation lives in a separate layer of the library manifest and never rides the registry cache.

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

**Relationship to typed variables (v2.0.5).** `op://` remains the canonical stored form for secret values — the regex scanner above targets *plaintext* secrets that should have been `op://` references. The v2.0.5 `kind: "api-key" | "password"` declaration (see §Resource Types → Typed Variables) is the orthogonal schema-level signal: it tells the renderer to mask, the sync engine to enforce lookup, and DOCTOR to warn when a secret-kinded variable's value is plaintext rather than `op://...`. Regex scanning still catches plaintext leaks in fields that predate the `kind` model (server `env` maps, skill content bodies); the `kind` channel catches leaks in new variable records by declaration rather than by pattern match. Both pathways route into `ensemble doctor` and share the `SecretViolation` shape.

### Local Capability Search

`ensemble search <query>` searches across every library resource type — servers, skills, plugins, agents, commands, hooks, settings — by capability, matching against names, descriptions, userNotes, and type-specific fields (tool names/descriptions for servers, tags for skills, frontmatter for agents/commands, event+matcher for hooks). This is a local search (no network calls) using BM25 term frequency scoring over stored metadata, enhanced with query alias expansion, multi-signal quality scoring, and optional usage-based learning.

**userNotes weighted 2x.** In BM25 scoring, matches against a resource's `userNotes` field count twice as heavily as matches against its source-owned `description`. The rationale: userNotes are intentional, user-authored signal — exactly the language a user will type when searching for their own resources later. Descriptions are generic upstream copy. A match in both fields sums; a match in only userNotes still outranks a same-term match in only description. This weighting is fixed (not configurable) and applies uniformly across all resource types.

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
- **Fuzzy matching:** fuzzysort (pure-function library primitive used by `browse.ts`, CLI, and desktop Registry)
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
- **Standalone GUI framework** — The desktop app uses Electron + React. Ensemble does not implement a custom UI framework. Chorus remains a separate app consumer that imports Ensemble as a library dependency.

## Architecture

Core logic is organized into four layers: data model, operations, sync engine, and presentation. The CLI and desktop app are both thin presentation layers over a shared operations + sync + config core. App consumers (like Chorus) import the same operations and sync modules directly. All mutations (install, uninstall, enable, disable, assign, scope, etc.) live in the operations layer, never in presentation code. All operations are pure functions: `(config, params) → { config, result }` — they never perform I/O directly.

The project is structured as a monorepo with npm workspaces. The library and CLI remain at the root; the desktop app lives in `packages/desktop/`.

The library and discovery subsystems deserve a brief note. `src/discovery/` is a recent subsystem (four files, ~59k) that owns the canonical library store at `~/.config/ensemble/library/`, the filesystem scan that populates it from existing `.claude/` state, the wire operations that copy discovered tools into target scopes, and cross-client project scanning. Note the naming collision: `src/discovery/projects.ts` (discovery-scope project scanning across installed AI clients) is distinct from `src/projects.ts` (the project-registry SQLite reader).

```
ensemble/
├── src/                              # Library + CLI (root package)
│   ├── schemas.ts                    # Zod schemas, TypeScript types (via z.infer), constants
│   ├── config.ts                     # loadConfig/saveConfig (atomic writes), query helpers, resolution helpers
│   ├── clients.ts                    # Client definitions (17 clients), detection, format adapters
│   ├── operations.ts                 # Pure business logic (addServer, removeServer, enable, disable, assign, scope, etc.)
│   ├── projects.ts                   # Project registry reader (better-sqlite3)
│   ├── sync.ts                       # Sync engine — write configs per client, symlink fan-out
│   ├── skills.ts                     # Skill store — SKILL.md I/O, canonical store operations
│   ├── search.ts                     # BM25-style local capability search
│   ├── registry.ts                   # Registry adapters (Official + Glama), quality signals, metadata caching
│   ├── doctor.ts                     # Deterministic health audit
│   ├── discover.ts                   # Filesystem scan for installed skills and plugins (feeds `ensemble init`)
│   ├── init.ts                       # Guided onboarding — `ensemble init` / `--auto` flow
│   ├── export.ts                     # Profile-as-plugin packaging
│   ├── secrets.ts                    # Secret scanning (env values, skill content)
│   ├── usage.ts                      # Usage tracking for self-learning search
│   ├── setlist.ts                    # Setlist capability integration (read-only)
│   ├── discovery/                    # Canonical library store + filesystem scan + wire operations
│   │   ├── library-store.ts          # Canonical library manifest at ~/.config/ensemble/library/ — load/save, bootstrap, ignore list
│   │   ├── library.ts                # Library discovery scanner — reads Claude Code config for all tool types, tags origin
│   │   ├── projects.ts               # Cross-client project scanner (distinct from src/projects.ts SQLite reader)
│   │   └── wire.ts                   # Wire operations — copies a discovered tool into a target scope, or removes a managed copy
│   ├── index.ts                      # Public API surface — re-exports for library consumers
│   ├── browse.ts                     # Library discovery engine — pure-function fuzzy search + @marketplace filter parsing
│   ├── lifecycle.ts                  # Noun-first verb dispatcher — routes pull/install/uninstall/remove/library
│   ├── managed-settings.ts           # Canonical managed-settings store at ~/.config/ensemble/managed-settings.json
│   └── # v2.0.1 targets (see Modules (v2.0.1 targets) below): import-legacy.ts
├── src/cli/
│   └── index.ts                      # Commander.js CLI — thin wrapper over operations
├── packages/
│   └── desktop/                      # Electron desktop app (scaffold-compliant)
│       ├── src/
│       │   ├── main/                 # Electron main process
│       │   │   ├── index.ts          # App lifecycle, window creation, sandbox, CSP, auto-update
│       │   │   ├── auto-update.ts    # electron-updater setup, latest/beta channels
│       │   │   ├── config-watcher.ts # fs.watch on config.json for external changes
│       │   │   └── ipc/              # tRPC router
│       │   │       ├── context.ts    # createContext() — empty today, room for services
│       │   │       ├── router.ts     # appRouter with namespaced sub-routers per capability
│       │   │       └── router.test.ts# Contract tests via appRouter.createCaller({})
│       │   ├── preload/              # Minimal tRPC bridge
│       │   │   └── index.ts          # exposeElectronTRPC() — five lines, never modify
│       │   ├── renderer/             # React renderer
│       │   │   ├── src/
│       │   │   │   ├── main.tsx      # tRPC client + QueryClientProvider setup
│       │   │   │   ├── App.tsx       # Root component — sidebar + detail panel layout
│       │   │   │   ├── trpc.ts       # Typed tRPC React hooks bound to AppRouter
│       │   │   │   ├── components/   # Shared UI components
│       │   │   │   ├── hooks/        # React hooks wrapping tRPC queries/mutations
│       │   │   │   ├── panels/       # Detail panels composed into views
│       │   │   │   └── views/        # Top-level views (Matrix, Doctor)
│       │   │   └── index.html
│       │   └── shared/               # Types shared across main/preload/renderer
│       ├── e2e/                      # Playwright E2E tests
│       │   └── *.spec.ts             # Autonomous UI tests
│       ├── package.json              # Desktop-specific deps (electron, react, tailwind, playwright)
│       ├── electron-builder.yml      # Build/packaging config
│       ├── tsconfig.json
│       └── electron.vite.config.ts   # Main/preload/renderer build config (electron-vite)
├── package.json                      # Root package.json with workspaces config
├── tsconfig.json
├── tsup.config.ts
└── biome.json
```

### Modules (built)

| Module | Role |
|--------|------|
| `schemas.ts` | Zod schemas, TypeScript types (via `z.infer`), constants |
| `config.ts` | `loadConfig`/`saveConfig` with atomic writes, query helpers, resolution helpers (`resolveServers`, `resolveSkills`, `resolvePlugins`) |
| `clients.ts` | Client definitions (17 clients, including `skills_dir`), detection, config file read/write, CC settings helpers |
| `operations.ts` | Pure business logic for all mutations — shared by CLI, desktop app, and library consumers |
| `projects.ts` | Project registry reader — reads project-registry SQLite DB via better-sqlite3. Distinct from `src/discovery/projects.ts` (see discovery subsystem below). |
| `sync.ts` | Sync engine — resolve + write configs per client, symlink fan-out for skills, non-destructive hook/settings merge, pre-sync snapshot creation, drift detection. Uses resolution helpers from `config.ts`. |
| `skills.ts` | Skill store — SKILL.md frontmatter parsing, canonical store CRUD |
| `search.ts` | Local capability search — BM25 scoring across servers and skills |
| `registry.ts` | Registry adapter framework — search, show, install across extensible backends. Dynamic marketplace auto-discovery is a §Future deferral, not a current responsibility. |
| `doctor.ts` | Deterministic health audit with structured scoring across 5 categories |
| `secrets.ts` | Secret scanning — regex-based detection of hardcoded secrets in env values and skill content |
| `usage.ts` | Usage tracking — records command/search usage for self-learning search scoring |
| `hooks.ts` | Hook store — non-destructive `settings.json` merge under the `hooks` key, seven lifecycle events |
| `settings.ts` | Declarative `settings.json` key management — non-destructive key-level merge preserving unmanaged keys |
| `snapshots.ts` | Safe apply / rollback snapshots — pre-sync capture of every touched file, forward-restore semantics, retention |
| `agents.ts` | Subagent store — `.claude/agents/*.md` frontmatter parsing (name, description, tools, optional model), canonical store CRUD, fan-out to client agents directories. Dual-field contract: source-owned `description` refreshes from frontmatter on re-pull; `userNotes` lives on the library entry and never round-trips into the `.md`. |
| `commands.ts` | Slash command store — `.claude/commands/*.md` frontmatter parsing (description + optional allowed-tools, argument-hint), canonical store CRUD, fan-out to client commands directories. Same dual-field contract as agents. |
| `setlist.ts` | Setlist capability integration — read-only interface to `@setlist/core` for portfolio capability awareness |
| `init.ts` | Guided onboarding — `ensemble init` / `--auto` flow, client detection, server/skill import, group creation, initial sync |
| `export.ts` | Profile-as-plugin packaging — exports a group as a self-contained Claude Code plugin directory (skills copied, not symlinked) |
| `discover.ts` | Filesystem scan for existing installed skills and plugins; produces a `DiscoveryReport` that feeds `addToLibrary` during `ensemble init` |
| `discovery/library-store.ts` | Canonical library store at `~/.config/ensemble/library/` — manifest schema, load/save, bootstrap from `.claude/` scans, identity as `name@source`, ignore list |
| `discovery/library.ts` | Library discovery scanner — reads Claude Code config for all tool types (servers, skills, agents, commands, styles, plugins, hooks) at global or project scope, tags origin as DISCOVERED vs MANAGED |
| `discovery/projects.ts` | Cross-client project scanner — aggregates project paths from every project-aware installed AI client, deduplicates by canonical filesystem path. Read-only. Powers the desktop project panel. Distinct from `src/projects.ts` (SQLite registry reader). |
| `discovery/wire.ts` | Wire operations — copies a discovered tool into a target scope, or removes a managed copy. Respects the additive-sync rule via `ensemble: managed` frontmatter or `__ensemble: true` JSON flag. |
| `index.ts` | Public API surface — re-exports for `ensemble`, `ensemble/operations`, `ensemble/schemas`, etc. |
| `cli/index.ts` | Commander.js CLI — thin wrapper that calls operations and formats output |
| `packages/desktop/` | Electron desktop app — React + Tailwind UI over the same library operations via a tRPC bridge. Sandboxed renderer, minimal preload, typed `appRouter` with Zod-validated procedures. Complies with the portfolio `electron-scaffold` invariants. |
| `packages/desktop/src/main/auto-update.ts` | Electron auto-updater glue — `electron-updater` setup, latest/beta release channels, update availability notification. Wired into the main process lifecycle at startup. |
| `packages/desktop/src/main/config-watcher.ts` | `fs.watch` on `~/.config/ensemble/config.json` — detects external mutations (e.g., from a CLI command while the desktop app is open) and triggers an in-app reload. The only Ensemble component that watches files, and only its own shared config. |
| `browse.ts` | Library discovery engine — pure-function fuzzy search across installed + discoverable resources, `@marketplace-name` filter parsing; drives both the `ensemble browse` CLI (plain-text output) and the desktop Registry view. No presentation code. |
| `lifecycle.ts` | Noun-first verb dispatcher — routes `pull` / `install` / `uninstall` / `remove` / `library` from the CLI into the operations layer. Sits between `cli/index.ts` and `operations.ts`, keeping each CLI entry point a thin front for a shared dispatch. |
| `managed-settings.ts` | Canonical managed-settings store at `~/.config/ensemble/managed-settings.json`, backing the `ensemble settings` verbs. Distinct from `settings.ts` (the non-destructive merge engine): `managed-settings.ts` owns the store of keys Ensemble manages; `settings.ts` projects those keys into each client's `settings.json` while preserving unmanaged keys. |

### Modules (v2.0.1 targets)

The module below is described in the spec as a v2.0.1 target. It does not exist on disk yet. This sub-section is the **canonical home** for the target-vs-built distinction — `CLAUDE.md`'s prior "Target modules (v2.0.1, not yet built)" block has been collapsed into a pointer to this section.

| Module | Role (target) |
|--------|---------------|
| `import-legacy.ts` | **Throwaway.** One-shot v1.3 → v2.0.1 config translator backing `ensemble import-legacy`. Reads the current v1.3 `config.json` plus a live scan of every detected client's on-disk config, writes a v2.0.1-shaped library + install-state matrix, and backs up the original to `config.v1.bak.json`. Runs once on the user's machine during the v2.0.1 transition, then the file and its CLI subcommand are deleted in a follow-up commit. Explicitly not a permanent subsystem — see §Migration. **Status (2026-04-18):** unbuilt. The v2.0.1 slim cut (chunks 1–10) shipped the new resource types (agents, commands, hooks, settings, snapshots, doctor, browse, desktop) but the §Migration step 2 (import-legacy) and step 4 (coordinated v1.3-verb rename sweep) never ran. `operations.ts` still exports the eight v1.3 install-state verbs (`enableServer` / `disableServer` / `installPlugin` / `uninstallPlugin` / `enablePlugin` / `disablePlugin` / `installSkill` / `uninstallSkill`) and the live `~/.config/ensemble/config.json` remains v1.3-shape. Closing this gap is queued for `/fctry:execute`. |

When any remaining target module lands, move its row up into `### Modules (built)` with a present-tense role description.

## Design Principles

0. **The library is the primary interface. Install state is a property, not a location.** The user's owned inventory lives in a single flat library. Every resource in the library is owned regardless of whether it is currently installed anywhere. Install state is a per-client/per-project property of a library resource — never a tier above or below the library. Uninstalling removes a resource from a client's config; only `ensemble remove` evicts it from the library. Every UI surface must respect this distinction: pivots are views over the same flat library, and install/uninstall is a row-level action available from every view. (v2.0.1 refinement.)
1. **Library-first** — Ensemble is a library that happens to have a CLI and a desktop app, not an app with importable internals. Operations are pure functions. Config I/O is explicit. Consumers — CLI, desktop app, Chorus, or any other app — own the read/write lifecycle.
2. **Additive only on sync** — Ensemble manages its own servers, skills, plugins, agents, commands, hooks, and managed settings keys in client configs. It never deletes entries it didn't create. A `__ensemble` marker (for JSON configs) or `ensemble: managed` frontmatter (for markdown resources) identifies managed entries.
3. **Backwards compatible defaults** — no group assignment = sync all enabled servers.
4. **Idempotent** — running `ensemble sync` twice produces the same result.
5. **No daemon** — runs on demand, no file watching, no background process. (Validated: see Non-Goals.)
6. **Dry-run support** — `ensemble sync --dry-run` shows what would change without writing.
7. **Config backup** — before writing to any client's config file for the first time, Ensemble creates a `.ensemble-backup` copy alongside the original. Subsequent writes do not overwrite the backup.
8. **Marker-based coexistence** — Ensemble tags every entry it writes with an identifying marker: `__ensemble: true` for JSON configs (servers, plugins, hooks, settings), `ensemble: managed` frontmatter for markdown resources (skills, agents, commands). On sync, Ensemble reads all entries of a given type, preserves entries without the marker untouched, and only manages its own. This means Ensemble coexists safely with other tools that write to the same config files or directories (e.g., ToolHive, Caliber, manual edits). However, other tools that don't use markers may overwrite Ensemble's entries during their own sync. Users running multiple config management tools should sync Ensemble last, or use `ensemble doctor` to detect unexpected changes via drift detection.
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
- **Dynamic marketplace auto-discovery (`discoverMarketplaces()`)** — Scan known registry endpoints for new marketplaces and return any that aren't yet registered in the user's config; CLI surfaces them as notifications on next invocation. (Pattern from plum's "dynamic registry with auto-update notification.") Deferred until the rest of the v2.0.1 target surface lands and a concrete notification path is chosen.
- **Unified installed-plus-discoverable fuzzy search (`fuzzySearchAll()`)** — Single search across installed resources and discoverable catalog content with `@marketplace-name` filter syntax parsed from the query. This would be the engine behind `ensemble browse`. (Pattern from plum.) Deferred — rides with the `browse.ts` library primitive, which is itself a v2.0.1 target module.

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
- **crossoverJie/SkillDeck (`sd`)** — Swift / SwiftUI macOS skills manager (MIT, ~313★). **v2.0.5 contributions:** first-class `inherited` installation state distinct from `direct` for clients that read another client's skills directory rather than owning their own (`docs/AGENT-CROSS-DIRECTORY-GUIDE.md` + `Models/SkillInstallation.swift` → §Matrix View / Installation states, §Sync / inherited targets); per-artifact `upstreamTreeHash` compared against remote tree hash with GitHub compare URL surfaced in DOCTOR findings so the user sees the exact upstream diff before pulling (`Services/UpdateChecker.swift` + `CommitHashCache.swift` + `FEATURES.md F12` → §Doctor / Upstream drift, §Registry / Upstream-hash query). **v2.1.0 UX retro pass:** informs the POV patterns ambient installation state per cell (already adopted architecturally in v2.0.5; now declared as a POV principle in §Experience POV / Pillar 1), inline copy feedback over toast banners, ambient progress (`N/total` pill) rather than modal progress dialogs, preview-before-install gate, equal-weight source sort vocabulary, and the open-question shared `~/.agents/skills/` store (reframed as relevant for the MCP/skills cross-client offering under the CC-first stance). Three patterns dismissed after researcher review: single-source client rule table enum (`clients.ts` already provides this with no marginal value), three-pane sidebar with counts (Ensemble's matrix is structurally different, revisit after pivot IA user testing), and UI-language-aware translation (premature). Repo: `github.com/crossoverJie/SkillDeck`. License: MIT (LICENSE file present and explicit).
- **DatafyingTech/Claude-Agent-Team-Manager** — Tauri + React manager for Claude subagent "teams" (MIT, ~122★). **v2.0.5 contributions:** profile as a self-contained composable unit carrying its own `variables` and `launchPrompt` alongside its member resources, so an agent team exports as one record with its inheritance edges and opening prompt intact (`src/types/aui-node.ts NodeKind group` + `USAGE.md` → §Profile-as-Plugin / Profile as composable unit); typed variables with `kind: 'text' | 'note' | 'api-key' | 'password'` and root-to-leaf inheritance (`src/types/aui-node.ts NodeVariable` + `USAGE.md` → §Resource Types / Typed Variables, §Secret Scanning / Relationship to typed variables); secret redaction at the serialization boundary via a single `redactForExport` helper applied uniformly to every export, telemetry, and remote-sync path (`src/types/remote.ts redactNode` + `remote-sync.ts` → §Profile-as-Plugin / Secret redaction); atomic write primitive — write to `<path>.tmp`, Zod-validate, rename, cleanup-on-failure — as the cheap half of the safe-apply story (`src/services/file-writer.ts` → §Sync / Atomic Write Primitive). One pattern deferred for dedicated /fctry:evolve after v2.0.1 agents/commands/hooks ships: the deploy primer (a capability-gap concept for bundling a team with its deployment narrative). Two patterns dismissed as premature: pipelines (future composition territory, waits on the deferred deploy primer) and three-pane sidebar with counts (already covered by v2.0.1 pivot IA). Repo: `github.com/DatafyingTech/Claude-Agent-Team-Manager`. License: MIT (LICENSE file present and explicit).
- **xingkongliang/skills-manager** — Tauri 2 + Rust + React skills manager with scenario-based live scope, content-hash drift detection, a published SKILL.md detection policy, forward-restore snapshot semantics, and per-client sync-mode exceptions. **v2.0.4 contributions:** profiles-as-live-scope with per-(profile, skill, client) enabled-tool matrix (`src-tauri/src/commands/scenarios.rs` → §Profile-as-Plugin Packaging / Profiles as Live Scope); artifact-level stable SHA-256 hash over sorted relative paths + byte contents + Unix exec bit, ignoring `.git`/`.DS_Store`/`Thumbs.db`/`.gitignore` (`src-tauri/src/core/content_hash.rs` → §Drift Detection, §Doctor); SKILL.md detection policy formalized as a spec doc (`docs/skill-format-detection-spec.md` → §Detection Policy, §One-Shot Import); snapshot tag naming + forward-restore semantics so rollback is additive rather than destructive (`src-tauri/src/core/git_backup.rs` → §Snapshot Tags and Forward-Restore Semantics); per-client sync-mode exception table with Cursor→copy, Windows→copy automatic downgrade (`src-tauri/src/core/sync_engine.rs` → §Per-Client Sync Mode Table). Three patterns dismissed after researcher review: live FS watcher (overlaps with existing `packages/desktop/src/main/config-watcher.ts`), disabled-sibling directory convention (narrower scope, needs per-client tolerance verification), and adapter `additional_scan_dirs` (Ensemble's `discover.ts` handles plugin-cache paths ad-hoc today). Repo: `github.com/xingkongliang/skills-manager`. (License note: the project's README states MIT, but no `LICENSE` file is present in the repo — treat the upstream code as reference-only for pattern adoption; do not copy source verbatim until licensing is confirmed.)
- **winfunc/opcode (`oc`)** — Tauri 2 Claude Code GUI (MIT, 21.5k★). **v2.1.0 UX contributions:** segmented tabs collapsing Servers/Add/Import-Export into peer tabs rather than modals (§POV / Pillar 2 / library unified across types); transport-first add form that branches on stdio vs SSE before showing fields (§POV / Pillar 1 / edits stage and ambient state); card-grid marketplace with inline "already imported" badge (§POV / Pillar 3 / one Explore surface with in-place install state); tab-system with Cmd+T/W/1-9 keyboard parity plus per-tab status icons (§POV / Cross-cutting / keyboard ergonomics); preview-before-import dialog gate (§POV / Pillar 3 / preview before install always); consistent error surface as the positive counterpart to its own anti-pattern (§POV / Rejected anti-patterns / inconsistent error surfaces). Anti-patterns: `alert()` mixed with toast system (mixed error surfaces); 40+ unfiltered component variants in one folder; analytics calls sprinkled per handler. Repo: `github.com/winfunc/opcode`. License: MIT.
- **brightwing-systems-llc/mcp-manager (`bw`)** — Tauri desktop MCP manager across ~20 AI tools, React + Tailwind (MIT). **v2.1.0 UX contributions:** detected-tools chip shelf above the matrix with dimmed chips for undetected clients (§POV / Pillar 1 / detected chips); in-row tool warnings with "Track issue" links (§Doctor / drift categorization); pending-changes staging Map with batch Save progress counter (§POV / Pillar 1 / edits stage as pending); Restart Banner that names exactly which IDEs need restart with unsaved-work safety gate (§POV / Cross-cutting / restart guidance scoped-and-gated); quality-graded search rows with letter + score + stars + verified tag (§POV / Pillar 3 / quality is visible); per-app token-budget bar with live % (open question: context-budget-aware bundling). Anti-patterns: seven-item top-level sidebar, auto-probe-on-mount side effects, per-tool restart buttons that assume process control. Repo: `github.com/brightwing-systems-llc/mcp-manager`. License: MIT.
- **haidar-ali/clode-studio (`cs`)** — AI-first IDE wrapping Claude Code CLI, Vue/Nuxt 3 + Electron (MIT). **v2.1.0 UX contributions:** 3-dock modular workspace with per-mode presets ("Development", "Task Mgmt", "Research", "Source Control") validating user-saveable layout presets; ActivityBar + draggable module chips with split views; multi-instance Claude terminals with live per-instance status; WorktreeTabBar where tabs scope to isolated filesystem contexts preserving per-tab state (→ profile-as-tab-bar in §POV / Pillar 1); MCP quick-add cards for 47+ preconfigured servers with live connection chips (§POV / Pillar 3 / marketplace card grid); state persistence across sessions via Electron Store (§POV / Cross-cutting / layout state is persistent). Anti-patterns: feature sprawl disguised as modularity (15+ modules), four-plus named modes dilute recognition. Repo: `github.com/haidar-ali/clode-studio`. License: MIT.
- **jhlee0409/claude-code-history-viewer (`hv`)** — Multi-provider conversation history viewer, Tauri + React (MIT, 984★). **v2.1.0 UX contributions:** three-tier zoom (pixel/skim/read) cycled from one icon toggle (§POV / Pillar 3 / three-tier zoom); provider tab-bar above a unified list with `activeProviders` store slice (§POV / Pillar 2 / library unified + Pillar 3 / source tabs); attribute brushing where picking a tool/file/MCP highlights every matching session (§POV / Pillar 3 / attribute brushing for batch decisions); dual-mode metric cards showing billing vs conversation tokens side-by-side with coverage % disclosure; virtualized lanes with date-range filter computed reactively; Escape-clears-filter as a global listener plus sticky-brush opt-in (§POV / Cross-cutting / keyboard ergonomics). Anti-patterns: documentation sprawl as craft surrogate (5 README translations + governance docs), feature-list-as-changelog, nine per-tool renderer cards where two would cover 95%. Repo: `github.com/jhlee0409/claude-code-history-viewer`. License: MIT.
- **amelmo/loadout (`lo`)** — Direct Ensemble competitor, Tauri 2 + React 19 + Zustand managing MCPs/skills/rules/hooks/subagents/plugins across 10 AI coding tools (6★, actively shipping). **v2.1.0 UX contributions:** two-phase MCP auth consent — fetch without Keychain first, per-MCP "grant Keychain access" button only on auth failure (§POV / Cross-cutting / progressive consent for credentials); cross-tool sync dialog defaulting to nothing-selected + filtered to only detected tools + blocked on detection failure (§POV / Pillar 1 / multi-client fan-out as secondary opt-in); Context Window page with separate idle vs active token buckets per tool (open question: context-budget-aware bundling); identity-based skill grouping across tools with content-drift flagging in a single row (§POV / Pillar 1 / ambient installation state); global drag-and-drop `.md` import with full-page overlay (§POV / Pillar 2 / drag-first form-last); multi-slide onboarding teaching concepts before config (§POV / Pillar 2 / migrate don't start from scratch). Anti-patterns (both explicitly rejected in §POV): **brand promises unshipped primitives** ("Loadout" implies a switchable bundle concept the product lacks entirely); one-page-per-artifact-type fragmentation. Repo: `github.com/amelmo/loadout`. License: MIT.
- **llrowat/agent-corral (`ac`)** — Claude-Code-only config studio for agents/hooks/skills/MCP/memory/plugins, Tauri v2 + React. **v2.1.0 UX contributions:** Global/Project scope toggle in header with an "effective config" merged view annotating each resolved value with its source (§POV / Pillar 1 / effective config previewable + scope-is-a-badge); repo registry as first-class sidebar switcher with per-repo capability dots; QuickSetup wizard for empty repos with curated starter presets (§POV / Pillar 2 / migrate don't start from scratch); Config Linter with 20+ rules (hierarchy conflicts, shadowed agents/skills, permission clashes) filterable by severity and groupable by category/severity/scope (§Doctor / refinement candidate); schema-driven forms with `x-field` metadata extensions (§POV / Pillar 2 / schema-driven editors); plugin auto-sync with per-import pin and unlink controls (open question: remote update subscription). Anti-patterns: single-client scoping as a default (agent-corral's own stance; Ensemble's CC-first stance is a sequencing decision, not a scoping one — see §Scope sequencing); "Plugins" naming collision with Claude Code's own plugin concept; sidecar-file proliferation in user filesystem. Repo: `github.com/llrowat/agent-corral`. License: MIT.
- **thanhwilliamle/aiplughub (`ph`)** — Cross-tool plugin manager for Claude Code + Claude Desktop (Gemini CLI / Antigravity built-but-disabled), Tauri 2 + React 19 (MIT, Windows-only preview, 1909 tests). **v2.1.0 UX contributions:** side-by-side bundle compare before import (§POV / Pillar 1 / edits stage as pending changes with diff preview); update review panel with per-plugin change diffs (§POV / Pillar 3 / updates are reviewable not silent); scoped bundle export for team/project-specific sharing (§Profile-as-Plugin / Profile as composable unit, v2.0.5); bulk select + bulk action bar on both my-setup and browse surfaces; type education + featured picks in guided first-run filling the gap between detected-clients and pick-plugins (§POV / Pillar 2 / migrate don't start from scratch); install-all modal with curated marketplace sources picker. Anti-patterns: Windows-only launch promising features users can't run; silent scope cuts in the README ("built but disabled" tools shown in marketing); tabs-as-mode forcing users to remember where "installed vs available" lives. Repo: `github.com/thanhwilliamle/aiplughub`. License: MIT.
- **amandeepmittal/skillsbar (`sb`)** — Claude Code + Codex skills popover, SwiftUI macOS menu bar. **v2.1.0 UX contributions:** global hotkey + menu-bar popover with no dock icon and no window switch (open question: optional tray/menu-bar peek companion); tabbed browsing with live count badges per tab (§POV / Pillar 2 / library unified with type as filter); pinned favorites persisted across restarts (§POV / Pillar 2 / pins); recency signals — "New" (24h) + "What's New" (7d) sections (§POV / Pillar 3 / updates are reviewable + Pillar 2 / usage-based sort); usage-ranked Most Used sort pulled from CLI history (§POV / Pillar 2 / usage-based sort); cross-source Collections mixing Claude + Codex skills in one saved view (§POV / Pillar 2 / user collections cross boundaries). Anti-patterns: read-only ceiling (viewer not manager), single-machine/single-user assumption, platform-locked primitives (NSStatusItem, FSEvents macOS-only). Repo: `github.com/amandeepmittal/skillsbar`. License: MIT.
- **chrlsio/agent-skills (`cs2`)** — Near-peer competitor, Tauri + React + shadcn/ui managing skills across 16 clients. **v2.1.0 UX contributions:** sidebar fuses nav + per-agent count badges + resizable width persisted to localStorage (§POV / Pillar 1 / ambient state + Pillar 2 / pins); dashboard cards branching on detection (detected → arrow-to-skills; not-installed → grayscale + "Installation guide" CTA) (§POV / Pillar 1 / detected chips); marketplace as resizable two-pane (list + deferred-render detail via `useDeferredValue`) with source tabs and per-source sort chips (§POV / Pillar 3 / one Explore surface + deferred detail); per-agent action row unifying install/sync/uninstall with "inherited" as first-class status (§Matrix View / Installation states, v2.0.5); multi-step Import Wizard with live progress events and undo-on-cancel repo removal (§POV / Cross-cutting / undoable at the boundary); file-watcher → skills-changed event → React Query invalidation across panels (CLI/desktop parity). Anti-patterns: two marketplace sort vocabularies (one per tab) forcing relearn per source; context menu globally disabled killing right-click copy; auto-select first item on load making scanning feel like commitment. Repo: `github.com/chrlsio/agent-skills`. License: MIT.
- **qufei1993/skills-hub (`sh`)** — Closest public competitor, Rust/Tauri cross-platform skills manager across 40+ AI tools (MIT, 771★). **v2.1.0 UX contributions:** unified Explore page with Featured grid + live search + inline "Already installed" dedup (§POV / Pillar 3 / one Explore surface); scope toggle per skill (Global ↔ Project) with visible scope badge on every card (§POV / Pillar 1 / scope is a badge); onboarding migration that scans existing installs → imports into central repo → syncs outward (§POV / Pillar 2 / migrate don't start from scratch); new-tool detection modal prompting fan-out when a new dotfolder appears (§POV / Pillar 1 / multi-client mirror surface); import sources as equal-weight options (Featured / Online / Local / Git URL) with multi-skill repo picker (§POV / Pillar 3 / sources are equal-weight); in-app skill detail view with Markdown + syntax-highlighted file browser for inspect-before-install (§POV / Pillar 3 / preview before install). Worth evaluating: `featured-skills.json` as a 300-entry curated catalog with hourly refresh could be consumed as a third-party registry adapter alongside Official + Glama. Anti-patterns: per-tool config-file diversity leaking into UX (40+ tool table), silent Cursor-always-copies carve-out as runtime surprise, skills-only scope (no MCPs/plugins/agents — narrower than Ensemble). Repo: `github.com/qufei1993/skills-hub`. License: MIT.
- **shpigford/chops (`ch`)** — Ensemble's closest UX competitor, native SwiftUI macOS skills/agents/rules manager across Claude Code/Cursor/Codex/Windsurf/Amp/Copilot/Aider (1.2k★). **v2.1.0 UX contributions:** symlink-dedup identity rendering one resolved path as one artifact with N tool badges (§Matrix View / Installation states — directly supports the v2.0.5 `inherited` state); sidebar with semantic buckets + tool buckets + collections + servers each carrying live count badges (§POV / Pillar 2 / library unified + user collections); inline AI compose panel docked into the editor with resize handle and diff-review-before-accept gate (open question: AI compose panel with diff-accept); registry discovery modal with debounced search → install-count result rows → preview content → multi-agent checkbox "Install to:" with Select All (§POV / Pillar 3 / multi-client install for MCPs/skills); per-tool kind filter as ellipsis-menu inside list toolbar (progressive disclosure); metadata bar as always-visible content footer (tool icons, abbreviated path, size, relative modified time, collections popover) (§POV / Pillar 1 / ambient state). Anti-patterns: no test suite (manual validation only), sandbox disabled for unrestricted `~/` access, three-columns hardcoded with no narrow-mode fallback. Repo: `github.com/shpigford/chops`. License: MIT.

## Changelog

- **2.4.1** — `/fctry:review` drift resolution. Promote three built modules into §Modules (built): `browse.ts` (library discovery engine, chunk 9), `lifecycle.ts` (noun-first verb dispatcher, chunk 8), and `managed-settings.ts` (canonical managed-settings store, chunk 8). Remove the L2138 stale comment and the `browse.ts` row from §Modules (v2.0.1 targets). Add a "Status (2026-04-18)" paragraph to the `import-legacy.ts` target row documenting the v1.3 → v2.0.1 migration gap: the slim cut shipped the new resource types but §Migration step 2 (import-legacy) and step 4 (v1.3-verb rename sweep) never ran — `operations.ts` still exports the eight v1.3 install-state verbs and the live config remains v1.3-shape. Closing that gap is queued for `/fctry:execute`. v2.0.3–2.0.5 refinements (dual-field notes CLI verb, snapshot tag format, per-client sync-mode table, atomic-write primitive, `redactForExport`, typed variables, `upstreamHash` adapter method, `launchPrompt` profile field, inherited installation state vocabulary) remain on the spec as forward commitments — build status not verified this pass, parked as roadmap.
- **2.0.5** — **Six patterns adopted from two references: crossoverJie/SkillDeck (Swift/SwiftUI macOS, MIT) and DatafyingTech/Claude-Agent-Team-Manager (Tauri + React, MIT).** (1) **Inherited installations as first-class state** (SkillDeck) — extend §Matrix View with an "Installation states" vocabulary distinguishing `direct`, `inherited` (reads another client's resource directory; label-only cell), `drift`, `orphan`, `ignored`; extend §Sync with "fan-out skips inherited targets" so sync never writes into the source client's store from the inheriting client's behalf. (2) **Upstream tree-hash drift with GitHub compare URL** (SkillDeck) — new `Upstream drift` row in §Doctor → Checks, payload includes a `compareUrl` when the source is a GitHub repo; §Registry adapter interface gains optional `upstreamHash(id)` method returning `{ treeHash, compareUrlTemplate }` with adapter-level opt-out (`null`) for flat registries; extends v2.0.4's local artifact-level drift outward. (3) **Profile as composable unit** (ATM) — extend §Profile-as-Plugin Packaging → Profiles as Live Scope with `variables` and `launchPrompt` as first-class profile fields; subagent-team case becomes a concrete instantiation (`profile = {agents, dependent_skills, shared_variables, launchPrompt}`) that exports as one plugin; additive on top of v2.0.4's enabled-tool matrix. (4) **Typed variables with kind + inheritance** (ATM) — new §Resource Types → Typed Variables subsection declaring `kind: 'text' | 'note' | 'api-key' | 'password'`; root-to-leaf inheritance (profile → group → resource) with name-based override and kind-match validation; orthogonal to the existing `op://` convention (`op://` is the stored form, `kind` is the schema-level declaration); `ResourceVariableSchema` added to Zod exports. (5) **Atomic write primitive** (ATM) — new §Sync → Safe Apply → Atomic Write Primitive subsection: write to `<path>.tmp`, Zod `safeParse`, `rename(tmp, path)` only on success, unlink-and-rethrow on failure; shared helper in `src/io/atomic-write.ts`; applies to `sync.ts`, `skills.ts`, and v2.0.1 target writers (`agents.ts`, `commands.ts`, `hooks.ts`, `settings.ts`) from day one; complements (does not replace) snapshot-and-rollback. (6) **Secret redaction at serialization boundary** (ATM) — new §Profile-as-Plugin → Secret redaction subsection: every variable with `kind: 'api-key' | 'password'` is scrubbed by a single `redactForExport` helper applied uniformly to every export, telemetry, and remote-sync path; UI never has to know; unconditional (no `--include-secrets` flag) because even `op://` references leak vault tenancy structure. §Secret Scanning grows a "Relationship to typed variables" paragraph noting the orthogonal layering. §References gains two new entries (SkillDeck, ATM) both with explicit MIT LICENSE files — no license ambiguity. **Dismissed (4):** single-source client rule table enum (already have via `clients.ts`), three-pane sidebar with counts (Ensemble's matrix is structurally different; revisit after pivot IA testing), UI-language-aware translation (premature), pipelines (premature, waits on deploy primer). **Deferred as open questions for dedicated /fctry:evolve sessions (2):** shared canonical `~/.agents/skills/` store (SkillDeck pattern #2) — architectural decision about whether Ensemble participates in the emerging multi-tool `~/.agents/` convention; not a refinement; warrants a dedicated conversation, not a drive-by ref incorporation. Deploy primer (ATM pattern #11) — capability-gap flag best revisited after v2.0.1 agents/commands/hooks ships; parked rather than rejected.
- **2.0.4** — **Five patterns adopted from xingkongliang/skills-manager.** (1) **Profiles as live scope** — extend §Profile-as-Plugin Packaging with a new "Profiles as Live Scope" subsection; profiles become switchable live state alongside their existing export-as-plugin stance, with atomic switching, a tray/menubar switcher in the desktop app, and a per-(profile, artifact, client) enabled-tool matrix so the same skill can be active for Cursor under profile A but only Claude Code under profile B. (2) **Artifact-level content hash** — extend §Drift Detection with a stable SHA-256 over sorted relative paths + byte contents + Unix exec bit, ignoring `.git`/`.DS_Store`/`Thumbs.db`/`.gitignore`; deterministic boolean for "is the deployed copy still identical to the canonical version?"; complements (not replaces) the existing `lastDescriptionHash`; DOCTOR's drift-detected row updated to reference the artifact hash. (3) **Published detection policy** — add a new §Detection Policy subsection under Resource Types naming canonical markers (`SKILL.md`), legacy-compatible markers (`skill.md`), and explicit disqualifications (`README.md`, `CLAUDE.md`) for every file-based resource type; generalized from skills to agents/commands/hooks/settings so v2.0.1 target modules inherit a consistent scanner contract; §One-Shot Import updated to route through the policy rather than naive globs. (4) **Snapshot tags + forward-restore semantics** — extend §Safe Apply and Rollback Snapshots with tag naming (`ens-snap-YYYYMMDD-HHMMSS-<shortsha>`) and forward-restore: restoring a snapshot emits a new snapshot whose manifest includes `restored from <tag>`, preserving linear provenance; closes the `git reset --hard` footgun where rollback destroys newer state. (5) **Per-client sync mode table** — extend §Sync with a `symlink`-default-plus-exceptions table: Cursor and Windows default to `copy` (Cursor's resource-loader dereferences symlinks unreliably; Windows requires elevated privileges for symlink creation); user-configurable `sync_mode` override per client; copy-mode drift surfaces via the new artifact-level hash. §References gains a xingkongliang/skills-manager entry citing each adopted file and noting the MIT-in-README / missing-LICENSE license ambiguity so future agents treat the upstream code as reference-only. Three patterns dismissed: live FS watcher (overlaps with existing `config-watcher.ts`), disabled-sibling directory convention (narrower scope, needs per-client tolerance verification), adapter `additional_scan_dirs` (Ensemble's `discover.ts` already handles plugin-cache paths ad-hoc).
- **2.0.3** — **Dual-field annotations: source-owned `description` + user-authored `userNotes` on every library item.** Every library resource type (servers, skills, plugins, agents, commands, hooks, settings) now carries two annotation fields: a required `description` that upstream owns and Ensemble silently refreshes from the registry response / frontmatter / plugin manifest / event+matcher, and an optional `userNotes` that the user owns and no reconciliation path ever overwrites. Hooks: `description` auto-generated from `event → matcher`, behaves identically to a source-owned description. Add `ensemble note <ref> "text"` / `--edit` CLI verb covering every item type; desktop renderer gains inline click-to-edit with blur-to-save (Cmd+Enter saves, Esc cancels). Local search weights `userNotes` 2x against `description` in BM25 scoring — user-authored language outranks generic upstream copy. Re-import is silent: new descriptions replace old in place, and `ensemble doctor` surfaces a low-severity info finding (`"N items had their descriptions updated from upstream since last sync"`) with a `--show` listing. Profile-as-plugin export includes `userNotes` by default because notes are frequently the curation rationale; `ensemble groups export <group> --as-plugin --strip-notes` opts out, desktop export dialog has an "Include personal notes" checkbox. Display contract: userNotes lead when present, description fills the slot when they're empty — no "missing notes" indicator, seamless fallback. Bake the dual-field model into the v2.0.1 target modules (`agents.ts`, `commands.ts`, `hooks.ts`) from day one rather than retrofitting after they land. Clean up `src/discovery/library.ts` plugin-description overload: plugin identity moves to a dedicated `marketplaceRef` field so `description` can hold the real human-readable copy. Update `ServerSchema`, `SkillSchema`, `PluginSchema`, `AgentSchema`, `CommandSchema`, `HookSchema`, `SettingSchema` to add `description: string` (required) and `userNotes: string` (optional); schemas remain the single source of type truth. Codify in §Library Bootstrap that **userNotes are never overwritten by reconciliation** as a first-class invariant of the library store — matching the strength of "additive sync" and "non-destructive settings.json merge". No new external references.
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
