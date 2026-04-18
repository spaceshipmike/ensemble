## 2026-04-18 — chunk 10: desktop tRPC sub-routers + retro fixes (v1.2.3)

Completes desktop IPC coverage for every v2.0.1 resource type and folds in
the chunks 4–7 retro follow-up on the stale `DOCTOR · SOON` assertion.

### Added

- `agentsRouter` — `list` / `show` / `setOrAdd` / `remove` on the canonical
  `config.agents` store.
- `commandsRouter` — same four procedures on `config.commands`.
- `hooksRouter` — `list` / `show` / `setOrAdd` / `remove` on the
  file-backed canonical hook store (`~/.config/ensemble/hooks/`).
- `settingsRouter` — `list` / `show` / `setOrAdd` / `remove` on the
  managed-settings store from chunk 8.

Each sub-router mirrors the `snapshotsRouter` shape (reads = queries,
writes = mutations, zod-validated input, one `fresh()`-backed config read
per mutation, `saveConfig()` on success). All four are wired into
`appRouter` at the root.

### Fixed

- `packages/desktop/e2e/layout.spec.ts` — removed the stale
  `DOCTOR · SOON` text assertion. The placeholder was replaced by the
  real `DoctorView` in an earlier chunk; the e2e assertion now checks
  that the DOCTOR tab is active instead. Playwright Electron launch is
  still broken from prior sessions (same as chunks 4–7 retro); the
  snapshots spec remains unrunnable locally and is logged as a
  known-blocked follow-up rather than a chunk-10 regression.

### Tests

- `packages/desktop/src/main/ipc/router.test.ts` — +12 new tests (3 per
  sub-router × 4 routers). Mocks for every new pure operation and the
  hook + managed-settings stores. 46/46 router tests green.

### Files

- `packages/desktop/src/main/ipc/router.ts` — imports + four new
  sub-routers + appRouter wiring.
- `packages/desktop/src/main/ipc/router.test.ts` — mocks + +12 tests.
- `packages/desktop/e2e/layout.spec.ts` — DOCTOR · SOON assertion fix.
- `CLAUDE.md` — IPC coverage note.

### Version

External 1.2.2 → 1.2.3 (auto patch bump on commit). Closes chunk 10 of
the chunks 8–10 build block. No user-visible scenario maps directly to
this chunk — it completes the desktop surface that the §Managed Agents /
Commands / Hooks / Settings scenarios reach through the renderer.

---

## 2026-04-18 — chunk 9: browse engine + CLI + desktop wiring (v1.2.2)

Post-evolve browse shipping. The v2.0 browse engine lands as a pure-function
library primitive, the `ensemble browse` CLI prints plain-text results, and
the desktop app gets a Registry view backed by the same engine.

### Added

- `src/browse.ts` — pure-function primitive:
  - `browseSearch(config, options) → BrowseResult[]` fuzzy-matches library
    + discoverable entries and merges them into a ranked list (`installed`
    before `library` before `discoverable`, ties broken by fuzzy score).
  - `parseMarketplaceFilter(raw)` extracts `@marketplace/rest` filter chips
    from the query string.
  - `fuzzyScore(query, candidate)` — dependency-free subsequence match with
    gap/length/start-position penalties. Returns `null` on no match.
  - Default limit 50 rows; callers override via `{ limit }`.
- `ensemble browse [query...] [--type <t>] [--marketplace <m>] [--limit N]`
  — plain-text row output: `NAME  TYPE  SOURCE  [state]  (install cmd
  when discoverable)`.
- `browseRouter` in `packages/desktop/src/main/ipc/router.ts` — one
  `list` query procedure with `{ query, type, marketplace, limit }` input.
  Wired into `appRouter` under `browse`.
- `packages/desktop/src/renderer/src/views/RegistryView.tsx` — minimal
  Registry view with a search box, type filter, and results table. New
  REGISTRY tab in App.tsx.

### Tests

- `tests/browse.test.ts` — +14 new tests covering filter parsing,
  fuzzy scoring, ranking order across tiers, --type filter, --marketplace
  filter, discoverable install commands, and --limit.
- `tests/cli.test.ts` — +4 new tests for the `ensemble browse` CLI
  (empty library, library entry surfaced, --type filter, --limit
  validation).
- `packages/desktop/src/main/ipc/router.test.ts` — +3 tests covering
  the new `browse.list` contract (default results, type filter, fuzzy
  query filter).

All tests green: 430/430 across the library + CLI suite; 34/34 in the
desktop router contract test.

### Barrel exports

`src/index.ts` now exports the browse primitive, the lifecycle dispatcher,
and the managed-settings store so both the CLI and the desktop package
consume them through the published `ensemble` surface.

### Scenarios closed

- Non-Interactive Text Listing of Installed and Discoverable Resources
  (scenarios.md:1993)
- Fuzzy Search Across Installed and Discoverable Resources
  (scenarios.md:2008)
- Marketplace Filter Syntax Narrows Results (scenarios.md:2023)

### Files

- `src/browse.ts` (new), `src/index.ts` (barrel additions), `src/cli/index.ts`
  (new `browse` command), `CLAUDE.md` (browse module row).
- `packages/desktop/src/main/ipc/router.ts` (browseSearch import + new
  `browseRouter`), `packages/desktop/src/main/ipc/router.test.ts`
  (browseSearch mock + 3 tests).
- `packages/desktop/src/renderer/src/views/RegistryView.tsx` (new),
  `packages/desktop/src/renderer/src/App.tsx` (Registry tab wiring).
- `tests/browse.test.ts` (new), `tests/cli.test.ts` (browse CLI tests).

---

## 2026-04-18 — chunk 8: CLI lifecycle rewrite + settings verbs (v1.2.0)

Public-surface break — external version 1.1.2 → 1.2.0. The v2.0.1 noun-first CLI grammar lands alongside the long-deferred `ensemble settings` verb group.

### Added

- `ensemble pull <source> [--type <type>]` — routes through the existing add paths for the four source forms: `owner/repo` → marketplace add, `./path`/absolute path → local library add (SKILL.md → skill, plugin manifest → plugin), `registry:<slug>` → registry add hint, URL → marketplace add via git/url source. `--type` disambiguates inference for local directories that could host multiple resource types.
- `ensemble install <name> [--client <id>] [--type <type>] [--project <path>] [--scope global|project]` — installs a library resource onto a client. Infers type when unambiguous.
- `ensemble uninstall <name> [--client <id>] [--type <type>] [--project <path>]` — removes from a client but keeps the library entry.
- `ensemble remove <name> [--type <type>]` — destructive library removal. Retains the v1.3 orphan-detection hint when no type is given.
- `ensemble library list [--type <type>] [--installed|--not-installed]` — one row per library entry with an install-state badge.
- `ensemble library show <name> [--type <type>]` — per-entry detail with install matrix.
- `ensemble library pivot <type>` — type-filtered library print.
- `ensemble settings set <key> <value> [--client <id>] [--notes <text>]` — records a managed setting. Value parses as JSON (falls back to literal string).
- `ensemble settings unset <key> [--client <id>]` — stops managing a key; the underlying value in `settings.json` stays in place.
- `ensemble settings list [--client <id>]` — list every managed key with its current value.
- `ensemble settings show <key> [--client <id>]` — single-key view.
- `ensemble settings sync [--client <id>]` — re-applies managed settings to `settings.json` via `mergeSettings()`. v2.0.1 wires `claude-code` only; other clients routed in a follow-up.

### Deleted (per spec §Retained Surface Deletions)

- `ensemble enable <server>` / `ensemble disable <server>` — replaced by `ensemble install` / `ensemble uninstall`.
- `ensemble plugins install` / `plugins uninstall` / `plugins enable` / `plugins disable` — replaced by the top-level noun-first verbs.

### New modules

- `src/lifecycle.ts` — noun-first verb dispatcher. Pure functions returning `{ config, result }`; no I/O.
- `src/managed-settings.ts` — canonical managed-settings store at `~/.config/ensemble/managed-settings.json`.

### Tests

- `tests/cli.test.ts` — +29 new tests across the new verbs (happy path + error path for each). All 408 tests green.

### Scenarios closed

- `#settings` (Declarative settings.json Key Management, scenarios.md:1879).
- Critical paths for §Library-First Resource Intake and §Install State Matrix.

### Files

- `src/cli/index.ts` — new lifecycle and settings verb groups; top-level `enable`/`disable` and `plugins install|uninstall|enable|disable` deleted; version string bumped.
- `src/lifecycle.ts` (new), `src/managed-settings.ts` (new).
- `tests/cli.test.ts` — +29 tests; updated the version assertion to `1.2.0`.
- `package.json` + `.fctry/config.json` — external 1.1.2 → 1.2.0.
- `CLAUDE.md` — new modules documented in the architecture table.

---

## 2026-04-18 — /fctry:evolve browse — TUI scope dropped

Scope reduction evolve. Dropped the TUI presentation layer from browse. `browse.ts` stays as a pure-function library primitive (fuzzy search + `@marketplace` filter parsing); the electron Registry view and a plain-text `ensemble browse` CLI both consume the same engine. Ink dependency removed from §Tech Stack. Card/Slim render modes and one-key TUI install removed from §CLI Surface. Browse TUI scenario feature block reworked to Browse Engine (4 → 3 scenarios). Spec version 2.3.0 → 2.4.0.

### Changes

- §Architecture → Modules (v2.0.1 targets): `browse.ts` row now describes it as a library discovery engine (pure-function primitive) rather than a TUI-grade engine.
- §CLI Surface: `ensemble browse` is plain-text output; `--view card|slim` flag removed; "interactive TUI browser" / "one-key install" language dropped.
- §Library API: `browse` subpath-export mention drops "TUI-grade discovery surface".
- §Desktop App: removed the "ensemble browse (the TUI) defaults to the Library pivot" sentence — pivots live in the electron Registry, not the CLI.
- §Tech Stack: Ink line removed; fuzzysort retained as a pure-function library primitive.
- §Architecture → Standalone GUI framework non-goal: removed the Ink-specific clause.
- §Future: fuzzySearchAll entry updated to reference the `browse.ts` library primitive rather than "the TUI".
- §Synopsis: regenerated medium / readme / tech-stack / patterns / goals to drop TUI / Ink / Card/Slim / one-key-install references.

### Scenarios

Scenario Crafter reworked `.fctry/scenarios.md` §Browse TUI → §Browse Engine. Scenario count 4 → 3 (dropped the Card/Slim view toggle scenario; revised the interactive-TUI scenario to describe plain-text CLI output; kept `@marketplace` filter + fuzzy-match scenarios).

### Ready to Build

`browse.ts` remains target-flagged; its scope is now smaller and simpler. Can ship as chunk 9 (or concurrent with chunk 8 lifecycle rewrite, since it has fewer unknowns now).

---

## 2026-04-18 — /fctry:review (v1.1.2) — 4 code-ahead drift fixes

Post-v1.1.2 review. State Owner found four code-ahead drifts (spec text trailing shipped code) plus one scenario-unsatisfiability (`#settings` scenario promises CLI verbs that don't exist). User approved the four spec fixes and deferred the settings CLI verbs to chunk 8's lifecycle rewrite. Spec version unchanged (2.3.0) — review is spec maintenance, not evolution.

### Changes

- **§Desktop App → IPC Architecture (spec.md:884)** `[modified]` — added `snapshots` to the sub-router inventory sentence (landed via chunk 7 `snapshotsRouter` in `packages/desktop/src/main/ipc/router.ts:838`). Removed `snapshots` from the target-status banner at L880 — banner now covers only the still-unbuilt target routers (`agents`, `commands`, `hooks`, `settings`, `browse`).
- **§Doctor → Checks table (spec.md:1816)** `[modified]` — appended four rows matching the additive checks shipped in chunk 6: orphan snapshots (capability, info), snapshot dir size (capability, warning — 500 MB default), agents/commands drift (freshness, warning — v2.0.4 artifact-hash strategy extended to two new resource types), retention-config visibility (capability, info).
- **§Design Principles #2 and #8 (spec.md:2227, 2233)** `[modified]` — widened "servers" → "servers, skills, plugins, agents, commands, hooks, and managed settings keys" to match shipped code (syncAgents/syncCommands additive gates) and the CLAUDE.md parity. #8 also acknowledges the two marker forms: `__ensemble: true` for JSON, `ensemble: managed` frontmatter for markdown resources.
- **§CLI Surface → Target-status banner (spec.md:518)** `[modified]` — rewrote the banner to reflect shipped reality. The v1.3-style per-type group grammar (`agents` / `commands` / `plugins` / `skills` / `hook` with `list`/`add`/`remove`/`install`/`uninstall` verbs) ships today. Top-level lifecycle verbs (`pull`/`install`/`uninstall`/`remove`, `library`, `browse`) remain target. Added explicit callout that `settings` group is not yet wired (pending for chunk 8 per the `#settings` scenario L1879). Aspirational verb prose at L676–691 intentionally preserved as forward-looking — it will match reality after chunk 8.

### Deferred

- **`#settings` scenario (scenarios.md:1879)** — promises `ensemble settings set/unset/list` CLI verbs that don't exist in `src/cli/index.ts`. User chose to defer to chunk 8's full CLI lifecycle rewrite rather than ship a one-off settings-only CLI chunk that chunk 8 would then reshape.

### CLAUDE.md

No drift this pass. The v1.1.0 release commit already widened the additive-sync rule and added agents/commands rows.

### Synopsis

Not regenerated. Review edits do not shift product stance or tech stack.

### Health at close

Clean. Remaining v2.0.1 targets: `browse.ts`, `import-legacy.ts`, CLI lifecycle verb rewrite (chunk 8), settings CLI verbs (folded into chunk 8).

---

## 2026-04-18 — v1.1.0 release — v2.0.1 slim cut feature-complete

Milestone 2 from the /fctry:execute chunks-4-7 build. External version bumped 1.0.14 → 1.1.0. Marks the feature-complete v2.0.1 slim cut: chunks 1–7 shipped snapshots + safe-apply, settings.json declarative merge, hooks store, agents store, commands store, doctor v2 additive checks, and the desktop snapshots inspector. Spec parity update folded in: §Architecture → Modules (built) now includes `agents.ts` + `commands.ts`; Modules (v2.0.1 targets) reduced to `browse.ts` + `import-legacy.ts`. CLAUDE.md built table gained the two rows; additive-sync rule widened to include agents, commands, hooks, and managed settings keys.

---

## 2026-04-18 — /fctry:review — 1 spec drift + 5 CLAUDE.md drift resolved

Incremental review after today's architecture evolve. State Owner found one real spec drift (§Desktop App → IPC Architecture router inventory stale) and CLAUDE.md stale on two fronts: (a) yesterday's review claimed registry.ts + doctor.ts row fixes that never landed in the working tree, (b) today's evolve collapsed the target blocks but didn't add the promoted modules to CLAUDE.md's built table. User approved all recommendations at the inline action prompts. Spec version unchanged (2.3.0) — review is spec maintenance, not evolution.

### Changes

- **§Desktop App → IPC Architecture** `[modified]` — sub-router inventory sentence updated to match the shipped `appRouter`: added `notes`, removed phantom `registry`, de-duplicated `rules`. Final list: config, servers, groups, projects, library, clients, sync, plugins, marketplaces, skills, rules, profiles, collisions, search, doctor, notes. Target-status note at line 880 still covers the unbuilt target-router set.

### CLAUDE.md

- Added rows for `hooks.ts`, `settings.ts`, `snapshots.ts` in the built modules table — matches today's spec promotion.
- Expanded `sync.ts` role: + "non-destructive hook/settings merge, pre-sync snapshot creation".
- Removed stale "dynamic marketplace discovery" from `registry.ts` row (applied the yesterday-deferred edit).
- Updated `doctor.ts` row: "5 categories" → "6 categories (adds `capability`)" (applied the yesterday-deferred edit; doctor.ts:26 lists 6 category values).
- Reworded Project description (L5) to reflect hooks/settings as built rather than "v2.0.1 expands scope to"; called out the remaining three target modules (`agents.ts`, `commands.ts`, `browse.ts`) explicitly.

### Synopsis

Not regenerated. Review edits do not shift product stance.

### Health at close

Clean on covered sections. One caveat: if any future review or evolve again claims to edit CLAUDE.md, verify the edit actually landed — yesterday's changelog claimed two edits that never hit the working tree, which this review caught and applied.

---

## 2026-04-18 — /fctry:evolve §Architecture — promote built modules; collapse CLAUDE.md target blocks; tree nits

Pure descriptive drift-cleanup evolve. Chunks 1–3 of the v2.0.1 slim cut landed overnight (`src/snapshots.ts`, `src/settings.ts`, `src/hooks.ts`); spec and CLAUDE.md both still described them as unbuilt. User selected "fold into this evolve" at the drift resolution prompt; Interviewer confirmed no new scope beyond the cleanup. Spec Writer executed mechanically. Spec version bumped 2.2.0 → 2.3.0 per auto-on-evolve rule.

### Changes

- **§Architecture → Modules (built)** `[modified]` — added rows for `hooks.ts`, `settings.ts`, `snapshots.ts` (promoted from the v2.0.1 target table with present-tense role descriptions). Placed in the operations-layer cluster alongside `secrets.ts` / `usage.ts` / `setlist.ts`.
- **§Architecture → `sync.ts` row** `[modified]` — role expanded to include "non-destructive hook/settings merge, pre-sync snapshot creation, drift detection" per the spec's own promotion rule (sync.ts imports all three new modules and uses them in the sync path).
- **§Architecture → Modules (v2.0.1 targets)** `[modified]` — removed `hooks.ts`, `settings.ts`, `snapshots.ts` rows. Table now holds four unbuilt targets: `agents.ts`, `commands.ts`, `browse.ts`, `import-legacy.ts`.
- **§Architecture → closing paragraph** `[modified]` — shortened to a single forward-looking sentence ("When any remaining target module lands, move its row up …"). The now-fired sync.ts promotion note dropped.
- **§Architecture → ASCII tree** `[modified]` — (a) inline targets comment updated to list only the four remaining unbuilt targets; (b) `views/` example comment corrected to `Top-level views (Matrix, Doctor)` matching the actual Matrix-centric UI; (c) phantom `tailwind.config.ts` line removed (Tailwind v4 uses the Vite plugin).

### CLAUDE.md

- Both v2.0.1 blocks collapsed to a single pointer line after the built modules table: `**v2.0.1 targets:** See .fctry/spec.md §Architecture → Modules (v2.0.1 targets) …`. This closes a follow-up that was queued but never ran from the 2026-04-17 evolve; it was doubly out-of-date because it still claimed `hooks.ts`/`settings.ts`/`snapshots.ts` don't exist.

### Synopsis

Not regenerated. No goals/patterns/tech-stack changes — the three promoted modules were already enumerated in `goals` (hook lifecycle management, declarative settings.json management, safe apply with rollback snapshots) as v2.0.1 ambitions.

### Scenarios

Unchanged. Scenario Crafter confirmed all four drift items are documentary — no user-observable behavior change.

---

## 2026-04-18 — /fctry:review — 4 drift items resolved; health 94/100 → clean

Full-spec review. State Owner found 7 spec-ahead / 2 code-ahead / 1 diverged item; 5 were already covered by §Architecture's freshly-added v2.0.1 target annotation. User approved all four recommendations at the inline action prompts. Spec version unchanged (2.2.0) — review is spec maintenance, not evolution.

### Changes

- **§Doctor → Structured Scoring** `[modified]` — added 6th scoring category `Capability` (code-ahead fix; `src/doctor.ts` already emits `category: "capability"` for setlist-integrated capability findings; spec was stale).
- **§Library API → Registry API** `[modified]` + **§Core Concepts → Marketplace definition** `[modified]` + **§Architecture module row for `registry.ts`** `[modified]` — removed `discoverMarketplaces()` and `fuzzySearchAll()` from the Registry API import list and runtime-function list. Both deferred to §Future with explanatory lines. Rationale: they were promised in existing built modules (`registry.ts`, `search.ts`) and hadn't been tagged as target behavior — couldn't hide behind the v2.0.1 target-module shelter.
- **§Future** `[added]` — two new bullets: dynamic marketplace auto-discovery, unified installed-plus-discoverable fuzzy search. Explains why both are deferred.
- **§Experience POV → Pillar 1 bullet "Edits stage as pending changes"** `[modified]` — softened to "Matrix wire toggles stage; other edits commit immediately." Matches the renderer's actual behavior (`App.tsx`, `MatrixView.tsx`, `LibraryPanel.tsx` dispatch `useMutation` immediately; only Matrix wire toggles accumulate into a batch). Pending-set infrastructure can be reintroduced for any future bulk gesture, but is no longer a blanket UX contract.
- **§Library API → Package Exports banner** `[added]`, **§Library API → Zod Schema Exports banner** `[added]`, **§CLI Surface → Lifecycle Verbs banner** `[added]`, **§Desktop App → IPC Architecture banner** `[added]` — each flags the relevant v2.0.1 target surface and cross-references §Architecture → Modules (v2.0.1 targets) so readers arriving mid-section see the target status inline.
- **§Architecture → Modules (built)** `[modified]` — added rows for `packages/desktop/src/main/auto-update.ts` and `packages/desktop/src/main/config-watcher.ts`, closing the two desktop-main orphans the State Owner flagged.

### CLAUDE.md

- Updated `registry.ts` row (removed stale "dynamic marketplace discovery" after demotion).
- Updated `doctor.ts` row from "5 categories" to "6 categories (adds `capability` …)".

### Synopsis

Not regenerated. Review edits do not shift product stance, tech stack, or pattern vocabulary.

### Health at close

94/100 (good). Remaining flagged claim: `plugin-version: 0.82.0` in frontmatter vs. `external: 1.0.7` in `config.json` — these measure different things (fctry plugin format version vs. ensemble npm package version); claims-verification treats them as comparable and flags the mismatch. Separate fix via `./scripts/bump-version.sh` if noise becomes a problem.

---

## 2026-04-17 — /fctry:evolve §Architecture — split built vs. v2.0.1 targets; add src/discovery/ subsystem

§Architecture split into two sub-tables under fresh subheadings: `### Modules (built)` and `### Modules (v2.0.1 targets)`. The latter is now the canonical home for the target-vs-built distinction — `CLAUDE.md`'s "Target modules / Target rules" blocks will be collapsed into a pointer to this section in a follow-up (not part of this evolve).

### Changes

- **§Architecture intro** `[modified]` — new paragraph introducing the `src/discovery/` subsystem and calling out the `src/discovery/projects.ts` vs `src/projects.ts` naming collision.
- **§Architecture ASCII tree** `[modified] [structural]` — reordered `src/` to roughly match alphabetical-ish on-disk layout; added `init.ts`, `export.ts`, and a `discovery/` directory block (`library-store.ts`, `library.ts`, `projects.ts`, `wire.ts`); removed the v2.0.1 target files from the built tree (`agents.ts`, `commands.ts`, `hooks.ts`, `settings.ts`, `snapshots.ts`, `browse.ts`) and added a trailing comment line pointing to `### Modules (v2.0.1 targets)`; renderer tree renamed `pages/` → `views/` and added `panels/`.
- **§Architecture module table** `[structural]` — replaced the single flat table with `### Modules (built)` and `### Modules (v2.0.1 targets)` sub-tables. Added rows for `init.ts`, `export.ts`, `discovery/library-store.ts`, `discovery/library.ts`, `discovery/projects.ts`, `discovery/wire.ts`. Trimmed `sync.ts` role string to present-tense reality (removed "hook/settings merge, snapshot creation", which are v2.0.1 targets) and added a note that it reclaims those responsibilities when hooks/settings/snapshots land. Cross-linked `projects.ts` ↔ `discovery/projects.ts` to disambiguate. Moved `agents.ts`, `commands.ts`, `hooks.ts`, `settings.ts`, `snapshots.ts`, `browse.ts`, `import-legacy.ts` into the targets sub-table.

(1 added subsection-pair, 3 modified, 0 removed rows — target rows relocated rather than deleted.)

### Synopsis

Not regenerated. This is a descriptive architecture refactor; none of the six synopsis fields (short, medium, readme, tech-stack, patterns, goals) materially change. Product stance, tech stack, and pattern vocabulary are unchanged.

### Follow-up owed

- `CLAUDE.md` "Target modules (v2.0.1, not yet built)" and "Target rules (v2.0.1, not yet enforced)" blocks to be replaced with a pointer to §Architecture → Modules (v2.0.1 targets). Out of scope for this evolve.

---

## 2026-04-17T18:00:00Z — /fctry:ref batch: Experience POV across 12 UX references (new top-level section, Claude-Code-first scope sequencing, three pillars)

Spec version bumped 2.0.5 → 2.1.0. Minor bump (not patch) because this is a product-level declaration of intent, not a refinement — the POV reframes how every existing section is read.

### Scope sequencing decision (load-bearing)

**Ensemble is Claude-Code-first, multi-client second.** All seven resource types + full lifecycle land end-to-end for Claude Code before other clients expand beyond the already-shipped MCP/skills fan-out. The 21-client vision is preserved; the ordering is fixed. This flips the earlier "cross-client platform manager" primary frame while keeping breadth as a real secondary offering. Decision memory: setlist `0e26acb4bb2642449304b001d4dd3fcb` (type=decision, scope=project).

### New top-level section: §Experience POV (v2.1.0)

Declares the **Frictionless through anticipation** principle: every UI surface answers the user's next question before they ask it; presence, state, scope, provenance, destination, and consequence are ambient rather than hidden. Three pillars organize the principle across major surfaces:

- **Pillar 1 — Project-level tooling management.** Primary axis is project × Claude Code configuration. Multi-client fan-out is a secondary dimension for MCPs and skills only. Installation state, scope badges, pending-changes staging, effective-config preview, ambient progress.
- **Pillar 2 — Library building.** Unified across all seven types with type as filter. Migrate-don't-start-from-scratch. User collections cross boundaries. Pins + usage-based sort. Drag-first form-last. Schema-driven editors. Context cost previewable. `userNotes` first-class. Inline copy feedback.
- **Pillar 3 — Marketplace discovery.** One Explore surface blending curated + search + local + git with "already in library" dedup. Preview before install always. **Type-aware install destinations**: MCPs and skills offer multi-client pickers; plugins, agents, commands, hooks, and settings install to Claude Code only. Quality visible. Updates reviewable. Sources equal-weight with one sort vocabulary. Attribute brushing. Three-tier zoom.

Cross-cutting principles: atomic writes, forward-restore snapshots, scoped-and-gated restart guidance, undoable-at-the-boundary, persistent layout state, keyboard ergonomics, progressive credential consent. Explicit anti-pattern list (11 items). Six parked open questions carried forward.

### Sections touched

- **§Synopsis** (short/medium/readme) — reframed to lead with Claude Code depth; 21-client vision retained lower as "MCPs and skills additionally mirror across 16 other AI clients."
- **§Experience POV** (NEW) — full section with all subsections listed above.
- **§Desktop App → Matrix View** — reframed with `v2.0.2 — implemented; reframed v2.1.0` marker. Primary axis is now project × Claude Code resource types; multi-client mirror is secondary and only appears for MCPs and skills (never for plugins/agents/commands/hooks/settings).
- **§References** — extended with eleven new entries for the v2.1.0 UX batch (opcode, mcp-manager, clode-studio, history-viewer, loadout, agent-corral, aiplughub, skillsbar, agent-skills, skills-hub, chops) plus a v2.1.0 UX-retro note appended to the existing SkillDeck v2.0.5 entry.
- **Frontmatter** — `spec-version: 2.0.5 → 2.1.0`; `patterns` array extended with POV-level tokens (frictionless through anticipation, depth-first on Claude Code, project × Claude Code primary axis, type-aware install destinations, ambient state over navigation, and twenty-plus pillar-specific principles).
- **`.fctry/config.json`** — `versions.spec.current: 2.0.5 → 2.1.0`.

### Anti-patterns explicitly rejected (new in POV)

Premature generalization across clients (replaces v0.1 draft's "single-client lock-in" framing). Brand promises unshipped primitives. Per-artifact-type page fragmentation. Auto-select first item on list render. Auto-probe/register on modal mount. Silent feature scope cuts. Two sort vocabularies per source. Documentation sprawl as craft surrogate. Sidecar files leaking into user filesystem. Inconsistent error surfaces. Treating multi-client fan-out as the headline.

### Open questions carried forward (parked, not promised)

- Optional tray/menu-bar peek companion [skillsbar]
- AI compose panel with diff-accept gate [chops]
- Remote update subscription with pin [agent-corral]
- Context-budget-aware bundling [loadout + mcp-manager]
- Deploy primer / `ensemble run <profile>` [from v2.0.5 ATM ref, still parked]
- Shared canonical `~/.agents/skills/` store convention [from v2.0.5 SkillDeck ref; **now nuanced** by Claude-Code-first — relevant for MCPs/skills cross-client offering, less urgent for CC-only types]

### Reference batch (12 processed in parallel UX-focused researchers)

1. **winfunc/opcode** — Tauri Claude Code GUI (21.5k★). Contributed: segmented tab IA, transport-first add forms, imported-badge card grid, tab keyboard ergonomics, preview-before-import.
2. **brightwing-systems-llc/mcp-manager** — Tauri cross-client MCP manager. Contributed: detected-tools chip shelf, in-row warnings, pending-changes staging, Restart Banner with safety gate, graded search rows, token-budget bar.
3. **haidar-ali/clode-studio** — Vue/Nuxt + Electron AI IDE. Contributed: 3-dock modular workspace, ActivityBar, multi-instance with live status, WorktreeTabBar, MCP quick-add cards, state persistence.
4. **jhlee0409/claude-code-history-viewer** — Multi-provider viewer (984★). Contributed: three-tier zoom, provider tab-bar, attribute brushing, dual-mode metric cards, virtualized lanes, Escape-clears + sticky-brush.
5. **crossoverJie/SkillDeck** *(retro UX pass; architectural contributions already adopted at v2.0.5)* — SwiftUI macOS (313★). UX pass: ambient installation state per cell (already architectural at v2.0.5, now declared as a POV principle), inline copy feedback over toast banners, ambient `N/total` progress rather than modal dialogs, preview-before-install gate, equal-weight source sort vocabulary.
6. **amelmo/loadout** — Tauri 2 + React 19 + Zustand (6★, active). Contributed: two-phase Keychain consent, detected-only sync gating, idle-vs-active token split, identity-based skill grouping, drag-drop `.md` import, concept-first onboarding.
7. **llrowat/agent-corral** — Tauri v2 Claude-Code-only studio. Contributed: scope toggle + effective config view, repo registry as sidebar switcher, QuickSetup wizard, Config Linter, schema-driven forms, plugin auto-sync with pin.
8. **thanhwilliamle/aiplughub** — Tauri 2 + React 19 plugin manager (MIT, Windows preview). Contributed: side-by-side bundle compare, update review panel, scoped bundle export, bulk action bar, type education in first-run, install-all with sources picker.
9. **amandeepmittal/skillsbar** — SwiftUI macOS menu bar (MIT). Contributed: global hotkey + menu-bar popover, tabbed browsing with count badges, pinned favorites, recency signals, Most Used sort, cross-source collections.
10. **chrlsio/agent-skills** — Tauri + React + shadcn/ui (MIT). Contributed: sidebar-as-live-inventory, detection-branched dashboard cards, two-pane marketplace with deferred detail, installed/inherited/not-installed triad, multi-step Import Wizard with undo-on-cancel, file-watcher event bus.
11. **qufei1993/skills-hub** — Rust/Tauri 40-tool manager (MIT, 771★). Contributed: unified Explore page with Featured + search + dedup, scope toggle per skill with badges, onboarding migration, new-tool detection modal, equal-weight import sources, in-app skill detail with syntax highlighting.
12. **shpigford/chops** — SwiftUI macOS (1.2k★). Contributed: symlink-dedup identity rendering, sidebar count badges across buckets, inline AI compose panel with diff-review gate, registry discovery modal with multi-agent checklist, ellipsis-menu kind filter, persistent metadata footer.

All 12 repos MIT-licensed.

(1 new section, 5 sections modified, 0 removed)

<!-- research-trace
references_processed: 12 (11 new + 1 retro UX pass on previously-adopted SkillDeck)
positive_patterns_cited: 72 (6 per reference, counted from the References entries)
anti_patterns_identified: 33 (from 11 new references; SkillDeck retro did not list any)
anti_patterns_elevated_to_pov_rejection_list: 10 (from the 33 identified; see §POV / Rejected anti-patterns)
pillars_synthesized: 3 + cross-cutting (7 principles) + anti-patterns (11 rejected) + open questions (6 parked)
sources_visited: ~80 (each researcher touched 5-8 files per repo on average)
decision_chain: 12 UX-focused researchers ran in parallel (one per reference, compressed briefs 350-500 words each, UX/interaction/layout/ergonomics focus rather than architecture/data-model which was already covered in prior v2.0.4 and v2.0.5 passes) → manual synthesis into three-pillar POV with Claude-Code-first scope stance surfacing as a load-bearing decision discovered mid-synthesis ("full functionality is Claude Code only; skills and MCPs for other clients is a viable narrower offering") → user confirmed Top-7 from v0.1 draft → Spec Writer landed §Experience POV as new top-level section, reframed Matrix View, revised synopsis, extended References with 11 new entries + 1 SkillDeck retro note; spec writer overload error interrupted the mechanical finishing tasks (config.json version bump, state.json spec-writer append, this changelog entry), which were completed manually; a subsequent cleanup pass audited attribution accuracy, voice consistency, reference ordering, and cross-reference coherence against the established v2.0.5 entries' conventions.
license_note: all 12 UX-batch references MIT-licensed with explicit LICENSE files — no ambiguity.
-->

## 2026-04-17T12:00:00Z — /fctry:ref batch: crossoverJie/SkillDeck + DatafyingTech/Claude-Agent-Team-Manager (6 patterns adopted, 4 dismissed, 2 deferred)

Spec version bumped 2.0.4 → 2.0.5. Six patterns adopted across two references processed in a single batch. Both references are MIT-licensed with explicit LICENSE files — no ambiguity.

**Adopted:**
- `§Core Concepts → Resource Types → Typed Variables` (new v2.0.5 subsection): [added] four-kind variable taxonomy (`text`, `note`, `api-key`, `password`) with root-to-leaf inheritance (profile → group → resource), name-based override with kind-match validation; `ResourceVariableSchema` added to Zod exports; orthogonal to `op://` convention. Source: DatafyingTech/Claude-Agent-Team-Manager `src/types/aui-node.ts NodeVariable` + `USAGE.md`.
- `§Desktop App → Matrix View` (Installation states block, v2.0.5): [added] cell-state vocabulary — `direct`, `inherited` (reads source client's dir, label-only read-only cell), `drift`, `orphan`, `ignored`; client defs declare inheritance relationships in `clients.ts`; inheritance derived at scan time, not configured per-resource. Source: crossoverJie/SkillDeck `docs/AGENT-CROSS-DIRECTORY-GUIDE.md` + `Models/SkillInstallation.swift`.
- `§Sync` (fan-out skips inherited targets, v2.0.5): [modified] new bullet — sync never writes into an inheriting client's effective dir when that dir is owned by another client; DOCTOR surfaces an informational line on first encounter. Source: same as above.
- `§Sync → Safe Apply and Rollback Snapshots → Atomic Write Primitive` (new v2.0.5 subsection): [added] `write <path>.tmp → Zod safeParse → rename(tmp, path) → on failure unlink-and-rethrow` sequence; shared helper `src/io/atomic-write.ts`; applies to `sync.ts`, `skills.ts`, and v2.0.1 target writers from day one; complements (does not replace) snapshot-and-rollback. Source: DatafyingTech/Claude-Agent-Team-Manager `src/services/file-writer.ts`.
- `§Doctor → Checks` (Upstream drift row, v2.0.5): [added] new finding class; payload includes `compareUrl` when source is a GitHub repo (`https://github.com/<owner>/<repo>/compare/<oldSha>...<branch>`); extends v2.0.4's local artifact-level drift outward to upstream. Source: crossoverJie/SkillDeck `Services/UpdateChecker.swift` + `CommitHashCache.swift` + `FEATURES.md F12`.
- `§Registry → Registry Adapter Pattern` (upstream-hash query, v2.0.5): [modified] adapters SHOULD expose optional `upstreamHash(id) → { treeHash, compareUrlTemplate? } | null`; `null` opt-out for flat registries; cached with registry-metadata TTL. Source: same as above.
- `§Marketplaces (Claude Code) → Profile-as-Plugin Packaging → Profiles as Live Scope` (Profile as composable unit, v2.0.5): [modified] `variables` and `launchPrompt` added as first-class profile fields; subagent-team case (`profile = {agents, dependent_skills, shared_variables, launchPrompt}`) becomes concrete; additive on top of v2.0.4's enabled-tool matrix. Source: DatafyingTech/Claude-Agent-Team-Manager `src/types/aui-node.ts NodeKind group` + `USAGE.md`.
- `§Marketplaces → Profile-as-Plugin Packaging` (Secret redaction at serialization boundary, v2.0.5): [added] single `redactForExport(node)` helper applies to every export, telemetry, and remote-sync path; secret-kinded variables get `"<redacted: api-key>"` placeholder while name/kind/inheritance metadata is preserved; unconditional (no `--include-secrets` flag) because `op://` references themselves leak vault tenancy. Source: DatafyingTech/Claude-Agent-Team-Manager `src/types/remote.ts redactNode` + `remote-sync.ts`.
- `§Registry → Secret Scanning` (Relationship to typed variables, v2.0.5): [modified] orthogonal layering — `op://` is stored form, `kind: api-key | password` is schema declaration; regex scanning catches plaintext leaks in pre-kind fields, kind channel catches leaks-by-declaration in new variable records; both route through `SecretViolation`. Source: same as typed variables.
- `§References`: [modified] added crossoverJie/SkillDeck entry (MIT, LICENSE file present) and DatafyingTech/Claude-Agent-Team-Manager entry (MIT, LICENSE file present) with per-pattern file citations and per-reference deferred/dismissed pattern lists.
- Frontmatter `spec-version`: [modified] 2.0.4 → 2.0.5.
- Frontmatter `patterns` array: [modified] added "profile-scoped variables and launchPrompt", "typed variables with kind", "root-to-leaf variable inheritance", "secret redaction at serialization boundary", "inherited installations as first-class state", "upstream tree-hash drift with GitHub compare URL", "atomic temp-write plus Zod-validate plus rename".
- `§Changelog` (in-spec): [added] 2.0.5 entry.
- `.fctry/config.json` `versions.spec.current`: [modified] 2.0.4 → 2.0.5.

**Dismissed:**
- Single-source client rule table enum (SkillDeck) — Ensemble already has this via `clients.ts`; no marginal value.
- Three-pane sidebar with counts (SkillDeck) — Ensemble's matrix is structurally different from SkillDeck's layout; revisit after pivot IA user testing.
- UI-language-aware translation (SkillDeck) — premature.
- Pipelines (ATM) — future composition territory; premature until the deferred deploy primer is resolved.

**Open questions (deferred, not rejected):**
- **Shared canonical `~/.agents/skills/` store** (SkillDeck pattern #2) — SkillDeck, Codex, and OpenCode participate in an emerging multi-tool convention where `~/.agents/skills/` is a neutral shared store and each client's skills dir symlinks into it. Adopting this would reshape §Library Bootstrap (library location), §Sync (fan-out vs. shared ownership), and the per-client copy model. This is not a refinement — it is a decision about whether Ensemble joins the convention or maintains independent per-client state. **Next step:** dedicated `/fctry:evolve library-bootstrap` session weighing (a) interop with SkillDeck/Codex/OpenCode users, (b) migration cost from current per-client model, (c) fate of the canonical `~/.config/ensemble/library/` store if the shared store becomes primary.
- **Deploy primer** (ATM pattern #11) — a capability-gap concept from ATM for bundling a team with its deployment narrative (how to install, what it does, where it runs). Best revisited after the v2.0.1 agents/commands/hooks modules ship, because the deploy primer is a layer *above* those resources and needs them to exist before it has substrate. **Next step:** `/fctry:evolve deploy-primer` after v2.0.1 implementation lands, considering whether the primer is a new resource type, a profile field, or a sibling to the launchPrompt.

(6 added, 7 modified, 0 removed)

<!-- research-trace
sources_visited: 22
patterns_extracted: 12
patterns_adopted: 6
patterns_dismissed: 4
patterns_deferred: 2
discard_rate: 23%
top_sources:
  - crossoverJie/SkillDeck — 6 patterns extracted across AGENT-CROSS-DIRECTORY-GUIDE.md, SkillInstallation.swift, UpdateChecker.swift, CommitHashCache.swift, FEATURES.md, README/CLAUDE.md
  - DatafyingTech/Claude-Agent-Team-Manager — 6 patterns extracted across aui-node.ts (NodeKind group, NodeVariable), remote.ts (redactNode), remote-sync.ts, file-writer.ts, USAGE.md
  - Ensemble spec §Matrix View, §Sync, §Doctor, §Registry, §Profile-as-Plugin, §Resource Types, §Secret Scanning — target sections validated against existing patterns before adoption
  - clients.ts, library/library.json — existing Ensemble code/config checked to dedupe two dismissed patterns
decision_chain: two researchers extracted 12 patterns from two MIT-licensed references → user confirmed 6 adopt, 4 dismiss, 2 defer → spec writer mapped each adopted pattern to existing section aliases and extended rather than rewrote; typed variables and installation states warranted new subsections/blocks; team-as-composable-unit and secret redaction extended existing §Profile-as-Plugin subsections; upstream drift added new Doctor row and Registry adapter method; atomic write added new Safe Apply subsection; inherited-target skip added as new §Sync bullet.
license_note: both references MIT-licensed with explicit LICENSE files present — no ambiguity to flag (contrast v2.0.4's xingkongliang/skills-manager, which declared MIT in README but lacked a LICENSE file).
open_questions: shared ~/.agents/ store (architectural), deploy primer (post-v2.0.1) — both parked for dedicated /fctry:evolve sessions rather than drive-by ref adoption.
-->

## 2026-04-17T00:00:00Z — /fctry:ref xingkongliang/skills-manager (5 patterns adopted, 3 dismissed)

Spec version bumped 2.0.3 → 2.0.4. Five patterns adopted from the xingkongliang/skills-manager Tauri 2 + Rust + React reference (README claims MIT but LICENSE file is missing — recorded as a reference-only caveat in §References). Three patterns dismissed after researcher review.

**Adopted:**
- `§Profile-as-Plugin Packaging` (§Profiles as Live Scope new subsection): [added] profiles as switchable live state with atomic scenario switching, per-(profile, artifact, client) enabled-tool matrix, tray/menubar switcher; complements — does not replace — existing export-as-plugin stance. Source: `src-tauri/src/commands/scenarios.rs`.
- `§Sync → Drift Detection`: [modified] artifact-level stable SHA-256 content hash over sorted relative paths + byte contents + Unix exec bit (excluding `.git`, `.DS_Store`, `Thumbs.db`, `.gitignore`) as the deterministic drift primitive for file-based resources; complements `lastDescriptionHash`. Source: `src-tauri/src/core/content_hash.rs`.
- `§Doctor → Checks` (Drift detected row): [modified] references the artifact-level hash for skills/agents/commands; entry-level hash continues to apply to servers/plugins.
- `§Core Concepts → Resource Types → Detection Policy`: [added] published detection-policy subsection listing canonical markers (`SKILL.md`), legacy-compatible markers (`skill.md`), and explicit disqualifications (`README.md`, `CLAUDE.md`) for all five file-based resource types (skill/agent/command/hook/setting); spec-version-stamped policy living in `src/detection-policy.ts`. Source: `docs/skill-format-detection-spec.md`.
- `§Migration → One-shot import`: [modified] `import-legacy` scans route through the detection policy rather than naive globs.
- `§Sync → Safe Apply and Rollback Snapshots → Snapshot Tags and Forward-Restore Semantics`: [added] tag naming `ens-snap-YYYYMMDD-HHMMSS-<shortsha>`, forward-restore semantics (restore emits a new snapshot with `restored from <tag>` in the manifest — additive, not destructive; linear provenance preserved). Source: `src-tauri/src/core/git_backup.rs`.
- `§Sync → Per-Client Sync Mode Table`: [added] symlink-default with exception table (Cursor → copy; Windows → copy automatic downgrade) and user-configurable `sync_mode` override per client; copy-mode drift surfaces via artifact-level hash. Source: `src-tauri/src/core/sync_engine.rs`.
- `§References`: [modified] added xingkongliang/skills-manager entry citing each adopted file and noting the MIT-in-README / missing-LICENSE license ambiguity so future agents treat upstream code as reference-only (no verbatim copies).
- Frontmatter `patterns` array: [modified] added "profiles as live scope", "per-(profile, artifact, client) enabled-tool matrix", "artifact-level stable content hash", "published resource detection policy", "snapshot tags with forward-restore semantics", "per-client sync-mode table".
- `§Changelog` (in-spec): [added] 2.0.4 entry.

**Dismissed:**
- Live FS watcher with debounced UI invalidation (`src-tauri/src/core/file_watcher.rs`) — overlaps with existing `packages/desktop/src/main/config-watcher.ts`; revisit only if current watcher proves insufficient.
- Disabled-sibling directory convention (`src-tauri/src/core/project_scanner.rs`) — narrower scope; needs per-client tolerance verification before generalizing.
- Adapter `additional_scan_dirs` (`src-tauri/src/core/tool_adapters.rs`) — narrower scope; `discover.ts` already handles plugin-cache paths ad-hoc.

(7 added, 5 modified, 0 removed)

<!-- research-trace
sources_visited: 18
patterns_extracted: 8
patterns_adopted: 5
patterns_dismissed: 3
discard_rate: 22%
top_sources:
  - xingkongliang/skills-manager — primary; 8 patterns extracted across scenarios.rs, content_hash.rs, git_backup.rs, sync_engine.rs, project_scanner.rs, file_watcher.rs, tool_adapters.rs, docs/skill-format-detection-spec.md
  - Ensemble spec §Profile-as-Plugin, §Sync, §Doctor, §Migration — target sections validated against existing patterns before adoption
  - config-watcher.ts, discover.ts — existing Ensemble code checked to dedupe two dismissed patterns
decision_chain: researcher extracted 8 patterns → user confirmed 5 (dismissed 3 for scope overlap / narrowness) → spec writer mapped each adopted pattern to existing section aliases and extended rather than rewrote; detection policy and profiles-as-live-scope warranted new subsections; content hash, snapshot tags, and sync mode extended existing subsections.
license_note: xingkongliang/skills-manager README declares MIT but no LICENSE file is present; all adoption is pattern-only, no verbatim code copied.
-->

## 2026-04-15T00:00:00Z — /fctry:evolve dual-field annotations (description + userNotes)

Spec version bumped 2.0.2 → 2.0.3. Adds source-owned `description` + user-authored `userNotes` to every library resource type, with the invariant that `userNotes` is never overwritten by any reconciliation, re-pull, or upstream refresh.

- `#resource-types` (§Resource Types): [modified] add dual-field preamble covering all types; hooks get auto-generated description from event+matcher.
- `#library-bootstrap` (§Library Bootstrap and Drift Lifecycle): [modified] codify "userNotes are never overwritten by reconciliation" as first-class invariant; document `src/discovery/library.ts` plugin-description overload cleanup (`marketplaceRef` split).
- `#zod-schema-exports` (§Zod Schema Exports): [modified] every resource schema gains `description: string` (required) + `userNotes: string` (optional).
- `#server-model-fields` (§Server Model Fields): [modified] table rows added for `description` + `userNotes`.
- `#skill-model-fields` (§Skill Model Fields): [modified] extend to dual-field model; description remains source-owned from frontmatter, userNotes lives on library entry.
- `#plugin-model-fields` (§Plugins → Plugin Model Fields): [added] new subsection with full field table including dual fields + marketplaceRef.
- `#metadata-caching` (§Registry → Metadata Caching / Tool Metadata Storage): [modified] clarify `--update-tools` refreshes source-owned description, never touches userNotes.
- `#local-capability-search` (§Search): [modified] expand search scope to all resource types; document fixed 2x BM25 weight for userNotes over description.
- `#cli-surface` (§CLI Surface): [added] `ensemble note <ref> "text"` / `--edit` / no-arg verb.
- `#doctor` (§Doctor → Checks): [added] info-severity "Upstream descriptions refreshed" row with `--show descriptions-refreshed` list.
- `#profile-as-plugin` (§Profile-as-Plugin Packaging): [added] `--strip-notes` flag + default-on "Include personal notes" checkbox; rationale: userNotes are curation story.
- `#architecture-target-modules` (§Architecture → Target modules): [modified] `agents.ts`, `commands.ts`, `hooks.ts` bake dual-field model in from day one.
- Synopsis frontmatter: [modified] regenerated `medium` and `patterns` to reflect dual-field addition.

(11 modified, 3 added, 0 removed)

## 2026-04-14 — v2.0.2 implementation: canonical library store shipped

Spec version bumped 2.0.1 → 2.0.2. The refinements landed as spec text earlier today are now backed by shipped code end-to-end.

**Library store (`src/discovery/library-store.ts`):** canonical manifest at `~/.config/ensemble/library/library.json` with `LibraryEntry` records keyed by `name@source`. File-based types (skill/agent/command/style) copy content into the canonical store with SHA-256 content hashes; MCP servers embed their def inline stripped of the `__ensemble` marker; plugins carry their marketplace identity natively so two different-marketplace `foo` entries coexist as `foo@market-a` and `foo@market-b`. `bootstrapLibrary()` is idempotent and populates the store from `scanLibraryGlobal` + per-project scans on first run. `reconcile(manifest, scan)` is a pure function that classifies each tool occurrence as match / drift / orphan / ignored. Mutations: `adoptOrphan`, `promoteDrift`, `ignoreEntry`, `unignoreEntry`, `removeEntry`. Every function has dedicated tests under `tests/library-store.test.ts` (15 tests) and `tests/wire-move.test.ts` (8 tests), all passing alongside the full 246-test suite.

**Wire-as-move (`src/discovery/wire.ts`):** `WireRequest.mode` accepts `"move"` (default) or `"copy"`. Under move, a successful target write is followed by an unwire of the source; if the source is user-authored (no managed marker) the unwire is skipped gracefully and `sourceUnwired: false` is returned — the wire still counts as successful. Same-scope wires are a no-op. Introduced `{ kind: "library" }` as a third `WireScope` variant (source-only, never a target). Library-sourced wires read canonical content from `~/.config/ensemble/library/` — the whole skill directory for skills, the inline server def for MCP servers, marketplace identity for plugins.

**Desktop app:** tRPC procedures `library.bootstrap`, `library.entries`, `library.manifest`, `library.reconcileScope`, `library.adoptOrphan`, `library.promoteDrift`, `library.ignore`, `library.unignore`, `library.removeEntry`. On mount, `AppInner` runs bootstrap, then feeds the manifest-projected entries to the matrix as rows (scope: library). Matrix cells still reflect on-disk wire state via the existing scans. Top chrome shows a persistent `LIB N · K DRIFT · M ORPHANS` badge. `DoctorView` is a first-class view replacing the placeholder: sidebar sections SUMMARY / LIBRARY / DRIFT / ORPHANS / IGNORED, per-row actions (adopt/promote/ignore/unignore/remove), plugin marketplace shown alongside plugin names so duplicates are legible. Project scan is enriched with `registryStatus` from the project-registry DB and with `displayName` (when set) so matrix columns and library detail views show the friendly project name rather than the path basename.

**Spec text reflected implementation:** §Core Concepts → "Library Bootstrap and Drift Lifecycle" subsection promoted from "refinement" to "v2.0.2" with implementation callouts to `library-store.ts`, `wire.ts`, and `DoctorView.tsx`. §Desktop App / Layout → "Matrix View" subsection promoted to "implemented" with the canonical-store-backed rendering described. Synopsis `medium` rewritten to lead with the canonical store, reconcile flow, and wire-as-move.

No changes to §Library API operations, §CLI Surface, or §Sync — those surfaces stay v2.0.1-shaped until CLI parity lands next. `ensemble adopt`, `ensemble drift`, `ensemble library list|remove|ignore` are the next spec-surface additions.

## 2026-04-14 — v2.0.2 refinement: library bootstrap, drift lifecycle, matrix view, wire-as-move

Codified the library-first flow that emerged from desktop-app design work: **Marketplace → Library → Install state**, with the library as a canonical inventory in `~/.config/ensemble/library/` that is independent of any client scope. The v2.0.1 bridge assumption (library = scan of `~/.claude`) is retired.

New §Core Concepts subsection "Library Bootstrap and Drift Lifecycle" describes: (1) bootstrap-by-scan — first run auto-populates the library from `~/.claude` and known project `.claude/`s, no import wizard; (2) after bootstrap, scans become reconciliation with three outcomes per resource (match / orphan / drift) surfaced in DOCTOR with one-click resolution; (3) an `ignored` list in the library manifest prevents re-adoption of explicitly removed resources; (4) identity keyed by `name@source` with `@discovered` as the source for bootstrap/orphan adoptions until manually linked to a marketplace; (5) wire-as-move default for ensemble-managed resources (fan-out is the exception, behind an explicit modifier), eliminating the drift hazard where the v2.0.1 model created duplicate SKILL.md files and duplicate MCP server definitions across scopes; (6) DOCTOR grows "library drift" and "library orphans" categories populated by the reconciliation pass.

New §Desktop App / Layout subsection "Matrix View" elevates the library × scopes grid to a top-level view alongside the pivots. Matrix answers "where is everything running?" in a way row-oriented pivots cannot: sticky-axes bipartite grid, default wired-anywhere filter to survive 500-resource libraries, single-click toggle / shift-click move / long-press detail, row hover dimming as a lightweight patch-bay-cable substitute, persistent legend strip. Matrix is complementary to the Library pivot, not a replacement. The existing "Patch Bay" split-screen is framed as a transitional alias that will be removed once the Library pivot is fully built.

No spec-version bump to 2.0.2 yet — this is a design refinement landing ahead of the implementation. Lifecycle model, bootstrap flow, and matrix UX are all pre-build specifications. Implementation will follow under the v2.0.2 label once the library storage schema and reconciliation engine are in place.

## 2026-04-14 — Desktop scaffold: wire format + dev CSP refinement

Landed two small corrections to §IPC Architecture discovered while bringing the app up end-to-end. (1) CSP is production-only — Vite HMR injects inline/eval scripts in dev, and a strict `default-src 'self'` CSP blocks them. The rest of the sandbox (sandbox, contextIsolation, nodeIntegration-false, webSecurity, blocked navigation) stays on in both modes. (2) The tRPC wire uses superjson as its transformer so rich types (Dates, Maps, Sets, undefined, BigInt) survive the IPC boundary. Also pinned the tRPC v10 / react-query v4 / electron-trpc 0.7 stack in `CLAUDE.md` — tRPC v11 is not yet supported by electron-trpc 0.7, so bumping any of the four breaks the whole chain.

## 2026-04-14 — Desktop app: adopt portfolio electron-scaffold (tRPC + sandbox)

Rewrote §IPC Architecture and the `packages/desktop/` directory tree to describe the scaffold-compliant shape: sandboxed renderer (`app.enableSandbox()`, `contextIsolation: true`, CSP, blocked navigation), minimal preload (single `exposeElectronTRPC()` call), and a typed `appRouter` with namespaced sub-routers and Zod-validated procedures. Renderer consumes the router via `@trpc/react-query` hooks — no more `window.ensemble` global, no more `ipcMain.handle`. Contract tests call procedures directly via `appRouter.createCaller({})`. Architecture module table entry for `packages/desktop/` updated accordingly. No version bump — this is a refinement of how the existing IPC layer is implemented, not a change to the library API, CLI surface, or user-visible behavior. Triggered by portfolio-wide `electron-scaffold` standard.

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
