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

Remove a server from the registry. Also removes it from any groups it belongs to.

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

## Sync

### `mcpoyle sync [<client>] [options]`

Write the resolved server configurations to client config files. Without a client argument, syncs all detected clients.

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would change without writing any files |
| `--project <path>` | Sync only a specific project (Claude Code only) |

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
- Client config files are backed up to `.bak` before writing
- Running sync twice produces the same result (idempotent)

### `mcpoyle import <client>`

Import existing MCP server definitions from a client's config into the central registry. Skips servers that are already registered or managed by mcpoyle.

For Claude Code, also scans all project-level `mcpServers` entries in `~/.claude.json`.

```
mcpoyle import claude-desktop    # import from global config
mcpoyle import claude-code       # import from global + all project configs
```

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
mcpoyle plugins install my-plugin --marketplace homelab
```

Writes to Claude Code:
- Fetches plugin source to `~/.claude/plugins/cache/`
- Sets `"name@marketplace": true` in `~/.claude/settings.json` → `enabledPlugins`

### `mcpoyle plugins uninstall <name>`

Remove a plugin. Removes from `enabledPlugins` and cleans up cached files.

### `mcpoyle plugins enable <name>`

Enable a disabled plugin. Sets `enabledPlugins` entry to `true` without modifying cached files.

### `mcpoyle plugins disable <name>`

Disable a plugin. Sets `enabledPlugins` entry to `false` without removing cached files.

### `mcpoyle plugins show <name>`

Show full plugin details: marketplace, enabled state, cache path, and group membership.

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

## Registry (coming soon)

### `mcpoyle registry search <query>`

Search the Smithery MCP server registry. Not yet implemented.

### `mcpoyle registry add <id>`

Install a server from the Smithery registry. Not yet implemented.

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
