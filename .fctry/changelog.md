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
