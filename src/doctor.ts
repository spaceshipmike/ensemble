/**
 * Deterministic health audit with structured scoring across 5 categories.
 *
 * No network calls, no LLM — purely filesystem checks.
 */

import { execSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import {
	CLIENTS,
	expandPath,
	getManagedServers,
	readClientConfig,
	resolvedPaths,
} from "./clients.js";
import { computeEntryHash } from "./config.js";
import type { EnsembleConfig } from "./schemas.js";

// --- Types ---

export interface DoctorCheck {
	id: string;
	category: "existence" | "freshness" | "grounding" | "parity" | "skills-health";
	maxPoints: number;
	earnedPoints: number;
	severity: "error" | "warning" | "info";
	message: string;
	fix?: { command: string; description: string };
}

export interface DoctorResult {
	checks: DoctorCheck[];
	totalPoints: number;
	earnedPoints: number;
	scorePercent: number;
	errors: number;
	warnings: number;
	infos: number;
}

// --- Check implementations ---

function checkMissingEnvVars(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const server of config.servers) {
		if (!server.enabled) continue;
		for (const [key, val] of Object.entries(server.env)) {
			if (!val || val === "") {
				checks.push({
					id: "env-vars",
					category: "existence",
					maxPoints: 10,
					earnedPoints: 0,
					severity: "error",
					message: `Server '${server.name}' missing env var ${key}`,
					fix: { command: `ensemble show ${server.name}`, description: "Review required environment variables" },
				});
			}
		}
	}
	return checks;
}

function checkUnreachableBinaries(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const server of config.servers) {
		if (!server.enabled || !server.command || server.transport !== "stdio") continue;
		try {
			execSync(`which ${server.command}`, { stdio: "pipe" });
		} catch {
			checks.push({
				id: "unreachable-binary",
				category: "grounding",
				maxPoints: 5,
				earnedPoints: 0,
				severity: "warning",
				message: `Server '${server.name}': command '${server.command}' not found on PATH`,
			});
		}
	}
	return checks;
}

function checkStaleConfigs(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const clientAssignment of config.clients) {
		if (!clientAssignment.last_synced) {
			const clientDef = CLIENTS[clientAssignment.id];
			checks.push({
				id: "stale-config",
				category: "freshness",
				maxPoints: 5,
				earnedPoints: 0,
				severity: "warning",
				message: `${clientDef?.name ?? clientAssignment.id}: never synced`,
				fix: { command: `ensemble sync ${clientAssignment.id}`, description: "Run initial sync" },
			});
		}
	}
	return checks;
}

function checkOrphanedEntries(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const [clientId, clientDef] of Object.entries(CLIENTS)) {
		for (const path of resolvedPaths(clientDef)) {
			if (!existsSync(path)) continue;
			try {
				const clientConfig = readClientConfig(path);
				const managed = getManagedServers(clientConfig, clientDef.serversKey);
				for (const name of Object.keys(managed)) {
					const inRegistry = config.servers.some((s) => s.name === name);
					if (!inRegistry) {
						checks.push({
							id: "orphaned-entry",
							category: "grounding",
							maxPoints: 5,
							earnedPoints: 0,
							severity: "warning",
							message: `${clientDef.name}: orphaned entry '${name}' (in client config but not in ensemble registry)`,
							fix: { command: `ensemble import ${clientId}`, description: "Import or remove orphaned entries" },
						});
					}
				}
			} catch {
				// Config parse error handled separately
			}
		}
	}
	return checks;
}

function checkConfigParseErrors(): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const [_clientId, clientDef] of Object.entries(CLIENTS)) {
		for (const path of resolvedPaths(clientDef)) {
			if (!existsSync(path)) continue;
			try {
				readClientConfig(path);
			} catch {
				checks.push({
					id: "config-parse-error",
					category: "existence",
					maxPoints: 10,
					earnedPoints: 0,
					severity: "error",
					message: `${clientDef.name}: config file contains invalid JSON/TOML (${path})`,
				});
			}
		}
	}
	return checks;
}

function checkDrift(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const clientAssignment of config.clients) {
		const clientDef = CLIENTS[clientAssignment.id];
		if (!clientDef || !clientAssignment.server_hashes) continue;
		for (const path of resolvedPaths(clientDef)) {
			if (!existsSync(path)) continue;
			try {
				const clientConfig = readClientConfig(path);
				const managed = getManagedServers(clientConfig, clientDef.serversKey);
				for (const [name, entry] of Object.entries(managed)) {
					const storedHash = clientAssignment.server_hashes[name];
					if (storedHash) {
						const currentHash = computeEntryHash(entry);
						if (currentHash !== storedHash) {
							checks.push({
								id: "drift-detected",
								category: "freshness",
								maxPoints: 5,
								earnedPoints: 0,
								severity: "warning",
								message: `${clientDef.name}: server '${name}' was modified outside ensemble`,
								fix: {
									command: `ensemble sync ${clientAssignment.id} --force`,
									description: "Overwrite with ensemble's version, or --adopt to keep",
								},
							});
						}
					}
				}
			} catch {
				// Skip parse errors
			}
		}
	}
	return checks;
}

function checkBrokenSkillSymlinks(_config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const clientDef of Object.values(CLIENTS)) {
		if (!clientDef.skillsDir) continue;
		const skillsDir = expandPath(clientDef.skillsDir);
		if (!existsSync(skillsDir)) continue;
		const { readdirSync } = require("node:fs") as typeof import("node:fs");
		try {
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const skillPath = join(skillsDir, entry.name, "SKILL.md");
				try {
					const stat = lstatSync(skillPath);
					if (stat.isSymbolicLink()) {
						const target = require("node:fs").readlinkSync(skillPath);
						if (!existsSync(target)) {
							checks.push({
								id: "broken-skill-symlink",
								category: "skills-health",
								maxPoints: 5,
								earnedPoints: 0,
								severity: "warning",
								message: `${clientDef.name}: broken skill symlink '${entry.name}' → ${target}`,
							});
						}
					}
				} catch {
					// Not a symlink or doesn't exist
				}
			}
		} catch {
			// Can't read skills dir
		}
	}
	return checks;
}

function checkUnresolvedDeps(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const skill of config.skills) {
		for (const dep of skill.dependencies) {
			if (!config.servers.some((s) => s.name === dep)) {
				checks.push({
					id: "unresolved-skill-dep",
					category: "skills-health",
					maxPoints: 3,
					earnedPoints: 0,
					severity: "info",
					message: `Skill '${skill.name}' depends on missing server '${dep}'`,
				});
			}
		}
	}
	return checks;
}

// --- Main doctor function ---

export function runDoctor(config: EnsembleConfig): DoctorResult {
	const allChecks: DoctorCheck[] = [
		...checkMissingEnvVars(config),
		...checkUnreachableBinaries(config),
		...checkStaleConfigs(config),
		...checkOrphanedEntries(config),
		...checkConfigParseErrors(),
		...checkDrift(config),
		...checkBrokenSkillSymlinks(config),
		...checkUnresolvedDeps(config),
	];

	// Calculate baseline points (what a healthy system would score)
	const baselinePoints =
		config.servers.filter((s) => s.enabled).length * 10 + // env vars
		config.servers.filter((s) => s.enabled && s.command).length * 5 + // binaries
		config.clients.length * 5 + // stale configs
		config.skills.length * 3; // deps

	const failedPoints = allChecks.reduce((sum, c) => sum + c.maxPoints, 0);
	const totalPoints = Math.max(baselinePoints, failedPoints) || 100;
	const earnedPoints = totalPoints - failedPoints;

	return {
		checks: allChecks,
		totalPoints,
		earnedPoints: Math.max(0, earnedPoints),
		scorePercent: totalPoints > 0 ? Math.round((Math.max(0, earnedPoints) / totalPoints) * 100) : 100,
		errors: allChecks.filter((c) => c.severity === "error").length,
		warnings: allChecks.filter((c) => c.severity === "warning").length,
		infos: allChecks.filter((c) => c.severity === "info").length,
	};
}
