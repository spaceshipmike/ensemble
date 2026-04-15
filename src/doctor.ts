/**
 * Deterministic health audit with structured scoring across 5 categories.
 *
 * No network calls, no LLM — purely filesystem checks.
 */

import { execSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	CLIENTS,
	expandPath,
	getManagedServers,
	readClientConfig,
	resolvedPaths,
} from "./clients.js";
import { computeEntryHash, SKILLS_DIR } from "./config.js";
import { scanSecrets } from "./secrets.js";
import { getMcpCapabilities } from "./setlist.js";
import type { EnsembleConfig } from "./schemas.js";

// --- Types ---

export interface DoctorCheck {
	id: string;
	category: "existence" | "freshness" | "grounding" | "parity" | "skills-health" | "capability";
	maxPoints: number;
	earnedPoints: number;
	severity: "error" | "warning" | "info";
	message: string;
	fix?: { command: string; description: string };
}

export interface CategoryScore {
	earned: number;
	max: number;
}

export interface DoctorResult {
	checks: DoctorCheck[];
	totalPoints: number;
	earnedPoints: number;
	scorePercent: number;
	errors: number;
	warnings: number;
	infos: number;
	categoryScores: Record<string, CategoryScore>;
	serverCount: number;
	groupCount: number;
	pluginCount: number;
	skillCount: number;
}

// --- Check implementations ---

function checkMissingEnvVars(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const server of config.servers) {
		if (!server.enabled) continue;
		if (Object.keys(server.env).length === 0) continue;
		let missing = false;
		for (const [key, val] of Object.entries(server.env)) {
			if (!val || val === "") {
				missing = true;
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
		if (!missing) {
			checks.push({
				id: "env-vars",
				category: "existence",
				maxPoints: 10,
				earnedPoints: 10,
				severity: "info",
				message: `Server '${server.name}' env vars all set`,
			});
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
			checks.push({
				id: "unreachable-binary",
				category: "grounding",
				maxPoints: 5,
				earnedPoints: 5,
				severity: "info",
				message: `Server '${server.name}': command '${server.command}' found`,
			});
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
		const clientDef = CLIENTS[clientAssignment.id];
		const label = clientDef?.name ?? clientAssignment.id;
		if (!clientAssignment.last_synced) {
			checks.push({
				id: "stale-config",
				category: "freshness",
				maxPoints: 5,
				earnedPoints: 0,
				severity: "warning",
				message: `${label}: never synced`,
				fix: { command: `ensemble sync ${clientAssignment.id}`, description: "Run initial sync" },
			});
		} else {
			checks.push({
				id: "stale-config",
				category: "freshness",
				maxPoints: 5,
				earnedPoints: 5,
				severity: "info",
				message: `${label}: synced`,
			});
		}
	}
	return checks;
}

function checkOrphanedEntries(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	let scannedCount = 0;
	let orphanCount = 0;
	for (const [clientId, clientDef] of Object.entries(CLIENTS)) {
		for (const path of resolvedPaths(clientDef)) {
			if (!existsSync(path)) continue;
			try {
				const clientConfig = readClientConfig(path);
				const managed = getManagedServers(clientConfig, clientDef.serversKey);
				for (const name of Object.keys(managed)) {
					scannedCount++;
					const inRegistry = config.servers.some((s) => s.name === name);
					if (!inRegistry) {
						orphanCount++;
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
	if (scannedCount > 0 && orphanCount === 0) {
		checks.push({
			id: "orphaned-entry",
			category: "grounding",
			maxPoints: 5,
			earnedPoints: 5,
			severity: "info",
			message: `No orphaned entries across ${scannedCount} managed server(s)`,
		});
	}
	return checks;
}

function checkConfigParseErrors(): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	let parsedCount = 0;
	for (const [_clientId, clientDef] of Object.entries(CLIENTS)) {
		for (const path of resolvedPaths(clientDef)) {
			if (!existsSync(path)) continue;
			try {
				readClientConfig(path);
				parsedCount++;
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
	if (parsedCount > 0 && checks.length === 0) {
		checks.push({
			id: "config-parse-error",
			category: "existence",
			maxPoints: 10,
			earnedPoints: 10,
			severity: "info",
			message: `${parsedCount} client config(s) parsed successfully`,
		});
	}
	return checks;
}

function checkDrift(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	let checkedCount = 0;
	let driftCount = 0;
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
						checkedCount++;
						const currentHash = computeEntryHash(entry);
						if (currentHash !== storedHash) {
							driftCount++;
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
	if (checkedCount > 0 && driftCount === 0) {
		checks.push({
			id: "drift-detected",
			category: "freshness",
			maxPoints: 5,
			earnedPoints: 5,
			severity: "info",
			message: `No drift detected across ${checkedCount} managed server(s)`,
		});
	}
	return checks;
}

function checkBrokenSkillSymlinks(_config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	let symlinkCount = 0;
	let brokenCount = 0;
	for (const clientDef of Object.values(CLIENTS)) {
		if (!clientDef.skillsDir) continue;
		const skillsDir = expandPath(clientDef.skillsDir);
		if (!existsSync(skillsDir)) continue;
		try {
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const skillPath = join(skillsDir, entry.name, "SKILL.md");
				try {
					const stat = lstatSync(skillPath);
					if (stat.isSymbolicLink()) {
						symlinkCount++;
						const target = readlinkSync(skillPath);
						if (!existsSync(target)) {
							brokenCount++;
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
	if (symlinkCount > 0 && brokenCount === 0) {
		checks.push({
			id: "broken-skill-symlink",
			category: "skills-health",
			maxPoints: 5,
			earnedPoints: 5,
			severity: "info",
			message: `${symlinkCount} skill symlink(s) intact`,
		});
	}
	return checks;
}

function checkMissingToolMetadata(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	let registryCount = 0;
	let missingCount = 0;
	for (const server of config.servers) {
		if (!server.enabled) continue;
		if (server.origin.source === "registry") {
			registryCount++;
			if (server.tools.length === 0) {
				missingCount++;
				checks.push({
					id: "missing-tool-metadata",
					category: "grounding",
					maxPoints: 3,
					earnedPoints: 0,
					severity: "info",
					message: `Server '${server.name}' (from registry) has no cached tool metadata`,
					fix: { command: `ensemble registry show ${server.name}`, description: "Refresh tool metadata" },
				});
			}
		}
	}
	if (registryCount > 0 && missingCount === 0) {
		checks.push({
			id: "missing-tool-metadata",
			category: "grounding",
			maxPoints: 3,
			earnedPoints: 3,
			severity: "info",
			message: `${registryCount} registry server(s) have tool metadata`,
		});
	}
	return checks;
}

function checkCrossClientParity(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	// Group clients by their assigned group
	const groupClients = new Map<string, string[]>();
	for (const assignment of config.clients) {
		if (assignment.group) {
			const existing = groupClients.get(assignment.group) ?? [];
			existing.push(assignment.id);
			groupClients.set(assignment.group, existing);
		}
	}
	// For groups with multiple clients, check if they have different server hash sets
	let multiGroupCount = 0;
	let parityIssues = 0;
	for (const [groupName, clientIds] of groupClients) {
		if (clientIds.length < 2) continue;
		multiGroupCount++;
		const hashSets = clientIds.map((id) => {
			const a = config.clients.find((c) => c.id === id);
			return JSON.stringify(Object.keys(a?.server_hashes ?? {}).sort());
		});
		const unique = new Set(hashSets);
		if (unique.size > 1) {
			parityIssues++;
			checks.push({
				id: "cross-client-parity",
				category: "parity",
				maxPoints: 5,
				earnedPoints: 0,
				severity: "warning",
				message: `Clients with group '${groupName}' have different effective server sets: ${clientIds.join(", ")}`,
				fix: { command: `ensemble sync`, description: "Re-sync all clients to resolve" },
			});
		}
	}
	if (multiGroupCount > 0 && parityIssues === 0) {
		checks.push({
			id: "cross-client-parity",
			category: "parity",
			maxPoints: 5,
			earnedPoints: 5,
			severity: "info",
			message: `${multiGroupCount} multi-client group(s) in parity`,
		});
	}
	return checks;
}

function check1PasswordCli(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	const hasOpRefs = config.servers.some((s) =>
		Object.values(s.env).some((v) => v.startsWith("op://"))
	);
	if (hasOpRefs) {
		try {
			const { execSync: exec } = require("node:child_process") as typeof import("node:child_process");
			exec("which op", { stdio: "pipe" });
			checks.push({
				id: "1password-cli-missing",
				category: "existence",
				maxPoints: 5,
				earnedPoints: 5,
				severity: "info",
				message: "1Password CLI (op) available for op:// references",
			});
		} catch {
			checks.push({
				id: "1password-cli-missing",
				category: "existence",
				maxPoints: 5,
				earnedPoints: 0,
				severity: "warning",
				message: "Servers reference op:// env vars but 1Password CLI (op) not found on PATH",
			});
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

function checkFrontmatterCompleteness(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const skill of config.skills) {
		if (!skill.name) {
			checks.push({
				id: "skill-frontmatter-completeness",
				category: "skills-health",
				maxPoints: 3,
				earnedPoints: 0,
				severity: "error",
				message: `Skill missing name`,
			});
		}
		if (!skill.description) {
			checks.push({
				id: "skill-frontmatter-completeness",
				category: "skills-health",
				maxPoints: 3,
				earnedPoints: 0,
				severity: "warning",
				message: `Skill '${skill.name}' has no description`,
			});
		}
		if (skill.tags.length === 0) {
			checks.push({
				id: "skill-frontmatter-completeness",
				category: "skills-health",
				maxPoints: 1,
				earnedPoints: 0,
				severity: "info",
				message: `Skill '${skill.name}' has no tags (recommended for search)`,
			});
		}
	}
	return checks;
}

function checkDescriptionFormat(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const skill of config.skills) {
		if (!skill.description) continue;
		if (skill.description.includes("\n")) {
			checks.push({
				id: "skill-description-format",
				category: "skills-health",
				maxPoints: 2,
				earnedPoints: 0,
				severity: "warning",
				message: `Skill '${skill.name}' has multiline description (should be single line)`,
			});
		} else if (skill.description.length > 120) {
			checks.push({
				id: "skill-description-format",
				category: "skills-health",
				maxPoints: 2,
				earnedPoints: 0,
				severity: "warning",
				message: `Skill '${skill.name}' description exceeds 120 chars (${skill.description.length})`,
			});
		}
	}
	return checks;
}

function checkBodySize(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const skill of config.skills) {
		const skillMdPath = join(SKILLS_DIR, skill.name, "SKILL.md");
		if (!existsSync(skillMdPath)) continue;
		try {
			const { readFileSync } = require("node:fs") as typeof import("node:fs");
			const content = readFileSync(skillMdPath, "utf-8");
			const lineCount = content.split("\n").length;
			if (lineCount > 500) {
				checks.push({
					id: "skill-body-size",
					category: "skills-health",
					maxPoints: 2,
					earnedPoints: 0,
					severity: "warning",
					message: `Skill '${skill.name}' SKILL.md is ${lineCount} lines (recommended: <500)`,
				});
			}
		} catch { /* file read error */ }
	}
	return checks;
}

function checkDirectoryNaming(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	const kebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/;
	for (const skill of config.skills) {
		if (!kebabCase.test(skill.name)) {
			checks.push({
				id: "skill-directory-naming",
				category: "skills-health",
				maxPoints: 1,
				earnedPoints: 0,
				severity: "info",
				message: `Skill '${skill.name}' name is not kebab-case`,
			});
		}
	}
	return checks;
}

function checkBrokenDependency(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	for (const skill of config.skills) {
		for (const dep of skill.dependencies) {
			const server = config.servers.find((s) => s.name === dep);
			if (!server) {
				// Already covered by checkUnresolvedDeps — skip to avoid duplication
				continue;
			}
			if (!server.enabled) {
				checks.push({
					id: "skill-broken-dependency",
					category: "skills-health",
					maxPoints: 3,
					earnedPoints: 0,
					severity: "warning",
					message: `Skill '${skill.name}' depends on disabled server '${dep}'`,
				});
			}
		}
	}
	return checks;
}

function checkSecretInEnv(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	let scannedCount = 0;
	let violationCount = 0;
	for (const server of config.servers) {
		if (Object.keys(server.env).length === 0) continue;
		scannedCount++;
		const violations = scanSecrets(server.env, server.name);
		for (const v of violations) {
			violationCount++;
			checks.push({
				id: "secret-in-env",
				category: "existence",
				maxPoints: 5,
				earnedPoints: 0,
				severity: "error",
				message: `Server '${server.name}' env var '${v.field}' contains ${v.pattern}`,
				fix: { command: `ensemble show ${server.name}`, description: "Replace with op:// reference" },
			});
		}
	}
	if (scannedCount > 0 && violationCount === 0) {
		checks.push({
			id: "secret-in-env",
			category: "existence",
			maxPoints: 5,
			earnedPoints: 5,
			severity: "info",
			message: `No plaintext secrets detected in ${scannedCount} server(s)`,
		});
	}
	return checks;
}

function checkCapabilityGaps(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	const mcpCaps = getMcpCapabilities();
	if (mcpCaps.length === 0) return checks;

	const enabledServerNames = new Set(config.servers.filter((s) => s.enabled).map((s) => s.name));

	let gapCount = 0;
	let checkedCount = 0;
	for (const cap of mcpCaps) {
		// Check if the server name appears in the inputs field (convention for MCP capabilities)
		if (!cap.inputs) continue;
		const serverName = cap.inputs;
		if (config.servers.some((s) => s.name === serverName)) {
			checkedCount++;
			if (!enabledServerNames.has(serverName)) {
				gapCount++;
				checks.push({
					id: "capability-server-gap",
					category: "capability",
					maxPoints: 3,
					earnedPoints: 0,
					severity: "warning",
					message: `${cap.project}: capability '${cap.name}' references server '${serverName}' but it is not enabled`,
				});
			}
		}
	}
	if (checkedCount > 0 && gapCount === 0) {
		checks.push({
			id: "capability-server-gap",
			category: "capability",
			maxPoints: 3,
			earnedPoints: 3,
			severity: "info",
			message: `${checkedCount} capability reference(s) satisfied`,
		});
	}
	return checks;
}

function checkSkillsSummary(config: EnsembleConfig): DoctorCheck[] {
	if (config.skills.length === 0) {
		return [{
			id: "skills-summary",
			category: "skills-health",
			maxPoints: 5,
			earnedPoints: 5,
			severity: "info",
			message: "No skills registered (add with `ensemble skills add`)",
		}];
	}
	return [{
		id: "skills-summary",
		category: "skills-health",
		maxPoints: 5,
		earnedPoints: 5,
		severity: "info",
		message: `${config.skills.length} skill(s) registered`,
	}];
}

// --- Descriptions refreshed (v2.0.3 #notes-and-descriptions, #doctor) ---

import { descriptionHash } from "./operations.js";

/**
 * Find items where the stored lastDescriptionHash is missing or no longer
 * matches the current description text. This surfaces the "descriptions
 * refreshed" signal: either an upstream re-import bumped the text without
 * recording the new hash, or no hash has ever been recorded yet.
 *
 * Pure: does no I/O. Powers both the doctor finding and the
 * `--show descriptions-refreshed` CLI section.
 */
export function findStaleDescriptionHashes(config: EnsembleConfig): Array<{
	type: "server" | "skill" | "plugin";
	name: string;
	description: string;
	storedHash: string;
	currentHash: string;
}> {
	const out: Array<{
		type: "server" | "skill" | "plugin";
		name: string;
		description: string;
		storedHash: string;
		currentHash: string;
	}> = [];
	const consider = (
		type: "server" | "skill" | "plugin",
		name: string,
		description: string | undefined,
		storedHash: string | undefined,
	): void => {
		const desc = description ?? "";
		if (!desc) return;
		const cur = descriptionHash(desc);
		const stored = storedHash ?? "";
		if (stored !== cur) out.push({ type, name, description: desc, storedHash: stored, currentHash: cur });
	};
	for (const s of config.servers) consider("server", s.name, s.description, s.lastDescriptionHash);
	for (const s of config.skills) consider("skill", s.name, s.description, s.lastDescriptionHash);
	for (const p of config.plugins) consider("plugin", p.name, p.description, p.lastDescriptionHash);
	return out;
}

function checkDescriptionsRefreshed(config: EnsembleConfig): DoctorCheck[] {
	const stale = findStaleDescriptionHashes(config);
	if (stale.length === 0) {
		return [
			{
				id: "descriptions-refreshed",
				category: "freshness",
				maxPoints: 5,
				earnedPoints: 5,
				severity: "info",
				message: "All description hashes are up to date.",
			},
		];
	}
	return stale.map((entry) => ({
		id: "descriptions-refreshed",
		category: "freshness",
		maxPoints: 5,
		earnedPoints: 4,
		severity: "info" as const,
		message: `${entry.type} '${entry.name}' description hash is stale (run a refresh to acknowledge).`,
		fix: { command: `ensemble doctor --show descriptions-refreshed`, description: "Show full refreshed-descriptions list" },
	}));
}

// --- Main doctor function ---

export function runDoctor(config: EnsembleConfig): DoctorResult {
	const allChecks: DoctorCheck[] = [
		...checkMissingEnvVars(config),
		...check1PasswordCli(config),
		...checkUnreachableBinaries(config),
		...checkStaleConfigs(config),
		...checkOrphanedEntries(config),
		...checkConfigParseErrors(),
		...checkDrift(config),
		...checkMissingToolMetadata(config),
		...checkCrossClientParity(config),
		...checkBrokenSkillSymlinks(config),
		...checkUnresolvedDeps(config),
		...checkFrontmatterCompleteness(config),
		...checkDescriptionFormat(config),
		...checkBodySize(config),
		...checkDirectoryNaming(config),
		...checkBrokenDependency(config),
		...checkSecretInEnv(config),
		...checkCapabilityGaps(config),
		...checkSkillsSummary(config),
		...checkDescriptionsRefreshed(config),
	];

	// Calculate scores using additive model (matching Python)
	const totalPoints = allChecks.reduce((sum, c) => sum + c.maxPoints, 0) || 100;
	const earnedPoints = allChecks.reduce((sum, c) => sum + c.earnedPoints, 0);

	// Per-category breakdown
	const categories = ["existence", "freshness", "grounding", "parity", "skills-health", "capability"] as const;
	const categoryScores: Record<string, CategoryScore> = {};
	for (const cat of categories) {
		const catChecks = allChecks.filter((c) => c.category === cat);
		const max = catChecks.reduce((sum, c) => sum + c.maxPoints, 0);
		if (max > 0) {
			categoryScores[cat] = {
				earned: catChecks.reduce((sum, c) => sum + c.earnedPoints, 0),
				max,
			};
		}
	}

	return {
		checks: allChecks,
		totalPoints,
		earnedPoints,
		scorePercent: totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 100,
		errors: allChecks.filter((c) => c.severity === "error").length,
		warnings: allChecks.filter((c) => c.severity === "warning").length,
		infos: allChecks.filter((c) => c.severity === "info").length,
		categoryScores,
		serverCount: config.servers.length,
		groupCount: config.groups.length,
		pluginCount: config.plugins.length,
		skillCount: config.skills.length,
	};
}
