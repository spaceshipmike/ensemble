# CLAUDE.md

## Project

mcpoyle — CLI tool for centrally managing MCP server configurations and Claude Code plugins across AI clients.

## Tech Stack

- Python 3.12+, click, hatch
- Entry point: `mcp` (via `mcpoyle.cli:cli`)
- Config: `~/.config/mcpoyle/config.json`
- Tests: pytest (`tests/`)

## Architecture

Core logic is presentation-agnostic — all operations return structured data, never print directly.

| Module | Role |
|--------|------|
| `config.py` | Data model (Server, Plugin, Marketplace, Group, etc.) and JSON I/O |
| `clients.py` | Client definitions, detection, config file read/write, CC settings helpers |
| `sync.py` | Sync engine — resolves servers/plugins per client, writes configs |
| `cli.py` | Thin click wrapper that formats and displays |

## Rules

1. **Always update docs with functionality changes.** When adding, changing, or removing CLI commands or behavior:
   - Update `COMMANDS.md` (full CLI reference)
   - Update `FULL_HELP` in `cli.py` (inline reference text)
   - Update `spec.md` changelog if the change is significant
2. **Run tests before committing.** All tests must pass: `.venv/bin/python -m pytest tests/ -q`
3. **Additive sync only.** Never delete servers/plugins the user didn't create via mcpoyle. The `__mcpoyle` marker identifies managed entries.
4. **Secrets stay in 1Password.** Env values may contain `op://` references — store them as-is, never resolve.
