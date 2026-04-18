/**
 * Config loading, saving, and path management for Ensemble.
 *
 * This module handles all file I/O for the central config.
 * Operations are pure functions that receive and return config —
 * this module is the boundary where I/O happens.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { EnsembleConfigSchema } from "./schemas.js";
import type { EnsembleConfig } from "./schemas.js";

// --- Paths ---

export const CONFIG_DIR = process.env.ENSEMBLE_CONFIG_DIR ?? join(homedir(), ".config", "ensemble");
export const CONFIG_PATH = process.env.ENSEMBLE_CONFIG_PATH ?? join(CONFIG_DIR, "config.json");
export const SKILLS_DIR = join(CONFIG_DIR, "skills");
export const CACHE_DIR = join(CONFIG_DIR, "cache", "registry");

// --- Config I/O ---

/** Create an empty config with all defaults applied. */
export function createConfig(): EnsembleConfig {
	return EnsembleConfigSchema.parse({});
}

/**
 * Load the central Ensemble config from disk.
 * Returns a fresh default config if the file doesn't exist.
 * Validates and applies defaults via the Zod schema.
 */
export function loadConfig(path?: string): EnsembleConfig {
	const configPath = path ?? CONFIG_PATH;
	if (!existsSync(configPath)) {
		return createConfig();
	}
	const raw = readFileSync(configPath, "utf-8");
	const data = JSON.parse(raw);
	return EnsembleConfigSchema.parse(data);
}

/**
 * Save the central Ensemble config to disk with file locking.
 * Creates the config directory if it doesn't exist.
 */
export function saveConfig(config: EnsembleConfig, path?: string): void {
	const configPath = path ?? CONFIG_PATH;
	const dir = join(configPath, "..");
	mkdirSync(dir, { recursive: true });

	// Write to a temporary file first, then rename for atomicity
	const tmpPath = `${configPath}.tmp`;
	writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

	// Use file locking on the config file itself (or a lock file if it doesn't exist yet)
	let release: (() => void) | undefined;
	try {
		if (existsSync(configPath)) {
			release = lockfile.lockSync(configPath);
		}
		renameSync(tmpPath, configPath);
	} finally {
		release?.();
	}
}

// --- Hashing ---

/**
 * Compute a SHA-256 hash of a server/plugin entry dict.
 * Strips the __ensemble marker before hashing so the hash reflects
 * only meaningful config content.
 */
export function computeEntryHash(entry: Record<string, unknown>): string {
	const filtered: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(entry).sort()) {
		if (k !== "__ensemble" && k !== "__mcpoyle") {
			filtered[k] = v;
		}
	}
	return createHash("sha256").update(JSON.stringify(filtered, Object.keys(filtered).sort())).digest("hex");
}

// --- Config query helpers ---

export function getServer(config: EnsembleConfig, name: string) {
	return config.servers.find((s) => s.name === name);
}

export function getGroup(config: EnsembleConfig, name: string) {
	return config.groups.find((g) => g.name === name);
}

export function getClient(config: EnsembleConfig, clientId: string) {
	return config.clients.find((c) => c.id === clientId);
}

export function getPlugin(config: EnsembleConfig, name: string) {
	return config.plugins.find(
		(p) => p.name === name || (p.marketplace ? `${p.name}@${p.marketplace}` : p.name) === name,
	);
}

export function getSkill(config: EnsembleConfig, name: string) {
	return config.skills.find((s) => s.name === name);
}

export function getAgent(config: EnsembleConfig, name: string) {
	return (config.agents ?? []).find((a) => a.name === name);
}

export function getCommand(config: EnsembleConfig, name: string) {
	return (config.commands ?? []).find((c) => c.name === name);
}

export function getMarketplace(config: EnsembleConfig, name: string) {
	return config.marketplaces.find((m) => m.name === name);
}

/** Find the most specific path rule matching a project path. */
export function matchRule(config: EnsembleConfig, projectPath: string): EnsembleConfig["rules"][number] | undefined {
	const resolved = projectPath.replace(/^~/, homedir());
	const matches = config.rules.filter((r) => {
		const prefix = r.path.replace(/^~/, homedir());
		const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
		return resolved.startsWith(normalizedPrefix) || resolved === prefix;
	});
	if (matches.length === 0) return undefined;
	return matches.reduce((best, r) =>
		r.path.replace(/^~/, homedir()).length > best.path.replace(/^~/, homedir()).length ? r : best,
	);
}

// --- Resolution helpers ---

/** Get the servers a client should receive based on group assignment. */
export function resolveServers(
	config: EnsembleConfig,
	clientId: string,
	groupName?: string | null,
): EnsembleConfig["servers"] {
	const effectiveGroup = groupName ?? config.clients.find((c) => c.id === clientId)?.group;
	if (effectiveGroup) {
		const group = config.groups.find((g) => g.name === effectiveGroup);
		if (!group) return [];
		return config.servers.filter((s) => s.enabled && group.servers.includes(s.name));
	}
	return config.servers.filter((s) => s.enabled);
}

/** Get the plugins a client should receive based on group assignment. */
export function resolvePlugins(
	config: EnsembleConfig,
	clientId: string,
	groupName?: string | null,
): EnsembleConfig["plugins"] {
	const effectiveGroup = groupName ?? config.clients.find((c) => c.id === clientId)?.group;
	if (effectiveGroup) {
		const group = config.groups.find((g) => g.name === effectiveGroup);
		if (!group) return [];
		return config.plugins.filter((p) => p.enabled && group.plugins.includes(p.name));
	}
	return config.plugins.filter((p) => p.enabled);
}

/** Get the skills a client should receive based on group assignment. */
export function resolveSkills(
	config: EnsembleConfig,
	clientId: string,
	groupName?: string | null,
): EnsembleConfig["skills"] {
	const effectiveGroup = groupName ?? config.clients.find((c) => c.id === clientId)?.group;
	if (effectiveGroup) {
		const group = config.groups.find((g) => g.name === effectiveGroup);
		if (!group) return [];
		return config.skills.filter((s) => s.enabled && group.skills.includes(s.name));
	}
	return config.skills.filter((s) => s.enabled);
}

/**
 * Get the agents a client should receive. Agents are currently always
 * global-scoped (no per-group narrowing in v2.0.1) — every enabled agent
 * fans out to every installed client that has an agentsDir. This mirrors
 * the plugins/skills default-install precedent.
 */
export function resolveAgents(
	config: EnsembleConfig,
	_clientId: string,
): EnsembleConfig["agents"] {
	return (config.agents ?? []).filter((a) => a.enabled);
}

/**
 * Get the slash commands a client should receive. Commands are global-scoped
 * in v2.0.1 — every enabled command fans out to every installed client with
 * a commandsDir. Mirrors resolveAgents.
 */
export function resolveCommands(
	config: EnsembleConfig,
	_clientId: string,
): EnsembleConfig["commands"] {
	return (config.commands ?? []).filter((c) => c.enabled);
}
