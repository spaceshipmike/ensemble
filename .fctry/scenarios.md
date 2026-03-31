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
> **When** the consumer calls any operation — `addServer`, `removeServer`, `enableServer`, `disableServer`, `addPlugin`, `removePlugin`, `assignGroup`, `syncResolve` — passing the config as the first argument
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

## Feature: Server Operations
> I add, remove, enable, disable, and inspect servers through Ensemble's operations.

Category: Core | Depends on: Config Lifecycle

### Critical

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
> **Then** the result contains exactly the servers in the "dev-tools" group that are enabled.

**Satisfied when:**
- Resolution returns only servers belonging to the assigned group
- Disabled servers within the group are excluded from the result
- The result is a list of fully resolved server definitions (not just names)

Difficulty: medium
Validates: `#sync` (Sync)

#### Scenario: Resolve Servers for Client with No Group (Default All)

> **Given** a config has client "cursor" with no group assignment (group is null)
> **When** the consumer resolves servers for "cursor"
> **Then** the result contains all enabled servers from the registry.

**Satisfied when:**
- A null group assignment means "receive all enabled servers"
- Disabled servers are excluded
- The behavior matches the spec: "When group is null, the client receives all enabled servers"

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

## Feature: Plugin Lifecycle
> I install, enable, disable, uninstall, and inspect Claude Code plugins through Ensemble operations.

Category: Core | Depends on: Config Lifecycle

### Critical

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
- Clients with reverted assignments fall back to receiving all enabled servers on next resolution
- Servers and plugins that were in the group still exist in the top-level registry

Difficulty: medium
Validates: `#groups` (Architecture)

---

## Feature: Skill Management
> I manage agent skills — adding, removing, and resolving them for clients that support skills directories.

Category: Core | Depends on: Config Lifecycle

### Critical

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
> **When** the user runs `ensemble list`, `ensemble add my-server --command node --args server.js`, `ensemble disable my-server`, `ensemble enable my-server`, `ensemble remove my-server`
> **Then** each command produces the expected output and config mutation, using the same operations library that a programmatic consumer would use.

**Satisfied when:**
- `ensemble list` displays all servers with enabled/disabled state
- `ensemble add` creates a server in the config
- `ensemble enable`/`ensemble disable` toggle state
- `ensemble remove` deletes the server and cleans up group membership
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
> **When** a user runs `ensemble disable my-server` via CLI, and separately a consumer calls `disableServer(config, "my-server")` via library
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
- No groups are created (clients receive all enabled servers by default)
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
