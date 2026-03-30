/**
 * Sync engine — resolve servers/skills/plugins per client, write configs.
 *
 * Dual strategy: config-entry writes for servers, symlink fan-out for skills.
 * Drift detection via SHA-256 content hashes.
 */

import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
	CLIENTS,
	expandPath,
	getManagedServers,
	readClientConfig,
	resolvedPaths,
	serverToClientEntry,
	writeClientConfig,
} from "./clients.js";
import { computeEntryHash, getClient, resolveServers, resolveSkills } from "./config.js";
import type { EnsembleConfig } from "./schemas.js";

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

	for (const skill of skills) {
		if (!skill.path) continue;
		const targetDir = join(skillsDir, skill.name);
		const targetPath = join(targetDir, "SKILL.md");
		const sourcePath = skill.path;

		if (!existsSync(sourcePath)) {
			actions.push({ type: "skip", skillName: skill.name, targetPath, detail: "source missing" });
			continue;
		}

		if (existsSync(targetPath)) {
			// Check if it's already a correct symlink
			try {
				const stat = lstatSync(targetPath);
				if (stat.isSymbolicLink() && readlinkSync(targetPath) === sourcePath) {
					continue; // Already correct
				}
			} catch {
				// Proceed with creating symlink
			}
		}

		actions.push({ type: "symlink", skillName: skill.name, targetPath });

		if (!options?.dryRun) {
			mkdirSync(targetDir, { recursive: true });
			if (existsSync(targetPath)) {
				rmSync(targetPath);
			}
			try {
				symlinkSync(sourcePath, targetPath);
			} catch {
				// Symlink failed — could fall back to copy, but log for now
				actions[actions.length - 1]!.detail = "symlink failed";
			}
		}
	}

	const messages = actions.length > 0
		? [`${clientDef.name}: ${options?.dryRun ? "would sync" : "synced"} ${actions.length} skill(s)`]
		: [`${clientDef.name}: skills in sync`];

	return { clientId, actions, messages };
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
