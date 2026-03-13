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

---

# TUI

## Feature: TUI Dashboard
> I launch the TUI and see my entire mcpoyle configuration at a glance — servers, plugins, marketplaces, groups, and detected clients — without running multiple CLI commands.

Category: Viewer | Depends on: —

### Critical

#### Scenario: Launch TUI and See Full Dashboard

> **Given** the user has a populated mcpoyle config with servers, plugins, marketplaces, groups, and at least one detected client
> **When** the user runs `mcp tui`
> **Then** the TUI launches and presents a dashboard with distinct panels showing servers (with enabled/disabled state), plugins, marketplaces, groups, and detected clients. All data is visible without scrolling through CLI output.

**Satisfied when:** The user can see their servers, plugins, groups, marketplaces, and detected clients all represented in the dashboard within 2 seconds of launch, each in a visually distinct panel or tab, with accurate counts and states matching the CLI output of the equivalent list commands.

Validates: TUI Dashboard (new feature)

#### Scenario: Dashboard Reflects Current Config State

> **Given** the user has just made changes via the CLI (e.g., disabled a server, added a plugin)
> **When** the user launches `mcp tui`
> **Then** the dashboard reflects the current state of the config — the disabled server shows as disabled, the new plugin appears in the plugin panel.

**Satisfied when:** Every item visible in the TUI dashboard matches the state that would be shown by the corresponding CLI list/show commands, with no stale or missing data.

Validates: TUI Dashboard (new feature)

### Edge Cases

#### Scenario: Empty Config Dashboard

> **Given** the user has a fresh mcpoyle installation with no servers, plugins, groups, or marketplaces configured
> **When** the user runs `mcp tui`
> **Then** the TUI launches successfully and shows empty panels with clear indication that no items exist yet, rather than crashing or showing a blank screen.

**Satisfied when:** The TUI renders without error and each panel communicates its empty state in a way that is informative rather than confusing — the user understands there is nothing configured yet.

Validates: TUI Dashboard (new feature)

#### Scenario: Large Config Dashboard

> **Given** the user has 20+ servers, 15+ plugins, and 10+ groups
> **When** the user launches `mcp tui`
> **Then** the panels handle overflow gracefully with scrolling. Items remain readable and navigable.

**Satisfied when:** All items are accessible through scrolling within their respective panels, and the layout does not break or become unreadable with high item counts.

Validates: TUI Dashboard (new feature)

### Polish

#### Scenario: Dashboard Visual Hierarchy

> **Given** the user launches the TUI
> **When** they scan the dashboard
> **Then** the layout uses clear visual hierarchy — panel headers, borders, and color to distinguish sections. Enabled items are visually distinct from disabled items.

**Satisfied when:** A user can quickly identify which panel they are looking at and which items are enabled vs disabled without reading every label, through consistent use of color, spacing, or other visual cues.

Validates: TUI Dashboard (new feature)

---

## Feature: TUI Navigation
> I move between panels and interact with items using keyboard navigation that feels natural and predictable.

Category: Viewer | Depends on: TUI Dashboard

### Critical

#### Scenario: Navigate Between Panels with Tab

> **Given** the TUI is running and the user is focused on the servers panel
> **When** the user presses Tab
> **Then** focus moves to the next panel. Pressing Tab again continues cycling through panels. The currently focused panel is visually highlighted.

**Satisfied when:** The user can reach every panel using Tab, the focused panel is clearly indicated, and Shift+Tab reverses direction through the panels.

Validates: TUI Navigation (new feature)

#### Scenario: Navigate Items with Arrow Keys and Select with Enter

> **Given** the user is focused on the servers panel which contains multiple servers
> **When** the user presses Up/Down arrow keys to highlight a server, then presses Enter
> **Then** the highlighted server's detail view or action menu appears. Pressing Esc returns to the panel.

**Satisfied when:** Arrow keys move a visible highlight through items in the focused panel, Enter opens a context for the highlighted item, and Esc reliably returns to the previous view without losing place.

Validates: TUI Navigation (new feature)

### Edge Cases

#### Scenario: Navigation in Empty Panel

> **Given** the user is focused on a panel that contains no items (e.g., no plugins configured)
> **When** the user presses arrow keys or Enter
> **Then** nothing breaks — the TUI handles the empty state gracefully without errors or unexpected behavior.

**Satisfied when:** Arrow keys and Enter do not cause errors, crashes, or focus jumps when used in an empty panel.

Validates: TUI Navigation (new feature)

### Polish

#### Scenario: Focus Indicator is Always Visible

> **Given** the user is navigating the TUI
> **When** they switch panels or scroll through items
> **Then** there is always a clear visual indicator of what is currently focused — both at the panel level and at the item level within a panel.

**Satisfied when:** At no point during navigation does the user lose track of where keyboard focus is. The focus indicator is visible and unambiguous in all panels.

Validates: TUI Navigation (new feature)

---

## Feature: TUI Toggle Actions
> I can enable, disable, and remove servers and plugins directly from the TUI without dropping to the CLI.

Category: Viewer | Depends on: TUI Navigation

### Critical

#### Scenario: Toggle Server Enabled State

> **Given** the user is viewing the servers panel with a server currently enabled
> **When** the user highlights the server and triggers the toggle action (e.g., Enter or a keybinding)
> **Then** the server state flips to disabled. The panel updates immediately to reflect the change. The underlying config file is updated.

**Satisfied when:** After toggling, the server's visual state in the TUI matches the new state, and running `mcp list` in a separate terminal confirms the change persisted to the config file.

Validates: TUI Toggle Actions (new feature)

#### Scenario: Toggle Plugin Enabled State

> **Given** the user is viewing the plugins panel with a plugin currently disabled
> **When** the user highlights the plugin and triggers the toggle action
> **Then** the plugin state flips to enabled. The panel updates immediately and the change persists to the config.

**Satisfied when:** The plugin's visual state updates in the TUI, and the change is reflected in both mcpoyle's config and the relevant Claude Code settings file.

Validates: TUI Toggle Actions (new feature)

#### Scenario: Assign Server to Group from TUI

> **Given** the user is viewing a server in the TUI and groups exist in the config
> **When** the user selects an "assign to group" action for that server
> **Then** a group selection interface appears, the user picks a group, and the server is added to that group. The groups panel reflects the change.

**Satisfied when:** The server appears in the selected group's member list in the TUI, and `mcp groups show <group>` confirms the assignment persisted.

Validates: TUI Toggle Actions (new feature)

### Edge Cases

#### Scenario: Toggle with Concurrent CLI Change

> **Given** the user has the TUI open and another terminal session changes the config (e.g., disables a server via CLI)
> **When** the user attempts to toggle that same server in the TUI
> **Then** the operation either succeeds based on the latest config state or the TUI refreshes to show the current state without corrupting the config file.

**Satisfied when:** The config file is not corrupted by concurrent access, and the TUI either reflects the latest state or handles the conflict without data loss.

Validates: TUI Toggle Actions (new feature)

### Polish

#### Scenario: Immediate Visual Feedback on Toggle

> **Given** the user toggles a server or plugin
> **When** the action completes
> **Then** the state change is reflected visually within the same frame — there is no perceptible delay between the action and the visual update.

**Satisfied when:** The toggle feels instant — the user does not see a loading state or stale value after pressing the toggle key.

Validates: TUI Toggle Actions (new feature)

---

## Feature: Sync Preview Panel
> I see exactly what sync would write to each client's config before I confirm, so I can sync with confidence.

Category: Viewer | Depends on: TUI Dashboard

### Critical

#### Scenario: View Dry-Run Sync Preview

> **Given** the user has servers and plugins assigned to clients with pending changes (e.g., a newly enabled server that hasn't been synced yet)
> **When** the user opens the sync preview panel in the TUI
> **Then** a dry-run view appears showing, for each affected client, what changes sync would make — servers to add/remove/update, plugins to enable/disable, marketplace entries to write.

**Satisfied when:** The preview shows the same information as `mcp sync --dry-run` but organized by client in a readable panel layout, with additions, removals, and modifications clearly distinguished.

Validates: Sync Preview Panel (new feature)

#### Scenario: Confirm and Execute Sync from Preview

> **Given** the user is viewing the sync preview and the changes look correct
> **When** the user confirms the sync (e.g., presses Enter or a confirm keybinding)
> **Then** the sync executes, client configs are written, and the preview updates to show a success state. The dashboard reflects the synced state.

**Satisfied when:** After confirmation, the client config files contain the expected changes, the TUI shows sync completion, and the dashboard's last-synced timestamps update.

Validates: Sync Preview Panel (new feature)

### Edge Cases

#### Scenario: Sync Preview with No Pending Changes

> **Given** all clients are already in sync with the mcpoyle config
> **When** the user opens the sync preview panel
> **Then** the panel clearly communicates that everything is in sync — no changes pending.

**Satisfied when:** The user sees a clear "nothing to sync" state rather than an empty panel or confusing output.

Validates: Sync Preview Panel (new feature)

#### Scenario: Sync Preview Shows Plugin-Only Changes for Claude Code

> **Given** a group assigned to Claude Code has plugin changes but no server changes, and a group assigned to Cursor has no changes
> **When** the user opens the sync preview
> **Then** only Claude Code appears with pending plugin changes. Cursor either does not appear or shows "no changes." Plugin changes are not shown for non-Claude Code clients.

**Satisfied when:** The preview correctly scopes plugin changes to Claude Code only and does not misleadingly show plugin-related changes for clients that do not support plugins.

Validates: Sync Preview Panel (new feature)

### Polish

#### Scenario: Sync Preview Diff Readability

> **Given** the sync preview contains multiple changes across multiple clients
> **When** the user reads the preview
> **Then** additions, removals, and modifications are visually distinguished (e.g., through color or symbols), and the layout groups changes by client for easy scanning.

**Satisfied when:** A user can quickly scan the preview and understand what will change for each client without reading every line in detail.

Validates: Sync Preview Panel (new feature)

---

## Feature: Command Palette
> I use a searchable command palette to quickly perform any action without memorizing keybindings or navigating to the right panel.

Category: Viewer | Depends on: TUI Dashboard

### Critical

#### Scenario: Open Command Palette and Search

> **Given** the TUI is running on any screen
> **When** the user presses Ctrl+P
> **Then** a command palette overlay appears with a search input. The user can type to filter available commands (e.g., "sync", "add server", "assign group"). Selecting a command executes it or opens the relevant interface.

**Satisfied when:** Ctrl+P opens the palette from any panel, typing filters the command list in real time, and selecting a command performs the expected action or navigation.

Validates: Command Palette (new feature)

#### Scenario: Command Palette Covers Key Actions

> **Given** the command palette is open
> **When** the user searches for common operations
> **Then** the palette includes at least: sync (all and per-client), server enable/disable, plugin enable/disable, assign group, open sync preview.

**Satisfied when:** The core actions available through panel navigation are also discoverable and executable through the command palette, providing a consistent alternative interaction path.

Validates: Command Palette (new feature)

### Edge Cases

#### Scenario: Command Palette with No Matching Results

> **Given** the command palette is open
> **When** the user types a query that matches no commands
> **Then** the palette shows a clear "no results" message rather than an empty list.

**Satisfied when:** The user receives clear feedback that their search had no matches, and can either refine their query or dismiss the palette with Esc.

Validates: Command Palette (new feature)

### Polish

#### Scenario: Command Palette Feels Responsive

> **Given** the command palette is open
> **When** the user types characters to filter
> **Then** the filtered results update with each keystroke without perceptible lag.

**Satisfied when:** Filtering feels instantaneous — there is no visible delay between typing and the results list updating.

Validates: Command Palette (new feature)

---

## Feature: Operations Layer
> The CLI and TUI share the same business logic, so any action I perform has identical results regardless of which interface I use.

Category: System Quality | Depends on: —

### Critical

#### Scenario: CLI and TUI Produce Identical Config Changes

> **Given** the user has the same starting config
> **When** they perform the same action via CLI (e.g., `mcp disable my-server`) and via TUI (navigating to the server and toggling it off)
> **Then** the resulting config file is byte-identical in both cases.

**Satisfied when:** For toggle, enable, disable, assign-group, and sync operations, the config file mutations are identical whether triggered from CLI or TUI, confirming they share the same operations layer.

Validates: Operations Layer (new feature, spec Architecture section)

#### Scenario: Operations Layer Returns Structured Results

> **Given** the operations layer processes a request (e.g., toggle server, sync client)
> **When** the operation completes
> **Then** it returns a structured result object (not printed text) that both CLI and TUI can format for their respective presentations.

**Satisfied when:** The operations module's public functions return dataclasses or typed dicts rather than strings or None, and neither the CLI nor TUI layer needs to duplicate business logic.

Validates: Operations Layer (new feature, spec Architecture section)

#### Scenario: CLI Commands Still Work After Operations Extraction

> **Given** the operations layer has been extracted from cli.py into a shared module
> **When** the user runs any existing CLI command (list, add, remove, enable, disable, sync, groups, plugins, marketplaces)
> **Then** every command produces the same output and behavior as before the extraction.

**Satisfied when:** All existing CLI tests pass without modification, and the CLI commands produce identical output for the same inputs as they did before the refactor.

Validates: Operations Layer (new feature, spec Architecture section)

### Edge Cases

#### Scenario: Operations Layer Handles Config Lock Contention

> **Given** the operations layer uses file locking to prevent concurrent config writes
> **When** both the CLI and TUI attempt to write to the config simultaneously
> **Then** one operation acquires the lock and completes, the other waits or fails gracefully with a clear error — the config is never left in a corrupt state.

**Satisfied when:** Concurrent operations from CLI and TUI do not corrupt the config file, and the user receives clear feedback if a lock contention occurs.

Validates: Operations Layer (new feature, spec Design Principles)
