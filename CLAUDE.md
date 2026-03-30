# CLAUDE.md

## Project

Ensemble — Library and CLI for centrally managing MCP servers, skills, and plugins across AI clients. Library-first: designed to be consumed by apps (like Chorus) as a dependency.

## Tech Stack

- TypeScript, Node 20+, npm
- CLI: Commander.js (`ensemble` / `ens`)
- Validation: Zod (schemas exported for consumers)
- Build: tsup (multi-entrypoint ESM)
- Test: Vitest
- Lint: Biome
- Config: `~/.config/ensemble/config.json`
- Skills: `~/.config/ensemble/skills/`

## Architecture

Library-first with four layers: schemas/config → operations → sync/I/O → presentation (CLI).

| Module | Role |
|--------|------|
| `schemas.ts` | Zod schemas and inferred TypeScript types for the entire data model |
| `config.ts` | Config I/O (loadConfig/saveConfig), query helpers, resolution helpers |
| `operations.ts` | **Pure functions** for all mutations: `(config, params) → { config, result }` |
| `clients.ts` | 17 client definitions, detection, format adapters, CC settings helpers |
| `sync.ts` | Sync engine — resolve + write configs, drift detection, symlink fan-out |
| `skills.ts` | SKILL.md frontmatter parser, canonical store CRUD |
| `search.ts` | BM25-style local capability search across servers and skills |
| `registry.ts` | Registry adapters (Official + Glama), caching, security summary |
| `doctor.ts` | Deterministic health audit, structured scoring, 5 categories |
| `projects.ts` | Project registry reader (optional better-sqlite3) |
| `migration.ts` | mcpoyle → Ensemble automatic migration |
| `init.ts` | Guided onboarding (`ensemble init` / `--auto`) |
| `export.ts` | Profile-as-plugin group export |
| `cli/index.ts` | Thin Commander.js wrapper over operations |
| `index.ts` | Public API barrel export |

## Package Exports

```ts
import { loadConfig, saveConfig, addServer } from 'ensemble';
import { ServerSchema } from 'ensemble/schemas';
import { syncClient } from 'ensemble/sync';
```

## Rules

1. **Operations are pure.** `(config, params) → { config, result }`. No I/O in operations.ts.
2. **Run tests before committing.** All tests must pass: `npm test`
3. **Additive sync only.** Never delete servers/plugins the user didn't create via Ensemble. The `__ensemble` marker identifies managed entries.
4. **Secrets stay in 1Password.** Env values may contain `op://` references — store them as-is, never resolve.
5. **Always update docs with functionality changes.** Update `COMMANDS.md` and `spec.md` changelog.
6. **Type check.** `npx tsc --noEmit` must pass.
