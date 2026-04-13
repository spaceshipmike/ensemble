## 2026-04-13 — Normalized v1.3 install-state terminology in pre-existing scenarios to library-first language; 41 new scenarios untouched.

## 2026-04-13 — Removed mcpoyle migration path — dead code, migration window closed.

## 2026-04-13 — v2.0.1 refinement (migration plan)

Simplified v2.0.1 migration plan from deprecation-by-rename-with-guards to clean-slate-plus-one-shot-import, acknowledging the single-user-single-machine constraint. Spec stays at 2.0.1 (refinement within version). Touched §Library API (operations), §CLI Surface (added `import-legacy`, narrowed Legacy → Retained Surface, deleted v1.3 install-state verbs from listing), added new top-level §Migration (v1.3 → v2.0.1), §Architecture module table (added `import-legacy.ts` throwaway), §Design Principles (added #11 single-user/single-machine). No spec-version bump.

## 2026-04-13 — /fctry:review drift fixes

CLAUDE.md rolled back to v1.3 reality with v2.0.1 targets broken out; discover.ts and mcpoyle/ added to spec architecture table.

## 2026-04-12T23:30:00Z — /fctry:evolve (library as primary interface; install as property; pivot-based IA)

- Frontmatter: spec-version 2.0.0 → 2.0.1; synopsis medium rewritten to lead with "library as primary interface, install state as property"; patterns adds "library as primary interface", "install-state-as-property", "pivot-based IA" [structural]
- `#core-concepts`: Added new "Resource Lifecycle Model" subsection introducing Marketplace / Library / Install state / Pivot as first-class concepts with pivot table; split into "Resource Types" for existing resource entries; rewrote Marketplace bullet as discovery-only; added "Library membership vs. install state" bullet; rewrote Sync bullet to clarify "projects install state into clients, does not touch library membership" [modified]
- `#library-api` / Operations: Added v2.0.1 library-vs-install-state split — pullFromMarketplace, addToLibrary, removeFromLibrary, installResource, uninstallResource, getInstallState, getLibraryByPivot; clarified legacy aliases under strict library-first semantics [modified]
- `#library-api` / Zod Schemas: Added InstallStateSchema, PivotSpecSchema to exports block [modified]
- `#cli-surface`: Added "Lifecycle Verbs (v2.0.1)" subsection with pull/add/install/uninstall/remove semantics; added "Library Subcommand" subsection (list/show/pivot); added "Per-Project Install State" subsection clarifying Claude-Code-only scoping and error handling for other clients; reframed prior CLI dump as "Legacy Surface" [modified]
- `#desktop-app` / Layout: Replaced the 7-subsection Resources group with a pivot-based sidebar — Library (default, with resource-type filter bar), By Project, By Group, By Client, Marketplace; workflow sections (Sync, Doctor, Snapshots, Profiles, Rules) moved below; added IA rationale note [modified]
- `#sync`: Prepended framing paragraph — sync projects install state into clients, never touches library membership [modified]
- `#design-principles`: Added principle #0 "The library is the primary interface. Install state is a property, not a location." [added]
- `#non-goals`: Added non-goal "library as a backup of client configs" — clarifies library is authoritative inventory, not a dump of client state [added]
- `#changelog`: Added 2.0.1 entry [modified]
(7 modified, 2 added, 0 removed)

## 2026-04-12T18:00:00Z — /fctry:ref (level up ensemble — 6 references, v2.0 scope expansion)

- Frontmatter: spec-version 1.3.1 → 2.0.0, short/medium/readme rewritten as "Claude Code extension platform manager", tech-stack adds Ink + fuzzysort, patterns adds non-destructive settings.json merge + safe apply/rollback + fuzzy search across installed + discoverable + marketplace filter syntax + card/slim view modes + dynamic marketplace registry + meta-loop, goals expanded for 7 resource types + rollback + TUI browse + 21-client sync [structural]
- `#problem`: Rewritten to enumerate the 7 declarative artifact types in `.claude/` and frame fragmentation as spreading across client ecosystem [modified]
- `#solution`: Rewritten to describe Claude Code extension platform manager scope, per-resource sync strategies, rollback snapshots, browse TUI [modified]
- `#core-concepts`: Added 4 new concept entries — Agent, Command, Hook, Setting; added Safe apply / rollback snapshot; expanded Group and Sync definitions; expanded Trust Tier to cover all resource types [modified]
- `#library-api` / Package Exports: Added 5 new subpath exports (agents, commands, hooks, settings, snapshots, browse) [modified]
- `#library-api` / Operations: Added addAgent/removeAgent/enableAgent/disableAgent, addCommand/removeCommand/enableCommand/disableCommand, addHook/removeHook/enableHook/disableHook, setSetting/removeSetting [modified]
- `#library-api` / Zod Schemas: Added AgentSchema, CommandSchema, HookSchema, SettingSchema, PluginSchema, SnapshotSchema [modified]
- `#library-api` / Client Resolution: Added resolveAgents, resolveCommands, resolveHooks, resolveSettings [modified]
- `#library-api` / Registry API: Added discoverMarketplaces (dynamic registry), fuzzySearchAll (unified discovery), cloud catalog formalization [modified]
- `#cli-surface`: Added full command groups for agents, commands, hooks, settings; added `ensemble browse` TUI command with view/type/marketplace flags; added `ensemble snapshots list/show` and `ensemble rollback`; added groups add/remove verbs for all new resource types [modified]
- `#desktop-app` / Layout: Restructured sidebar into collapsible Resources group (7 types) plus workflow top-level sections; added Agents, Commands, Hooks, Settings, Snapshots sections [modified]
- `#desktop-app` / Visual Extras: Extended drag-and-drop to all resource types; added Card/Slim toggle; added unified fuzzy search bar with @marketplace filter chips; added rollback affordances [modified]
- `#sync`: Added per-resource strategy description for all 7 types; added non-destructive merge description for hooks and settings [modified]
- `#sync` / Safe Apply and Rollback Snapshots: New subsection — pre-write snapshot capture, restore operations, retention pruning [added]
- `#supported-clients`: Added Antigravity, CodeBuddy, Qoder, Trae (17 → 21); added framing paragraph citing AgentSkillsManager [modified]
- `#architecture`: Added agents.ts, commands.ts, hooks.ts, settings.ts, snapshots.ts, browse.ts to src/ tree and modules table [modified]
- `#tech-stack`: Added Ink (TUI) and fuzzysort [modified]
- `#non-goals`: Clarified GUI framework non-goal to accommodate Ink-based `ensemble browse` as presentation-only [modified]
- `#design-principles`: Added principle 9 (non-destructive settings.json merge) and principle 10 (safe apply with rollback snapshots) [added]
- `#references`: Added plum and claude-forge; extended TARS, ay-claude-templates, skillbox, AgentSkillsManager with v2.0 contributions [modified]
- `#changelog`: Added 2.0.0 entry [modified]
(17 modified, 3 added, 0 removed)

## 2026-04-12T00:00:00Z — /fctry:evolve (add Electron desktop app)

- Frontmatter: version 1.2.0 → 1.3.0, synopsis updated for desktop app, tech-stack adds Electron/React/Tailwind/Playwright, patterns adds monorepo/sidebar/drag-drop/visual-drift/autonomous-testing, goals adds desktop app [structural]
- `#desktop-app`: New section — Electron desktop app as third presentation layer with full CLI parity. macOS sidebar + detail panel layout (10 sections). Visual extras: drag-and-drop group assignment, visual drift diffing, interactive dependency graphs, registry cards. IPC architecture (main→preload→renderer). Shared config with fs.watch live reload. Playwright autonomous testing. Distribution TBD. [added]
- `#philosophy`: Updated for three presentation layers (CLI, desktop app, scripting) [modified]
- `#solution`: Updated to mention desktop app and visual extras [modified]
- `#non-goals`: Replaced "no GUI/TUI" with "no standalone GUI framework" — Chorus remains separate consumer [modified]
- `#architecture`: Added monorepo layout with npm workspaces, packages/desktop/ tree, desktop module row [modified]
- `#tech-stack`: Added Electron, React, Tailwind CSS, Playwright, electron-builder, electron-vite [modified]
- `#design-principles`: Updated library-first to acknowledge desktop app as consumer [modified]
- `#changelog`: Added 1.3.0 entry [modified]
- Scenarios: 19 new scenarios across 6 features in Desktop category (launch/layout, server management, sync/drift, registry browser, doctor/health, autonomous testing) [added]
(7 modified, 2 added, 0 removed)

## 2026-04-11T00:00:00Z — /fctry:evolve (document 5 code-ahead features)

- Frontmatter: version 1.1.0 → 1.2.0, date updated, synopsis patterns/goals expanded [structural]
- Configuration Profiles: New section — save/activate/list/show/delete named config snapshots capturing client assignments, rules, and settings [added]
- `#cli-surface`: Added profiles subcommand group (save, activate, list, show, delete) [modified]
- `#config`: Added settings and profiles fields to config schema example [modified]
- `#sync` / Group Split Suggestions: New subsection — keyword-categorized server grouping proposals for high tool counts [added]
- `#registry` / Secret Scanning: New subsection — regex detection of 8 credential patterns in env values and skill content [added]
- `#registry` / Local Capability Search: Expanded with query alias expansion (~30 mappings), multi-signal quality scoring, usage-based self-learning search [modified]
- `#changelog`: Added 1.2.0 entry [modified]
(4 modified, 3 added, 0 removed)

## 2026-03-30T18:00:00Z — /fctry:evolve (TypeScript rewrite — mcpoyle → Ensemble)

- Frontmatter: version 0.15.0 → 1.0.0, synopsis rewritten for library-first TypeScript identity [structural]
- `#philosophy`: Rewritten for library-first identity — pure functions, app integration, CLI as thin wrapper [modified]
- `#solution`: Updated for TypeScript library + CLI architecture, Chorus integration [modified]
- `#library-api`: New section — package exports, config loading pattern, operations as pure functions, Zod schema exports, client resolution API, registry API, integration guidance for app consumers [added]
- `#cli-surface`: Renamed all commands mcpoyle → ensemble, added `ens` alias, noted Commander.js [modified]
- `#tui-surface`: Removed entirely — Chorus is the GUI layer [removed]
- `#config`: Config path ~/.config/mcpoyle/ → ~/.config/ensemble/, skills/cache paths updated [modified]
- `#config` / Migration from mcpoyle: New subsection — automatic migration of config, skills store, cache, client markers, meta-skill [added]
- `#skills-management`: Renamed mcpoyle → Ensemble throughout, updated meta-skill to ensemble-usage [modified]
- `#project-registry`: Updated for better-sqlite3, removed TUI projects tab reference [modified]
- `#plugins`: Renamed mcpoyle → Ensemble throughout [modified]
- `#marketplaces`: Renamed mcpoyle → Ensemble throughout [modified]
- `#sync`: Renamed mcpoyle → Ensemble throughout, updated marker to __ensemble [modified]
- `#init`: Renamed mcpoyle → Ensemble, updated meta-skill name, removed TUI reference from setup complete message [modified]
- `#doctor`: Renamed mcpoyle → Ensemble, updated marker to __ensemble [modified]
- `#registry`: Renamed mcpoyle → Ensemble throughout [modified]
- `#tech-stack`: Python/click/Textual/httpx/hatch → TypeScript/Commander.js/Zod/Vitest/Biome/tsup/npm + new deps [modified]
- `#non-goals`: Added GUI/TUI non-goal (Chorus handles UI), added live MCP connections non-goal [modified]
- `#architecture`: Restructured for TS modules, library-first layout, removed tui.py, added index.ts public API surface [modified]
- `#design-principles`: Added library-first principle, updated marker __mcpoyle → __ensemble, backup .mcpoyle-backup → .ensemble-backup [modified]
- `#validated-designs`: Renamed mcpoyle → Ensemble [modified]
- `#references`: No changes [unchanged]
- `#future`: Renamed mcpoyle → Ensemble [modified]
- `#changelog`: Added 1.0.0 entry for TypeScript rewrite [modified]
- `.fctry/config.json`: spec version 0.15.0 → 1.0.0, external propagation targets updated for package.json [structural]
(18 modified, 2 added, 1 removed)

## 2026-03-30T00:00:00Z — /fctry:ref (skills management research incorporation)

<!-- research-trace
sources_visited: 8
patterns_extracted: 16
discard_rate: 0%
trace:
- url: https://github.com/smith-horn/skillsmith
  type: repo
  disposition: extracted
  reason: Trust tiers, quality scoring, dependency intelligence, hybrid search, compatibility metadata, security scanning
- url: https://github.com/inceptyon-labs/TARS
  type: repo
  disposition: extracted
  reason: Profile-as-plugin, collision detection, diff-plan-apply, scope hierarchy, pin/track modes, ConfigOps trait, CLAUDE.md overlay
- url: https://github.com/christiananagnostou/skillbox
  type: repo
  disposition: extracted
  reason: Canonical store + symlink fan-out, dual scope, auto-detect agents, checksum updates, repo-as-catalog, self-referential skill
- url: https://github.com/walidboulanouar/ay-claude-templates
  type: repo
  disposition: extracted
  reason: Seven content-type taxonomy, auto-registration, bundle install, manifest dependencies, version rollback, verification
- url: https://github.com/caliber-ai-org/ai-setup
  type: repo
  disposition: extracted
  reason: Content-hash state comparison, skill format, federated discovery, deterministic scoring, manifest undo, quality gate, builtin skills
- url: https://github.com/skillsgate/skillsgate
  type: repo
  disposition: extracted
  reason: Canonical + symlink, lock file, multi-source parser, hash sync, security scanning, agent-selective removal
- url: https://github.com/lasoons/AgentSkillsManager
  type: repo
  disposition: extracted
  reason: IDE-specific skills dirs, cloud catalog (58K skills), hash conflict detection, git-cached browsing, preset repos
- url: https://github.com/iannuttall/dotagents
  type: repo
  disposition: extracted
  reason: Symlink fan-out, dual scope, migration with conflicts, backup+undo, skill frontmatter validation, client path mapping
decision_chain: Researched all 8 repos in parallel. 7/8 converge on SKILL.md as the skill format. Symlink fan-out is the dominant distribution pattern (3/8). All pass as dependencies — patterns are more valuable than code. Skills management emerges as a natural scope expansion for mcpoyle.
-->

- Frontmatter: version 0.14.0 → 0.15.0, synopsis updated to include skills [structural]
- `#core-concepts`: Added Skill, Trust Tier definitions; updated Group, Client, Sync, Origin definitions [modified]
- `#problem`: Added skills fragmentation paragraph [modified]
- `#solution`: Updated to include skills and dual sync strategy [modified]
- `#cli-surface`: Added `mcpoyle add <source>` (unified source parser), `skills` command group, `groups add-skill/remove-skill/export` [modified]
- `#tui-surface`: Added Skills tab (tab 2), shifted other tabs, added skills support indicator to Clients tab [modified]
- `#config`: Added Skill model to config schema, added `skills` field to Group model [modified]
- Skill Model Fields: New subsection — name, enabled, description, path, origin, dependencies, tags, mode [added]
- Provenance Modes (Pin/Track): New subsection — track vs pin modes for servers and skills [added]
- Dependency Intelligence: New subsection — skills declare server dependencies, advisory not enforced [added]
- Skills Management: New section — canonical store, symlink fan-out sync, client skills directory mapping, builtin meta-skill, skills catalog integration (claude-plugins.dev), collision detection [added]
- `#init`: Added skills import step, meta-skill install step, updated output example [modified]
- `#doctor`: Added structured scoring (categories, points, fix suggestions), 4 new checks (broken symlink, unresolved deps, tracked drift, cross-client parity) [modified]
- `#registry`: Added unified source parser, trust tier assignment on install, pre-install security summary, quality signals subsection [modified]
- `#search`: Updated to include skills in local capability search [modified]
- `#sync`: Updated header and description for three-entity sync (servers, skills, plugins) [modified]
- Marketplaces: Added profile-as-plugin packaging subsection [added]
- `#architecture`: Added Skill to config.py, skills_dir to clients.py, dual strategy to sync.py, search.py module, catalog to registry.py [modified]
- `#future`: Replaced SkillsGate line with deep integration note [modified]
- Validated Designs: Added SKILL.md format, symlink fan-out, advisory dependencies validations [modified]
- References: Added 8 new external references (skillsmith, TARS, skillbox, ay-claude, caliber, skillsgate, AgentSkillsManager, dotagents) [added]
- Changelog: Added 0.15.0 entry [modified]
(14 modified, 6 added, 0 removed)

## 2026-03-28T00:00:00Z — /fctry:ref (research incorporation)

<!-- research-trace
  Sources: Klavis-AI/klavis (open-strata), lydakis/mcpx
  Patterns confirmed: 8 (all user-approved)
  State Owner gaps addressed: 6 (HTTP transport, tool metadata, mcpx client, registry adapters, origin tracking, context cost)
  Validated without change: drift detection (hash-based), no-daemon architecture
  Deferred to Future: virtual server mapping, multi-group assignments
-->

- Frontmatter: version 0.13.0 → 0.14.0, synopsis updated [structural]
- Core Concepts: Added Origin definition, expanded Server definition [modified]
- CLI Surface: Added `registry backends` and `search <query>` commands [modified]
- Config / Server Model: Added HTTP transport fields (`url`, `auth_type`, `auth_ref`), origin tracking, tool metadata [added]
- Init / Flow: Added auto-discovery display step before import, updated output example [modified]
- Sync / Drift Detection: Enriched drift messages with origin provenance [modified]
- Sync / Context Cost Awareness: New subsection — tool count/token estimate warning on sync [added]
- Doctor / Checks: Added missing tool metadata info check, origin context in drift messages [modified]
- Registry: Added adapter pattern, metadata caching, tool metadata storage, local capability search subsections [added]
- Supported Clients: Added mcpx as 18th client (TOML format) [added]
- Non-Goals: Expanded no-daemon with validation rationale from mcpx research [modified]
- Architecture: Updated registry.py description to reflect adapter framework [modified]
- Design Principles: Cross-referenced no-daemon validation [modified]
- Future: Added virtual server mapping pattern [added]
- Validated Designs: New section documenting externally confirmed patterns [added]
- References: New section citing Klavis-AI/klavis and lydakis/mcpx [added]
- Changelog: Added 0.14.0 entry [modified]
(9 modified, 6 added, 0 removed)

## 2026-03-12T00:00:00Z — /fctry:evolve

- `#philosophy`: Added TUI as human-optimized surface alongside CLI
- `#non-goals`: Removed "GUI / TUI" entry — TUI now in scope
- `#tui-surface` (new): Added full TUI section — dashboard panels, navigation, actions, sync preview, command palette
- `#architecture`: Added operations layer module, expanded to module table, CLI and TUI as thin presentation layers
- `#tech-stack`: Added Textual framework
- `#changelog`: Added 0.6.0 entry
- Frontmatter: version 0.5.0 → 0.6.0, status draft → active, synopsis added
- Spec config version: 0.4.0 → 0.5.0
