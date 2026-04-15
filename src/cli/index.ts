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
	saveProfile,
	activateProfile,
	listProfiles as listProfilesOp,
	showProfile,
	deleteProfile,
	setUserNotes,
	getUserNotes,
} from "../operations.js";
import { searchAll } from "../search.js";
import { searchRegistries, showRegistry, listBackends, clearCache, resolveInstallParams } from "../registry.js";
import { syncClient, syncAllClients, syncSkills, computeContextCost } from "../sync.js";
import { runDoctor } from "../doctor.js";
import { discover, discoveredSkillToInstallParams } from "../discover.js";
import { copyFileSync, existsSync as fsExistsSync, mkdirSync as fsMkdirSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { SKILLS_DIR as ENSEMBLE_SKILLS_DIR } from "../config.js";
import { listProjects } from "../projects.js";
import { qualifiedPluginName } from "../schemas.js";
import type { OpResult, OpReturn } from "../operations.js";
import type { MarketplaceSource } from "../schemas.js";

const program = new Command();

program
	.name("ensemble")
	.description("Central manager for MCP servers, skills, and plugins across AI clients")
	.version("1.0.7");

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
