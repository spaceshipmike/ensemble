# Scenarios — Ensemble

> These scenarios serve as the convergence harness for autonomous
> development. They are the holdout set — stored outside the codebase,
> evaluated by LLM-as-judge, measuring satisfaction not pass/fail.
> Scenarios are organized by feature — each feature is a named
> experience with its own scenarios, dependencies, and priority tiers.

## Feature Index

| Category | Feature | Scenarios | Depends on |
|----------|---------|-----------|------------|
| Core | Library API Surface | 5 | — |
| Core | Schema Validation | 4 | — |
| Core | Config Lifecycle | 4 | Library API Surface |
| Core | Server Operations | 4 | Config Lifecycle |
| Core | Client Resolution and Sync | 5 | Server Operations |
| Core | Plugin Lifecycle | 4 | Config Lifecycle |
| Core | Marketplace Management | 3 | Plugin Lifecycle |
| Core | Group Organization | 4 | Server Operations, Plugin Lifecycle |
| Core | Skill Management | 4 | Config Lifecycle |
| Core | Registry and Discovery | 4 | Library API Surface |
| CLI | CLI Surface | 4 | Library API Surface |
| System Quality | Operations Layer | 3 | Library API Surface |
| System Quality | Additive Sync Safety | 3 | Client Resolution and Sync |
| Core | Guided Onboarding (Init) | 4 | Client Resolution and Sync, Skill Management |
| Core | Migration (mcpoyle to Ensemble) | 3 | Config Lifecycle |
| Core | Profile-as-Plugin (Group Export) | 3 | Group Organization, Plugin Lifecycle |
| Desktop | Desktop App Launch and Layout | 4 | Config Lifecycle |
| Desktop | Desktop Server Management | 4 | Server Operations, Group Organization |
| Desktop | Desktop Sync and Drift | 4 | Client Resolution and Sync, Additive Sync Safety |
| Desktop | Desktop Registry Browser | 3 | Registry and Discovery |
| Desktop | Desktop Doctor and Health | 2 | Operations Layer |
| Desktop | Autonomous UI Testing | 2 | Desktop App Launch and Layout, Desktop Server Management |
| Core | Library-First Resource Intake (v2.0.1) | 5 | Library API Surface |
| Core | Install State Matrix (v2.0.1) | 4 | Library-First Resource Intake |
| Desktop | Pivot-Based Desktop IA (v2.0.1) | 5 | Install State Matrix, Desktop App Launch and Layout |
| System Quality | Safe Apply and Rollback Snapshots (v2.0) | 5 | Client Resolution and Sync |
| Core | Managed Agents, Commands, Hooks, Settings (v2.0) | 6 | Library-First Resource Intake, Client Resolution and Sync |
| System Quality | Non-Destructive settings.json Merge (v2.0) | 3 | Managed Agents, Commands, Hooks, Settings |
| CLI | Browse TUI (v2.0) | 4 | Install State Matrix, Registry and Discovery |
| Core | Dynamic Marketplace Registry (v2.0) | 3 | Marketplace Management |
| Core | Expanded Client Roster 17 to 21 (v2.0) | 3 | Client Resolution and Sync |
| Core | Migration v1.3 to v2.0.1 | 3 | Migration (mcpoyle to Ensemble), Library-First Resource Intake |

---

# Core

## Feature: Library API Surface
> I import Ensemble into my application and call operations directly without touching the CLI.

Category: Core | Depends on: —

### Critical

#### Scenario: Consumer Loads Config and Calls Operations

> **Given** a consumer application (like Chorus) has installed Ensemble as an npm dependency
> **When** the consumer imports `loadConfig` from Ensemble, reads the config from disk, calls `addServer(config, serverDef)` to add a new server, and then writes the updated config back to disk
> **Then** the consumer has full control over the load-mutate-save cycle, the returned config object contains the new server, and the written file is valid Ensemble config JSON.

**Satisfied when:**
- `loadConfig(path)` returns a typed config object without side effects (no implicit file writes)
- `addServer(config, serverDef)` returns a new config object with the server added, leaving the original unchanged
- The consumer decides when and where to persist — Ensemble never writes to disk on its own during operations
- TypeScript types are fully inferred without manual casting

Difficulty: medium
Validates: `#library-api` (Architecture)

#### Scenario: All Operations Are Pure Functions Over Config

> **Given** a consumer has loaded an Ensemble config object
> **When** the consumer calls any operation — `addServer`, `removeServer`, `installServer`, `uninstallServer`, `addPlugin`, `removePlugin`, `assignGroup`, `syncResolve` — passing the config as the first argument
> **Then** every operation returns a new config object (or a result containing one) without mutating the input and without performing I/O.

**Satisfied when:**
- Operations are pure functions: `(config, ...args) => newConfig` or `(config, ...args) => Result<newConfig>`
- The original config object is not mutated by any operation
- No operation reads from or writes to the filesystem, network, or environment
- The pattern is consistent across all operation categories (servers, plugins, skills, groups, clients)

Difficulty: medium
Validates: `#library-api` (Architecture)

### Edge Cases

#### Scenario: Consumer Passes Invalid Arguments to Operations

> **Given** a consumer calls `addServer` with a server definition missing required fields (no `name`, or no `command` for a stdio transport)
> **When** the operation validates its input
> **Then** the operation throws a typed error or returns an error result with a clear message — it does not silently produce invalid config.

**Satisfied when:**
- Invalid inputs are rejected before any mutation occurs
- Error messages identify which field is missing or invalid
- The original config is untouched when validation fails
- Errors are typed (not generic `Error`) so consumers can handle them programmatically

Difficulty: easy
Validates: `#library-api` (Architecture)

#### Scenario: Consumer Works With Empty Config

> **Given** a consumer creates a fresh empty config via `createConfig()` or equivalent
> **When** the consumer performs operations on the empty config — adding the first server, creating the first group, assigning a client
> **Then** all operations succeed without null-reference errors or unexpected defaults. The config grows incrementally from empty.

**Satisfied when:**
- An empty config is a valid starting state for all operations
- No operation assumes pre-existing data (servers, groups, clients) unless that data is its explicit input
- The consumer can build up a complete config from scratch using only Ensemble operations

Difficulty: easy
Validates: `#library-api` (Architecture)

### Polish

#### Scenario: TypeScript Autocompletion Guides the Consumer

> **Given** a consumer is writing code that uses Ensemble in a TypeScript-aware editor
> **When** they type an import from `ensemble/operations` or `ensemble/schemas` or access fields on a config object
> **Then** the editor provides accurate autocompletion for all public API functions, their parameters, and return types.

**Satisfied when:**
- All public API functions have explicit TypeScript signatures (not `any`)
- Config objects, server definitions, plugin definitions, and group definitions are fully typed
- Union types (transport types, trust tiers, origin sources) narrow correctly
- JSDoc or TSDoc comments appear on hover for key functions

Difficulty: easy
Validates: `#library-api` (Architecture)

---

## Feature: Schema Validation
> I use Ensemble's exported Zod schemas to validate MCP configurations from untrusted sources.

Category: Core | Depends on: —

### Critical

#### Scenario: Validate External MCP Config with Zod Schema

> **Given** a consumer has received an MCP server configuration from an external source (user input, API response, file import)
> **When** the consumer imports the server schema from `ensemble/schemas` and calls `.parse()` or `.safeParse()` on the external data
> **Then** valid configs parse successfully into typed objects, and invalid configs produce structured Zod errors identifying exactly which fields failed.

**Satisfied when:**
- `serverSchema.safeParse(data)` returns `{ success: true, data: Server }` for valid input
- `serverSchema.safeParse(data)` returns `{ success: false, error: ZodError }` for invalid input with field-level detail
- Schemas are exported from a dedicated path (`ensemble/schemas`) so consumers can import them independently of operations
- Schemas cover all config entity types: servers, plugins, skills, groups, marketplaces, clients

Difficulty: easy
Validates: `#schema-validation` (Architecture)

#### Scenario: Schema Enforces Transport-Specific Requirements

> **Given** a consumer is validating a server definition
> **When** the server has `transport: "stdio"` but is missing the `command` field, or has `transport: "http"` but is missing the `url` field
> **Then** the schema rejects the definition with an error pointing to the missing transport-specific field.

**Satisfied when:**
- stdio transport requires `command` (and optionally `args`)
- http/sse/streamable-http transports require `url`
- Auth fields (`auth_type`, `auth_ref`) are only valid on http transports
- The error message makes it clear which fields are required for the given transport

Difficulty: medium
Validates: `#schema-validation` (Architecture)

### Edge Cases

#### Scenario: Schema Handles Partial and Extra Fields Gracefully

> **Given** a consumer parses data that has extra unknown fields alongside the required ones
> **When** the schema processes the data
> **Then** extra fields are stripped (not passed through) and the result contains only known fields. The parse does not fail due to extra properties.

**Satisfied when:**
- Unknown fields do not cause validation failure
- The parsed output contains only fields defined in the schema
- Optional fields that are absent come through as `undefined`, not with invented defaults

Difficulty: easy
Validates: `#schema-validation` (Architecture)

#### Scenario: Full Config Schema Round-Trip

> **Given** a consumer has a complete Ensemble config object produced by operations
> **When** the consumer serializes it to JSON and then parses it back through `configSchema.parse()`
> **Then** the round-tripped config is identical to the original — no data loss, no field mutations.

**Satisfied when:**
- `configSchema.parse(JSON.parse(JSON.stringify(config)))` produces a deep-equal result
- All nested structures (servers, plugins, skills, groups, clients, rules, marketplaces, settings) survive the round trip
- Origin metadata, tool metadata, and dependency arrays are preserved

Difficulty: easy
Validates: `#schema-validation` (Architecture)

---

## Feature: Config Lifecycle
> I load, create, migrate, and persist Ensemble configs without worrying about format details.

Category: Core | Depends on: Library API Surface

### Critical

#### Scenario: Load Existing Config from Disk

> **Given** a valid Ensemble config JSON file exists on disk
> **When** a consumer calls the config loading function with the file path
> **Then** the function reads the file, validates it against the schema, and returns a fully typed config object.

**Satisfied when:**
- The loader reads from a caller-specified path (not hardcoded)
- The returned object is fully typed with all Ensemble data model types
- Invalid JSON or schema-violating content produces a clear error, not a partial object

Difficulty: easy
Validates: `#config` (Config)

#### Scenario: Create Fresh Config

> **Given** no config file exists yet
> **When** a consumer calls the config creation function
> **Then** a valid empty config object is returned with sensible defaults (empty arrays for servers, groups, plugins, skills, clients; default settings values).

**Satisfied when:**
- The created config passes schema validation
- All collection fields are initialized as empty arrays, not null or undefined
- Settings have documented defaults (e.g., `adopt_unmanaged_plugins: false`)

Difficulty: easy
Validates: `#config` (Config)

### Edge Cases

#### Scenario: Config With Missing Optional Fields Loads Successfully

> **Given** an older config file that lacks newer optional fields (no `skills` array, no `rules`, no `settings` block)
> **When** the config loader processes it
> **Then** missing optional fields are filled with defaults and the config is usable — the consumer does not need to handle a migration step.

**Satisfied when:**
- A config with only `servers` and `groups` loads without error
- Missing `skills`, `plugins`, `marketplaces`, `rules`, and `settings` are populated with defaults
- Existing data is preserved exactly — no rewriting of present fields

Difficulty: easy
Validates: `#config` (Config)

#### Scenario: Config Preserves Unknown Fields for Forward Compatibility

> **Given** a config file contains fields that the current version of Ensemble does not recognize (added by a newer version)
> **When** the config is loaded, modified via operations, and saved back
> **Then** the unknown fields are preserved in the output — Ensemble does not strip data it does not understand.

**Satisfied when:**
- A config with an extra top-level field (e.g., `"experimentalFeature": {}`) survives a load-modify-save cycle
- The preservation applies at the top level of the config structure
- Operations that modify known fields do not interfere with unknown fields

Difficulty: medium
Validates: `#config` (Config)

---

<!-- v2.0.1: "enable/disable" verbs replaced by install-matrix install/uninstall gestures. Library-level `enabled` field folded into install state. -->
## Feature: Server Operations
> I add, remove, install, uninstall, and inspect servers through Ensemble's operations.

Category: Core | Depends on: Config Lifecycle

### Critical

<!-- v2.0.1 note: This scenario asserts the v1.3 `enabled` boolean directly. Its v2.0.1 replacement lives under "Install State Matrix (v2.0.1)" — "Install Onto Multiple Clients Updates the Matrix in Place" and "Uninstall Leaves Library Entry Intact". Retained for historical reference; body unchanged. -->
#### Scenario: Full Server CRUD Lifecycle

> **Given** a consumer has a loaded Ensemble config
> **When** the consumer adds a server with a name, command, args, and env; then disables it; then re-enables it; then removes it
> **Then** each operation returns an updated config reflecting the change, and the final config has no trace of the removed server.

**Satisfied when:**
- `addServer` adds the server to the servers list with `enabled: true` by default
- `disableServer` sets the server's `enabled` to `false` without removing it
- `enableServer` sets it back to `true`
- `removeServer` completely removes the server from the servers list and from any groups that reference it
- Each step is independently verifiable on the returned config

Difficulty: easy
Validates: `#server-operations` (CLI Surface, Architecture)

#### Scenario: Add Server with Origin Tracking

> **Given** a consumer adds a server and provides origin metadata (source, client, registry ID, timestamp, trust tier)
> **When** the server is added
> **Then** the origin metadata is stored with the server and accessible via show/inspect operations.

**Satisfied when:**
- Origin metadata is an optional parameter on `addServer`
- When provided, origin data is preserved on the server object
- The origin includes `source`, optional `client`, optional `registry_id`, `timestamp`, and optional `trust_tier`

Difficulty: easy
Validates: `#server-operations` (Server Model Fields)

### Edge Cases

#### Scenario: Add Server with Duplicate Name

> **Given** a config already contains a server named "my-server"
> **When** the consumer attempts to add another server with the same name
> **Then** the operation rejects the duplicate with a clear error identifying the name conflict.

**Satisfied when:**
- The add operation fails before mutating the config
- The error identifies the conflicting server name
- The original config is unchanged

Difficulty: easy
Validates: `#server-operations` (CLI Surface)

#### Scenario: Remove Server Cascades to Group Membership

> **Given** a server "ctx" belongs to groups "dev-tools" and "work"
> **When** the consumer removes the server
> **Then** the server is removed from both groups' server lists as well as from the top-level servers array.

**Satisfied when:**
- After removal, no group's `servers` array contains the removed server name
- The groups themselves still exist with their other members intact
- Client assignments referencing those groups are unaffected

Difficulty: medium
Validates: `#server-operations` (Architecture)

---

## Feature: Client Resolution and Sync
> I resolve the correct set of servers, skills, and plugins for any client, respecting groups, rules, and project assignments.

Category: Core | Depends on: Server Operations

### Critical

#### Scenario: Resolve Servers for a Client with Group Assignment

> **Given** a config has client "cursor" assigned to group "dev-tools", and "dev-tools" contains servers "ctx" and "prm"
> **When** the consumer calls the resolution function for client "cursor"
> **Then** the result contains exactly the servers in the "dev-tools" group that are installed on "cursor".

**Satisfied when:**
- Resolution returns only servers belonging to the assigned group
- Servers within the group that are not installed on the target client are excluded from the result
- The result is a list of fully resolved server definitions (not just names)

Difficulty: medium
Validates: `#sync` (Sync)

#### Scenario: Resolve Servers for Client with No Group (Default All)

> **Given** a config has client "cursor" with no group assignment (group is null)
> **When** the consumer resolves servers for "cursor"
> **Then** the result contains all servers from the library that are installed on "cursor".

**Satisfied when:**
- A null group assignment means "receive every library server whose install state includes this client"
- Servers not installed on the target client are excluded
- The behavior matches the spec: "When group is null, the client receives all servers installed on it"

Difficulty: easy
Validates: `#sync` (Sync)

#### Scenario: Resolve with Project-Level Override

> **Given** client "claude-code" has global group "dev-tools" and project-level group "work" for path "~/Code/myapp"
> **When** the consumer resolves servers for "claude-code" at the project level for "~/Code/myapp"
> **Then** the project-level group "work" takes precedence over the global group.

**Satisfied when:**
- Project-level resolution returns servers from the "work" group, not "dev-tools"
- Global resolution (without project path) still returns "dev-tools" servers
- The resolution order matches: explicit assignment > path rules > default

Difficulty: medium
Validates: `#sync` (Project-Level Assignments)

### Edge Cases

#### Scenario: Path Rule Resolution for Unassigned Projects

> **Given** a config has a path rule: `~/Code/work` maps to group "work", and a Claude Code project at `~/Code/work/myapp` has no explicit assignment
> **When** the consumer resolves servers for that project
> **Then** the path rule fires and the project receives the "work" group's servers.

**Satisfied when:**
- Path prefix matching works with tilde expansion
- The most specific (longest) matching prefix wins when rules overlap
- Explicit project assignments take precedence over path rules

Difficulty: medium
Validates: `#path-rules` (Path Rules)

#### Scenario: Sync Produces Client-Native Format

> **Given** a consumer has resolved servers for a specific client
> **When** the consumer requests the client-native config format
> **Then** Ensemble produces the correct JSON structure for that client's config file format (e.g., Claude Desktop's `mcpServers` format, Cursor's format, Claude Code's `~/.claude.json` format).

**Satisfied when:**
- Each client's output format matches its native config schema
- Server fields are mapped correctly (e.g., `env` handling, transport-specific fields)
- The `__mcpoyle` marker is included for managed entries so additive sync can identify them later

Difficulty: hard
Validates: `#sync` (Sync)

---

<!-- v2.0.1: "enable/disable" plugin verbs collapsed into install/uninstall per client. See "Install State Matrix (v2.0.1)" for the library-first replacement. -->
## Feature: Plugin Lifecycle
> I pull Claude Code plugins into the library, install and uninstall them on individual clients, and inspect their state through Ensemble operations.

Category: Core | Depends on: Config Lifecycle

### Critical

<!-- v2.0.1 note: This scenario asserts the v1.3 plugin `enabled` boolean flag directly — a pure implementation assertion obsoleted by the library/install-matrix split. Its v2.0.1 replacement lives under "Library-First Resource Intake (v2.0.1)" and "Install State Matrix (v2.0.1)". Retained for historical reference; body unchanged. -->
#### Scenario: Plugin Install and Enable Lifecycle

> **Given** a consumer has a loaded config
> **When** the consumer installs a plugin by name and marketplace, then disables it, then re-enables it, then uninstalls it
> **Then** each operation updates the config's plugin registry appropriately, and uninstall removes the plugin from both the registry and any groups.

**Satisfied when:**
- Install adds a plugin entry with `enabled: true` and `managed: true`
- Disable sets `enabled: false` without removing the entry
- Enable sets `enabled: true`
- Uninstall removes the plugin from the registry and from all groups' `plugins` arrays
- Each operation returns the updated config without I/O

Difficulty: easy
Validates: `#plugins` (Plugins)

#### Scenario: Plugin Resolution for enabledPlugins Format

> **Given** a config has plugins with marketplace associations
> **When** the consumer resolves plugin state for Claude Code sync
> **Then** the result is in Claude Code's native `enabledPlugins` format: `"name@marketplace": true|false`

**Satisfied when:**
- Enabled plugins produce `"name@marketplace": true`
- Disabled plugins produce `"name@marketplace": false`
- The format matches what Claude Code expects in `~/.claude/settings.json`

Difficulty: easy
Validates: `#plugins` (Plugins, Source of Truth)

### Edge Cases

#### Scenario: Plugin Import from Existing Settings

> **Given** a consumer provides an existing `enabledPlugins` object from Claude Code settings
> **When** the consumer calls the import operation
> **Then** plugins not already in the Ensemble registry are added with `managed: false`, and existing plugins are left unchanged.

**Satisfied when:**
- Import is purely additive to the Ensemble config
- Imported plugins are marked `managed: false`
- Plugins already in the registry are not duplicated or overwritten
- The plugin name and marketplace are correctly parsed from the `"name@marketplace"` key format

Difficulty: medium
Validates: `#plugins` (Import)

#### Scenario: Plugins Silently Ignored for Non-Claude Code Clients

> **Given** a group "dev-tools" contains both servers and plugins, and the consumer resolves this group for client "cursor"
> **When** the resolution computes the sync payload
> **Then** servers are included in the result, but plugins are silently excluded — no error, no warning.

**Satisfied when:**
- Resolution for non-Claude Code clients never includes plugin data
- No error is thrown when a group with plugins is resolved for a non-plugin client
- The behavior is symmetric with skills: skills are excluded for clients without `skills_dir`

Difficulty: easy
Validates: `#sync` (Sync)

---

## Feature: Marketplace Management
> I register custom plugin marketplaces and have them synced to Claude Code's settings.

Category: Core | Depends on: Plugin Lifecycle

### Critical

#### Scenario: Add and Remove Marketplace

> **Given** a consumer has a loaded config
> **When** the consumer adds a marketplace with a name and source (GitHub repo or local directory path), then later removes it
> **Then** the config's marketplaces list reflects the additions and removals.

**Satisfied when:**
- Adding a GitHub marketplace stores `{ source: "github", repo: "owner/repo" }`
- Adding a local marketplace stores `{ source: "directory", path: "/absolute/path" }`
- Removal deletes the marketplace entry from the config
- Removal does not cascade-uninstall plugins from that marketplace

Difficulty: easy
Validates: `#marketplaces` (Marketplaces)

### Edge Cases

#### Scenario: Reserved Marketplace Names Rejected

> **Given** a consumer attempts to add a marketplace with a reserved name ("claude-plugins-official", "anthropic-marketplace", etc.)
> **When** the add operation validates the name
> **Then** the operation is rejected with an error identifying the reserved name.

**Satisfied when:**
- All Claude Code reserved marketplace names are checked
- The error names the reserved name and suggests choosing a different one
- The config is not modified on rejection

Difficulty: easy
Validates: `#marketplaces` (Reserved Names)

#### Scenario: Marketplace Resolution for extraKnownMarketplaces Format

> **Given** a config has custom marketplaces registered
> **When** the consumer resolves marketplace state for Claude Code sync
> **Then** the result is in Claude Code's native `extraKnownMarketplaces` format with the correct source structure.

**Satisfied when:**
- Each marketplace produces the nested `{ name: { source: { source, repo|path } } }` structure
- The official marketplace (`claude-plugins-official`) is excluded from the output (built-in to Claude Code)
- Both GitHub and directory source types are correctly formatted

Difficulty: easy
Validates: `#marketplaces` (Marketplaces)

---

## Feature: Group Organization
> I organize servers, plugins, and skills into named groups and assign groups to clients.

Category: Core | Depends on: Server Operations, Plugin Lifecycle

### Critical

#### Scenario: Group CRUD and Membership

> **Given** a consumer has a config with servers and plugins
> **When** the consumer creates a group, adds servers and plugins to it, shows its membership, then removes a member
> **Then** the group tracks membership accurately, and removing a member from the group does not delete the underlying server or plugin.

**Satisfied when:**
- `createGroup` adds a group with a name, description, and empty member lists
- `addServerToGroup` and `addPluginToGroup` add members by name reference
- Removing a server from a group leaves the server in the top-level registry
- Group show/inspect returns the full list of server names, plugin names, and skill names

Difficulty: easy
Validates: `#groups` (Core Concepts)

#### Scenario: Assign and Unassign Groups to Clients

> **Given** groups "dev-tools" and "work" exist in the config
> **When** the consumer assigns "dev-tools" to client "cursor", then reassigns to "work", then unassigns entirely
> **Then** the client's group assignment updates at each step, and unassigning reverts to null (receive all servers).

**Satisfied when:**
- After assignment, the client entry in config shows the assigned group name
- Reassignment replaces the previous group
- Unassignment sets the group to null
- The client entry is created if it does not already exist

Difficulty: easy
Validates: `#groups` (CLI Surface)

### Edge Cases

#### Scenario: Add Nonexistent Server to Group

> **Given** a group "dev-tools" exists but no server named "phantom" is in the registry
> **When** the consumer tries to add "phantom" to the group
> **Then** the operation fails with an error identifying that the server does not exist.

**Satisfied when:**
- The error is raised before modifying the group
- The message identifies the missing server by name
- The group's existing membership is unchanged

Difficulty: easy
Validates: `#groups` (Architecture)

#### Scenario: Delete Group Cascades to Client Assignments

> **Given** group "dev-tools" is assigned to clients "cursor" and "claude-desktop"
> **When** the consumer deletes the group
> **Then** both clients' group assignments revert to null, and the group is removed from the config.

**Satisfied when:**
- After deletion, no client references the deleted group name
- Clients with reverted assignments fall back to receiving every library server installed on them on next resolution
- Servers and plugins that were in the group still exist in the top-level registry

Difficulty: medium
Validates: `#groups` (Architecture)

---

## Feature: Skill Management
> I manage agent skills — adding, removing, and resolving them for clients that support skills directories.

Category: Core | Depends on: Config Lifecycle

### Critical

<!-- v2.0.1 note: The disable/enable steps below assert the v1.3 skill `enabled` boolean — a pure implementation assertion obsoleted by the library/install-matrix split. The v2.0.1 replacement is covered by "Library-First Resource Intake (v2.0.1)" and "Install State Matrix (v2.0.1)" (skills follow the same library + per-client install model as servers and plugins). Retained for historical reference; body unchanged. -->
#### Scenario: Skill CRUD Lifecycle

> **Given** a consumer has a loaded config
> **When** the consumer adds a skill with name, description, path, and origin metadata; then disables it; then removes it
> **Then** each operation updates the config's skills list, and removal also cleans up group membership.

**Satisfied when:**
- `addSkill` adds a skill entry with the provided metadata and `enabled: true` by default
- `disableSkill` sets `enabled: false`
- `removeSkill` removes the skill from the registry and from all groups' `skills` arrays
- Skill entries include optional fields: `dependencies`, `tags`, `mode` (pin/track)

Difficulty: easy
Validates: `#skills` (Skills Management)

#### Scenario: Skill Resolution Respects Client Support

> **Given** a group contains skills, and the consumer resolves it for a client with skills support (Claude Code) and a client without (a client lacking `skills_dir`)
> **When** resolution runs for each client
> **Then** the skills-capable client receives skill data, and the non-skills client silently receives none.

**Satisfied when:**
- Resolution for Claude Code includes the skills from the assigned group
- Resolution for a client without `skills_dir` omits skills entirely — no error, no warning
- The skill resolution returns paths suitable for symlink fan-out (canonical store paths)

Difficulty: medium
Validates: `#skills` (Skills Management, Client Skills Directory Mapping)

### Edge Cases

#### Scenario: Skill with Missing Dependencies

> **Given** a skill "git-workflow" declares a dependency on server "github-mcp", but "github-mcp" is not in the config
> **When** the consumer adds the skill or inspects its dependency status
> **Then** the skill is added successfully (dependencies are advisory), but inspection reveals the unresolved dependency.

**Satisfied when:**
- Adding a skill with missing dependencies succeeds — dependencies do not block install
- A dependency check function returns which dependencies are present and which are missing
- The missing dependency is identified by name

Difficulty: easy
Validates: `#skills` (Dependency Intelligence)

#### Scenario: Skill Collision Detection

> **Given** a skill "git-workflow" exists at both user scope (canonical store) and project scope (`.claude/skills/`)
> **When** the consumer runs sync resolution for that client
> **Then** the collision is surfaced in the resolution result so the consumer can decide how to handle it.

**Satisfied when:**
- The sync resolution result includes collision metadata when a skill exists at multiple scopes
- The collision identifies both the canonical path and the conflicting path
- The consumer can choose force-overwrite, skip, or other strategy — Ensemble surfaces the conflict but does not decide

Difficulty: hard
Validates: `#skills` (Collision Detection)

---

## Feature: Registry and Discovery
> I search MCP registries and skills catalogs programmatically, discovering servers and skills without the CLI.

Category: Core | Depends on: Library API Surface

### Critical

#### Scenario: Search Registries Programmatically

> **Given** a consumer wants to find MCP servers matching a capability
> **When** the consumer calls the registry search function with a query string
> **Then** the function returns structured results with server names, descriptions, trust tiers, and install metadata — the same data the CLI search would show.

**Satisfied when:**
- Search returns an array of typed result objects, not formatted strings
- Results include `name`, `description`, `trust_tier`, and source registry identifier
- The consumer can filter or sort results programmatically
- Network errors produce typed errors, not unhandled rejections

Difficulty: medium
Validates: `#registry` (Registry)

#### Scenario: Local Capability Search

> **Given** a consumer has a config with servers that have cached tool metadata
> **When** the consumer calls the local search function with a query
> **Then** the search matches against server names, descriptions, and tool names/descriptions, returning ranked results.

**Satisfied when:**
- Search covers server names, tool names, and tool descriptions
- Results are ranked by relevance (BM25 or similar scoring)
- Search is purely local — no network calls
- Skills are also included in local search results (name, description, tags)

Difficulty: medium
Validates: `#search` (CLI Surface)

### Edge Cases

#### Scenario: Registry Search with No Results

> **Given** a consumer searches registries with a very specific query that matches nothing
> **When** the search completes
> **Then** the result is an empty array, not an error or null.

**Satisfied when:**
- An empty result set is a normal return value (empty array), not an error condition
- The consumer does not need to check for null or handle exceptions for zero results

Difficulty: easy
Validates: `#registry` (Registry)

#### Scenario: Registry Backend Unavailable

> **Given** a consumer attempts a registry search but the registry API is unreachable (network error, timeout)
> **When** the search function handles the failure
> **Then** the error is surfaced as a typed error with enough context for the consumer to display a meaningful message.

**Satisfied when:**
- Network errors are caught and wrapped in a typed error (not raw fetch errors)
- The error indicates which registry backend failed
- Other backends that did succeed still return their results (partial success when multiple backends are queried)

Difficulty: medium
Validates: `#registry` (Registry)

---

# CLI

## Feature: CLI Surface
> I use the `ensemble` CLI (or `ens` alias) to manage configs from the terminal with the same operations available to library consumers.

Category: CLI | Depends on: Library API Surface

### Critical

#### Scenario: Core Server Commands via CLI

> **Given** a user has Ensemble installed globally and a config file exists
> **When** the user runs `ensemble list`, `ensemble add my-server --command node --args server.js`, `ensemble uninstall my-server <client>`, `ensemble install my-server <client>`, `ensemble remove my-server`
> **Then** each command produces the expected output and config mutation, using the same operations library that a programmatic consumer would use.

**Satisfied when:**
- `ensemble list` displays all servers with their per-client install state
- `ensemble add` pulls a server into the library with an empty install matrix
- `ensemble install`/`ensemble uninstall` set or clear install state for a given client
- `ensemble remove` deletes the server from the library and cleans up group membership
- All commands use Commander.js and exit with appropriate codes (0 success, 1 error)

Difficulty: easy
Validates: `#cli-surface` (CLI Surface)

#### Scenario: Sync Command Writes Client Configs

> **Given** a user has servers assigned to clients in the config
> **When** the user runs `ensemble sync cursor`
> **Then** Ensemble writes the resolved servers to Cursor's native config file, and `ensemble sync --dry-run cursor` previews the changes without writing.

**Satisfied when:**
- Sync writes to the correct client config path
- Dry-run shows what would be written without modifying any files
- The `__mcpoyle` marker (or equivalent) identifies managed entries
- Non-managed entries in the client config are preserved (additive sync)

Difficulty: medium
Validates: `#cli-surface` (CLI Surface, Sync)

### Edge Cases

#### Scenario: CLI Handles Missing Config Gracefully

> **Given** no Ensemble config file exists at the expected path
> **When** the user runs `ensemble list`
> **Then** the CLI either creates a default config and shows the empty state, or shows a clear message directing the user to run `ensemble init`.

**Satisfied when:**
- The CLI does not crash with an unhandled filesystem error
- The user understands what happened and what to do next
- If auto-creating a config, it is valid and minimal

Difficulty: easy
Validates: `#cli-surface` (CLI Surface)

#### Scenario: The ens Alias Works Identically

> **Given** a user has Ensemble installed
> **When** the user runs `ens list` instead of `ensemble list`
> **Then** the output is identical — `ens` is a complete alias for `ensemble`.

**Satisfied when:**
- Every command available under `ensemble` is available under `ens`
- Output and behavior are identical regardless of which name is used
- Help text (`ens --help`) shows the full command reference

Difficulty: easy
Validates: `#cli-surface` (CLI Surface)

---

# System Quality

## Feature: Operations Layer
> All mutations flow through a shared operations layer — the CLI is a thin wrapper, library consumers call the same functions.

Category: System Quality | Depends on: Library API Surface

### Critical

#### Scenario: CLI and Library Produce Identical Results

> **Given** the same starting config
> **When** a user runs `ensemble uninstall my-server claude-code` via CLI, and separately a consumer calls `uninstallServer(config, "my-server", "claude-code")` via library
> **Then** the resulting config is identical in both cases — the CLI is just a presentation layer over the operations.

**Satisfied when:**
- The CLI delegates to the same operation functions the library exports
- No business logic exists in the CLI layer (Commander handlers are thin: parse args, load config, call operation, save config, format output)
- The operation function's return value fully determines the new config state

Difficulty: medium
Validates: `#operations-layer` (Architecture)

#### Scenario: Operations Return Structured Results

> **Given** a consumer calls any operation
> **When** the operation completes
> **Then** it returns a typed result object — the new config, plus any metadata the consumer needs (what changed, warnings, etc.).

**Satisfied when:**
- Operations return typed result objects (not void, not printed text)
- Results include the new config object
- Results optionally include warnings (e.g., drift detected), change descriptions, or other metadata
- The CLI formats these results for terminal display; a GUI consumer formats them differently

Difficulty: medium
Validates: `#operations-layer` (Architecture)

### Edge Cases

#### Scenario: Operation Error Does Not Corrupt Config

> **Given** a consumer calls an operation that fails partway through (e.g., removing a server that is referenced in a group, and the cascade encounters an unexpected state)
> **When** the error occurs
> **Then** the original config is unchanged — either the full operation succeeds or none of it takes effect.

**Satisfied when:**
- Operations are atomic: they produce a new config or throw, never a half-mutated config
- The original config object passed to the operation is never modified
- Error recovery does not require the consumer to reload from disk

Difficulty: medium
Validates: `#operations-layer` (Architecture)

---

## Feature: Additive Sync Safety
> Sync never deletes servers or plugins that the user did not create through Ensemble.

Category: System Quality | Depends on: Client Resolution and Sync

### Critical

#### Scenario: Sync Preserves Unmanaged Servers

> **Given** a client config file contains servers that were added manually (not through Ensemble — no `__mcpoyle` marker)
> **When** the consumer runs sync for that client
> **Then** the manually-added servers are preserved in the client config. Only Ensemble-managed entries are written or updated.

**Satisfied when:**
- Servers without the Ensemble management marker are untouched during sync
- New Ensemble-managed servers are added alongside existing ones
- The sync result communicates which entries were added, updated, and which were left alone (unmanaged)

Difficulty: medium
Validates: `#sync` (Sync, Additive Sync)

### Edge Cases

#### Scenario: Sync Handles Drift on Managed Entries

> **Given** a managed server was modified outside Ensemble (its content hash differs from what Ensemble last wrote)
> **When** sync runs and detects the drift
> **Then** the drift is reported with provenance context and the entry is not silently overwritten. The consumer chooses the resolution strategy (force, adopt, skip).

**Satisfied when:**
- Drift detection compares SHA-256 hashes of managed entries
- The drift report includes which entry drifted and its origin metadata
- Default behavior is to skip (warn, do not overwrite)
- Force and adopt are explicit options the consumer selects

Difficulty: hard
Validates: `#sync` (Drift Detection)

#### Scenario: Sync of Empty Group Does Not Clear Client Config

> **Given** a client is assigned to an empty group (no servers, no plugins)
> **When** sync runs for that client
> **Then** Ensemble removes its own previously-managed entries (if any) but does not touch unmanaged entries. The client config is not wiped clean.

**Satisfied when:**
- Previously managed entries that are no longer in the group are removed (or disabled)
- Unmanaged entries are unaffected
- An empty group assignment results in only Ensemble-managed entries being cleaned up, not a blank config

Difficulty: medium
Validates: `#sync` (Sync, Additive Sync)

---

## Feature: Guided Onboarding (Init)
> I run a single command and Ensemble walks me through detecting my clients, importing my servers and skills, creating groups, and syncing everything.

Category: Core | Depends on: Client Resolution and Sync, Skill Management

### Critical

#### Scenario: First-Time Guided Setup End to End

> **Given** a user has never run Ensemble before, has Claude Desktop, Claude Code, and Cursor installed with various MCP servers configured in each, and Claude Code has a skill in its skills directory
> **When** the user runs `ensemble init` and follows the guided prompts — choosing to import all servers, import all skills, creating a group called "dev-tools", assigning it to Cursor, and confirming the sync preview
> **Then** the user sees each step clearly: detected clients with install status and skills support indicators, a unified landscape of all servers and skills across clients with deduplication highlighted, imported servers and skills in the central config, the meta-skill installed, the group populated, and a successful sync to each client.

**Satisfied when:**
- Client detection displays installed clients with a clear installed/not-found indicator and a skills-support marker for clients that support skills directories
- The unified server landscape shows a matrix of which servers exist in which clients, with duplicate counts
- Imported servers are deduplicated — a server appearing in three clients is imported once
- Imported skills are copied to the canonical store (`~/.config/ensemble/skills/<name>/SKILL.md`)
- The `ensemble-usage` meta-skill is installed automatically with `origin.source: "builtin"` and `origin.trust_tier: "official"`
- The sync preview (dry-run) shows what will be written before any files are modified

Difficulty: hard
Validates: `#init` (Init)

#### Scenario: Non-Interactive Auto Mode

> **Given** a user wants to onboard without answering prompts — perhaps in a CI environment or scripted setup
> **When** the user runs `ensemble init --auto`
> **Then** Ensemble detects all clients, imports all servers and skills from every detected client, installs the meta-skill, creates no groups, assigns all servers to all clients (default null-group behavior), and syncs — all without pausing for input.

**Satisfied when:**
- `--auto` completes without any interactive prompts or confirmation dialogs
- All servers from all detected clients are imported with deduplication
- All skills from all detected clients are imported to the canonical store
- No groups are created (clients receive every library server installed on them by default)
- Sync runs automatically after import
- The command's output summarizes what was done (counts of imported servers, skills, clients synced)

Difficulty: medium
Validates: `#init` (Init)

### Edge Cases

#### Scenario: Re-Running Init on an Already-Configured System

> **Given** a user has previously run `ensemble init` — servers, skills, groups, and client assignments already exist in the config
> **When** the user runs `ensemble init` again
> **Then** Ensemble detects the existing state and skips steps that are already complete. It does not duplicate servers, re-import skills that already exist in the canonical store, or overwrite group assignments. The user sees which steps were skipped and why.

**Satisfied when:**
- Servers already in the config are not re-imported (matched by name)
- Skills already in the canonical store are not re-imported
- The meta-skill is not reinstalled if it already exists
- Existing group assignments are preserved, not overwritten
- The output communicates what was skipped (e.g., "3 servers already imported, skipping")
- Running init twice produces the same config state as running it once (idempotent)

Difficulty: medium
Validates: `#init` (Init)

#### Scenario: Init When No AI Clients Are Detected

> **Given** a user runs `ensemble init` on a machine where no supported AI clients are installed (no Claude Desktop, no Claude Code, no Cursor, etc.)
> **When** the client detection step finds nothing
> **Then** the user sees a clear message that no clients were found, the import step is skipped gracefully, and Ensemble still creates a valid empty config that can be populated later.

**Satisfied when:**
- The detection step reports that no clients were found without crashing
- The user is not asked to import from nonexistent clients
- A valid config file is created (empty servers, groups, clients arrays)
- The meta-skill is still installed to the canonical store (it does not require a client)
- The user sees guidance on what to do next (install a client, add servers manually)

Difficulty: easy
Validates: `#init` (Init)

---

## Feature: Migration (mcpoyle to Ensemble)
> I upgrade from mcpoyle to Ensemble and my servers, skills, groups, and client assignments carry over seamlessly.

Category: Core | Depends on: Config Lifecycle

### Critical

#### Scenario: Full Migration from mcpoyle

> **Given** a user has an existing mcpoyle installation with config at `~/.config/mcpoyle/config.json`, skills in `~/.config/mcpoyle/skills/`, cache in `~/.config/mcpoyle/cache/`, and `__mcpoyle` markers in client config files
> **When** Ensemble runs for the first time and detects the mcpoyle installation
> **Then** the user's entire setup migrates to Ensemble paths: config is copied to `~/.config/ensemble/config.json`, skills are moved to `~/.config/ensemble/skills/`, cache is moved to `~/.config/ensemble/cache/`, symlinks in client skills directories are updated to point to the new canonical paths, and the migration logs what it did.

**Satisfied when:**
- Config file is copied (not moved) to the new location — the original `~/.config/mcpoyle/config.json` is preserved as a backup
- Skills directory contents are moved to `~/.config/ensemble/skills/` with the same directory structure
- Client config symlinks that pointed to `~/.config/mcpoyle/skills/...` now point to `~/.config/ensemble/skills/...`
- `__mcpoyle` markers in client configs are replaced with `__ensemble` on the next sync
- The `mcpoyle-usage` meta-skill is replaced with `ensemble-usage`
- The migration produces a log or summary of what was moved and updated

Difficulty: hard
Validates: `#migration` (Config, Migration from mcpoyle)

### Edge Cases

#### Scenario: No mcpoyle State to Migrate

> **Given** a user has never used mcpoyle — no `~/.config/mcpoyle/` directory exists
> **When** Ensemble runs for the first time
> **Then** the migration step is skipped silently and Ensemble proceeds with normal first-run behavior (fresh config creation or init flow).

**Satisfied when:**
- No error or warning is produced about missing mcpoyle state
- Ensemble creates a fresh config at `~/.config/ensemble/config.json` if none exists
- The absence of mcpoyle does not block any Ensemble functionality
- No empty `~/.config/mcpoyle/` directory is created as a side effect

Difficulty: easy
Validates: `#migration` (Config, Migration from mcpoyle)

#### Scenario: Idempotent Re-Run After Completed Migration

> **Given** a user has already migrated from mcpoyle — both `~/.config/mcpoyle/` (backup) and `~/.config/ensemble/` exist with valid config
> **When** Ensemble runs again and encounters both directories
> **Then** Ensemble uses the `~/.config/ensemble/` config and does not re-run migration. No files are copied, moved, or overwritten.

**Satisfied when:**
- Ensemble detects that `~/.config/ensemble/config.json` already exists and uses it directly
- No files are copied from `~/.config/mcpoyle/` to `~/.config/ensemble/`
- No symlinks are re-pointed
- The migration code path is a no-op — it completes instantly without side effects
- Running Ensemble ten times after migration produces the same state as running it once after migration

Difficulty: easy
Validates: `#migration` (Config, Migration from mcpoyle)

---

## Feature: Profile-as-Plugin (Group Export)
> I export a group as a Claude Code plugin so others can install my curated server+skill bundle without needing Ensemble.

Category: Core | Depends on: Group Organization, Plugin Lifecycle

### Critical

#### Scenario: Export a Server-Only Group as a Plugin

> **Given** a group "dev-tools" contains servers "ctx" and "prm" but no skills
> **When** the user runs `ensemble groups export dev-tools --as-plugin`
> **Then** Ensemble generates a plugin package directory under `~/.config/ensemble/marketplace/` containing a manifest that registers the group's servers as a Claude Code plugin.

**Satisfied when:**
- A plugin directory is created at `~/.config/ensemble/marketplace/dev-tools/` (or similar path)
- The directory contains a `plugin.json` manifest compatible with Claude Code's plugin system
- The manifest registers the group's MCP servers (names, commands, args, env)
- The generated plugin is a self-contained package — it does not require Ensemble at runtime

Difficulty: medium
Validates: `#profile-as-plugin` (Plugins, Profile-as-Plugin Packaging)

#### Scenario: Export a Group with Skills Bundled

> **Given** a group "work-flow" contains servers "github-mcp" and skill "git-workflow" with its SKILL.md in the canonical store
> **When** the user runs `ensemble groups export work-flow --as-plugin`
> **Then** the generated plugin package includes both the server registrations and copies of the skill files, so the plugin recipient gets the full bundle.

**Satisfied when:**
- Server definitions are included in the plugin manifest
- Skill SKILL.md files are copied into the plugin package directory (not symlinked — the package must be portable)
- The skill directory structure is preserved (`<plugin>/skills/git-workflow/SKILL.md`)
- The plugin works as a standalone distribution — no dependency on the exporter's canonical store paths

Difficulty: medium
Validates: `#profile-as-plugin` (Plugins, Profile-as-Plugin Packaging)

### Edge Cases

#### Scenario: Register Exported Plugin as Local Marketplace

> **Given** the user has exported a group as a plugin to `~/.config/ensemble/marketplace/`
> **When** the user checks their Claude Code settings (or Ensemble syncs)
> **Then** the local marketplace directory is registered in Claude Code's `extraKnownMarketplaces`, making the exported plugin discoverable in Claude Code's plugin browser.

**Satisfied when:**
- The local marketplace path appears in `extraKnownMarketplaces` in `~/.claude/settings.json` with `source: "directory"`
- The exported plugin appears as an installable option in Claude Code's plugin browser
- A user without Ensemble can install the plugin through Claude Code's native plugin UI
- Registering the marketplace is idempotent — exporting the same group twice does not create duplicate marketplace entries

Difficulty: hard
Validates: `#profile-as-plugin` (Plugins, Profile-as-Plugin Packaging, Marketplaces)

---

# Desktop

## Feature: Desktop App Launch and Layout
> I open the Ensemble desktop app and see all my MCP configuration at a glance, organized the way I think about it.

Category: Desktop | Depends on: Config Lifecycle

### Critical

#### Scenario: App Launches to a Navigable Overview

> **Given** the user has Ensemble installed with an existing config.json containing servers, skills, plugins, and groups
> **When** the user launches the desktop app for the first time
> **Then** the app opens to a macOS-style layout with a sidebar listing all major sections (Servers, Skills, Plugins, Groups, Clients, Doctor, Registry, Profiles, Rules), the first section is selected by default, and its detail panel shows real data from the user's config.

**Satisfied when:**
- The app window appears within a reasonable launch time (under 3 seconds to first meaningful content)
- A persistent sidebar is visible with all nine section labels, each clearly selectable
- The detail panel shows content populated from the shared config.json — not placeholder or demo data
- The selected section is visually indicated in the sidebar (highlight, active state, or equivalent)

Difficulty: medium
Validates: `#desktop-layout` (Desktop App)

#### Scenario: Sidebar Navigation Shows Correct Content per Section

> **Given** the desktop app is open and showing the default section
> **When** the user clicks each sidebar section in turn — Servers, Skills, Plugins, Groups, Clients, Doctor, Registry, Profiles, Rules
> **Then** each section transitions to show its relevant content: lists of items where applicable, summary views for Doctor, a search interface for Registry.

**Satisfied when:**
- Clicking a section in the sidebar updates the detail panel without a full-page reload or jarring flash
- Each section displays data appropriate to its domain (server list shows server names and transports, groups show membership, etc.)
- Sections with no data (e.g., no plugins configured) show an empty state with a clear call to action, not a blank panel
- The sidebar selection state tracks the currently visible section at all times

Difficulty: medium
Validates: `#desktop-layout` (Desktop App)

### Edge Cases

#### Scenario: App Launches Gracefully with No Config

> **Given** the user has never run Ensemble before — no config.json exists at the default path
> **When** the user launches the desktop app
> **Then** the app opens normally, shows an inviting empty state that explains what Ensemble does, and offers a way to create a config or run initial setup — mirroring the CLI's behavior when config is missing.

**Satisfied when:**
- The app does not crash or show a raw error when config.json is absent
- An onboarding or empty-state view is displayed that communicates next steps clearly
- The user can begin setting up from within the app (create config, add a first server, or run init)
- The sidebar still renders and is navigable, even with no data to display

Difficulty: easy
Validates: `#desktop-layout` (Desktop App)

#### Scenario: App Reflects External Config Changes While Open

> **Given** the desktop app is running and displaying the user's servers
> **When** the user adds a server via the CLI in a separate terminal (`ens add server new-srv ...`) while the app is open
> **Then** the app detects the config change and updates its view to include the new server — either automatically or with a clear prompt to reload.

**Satisfied when:**
- The new server added via CLI appears in the desktop app's server list without requiring a full app restart
- If automatic reload is not used, a visible notification or reload prompt tells the user that config has changed
- The app does not lose any unsaved user state (e.g., an in-progress form) when refreshing from the external change
- No data is corrupted or lost when both CLI and desktop app touch config.json in sequence

Difficulty: hard
Validates: `#desktop-config-sharing` (Desktop App)

---

## Feature: Desktop Server Management
> I manage my MCP servers visually — adding, editing, removing, and organizing them into groups without touching JSON.

Category: Desktop | Depends on: Server Operations, Group Organization

### Critical

#### Scenario: Full Server CRUD Through the GUI

> **Given** the desktop app is open on the Servers section
> **When** the user adds a new server by filling out a form (name, command, args, transport), edits an existing server's arguments, uninstalls a server from one of its clients, and then removes a different server entirely
> **Then** each operation is reflected immediately in the UI, the underlying config.json is updated, and a subsequent `ens list` in the CLI shows the same state.

**Satisfied when:**
- A server can be added through a form or dialog without manually editing JSON
- Editing a server's properties updates both the UI and the persisted config
- A server that is uninstalled from a client is visually distinguished from installed ones on that client (dimmed, badge, strikethrough, or equivalent)
- Removing a server prompts for confirmation and removes it from both the list and config.json
- All changes are visible in the CLI immediately after being made in the desktop app

Difficulty: medium
Validates: `#desktop-server-mgmt` (Desktop App)

#### Scenario: Visual Group Assignment via Drag and Drop

> **Given** the desktop app shows a list of servers and a list of groups
> **When** the user drags a server onto a group (or uses an equivalent visual assignment mechanism)
> **Then** the server is added to that group, the group's membership count updates, and the change persists to config.json.

**Satisfied when:**
- Servers can be assigned to groups through a direct visual interaction (drag-and-drop, multi-select menu, or equivalent gesture)
- The group's displayed membership updates immediately to reflect the assignment
- The assignment persists — reopening the app or checking via CLI shows the server in the group
- Assigning a server that is already in the group is handled gracefully (no duplicate, no error)

Difficulty: hard
Validates: `#desktop-server-mgmt` (Desktop App)

### Edge Cases

#### Scenario: CLI and Desktop App Stay in Sync Bidirectionally

> **Given** the user has both the desktop app open and a terminal with the CLI available
> **When** the user adds a server in the desktop app, then adds a different server in the CLI, then returns to the desktop app
> **Then** both servers are visible in both interfaces — the shared config.json is the single source of truth and neither interface overwrites the other's changes.

**Satisfied when:**
- A server added in the desktop app is visible via `ens list` immediately
- A server added via CLI appears in the desktop app's server list (after refresh or automatically)
- Neither tool silently overwrites or drops the other's additions
- The config.json file contains both servers with correct structure

Difficulty: hard
Validates: `#desktop-config-sharing` (Desktop App)

#### Scenario: Server Form Validates Input Before Saving

> **Given** the user opens the add-server form in the desktop app
> **When** the user tries to save a server with missing required fields (no name, or no command for stdio transport) or a name that already exists
> **Then** the form shows clear validation messages next to the problematic fields and does not save invalid data to config.

**Satisfied when:**
- Required fields are indicated before the user submits (labels, asterisks, or equivalent)
- Submitting with missing required fields shows inline validation errors, not a generic alert
- Duplicate server names are caught and communicated before saving
- No partial or invalid server entry is written to config.json when validation fails

Difficulty: easy
Validates: `#desktop-server-mgmt` (Desktop App)

---

## Feature: Desktop Sync and Drift
> I sync my config to all my AI clients with one click and immediately see what changed or drifted.

Category: Desktop | Depends on: Client Resolution and Sync, Additive Sync Safety

### Critical

#### Scenario: One-Click Sync with Visual Preview

> **Given** the desktop app is open and the user has servers assigned to groups, with groups assigned to clients
> **When** the user initiates a sync from the UI
> **Then** the app shows a preview of what will change for each client before applying — which servers will be added, removed, or updated — and the user confirms before changes are written to client configs.

**Satisfied when:**
- A sync action is accessible in one or two clicks from the main interface (not buried in menus)
- Before writing, a preview shows per-client changes in a readable format (not raw JSON diffs)
- The user can confirm or cancel before changes are written
- After confirmation, client config files are updated and the UI reflects the completed sync state
- The preview distinguishes between additions, removals, and modifications visually

Difficulty: medium
Validates: `#desktop-sync` (Desktop App)

#### Scenario: Visual Drift Detection

> **Given** the user has synced their config to Claude Desktop, and someone (or another tool) has manually edited the Claude Desktop config file to modify a server that Ensemble manages
> **When** the user opens the drift or health view in the desktop app
> **Then** the app clearly shows which managed entries have drifted — what the expected config is versus what the client config actually contains — in a visual diff format.

**Satisfied when:**
- Drifted entries are surfaced proactively (on the sync screen, doctor view, or a dedicated drift view)
- The diff shows expected vs. actual values side-by-side or in an inline diff format, not just "drift detected"
- The user can choose to overwrite the drifted value (re-sync) or accept the external change (adopt)
- Unmanaged entries (those without the `__ensemble` marker) are not flagged as drift

Difficulty: hard
Validates: `#desktop-sync` (Desktop App)

### Edge Cases

#### Scenario: Sync Preserves Unmanaged Client Entries

> **Given** the user's Claude Desktop config contains servers that were added manually (not via Ensemble)
> **When** the user runs a sync from the desktop app
> **Then** the manually-added servers remain untouched in the client config — Ensemble's additive sync policy applies identically in the desktop app as in the CLI.

**Satisfied when:**
- Unmanaged servers (without `__ensemble` marker) are present in the client config before and after sync
- The sync preview explicitly shows that unmanaged entries will not be touched
- No unmanaged entries are removed, modified, or reordered by the sync operation
- This behavior matches the CLI's `ens sync` exactly

Difficulty: medium
Validates: `#desktop-sync`, `#additive-sync` (Desktop App, System Quality)

#### Scenario: Sync Handles Concurrent Config Writes Safely

> **Given** the desktop app is about to write a sync result to a client config file
> **When** another process (the CLI, another Ensemble instance, or the client itself) is writing to the same file at the same moment
> **Then** the sync does not produce a corrupted config file — it either completes cleanly, retries, or reports the conflict to the user.

**Satisfied when:**
- The client config file is never left in a partially-written or invalid JSON state
- If a write conflict is detected, the user sees a clear message explaining what happened
- The user can retry the sync after the conflict is resolved
- Atomic write strategies (write-to-temp-then-rename or file locking) prevent data loss

Difficulty: hard
Validates: `#desktop-sync` (Desktop App)

---

## Feature: Desktop Registry Browser
> I discover and install MCP servers from registries visually, without memorizing search commands.

Category: Desktop | Depends on: Registry and Discovery

### Critical

#### Scenario: Browse and Search Registries Visually

> **Given** the desktop app is open on the Registry section
> **When** the user types a search query (e.g., "github" or "database") into the registry search interface
> **Then** matching servers from configured registries appear as browsable cards or list items, showing name, description, trust tier, and quality signals.

**Satisfied when:**
- A search input is prominently available in the Registry section
- Results appear within a reasonable time (under 3 seconds for a typical query)
- Each result shows at minimum: server name, short description, and trust tier (official/community/local)
- Results from multiple registries are visually distinguishable or filterable by source
- Empty search results show a clear "no results" message, not a blank panel

Difficulty: medium
Validates: `#desktop-registry` (Desktop App)

#### Scenario: One-Click Install from Registry Search Results

> **Given** the user has searched the registry and sees a server they want to install
> **When** the user clicks an install action on that search result
> **Then** the server is added to their Ensemble config with correct origin tracking, and they can immediately assign it to groups and sync it to clients.

**Satisfied when:**
- Each search result has a visible install action (button, icon, or equivalent)
- After installing, the server appears in the user's server list with origin metadata showing it came from the registry
- The installed server can be assigned to groups and synced without leaving the app
- Installing a server that already exists in config is handled gracefully (update prompt or error message, not silent duplicate)

Difficulty: medium
Validates: `#desktop-registry` (Desktop App)

### Edge Cases

#### Scenario: Registry Unavailable Shows Graceful Error

> **Given** the desktop app is open on the Registry section
> **When** the registry backend is unreachable (network down, API error, or timeout)
> **Then** the app shows a clear error message explaining the registry is unavailable, suggests checking network connectivity, and does not crash or freeze.

**Satisfied when:**
- The error message is human-readable, not a raw HTTP status or stack trace
- The rest of the app remains functional — the user can navigate to other sections
- If cached results exist from a previous search, they are shown with a staleness indicator
- The user can retry the search once connectivity is restored without restarting the app

Difficulty: easy
Validates: `#desktop-registry` (Desktop App)

---

## Feature: Desktop Doctor and Health
> I see the health of my entire MCP configuration at a glance, with actionable fixes I can apply from the UI.

Category: Desktop | Depends on: Operations Layer

### Critical

#### Scenario: Visual Health Report

> **Given** the desktop app is open and the user navigates to the Doctor section
> **When** the health audit runs (automatically on navigation or via a run button)
> **Then** the user sees a visual health report covering all five audit categories (config validity, client sync status, skill health, registry status, secret hygiene), with a summary score and per-category detail.

**Satisfied when:**
- The health report is presented visually — not as raw CLI text output pasted into a window
- Each of the five audit categories shows a clear status (pass, warning, fail) with a visual indicator
- An overall health score or summary is visible without scrolling through every detail
- Individual findings are expandable or navigable for more detail
- The report content matches what `ens doctor` produces for the same config

Difficulty: medium
Validates: `#desktop-doctor` (Desktop App)

#### Scenario: Actionable Fix Suggestions

> **Given** the Doctor view shows warnings or failures (e.g., a client is out of sync, a skill has a missing dependency)
> **When** the user examines a specific finding
> **Then** the finding includes a suggested fix, and where possible, a button or action to apply the fix directly from the UI (e.g., "Sync now" for an out-of-sync client, "Install dependency" for a missing skill dependency).

**Satisfied when:**
- At least sync-related and skill-dependency warnings offer a one-click fix action
- Clicking the fix action performs the operation and updates the health report to reflect the new state
- Fixes that cannot be automated (e.g., "update your PATH") show clear manual instructions instead of a disabled button
- The fix does not bypass confirmation for destructive operations

Difficulty: hard
Validates: `#desktop-doctor` (Desktop App)

---

## Feature: Autonomous UI Testing
> The desktop app can be verified end-to-end by Playwright running against the Electron process, enabling autonomous build validation.

Category: Desktop | Depends on: Desktop App Launch and Layout, Desktop Server Management

### Critical

#### Scenario: Playwright Verifies Core Layout

> **Given** Playwright is configured with Electron support for the Ensemble desktop app
> **When** a test script launches the app and inspects the initial state
> **Then** the test can verify that the sidebar renders with all expected sections, the detail panel shows content, and navigation between sections works — providing automated proof that the app's core layout is functional.

**Satisfied when:**
- Playwright can launch the Electron app programmatically without manual intervention
- The test can locate and assert the presence of all nine sidebar section labels
- The test can click a sidebar section and verify the detail panel content changes
- Test execution completes in under 30 seconds for the layout verification suite
- Tests produce clear pass/fail output suitable for CI or autonomous build verification

Difficulty: medium
Validates: `#desktop-testing` (Desktop App)

#### Scenario: Playwright Performs Server Add Workflow End to End

> **Given** Playwright has launched the Ensemble desktop app with a clean or known config state
> **When** a test script navigates to the Servers section, fills out the add-server form with valid data, submits it, and then verifies the server appears in the list
> **Then** the full workflow — navigate, fill form, submit, verify result — succeeds without manual intervention, proving the server management UI is functionally complete.

**Satisfied when:**
- The test can navigate to the Servers section and locate the add-server action
- The test can fill in form fields (name, command, args, transport) and submit
- After submission, the new server appears in the server list within the app
- The test can verify the server was persisted by checking config.json or re-launching the app
- The test does not rely on brittle selectors (e.g., arbitrary CSS classes) — it uses accessible labels or data attributes

Difficulty: hard
Validates: `#desktop-testing` (Desktop App)

---

## Feature: Library-First Resource Intake (v2.0.1)
> I pull or author resources and they land in my library as owned inventory — installation is a separate, explicit step.

Category: Core | Depends on: Library API Surface

### Critical

#### Scenario: Pulling a Marketplace Skill Lands in Library Unassigned

> **Given** the user runs `ensemble pull owner/repo --type skill` against a marketplace they have not touched before
> **When** the pull completes
> **Then** the skill appears in the library as an owned resource with an empty install matrix — it is not installed on any client, but `ensemble library list` shows it and its canonical store file exists under `~/.config/ensemble/`.

**Satisfied when:**
- `ensemble library list --type skill` includes the newly pulled skill
- The skill's install matrix is empty (no client reports it as installed)
- The skill's canonical file is present under `~/.config/ensemble/skills/`
- No client config file was written during the pull operation
- The origin metadata records the marketplace source, timestamp, and pull method

Difficulty: medium
Validates: `#core-concepts` (Resource Lifecycle Model), `#cli-surface` (Lifecycle Verbs)

#### Scenario: Manual Add Lands in Library With Empty Install State

> **Given** the user runs `ensemble add postgres --command npx --args @modelcontextprotocol/server-postgres`
> **When** the command completes without `--install`
> **Then** the library contains a new server named `postgres` with no client installations — strict library-first behavior, not a legacy add-and-sync-everywhere flow.

**Satisfied when:**
- The user sees a confirmation naming the library the resource landed in
- `ensemble library show postgres` reports an empty install matrix
- No client config was modified by the `add` command
- Running `ensemble install postgres --client claude-code` as a follow-up succeeds and installs only onto Claude Code

Difficulty: medium
Validates: `#cli-surface` (Lifecycle Verbs)

#### Scenario: Library List Shows All Seven Resource Types

> **Given** the library contains a mix of servers, skills, plugins, agents, commands, hooks, and settings
> **When** the user runs `ensemble library list`
> **Then** the output shows all seven resource types side by side with columns indicating install state per resource — not seven separate lists, a single unified inventory view.

**Satisfied when:**
- The output includes at least one row from each of the seven resource types when present
- Each row shows the resource name, type, and a compact install-state indicator (e.g., "3 clients", "user-level", "—")
- `--type <type>` filters the output to one resource type
- `--installed` and `--uninstalled` filters narrow to rows based on install matrix, not library membership
- Column alignment and formatting are legible for a library with 50+ resources

Difficulty: medium
Validates: `#cli-surface` (Library Subcommand)

### Edge Cases

#### Scenario: Pulling a Resource Already in Library Is a Gentle No-Op

> **Given** a resource is already present in the library from a previous pull
> **When** the user pulls the same resource again from the same source
> **Then** Ensemble reports that the resource is already in the library and leaves both the library entry and any install state untouched — no error, no duplicate, no silent overwrite.

**Satisfied when:**
- The command exits with a success status and a clear "already in library" message
- The existing library entry is unchanged (same origin timestamp, same content hash)
- The install matrix for that resource is preserved
- A `--force` or `--update` flag (if supported) is the only path to refresh content

Difficulty: easy
Validates: `#cli-surface` (Lifecycle Verbs)

#### Scenario: Remove Cascades or Confirms Across Install Scopes

> **Given** a library resource is installed on multiple clients and the user runs `ensemble remove <name>`
> **When** the command detects existing install scopes
> **Then** the user is warned that removal will uninstall the resource from every client first, and the command either refuses without `--yes` or confirms interactively before performing the cascade.

**Satisfied when:**
- The warning lists every client (and project, where applicable) the resource is currently installed on
- Without `--yes`, the command prompts interactively or exits non-zero without touching anything
- With `--yes`, the command performs uninstalls in a deterministic order before deleting the library entry
- If any uninstall step fails, the library entry is left intact and a clear error reports which scope failed

Difficulty: hard
Validates: `#cli-surface` (Lifecycle Verbs)

---

## Feature: Install State Matrix (v2.0.1)
> Install state is a property of library resources, not a tier above them — I install, uninstall, and view per-client and per-project state without the resource ever leaving my library.

Category: Core | Depends on: Library-First Resource Intake

### Critical

#### Scenario: Install Onto Multiple Clients Updates the Matrix in Place

> **Given** a library skill with an empty install matrix
> **When** the user runs `ensemble install <skill> --client claude-code` and then `ensemble install <skill> --client cursor`
> **Then** the same library entry now reports `{claude-code: installed, cursor: installed}` — the library is unchanged structurally, and both installs reach the same canonical file via sync.

**Satisfied when:**
- `ensemble library show <skill>` shows both clients in the install matrix after the second install
- The canonical store file is unchanged between the two installs (same inode/path)
- Both clients' skills directories point to the same canonical file after `ensemble sync`
- No duplicate library entry was created

Difficulty: medium
Validates: `#core-concepts` (Resource Lifecycle Model)

#### Scenario: Uninstall Leaves Library Entry Intact

> **Given** a library resource is installed on client A only
> **When** the user runs `ensemble uninstall <name> --client A`
> **Then** the resource remains in the library with an empty install matrix — it is still listed under `ensemble library list`, still owned, and ready to be re-installed later.

**Satisfied when:**
- `ensemble library list` still includes the resource after uninstall
- `ensemble library show` reports no clients in the install matrix
- The canonical store file is still present under `~/.config/ensemble/`
- `ensemble library list --uninstalled` surfaces it
- Re-installing onto any client succeeds without re-pulling

Difficulty: easy
Validates: `#core-concepts` (Library membership vs. install state)

#### Scenario: Project-Scoped Uninstall Preserves User-Level Install

> **Given** a server is installed at user scope on Claude Code AND at a specific project scope under `~/Code/myapp`
> **When** the user runs `ensemble uninstall <name> --client claude-code --project ~/Code/myapp`
> **Then** the project-scoped entry is removed but the user-level install remains — `ensemble library show` reflects the remaining user-level install, and Claude Code still sees the server globally.

**Satisfied when:**
- The install matrix loses the `~/Code/myapp` project entry but keeps the user-level entry
- A subsequent sync removes the server from `projects.<path>.mcpServers` in `~/.claude.json`
- The user-level entry in `~/.claude.json` → `mcpServers` is unchanged
- No rollback snapshot is required for a no-op file path (only the project config is touched)

Difficulty: medium
Validates: `#cli-surface` (Per-Project Install State), `#core-concepts` (Resource Lifecycle Model)

### Edge Cases

#### Scenario: Project Flag Against a Non-Supporting Client Errors Clearly

> **Given** the user runs `ensemble install <name> --client cursor --project ~/Code/myapp`
> **When** the command validates the client's project-scoping capability
> **Then** the command exits non-zero with a specific error naming `cursor` and explaining that per-project install state is not supported — the install does not proceed, and no library or config state is mutated.

**Satisfied when:**
- The error message names the client explicitly and says project scoping is unsupported
- The error suggests dropping `--project` for a user-level install as the remediation
- No file is written, no library state changes
- The same error is raised for `uninstall --project` against the same client

Difficulty: easy
Validates: `#cli-surface` (Per-Project Install State)

---

## Feature: Pivot-Based Desktop IA (v2.0.1)
> I browse my library through whichever pivot matches my mental model — by resource type, project, group, client, or marketplace — and install or uninstall from wherever I am.

Category: Desktop | Depends on: Install State Matrix, Desktop App Launch and Layout

### Critical

#### Scenario: Desktop Opens to Library Pivot With Resource-Type Filter Bar

> **Given** the user launches the desktop app for the first time in a session
> **When** the app finishes loading
> **Then** the default view is the Library pivot with a resource-type filter bar at the top (All / Servers / Skills / Plugins / Agents / Commands / Hooks / Settings) and every owned resource listed with per-row install-state indicators.

**Satisfied when:**
- Library pivot is the active sidebar selection on first launch
- The filter bar exposes all seven resource types plus an "All" option
- Selecting a type narrows the list without navigating away from the pivot
- Each row shows a compact install-state matrix (clients and projects the resource is installed for)
- The sidebar shows five pivots and five workflow sections, not the old seven-section Resources group

Difficulty: medium
Validates: `#desktop-app` (Layout)

#### Scenario: By-Project Pivot Shows Per-Project Install State

> **Given** the user has Claude Code projects with project-scoped server assignments
> **When** the user selects the By-Project pivot and chooses a project path
> **Then** only the resources installed for that project are listed, with a gesture to add or remove resources from the project's assignment.

**Satisfied when:**
- Projects with at least one project-scoped install appear in the pivot's project selector
- Selecting a project shows only resources in that project's install matrix entry
- An "Add to project" action opens a picker scoped to library resources not yet installed for the project
- Removing a resource from the project does not remove it from the library

Difficulty: medium
Validates: `#desktop-app` (Layout)

#### Scenario: By-Group Pivot Supports Drag and Drop Membership Editing

> **Given** the user has created at least one group containing a mix of resource types
> **When** the user drags a library resource onto a group in the By-Group pivot
> **Then** the resource is added to the group immediately, visible feedback confirms the drop, and the group's member list updates without a page reload.

**Satisfied when:**
- Drag operations provide visual feedback during hover and on successful drop
- The dropped resource appears in the group's member list immediately after release
- Dragging a resource out of a group (or using an inline remove control) removes it from the group
- If the group is currently assigned to any clients, a cascade-uninstall warning appears before removal is finalized
- Undo is available for the drop action for at least 5 seconds after the drop

Difficulty: hard
Validates: `#desktop-app` (Layout, Visual Extras)

### Edge Cases

#### Scenario: Marketplace Pivot Pull Appears Immediately in Library

> **Given** the user is browsing the Marketplace pivot and selects a discoverable resource
> **When** the user clicks Pull
> **Then** the resource is pulled into the library, the Marketplace pivot row updates to show it is now in the library (or removes it from the "not yet in library" list), and the Library pivot reflects the new entry the next time it is viewed without requiring a manual refresh.

**Satisfied when:**
- The Pull action shows progress and a completion state within a few seconds for typical sizes
- The pulled resource is in the library with empty install state (or the chosen install scope if "Pull + install on…" was used)
- The Marketplace pivot row shows an "In library" indicator after the pull, or moves the row out of the discoverable list
- No client config is modified by a plain Pull

Difficulty: medium
Validates: `#desktop-app` (Layout)

#### Scenario: Install or Uninstall Available From Every Pivot

> **Given** the user is viewing any pivot (Library, By-Project, By-Group, By-Client, Marketplace)
> **When** the user activates a row-level install/uninstall control
> **Then** the same underlying operation is invoked regardless of pivot — all five pivots route through one install/uninstall path and produce identical library and config state.

**Satisfied when:**
- Installing from the By-Client pivot produces the same post-state as installing from the Library pivot
- Uninstalling from the By-Project pivot produces the same post-state as uninstalling from the By-Client pivot with `--project`
- Switching pivots after an operation shows the updated state consistently across all views
- No pivot bypasses the confirm-cascade rules that apply to library `remove`

Difficulty: medium
Validates: `#desktop-app` (Layout)

---

## Feature: Safe Apply and Rollback Snapshots (v2.0)
> Every sync is reversible — if a write causes trouble, I restore the pre-sync state with one command.

Category: System Quality | Depends on: Client Resolution and Sync

### Critical

#### Scenario: Sync Captures a Pre-Write Snapshot of Every Touched File

> **Given** the user runs `ensemble sync` with pending changes that will write to multiple client configs and at least one `settings.json` file
> **When** the sync begins
> **Then** before any client file is modified, Ensemble captures the current contents of every file it is about to touch into `~/.config/ensemble/snapshots/<iso-timestamp>/` along with a manifest describing the operation — and waits for the snapshot write to fsync before touching any client file.

**Satisfied when:**
- A new snapshot directory exists under `~/.config/ensemble/snapshots/` after the sync
- The snapshot contains a copy of every client file that was subsequently modified
- A manifest file inside the snapshot lists the files, their sizes, and the operation context (which clients, which resources)
- If the sync is interrupted after snapshot creation but during writes, the snapshot is intact and usable for rollback
- Files Ensemble would touch but that did not exist pre-sync are recorded in the manifest so rollback can delete them

Difficulty: hard
Validates: `#sync` (Safe Apply and Rollback Snapshots)

#### Scenario: Rollback Latest Restores Pre-Sync State

> **Given** a sync has just completed and produced a snapshot
> **When** the user runs `ensemble rollback --latest`
> **Then** every file recorded in the latest snapshot is restored to its pre-sync contents, and files that were created by the sync but did not exist before are deleted — the filesystem matches its exact pre-sync state for every touched path.

**Satisfied when:**
- Content-modified files are byte-identical to their pre-sync contents after rollback
- Files created by the sync (and recorded in the manifest as "new") are removed
- The library and install matrix state is rolled back to reflect what was installed before the sync
- The command reports how many files were restored and names the snapshot id
- Running rollback twice is either a no-op or clearly refuses ("already at this state")

Difficulty: hard
Validates: `#sync` (Safe Apply and Rollback Snapshots)

#### Scenario: Snapshots List Shows Timestamped History With File Counts

> **Given** multiple syncs have produced snapshots over time
> **When** the user runs `ensemble snapshots list`
> **Then** the output shows each snapshot in reverse-chronological order with an id, timestamp, number of files touched, and a short operation description (which clients, which resource types).

**Satisfied when:**
- Snapshots are ordered most-recent first
- Each row includes id, ISO timestamp, file count, and operation summary
- `ensemble snapshots show <id>` expands to per-file details
- Snapshots list works with zero, one, and many snapshots present

Difficulty: easy
Validates: `#sync` (Safe Apply and Rollback Snapshots)

### Edge Cases

#### Scenario: Retention Enforces a Ceiling With Default 30 Days

> **Given** snapshots exist that are older than `settings.snapshot_retention_days` (default 30)
> **When** the next `ensemble sync` completes
> **Then** old snapshots are pruned automatically before the command exits, and the pruning action is mentioned in the sync summary.

**Satisfied when:**
- Snapshots older than the retention window are removed from `~/.config/ensemble/snapshots/`
- Snapshots inside the retention window are preserved
- Changing `settings.snapshot_retention_days` to a larger value prevents further pruning on the next sync
- Changing it to 0 preserves only the latest snapshot (or whatever the documented minimum is)

Difficulty: medium
Validates: `#sync` (Safe Apply and Rollback Snapshots)

#### Scenario: Rollback With No Snapshots Reports Clearly

> **Given** no snapshots exist under `~/.config/ensemble/snapshots/`
> **When** the user runs `ensemble rollback --latest`
> **Then** the command exits non-zero with a clear message that there is nothing to restore — no files are modified and no empty snapshot directory is created.

**Satisfied when:**
- The message reads something like "no snapshots to restore"
- The command exits with a non-zero status
- No file is created or deleted as a side effect
- The same behavior applies to `ensemble rollback <id>` with an unknown id (with a different error naming the missing id)

Difficulty: easy
Validates: `#sync` (Safe Apply and Rollback Snapshots)

---

## Feature: Managed Agents, Commands, Hooks, Settings (v2.0)
> Subagents, slash commands, hooks, and settings are first-class managed resources — I pull them, install them, and uninstall them the same way I manage servers and skills.

Category: Core | Depends on: Library-First Resource Intake, Client Resolution and Sync

### Critical

#### Scenario: Pull and Install a Subagent Onto Claude Code

> **Given** the user runs `ensemble pull owner/repo --type agent` targeting a marketplace agent definition
> **When** the pull completes and the user runs `ensemble install <agent> --client claude-code`
> **Then** the canonical agent file lands in `~/.config/ensemble/agents/<name>.md`, sync writes a symlink (or file copy) to `~/.claude/agents/<name>.md`, and `ensemble library show` reflects Claude Code in the install matrix.

**Satisfied when:**
- The canonical file parses with valid YAML frontmatter containing `name`, `description`, and `tools`
- After sync, `~/.claude/agents/<name>.md` exists and resolves to the canonical content
- The library install matrix lists `claude-code` for this agent
- Uninstalling removes only the symlinked or copied file from the client, not the canonical file
- The origin metadata records the marketplace source

Difficulty: medium
Validates: `#core-concepts` (Resource Types), `#sync` (Sync strategy)

#### Scenario: Install a Hook Performs Key-Level Merge Into settings.json

> **Given** `~/.claude/settings.json` already contains user-authored entries under `hooks.PreToolUse` and unrelated top-level keys
> **When** the user runs `ensemble install <hook> --client claude-code` for a hook targeting `PreToolUse`
> **Then** Ensemble reads the existing `settings.json`, adds its managed hook entry under `hooks.PreToolUse` tagged with `__ensemble`, and writes the file — preserving every pre-existing hook entry and every unrelated top-level key byte-for-byte.

**Satisfied when:**
- Pre-existing `hooks.PreToolUse` entries are all present after the install, in their original order and structure
- Unrelated top-level keys (e.g., `permissions`, `env`, `model`) are byte-identical to their pre-install values
- The new managed entry is tagged with a `__ensemble: <id>` sidecar so subsequent syncs can identify it
- The file remains valid JSON
- A pre-install snapshot exists under `~/.config/ensemble/snapshots/`

Difficulty: hard
Validates: `#sync` (Hooks strategy), `#core-concepts` (Resource Types)

#### Scenario: Install a Slash Command Produces a Valid Frontmatter File

> **Given** the user installs a command from the library onto Claude Code
> **When** sync completes
> **Then** `~/.claude/commands/<name>.md` exists with YAML frontmatter containing at least `description`, optional `allowed-tools` and `argument-hint`, followed by the prompt body — and the file is immediately usable as a `/command` inside Claude Code.

**Satisfied when:**
- The file parses as valid YAML frontmatter + markdown body
- `description` is present and non-empty
- `allowed-tools` and `argument-hint` are preserved from the library source if present, absent otherwise
- The install matrix reflects the client (and project when applicable)
- Uninstall removes exactly this file and no other

Difficulty: medium
Validates: `#core-concepts` (Resource Types), `#sync` (Sync strategy)

#### Scenario: Declarative settings.json Key Management

> **Given** the user runs `ensemble settings set permissions.allow '["Read","Grep"]' --client claude-code`
> **When** Ensemble writes to `settings.json`
> **Then** the `permissions.allow` key is set to the requested value as a managed key, every other top-level key is preserved byte-identically, and the managed key is tracked so a later `ensemble settings unset permissions.allow` stops managing it without deleting its value.

**Satisfied when:**
- The value of `permissions.allow` is exactly `["Read","Grep"]` after the operation
- Every other top-level key in `settings.json` is byte-identical pre/post
- `ensemble settings list` shows `permissions.allow` as a managed key
- After `ensemble settings unset permissions.allow`, the value remains in the file but is no longer managed by Ensemble
- A subsequent manual edit of the unmanaged key is preserved across future syncs

Difficulty: hard
Validates: `#core-concepts` (Resource Types), `#sync` (Settings strategy)

### Edge Cases

#### Scenario: Uninstall Hook Removes Only Ensemble-Owned Entry

> **Given** `settings.json` contains a mix of user-authored hook entries and one Ensemble-managed hook entry tagged with `__ensemble`
> **When** the user runs `ensemble uninstall <hook> --client claude-code`
> **Then** only the `__ensemble`-tagged entry is removed; every other hook entry and every unrelated top-level key is byte-identical to its pre-uninstall state.

**Satisfied when:**
- The Ensemble-tagged entry is gone from `hooks.<event>` after uninstall
- All other hook entries at the same event are preserved in order and structure
- Unrelated top-level keys are byte-identical
- A rollback snapshot was captured before the uninstall write

Difficulty: hard
Validates: `#sync` (Additive sync + Hooks strategy)

#### Scenario: Additive Sync Rule Extends to Agents and Commands

> **Given** the user has manually created `~/.claude/agents/local-only.md` outside of Ensemble
> **When** the user runs `ensemble sync claude-code` after installing a different Ensemble-managed agent
> **Then** the manually authored `local-only.md` is completely untouched — its mtime, content, and directory entry are preserved, while the Ensemble-managed agent syncs alongside it.

**Satisfied when:**
- `local-only.md` is byte-identical before and after sync
- The Ensemble-managed agent is present in the same directory after sync
- The library reports only the Ensemble-managed agent; `local-only.md` is not in the library
- `ensemble doctor` (if run) does not flag `local-only.md` as drift

Difficulty: medium
Validates: `#sync` (Sync strategy for agents and commands)

---

## Feature: Non-Destructive settings.json Merge (v2.0)
> Ensemble writes to `settings.json` alongside my manual edits and never clobbers anything it doesn't own.

Category: System Quality | Depends on: Managed Agents, Commands, Hooks, Settings

### Critical

#### Scenario: Unmanaged Keys Are Byte-Identical Before and After Sync

> **Given** `settings.json` contains a rich set of user-authored keys (custom `env` values, a manual `model` override, third-party keys Ensemble has never heard of) and at least one Ensemble-managed key
> **When** the user runs `ensemble sync claude-code`
> **Then** every key Ensemble does not own is byte-identical to its pre-sync value — same values, same ordering where the JSON serializer preserves it, same formatting characteristics that matter for diffing.

**Satisfied when:**
- A byte-level diff of `settings.json` pre/post sync shows changes only under Ensemble-managed keys
- Third-party keys Ensemble has never heard of are preserved untouched
- Comments-as-keys or unusual but valid JSON structures are preserved
- The file remains valid JSON after the merge

Difficulty: hard
Validates: `#sync` (Settings strategy)

### Edge Cases

#### Scenario: Doctor Flags Managed-Key Collisions With User Edits

> **Given** the user has manually edited a key in `settings.json` that Ensemble also manages declaratively, producing a mismatch between Ensemble's desired value and the current file
> **When** the user runs `ensemble doctor`
> **Then** doctor surfaces the collision with both values visible and offers an explicit choice — adopt the user's manual edit into Ensemble's managed value, or overwrite on the next sync — rather than silently picking a winner.

**Satisfied when:**
- The doctor output names the exact key and shows both values
- Two remediation paths are offered: adopt and overwrite
- Adopting updates Ensemble's managed value; overwriting flags the key to be rewritten on next sync
- Neither remediation runs silently — both require explicit user action

Difficulty: medium
Validates: `#doctor`, `#sync` (Drift Detection)

#### Scenario: Manually Edited Ensemble Hook Surfaces as Drift

> **Given** an Ensemble-managed hook entry in `settings.json` was edited by hand after the last sync
> **When** the user runs `ensemble sync --dry-run`
> **Then** the drift detection reports that the hook entry has been modified outside Ensemble, shows the diff, and offers the same `--force`/`--adopt` remediation that applies to server drift.

**Satisfied when:**
- Drift detection hashes managed hook entries the same way it hashes managed server entries
- The dry-run output includes the affected hook id and a readable diff
- Without `--force` or `--adopt`, the sync warns and skips the entry
- `--adopt` updates Ensemble's library to match the manual edit
- `--force` overwrites with Ensemble's version on the next non-dry-run sync

Difficulty: hard
Validates: `#sync` (Drift Detection, Hooks strategy)

---

## Feature: Browse TUI (v2.0)
> I launch a fuzzy-search TUI that searches installed and discoverable resources together, filter by marketplace, and install with one keystroke.

Category: CLI | Depends on: Install State Matrix, Registry and Discovery

### Critical

#### Scenario: Fuzzy Search Across Installed and Discoverable Resources

> **Given** the user runs `ensemble browse`
> **When** the TUI opens and the user types a query
> **Then** the results include matches from both the library (installed and uninstalled) and from known marketplaces, ranked with installed resources above library-only resources above discoverable-only resources, then by relevance.

**Satisfied when:**
- The result list merges library and marketplace sources into a single ranked view
- Each row shows an indicator for installed, library-only, or discoverable
- Ranking order is: installed > library-only > discoverable; ties broken by fuzzy match relevance
- Typing filters the list interactively without requiring a submit keystroke

Difficulty: medium
Validates: `#cli-surface` (Browse), `#registry` (Local Capability Search)

#### Scenario: Marketplace Filter Syntax Narrows Results

> **Given** the user is in the TUI with a query already typed
> **When** the user prefixes a token with `@marketplace-name/`
> **Then** the results are filtered to only entries from that marketplace, and the filter chip is visible in the query bar.

**Satisfied when:**
- `@<marketplace>/` syntax is recognized and parsed into a filter chip
- Only resources whose origin is that marketplace appear in the filtered results
- Removing the chip (backspacing) restores the unfiltered result set
- An unknown marketplace name shows a "no such marketplace" hint rather than an empty list

Difficulty: medium
Validates: `#cli-surface` (Browse), `#desktop-app` (Visual Extras — fuzzy search)

#### Scenario: One-Key Copy or Yank of Install Command

> **Given** the user has selected a discoverable resource in the TUI
> **When** the user presses `c` (copy) or `y` (yank)
> **Then** the corresponding `ensemble install` or `ensemble pull --install` command for that resource is placed on the system clipboard, ready to paste — without the TUI executing the install itself.

**Satisfied when:**
- `c` and `y` both copy a ready-to-run command to the clipboard
- The copied command is exact and correct for the selected resource (correct name, type, marketplace slug)
- A brief confirmation message appears in the TUI after the copy
- The TUI does not mutate any state as a side effect of copy/yank

Difficulty: easy
Validates: `#cli-surface` (Browse)

### Edge Cases

#### Scenario: Card and Slim View Modes Toggle On Demand

> **Given** the TUI is open in the default view mode
> **When** the user toggles between Card and Slim view modes via a keybind or `--view` flag on launch
> **Then** Card mode shows rich details (trust tier, quality signals, tool count, one-click install) per row and Slim mode collapses each result to a one-line row for dense browsing — the underlying result set is identical in both modes.

**Satisfied when:**
- Both view modes render without layout corruption at 80-column width
- Slim mode shows at least 3x more rows on-screen than Card mode for the same dataset
- Toggling preserves the current selection where possible
- `ensemble browse --view slim` on launch starts in Slim mode

Difficulty: medium
Validates: `#cli-surface` (Browse), `#desktop-app` (Visual Extras — Registry cards and slim rows)

---

## Feature: Dynamic Marketplace Registry (v2.0)
> New marketplaces are discovered automatically and surfaced on my next browse — I don't have to hand-register every catalog I want to search.

Category: Core | Depends on: Marketplace Management

### Critical

#### Scenario: Registry List Includes Auto-Discovered Marketplaces

> **Given** Ensemble has been run recently and the dynamic registry has discovered new marketplaces alongside the static set (claude-plugins.dev, Official MCP Registry, Glama, etc.)
> **When** the user runs `ensemble registry list`
> **Then** the output includes every known marketplace with a column identifying its source — auto-discovered vs. manually registered vs. static built-in — so the user can tell what has been added without their explicit action.

**Satisfied when:**
- Static built-ins and auto-discovered marketplaces both appear in the same list
- A `source` column distinguishes built-in, auto-discovered, and user-added
- Marketplaces the user has explicitly added show up with a distinct indicator
- An empty registry (no marketplaces) exits cleanly with a helpful message

Difficulty: medium
Validates: `#marketplaces` (Marketplace Registry)

### Edge Cases

#### Scenario: New Marketplace Appears Between Runs With Notification

> **Given** a new marketplace becomes discoverable after the user's most recent `ensemble browse` or `ensemble registry list`
> **When** the user runs either command on the next invocation
> **Then** the output or TUI surfaces a notification identifying the newly available marketplace and inviting the user to inspect it — without blocking the current command's primary output.

**Satisfied when:**
- The notification names the new marketplace clearly and distinguishes it from routine output
- The notification appears once per new marketplace, not repeatedly on subsequent runs
- The primary command output is unaffected in structure
- In the TUI, the notification appears as a dismissible banner that does not grab focus

Difficulty: medium
Validates: `#marketplaces` (Marketplace Registry, Auto-Update)

#### Scenario: Add-Marketplace Makes Its Contents Immediately Discoverable

> **Given** the user runs `ensemble registry add-marketplace <repo>` for a new GitHub marketplace
> **When** the command completes
> **Then** the marketplace is registered and its plugins and skills are immediately searchable in `ensemble browse` and `ensemble registry search` — no separate refresh command is required.

**Satisfied when:**
- The marketplace appears in `ensemble registry list` after the add
- A search immediately returns matches from the new marketplace when they exist
- The add command validates the repo is reachable and fails clearly if not
- Re-adding the same marketplace reports "already registered" without error

Difficulty: medium
Validates: `#marketplaces` (Marketplace Registry)

---

## Feature: Expanded Client Roster 17 to 21 (v2.0)
> Ensemble detects and syncs to Antigravity, CodeBuddy, Qoder, and Trae alongside the existing 17 clients — the new entries are first-class, not a second tier.

Category: Core | Depends on: Client Resolution and Sync

### Critical

#### Scenario: Clients Command Detects All Four New Clients Alongside Existing 17

> **Given** the user has installed at least one of Antigravity, CodeBuddy, Qoder, or Trae on their machine
> **When** the user runs `ensemble clients`
> **Then** the command lists all detected clients and the new entries appear alongside the existing 17, each with its detected config path and sync state — same columns, same depth of information.

**Satisfied when:**
- Each of the four new clients is detectable at its documented config path when present
- Detected new clients appear in the `ensemble clients` output with their id, config path, and sync state
- Undetected new clients are omitted (not shown as "missing")
- The command runs to completion in the same time budget as v1.3 (no significant regression from four added clients)

Difficulty: medium
Validates: `#supported-clients`

#### Scenario: Sync to a New Client Writes Skills to the Expected Directory

> **Given** the user has installed one of the four new clients and has at least one skill in the library installed for that client
> **When** the user runs `ensemble sync <new-client-id>`
> **Then** the skill lands in the expected skills directory for that client (per AgentSkillsManager guidance), the install matrix is updated, and a rollback snapshot captures the pre-sync state.

**Satisfied when:**
- The skill file (or symlink) exists in the client's documented skills directory after sync
- The install matrix shows the new client as installed for that skill
- A pre-sync snapshot was captured before any write
- A subsequent `ensemble sync --dry-run` reports no pending changes

Difficulty: hard
Validates: `#supported-clients`, `#sync`

### Edge Cases

#### Scenario: New Clients Appear in Desktop By-Client Pivot With Full State Tracking

> **Given** the desktop app is launched and one or more of the four new clients is present
> **When** the user opens the By-Client pivot
> **Then** each detected new client appears in the client selector with the same install-state tracking as the existing 17 — no "beta" or "partial support" badge that hides behavior.

**Satisfied when:**
- The By-Client pivot lists the detected new clients in the selector
- Selecting a new client shows its install matrix with installable/uninstallable row controls
- Installing and uninstalling from this pivot works end-to-end as with existing clients
- Drift detection and doctor checks apply to new clients on par with existing ones

Difficulty: medium
Validates: `#desktop-app` (Layout), `#supported-clients`

---

## Feature: Migration v1.3 to v2.0.1
> My existing v1.3 config migrates cleanly to the v2.0.1 library model the first time I run the new version — nothing is lost, and I can tell exactly what changed.

Category: Core | Depends on: Migration (mcpoyle to Ensemble), Library-First Resource Intake

### Critical

#### Scenario: First v2.0.1 Run Migrates v1.3 Config Without Data Loss

> **Given** a user has a working v1.3 Ensemble config with servers, skills, plugins, groups, rules, and profiles
> **When** they run any v2.0.1 command for the first time
> **Then** the v1.3 config is migrated to the v2.0.1 library model automatically — every resource is preserved, old assignments are reconstructed as install state entries, and a backup of the pre-migration config is written alongside.

**Satisfied when:**
- Every server, skill, plugin, group, rule, and profile in the v1.3 config has a corresponding entry in the v2.0.1 library
- A backup file (e.g., `config.json.v1.3.bak`) exists next to the new config
- No data is silently dropped — resources the migrator cannot map are logged and flagged for review rather than discarded
- The user sees a migration summary on first run describing what happened
- Subsequent v2.0.1 commands operate on the migrated config without requiring re-migration

Difficulty: hard
Validates: `#config` (Migration from mcpoyle), `#core-concepts` (Resource Lifecycle Model)

#### Scenario: Install State Reconstructed From Old Client Assignments

> **Given** the v1.3 config had a group assigned to Claude Desktop and Cursor, and the group contained three servers
> **When** migration runs
> **Then** the three servers land in the library and each of their install matrices contains both `claude-desktop` and `cursor` — reproducing the effective install state that v1.3 would have produced via sync.

**Satisfied when:**
- Each of the three servers has a library entry after migration
- Each server's install matrix lists both clients
- A dry-run sync after migration reports no pending changes (the library projects to the same client state)
- Project-scoped assignments from v1.3 are reconstructed as per-project install matrix entries where supported

Difficulty: hard
Validates: `#core-concepts` (Resource Lifecycle Model), `#config` (Migration)

### Edge Cases

#### Scenario: Migration Summary Reports Counts Per Resource Type

> **Given** migration has just completed on a first v2.0.1 run
> **When** the summary is displayed
> **Then** the user sees a clear tally — "X servers migrated, Y skills, Z plugins, N groups, R rules, P profiles; library now contains M total resources" — plus any warnings about unmigrated items and where to find the backup.

**Satisfied when:**
- Counts are displayed for each resource type that existed in the v1.3 config
- The total library size is stated
- Any skipped or unmapped items are listed with a reason
- The path to the pre-migration backup is printed
- Profiles continue to round-trip through the v2.0.1 profile-as-plugin export after migration

Difficulty: medium
Validates: `#config` (Migration from mcpoyle), `#configuration-profiles`

