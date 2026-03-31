/**
 * Sync engine — resolve servers/skills/plugins per client, write configs.
 *
 * Dual strategy: config-entry writes for servers, symlink fan-out for skills.
 * Drift detection via SHA-256 content hashes.
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	CLIENTS,
	expandPath,
	getEnabledPlugins,
	getExtraMarketplaces,
	getManagedServers,
	getManagedServersNested,
	type ImportedServer,
	importServersFromClient,
	projectServersKey,
	readCCSettings,
	readClientConfig,
	resolvedPaths,
	serverToClientEntry,
	writeClientConfig,
	writeCCSettings,
	writeServersNested,
} from "./clients.js";
import { computeEntryHash, getClient, matchRule, resolvePlugins, resolveServers, resolveSkills } from "./config.js";
import { RESERVED_MARKETPLACE_NAMES, qualifiedPluginName } from "./schemas.js";
import type { EnsembleConfig, Server } from "./schemas.js";
import { skillDir as getSkillDir } from "./skills.js";

// --- Types ---

export interface DriftInfo {
	name: string;
	currentHash: string;
	storedHash: string;
}

export interface SyncAction {
	type: "add" | "remove" | "update" | "skip-drift";
	name: string;
	detail?: string;
}

export interface SyncResult {
	clientId: string;
	clientName: string;
	actions: SyncAction[];
	messages: string[];
	hasChanges: boolean;
	drifted: DriftInfo[];
	newHashes: Record<string, string>;
}

export interface SkillSyncAction {
	type: "symlink" | "remove" | "skip";
	skillName: string;
	targetPath: string;
	detail?: string;
}

export interface SkillSyncResult {
	clientId: string;
	actions: SkillSyncAction[];
	messages: string[];
}

// --- Drift detection ---

function detectDrift(
	managed: Record<string, Record<string, unknown>>,
	storedHashes: Record<string, string>,
): DriftInfo[] {
	const drifted: DriftInfo[] = [];
	for (const [name, entry] of Object.entries(managed)) {
		const stored = storedHashes[name];
		if (stored) {
			const current = computeEntryHash(entry);
			if (current !== stored) {
				drifted.push({ name, currentHash: current, storedHash: stored });
			}
		}
	}
	return drifted;
}

// --- Server sync ---

export function syncClient(
	config: EnsembleConfig,
	clientId: string,
	options?: {
		dryRun?: boolean;
		force?: boolean;
		adopt?: boolean;
		projectPath?: string;
	},
): { config: EnsembleConfig; result: SyncResult } {
	const clientDef = CLIENTS[clientId];
	if (!clientDef) {
		return {
			config,
			result: {
				clientId,
				clientName: clientId,
				actions: [],
				messages: [`Unknown client: ${clientId}`],
				hasChanges: false,
				drifted: [],
				newHashes: {},
			},
		};
	}

	const dryRun = options?.dryRun ?? false;
	const force = options?.force ?? false;
	const adopt = options?.adopt ?? false;

	// Resolve what servers this client should get
	const assignment = getClient(config, clientId);
	const servers = resolveServers(config, clientId);
	const newEntries: Record<string, Record<string, unknown>> = {};
	for (const s of servers) {
		newEntries[s.name] = serverToClientEntry(s);
	}

	const storedHashes = assignment?.server_hashes ?? {};
	const paths = resolvedPaths(clientDef);
	if (paths.length === 0) {
		return {
			config,
			result: {
				clientId,
				clientName: clientDef.name,
				actions: [],
				messages: [`${clientDef.name}: no config files found`],
				hasChanges: false,
				drifted: [],
				newHashes: {},
			},
		};
	}

	const allActions: SyncAction[] = [];
	const allDrifted: DriftInfo[] = [];
	const newHashes: Record<string, string> = {};

	for (const path of paths) {
		const existing = readClientConfig(path);
		const managed = getManagedServers(existing, clientDef.serversKey);
		const drifted = detectDrift(managed, storedHashes);
		allDrifted.push(...drifted);
		const driftedNames = new Set(drifted.map((d) => d.name));

		const toAdd = Object.keys(newEntries).filter((k) => !(k in managed));
		const toRemove = Object.keys(managed).filter((k) => !(k in newEntries));
		const toUpdate = Object.keys(newEntries).filter((k) => {
			if (!(k in managed)) return false;
			return computeEntryHash(newEntries[k]!) !== computeEntryHash(managed[k]!);
		});

		// Handle drift
		const skipped = new Set<string>();
		for (const d of drifted) {
			if (toUpdate.includes(d.name)) {
				if (!force && !adopt) {
					toUpdate.splice(toUpdate.indexOf(d.name), 1);
					skipped.add(d.name);
				} else if (adopt) {
					toUpdate.splice(toUpdate.indexOf(d.name), 1);
				}
			}
		}

		for (const name of skipped) {
			allActions.push({ type: "skip-drift", name, detail: "modified outside ensemble" });
		}
		for (const name of toAdd) allActions.push({ type: "add", name });
		for (const name of toRemove) allActions.push({ type: "remove", name });
		for (const name of toUpdate) {
			allActions.push({
				type: "update",
				name,
				detail: driftedNames.has(name) && force ? "overwriting manual edit" : undefined,
			});
		}

		if (!dryRun && (toAdd.length > 0 || toRemove.length > 0 || toUpdate.length > 0)) {
			writeClientConfig(path, clientDef.serversKey, newEntries);
		}
	}

	// Compute new hashes for stored state
	for (const [name, entry] of Object.entries(newEntries)) {
		newHashes[name] = computeEntryHash(entry);
	}

	const hasChanges = allActions.some((a) => a.type !== "skip-drift");
	const messages: string[] = [];
	if (!hasChanges && allActions.length === 0) {
		messages.push(`${clientDef.name}: already in sync`);
	} else if (dryRun) {
		messages.push(`${clientDef.name}: would sync`);
	} else {
		messages.push(`${clientDef.name}: synced`);
	}

	// Handle adopt: update config's server data from manual edits
	if (adopt && allDrifted.length > 0 && !dryRun) {
		for (const d of allDrifted) {
			for (const path of paths) {
				const existing = readClientConfig(path);
				const managed = getManagedServers(existing, clientDef.serversKey);
				if (d.name in managed) {
					const entry = managed[d.name]!;
					// Update config server from manual edit
					const serverIdx = config.servers.findIndex((s) => s.name === d.name);
					if (serverIdx >= 0) {
						const s = config.servers[serverIdx]!;
						config = {
							...config,
							servers: config.servers.map((srv, i) =>
								i === serverIdx
									? {
											...srv,
											command: (entry["command"] as string) ?? s.command,
											args: (entry["args"] as string[]) ?? s.args,
											env: (entry["env"] as Record<string, string>) ?? s.env,
											transport: ((entry["transport"] as string) ?? s.transport) as Server["transport"],
											url: (entry["url"] as string) ?? s.url,
										}
									: srv,
							),
						};
					}
				}
			}
		}
	}

	// Sync project-level configs and plugins for Claude Code
	if (clientId === "claude-code") {
		const ccAssignment = getClient(config, clientId);
		if (ccAssignment) {
			// Sync explicitly assigned projects
			for (const [projPath, projData] of Object.entries(ccAssignment.projects)) {
				if (projData.group) {
					const projActions = syncProject(config, projPath, projData.group, dryRun);
					allActions.push(...projActions.map((msg) => ({ type: "add" as const, name: msg, detail: "project" })));
				}
			}

			// Apply path rules to discover new projects
			if (config.rules.length > 0) {
				const ruleResult = applyPathRules(config, clientId, dryRun);
				config = ruleResult.config;
				allActions.push(...ruleResult.actions.map((msg) => ({ type: "add" as const, name: msg, detail: "path-rule" })));
			}
		}

		// Sync plugins and marketplaces to CC settings
		const pluginActions = syncCCPlugins(config, clientId, dryRun);
		allActions.push(...pluginActions.map((msg) => ({ type: "add" as const, name: msg, detail: "plugin" })));
	}

	// Update config with new hashes and timestamp
	let newConfig = config;
	if (!dryRun && hasChanges) {
		const now = new Date().toISOString();
		if (assignment) {
			newConfig = {
				...config,
				clients: config.clients.map((c) =>
					c.id === clientId ? { ...c, last_synced: now, server_hashes: newHashes } : c,
				),
			};
		}
	}

	return {
		config: newConfig,
		result: {
			clientId,
			clientName: clientDef.name,
			actions: allActions,
			messages,
			hasChanges,
			drifted: allDrifted,
			newHashes,
		},
	};
}

// --- Project-level sync ---

function syncProject(
	config: EnsembleConfig,
	projectPath: string,
	groupName: string,
	dryRun: boolean,
): string[] {
	const servers = resolveServers(config, "claude-code", groupName);
	const newEntries: Record<string, Record<string, unknown>> = {};
	for (const s of servers) {
		newEntries[s.name] = serverToClientEntry(s);
	}

	const clientDef = CLIENTS["claude-code"]!;
	const paths = resolvedPaths(clientDef);
	if (paths.length === 0) return [];

	const absPath = resolve(expandPath(projectPath));
	const keyPath = projectServersKey(absPath);
	const existing = readClientConfig(paths[0]!);
	const managed = getManagedServersNested(existing, keyPath);
	const messages: string[] = [];

	const toAdd = Object.keys(newEntries).filter((k) => !(k in managed));
	const toRemove = Object.keys(managed).filter((k) => !(k in newEntries));

	if (toAdd.length === 0 && toRemove.length === 0) return [];

	if (dryRun) {
		messages.push(`Claude Code project (${absPath}): would sync`);
	} else {
		writeServersNested(paths[0]!, keyPath, newEntries);
		messages.push(`Claude Code project (${absPath}): synced`);
	}

	// Sync project-level plugins
	const plugins = resolvePlugins(config, "claude-code", groupName);
	if (plugins.length > 0) {
		const pluginMessages = syncProjectPlugins(plugins, absPath, dryRun);
		messages.push(...pluginMessages);
	}

	return messages;
}

function syncProjectPlugins(
	plugins: EnsembleConfig["plugins"],
	projectPath: string,
	dryRun: boolean,
): string[] {
	const messages: string[] = [];
	const newEnabled: Record<string, boolean> = {};
	for (const p of plugins) {
		newEnabled[qualifiedPluginName(p)] = p.enabled;
	}

	// Read project's .claude/settings.local.json
	const localPath = join(projectPath, ".claude", "settings.local.json");
	let localSettings: Record<string, unknown> = {};
	if (existsSync(localPath)) {
		try {
			localSettings = JSON.parse(readFileSync(localPath, "utf-8"));
		} catch {
			localSettings = {};
		}
	}

	const currentEnabled = (localSettings["enabledPlugins"] ?? {}) as Record<string, boolean>;
	let hasChanges = false;
	for (const [qname, state] of Object.entries(newEnabled)) {
		if (currentEnabled[qname] !== state) hasChanges = true;
	}

	if (!hasChanges) return [];

	if (dryRun) {
		messages.push(`  project plugins (${projectPath}): would sync to .claude/settings.local.json`);
	} else {
		// Workaround for CC bug #27247: ensure enabledPlugins key exists in settings.json
		const settingsPath = join(projectPath, ".claude", "settings.json");
		if (existsSync(settingsPath)) {
			try {
				const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
				if (!("enabledPlugins" in settings)) {
					settings["enabledPlugins"] = {};
					mkdirSync(dirname(settingsPath), { recursive: true });
					writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
				}
			} catch { /* non-fatal */ }
		}

		Object.assign(currentEnabled, newEnabled);
		localSettings["enabledPlugins"] = currentEnabled;
		mkdirSync(dirname(localPath), { recursive: true });
		writeFileSync(localPath, `${JSON.stringify(localSettings, null, 2)}\n`, "utf-8");
		messages.push(`  project plugins (${projectPath}): synced`);
	}

	return messages;
}

function applyPathRules(
	config: EnsembleConfig,
	clientId: string,
	dryRun: boolean,
): { config: EnsembleConfig; actions: string[] } {
	const actions: string[] = [];
	let newConfig = { ...config };
	const assignment = getClient(newConfig, clientId);
	if (!assignment) return { config: newConfig, actions };

	const explicitlyAssigned = new Set(Object.keys(assignment.projects));
	const clientDef = CLIENTS[clientId]!;
	const paths = resolvedPaths(clientDef);

	for (const configPath of paths) {
		const ccData = readClientConfig(configPath);
		const projects = ccData["projects"];
		if (typeof projects !== "object" || projects === null) continue;

		for (const projPath of Object.keys(projects as Record<string, unknown>)) {
			if (explicitlyAssigned.has(projPath)) continue;

			const rule = matchRule(newConfig, projPath);
			if (!rule) continue;

			// Auto-assign this project
			explicitlyAssigned.add(projPath);
			newConfig = {
				...newConfig,
				clients: newConfig.clients.map((c) =>
					c.id === clientId
						? { ...c, projects: { ...c.projects, [projPath]: { group: rule.group, last_synced: null } } }
						: c,
				),
			};

			const projActions = syncProject(newConfig, projPath, rule.group, dryRun);
			if (projActions.length > 0) {
				actions.push(`  (matched rule: ${rule.path} → ${rule.group})`);
				actions.push(...projActions);
			}
		}
	}

	return { config: newConfig, actions };
}

function syncCCPlugins(
	config: EnsembleConfig,
	clientId: string,
	dryRun: boolean,
): string[] {
	const actions: string[] = [];
	const settings = readCCSettings();

	// Sync plugins
	const plugins = resolvePlugins(config, clientId);
	const newEnabled: Record<string, boolean> = {};
	for (const p of plugins) {
		newEnabled[qualifiedPluginName(p)] = p.enabled;
	}
	const currentEnabled = getEnabledPlugins(settings);

	let pluginChanges = false;
	for (const [qname, state] of Object.entries(newEnabled)) {
		if (currentEnabled[qname] !== state) {
			pluginChanges = true;
		}
	}
	// Check for managed plugins that should be removed
	for (const qname of Object.keys(currentEnabled)) {
		const pname = qname.includes("@") ? qname.slice(0, qname.lastIndexOf("@")) : qname;
		const plugin = config.plugins.find((p) => p.name === pname);
		if (plugin?.managed && !(qname in newEnabled)) {
			pluginChanges = true;
		}
	}

	if (pluginChanges && !dryRun) {
		const managedNames = new Set(config.plugins.filter((p) => p.managed).map((p) => qualifiedPluginName(p)));
		for (const qname of Object.keys(currentEnabled)) {
			if (managedNames.has(qname) && !(qname in newEnabled)) {
				delete currentEnabled[qname];
			}
		}
		Object.assign(currentEnabled, newEnabled);
		settings["enabledPlugins"] = currentEnabled;
	}

	// Sync marketplaces
	const currentMkts = getExtraMarketplaces(settings);
	const newMkts: Record<string, unknown> = {};
	for (const m of config.marketplaces) {
		if (!RESERVED_MARKETPLACE_NAMES.has(m.name)) {
			const sourceDict: Record<string, string> = { source: m.source.source };
			if (m.source.repo) sourceDict["repo"] = m.source.repo;
			else if (m.source.path) sourceDict["path"] = m.source.path;
			newMkts[m.name] = { source: sourceDict };
		}
	}

	const mktChanges = JSON.stringify(newMkts) !== JSON.stringify(currentMkts);
	if (mktChanges && !dryRun) {
		settings["extraKnownMarketplaces"] = newMkts;
	}

	if ((pluginChanges || mktChanges) && !dryRun) {
		writeCCSettings(settings);
	}

	if (pluginChanges) {
		actions.push(dryRun ? "Claude Code plugins: would sync" : "Claude Code plugins: synced");
	}
	if (mktChanges) {
		actions.push(dryRun ? "Claude Code marketplaces: would sync" : "Claude Code marketplaces: synced");
	}

	return actions;
}

// --- Import ---

export interface ImportResult {
	servers: ImportedServer[];
	projectImports: { path: string; servers: ImportedServer[] }[];
}

export function doImport(
	config: EnsembleConfig,
	clientId: string,
): { config: EnsembleConfig; result: ImportResult } {
	const clientDef = CLIENTS[clientId];
	if (!clientDef) {
		return { config, result: { servers: [], projectImports: [] } };
	}

	let newConfig = { ...config };
	const imported: ImportedServer[] = [];

	for (const path of resolvedPaths(clientDef)) {
		const existing = readClientConfig(path);
		const servers = importServersFromClient(existing, clientDef.serversKey);
		for (const s of servers) {
			if (newConfig.servers.some((srv) => srv.name === s.name)) continue;
			const server: Server = {
				name: s.name,
				enabled: true,
				transport: (s.transport || "stdio") as Server["transport"],
				command: s.command,
				args: s.args,
				env: s.env,
				url: s.url,
				auth_type: (s.authType || "") as Server["auth_type"],
				auth_ref: s.authRef,
				origin: {
					source: "import",
					client: clientId,
					registry_id: "",
					timestamp: new Date().toISOString(),
					trust_tier: "local",
				},
				tools: [],
			};
			newConfig = { ...newConfig, servers: [...newConfig.servers, server] };
			imported.push(s);
		}
	}

	// Scan Claude Code project-level servers
	const projectImports: { path: string; servers: ImportedServer[] }[] = [];
	if (clientId === "claude-code") {
		for (const path of resolvedPaths(clientDef)) {
			const ccData = readClientConfig(path);
			const projects = ccData["projects"];
			if (typeof projects !== "object" || projects === null) continue;
			for (const [projPath, projData] of Object.entries(projects as Record<string, unknown>)) {
				if (typeof projData !== "object" || projData === null) continue;
				const serversDict = (projData as Record<string, unknown>)["mcpServers"];
				if (typeof serversDict !== "object" || serversDict === null) continue;
				const projServers: ImportedServer[] = [];
				for (const [name, entry] of Object.entries(serversDict as Record<string, unknown>)) {
					if (typeof entry !== "object" || entry === null) continue;
					const e = entry as Record<string, unknown>;
					if (e["__ensemble"] || e["__mcpoyle"]) continue;
					if (newConfig.servers.some((srv) => srv.name === name)) continue;
					const auth = (typeof e["auth"] === "object" && e["auth"] !== null ? e["auth"] : {}) as Record<string, string>;
					const imported: ImportedServer = {
						name,
						command: (e["command"] as string) ?? "",
						args: (e["args"] as string[]) ?? [],
						env: (e["env"] as Record<string, string>) ?? {},
						transport: (e["transport"] as string) ?? "stdio",
						url: (e["url"] as string) ?? "",
						authType: auth["type"] ?? "",
						authRef: auth["ref"] ?? "",
					};
					const server: Server = {
						name,
						enabled: true,
						transport: (imported.transport || "stdio") as Server["transport"],
						command: imported.command,
						args: imported.args,
						env: imported.env,
						url: imported.url,
						auth_type: (imported.authType || "") as Server["auth_type"],
						auth_ref: imported.authRef,
						origin: { source: "import", client: `${clientId}:${projPath}`, registry_id: "", timestamp: new Date().toISOString(), trust_tier: "local" },
						tools: [],
					};
					newConfig = { ...newConfig, servers: [...newConfig.servers, server] };
					projServers.push(imported);
				}
				if (projServers.length > 0) {
					projectImports.push({ path: projPath, servers: projServers });
				}
			}
		}
	}

	return { config: newConfig, result: { servers: imported, projectImports } };
}

// --- Skills sync ---

export function syncSkills(
	config: EnsembleConfig,
	clientId: string,
	options?: { dryRun?: boolean },
): SkillSyncResult {
	const clientDef = CLIENTS[clientId];
	if (!clientDef?.skillsDir) {
		return { clientId, actions: [], messages: [`${clientId}: no skills directory configured`] };
	}

	const skillsDir = expandPath(clientDef.skillsDir);
	const skills = resolveSkills(config, clientId);
	const actions: SkillSyncAction[] = [];

	const desiredNames = new Set(skills.map((s) => s.name));

	// Find existing managed skill directories
	const existingManaged = new Set<string>();
	if (existsSync(skillsDir)) {
		for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const markerPath = join(skillsDir, entry.name, ".ensemble-managed");
				const legacyMarker = join(skillsDir, entry.name, ".mcpoyle-managed");
				if (existsSync(markerPath) || existsSync(legacyMarker)) {
					existingManaged.add(entry.name);
				}
			}
			// Symlinks to skill dirs are always managed
			if (entry.isSymbolicLink?.()) {
				existingManaged.add(entry.name);
			}
		}
		// Also check for directory-level symlinks
		for (const entry of readdirSync(skillsDir, { withFileTypes: false })) {
			try {
				const fullPath = join(skillsDir, entry as unknown as string);
				if (lstatSync(fullPath).isSymbolicLink()) {
					existingManaged.add(entry as unknown as string);
				}
			} catch { /* ignore */ }
		}
	}

	const toAdd = [...desiredNames].filter((n) => !existingManaged.has(n));
	const toRemove = [...existingManaged].filter((n) => !desiredNames.has(n));

	if (toAdd.length === 0 && toRemove.length === 0) {
		// Check if existing symlinks point to correct targets
		let allCorrect = true;
		for (const skill of skills) {
			const target = join(skillsDir, skill.name);
			const sourceDir = getSkillDir(skill.name);
			try {
				if (lstatSync(target).isSymbolicLink()) {
					if (readlinkSync(target) !== sourceDir) allCorrect = false;
				}
			} catch { /* not a symlink, might be copied */ }
		}
		if (allCorrect) {
			return { clientId, actions: [], messages: [`${clientDef.name} skills: already in sync`] };
		}
	}

	for (const name of toAdd.sort()) {
		actions.push({ type: "symlink", skillName: name, targetPath: join(skillsDir, name) });
	}
	for (const name of toRemove.sort()) {
		actions.push({ type: "remove", skillName: name, targetPath: join(skillsDir, name) });
	}

	if (options?.dryRun) {
		return {
			clientId,
			actions,
			messages: [`${clientDef.name} skills: would sync ${desiredNames.size} skill(s)`],
		};
	}

	mkdirSync(skillsDir, { recursive: true });

	// Remove skills no longer wanted
	for (const name of toRemove) {
		const target = join(skillsDir, name);
		try {
			if (lstatSync(target).isSymbolicLink()) {
				rmSync(target);
			} else {
				rmSync(target, { recursive: true });
			}
		} catch { /* already gone */ }
	}

	// Add/update skills — symlink the entire skill directory
	for (const skill of skills) {
		const sourceDir = getSkillDir(skill.name);
		const target = join(skillsDir, skill.name);

		if (!existsSync(sourceDir)) continue;

		// Check if already correct
		if (existsSync(target) || lstatSync(target).isSymbolicLink?.()) {
			try {
				if (lstatSync(target).isSymbolicLink() && readlinkSync(target) === sourceDir) {
					continue; // Already correct
				}
				// Remove incorrect target
				if (lstatSync(target).isSymbolicLink()) {
					rmSync(target);
				} else {
					rmSync(target, { recursive: true });
				}
			} catch {
				// Target doesn't exist, proceed
			}
		}

		// Try symlink first, fall back to copy
		try {
			symlinkSync(sourceDir, target);
		} catch {
			// Copy fallback
			copyDirRecursive(sourceDir, target);
			writeFileSync(join(target, ".ensemble-managed"), "managed by ensemble\n", "utf-8");
		}
	}

	return {
		clientId,
		actions,
		messages: [`${clientDef.name} skills: synced ${desiredNames.size} skill(s)`],
	};
}

function copyDirRecursive(src: string, dest: string): void {
	mkdirSync(dest, { recursive: true });
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			copyFileSync(srcPath, destPath);
		}
	}
}

// --- Context cost awareness ---

export interface ContextCostSummary {
	serverCount: number;
	toolCount: number;
	estimatedTokens: number;
	warningThreshold: number;
	exceedsThreshold: boolean;
}

export function computeContextCost(
	config: EnsembleConfig,
	clientId: string,
): ContextCostSummary {
	const servers = resolveServers(config, clientId);
	const toolCount = servers.reduce((sum, s) => sum + s.tools.length, 0);
	// Estimate ~200 tokens per tool (name + description + schema)
	const estimatedTokens = toolCount * 200;
	const threshold = config.settings.sync_cost_warning_threshold;
	return {
		serverCount: servers.length,
		toolCount,
		estimatedTokens,
		warningThreshold: threshold,
		exceedsThreshold: toolCount > threshold,
	};
}

// --- Sync all ---

export function syncAllClients(
	config: EnsembleConfig,
	options?: { dryRun?: boolean; force?: boolean; adopt?: boolean },
): { config: EnsembleConfig; results: SyncResult[] } {
	let currentConfig = config;
	const results: SyncResult[] = [];

	for (const clientDef of Object.values(CLIENTS)) {
		const { config: newConfig, result } = syncClient(currentConfig, clientDef.id, options);
		currentConfig = newConfig;
		results.push(result);
	}

	return { config: currentConfig, results };
}
