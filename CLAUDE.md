# CLAUDE.md

## Project

mcpoyle — CLI tool for centrally managing MCP server configurations and Claude Code plugins across AI clients.

## Tech Stack

- Python 3.12+, click, Textual, hatch
- Entry point: `mcp` (via `mcpoyle.cli:cli`)
- Config: `~/.config/mcpoyle/config.json`
- Tests: pytest (`tests/`)

## Architecture

Core logic is organized into four layers: data model, operations, sync engine, and presentation. The CLI and TUI are both thin presentation layers over a shared operations + sync + config core.

| Module | Role |
|--------|------|
| `config.py` | Data model (Server, Plugin, Skill, Marketplace, Group, etc.) and JSON I/O |
| `clients.py` | Client definitions (17 clients), detection, config file read/write, CC settings helpers |
| `operations.py` | Business logic for all mutations (servers, plugins, skills, groups, trust tiers, collisions, deps, export) — shared by CLI and TUI |
| `sync.py` | Sync engine — resolves servers/plugins/skills per client, writes configs, symlink-based skill sync |
| `skills.py` | Skill store — SKILL.md I/O, minimal frontmatter parser, canonical store operations |
| `search.py` | BM25-style search across servers and skills (name, tools, tags, descriptions) |
| `cli.py` | Thin click wrapper that formats and displays |
| `tui.py` | Textual TUI dashboard — 6 tabs: Servers & Plugins, Skills, Groups, Clients, Marketplaces, Projects |
| `doctor.py` | Deterministic health audit with structured scoring across 5 categories |
| `registry.py` | Registry adapters (Official + Glama), quality signals, security summary, unified source parser |

## Rules

1. **Always update docs with functionality changes.** When adding, changing, or removing CLI commands or behavior:
   - Update `COMMANDS.md` (full CLI reference)
   - Update `FULL_HELP` in `cli.py` (inline reference text)
   - Update `spec.md` changelog if the change is significant
2. **Run tests before committing.** All tests must pass: `.venv/bin/python -m pytest tests/ -q`
3. **Additive sync only.** Never delete servers/plugins the user didn't create via mcpoyle. The `__mcpoyle` marker identifies managed entries.
4. **Secrets stay in 1Password.** Env values may contain `op://` references — store them as-is, never resolve.
