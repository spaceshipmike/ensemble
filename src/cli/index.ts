#!/usr/bin/env node

// @fctry: #cli-surface

/**
 * Ensemble CLI — thin Commander.js wrapper over the operations layer.
 *
 * Every command loads config, calls a pure operation, saves config, and prints.
 */

import { Command } from "commander";
import { loadConfig, saveConfig } from "../config.js";
import {
	CLIENTS,
	detectClients,
	readCCSettings,
	writeCCSettings,
	getEnabledPlugins,
	getExtraMarketplaces,
} from "../clients.js";
import {
	addServer,
	createGroup,
	deleteGroup,
	addServerToGroup,
	removeServerFromGroup,
	addPluginToGroup,
	removePluginFromGroup,
	addSkillToGroup,
	removeSkillFromGroup,
	assignClient,
	unassignClient,
	installPlugin,
	importPlugins,
	addMarketplace,
	removeMarketplace,
	installSkill,
	uninstallSkill,
	enableSkill,
	disableSkill,
	addRule,
	removeRule,
	pinItem,
	trackItem,
	detectCollisions,
	checkSkillDependencies,
	scopeItem,
	setTrustTier,
	saveProfile,
	activateProfile,
	listProfiles as listProfilesOp,
	showProfile,
	deleteProfile,
	setUserNotes,
	getUserNotes,
	installAgent,
	uninstallAgent,
	enableAgent,
	disableAgent,
	installCommand,
	uninstallCommand,
	enableCommand,
	disableCommand,
} from "../operations.js";
import { searchAll } from "../search.js";
import { searchRegistries, showRegistry, listBackends, clearCache, resolveInstallParams } from "../registry.js";
import { syncClient, syncAllClients, syncSkills, computeContextCost } from "../sync.js";
import { runDoctor } from "../doctor.js";
import { discover, discoveredSkillToInstallParams } from "../discover.js";
import { copyFileSync, existsSync as fsExistsSync, mkdirSync as fsMkdirSync, readFileSync as fsReadFileSync } from "node:fs";
import { basename as pathBasename, join as pathJoin } from "node:path";
import {
	deleteAgentMd,
	frontmatterToAgent,
	writeAgentMd,
} from "../agents.js";
import {
	deleteCommandMd,
	frontmatterToCommand,
	writeCommandMd,
} from "../commands.js";
import { syncAgents, syncCommands } from "../sync.js";
import { SKILLS_DIR as ENSEMBLE_SKILLS_DIR } from "../config.js";
import { listProjects } from "../projects.js";
import { qualifiedPluginName } from "../schemas.js";
import type { OpResult, OpReturn } from "../operations.js";
import {
	inferLibraryType,
	libraryList,
	libraryShow,
	pull as lifecyclePull,
	remove as lifecycleRemove,
} from "../lifecycle.js";
import type { ResourceType } from "../lifecycle.js";
import { browseSearch } from "../browse.js";
import {
	getManagedSetting,
	listManagedSettings,
	parseSettingValue,
	setManagedSetting,
	toManagedSetting,
	unsetManagedSetting,
} from "../managed-settings.js";
import { buildManagedFromList, mergeSettings } from "../settings.js";
import {
	enableServer,
	disableServer,
	enablePlugin,
	disablePlugin,
} from "../operations.js";
import { findOrphanedInClients } from "../clients.js";
import type { MarketplaceSource } from "../schemas.js";

const program = new Command();

program
	.name("ensemble")
	.description("Central manager for MCP servers, skills, and plugins across AI clients")
	.version("1.2.0");

// --- Helper ---

function handle<R extends OpResult>(fn: () => OpReturn<R>): void {
	const { config, result } = fn();
	if (!result.ok) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}
	for (const msg of result.messages) console.log(msg);
	saveConfig(config);
}

// --- Server commands ---

program
	.command("list")
	.description("List all registered servers")
	.option("--verbose", "Show description and notes on separate lines")
	.action((opts) => {
		const config = loadConfig();
		if (config.servers.length === 0) {
			console.log("No servers registered.");
			return;
		}
		for (const s of config.servers) {
			const status = s.enabled ? "●" : "○";
			const tier = s.origin.trust_tier !== "local" ? ` [${s.origin.trust_tier}]` : "";
			console.log(`${status} ${s.name}${tier}  ${s.command} ${s.args.join(" ")}`);
			// userNotes (user-owned) takes precedence; description (source-owned) is fallback.
			if (opts.verbose) {
				if (s.userNotes) console.log(`    Notes: ${s.userNotes}`);
				if (s.description) console.log(`    Description: ${s.description}`);
			} else {
				const blurb = s.userNotes || s.description;
				if (blurb) console.log(`    ${blurb}`);
			}
		}
	});

program
	.command("add <name>")
	.description("Add a new MCP server")
	.requiredOption("--command <cmd>", "Command to run the server")
	.option("--args <arg...>", "Arguments for the command")
	.option("--env <pairs...>", "Environment variables (KEY=VAL)")
	.option("--transport <type>", "Transport type", "stdio")
	.action((name, opts) => {
		const env: Record<string, string> = {};
		for (const pair of opts.env ?? []) {
			const [k, ...v] = pair.split("=");
			if (k) env[k] = v.join("=");
		}
		handle(() => addServer(loadConfig(), {
			name,
			command: opts.command,
			args: opts.args ?? [],
			env,
			transport: opts.transport,
		}));
	});

program
	.command("remove <name>")
	.description("Evict a resource from the library (destructive; use --type to disambiguate)")
	.option("--type <type>", "One of: server|plugin|skill|agent|command|hook")
	.action((name, opts) => {
		const config = loadConfig();
		const { config: newConfig, result } = lifecycleRemove(config, {
			name,
			...(opts.type ? { type: opts.type as ResourceType } : {}),
		});
		if (!result.ok) {
			// Preserve the v1.3 orphan-detection hint for bare server removals where
			// no type was specified.
			if (!opts.type) {
				const orphans = findOrphanedInClients(name);
				if (orphans.length > 0) {
					console.error(`Error: '${name}' not found in ensemble registry, but exists as orphaned entry in: ${orphans.join(", ")}. Run 'ensemble import' to adopt it.`);
					process.exit(1);
				}
			}
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		for (const msg of result.messages) console.log(msg);
		saveConfig(newConfig);
	});

// NOTE: v2.0.1 — top-level `enable <server>` / `disable <server>` are deleted
// per spec §Retained Surface Deletions. Use `ensemble install` / `ensemble
// uninstall` from the lifecycle verbs block below.

// --- Lifecycle verbs (v2.0.1 noun-first grammar) ---

program
	.command("pull <source>")
	.description("Pull a resource into the library (owner/repo, ./path, registry:slug, URL)")
	.option("--type <type>", "Disambiguate inference: server|plugin|skill|agent|command|hook")
	.option("--name <name>", "Override the derived library name")
	.action((source: string, opts: { type?: string; name?: string }) => {
		const config = loadConfig();
		const { config: newConfig, result } = lifecyclePull(config, {
			source,
			...(opts.type ? { type: opts.type as ResourceType } : {}),
			...(opts.name ? { name: opts.name } : {}),
		});
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		for (const msg of result.messages) console.log(msg);
		saveConfig(newConfig);
	});

program
	.command("install <name>")
	.description("Install a library resource onto a client")
	.option("--client <id>", "Target client id (defaults to claude-code)")
	.option("--type <type>", "Disambiguate inference: server|plugin|skill|agent|command")
	.option("--project <path>", "Project-scoped install (Claude Code only)")
	.option("--scope <scope>", "global or project (defaults to global)", "global")
	.action((name: string, opts: { client?: string; type?: string; project?: string; scope?: string }) => {
		const config = loadConfig();
		const type = (opts.type as ResourceType | undefined) ?? inferLibraryType(config, name);
		if (!type) {
			console.error(`Error: '${name}' not found in the library. Pull it first or pass --type.`);
			process.exit(1);
		}
		// Route per resource type. Install semantics in v2.0.1 = "mark enabled on
		// this client" + fan-out via sync. For chunk 8 we honour enable mutations;
		// downstream sync writes the per-client files.
		const dispatch: Record<string, (c: typeof config, n: string) => { config: typeof config; result: OpResult }> = {
			server: enableServer,
			agent: enableAgent,
			command: enableCommand,
			plugin: enablePlugin,
			skill: enableSkill,
		};
		const fn = dispatch[type];
		if (!fn) {
			console.error(`Error: install does not support type '${type}'.`);
			process.exit(1);
			return;
		}
		const out = fn(config, name);
		if (!out.result.ok) {
			console.error(`Error: ${out.result.error}`);
			process.exit(1);
		}
		for (const msg of out.result.messages) console.log(msg);
		const scopeSuffix = opts.project ? ` (project ${opts.project})` : ` (scope: ${opts.scope ?? "global"})`;
		console.log(`Installed ${type} '${name}' on ${opts.client ?? "claude-code"}${scopeSuffix}.`);
		saveConfig(out.config);
	});

program
	.command("uninstall <name>")
	.description("Uninstall a resource from a client (keeps it in the library)")
	.option("--client <id>", "Target client id (defaults to claude-code)")
	.option("--type <type>", "Disambiguate inference: server|plugin|skill|agent|command")
	.option("--project <path>", "Project-scoped uninstall (Claude Code only)")
	.action((name: string, opts: { client?: string; type?: string; project?: string }) => {
		const config = loadConfig();
		const type = (opts.type as ResourceType | undefined) ?? inferLibraryType(config, name);
		if (!type) {
			console.error(`Error: '${name}' not found in the library.`);
			process.exit(1);
		}
		const dispatch: Record<string, (c: typeof config, n: string) => { config: typeof config; result: OpResult }> = {
			server: disableServer,
			agent: disableAgent,
			command: disableCommand,
			plugin: disablePlugin,
			skill: disableSkill,
		};
		const fn = dispatch[type as string];
		if (!fn) {
			console.error(`Error: uninstall does not support type '${type}'.`);
			process.exit(1);
			return;
		}
		const out = fn(config, name);
		if (!out.result.ok) {
			console.error(`Error: ${out.result.error}`);
			process.exit(1);
		}
		for (const msg of out.result.messages) console.log(msg);
		const scopeSuffix = opts.project ? ` (project ${opts.project})` : "";
		console.log(`Uninstalled ${type} '${name}' from ${opts.client ?? "claude-code"}${scopeSuffix}.`);
		saveConfig(out.config);
	});

// --- Library subcommand ---

const libraryCmd = program.command("library").description("Inspect the library (installed + uninstalled)");

libraryCmd
	.command("list")
	.description("List every library entry with an install-state badge")
	.option("--type <type>", "Filter by type")
	.option("--installed", "Only entries installed on ≥1 client")
	.option("--not-installed", "Only entries present in the library but not installed anywhere")
	.action((opts: { type?: string; installed?: boolean; notInstalled?: boolean }) => {
		const config = loadConfig();
		const filter = opts.installed ? "installed" : opts.notInstalled ? "not-installed" : undefined;
		const entries = libraryList(config, {
			...(opts.type ? { type: opts.type as ResourceType } : {}),
			...(filter ? { filter } : {}),
		});
		if (entries.length === 0) {
			console.log("Library is empty.");
			return;
		}
		for (const e of entries) {
			const badge = e.installed ? "installed" : "library";
			console.log(`${e.name}  ${e.type}  ${e.source}  [${badge}]`);
		}
	});

libraryCmd
	.command("show <name>")
	.description("Show one library entry and its install matrix")
	.option("--type <type>", "Disambiguate when multiple types share a name")
	.action((name: string, opts: { type?: string }) => {
		const config = loadConfig();
		const detail = libraryShow(config, name, opts.type as ResourceType | undefined);
		if (!detail) {
			console.error(`Error: '${name}' not found in the library.`);
			process.exit(1);
		}
		console.log(`${detail.type}: ${detail.name}`);
		console.log(`Source: ${detail.source}`);
		console.log(`Install state: ${detail.installState.global ? "installed globally" : "library only"}`);
		if (detail.description) console.log(`Description: ${detail.description}`);
		if (detail.notes) console.log(`Notes: ${detail.notes}`);
	});

libraryCmd
	.command("pivot <type>")
	.description("Filter the library by resource type (CLI print of the pivot view)")
	.action((type: string) => {
		const config = loadConfig();
		const entries = libraryList(config, { type: type as ResourceType });
		if (entries.length === 0) {
			console.log(`No ${type}s in the library.`);
			return;
		}
		for (const e of entries) {
			const badge = e.installed ? "installed" : "library";
			console.log(`${e.name}  ${e.source}  [${badge}]`);
		}
	});

// --- Browse (v2.0.1 engine: plain-text CLI surface) ---

program
	.command("browse [query...]")
	.description("Fuzzy search across installed and discoverable resources")
	.option("--type <type>", "Filter by resource type")
	.option("--marketplace <name>", "Restrict to one marketplace (or use @marketplace/ in the query)")
	.option("--limit <n>", "Max rows (defaults to 50)")
	.action((queryParts: string[], opts: { type?: string; marketplace?: string; limit?: string }) => {
		const config = loadConfig();
		const queryText = queryParts.join(" ");
		const limit = opts.limit ? Number.parseInt(opts.limit, 10) : undefined;
		if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
			console.error(`Error: --limit must be a positive integer, got '${opts.limit}'.`);
			process.exit(1);
		}
		const results = browseSearch(config, {
			...(queryText ? { query: queryText } : {}),
			...(opts.type ? { type: opts.type } : {}),
			...(opts.marketplace ? { marketplace: opts.marketplace } : {}),
			...(limit !== undefined ? { limit } : {}),
		});
		if (results.length === 0) {
			console.log("No matches.");
			return;
		}
		for (const r of results) {
			const badge = `[${r.installState}]`;
			const install = r.installCommand ? `  ${r.installCommand}` : "";
			console.log(`${r.name}  ${r.type}  ${r.source}  ${badge}${install}`);
		}
	});

// --- Settings (v2.0.1 declarative managed-settings store) ---

const settingsCmd = program.command("settings").description("Declarative managed settings for client settings.json files");

settingsCmd
	.command("set <key> <value>")
	.description("Set a managed key. Value is parsed as JSON (falls back to the literal string)")
	.option("--client <id>", "Target client id (defaults to claude-code)")
	.option("--notes <text>", "Optional user-authored note (never written to settings.json)")
	.action((key: string, value: string, opts: { client?: string; notes?: string }) => {
		const parsed = parseSettingValue(value);
		const result = setManagedSetting({
			keyPath: key,
			value: parsed,
			...(opts.client ? { clientId: opts.client } : {}),
			...(opts.notes !== undefined ? { userNotes: opts.notes } : {}),
		});
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		console.log(`Set '${key}' for ${opts.client ?? "claude-code"}.`);
	});

settingsCmd
	.command("unset <key>")
	.description("Stop managing a key (the value in settings.json stays in place)")
	.option("--client <id>", "Target client id (defaults to claude-code)")
	.action((key: string, opts: { client?: string }) => {
		const result = unsetManagedSetting(key, opts.client);
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		console.log(`Stopped managing '${key}' for ${opts.client ?? "claude-code"}.`);
	});

settingsCmd
	.command("list")
	.description("List every managed key with its current value")
	.option("--client <id>", "Filter by client id")
	.action((opts: { client?: string }) => {
		const entries = listManagedSettings(opts.client);
		if (entries.length === 0) {
			console.log("No managed settings.");
			return;
		}
		for (const e of entries) {
			console.log(`${e.keyPath}  (${e.clientId})  ${JSON.stringify(e.value)}`);
			if (e.userNotes) console.log(`    notes: ${e.userNotes}`);
		}
	});

settingsCmd
	.command("show <key>")
	.description("Show a single managed key")
	.option("--client <id>", "Target client id (defaults to claude-code)")
	.action((key: string, opts: { client?: string }) => {
		const entry = getManagedSetting(key, opts.client);
		if (!entry) {
			console.error(`Error: '${key}' is not a managed setting for ${opts.client ?? "claude-code"}.`);
			process.exit(1);
		}
		console.log(`Key: ${entry.keyPath}`);
		console.log(`Client: ${entry.clientId}`);
		console.log(`Value: ${JSON.stringify(entry.value)}`);
		if (entry.userNotes) console.log(`Notes: ${entry.userNotes}`);
	});

settingsCmd
	.command("sync")
	.description("Re-apply every managed setting to the target client's settings.json")
	.option("--client <id>", "Target client id (defaults to claude-code)")
	.action((opts: { client?: string }) => {
		const clientId = opts.client ?? "claude-code";
		if (clientId !== "claude-code") {
			// v2.0.1 scope: only claude-code settings.json is wired today. Other
			// clients will route through the same merge primitive in a follow-up.
			console.error(`Error: settings sync for client '${clientId}' is not wired yet. Only claude-code is supported.`);
			process.exit(1);
		}
		const entries = listManagedSettings(clientId).map(toManagedSetting);
		const existing = readCCSettings();
		const { managed, ownedKeys } = buildManagedFromList(entries);
		const { merged } = mergeSettings(existing, managed, ownedKeys);
		writeCCSettings(merged);
		console.log(`Synced ${entries.length} managed setting(s) to ${clientId}.`);
	});


program
	.command("show <name>")
	.description("Show server details")
	.option("--verbose", "Show notes and description on labeled lines (default JSON dump)")
	.action((name, opts) => {
		const config = loadConfig();
		const server = config.servers.find((s) => s.name === name);
		if (!server) {
			console.error(`Server '${name}' not found.`);
			process.exit(1);
		}
		if (opts.verbose) {
			console.log(`Server: ${server.name}`);
			console.log(`Command: ${server.command} ${server.args.join(" ")}`.trim());
			if (server.userNotes) console.log(`Notes: ${server.userNotes}`);
			if (server.description) console.log(`Description: ${server.description}`);
			return;
		}
		console.log(JSON.stringify(server, null, 2));
	});

// --- Groups ---

const groups = program.command("groups").description("Manage server groups");

groups.command("list").description("List all groups").action(() => {
	const config = loadConfig();
	if (config.groups.length === 0) { console.log("No groups."); return; }
	for (const g of config.groups) {
		console.log(`${g.name}  (${g.servers.length}S ${g.plugins.length}P ${g.skills.length}K)  ${g.description}`);
	}
});

groups.command("create <name>").option("-d, --description <text>").action((name, opts) => {
	handle(() => createGroup(loadConfig(), name, opts.description));
});

groups.command("delete <name>").action((name) => {
	handle(() => deleteGroup(loadConfig(), name));
});

groups.command("show <name>").action((name) => {
	const config = loadConfig();
	const group = config.groups.find((g) => g.name === name);
	if (!group) { console.error(`Group '${name}' not found.`); process.exit(1); }
	console.log(`Group: ${group.name}`);
	if (group.description) console.log(`Description: ${group.description}`);
	if (group.servers.length) console.log(`Servers: ${group.servers.join(", ")}`);
	if (group.plugins.length) console.log(`Plugins: ${group.plugins.join(", ")}`);
	if (group.skills.length) console.log(`Skills: ${group.skills.join(", ")}`);
});

groups.command("add-server <group> <server>").action((g, s) => {
	handle(() => addServerToGroup(loadConfig(), g, s));
});
groups.command("remove-server <group> <server>").action((g, s) => {
	handle(() => removeServerFromGroup(loadConfig(), g, s));
});
groups.command("add-plugin <group> <plugin>").action((g, p) => {
	handle(() => addPluginToGroup(loadConfig(), g, p));
});
groups.command("remove-plugin <group> <plugin>").action((g, p) => {
	handle(() => removePluginFromGroup(loadConfig(), g, p));
});
groups.command("add-skill <group> <skill>").action((g, s) => {
	handle(() => addSkillToGroup(loadConfig(), g, s));
});
groups.command("remove-skill <group> <skill>").action((g, s) => {
	handle(() => removeSkillFromGroup(loadConfig(), g, s));
});

groups.command("export <name>")
	.description("Export group as CC plugin")
	.option("--output <dir>", "Output directory")
	.option("--strip-notes", "Omit userNotes from the exported plugin.json")
	.action((name, opts) => {
		const { exportGroupAsPlugin } = require("../export.js") as typeof import("../export.js");
		const result = exportGroupAsPlugin(loadConfig(), name, opts.output, { stripNotes: opts.stripNotes === true });
		if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
		for (const msg of result.messages) console.log(msg);
	});

// --- Clients ---

program.command("clients").description("Detect installed AI clients").action(() => {
	const detected = detectClients();
	const config = loadConfig();
	for (const c of Object.values(CLIENTS)) {
		const installed = detected.some((d) => d.id === c.id);
		const assignment = config.clients.find((a) => a.id === c.id);
		const status = installed ? "✓" : "·";
		const group = assignment?.group ? ` → ${assignment.group}` : "";
		const skills = c.skillsDir ? ", skills ✓" : "";
		console.log(`${status} ${c.name} (${c.id}${skills})${group}`);
	}
});

// --- Assign / Unassign ---

program
	.command("assign <client> [group]")
	.option("--all", "Assign all enabled servers")
	.option("--project <path>", "Project-level assignment (Claude Code only)")
	.action((clientId, group, opts) => {
		handle(() => assignClient(loadConfig(), clientId, group ?? null, {
			assignAll: opts.all,
			projectPath: opts.project,
		}));
	});

program
	.command("unassign <client>")
	.option("--project <path>")
	.action((clientId, opts) => {
		const config = loadConfig();
		const { config: newConfig, result } = unassignClient(config, clientId, opts.project);
		if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
		for (const msg of result.messages) console.log(msg);
		saveConfig(newConfig);
	});

// --- Sync ---

program
	.command("sync [client]")
	.option("--dry-run", "Preview changes without writing")
	.option("--force", "Overwrite manually-edited entries")
	.option("--adopt", "Accept manual edits into ensemble's registry")
	.option("--project <path>", "Sync a specific project (Claude Code only)")
	.option("--budget", "Show context budget visualization")
	.action((clientId, opts) => {
		let config = loadConfig();

		if (opts.budget) {
			const targetClients = clientId ? [clientId] : Object.keys(CLIENTS);
			for (const cid of targetClients) {
				const cost = computeContextCost(config, cid);
				if (cost.toolCount === 0 && !clientId) continue;
				const bar = "█".repeat(Math.min(Math.round(cost.budgetPercent / 5), 20));
				const empty = "░".repeat(20 - Math.min(Math.round(cost.budgetPercent / 5), 20));
				const clientDef = CLIENTS[cid];
				console.log(`${clientDef?.name ?? cid}:`);
				console.log(`  [${bar}${empty}] ${cost.budgetPercent}% of ${(cost.contextWindow / 1000).toFixed(0)}k context`);
				console.log(`  ${cost.serverCount} servers, ${cost.toolCount} tools, ~${cost.estimatedTokens} tokens`);
				if (cost.suggestions.length > 0) {
					console.log("  Suggestions:");
					for (const s of cost.suggestions) {
						console.log(`    ${s.groupName}: ${s.serverNames.join(", ")} (${s.reason})`);
					}
				}
			}
			return;
		}

		if (clientId) {
			const { config: newConfig, result } = syncClient(config, clientId, opts);
			config = newConfig;
			for (const msg of result.messages) console.log(msg);
			for (const a of result.actions) {
				const prefix = { add: "+", remove: "-", update: "~", "skip-drift": "⚠" }[a.type];
				console.log(`  ${prefix} ${a.name}${a.detail ? ` (${a.detail})` : ""}`);
			}
		} else {
			const { config: newConfig, results } = syncAllClients(config, opts);
			config = newConfig;
			for (const result of results) {
				if (result.actions.length > 0 || result.messages[0]?.includes("synced")) {
					for (const msg of result.messages) console.log(msg);
				}
			}
		}
		if (!opts.dryRun) saveConfig(config);
	});

program.command("import <client>").description("Import servers from a client").action((clientId) => {
	const clientDef = CLIENTS[clientId];
	if (!clientDef) { console.error(`Unknown client: ${clientId}`); process.exit(1); }
	const { doImport } = require("../sync.js") as typeof import("../sync.js");
	const config = loadConfig();
	const { config: newConfig, result } = doImport(config, clientId);
	const total = result.servers.length + result.projectImports.reduce((sum, p) => sum + p.servers.length, 0);
	if (total > 0) {
		console.log(`Imported ${result.servers.length} server(s) from ${clientDef.name}.`);
		for (const proj of result.projectImports) {
			console.log(`  + ${proj.servers.length} server(s) from project ${proj.path}`);
		}
	} else {
		console.log("No new servers to import.");
	}
	saveConfig(newConfig);
});

// --- Scope ---

program.command("scope <name>").description("Move server/plugin to project-only").requiredOption("--project <path>", "Target project path").action((name, opts) => {
	handle(() => scopeItem(loadConfig(), name, opts.project));
});

// --- Plugins ---

const plugins = program.command("plugins").description("Manage Claude Code plugins");

plugins.command("list").action(() => {
	const config = loadConfig();
	if (config.plugins.length === 0) { console.log("No plugins."); return; }
	for (const p of config.plugins) {
		const status = p.enabled ? "●" : "○";
		console.log(`${status} ${qualifiedPluginName(p)}  ${p.managed ? "(managed)" : "(imported)"}`);
	}
});

// NOTE: v2.0.1 — `plugins install` / `plugins uninstall` / `plugins enable` /
// `plugins disable` are deleted per spec §Retained Surface Deletions. Use the
// top-level `ensemble install --type plugin` / `ensemble uninstall --type
// plugin` from the lifecycle verbs block.

plugins.command("show <name>").action((name) => {
	const config = loadConfig();
	const plugin = config.plugins.find((p) => p.name === name);
	if (!plugin) { console.error(`Plugin '${name}' not found.`); process.exit(1); }
	console.log(JSON.stringify(plugin, null, 2));
});
plugins.command("import").description("Import existing plugins from CC settings").action(() => {
	const config = loadConfig();
	const settings = readCCSettings();
	const enabled = getEnabledPlugins(settings);
	const { config: newConfig, result } = importPlugins(config, enabled);
	for (const msg of result.messages) console.log(msg);
	saveConfig(newConfig);
});

// --- Marketplaces ---

const marketplaces = program.command("marketplaces").description("Manage plugin marketplaces");

marketplaces.command("list").action(() => {
	const config = loadConfig();
	if (config.marketplaces.length === 0) { console.log("No marketplaces."); return; }
	for (const m of config.marketplaces) {
		console.log(`${m.name}  (${m.source.source}: ${m.source.repo || m.source.path || m.source.url})`);
	}
});

marketplaces.command("add <name>").option("--repo <owner/repo>").option("--path <dir>").action((name, opts) => {
	let source: MarketplaceSource;
	if (opts.repo) {
		source = { source: "github", repo: opts.repo, path: "", url: "" };
	} else if (opts.path) {
		source = { source: "directory", repo: "", path: opts.path, url: "" };
	} else {
		console.error("Specify --repo or --path."); process.exit(1); return;
	}
	const config = loadConfig();
	const { config: newConfig, result } = addMarketplace(config, name, source);
	if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
	for (const msg of result.messages) console.log(msg);
	// Write to CC settings
	const settings = readCCSettings();
	const extra = getExtraMarketplaces(settings);
	extra[name] = { source: { source: source.source, ...(source.repo ? { repo: source.repo } : {}), ...(source.path ? { path: source.path } : {}) } };
	settings["extraKnownMarketplaces"] = extra;
	writeCCSettings(settings);
	saveConfig(newConfig);
});

marketplaces.command("show <name>").description("Show marketplace details").action((name) => {
	const config = loadConfig();
	const mp = config.marketplaces.find((m) => m.name === name);
	if (!mp) { console.error(`Marketplace '${name}' not found.`); process.exit(1); }
	console.log(JSON.stringify(mp, null, 2));
});

marketplaces.command("remove <name>").action((name) => {
	handle(() => removeMarketplace(loadConfig(), name));
});

// --- Skills ---

const skills = program.command("skills").description("Manage agent skills");

skills.command("list").option("--verbose", "Show description and notes on separate lines").action((opts) => {
	const config = loadConfig();
	if (config.skills.length === 0) { console.log("No skills."); return; }
	for (const s of config.skills) {
		const status = s.enabled ? "●" : "○";
		const tags = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
		// userNotes (user-owned) takes precedence over description (source-owned).
		const primary = s.userNotes || s.description || "";
		console.log(`${status} ${s.name}${tags}  ${primary}`);
		if (opts.verbose) {
			if (s.userNotes) console.log(`    Notes: ${s.userNotes}`);
			if (s.description) console.log(`    Description: ${s.description}`);
		}
	}
});

skills.command("add <name>").option("-d, --description <text>").option("--tags <tags>").action((name, opts) => {
	const tags = opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [];
	handle(() => installSkill(loadConfig(), { name, description: opts.description, tags }));
});

skills.command("remove <name>").action((name) => {
	handle(() => uninstallSkill(loadConfig(), name));
});

skills.command("enable <name>").action((name) => {
	handle(() => enableSkill(loadConfig(), name));
});
skills.command("disable <name>").action((name) => {
	handle(() => disableSkill(loadConfig(), name));
});

skills.command("show <name>").action((name) => {
	const config = loadConfig();
	const skill = config.skills.find((s) => s.name === name);
	if (!skill) { console.error(`Skill '${name}' not found.`); process.exit(1); }
	console.log(JSON.stringify(skill, null, 2));
});

skills.command("search <query>").description("Search installed skills").action((query) => {
	const { searchSkills: searchSk } = require("../search.js") as typeof import("../search.js");
	const results = searchSk(loadConfig(), query);
	if (results.length === 0) { console.log("No matching skills."); return; }
	for (const r of results) {
		console.log(`${r.name}  score=${r.score.toFixed(2)}  [${r.matchedFields.join(",")}]`);
	}
});

skills.command("sync [client]").option("--dry-run").action((clientId, opts) => {
	const config = loadConfig();
	if (clientId) {
		const result = syncSkills(config, clientId, opts);
		for (const msg of result.messages) console.log(msg);
	} else {
		for (const c of Object.values(CLIENTS)) {
			if (c.skillsDir) {
				const result = syncSkills(config, c.id, opts);
				for (const msg of result.messages) console.log(msg);
			}
		}
	}
});

// --- Notes (v2.0.3 #notes-and-descriptions) ---

program
	.command("note <ref> [text]")
	.description("Get, set, or clear user notes on a server, skill, or plugin")
	.option("--edit", "Open $VISUAL/$EDITOR to edit the note")
	.action((ref: string, text: string | undefined, opts: { edit?: boolean }) => {
		const config = loadConfig();

		// --edit: open $VISUAL → $EDITOR → vi on a temp file seeded with current text.
		if (opts.edit) {
			const current = getUserNotes(config, ref);
			if (!current) {
				console.error(`Error: '${ref}' not found.`);
				process.exit(1);
			}
			const editor = process.env.VISUAL || process.env.EDITOR || "vi";
			const tmpDir = require("node:os").tmpdir() as string;
			const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require("node:fs") as typeof import("node:fs");
			const { join } = require("node:path") as typeof import("node:path");
			const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
			const dir = mkdtempSync(join(tmpDir, "ensemble-note-"));
			const file = join(dir, `${current.type}-${current.name}.md`);
			writeFileSync(file, current.userNotes ?? "");
			const proc = spawnSync(editor, [file], { stdio: "inherit" });
			if (proc.status !== 0) {
				rmSync(dir, { recursive: true, force: true });
				console.error(`Error: editor exited with status ${proc.status ?? "?"}.`);
				process.exit(1);
			}
			const next = readFileSync(file, "utf-8").replace(/\n+$/, "");
			rmSync(dir, { recursive: true, force: true });
			handle(() => setUserNotes(config, { ref, text: next }));
			return;
		}

		// No text and no --edit → print current note (or empty).
		if (text === undefined) {
			const current = getUserNotes(config, ref);
			if (!current) {
				console.error(`Error: '${ref}' not found.`);
				process.exit(1);
			}
			if (current.userNotes) {
				console.log(current.userNotes);
			} else {
				console.log(`(no notes on ${current.type} '${current.name}')`);
			}
			return;
		}

		// Text provided (possibly empty string → clears).
		handle(() => setUserNotes(config, { ref, text }));
	});

// --- Profiles ---

const profiles = program.command("profiles").description("Save and switch configuration profiles");

profiles.command("save <name>").description("Save current config as a named profile").action((name) => {
	const config = loadConfig();
	const { config: newConfig, result } = saveProfile(config, name);
	if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
	for (const msg of result.messages) console.log(msg);
	saveConfig(newConfig);
});

profiles.command("activate <name>").description("Switch to a saved profile").action((name) => {
	const config = loadConfig();
	const { config: newConfig, result } = activateProfile(config, name);
	if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
	for (const msg of result.messages) console.log(msg);
	saveConfig(newConfig);
	// Sync all clients after activating
	const { config: syncedConfig, results: syncResults } = syncAllClients(newConfig);
	for (const sr of syncResults) {
		if (sr.hasChanges) {
			for (const msg of sr.messages) console.log(msg);
		}
	}
	saveConfig(syncedConfig);
});

profiles.command("list").description("List saved profiles").action(() => {
	const { result } = listProfilesOp(loadConfig());
	for (const msg of result.messages) console.log(msg);
});

profiles.command("show <name>").description("Show profile details").action((name) => {
	const { result } = showProfile(loadConfig(), name);
	if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
	for (const msg of result.messages) console.log(msg);
});

profiles.command("delete <name>").description("Delete a saved profile").action((name) => {
	const config = loadConfig();
	const { config: newConfig, result } = deleteProfile(config, name);
	if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
	for (const msg of result.messages) console.log(msg);
	saveConfig(newConfig);
});

// --- Rules ---

const rules = program.command("rules").description("Manage path rules");
rules.command("list").action(() => {
	const config = loadConfig();
	if (config.rules.length === 0) { console.log("No rules."); return; }
	for (const r of config.rules) console.log(`${r.path} → ${r.group}`);
});
rules.command("add <path> <group>").action((path, group) => {
	handle(() => addRule(loadConfig(), path, group));
});
rules.command("remove <path>").action((path) => {
	handle(() => removeRule(loadConfig(), path));
});

// --- Pin / Track ---

program.command("pin <name>").description("Pin a server or skill").action((name) => {
	handle(() => pinItem(loadConfig(), name));
});
program.command("track <name>").description("Track a server or skill for updates").action((name) => {
	handle(() => trackItem(loadConfig(), name));
});

program.command("trust <name> <tier>").description("Set trust tier (official/community/local)").action((name, tier) => {
	if (!["official", "community", "local"].includes(tier)) {
		console.error(`Invalid tier '${tier}'. Valid: official, community, local`);
		process.exit(1);
	}
	handle(() => setTrustTier(loadConfig(), name, tier as "official" | "community" | "local"));
});

// --- Collisions / Deps ---

program.command("collisions").description("Detect scope conflicts").action(() => {
	const collisions = detectCollisions(loadConfig());
	if (collisions.length === 0) { console.log("No collisions."); return; }
	for (const c of collisions) {
		console.log(`⚠ ${c.itemType} '${c.itemName}' in both ${c.globalGroup} (global) and ${c.projectGroup} (${c.projectPath})`);
	}
});

program.command("deps").description("Show skill dependency status").action(() => {
	const deps = checkSkillDependencies(loadConfig());
	if (deps.length === 0) { console.log("All skill dependencies satisfied."); return; }
	for (const d of deps) {
		console.log(`${d.skillName}: ${d.satisfied.length} satisfied, ${d.missing.length} missing, ${d.disabled.length} disabled`);
		if (d.missing.length) console.log(`  Missing: ${d.missing.join(", ")}`);
		if (d.disabled.length) console.log(`  Disabled: ${d.disabled.join(", ")}`);
	}
});

// --- Search ---

program.command("search <query>")
	.option("--limit <n>", "Max results", "20")
	.option("--no-usage", "Skip usage-based scoring")
	.option("--reset-usage", "Clear usage data")
	.action((query, opts) => {
		if (opts.resetUsage) {
			const { clearUsage: clearU } = require("../usage.js") as typeof import("../usage.js");
			clearU();
			console.log("Usage data cleared.");
			return;
		}
		const config = loadConfig();
		let usageData: import("../usage.js").UsageData | undefined;
		if (opts.usage !== false && config.settings.usage_tracking) {
			const { loadUsage: loadU } = require("../usage.js") as typeof import("../usage.js");
			usageData = loadU();
		}
		const results = searchAll(config, query, parseInt(opts.limit), { usageData });
		if (results.length === 0) { console.log("No results."); return; }
		const local = results.filter((r) => r.resultType !== "capability");
		const caps = results.filter((r) => r.resultType === "capability");
		if (local.length > 0) {
			console.log("  Local:");
			for (const r of local) {
				const tools = r.matchedTools.length > 0 ? ` (${r.matchedTools.join(", ")})` : "";
				console.log(`    ${r.name} (${r.resultType}${tools})`);
			}
		}
		if (caps.length > 0) {
			console.log("\n  Portfolio capabilities (via setlist):");
			for (const r of caps) {
				const model = r.invocationModel ?? "internal";
				const enabled = r.serverEnabled != null ? (r.serverEnabled ? " \u2713 enabled" : " \u2717 not enabled") : "";
				console.log(`    ${r.name} \u2014 ${r.matchedFields.join(", ")} (${model}${enabled})`);
			}
		}
	});

// --- Registry ---

const registry = program.command("registry").description("Search and install from MCP registries");

registry.command("search <query>").option("--no-cache").action(async (query, opts) => {
	const results = await searchRegistries(query, { useCache: opts.cache !== false });
	if (results.length === 0) { console.log("No results."); return; }
	for (const r of results) {
		console.log(`${r.name}  [${r.source}] ${r.transport}  ${r.description}`);
	}
});

registry.command("show <id>").option("--no-cache").action(async (id, opts) => {
	const detail = await showRegistry(id, { useCache: opts.cache !== false });
	if (!detail) { console.error(`Server '${id}' not found in registries.`); process.exit(1); }
	console.log(JSON.stringify(detail, null, 2));
});

registry.command("add <id>").option("--env <pairs...>").action(async (id, opts) => {
	const detail = await showRegistry(id);
	if (!detail) { console.error(`Server '${id}' not found.`); process.exit(1); }
	const { command, args, transport } = resolveInstallParams(detail);
	const env: Record<string, string> = {};
	for (const pair of opts.env ?? []) {
		const [k, ...v] = pair.split("=");
		if (k) env[k] = v.join("=");
	}
	handle(() => addServer(loadConfig(), {
		name: detail.name.split("/").pop() || detail.name,
		command, args, env, transport: transport as "stdio",
		origin: { source: "registry", registry_id: id, trust_tier: "community", timestamp: new Date().toISOString() },
		tools: detail.tools.map((t) => ({ name: t, description: "" })),
	}));
});

registry.command("backends").action(() => {
	for (const b of listBackends()) console.log(`${b.name}  ${b.baseUrl}`);
});

registry.command("cache-clear").action(() => {
	const count = clearCache();
	console.log(`Cleared ${count} cached entries.`);
});

// --- Doctor ---

program.command("doctor")
	.option("--json", "Output structured JSON")
	.option("--show <section>", "Filter to a named section (e.g., descriptions-refreshed)")
	.action((opts) => {
		const config = loadConfig();
		// Section view: descriptions-refreshed prints the full before/after table.
		if (opts.show === "descriptions-refreshed") {
			const { findStaleDescriptionHashes } = require("../doctor.js") as typeof import("../doctor.js");
			const stale = findStaleDescriptionHashes(config);
			if (stale.length === 0) {
				console.log("All description hashes are up to date.");
				return;
			}
			console.log(`Descriptions refreshed (${stale.length}):`);
			for (const entry of stale) {
				console.log(`  ${entry.type} '${entry.name}'`);
				console.log(`    stored hash:  ${entry.storedHash || "(none)"}`);
				console.log(`    current hash: ${entry.currentHash}`);
				console.log(`    description:  ${entry.description.slice(0, 80)}${entry.description.length > 80 ? "…" : ""}`);
			}
			return;
		}

		const result = runDoctor(config);
		const checks = opts.show ? result.checks.filter((c) => c.id === opts.show) : result.checks;
		if (opts.json) {
			console.log(JSON.stringify({ ...result, checks }, null, 2));
			return;
		}
		for (const c of checks) {
			const icon = c.severity === "error" ? "✗" : c.severity === "warning" ? "⚠" : "ℹ";
			console.log(`${icon} ${c.message}`);
			if (c.fix) console.log(`  Fix: ${c.fix.command}`);
		}
		if (!opts.show) {
			console.log(`\nHealth: ${result.earnedPoints}/${result.totalPoints} (${result.scorePercent}%)`);
			console.log(`${result.errors} errors, ${result.warnings} warnings, ${result.infos} info`);
		}
	});

// --- Discover ---

const discoverCmd = program
	.command("discover")
	.description("Scan Claude Code directories for unregistered skills and plugins")
	.option("--skills", "Skills only")
	.option("--plugins", "Plugins only")
	.option("--unregistered", "Only items not yet in ensemble")
	.option("--no-projects", "Skip per-project scanning")
	.option("--json", "Machine-readable output")
	.action((opts) => {
		const report = discover(loadConfig(), { includeProjects: opts.projects !== false });

		let skills = report.skills;
		let plugins = report.plugins;
		if (opts.unregistered) {
			skills = skills.filter((s) => !s.registered);
			plugins = plugins.filter((p) => !p.registered);
		}
		if (opts.plugins && !opts.skills) skills = [];
		if (opts.skills && !opts.plugins) plugins = [];

		if (opts.json) {
			console.log(JSON.stringify({ ...report, skills, plugins }, null, 2));
			return;
		}

		if (skills.length === 0 && plugins.length === 0) {
			console.log("Nothing discovered.");
			console.log(`Scanned ${report.scannedPaths.length} path(s), ${report.projectsScanned} project(s).`);
			return;
		}

		if (skills.length > 0) {
			console.log(`Skills (${skills.length}):`);
			for (const s of skills) {
				const mark = s.registered ? "✓" : "+";
				const loc = s.source === "user" ? "~/.claude" : s.projectPath ?? "project";
				console.log(`  ${mark} ${s.name}  [${loc}]`);
				if (s.skill.description) console.log(`      ${s.skill.description.slice(0, 80)}`);
			}
		}

		if (plugins.length > 0) {
			if (skills.length > 0) console.log("");
			console.log(`Plugins (${plugins.length}):`);
			for (const p of plugins) {
				const mark = p.registered ? "✓" : "+";
				const where = p.projectPaths.length > 0 ? ` (${p.projectPaths.length} project${p.projectPaths.length === 1 ? "" : "s"})` : "";
				console.log(`  ${mark} ${p.id}  ${p.version}  [${p.scope}]${where}`);
			}
		}

		const unregSkills = skills.filter((s) => !s.registered).length;
		const unregPlugins = plugins.filter((p) => !p.registered).length;
		console.log(`\nScanned ${report.scannedPaths.length} path(s), ${report.projectsScanned} project(s).`);
		console.log(`✓ = already registered    + = unregistered`);
		if (unregSkills + unregPlugins > 0) {
			console.log(`\nRun 'ensemble discover import <name>' to import a specific item,`);
			console.log(`or 'ensemble discover import --all-skills' / '--all-plugins' to bulk import.`);
		}
	});

discoverCmd
	.command("import [name]")
	.description("Import a discovered skill or plugin into ensemble")
	.option("--all-skills", "Import all unregistered discovered skills")
	.option("--all-plugins", "Import all unregistered discovered plugins")
	.option("--link", "Symlink SKILL.md into ensemble store instead of copying (not yet implemented)")
	.action((name, opts) => {
		const config = loadConfig();
		const report = discover(config);
		const messages: string[] = [];
		let newConfig = config;

		const importSkill = (d: typeof report.skills[number]) => {
			if (d.registered) {
				messages.push(`∘ skill '${d.name}' already registered, skipping`);
				return;
			}
			const params = discoveredSkillToInstallParams(d);
			// Copy SKILL.md into ensemble's canonical store
			const destDir = pathJoin(ENSEMBLE_SKILLS_DIR, d.name);
			if (!fsExistsSync(destDir)) fsMkdirSync(destDir, { recursive: true });
			const destPath = pathJoin(destDir, "SKILL.md");
			if (!fsExistsSync(destPath)) copyFileSync(d.sourcePath, destPath);
			const { config: nextConfig, result } = installSkill(newConfig, { ...params, path: destPath });
			if (!result.ok) {
				messages.push(`✗ ${d.name}: ${result.error}`);
				return;
			}
			newConfig = nextConfig;
			messages.push(`+ imported skill '${d.name}' from ${d.source === "user" ? "~/.claude" : d.projectPath}`);
		};

		const importPlugin = (d: typeof report.plugins[number]) => {
			if (d.registered) {
				messages.push(`∘ plugin '${d.name}' already registered, skipping`);
				return;
			}
			const { config: nextConfig, result } = installPlugin(newConfig, d.name, d.marketplace || undefined);
			if (!result.ok) {
				messages.push(`✗ ${d.name}: ${result.error}`);
				return;
			}
			newConfig = nextConfig;
			messages.push(`+ imported plugin '${d.id}' (${d.scope})`);
		};

		if (opts.allSkills) {
			for (const s of report.skills) if (!s.registered) importSkill(s);
		}
		if (opts.allPlugins) {
			for (const p of report.plugins) if (!p.registered) importPlugin(p);
		}
		if (name) {
			const skill = report.skills.find((s) => s.name === name);
			const plugin = report.plugins.find((p) => p.name === name || p.id === name);
			if (skill) importSkill(skill);
			else if (plugin) importPlugin(plugin);
			else {
				console.error(`Error: '${name}' not found in discovery scan`);
				process.exit(1);
			}
		}
		if (!opts.allSkills && !opts.allPlugins && !name) {
			console.error("Error: specify <name>, --all-skills, or --all-plugins");
			process.exit(1);
		}

		for (const msg of messages) console.log(msg);
		saveConfig(newConfig);
	});

// --- Agents (v2.0.1 stopgap; full CLI verb rewrite is chunk 8) ---

const agentsCmd = program.command("agents").description("Manage canonical agents and fan-out to Claude Code");

agentsCmd.command("list").description("List agents in the canonical store").action(() => {
	const config = loadConfig();
	const agents = config.agents ?? [];
	if (agents.length === 0) { console.log("No agents."); return; }
	for (const a of agents) {
		const status = a.enabled ? "●" : "○";
		const tools = a.tools.length > 0 ? ` [${a.tools.join(", ")}]` : "";
		const model = a.model ? ` (${a.model})` : "";
		const primary = a.userNotes || a.description || "";
		console.log(`${status} ${a.name}${model}${tools}  ${primary}`);
	}
});

agentsCmd
	.command("add <path>")
	.description("Add an agent from a local .md file into the canonical store")
	.action((mdPath: string) => {
		if (!fsExistsSync(mdPath)) {
			console.error(`Error: file '${mdPath}' not found.`);
			process.exit(1);
		}
		const text = fsReadFileSync(mdPath, "utf-8");
		const fileName = pathBasename(mdPath).replace(/\.md$/, "");
		const { agent, body } = frontmatterToAgent(text, fileName);
		if (!agent.name) {
			console.error(`Error: could not derive agent name from '${mdPath}'.`);
			process.exit(1);
		}
		// Write the canonical copy first so `path` in config reflects reality.
		const canonicalPath = writeAgentMd(agent, body);
		const { config: newConfig, result } = installAgent(loadConfig(), {
			name: agent.name,
			description: agent.description,
			tools: agent.tools,
			...(agent.model ? { model: agent.model } : {}),
			path: canonicalPath,
		});
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		for (const msg of result.messages) console.log(msg);
		saveConfig(newConfig);
	});

agentsCmd.command("remove <name>").description("Remove an agent from the canonical store").action((name: string) => {
	const config = loadConfig();
	const { config: newConfig, result } = uninstallAgent(config, name);
	if (!result.ok) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}
	deleteAgentMd(name);
	for (const msg of result.messages) console.log(msg);
	saveConfig(newConfig);
});

agentsCmd
	.command("install <name>")
	.description("Install a canonical agent to Claude Code (global scope)")
	.action((name: string) => {
		const config = loadConfig();
		if (!(config.agents ?? []).some((a) => a.name === name)) {
			console.error(`Error: Agent '${name}' not found in canonical store. Run 'ensemble agents add <path>' first.`);
			process.exit(1);
		}
		const { config: enabled, result } = enableAgent(config, name);
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		const syncResult = syncAgents(enabled, "claude-code");
		for (const msg of result.messages) console.log(msg);
		for (const msg of syncResult.messages) console.log(msg);
		saveConfig(enabled);
	});

agentsCmd
	.command("uninstall <name>")
	.description("Uninstall an agent from Claude Code (keeps canonical copy)")
	.action((name: string) => {
		const config = loadConfig();
		if (!(config.agents ?? []).some((a) => a.name === name)) {
			console.error(`Error: Agent '${name}' not found in canonical store.`);
			process.exit(1);
		}
		const { config: disabled, result } = disableAgent(config, name);
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		const syncResult = syncAgents(disabled, "claude-code");
		for (const msg of result.messages) console.log(msg);
		for (const msg of syncResult.messages) console.log(msg);
		saveConfig(disabled);
	});

// --- Commands (v2.0.1 stopgap; full CLI verb rewrite is chunk 8) ---

const commandsCmd = program.command("commands").description("Manage canonical slash commands and fan-out to Claude Code");

commandsCmd.command("list").description("List commands in the canonical store").action(() => {
	const config = loadConfig();
	const cmds = config.commands ?? [];
	if (cmds.length === 0) { console.log("No commands."); return; }
	for (const c of cmds) {
		const status = c.enabled ? "●" : "○";
		const tools = c.allowedTools.length > 0 ? ` [${c.allowedTools.join(", ")}]` : "";
		const hint = c.argumentHint ? ` ${c.argumentHint}` : "";
		const primary = c.userNotes || c.description || "";
		console.log(`${status} /${c.name}${hint}${tools}  ${primary}`);
	}
});

commandsCmd
	.command("add <path>")
	.description("Add a slash command from a local .md file into the canonical store")
	.action((mdPath: string) => {
		if (!fsExistsSync(mdPath)) {
			console.error(`Error: file '${mdPath}' not found.`);
			process.exit(1);
		}
		const text = fsReadFileSync(mdPath, "utf-8");
		const fileName = pathBasename(mdPath).replace(/\.md$/, "");
		const { command, body } = frontmatterToCommand(text, fileName);
		if (!command.name) {
			console.error(`Error: could not derive command name from '${mdPath}'.`);
			process.exit(1);
		}
		const canonicalPath = writeCommandMd(command, body);
		const { config: newConfig, result } = installCommand(loadConfig(), {
			name: command.name,
			description: command.description,
			allowedTools: command.allowedTools,
			...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
			path: canonicalPath,
		});
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		for (const msg of result.messages) console.log(msg);
		saveConfig(newConfig);
	});

commandsCmd
	.command("remove <name>")
	.description("Remove a slash command from the canonical store")
	.action((name: string) => {
		const config = loadConfig();
		const { config: newConfig, result } = uninstallCommand(config, name);
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		deleteCommandMd(name);
		for (const msg of result.messages) console.log(msg);
		saveConfig(newConfig);
	});

commandsCmd
	.command("install <name>")
	.description("Install a canonical slash command to Claude Code (global scope)")
	.action((name: string) => {
		const config = loadConfig();
		if (!(config.commands ?? []).some((c) => c.name === name)) {
			console.error(`Error: Command '${name}' not found in canonical store. Run 'ensemble commands add <path>' first.`);
			process.exit(1);
		}
		const { config: enabled, result } = enableCommand(config, name);
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		const syncResult = syncCommands(enabled, "claude-code");
		for (const msg of result.messages) console.log(msg);
		for (const msg of syncResult.messages) console.log(msg);
		saveConfig(enabled);
	});

commandsCmd
	.command("uninstall <name>")
	.description("Uninstall a slash command from Claude Code (keeps canonical copy)")
	.action((name: string) => {
		const config = loadConfig();
		if (!(config.commands ?? []).some((c) => c.name === name)) {
			console.error(`Error: Command '${name}' not found in canonical store.`);
			process.exit(1);
		}
		const { config: disabled, result } = disableCommand(config, name);
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		const syncResult = syncCommands(disabled, "claude-code");
		for (const msg of result.messages) console.log(msg);
		for (const msg of syncResult.messages) console.log(msg);
		saveConfig(disabled);
	});

// --- Hook CRUD (v2.0.1 stopgap; full CLI verb rewrite is chunk 8) ---

const hookCmd = program.command("hook").description("Manage Ensemble-owned hooks");

hookCmd
	.command("add <name>")
	.description("Add a hook to the canonical store")
	.requiredOption("--event <event>", "One of: PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, PreCompact, Stop, Notification")
	.requiredOption("--matcher <matcher>", "Tool name or regex to match")
	.requiredOption("--command <command>", "Shell command to run")
	.option("--notes <text>", "Optional user-authored notes (never written to settings.json)")
	.action((name, opts) => {
		const { addHook } = require("../hooks.js") as typeof import("../hooks.js");
		const result = addHook({
			name,
			event: opts.event,
			matcher: opts.matcher,
			command: opts.command,
			userNotes: opts.notes,
		});
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		console.log(`Added hook '${name}' (${result.hook?.description}).`);
	});

hookCmd
	.command("remove <name>")
	.description("Remove a hook from the canonical store")
	.action((name) => {
		const { removeHook } = require("../hooks.js") as typeof import("../hooks.js");
		const result = removeHook(name);
		if (!result.ok) {
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
		console.log(`Removed hook '${name}'.`);
	});

hookCmd
	.command("list")
	.description("List every hook in the canonical store")
	.action(() => {
		const { listHooks } = require("../hooks.js") as typeof import("../hooks.js");
		const all = listHooks();
		if (all.length === 0) {
			console.log("No hooks registered.");
			return;
		}
		for (const h of all) {
			const notes = h.userNotes ? `  — ${h.userNotes}` : "";
			console.log(`${h.name}  ${h.description}  ${h.command}${notes}`);
		}
	});

// --- Rollback (v2.0.1 safe-apply stopgap; full CLI verb rewrite is chunk 8) ---

program
	.command("rollback")
	.description("Restore files captured by a previous sync snapshot")
	.option("--latest", "Restore the most recent snapshot")
	.option("--id <id>", "Restore a specific snapshot by id")
	.option("--list", "List available snapshots and exit")
	.action((opts) => {
		const snapshotsMod = require("../snapshots.js") as typeof import("../snapshots.js");
		const { rollback } = require("../operations.js") as typeof import("../operations.js");

		if (opts.list) {
			const all = snapshotsMod.list();
			if (all.length === 0) {
				console.log("No snapshots found.");
				return;
			}
			for (const s of all) {
				const ctx = s.syncContext ? ` — ${s.syncContext}` : "";
				console.log(`${s.id}  (${s.files.length} file${s.files.length === 1 ? "" : "s"})${ctx}`);
			}
			return;
		}

		if (!opts.latest && !opts.id) {
			console.error("Error: specify --latest or --id <id>");
			process.exit(1);
		}

		const config = loadConfig();
		const latestId = snapshotsMod.latest()?.id ?? null;
		const { result } = rollback(config, {
			snapshotId: opts.id,
			latestId: opts.latest ? latestId : undefined,
		});
		if (!result.ok || !result.snapshotId) {
			console.error(`Error: ${result.error || "No snapshot to restore"}`);
			process.exit(1);
		}
		const restoreResult = snapshotsMod.restore(result.snapshotId);
		for (const msg of result.messages) console.log(msg);
		console.log(`Restored ${restoreResult.restored.length} file(s), deleted ${restoreResult.deleted.length} new-file entr(ies).`);
		if (restoreResult.missing.length > 0) {
			console.log(`Warning: ${restoreResult.missing.length} file(s) had missing pre-write copies and were not restored.`);
		}
	});

// --- Init ---

program.command("init").description("Guided first-run setup").option("--auto", "Non-interactive mode").action((opts) => {
	if (opts.auto) {
		const { initAuto } = require("../init.js") as typeof import("../init.js");
		const result = initAuto();
		for (const msg of result.messages) console.log(msg);
		saveConfig(result.config);
		console.log("\nSetup complete. Run 'ensemble sync' after changes.");
	} else {
		// Interactive mode — for now, fall back to auto with a notice
		const { initAuto } = require("../init.js") as typeof import("../init.js");
		console.log("Running in auto mode (interactive prompts coming in a future release).\n");
		const result = initAuto();
		for (const msg of result.messages) console.log(msg);
		saveConfig(result.config);
		console.log("\nSetup complete. Run 'ensemble sync' after changes.");
	}
});

// --- Projects ---

program.command("projects").description("List registry projects").action(() => {
	const projects = listProjects("active");
	if (projects.length === 0) { console.log("No projects found (project registry may not be available)."); return; }
	const { isSetlistAvailable, getProjectCapabilities } = require("../setlist.js") as typeof import("../setlist.js");
	const hasSetlist = isSetlistAvailable();
	for (const p of projects) {
		let line = `${p.name} (${p.type}) ${p.paths[0] ?? ""}`;
		if (hasSetlist) {
			const caps = getProjectCapabilities(p.name);
			if (caps.length > 0) line += `  capabilities: ${caps.length}`;
		}
		console.log(line);
	}
});

// --- Reference ---

program.command("reference").description("Show full command reference").action(() => {
	program.outputHelp();
});

// --- Parse ---

program.parse();
