// @fctry: #migration

/**
 * One-shot v1.3 -> v2.0.1 translator.
 *
 * Transitional subsystem: runs once on the user's machine via
 * `ensemble import-legacy`, then gets deleted in a follow-up commit.
 *
 * Inputs:
 *   - the current v1.3-shaped `~/.config/ensemble/config.json`
 *   - a live filesystem scan of every detected client's on-disk config
 *     (reused from clients.ts + discover.ts — we do not reimplement
 *     detection policy here)
 *
 * Outputs:
 *   - a rewritten `~/.config/ensemble/config.json` in v2.0.1 shape
 *     (library entries + installState matrix reconstructed from disk)
 *   - a backup at `~/.config/ensemble/config.json.v1.3.bak`
 *   - a human-readable stdout summary
 *
 * Ambiguity handling: when the disk scan finds something the registry
 * doesn't know about, or vice versa, the resource lands in the library
 * with an empty install matrix. Nothing is silently dropped.
 */

import { copyFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { detectClients, readClientConfig, resolvedPaths } from "./clients.js";
import type { ClientDef } from "./clients.js";
import { CONFIG_PATH, loadConfig, saveConfig } from "./config.js";
import { discover } from "./discover.js";
import { EnsembleConfigSchema, qualifiedPluginName } from "./schemas.js";
import type { EnsembleConfig, InstallClientRecord } from "./schemas.js";

// --- Summary shape ---

export interface ImportLegacySummary {
	/** How many library entries exist after translation (per type). */
	library: {
		servers: number;
		plugins: number;
		skills: number;
		agents: number;
		commands: number;
		hooks: number;
		settings: number;
	};
	/** Client ids the translator scanned. */
	clientsScanned: string[];
	/** Resources added to the library via disk scan that were not present in the v1.3 registry. */
	discoveredFromDisk: {
		servers: Array<{ name: string; client: string; project?: string }>;
		plugins: Array<{ id: string; scope: "user" | "project" | "local"; projectPaths: string[] }>;
		skills: Array<{ name: string; source: "user" | "project"; projectPath?: string }>;
	};
	/** Resources listed in the v1.3 registry that the disk scan could not find. */
	registryOnly: {
		servers: string[];
		plugins: string[];
		skills: string[];
	};
	/** Backup path written (empty string when --dry-run). */
	backupPath: string;
	/** Absolute config path that would be written (or was written). */
	configPath: string;
	/** True when --dry-run: nothing was written. */
	dryRun: boolean;
}

// --- Pure translator core ---

export interface ClientSnapshot {
	clientId: string;
	/** managed servers from this client's config, by server name. */
	managedServers: Set<string>;
	/** project-scope managed servers, by project path -> set of server names. */
	projectManagedServers: Map<string, Set<string>>;
	/** user-scope plugin qualified names (name@marketplace). */
	userPlugins: Map<string, boolean>;
	/** project-scope plugins: projectPath -> qname -> enabled. */
	projectPlugins: Map<string, Map<string, boolean>>;
}

/**
 * Translate a v1.3 config plus per-client disk snapshots into a v2.0.1
 * config. Pure: no I/O, no side effects. Callers collect snapshots from
 * disk and then invoke this.
 */
export function translateConfig(
	v13: EnsembleConfig,
	snapshots: ClientSnapshot[],
	discoveredSkills: Array<{ name: string; source: "user" | "project"; projectPath?: string; registered: boolean }>,
	discoveredPlugins: Array<{
		id: string;
		name: string;
		marketplace: string;
		scope: "user" | "project" | "local";
		projectPaths: string[];
		registered: boolean;
	}>,
): { next: EnsembleConfig; summary: Omit<ImportLegacySummary, "backupPath" | "configPath" | "dryRun"> } {
	// Parse through the schema once so installState defaults are filled in
	// on every v1.3-shape entry.
	const base: EnsembleConfig = EnsembleConfigSchema.parse(v13);

	// --- Servers ---
	// Start from the registry and overlay disk findings.
	const servers = base.servers.map((s) => ({ ...s, installState: { ...s.installState } }));
	const serverByName = new Map(servers.map((s) => [s.name, s]));

	for (const snap of snapshots) {
		// user-scope: anything the ensemble marker identifies on this client
		for (const name of snap.managedServers) {
			let server = serverByName.get(name);
			if (!server) {
				// Disk has this server; v1.3 registry doesn't. Add to library and
				// mark it installed on the client where it was found — the disk
				// state is the ground truth for a discovered-from-disk resource.
				server = EnsembleConfigSchema.parse({
					servers: [{ name, origin: { source: "import", client: snap.clientId, timestamp: new Date().toISOString() } }],
				}).servers[0]!;
				servers.push(server);
				serverByName.set(name, server);
			}
			const current = server.installState[snap.clientId] ?? { installed: false, projects: [] };
			server.installState[snap.clientId] = { installed: true, projects: current.projects };
		}
		// project-scope
		for (const [projPath, names] of snap.projectManagedServers) {
			for (const name of names) {
				let server = serverByName.get(name);
				if (!server) {
					server = EnsembleConfigSchema.parse({
						servers: [{ name, origin: { source: "import", client: `${snap.clientId}:${projPath}`, timestamp: new Date().toISOString() } }],
					}).servers[0]!;
					servers.push(server);
					serverByName.set(name, server);
				}
				const current = server.installState[snap.clientId] ?? { installed: false, projects: [] };
				if (!current.projects.includes(projPath)) {
					current.projects.push(projPath);
				}
				server.installState[snap.clientId] = current;
			}
		}
	}

	// --- Plugins ---
	const plugins = base.plugins.map((p) => ({ ...p, installState: { ...p.installState } }));
	const pluginByQName = new Map(plugins.map((p) => [qualifiedPluginName(p), p]));
	const pluginByName = new Map(plugins.map((p) => [p.name, p]));

	for (const d of discoveredPlugins) {
		let plugin = pluginByQName.get(d.id) ?? pluginByName.get(d.name);
		if (!plugin) {
			// Disk-only plugin. Add to library with empty install state.
			plugin = EnsembleConfigSchema.parse({
				plugins: [{ name: d.name, marketplace: d.marketplace }],
			}).plugins[0]!;
			plugins.push(plugin);
			pluginByQName.set(d.id, plugin);
			pluginByName.set(d.name, plugin);
		}
		// Plugins live only under claude-code today (installed_plugins.json is CC-specific).
		const record: InstallClientRecord =
			plugin.installState["claude-code"] ?? { installed: false, projects: [] };
		if (d.scope === "user") record.installed = true;
		for (const p of d.projectPaths) {
			if (!record.projects.includes(p)) record.projects.push(p);
		}
		plugin.installState["claude-code"] = record;
	}

	// --- Skills ---
	const skills = base.skills.map((s) => ({ ...s, installState: { ...s.installState } }));
	const skillByName = new Map(skills.map((s) => [s.name, s]));

	for (const d of discoveredSkills) {
		let skill = skillByName.get(d.name);
		if (!skill) {
			skill = EnsembleConfigSchema.parse({
				skills: [{ name: d.name, origin: d.source === "user" ? "discovered:~/.claude" : `discovered:${d.projectPath}` }],
			}).skills[0]!;
			skills.push(skill);
			skillByName.set(d.name, skill);
		}
		// Skills surfaced via discover() live under Claude Code today; project-scope
		// lands in the project list.
		const record: InstallClientRecord =
			skill.installState["claude-code"] ?? { installed: false, projects: [] };
		if (d.source === "user") record.installed = true;
		if (d.source === "project" && d.projectPath && !record.projects.includes(d.projectPath)) {
			record.projects.push(d.projectPath);
		}
		skill.installState["claude-code"] = record;
	}

	// --- Agents / Commands / Hooks / Settings ---
	// These didn't exist in v1.3; everything already in base carries empty
	// installState defaults, which is correct (library-first, not installed).

	// Migration invariant: after translation, the install matrix is the source
	// of truth. Any resource that ended up with an empty matrix is library-only,
	// not installed — so flip its legacy `enabled` flag to false so the
	// read-path fallback (isActiveForClient) agrees with the v2.0.1 semantics.
	// This keeps pre-registry-only resources from phantom-activating on
	// untouched clients via the backward-compat path.
	const harmonisedServers = servers.map((s) =>
		Object.keys(s.installState).length === 0 ? { ...s, enabled: false } : s,
	);
	const harmonisedPlugins = plugins.map((p) =>
		Object.keys(p.installState).length === 0 ? { ...p, enabled: false } : p,
	);
	const harmonisedSkills = skills.map((s) =>
		Object.keys(s.installState).length === 0 ? { ...s, enabled: false } : s,
	);

	const next: EnsembleConfig = {
		...base,
		servers: harmonisedServers,
		plugins: harmonisedPlugins,
		skills: harmonisedSkills,
	};

	// --- Summary ---
	const discoveredFromDisk: ImportLegacySummary["discoveredFromDisk"] = {
		servers: [],
		plugins: [],
		skills: [],
	};
	for (const snap of snapshots) {
		for (const name of snap.managedServers) {
			if (!base.servers.some((s) => s.name === name)) {
				discoveredFromDisk.servers.push({ name, client: snap.clientId });
			}
		}
		for (const [projPath, names] of snap.projectManagedServers) {
			for (const name of names) {
				if (!base.servers.some((s) => s.name === name)) {
					discoveredFromDisk.servers.push({ name, client: snap.clientId, project: projPath });
				}
			}
		}
	}
	for (const d of discoveredPlugins) {
		if (!base.plugins.some((p) => p.name === d.name)) {
			discoveredFromDisk.plugins.push({ id: d.id, scope: d.scope, projectPaths: d.projectPaths });
		}
	}
	for (const d of discoveredSkills) {
		if (!base.skills.some((s) => s.name === d.name)) {
			discoveredFromDisk.skills.push({
				name: d.name,
				source: d.source,
				...(d.projectPath ? { projectPath: d.projectPath } : {}),
			});
		}
	}

	// Registry-only: things the v1.3 registry lists but disk doesn't.
	const seenServerNames = new Set<string>();
	for (const snap of snapshots) {
		for (const n of snap.managedServers) seenServerNames.add(n);
		for (const [, names] of snap.projectManagedServers) for (const n of names) seenServerNames.add(n);
	}
	const seenPluginIds = new Set<string>();
	for (const d of discoveredPlugins) {
		seenPluginIds.add(d.name);
		seenPluginIds.add(d.id);
	}
	const seenSkillNames = new Set(discoveredSkills.map((d) => d.name));

	const registryOnly: ImportLegacySummary["registryOnly"] = {
		servers: base.servers.map((s) => s.name).filter((n) => !seenServerNames.has(n)),
		plugins: base.plugins.map((p) => p.name).filter((n) => !seenPluginIds.has(n)),
		skills: base.skills.map((s) => s.name).filter((n) => !seenSkillNames.has(n)),
	};

	const summary = {
		library: {
			servers: next.servers.length,
			plugins: next.plugins.length,
			skills: next.skills.length,
			agents: (next.agents ?? []).length,
			commands: (next.commands ?? []).length,
			hooks: (next as EnsembleConfig & { hooks?: unknown[] }).hooks?.length ?? 0,
			settings: (next as EnsembleConfig & { managedSettings?: unknown[] }).managedSettings?.length ?? 0,
		},
		clientsScanned: snapshots.map((s) => s.clientId),
		discoveredFromDisk,
		registryOnly,
	};

	return { next, summary };
}

// --- I/O wrappers ---

/**
 * Read a client's on-disk configuration and produce a ClientSnapshot listing
 * the ensemble-managed servers (user and per-project). Unmanaged entries are
 * intentionally ignored — they aren't ours to attribute.
 */
export function snapshotClient(clientDef: ClientDef): ClientSnapshot {
	const managed = new Set<string>();
	const projectManaged = new Map<string, Set<string>>();
	const userPlugins = new Map<string, boolean>();
	const projectPlugins = new Map<string, Map<string, boolean>>();

	for (const path of resolvedPaths(clientDef)) {
		if (!existsSync(path)) continue;
		const raw = readClientConfig(path);
		const serversBlock = getNested(raw, clientDef.serversKey);
		if (serversBlock && typeof serversBlock === "object") {
			for (const [name, entry] of Object.entries(serversBlock as Record<string, unknown>)) {
				if (isManagedEntry(entry)) managed.add(name);
			}
		}
		// Claude Code — project-scope servers + plugins
		if (clientDef.id === "claude-code") {
			const projects = (raw as Record<string, unknown>)["projects"];
			if (projects && typeof projects === "object") {
				for (const [projPath, projData] of Object.entries(projects as Record<string, unknown>)) {
					if (!projData || typeof projData !== "object") continue;
					const servers = (projData as Record<string, unknown>)["mcpServers"];
					if (servers && typeof servers === "object") {
						const names = projectManaged.get(projPath) ?? new Set<string>();
						for (const [sname, entry] of Object.entries(servers as Record<string, unknown>)) {
							if (isManagedEntry(entry)) names.add(sname);
						}
						if (names.size > 0) projectManaged.set(projPath, names);
					}
				}
			}
		}
	}

	return {
		clientId: clientDef.id,
		managedServers: managed,
		projectManagedServers: projectManaged,
		userPlugins,
		projectPlugins,
	};
}

function getNested(obj: unknown, key: string): unknown {
	const parts = key.split(".");
	let cur: unknown = obj;
	for (const p of parts) {
		if (!cur || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

function isManagedEntry(entry: unknown): boolean {
	if (!entry || typeof entry !== "object") return false;
	const e = entry as Record<string, unknown>;
	return e["__ensemble"] === true || e["__mcpoyle"] === true;
}

// --- Public entrypoint ---

export interface RunOptions {
	dryRun?: boolean;
	configPath?: string;
	clients?: ClientDef[];
}

/**
 * Run the full import. Reads ~/.config/ensemble/config.json, snapshots
 * every detected client, and either writes the rewritten config + backup
 * or produces a dry-run preview.
 */
export function runImportLegacy(opts: RunOptions = {}): ImportLegacySummary {
	const configPath = opts.configPath ?? CONFIG_PATH;
	const dryRun = opts.dryRun ?? false;

	const v13 = loadConfig(configPath);
	const clients = opts.clients ?? detectClients();
	const snapshots = clients.map((c) => snapshotClient(c));

	const report = discover(v13, { includeProjects: true });
	const discoveredSkills = report.skills.map((s) => ({
		name: s.name,
		source: s.source,
		projectPath: s.projectPath,
		registered: s.registered,
	}));
	const discoveredPlugins = report.plugins.map((p) => ({
		id: p.id,
		name: p.name,
		marketplace: p.marketplace,
		scope: p.scope,
		projectPaths: p.projectPaths,
		registered: p.registered,
	}));

	const { next, summary } = translateConfig(v13, snapshots, discoveredSkills, discoveredPlugins);

	let backupPath = "";
	if (!dryRun) {
		backupPath = `${configPath}.v1.3.bak`;
		if (existsSync(configPath) && !existsSync(backupPath)) {
			copyFileSync(configPath, backupPath);
		}
		saveConfig(next, configPath);
	}

	return {
		...summary,
		backupPath,
		configPath: resolvePath(configPath),
		dryRun,
	};
}

/** Render the summary as a concise plain-English report to stdout. */
export function formatSummary(s: ImportLegacySummary): string {
	const lines: string[] = [];
	const lib = s.library;
	const total = lib.servers + lib.plugins + lib.skills + lib.agents + lib.commands + lib.hooks + lib.settings;
	if (s.dryRun) {
		lines.push("Import preview (no files written):");
	} else {
		lines.push("Import complete.");
	}
	lines.push(
		`  Library contains ${total} resource${total === 1 ? "" : "s"}: ` +
			`${lib.servers} server${lib.servers === 1 ? "" : "s"}, ` +
			`${lib.plugins} plugin${lib.plugins === 1 ? "" : "s"}, ` +
			`${lib.skills} skill${lib.skills === 1 ? "" : "s"}.`,
	);
	if (s.clientsScanned.length > 0) {
		lines.push(`  Install state reconstructed from ${s.clientsScanned.length} client${s.clientsScanned.length === 1 ? "" : "s"}: ${s.clientsScanned.join(", ")}.`);
	} else {
		lines.push("  No installed clients detected — library is unchanged.");
	}
	const discoveredTotal =
		s.discoveredFromDisk.servers.length +
		s.discoveredFromDisk.plugins.length +
		s.discoveredFromDisk.skills.length;
	if (discoveredTotal > 0) {
		lines.push(`  Found ${discoveredTotal} resource${discoveredTotal === 1 ? "" : "s"} on disk that weren't in the registry — added to library, not installed.`);
	}
	const regOnlyTotal =
		s.registryOnly.servers.length + s.registryOnly.plugins.length + s.registryOnly.skills.length;
	if (regOnlyTotal > 0) {
		lines.push(`  ${regOnlyTotal} registry resource${regOnlyTotal === 1 ? "" : "s"} had no matching files on disk — kept in library, install matrix left empty.`);
	}
	if (!s.dryRun) {
		lines.push(`  Backup: ${s.backupPath}`);
		lines.push(`  Rewrote: ${s.configPath}`);
	}
	return lines.join("\n");
}
