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
