# CLAUDE.md

## Project

Ensemble — Library, CLI, TUI, and desktop app for centrally managing Claude Code extension artifacts across 17 AI clients (21 planned in v2.0.1 spec). Today the library manages MCP servers, skills, plugins, hooks, settings, and rollback snapshots; subagents (`agents.ts`), slash commands (`commands.ts`), and the TUI browse engine (`browse.ts`) remain v2.0.1 targets. Library-first: designed to be consumed by apps (like Chorus) as a dependency. The Electron desktop app provides visual management with full CLI parity; `ensemble browse` provides a TUI-grade discovery experience.

## Tech Stack

- TypeScript, Node 20+, npm (workspaces monorepo)
- CLI: Commander.js (`ensemble` / `ens`)
- Desktop: Electron + React + Tailwind CSS v4 (packages/desktop/), scaffold-compliant (sandboxed, tRPC bridge, minimal preload)
- Desktop IPC: `electron-trpc` 0.7 + `@trpc/server`/`@trpc/client`/`@trpc/react-query` **pinned to ^10.45** and `@tanstack/react-query` pinned to ^4.36. Do not bump any of these independently — electron-trpc 0.7 is not compatible with tRPC v11, and tRPC v10 requires react-query v4. Bumping any one of the four breaks the stack until electron-trpc ships a v11 release.
- Desktop wire format: superjson transformer on both router and client (rich types across IPC)
- Validation: Zod (schemas exported for consumers)
- Build: tsup (library), electron-vite (desktop, main + preload emit CJS so they can `require()` native deps under sandbox)
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
| `sync.ts` | Sync engine — resolve + write configs, non-destructive hook/settings merge, pre-sync snapshot creation, drift detection, symlink fan-out |
| `skills.ts` | SKILL.md frontmatter parser, canonical store CRUD |
| `search.ts` | BM25-style local capability search across servers and skills |
| `registry.ts` | Registry adapters (Official + Glama), caching, security summary |
| `doctor.ts` | Deterministic health audit, structured scoring, 6 categories (adds `capability`) |
| `hooks.ts` | Hook store — non-destructive `settings.json` merge under the `hooks` key, seven lifecycle events |
| `settings.ts` | Declarative `settings.json` key management — non-destructive key-level merge preserving unmanaged keys |
| `snapshots.ts` | Safe apply / rollback snapshots — pre-sync capture, forward-restore, retention |
| `agents.ts` | Subagent store — `.claude/agents/*.md` frontmatter parser, canonical store CRUD, fan-out to client agents directories; dual-field contract (`description` from frontmatter, `userNotes` library-side only) |
| `commands.ts` | Slash command store — `.claude/commands/*.md` frontmatter parser (`description` + optional `allowed-tools`, `argument-hint`), canonical store CRUD, fan-out to client commands directories |
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

**v2.0.1 targets:** See `.fctry/spec.md` §Architecture → Modules (v2.0.1 targets) for remaining unbuilt modules (`browse.ts`, `import-legacy.ts`).

## Package Exports

```ts
import { loadConfig, saveConfig, addServer } from 'ensemble';
import { ServerSchema } from 'ensemble/schemas';
import { syncClient } from 'ensemble/sync';
```

## Rules

1. **Operations are pure.** `(config, params) → { config, result }`. No I/O in operations.ts.
2. **Run tests before committing.** All tests must pass: `npm test`
3. **Additive sync only.** Never delete servers, plugins, skills, agents, commands, hooks, or managed settings keys the user didn't create via Ensemble. The `__ensemble` marker (or `ensemble: managed` frontmatter on markdown resources) identifies managed entries.
4. **Secrets stay in 1Password.** Env values may contain `op://` references — store them as-is, never resolve.
5. **Always update docs with functionality changes.** Update `COMMANDS.md` and `.fctry/changelog.md`.
6. **Type check.** `npx tsc --noEmit` must pass.
