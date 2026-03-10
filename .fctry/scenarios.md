# mcpoyle Scenarios

## S1: Plugin Lifecycle

**As a** user managing Claude Code plugins,
**I can** install, enable, disable, uninstall, and list plugins through mcpoyle,
**so that** I don't have to manually edit `~/.claude/settings.json`.

### Satisfaction criteria
- `mcpoyle plugins install clangd-lsp` adds the plugin to `enabledPlugins` in `~/.claude/settings.json` and to the mcpoyle registry
- `mcpoyle plugins disable clangd-lsp` sets the plugin to `false` in `enabledPlugins`
- `mcpoyle plugins enable clangd-lsp` sets the plugin back to `true`
- `mcpoyle plugins uninstall clangd-lsp` removes from `enabledPlugins` and mcpoyle registry
- `mcpoyle plugins list` shows all tracked plugins with enabled/disabled state and marketplace
- `mcpoyle plugins show clangd-lsp` shows full plugin details
- `mcpoyle plugins import` imports existing plugins from `enabledPlugins` into mcpoyle's registry

## S2: Marketplace Management

**As a** user with custom plugin sources,
**I can** register, list, and remove marketplaces,
**so that** I can install plugins from GitHub repos or local directories.

### Satisfaction criteria
- `mcpoyle marketplaces add homelab --path /local/dir` registers in mcpoyle config AND writes to `extraKnownMarketplaces` in `~/.claude/settings.json`
- `mcpoyle marketplaces add my-plugins --repo myorg/claude-plugins` registers a GitHub marketplace
- `mcpoyle marketplaces list` shows all marketplaces with source type
- `mcpoyle marketplaces show homelab` shows details and available plugins
- `mcpoyle marketplaces remove homelab` removes from both mcpoyle config and `extraKnownMarketplaces`
- Reserved marketplace names (`claude-plugins-official`, etc.) are rejected on add

## S3: Groups with Plugins

**As a** user organizing servers and plugins into groups,
**I can** add and remove plugins from groups,
**so that** different clients get different plugin sets when synced.

### Satisfaction criteria
- Group dataclass supports a `plugins` field
- `mcpoyle groups add-plugin dev-tools clangd-lsp` adds a plugin to a group
- `mcpoyle groups remove-plugin dev-tools clangd-lsp` removes it
- `mcpoyle groups show dev-tools` lists both servers and plugins
- `mcpoyle sync claude-code` syncs plugins from the assigned group to `enabledPlugins`
- Plugin entries in groups are silently ignored for non-Claude Code clients

## S4: Plugin-Aware Sync

**As a** user syncing configs,
**I can** run `mcpoyle sync` and have both server and plugin configs updated,
**so that** sync is a single command for the full configuration.

### Satisfaction criteria
- `mcpoyle sync claude-code` writes both MCP servers and plugin state
- `mcpoyle sync --dry-run` shows both server and plugin changes
- Non-Claude Code clients ignore plugin assignments silently
- Plugin sync uses `enabledPlugins` format in `~/.claude/settings.json`
- Marketplace registrations are synced to `extraKnownMarketplaces`

## S5: Config Schema Complete

**As a** developer,
**the** central config at `~/.config/mcpoyle/config.json` includes all spec-defined fields,
**so that** plugins, marketplaces, and settings are persisted.

### Satisfaction criteria
- Config includes `plugins` list with Plugin dataclass (name, marketplace, enabled, managed)
- Config includes `marketplaces` list with Marketplace dataclass (name, source)
- Config includes `settings.adopt_unmanaged_plugins` toggle
- Full JSON round-trip for all new fields
- Existing server/group/client data is preserved on migration

## S6: Existing Tests Pass

**As a** developer,
**all** existing tests continue to pass after plugin/marketplace additions,
**so that** the server management foundation remains stable.

### Satisfaction criteria
- All 19 existing tests pass without modification
- No breaking changes to existing CLI commands
- Config files without plugin/marketplace fields load with sensible defaults
