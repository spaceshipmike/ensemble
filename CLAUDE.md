# CLAUDE.md

## Project

Ensemble — Library, CLI, TUI, and desktop app for centrally managing Claude Code extension artifacts across 17 AI clients (21 planned in v2.0.1 spec). Currently managing MCP servers, skills, and plugins; v2.0.1 expands scope to subagents, slash commands, hooks, and settings. Library-first: designed to be consumed by apps (like Chorus) as a dependency. The Electron desktop app provides visual management with full CLI parity; `ensemble browse` provides a TUI-grade discovery experience.

## Tech Stack

- TypeScript, Node 20+, npm (workspaces monorepo)
- CLI: Commander.js (`ensemble` / `ens`)
- Desktop: Electron + React + Tailwind CSS (packages/desktop/)
- Validation: Zod (schemas exported for consumers)
- Build: tsup (library), electron-vite (desktop)
- Test: Vitest (library/CLI), Playwright (desktop E2E)
- Lint: Biome
- Config: `~/.config/ensemble/config.json`
- Skills: `~/.config/ensemble/skills/`

## Architecture

Library-first with four layers: schemas/config → operations → sync/I/O → presentation (CLI + desktop app). Monorepo: library/CLI at root, desktop at `packages/desktop/`.

| Module | Role |
|--------|------|
| `schemas.ts` | Zod schemas and inferred TypeScript types for the entire data model |
| `config.ts` | Config I/O (loadConfig/saveConfig), query helpers, resolution helpers |
| `operations.ts` | **Pure functions** for all mutations: `(config, params) → { config, result }` |
| `clients.ts` | 17 client definitions, detection, format adapters, CC settings helpers |
| `sync.ts` | Sync engine — resolve + write configs, drift detection, symlink fan-out |
| `skills.ts` | SKILL.md frontmatter parser, canonical store CRUD |
| `search.ts` | BM25-style local capability search across servers and skills |
| `registry.ts` | Registry adapters (Official + Glama), caching, security summary, dynamic marketplace discovery |
| `doctor.ts` | Deterministic health audit, structured scoring, 5 categories |
| `projects.ts` | Project registry reader (optional better-sqlite3) |
| `secrets.ts` | Secret scanning — regex detection in env values and skill content |
| `usage.ts` | Usage tracking for self-learning search scoring |
| `setlist.ts` | Setlist capability integration (read-only, optional `@setlist/core`) |
| `init.ts` | Guided onboarding (`ensemble init` / `--auto`) |
| `export.ts` | Profile-as-plugin group export |
| `discover.ts` | Filesystem scan for existing installed skills and plugins; feeds `addToLibrary` during `ensemble init` |
| `cli/index.ts` | Thin Commander.js wrapper over operations |
| `index.ts` | Public API barrel export |
| `packages/desktop/` | Electron desktop app — React + Tailwind over library via IPC |

### Target modules (v2.0.1, not yet built)

These modules are described in `spec.md` as v2.0.1 targets. They do not exist on disk yet; future agents should not assume their presence.

| Module | Role (spec target) |
|--------|------|
| `agents.ts` | `.claude/agents/*.md` frontmatter parser (name, description, tools, model), canonical store CRUD |
| `commands.ts` | `.claude/commands/*.md` frontmatter parser (description, allowed-tools, argument-hint), canonical store CRUD |
| `hooks.ts` | Hook store — settings.json non-destructive merge under `hooks` key, 7 lifecycle events |
| `settings.ts` | Declarative settings.json key management, non-destructive key-level merge |
| `snapshots.ts` | Safe apply / rollback snapshots — pre-sync capture, restore, retention |
| `browse.ts` | TUI-grade discovery engine — fuzzy search installed + discoverable, @marketplace filter, Card/Slim modes |

## Package Exports

```ts
import { loadConfig, saveConfig, addServer } from 'ensemble';
import { ServerSchema } from 'ensemble/schemas';
import { syncClient } from 'ensemble/sync';
```

## Rules

1. **Operations are pure.** `(config, params) → { config, result }`. No I/O in operations.ts.
2. **Run tests before committing.** All tests must pass: `npm test`
3. **Additive sync only.** Never delete servers, plugins, or skills the user didn't create via Ensemble. The `__ensemble` marker identifies managed entries.
4. **Secrets stay in 1Password.** Env values may contain `op://` references — store them as-is, never resolve.
5. **Always update docs with functionality changes.** Update `COMMANDS.md` and `spec.md` changelog.
6. **Type check.** `npx tsc --noEmit` must pass.

### Target rules (v2.0.1, not yet enforced)

These invariants are described in `spec.md` as v2.0.1 targets. No code enforces them today; future agents should not treat them as active guardrails.

- **Additive sync extends to agents, commands, and hooks.** v2.0.1 widens rule 3 to cover subagents, slash commands, and hooks alongside servers/plugins/skills.
- **Non-destructive settings.json merge.** Every write to `settings.json` (hooks or managed settings) is a key-level merge that preserves every key Ensemble does not own. Unmanaged keys must be byte-identical before and after sync.
- **Safe apply with rollback snapshots.** Every `sync` captures a pre-write snapshot of every touched file. Any sync is reversible via `ensemble rollback`.
