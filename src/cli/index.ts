#!/usr/bin/env node

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
	removeServer,
	enableServer,
	disableServer,
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
	uninstallPlugin,
	enablePlugin,
	disablePlugin,
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
} from "../operations.js";
import { searchAll } from "../search.js";
import { searchRegistries, showRegistry, listBackends, clearCache, resolveInstallParams } from "../registry.js";
import { syncClient, syncAllClients, syncSkills } from "../sync.js";
import { runDoctor } from "../doctor.js";
import { listProjects } from "../projects.js";
import { qualifiedPluginName } from "../schemas.js";
import type { OpResult, OpReturn } from "../operations.js";
import type { MarketplaceSource } from "../schemas.js";

const program = new Command();

program
	.name("ensemble")
	.description("Central manager for MCP servers, skills, and plugins across AI clients")
	.version("1.0.0");

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
	.action(() => {
		const config = loadConfig();
		if (config.servers.length === 0) {
			console.log("No servers registered.");
			return;
		}
		for (const s of config.servers) {
			const status = s.enabled ? "●" : "○";
			const tier = s.origin.trust_tier !== "local" ? ` [${s.origin.trust_tier}]` : "";
			console.log(`${status} ${s.name}${tier}  ${s.command} ${s.args.join(" ")}`);
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

program.command("remove <name>").description("Remove a server").action((name) => {
	const config = loadConfig();
	const { config: newConfig, result } = removeServer(config, name);
	if (!result.ok) {
		// Check for orphaned entries in client configs
		const { findOrphanedInClients } = require("../clients.js") as typeof import("../clients.js");
		const orphans = findOrphanedInClients(name);
		if (orphans.length > 0) {
			console.error(`Error: Server '${name}' not found in ensemble registry, but exists as orphaned entry in: ${orphans.join(", ")}. Run 'ensemble import' to adopt it.`);
		} else {
			console.error(`Error: ${result.error}`);
		}
		process.exit(1);
	}
	for (const msg of result.messages) console.log(msg);
	saveConfig(newConfig);
});

program.command("enable <name>").description("Enable a server").action((name) => {
	handle(() => enableServer(loadConfig(), name));
});

program.command("disable <name>").description("Disable a server").action((name) => {
	handle(() => disableServer(loadConfig(), name));
});

program
	.command("show <name>")
	.description("Show server details")
	.action((name) => {
		const config = loadConfig();
		const server = config.servers.find((s) => s.name === name);
		if (!server) {
			console.error(`Server '${name}' not found.`);
			process.exit(1);
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

groups.command("export <name>").description("Export group as CC plugin").option("--output <dir>", "Output directory").action((name, opts) => {
	const { exportGroupAsPlugin } = require("../export.js") as typeof import("../export.js");
	const result = exportGroupAsPlugin(loadConfig(), name, opts.output);
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
	.action((clientId, opts) => {
		let config = loadConfig();
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

plugins.command("install <name>").option("--marketplace <name>").action((name, opts) => {
	const config = loadConfig();
	const { config: newConfig, result } = installPlugin(config, name, opts.marketplace);
	if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
	for (const msg of result.messages) console.log(msg);
	// Also write to CC settings
	if (result.plugin) {
		const settings = readCCSettings();
		const enabled = getEnabledPlugins(settings);
		enabled[qualifiedPluginName(result.plugin)] = true;
		settings["enabledPlugins"] = enabled;
		writeCCSettings(settings);
	}
	saveConfig(newConfig);
});

plugins.command("uninstall <name>").action((name) => {
	const config = loadConfig();
	const plugin = config.plugins.find((p) => p.name === name);
	const { config: newConfig, result } = uninstallPlugin(config, name);
	if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
	for (const msg of result.messages) console.log(msg);
	if (plugin) {
		const settings = readCCSettings();
		const enabled = getEnabledPlugins(settings);
		delete enabled[qualifiedPluginName(plugin)];
		settings["enabledPlugins"] = enabled;
		writeCCSettings(settings);
	}
	saveConfig(newConfig);
});

plugins.command("enable <name>").action((name) => {
	handle(() => enablePlugin(loadConfig(), name));
});
plugins.command("disable <name>").action((name) => {
	handle(() => disablePlugin(loadConfig(), name));
});
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

skills.command("list").action(() => {
	const config = loadConfig();
	if (config.skills.length === 0) { console.log("No skills."); return; }
	for (const s of config.skills) {
		const status = s.enabled ? "●" : "○";
		const tags = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
		console.log(`${status} ${s.name}${tags}  ${s.description}`);
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

program.command("search <query>").option("--limit <n>", "Max results", "20").action((query, opts) => {
	const results = searchAll(loadConfig(), query, parseInt(opts.limit));
	if (results.length === 0) { console.log("No results."); return; }
	for (const r of results) {
		const type = r.resultType === "server" ? "server" : "skill";
		const tools = r.matchedTools.length > 0 ? ` (${r.matchedTools.join(", ")})` : "";
		console.log(`${r.name} [${type}] score=${r.score.toFixed(2)} fields=[${r.matchedFields.join(",")}]${tools}`);
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

program.command("doctor").option("--json", "Output structured JSON").action((opts) => {
	const result = runDoctor(loadConfig());
	if (opts.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	for (const c of result.checks) {
		const icon = c.severity === "error" ? "✗" : c.severity === "warning" ? "⚠" : "ℹ";
		console.log(`${icon} ${c.message}`);
		if (c.fix) console.log(`  Fix: ${c.fix.command}`);
	}
	console.log(`\nHealth: ${result.earnedPoints}/${result.totalPoints} (${result.scorePercent}%)`);
	console.log(`${result.errors} errors, ${result.warnings} warnings, ${result.infos} info`);
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

// --- Migration ---

program.command("migrate").description("Migrate from mcpoyle to Ensemble").option("--dry-run", "Preview migration without making changes").action((opts) => {
	const { migrate, needsMigration } = require("../migration.js") as typeof import("../migration.js");
	if (!needsMigration() && !opts.dryRun) {
		console.log("No mcpoyle installation found — nothing to migrate.");
		return;
	}
	const result = migrate(opts.dryRun);
	for (const msg of result.messages) console.log(msg);
	if (opts.dryRun && result.actions.length > 0) {
		console.log(`\nWould perform ${result.actions.length} migration action(s). Run without --dry-run to apply.`);
	}
});

// --- Projects ---

program.command("projects").description("List registry projects").action(() => {
	const projects = listProjects("active");
	if (projects.length === 0) { console.log("No projects found (project registry may not be available)."); return; }
	for (const p of projects) {
		console.log(`${p.name} (${p.type}) ${p.paths[0] ?? ""}`);
	}
});

// --- Reference ---

program.command("reference").description("Show full command reference").action(() => {
	program.outputHelp();
});

// --- Parse ---

program.parse();
