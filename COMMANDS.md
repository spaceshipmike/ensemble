# mcpoyle CLI Reference

Centrally manage MCP server configurations across AI clients.

## Servers

### `mcpoyle list`

List all registered servers with their enabled/disabled status and command.

### `mcpoyle add <name> --command <cmd> [options]`

Add a new MCP server to the central registry.

| Option | Description |
|--------|-------------|
| `--command <cmd>` | Command to run the server (required) |
| `--args <arg>` | Argument for the command (repeatable) |
| `--env KEY=VAL` | Environment variable (repeatable) |
| `--transport <type>` | Transport type (default: `stdio`) |

```
mcpoyle add ctx --command npx --args tsx --args /path/to/index.ts --args serve
mcpoyle add my-server --command uvx --args my-mcp-server --env API_KEY=op://Dev/my-server/key
```

### `mcpoyle remove <name>`

Remove a server from the registry. Also removes it from any groups it belongs to. If the server is not in mcpoyle's registry but exists as an orphaned `__mcpoyle`-marked entry in a client config, the error message will identify which clients contain the orphan and suggest `mcp import` to adopt it.

### `mcpoyle enable <name>`

Enable a disabled server. Enabled servers are included in sync operations.

### `mcpoyle disable <name>`

Disable a server. Disabled servers are excluded from sync even if they belong to an assigned group.

### `mcpoyle show <name>`

Show full details for a server: status, transport, command, args, env, and group membership.

---

## Groups

### `mcpoyle groups list`

List all groups with their server count and description.

### `mcpoyle groups create <name> [--description <text>]`

Create a new server group.

```
mcpoyle groups create dev-tools --description "Core development MCP servers"
```

### `mcpoyle groups delete <name>`

Delete a group. Any clients assigned to this group revert to receiving all enabled servers.

### `mcpoyle groups show <name>`

Show group details and list member servers with their enabled/disabled status.

### `mcpoyle groups add-server <group> <server>`

Add a server to a group.

```
mcpoyle groups add-server dev-tools ctx
```

### `mcpoyle groups remove-server <group> <server>`

Remove a server from a group.

### `mcpoyle groups add-plugin <group> <plugin>`

Add a plugin to a group. Use short name (e.g., `clangd-lsp`) or full qualified name (`clangd-lsp@claude-plugins-official`).

```
mcpoyle groups add-plugin dev-tools clangd-lsp
```

### `mcpoyle groups remove-plugin <group> <plugin>`

Remove a plugin from a group.

---

## Clients

### `mcpoyle clients`

Detect installed AI clients, show their sync status, group assignments, and any project-level assignments (Claude Code).

**Supported clients:**

| Client ID | Name | Config Path |
|-----------|------|-------------|
| `claude-desktop` | Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| `claude-code` | Claude Code | `~/.claude.json` |
| `cursor` | Cursor | `~/.cursor/mcp.json` |
| `vscode` | VS Code (Copilot) | `~/Library/Application Support/Code/User/settings.json` |
| `windsurf` | Windsurf | `~/.windsurf/mcp.json` |
| `zed` | Zed | `~/.config/zed/settings.json` |
| `jetbrains` | JetBrains | `~/.config/JetBrains/*/mcp.json` |
| `gemini-cli` | Gemini CLI | `~/.gemini/settings.json` |
| `codex-cli` | Codex CLI | `~/.codex/config.toml` |
| `mcpx` | mcpx | `~/.config/mcpx/config.toml` |
| `copilot-cli` | Copilot CLI | `~/.copilot/mcp-config.json` |
| `copilot-jetbrains` | Copilot JetBrains | `~/.config/github-copilot/mcp.json` |
| `amazon-q` | Amazon Q | `~/.aws/amazonq/mcp.json` |
| `cline` | Cline | VS Code globalStorage |
| `roo-code` | Roo Code | VS Code globalStorage |

### `mcpoyle assign <client> <group> [options]`

Assign a server group to a client. Only servers in that group (and enabled) will be synced to the client.

| Option | Description |
|--------|-------------|
| `--all` | Assign all enabled servers instead of a group |
| `--project <path>` | Assign at the project level (Claude Code only) |

```
mcpoyle assign claude-desktop dev-tools
mcpoyle assign cursor --all
mcpoyle assign claude-code minimal --project ~/Code/myapp
```

### `mcpoyle unassign <client> [options]`

Remove a group assignment from a client. The client reverts to receiving all enabled servers.

| Option | Description |
|--------|-------------|
| `--project <path>` | Remove a project-level assignment (Claude Code only) |

```
mcpoyle unassign claude-desktop
mcpoyle unassign claude-code --project ~/Code/myapp
```

---

## Rules

### `mcpoyle rules list`

List all path rules.

### `mcpoyle rules add <path> <group>`

Add a path rule. Projects under the given path automatically receive the specified group during sync. Explicit project assignments always override rules.

When multiple rules match, the most specific (longest) prefix wins.

```
mcpoyle rules add ~/Projects/ assistant
mcpoyle rules add ~/Code/ dev-tools
```

On the next `mcpoyle sync claude-code`, any projects in `~/.claude.json` under `~/Projects/` that don't have an explicit assignment will be auto-assigned the `assistant` group and synced.

### `mcpoyle rules remove <path>`

Remove a path rule. Existing project assignments created by the rule are not removed.

```
mcpoyle rules remove ~/Projects/
```

---

## Search

### `mcpoyle search <query> [--limit <n>]`

Search installed servers by name, tool names, and tool descriptions. Uses BM25-style term frequency ranking with field boosting (server name 3x, tool name 2x, tool description 1x). Results show match score and which fields matched.

```
mcpoyle search "github"
mcpoyle search "file read" --limit 5
```

---

## Scope

### `mcpoyle scope <name> --project <path>`

Move a server or plugin from global scope to project-only. The item is removed from the global Claude Code group and added to the project's group. If groups don't exist yet, they are created automatically:

- If global Claude Code has no group ("all servers" mode), a `claude-code-global` group is created containing all currently enabled servers and plugins
- If the project has no group, one is created (named after the project directory) cloned from the global group

After scoping, the item exists only in the project's group. Run `mcpoyle sync claude-code` to apply the changes.

```
mcpoyle scope ctx --project ~/Code/space-tracker
mcpoyle scope clangd-lsp --project ~/Code/space-tracker
mcpoyle sync claude-code
```

To reverse (move back to global), add the item back to the global group and remove from the project group:

```
mcpoyle groups add-server claude-code-global ctx
mcpoyle groups remove-server space-tracker ctx
mcpoyle sync claude-code
```

---

## Init

### `mcpoyle init [options]`

Guided first-run setup. Walks through client detection, server import, group creation, assignment, and initial sync. Safe to re-run — skips steps that are already done.

| Option | Description |
|--------|-------------|
| `--auto` | Non-interactive: imports from all detected clients, creates no groups, syncs all servers to all clients |

```
mcpoyle init          # interactive guided setup
mcpoyle init --auto   # non-interactive, imports and syncs everything
```

**Steps:**

1. Detect installed AI clients
2. Import existing MCP servers from each client's config
3. Optionally create groups and add servers to them
4. Assign groups to clients (or keep "all servers" default)
5. Preview sync (dry run) and apply on confirmation

---

## Sync

### `mcpoyle sync [<client>] [options]`

Write the resolved server configurations to client config files. Without a client argument, syncs all detected clients.

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would change without writing any files |
| `--project <path>` | Sync only a specific project (Claude Code only) |
| `--force` | Overwrite entries that were modified outside mcpoyle |
| `--adopt` | Update mcpoyle's registry to match manual edits |

```
mcpoyle sync                                    # sync all clients
mcpoyle sync claude-desktop                     # sync one client
mcpoyle sync --dry-run                          # preview changes
mcpoyle sync claude-code --project ~/Code/myapp  # sync one project
```

**Sync behavior:**

- Managed servers are identified by a `__mcpoyle` marker in each entry
- Servers not managed by mcpoyle are never modified or removed (additive only)
- For Claude Code, also syncs plugin enabled/disabled state and marketplace registrations
- Project-level plugin sync writes to `<project>/.claude/settings.local.json` (not `settings.json`), keeping your plugin choices personal and gitignored
- Automatically applies workaround for [CC bug #27247](https://github.com/anthropics/claude-code/issues/27247): ensures `enabledPlugins` key exists in project `settings.json` so local overrides aren't silently dropped
- Client config files are backed up before writing
- Content hashes are stored after each sync; on the next sync, mcpoyle detects entries that were modified outside mcpoyle (drift). Drifted entries are warned about and skipped by default. Use `--force` to overwrite or `--adopt` to accept the manual changes into mcpoyle's registry.
- Running sync twice produces the same result (idempotent)

### `mcpoyle import <client>`

Import existing MCP server definitions from a client's config into the central registry. Skips servers that are already registered or managed by mcpoyle.

For Claude Code, also scans all project-level `mcpServers` entries in `~/.claude.json`.

```
mcpoyle import claude-desktop    # import from global config
mcpoyle import claude-code       # import from global + all project configs
```

---

## Doctor

### `mcpoyle doctor [options]`

Run a deterministic health audit across all managed configs. No network calls, no LLM — purely filesystem checks.

| Option | Description |
|--------|-------------|
| `--json` | Output structured JSON for scripting |

```
mcpoyle doctor          # human-readable output
mcpoyle doctor --json   # structured JSON
```

**Checks performed:**

| Check | Severity | What it detects |
|-------|----------|-----------------|
| Missing env vars | error | Server env has empty values |
| 1Password CLI missing | warning | Env var uses `op://` but `op` CLI not found |
| Unreachable binary | warning | Server command not found on `$PATH` |
| Config parse errors | error | Client config file contains invalid JSON |
| Orphaned entries | warning | `__mcpoyle`-marked entries in client configs not in central registry |
| Stale configs | warning | Client has never been synced |
| Drift detected | warning | Managed entry was modified outside mcpoyle |

---

## Plugins (Claude Code)

Plugin state is tracked via `enabledPlugins`. At the user level, this lives in `~/.claude/settings.json`. At the project level, mcpoyle writes to `<project>/.claude/settings.local.json` (personal, gitignored) so your plugin choices don't affect teammates.

### `mcpoyle plugins list`

List all plugins tracked by mcpoyle with their enabled/disabled status and marketplace.

### `mcpoyle plugins install <name> [options]`

Install a plugin from a known marketplace.

| Option | Description |
|--------|-------------|
| `--marketplace <name>` | Which marketplace to install from (required if ambiguous) |

```
mcpoyle plugins install clangd-lsp
mcpoyle plugins install my-plugin --marketplace my-plugins
```

Writes to Claude Code:
- Sets `"name@marketplace": true` in `~/.claude/settings.json` → `enabledPlugins`

Claude Code handles fetching plugin source to `~/.claude/plugins/cache/` automatically.

### `mcpoyle plugins uninstall <name>`

Remove a plugin. Removes from `enabledPlugins`, removes from groups, and removes from mcpoyle's central config.

### `mcpoyle plugins enable <name>`

Enable a disabled plugin. Sets `enabledPlugins` entry to `true` without modifying cached files.

### `mcpoyle plugins disable <name>`

Disable a plugin. Sets `enabledPlugins` entry to `false` without removing cached files.

### `mcpoyle plugins show <name>`

Show full plugin details: marketplace, enabled state, managed status, qualified name, and group membership.

### `mcpoyle plugins import`

Import existing plugins from `enabledPlugins` in `~/.claude/settings.json` into mcpoyle's central registry. Marks imported plugins as `managed: false`. Does not modify Claude Code's config.

```
mcpoyle plugins import    # import all existing plugins
```

---

## Marketplaces (Claude Code)

### `mcpoyle marketplaces list`

List all known marketplaces with their source type and plugin count.

### `mcpoyle marketplaces add <name> [options]`

Register a new marketplace.

| Option | Description |
|--------|-------------|
| `--repo <owner/repo>` | GitHub repository source |
| `--path <dir>` | Local directory source |

```
mcpoyle marketplaces add my-plugins --repo myorg/claude-plugins
mcpoyle marketplaces add local-dev --path ~/Code/my-marketplace
```

Registers in both mcpoyle's config and Claude Code's `settings.json` → `extraKnownMarketplaces`. Uses CC's native format (`{"source": "github", "repo": "..."}` or `{"source": "directory", "path": "..."}`).

Reserved names that will be rejected: `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `life-sciences`.

### `mcpoyle marketplaces remove <name>`

Remove a marketplace from mcpoyle's config and Claude Code's `extraKnownMarketplaces`. Does not uninstall plugins from that marketplace.

### `mcpoyle marketplaces show <name>`

Show marketplace details: source and list of available plugins.

---

## Registry

### `mcpoyle registry search <query> [--no-cache]`

Search MCP server registries (Official MCP Registry + Glama). Results show server name, transport type, source registry, and description. Use `--no-cache` to bypass the response cache.

### `mcpoyle registry show <id> [--no-cache]`

Show full details for a server from its source registry: description, transport, required env vars, available tools, and estimated token cost. Use `--no-cache` to bypass the response cache.

### `mcpoyle registry add <id> [options]`

Install a server from a registry into mcpoyle's central config. Automatically translates registry metadata to mcpoyle's server format (npm→npx, pypi→uvx). Stores origin provenance and tool metadata.

| Option | Description |
|--------|-------------|
| `--env KEY=VAL` | Environment variable (repeatable). Prompts for required vars not provided. |

```
mcpoyle registry search "github"
mcpoyle registry show @anthropic/github-mcp
mcpoyle registry add @anthropic/github-mcp --env GITHUB_TOKEN=op://Dev/github/token
```

### `mcpoyle registry backends`

List available registry backends with their base URLs.

### `mcpoyle registry cache-clear`

Clear the file-based registry response cache at `~/.config/mcpoyle/cache/registry/`. Cache TTL is configurable via `registry_cache_ttl` in settings (default: 3600s).

---

## Configuration

Central config is stored at `~/.config/mcpoyle/config.json`. Created automatically on first use.

### Project-Level Assignments (Claude Code)

Claude Code supports per-project MCP server configs. mcpoyle writes project-level servers to `~/.claude.json` under `projects.<absolute-path>.mcpServers`.

- Global assignment syncs to the top-level `mcpServers`
- Project assignment syncs to the project's nested `mcpServers`
- `mcpoyle sync claude-code` syncs both global and all project-level assignments
- Different projects can use different groups

```
mcpoyle assign claude-code dev-tools                        # global
mcpoyle assign claude-code minimal --project ~/Code/myapp   # project-level
mcpoyle sync claude-code                                    # syncs both
```

### Plugin Config Paths

| Scope | File | Managed by |
|-------|------|------------|
| User (global) | `~/.claude/settings.json` → `enabledPlugins` | `mcpoyle plugins install/enable/disable` |
| Project (personal) | `<project>/.claude/settings.local.json` → `enabledPlugins` | `mcpoyle sync` (when group has plugins) |
| Marketplaces | `~/.claude/settings.json` → `extraKnownMarketplaces` | `mcpoyle marketplaces add/remove` |

Project-level plugins are written to `settings.local.json` (gitignored) rather than `settings.json` (committed), so your plugin preferences don't affect the team. mcpoyle automatically ensures the `enabledPlugins` key exists in the project's `settings.json` as a workaround for a [known Claude Code bug](https://github.com/anthropics/claude-code/issues/27247) where local overrides are silently ignored without it.
