# Handoff — 2026-04-14

Two big threads this session: (1) a major direction shift in the Ensemble desktop app toward a "Claude Code studio" split-screen patch bay, implemented as stage 1 + stage 2; (2) an in-flight migration to rename `fctry-marketplace` → `ml-marketplace` and fold `md-convert` into it. **The marketplace rename is paused at Phase 0 complete — Phase 1 onward has not been executed.**

## Big-picture direction shift

The desktop app was redesigned around a new mental model. Old model (picker → channel → fan-out) is **dead code** — explicitly deleted in migration, not preserved.

**New model (locked in `.interface-design/system.md`):**

- **One relation: `(tool, scope) → enabled`.** Everything is a navigation or edit of this bipartite graph.
- **Primary surface: resizable split-screen.** Left = library (tools). Right = projects. Four list/detail combinations, symmetrical wire-toggle from either side. Hairline divider, min 320px per panel.
- **Matrix lens as a secondary view** — read-only grid for "know what's where" auditing, toggled from top chrome. Deferred to a later build.
- **Doctor as a cross-cutting view** invoked from chrome, not a sidebar page. Deferred.
- **Deleted concepts (gone, not preserved):** picker, channel mode, fan-out mode, sidebar, client chip, groups, profiles, path rules, client assignments.
- **Claude Code studio framing** (not cross-client fleet management): target user is a Claude Code power user who also runs other MCP clients. Claude Code is first-class; other clients are latent MCP receivers for future work. Non-Claude-Code projects are filtered out of the projects panel.
- **Seven tool types in v1:** MCP servers, skills, subagents, slash commands, output styles, plugins, hooks (hooks are list-only in v1 — read-only, no wire actions).
- **Dark mode is a first-class requirement** in the spec, not a retrofit. Drafted tokens exist; not implemented.

**User-approved decisions (via AskUserQuestion):**

1. Library source = **managed + discovered.** Auto-scan ~/.claude/ locations and show existing tools alongside anything Ensemble added. Origin badge on each row.
2. Wire semantics = **hybrid copy + manifest.** Wiring copies the file into `<project>/.claude/` with an `ensemble: managed` frontmatter marker (or `__ensemble: true` JSON flag), AND records the edge in Ensemble's state. Unwire only deletes files that carry the marker — user-authored content is never touched.
3. Projects = **Claude Code only.** Scanner still finds Cursor/Windsurf/VS Code projects but the app filters them out for v1. Non-CC support is a latent capability to turn on later.

Full details in `.interface-design/system.md`.

## What shipped this session

### Library (Claude Code-specific discovery + writes)

New modules under `src/discovery/`:

- **`src/discovery/projects.ts`** (existed pre-session but refined): scans Claude Code, Cursor, Windsurf, VS Code for project paths. Aggregates by canonical filesystem path. Handles Claude Code's lossy dash-encoded directory names via greedy collapse with existence check. Skips non-directories (fixes the `.DS_Store` phantom row). Returns `DiscoveredProject[]` with `seenIn`, `lastSeenAt`, `exists`, `isGitRepo`.

- **`src/discovery/library.ts`**: scans `~/.claude/` and optionally `<project>/.claude/` for all seven tool types.
  - MCP servers from `~/.claude.json` → `mcpServers` (global) and `<project>/.mcp.json` (project).
  - Skills from `~/.claude/skills/<name>/SKILL.md` (nested directories with SKILL.md).
  - Subagents / slash commands / output styles from flat `<name>.md` files in `~/.claude/agents/`, `commands/`, `output-styles/`.
  - **Plugins**: authoritative inventory from `~/.claude/plugins/installed_plugins.json`. Not `settings.json.enabledPlugins` — that was a bug I fixed. Each plugin entry has a new `pluginEnabled: boolean` field tracking whether it's enabled at its discovered scope. For project-scope scans, plugins are emitted only when `enabledPlugins[key] === true`.
  - Hooks from `settings.json → hooks.<event>[]` — listed read-only for v1.
  - Each discovered tool has `origin: "discovered" | "managed"` determined by the frontmatter tag or `__ensemble: true` JSON flag.

- **`src/discovery/wire.ts`**: write operations for wiring/unwiring tools to/from scopes.
  - **Markdown tools** (skill/agent/command/style): copies source to target with `ensemble: managed` frontmatter injected. Unwire only deletes files that carry the marker.
  - **MCP servers**: patches `~/.claude.json` → `mcpServers` or `<project>/.mcp.json` with `__ensemble: true` flag.
  - **Plugins**: flips `enabledPlugins["id@marketplace"]` in the target scope's settings.json. Tracks which keys Ensemble set in a `__ensemble_plugins` array so unwire won't clobber user-enabled plugins.
  - **Hooks**: refuses — returns "read-only in v1".

Exported from `src/index.ts`: `scanClientsForProjects`, `scanLibraryGlobal`, `scanLibraryProject`, `wireTool`, `unwireTool`, and all the types. The library needs `npm run build` after any edit to these files so the desktop's type-check sees them.

### Desktop app — new split-screen shell

The old App.tsx (picker + sidebar + ClientChip + 10 legacy pages) is completely replaced. Current entry flow:

- **`App.tsx`** owns the full state: `projects`, `libraryTools`, `wireMap` (per-project tool sets), error states, and a dispatcher `AppWireApi` (`isWired`, `wire`, `unwire`) passed to both panels. `isWired` has special-case for plugins at global scope (checks `pluginEnabled`, not mere presence).
- **`components/Split.tsx`** — resizable 50/50 two-panel primitive. Drag to resize, double-click reset, persists ratio to `localStorage`, min 320px per side.
- **`components/Panel.tsx`** — shared panel primitives: `PanelShell`, `PanelHeader`, `PanelScroll`, `PanelEmpty`, `FilterTabs`, `ListRow`.
- **`components/WireRow.tsx`** — square-glyph toggle row (filled `--sync` = wired, outlined `--ink-3` = not wired). Supports `readOnly` and `disabled` for in-flight states. Glyph IS the control — no checkbox, no switch.
- **`panels/LibraryPanel.tsx`** — list mode has filter tabs (ALL/SERVERS/SKILLS/AGENTS/COMMANDS/STYLES/PLUGINS/HOOKS with counts). Click a row → detail view with metadata + "WIRE TO" ledger enumerating every project scope including GLOBAL. Each row is a live wire-toggle. Hooks render read-only.
- **`panels/ProjectsPanel.tsx`** — list mode has filter tabs (GIT REPOS / RECENT / ALL / MISSING). Click a row → detail view with project metadata + two sub-tabs: **WIRED** (tools currently at this scope) and **AVAILABLE** (the whole library, toggleable). `GLOBAL` is a synthetic top row representing `~/.claude/` user scope, always visible in every filter. Non-Claude-Code projects are filtered out before display.

Each panel tracks its own `list | detail` state independently — they don't coordinate. Back arrow returns each panel to its own list.

### IPC + preload

New handlers in `packages/desktop/src/main/ipc-handlers.ts`:

- `projects:scan` — returns the CC-filtered project list
- `library:scanGlobal` — full user-scope library
- `library:scanProject` — one project's `.claude/` contents
- `library:scanAllProjects` — bulk scan of every CC project for the `wireMap` lookup
- `library:wire` — calls `wireTool` with the typed request
- `library:unwire` — calls `unwireTool`
- `clients:liveStatus` — (from earlier in session) returns per-client total/managed server counts

All exposed via `window.ensemble.{projects,library,clients}` in `packages/desktop/src/preload/index.ts`.

### Legacy pages (dead code)

`ServersPage.tsx`, `SkillsPage.tsx`, `PluginsPage.tsx`, `GroupsPage.tsx`, `ClientsPage.tsx`, `SyncPage.tsx`, `RegistryPage.tsx`, `ProfilesPage.tsx`, `RulesPage.tsx`, `DoctorPage.tsx`, `PickerPage.tsx` all still exist on disk but are **not referenced** by the new `App.tsx`. They're dead code I intentionally didn't delete so you could revert if stage 2 went sideways. **Delete them once the new app has been in use for a few sessions without regressions.** Same for `components/Sidebar.tsx`, `components/ClientChip.tsx`, and any other old components.

### `md-convert` packaged as a Claude Code plugin

The user's local md-convert system (a PreToolUse hook on `Read` that converts binary documents and indexes large markdown files, plus two slash commands `/index` and `/noconvert`) was packaged into a proper plugin bundle at **`~/Code/resources/md-convert/`**:

```
~/Code/resources/md-convert/
├── .claude-plugin/plugin.json          name, version, description
├── commands/index.md                    /index <file> — manual index
├── commands/noconvert.md                /noconvert — toggle conversion hook
├── hooks/hooks.json                     registers script as PreToolUse on Read
├── scripts/md-convert.sh                the hook script (executable, +x preserved)
└── README.md                            what it does + install notes
```

**The original files under `~/.claude/scripts/`, `~/.claude/commands/`, and the `PreToolUse.Read` entry in `~/.claude/settings.json` are still live.** Deliberately not removed until the plugin is proven working via the marketplace. Phase 8 of the marketplace-rename plan handles the cleanup.

**Hook references `${CLAUDE_PLUGIN_ROOT}/scripts/md-convert.sh`** — confirmed by the claude-code-guide agent. No other runtime dependencies beyond `bash`, system `python3` (the script auto-finds a non-venv one), and `markitdown` (auto-installed via pipx/pip if missing).

## In-flight work — marketplace rename (PAUSED at end of Phase 0)

The user wants to rename `spaceshipmike/fctry-marketplace` to `spaceshipmike/ml-marketplace` and include **both** `fctry` and `md-convert` as plugins in it. Phase 0 (pre-flight) is complete; **Phase 1 and beyond have not been executed**.

Full plan and phase-by-phase steps are in the previous assistant turn in this conversation, but the key elements to carry forward:

### Phase 0 findings (done)

- ✅ Backups of the three critical JSON files written to `~/.claude/backups/pre-ml-marketplace-rename-20260414-110620/` — `settings.json`, `installed_plugins.json`, `known_marketplaces.json`.
- ✅ Marketplace clone at `~/.claude/plugins/marketplaces/fctry-marketplace` is on `main`, clean except for `md-convert-tmp/` (leftover from a rejected tool call earlier — needs cleanup in Phase 2).
- ⚠️ **Dev-link is currently active.** Sentinel `~/.claude/fctry-dev-link` contains `/Users/mike/code/fctry`. Phase 3 (dev-unlink) is mandatory before the rename, Phase 9 (re-link) is mandatory after.
- ⚠️ **`hooks/dev-link-ensure.sh` hardcodes** `PLUGIN_KEY="fctry@fctry-marketplace"` and `MARKETPLACE_KEY="fctry-marketplace"` — adding to Phase 1 edit list.
- ⚠️ **`fctry` repo has lots of untracked files** (caches, docs/, repomix outputs, etc.) but no modified tracked files. Phase 1 must only touch specific tracked files and use explicit `git add <file>` to avoid polluting the commit.

### Files that reference the old marketplace name

In `~/Code/fctry/`:
- `.github/workflows/sync-marketplace.yml` — **critical**. Hardcodes `REPO="spaceshipmike/fctry-marketplace"` AND assumes `.plugins[0].version` is fctry (fragile if ordering changes). Must be updated to use name-keyed jq filter: `.plugins |= map(if .name == "fctry" then .version = $v else . end)`.
- `scripts/dev-link.sh` — `PLUGIN_KEY` + `MARKETPLACE_KEY` constants.
- `scripts/dev-unlink.sh` — same.
- `hooks/dev-link-ensure.sh` — same.
- `.claude/skills/fctry-release/SKILL.md` — doc.
- `CLAUDE.md` — doc.

In the marketplace clone:
- `.claude-plugin/marketplace.json` — `"name": "fctry-marketplace"` string + the plugins array (needs to add `md-convert` inline with `"source": "./md-convert"`).
- The `md-convert/` directory needs to be populated with a copy of `~/Code/resources/md-convert/`.

In `~/.claude/` local state:
- `~/.claude/plugins/known_marketplaces.json` — rename key, update `source.repo`, update `installLocation`.
- `~/.claude/plugins/installed_plugins.json` — rename `fctry@fctry-marketplace` key to `fctry@ml-marketplace`, update `installPath`, add `md-convert@ml-marketplace` entry.
- `~/.claude/settings.json` — rename `enabledPlugins.fctry@fctry-marketplace`, add `md-convert@ml-marketplace: true`, rename `extraKnownMarketplaces.fctry-marketplace` if present.
- Rename directories: `~/.claude/plugins/marketplaces/fctry-marketplace` → `ml-marketplace`, `~/.claude/plugins/cache/fctry-marketplace` → `ml-marketplace`.

### Phase plan (10 phases, gates after each)

- **Phase 0** — ✅ done
- **Phase 1** — edit fctry repo on a `rename-marketplace` branch, commit locally. Don't merge to main yet.
- **Phase 2** — edit marketplace clone: populate `md-convert/` dir, edit `marketplace.json`, commit locally.
- **Phase 3** — `~/Code/fctry/scripts/dev-unlink.sh` to cleanly tear down dev-link before directory renames.
- **Phase 4** — `gh repo rename spaceshipmike/fctry-marketplace ml-marketplace` + `git remote set-url`. **This is the single point of high irreversibility.**
- **Phase 5** — push marketplace repo changes.
- **Phase 6** — merge fctry `rename-marketplace` branch to main and push.
- **Phase 7** — atomic local state migration: rename `~/.claude/plugins/marketplaces/...` and `...cache/...` dirs, edit the three JSON files.
- **Phase 8** — remove stale `~/.claude/scripts/md-convert.sh`, `~/.claude/commands/index.md`, `~/.claude/commands/noconvert.md`, and the `PreToolUse.Read` hook entry from `settings.json` (now provided by the plugin).
- **Phase 9** — re-run updated `dev-link.sh` to restore fctry dev mode.
- **Phase 10** — restart Claude Code, verify `/plugin list` shows both `fctry@ml-marketplace` and `md-convert@ml-marketplace`, test `/index`, `/noconvert`, and fctry commands.

### Strategic question the user didn't answer

Is `ml-marketplace` a general "Michael's Claude Code plugins" container (will grow), or a fixed fctry+md-convert pair? Affects the description string in `marketplace.json` but nothing else. Default to "will grow" and write a general description.

## Invariants to remember

- **Library writes are additive-safe.** Unwire never deletes content that isn't ensemble-marked. Markdown tools use frontmatter `ensemble: managed`; JSON entries use `__ensemble: true` flag (`__ensemble_plugins` array for plugin keys in settings.json).
- **Plugin discovery source is `installed_plugins.json`, NOT `enabledPlugins`.** Previous bug: scanning `enabledPlugins` showed disabled plugins as library items. The fix reads the real inventory and tracks enabled state separately via `pluginEnabled`.
- **`isWired(pluginId, '__global__')` checks `pluginEnabled`, not presence.** Installed-but-disabled plugins should not render as wired to GLOBAL.
- **Writes are immediate.** No staging, no apply button. Single user, single machine — config on disk is the truth and the app is a view over it.
- **Independent panel state.** Library panel and projects panel each track their own list/detail mode. They never coordinate mode transitions.
- **Claude Code–only filter is applied in `App.tsx`**, not the scanner. The scanner still returns all client hits; the filter is `p.seenIn.includes("claude-code")`. Unfiltering is a one-line change when non-CC support comes online.
- **Rebuild the library dist after editing `src/` files** — desktop's `tsc --noEmit` reads types from `dist/index.d.ts`. Runtime uses the electron-vite alias to source, so it works without rebuild, but type-check won't pass without `npm run build`.
- **Electron main/preload changes require a full quit+restart**, not just window reload. Renderer changes hot-reload.

## Critical files touched this session

Library:
- `src/discovery/projects.ts` (modified — DS_Store fix)
- `src/discovery/library.ts` (new — the whole file)
- `src/discovery/wire.ts` (new — the whole file)
- `src/index.ts` (exports added)

Desktop:
- `packages/desktop/src/renderer/App.tsx` (complete rewrite — owns state + dispatcher)
- `packages/desktop/src/renderer/components/Split.tsx` (new)
- `packages/desktop/src/renderer/components/Panel.tsx` (new)
- `packages/desktop/src/renderer/components/WireRow.tsx` (new)
- `packages/desktop/src/renderer/panels/LibraryPanel.tsx` (new)
- `packages/desktop/src/renderer/panels/ProjectsPanel.tsx` (new)
- `packages/desktop/src/main/ipc-handlers.ts` (new handlers for projects/library/wire)
- `packages/desktop/src/preload/index.ts` (bridge for new IPC)

Plugin bundle:
- `~/Code/resources/md-convert/` (new directory, full plugin structure)

Design system:
- `.interface-design/system.md` (complete rewrite — new model, new tokens, migration order, dark mode parity)

Handoff:
- `HANDOFF.md` (this file — replaces the previous session's handoff)

## Things to clean up eventually (not in current scope)

- Delete legacy pages under `packages/desktop/src/renderer/pages/` and components like `Sidebar.tsx`, `ClientChip.tsx` after the split-screen has been in use and stabilized.
- The marketplace rename completes (Phases 1–10 execute).
- Remove the stale `~/.claude/scripts/md-convert.sh`, `~/.claude/commands/index.md`, `~/.claude/commands/noconvert.md`, and settings.json hook entry (Phase 8 of the rename).
- Matrix lens view — deferred to a later build.
- Doctor cross-cut view — deferred.
- Dark mode — tokens drafted in `.interface-design/system.md`, implementation deferred.
- Output styles "only one active per scope" radio semantic — current wire path writes files but doesn't set the `outputStyle` settings.json key. Works for file placement but Claude Code won't actually apply the style without that key.
- Plugin wiring needs to also register the plugin's marketplace if it's not known at the target scope. Current code writes `enabledPlugins[key]` but if the marketplace isn't in `knownMarketplaces` at that scope, Claude Code won't load the plugin.
- No refresh button in the new UI — stale scans require an app restart.
- Pre-existing type errors in `ipc-handlers.ts` (SkillSyncResult shape, showRegistry args) flagged in an earlier handoff, still unaddressed.

## How to resume the marketplace rename

1. Re-read the backup to confirm state hasn't drifted: `ls ~/.claude/backups/pre-ml-marketplace-rename-*/`
2. Re-verify Phase 0 findings still hold: dev-link active, working trees clean-ish, hooks still reference old names.
3. If yes → **Phase 1**: create `rename-marketplace` branch in `~/Code/fctry/`, edit the six files (`.github/workflows/sync-marketplace.yml`, `scripts/dev-link.sh`, `scripts/dev-unlink.sh`, `hooks/dev-link-ensure.sh`, `.claude/skills/fctry-release/SKILL.md`, `CLAUDE.md`), commit with a clear message referencing the migration. **Don't merge to main — that happens in Phase 6.**
4. Proceed through Phases 2–10 as listed above, pausing for approval at each phase boundary. Phase 4 (GitHub repo rename) is the one point to triple-check before executing.

## Verification commands that should still work

```bash
# Library scanner sanity check (expects 15 plugins, 7 servers, 1 skill, 2 commands, 3 hooks)
cd ~/Code/ensemble && npx tsx -e "
import { scanLibraryGlobal } from './src/discovery/library.ts';
const tools = scanLibraryGlobal();
const byType = {};
for (const t of tools) byType[t.type] = (byType[t.type] ?? 0) + 1;
console.log(byType);
"

# Project scanner sanity check (should not include .DS_Store)
npx tsx -e "
import { scanClientsForProjects } from './src/discovery/projects.ts';
const p = scanClientsForProjects();
console.log('count:', p.length, 'any ds_store?', p.some(x => x.name.toLowerCase().includes('ds_store')));
"

# Desktop type check
cd packages/desktop && npx tsc --noEmit 2>&1 | grep -v "SkillsPage\|GroupsPage\|ServersPage\|useConfig\|SkillSyncResult\|showRegistry\|adapters\|ipc-handlers.ts(215\|ipc-handlers.ts(244\|ipc-handlers.ts(268\|ipc-handlers.ts(282\|ipc-handlers.ts(379"
# Expected: zero output (only pre-existing errors filtered above remain)

# Run the desktop app (restart needed for main/preload changes)
cd packages/desktop && npm run dev
```

## Files touched this session (git-level)

Run `git status -s` in `~/Code/ensemble` and in `~/Code/resources/md-convert` to see untracked files. The major uncommitted work:

- `~/Code/ensemble` — new files in `src/discovery/` and `packages/desktop/src/renderer/panels/`, modified files in `src/`, `packages/desktop/src/main/`, `packages/desktop/src/preload/`, `packages/desktop/src/renderer/`, and an updated `.interface-design/system.md` and `HANDOFF.md`.
- `~/Code/resources/md-convert/` — new directory, entirely untracked.
- `~/.claude/plugins/marketplaces/fctry-marketplace/md-convert-tmp/` — empty leftover from a rejected tool call, safe to `rm -rf`.

**Consider a commit before clearing context** to checkpoint the session's work.
