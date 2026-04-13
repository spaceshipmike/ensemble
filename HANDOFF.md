# Handoff — 2026-04-13

Session focused on establishing a new visual direction for the desktop app (Teenage Engineering / patch-bay aesthetic), shipping the first screen (the client picker), and fixing a nasty detection/sync self-reinforcing bug uncovered in the process.

## What shipped

### Design direction — "Patch bay, not dashboard"

Established in `.interface-design/system.md`. TE-coded: flat, hairline, monospaced, color only as signal. See the system doc for tokens, typography, component patterns, motion rules, and migration order.

Canonical token set (under `.te-scope` in `packages/desktop/src/renderer/globals.css`):
`--bone --bone-sunk --graphite --ink-2 --ink-3 --hairline --hairline-strong --signal --sync --key --tape --te-mono`

Rule: color means something or it isn't there. Five colors total, each with exactly one job.

### Scope model

1. **Picker** (entry point) — numbered list of detected clients
2. **Channel mode** — one client, full attention (not yet migrated; still uses legacy sidebar app chrome)
3. **Fan-out mode** — reserved for sync operations, not yet built

The client chip (top-left) is the permanent instrument; clicking it returns to the picker.

### Picker screen (new)

Files:
- `packages/desktop/src/renderer/pages/PickerPage.tsx` — the picker
- `packages/desktop/src/renderer/components/ClientChip.tsx` — the permanent chip
- `packages/desktop/src/renderer/App.tsx` — picker now the entry point; channel view shows after pick

Behavior:
- Reads detected clients via `window.ensemble.clients.detect()` (IPC → `detectClients()`)
- Numbered rows (`01`, `02`…), state glyph (signal/sync/ink-3 square), state label, trailing arrow
- Hover darkens row, focus shows key-blue outline
- Picking a client → sets `activeClient` → existing sidebar app renders with a thin TE chrome bar carrying the chip

### Library: stricter client detection

`src/clients.ts` — `ClientDef` gained three optional fields:
- `requireApp?: string | string[]` — macOS `.app` bundle path(s); any-of semantics
- `requireBin?: string` — binary name, resolved against `PATH`
- `requireVscodeExtension?: string` — directory prefix under `~/.vscode/extensions`; `hasVscodeExtension()` also verifies VS Code.app exists

`isInstalled()` now runs **OR semantics** across these in strict mode: a client is installed if *any* declared real-artifact check passes. Legacy config-file detection is kept as a fallback for un-annotated clients.

All 17 clients annotated. Strict mode means config files alone no longer imply installation, which breaks the self-reinforcing loop where sync wrote configs that then caused detection to return true forever.

Notable: **Codex CLI and desktop app share `~/.codex/config.toml`** (verified via OpenAI docs). One ClientDef with id `codex-cli`, display name `Codex`, both `requireBin: "codex"` and `requireApp: "/Applications/Codex.app"`.

### Library: sync filter

`src/sync.ts` — `syncAllClients` now skips any `clientDef` where `!isInstalled(clientDef)`. This is the root-cause fix for phantom config creation. `syncClient` (single-client) is unchanged — callers that know what they're doing can still target a specific client explicitly.

### Filesystem cleanup (one-shot, not scripted)

Deleted 11 phantom client config files that previous syncs had written to non-installed clients:

```
~/.cursor/mcp.json
~/.windsurf/mcp.json
~/.config/zed/settings.json
~/.config/mcpx/config.toml
~/.copilot/mcp-config.json
~/.config/github-copilot/mcp.json
~/.aws/amazonq/mcp.json
~/.vscode/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
~/.vscode/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json
~/.opencode/config.json
~/.ampcode/mcp.json
```

Safety check confirmed every file contained only `__ensemble`-marked entries and no user content before deletion. `*.ensemble-backup` files left in place.

Also cleaned a corrupt entry from `~/.config/ensemble/config.json`: `clients` array contained a single `null`, which crashed Zod validation in `loadConfig()` (and was why the desktop app showed zero servers/skills/plugins after picking a client until it was stripped).

## Known issues to clean up

### 1. Picker row state is always `EMPTY`

`PickerPage.tsx`'s data loader computes drift/server counts via `clientsMap[c.id]`, but Ensemble's config has `clients` as an **array of client objects**, not a `Record<id, entry>`. The lookup never resolves, so every row shows the EMPTY glyph regardless of actual state. Cosmetic — not blocking.

Fix: build the lookup via `(config.clients ?? []).reduce((acc, c) => { acc[c.name] = c; return acc; }, {})` or similar, using the real shape.

### 2. `packages/desktop/package.json` dep rewrite is untested through `npm install`

Changed `"ensemble": "*"` → `"ensemble": "file:../.."` to prevent the dep from resolving to the unrelated public `yoshuawuyts/ensemble` npm package. The live fix was a manual symlink at `node_modules/ensemble → ../.`. Next `npm install` might re-resolve. If it does, re-symlink manually or investigate workspace protocol (`"ensemble": "workspace:*"` may be preferable but would require making the root itself a workspace).

Note: `packages/desktop/electron.vite.config.ts` aliases `ensemble` directly to `../../src/index.ts` for the main-process bundle, so electron-vite builds are unaffected by node_modules resolution. The symlink matters for `tsc --noEmit`, tests, and any tooling that resolves through node_modules.

### 3. Legacy dark UI inside the TE chrome bar

After picking a client, the existing sidebar + page UI renders unchanged, inside a thin TE chrome bar. Visible seam between bone chrome and dark content. Intended — screen-by-screen migration comes next.

Migration order (from `.interface-design/system.md`):
1. Doctor view — smallest, mostly text, validates the dense-ledger pattern
2. Servers page — highest-impact, most daily use
3. Skills / Plugins — inherit from Servers
4. Sync page → becomes **Fan-out mode** (the rack)
5. Remove legacy sidebar; navigation becomes tabs inside the channel view

### 4. Detection coverage gaps

- `jetbrains` still uses `globPattern` (unchanged). Strict mode not applied. May over-match.
- `copilot-cli` requires `gh-copilot` as the binary name (the gh extension). If the user installs gh-copilot another way, detection won't fire.
- `copilot-jetbrains` lists 13 JetBrains app bundles explicitly. If a new JetBrains product ships, it won't be detected until added.
- No entry exists for a hypothetical standalone "Codex app" beyond the existing `codex-cli` entry (which now covers both surfaces).

### 5. Desktop app `tsc --noEmit` has pre-existing errors

`packages/desktop/tsconfig.json` has several stale type errors in legacy pages (`GroupsPage`, `ServersPage`, `SkillsPage`, `useConfig`). None are from this session's changes; none block runtime. Would be worth a one-pass cleanup.

## Invariants to remember

- **Detection must be strict.** Config files alone do not imply installation — Ensemble itself writes them. Use `requireApp` / `requireBin` / `requireVscodeExtension`, not `detectPaths`, for new clients.
- **Sync must respect detection.** `syncAllClients` gates on `isInstalled()`. If you add another fan-out surface, do the same.
- **One color per job.** Signal orange = drift. Sync green = healthy. Key blue = focus/selection. Tape red = destructive/conflict. Never dilute. New states need new tokens, not new colors.
- **Picker is the entry point.** `activeClient === null` → picker. Don't bypass it.
- **The chip is the only persistent nav element.** No fleet strip, no sidebar-as-primary-nav. Channel mode is single-client focus; fan-out mode is the only place multiple clients share screen.
- **Scoped CSS tokens.** The TE token block lives under `.te-scope` in `globals.css` so it doesn't fight the legacy dark UI during migration. New TE screens must wrap their root in `className="te-scope"`.

## Verification commands

```bash
# Library tests (clients + sync)
npx vitest run tests/clients.test.ts tests/sync.test.ts

# Detection reality check
npx tsx -e "import { detectClients } from './src/clients.ts'; for (const c of detectClients()) console.log(c.id, '—', c.name);"

# Load the canonical config through Zod
npx tsx -e "import { loadConfig } from './src/config.ts'; const c = loadConfig(); console.log('servers:', c.servers.length, 'skills:', c.skills.length, 'plugins:', c.plugins.length, 'clients:', c.clients.length);"

# Run the desktop app
cd packages/desktop && npm run dev
```

## Files touched this session

- `src/clients.ts` — strict detection fields, `isBinOnPath`, `hasVscodeExtension`, refactored `isInstalled`, annotated all 17 client defs
- `src/sync.ts` — `syncAllClients` gates on `isInstalled`; added `isInstalled` import
- `packages/desktop/package.json` — `"ensemble": "file:../.."`
- `packages/desktop/src/renderer/App.tsx` — picker-first entry flow, chip chrome bar
- `packages/desktop/src/renderer/pages/PickerPage.tsx` — new
- `packages/desktop/src/renderer/components/ClientChip.tsx` — new
- `packages/desktop/src/renderer/globals.css` — `.te-scope` token block + hover/focus rules
- `.interface-design/system.md` — new, captures design direction
