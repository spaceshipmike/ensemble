/**
 * Deterministic health audit with structured scoring across 5 categories.
 *
 * No network calls, no LLM — purely filesystem checks.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { toFanoutContent as agentFanoutContent, readAgentMd } from "./agents.js";
import {
	CLIENTS,
	expandPath,
	getManagedServers,
	readClientConfig,
	resolvedPaths,
} from "./clients.js";
import { toFanoutContent as commandFanoutContent, readCommandMd } from "./commands.js";
import { SKILLS_DIR, computeEntryHash, resolveAgents, resolveCommands } from "./config.js";
import type { EnsembleConfig } from "./schemas.js";
import { scanSecrets } from "./secrets.js";
import { getMcpCapabilities } from "./setlist.js";
import * as snapshots from "./snapshots.js";

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

// --- v2.0.1 additive checks (#doctor) ---

/**
 * Orphan snapshots: a snapshot's manifest lists a file path that no longer
 * exists AND no surviving library entry would re-create it on next sync.
 * Surfaces snapshots that can be pruned without cost.
 *
 * Conservative: we only flag a snapshot as orphaned when ALL captured paths
 * are orphans (no file on disk, no library entry). Partial orphans are noise.
 */
function checkOrphanSnapshots(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	let all: ReturnType<typeof snapshots.list>;
	try {
		all = snapshots.list();
	} catch {
		return checks;
	}
	if (all.length === 0) return checks;

	// Build the set of paths a future sync MIGHT write. We can't enumerate
	// every client perfectly, but we can detect the common case where a
	// snapshot references names no longer in the library.
	const liveAgentNames = new Set((config.agents ?? []).map((a) => a.name));
	const liveCommandNames = new Set((config.commands ?? []).map((c) => c.name));
	const liveSkillNames = new Set(config.skills.map((s) => s.name));

	function isOrphanPath(path: string): boolean {
		if (existsSync(path)) return false;
		// Try to match against known library entries by basename segments.
		const segments = path.split("/");
		const fileName = segments[segments.length - 1] ?? "";
		const baseName = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
		if (path.includes("/.claude/agents/") && liveAgentNames.has(baseName)) return false;
		if (path.includes("/.claude/commands/") && liveCommandNames.has(baseName)) return false;
		if (path.includes("/skills/") && liveSkillNames.has(baseName)) return false;
		return true;
	}

	let orphanCount = 0;
	for (const snap of all) {
		if (snap.files.length === 0) continue;
		const allOrphan = snap.files.every((f) => isOrphanPath(f.path));
		if (allOrphan) {
			orphanCount++;
			checks.push({
				id: "orphan-snapshot",
				category: "freshness",
				maxPoints: 2,
				earnedPoints: 1,
				severity: "info",
				message: `Snapshot '${snap.id}' captures only paths whose library entries are gone (candidate for pruning).`,
				fix: { command: `ensemble rollback --prune`, description: "Prune orphan snapshots" },
			});
		}
	}
	if (orphanCount === 0 && all.length > 0) {
		checks.push({
			id: "orphan-snapshot",
			category: "freshness",
			maxPoints: 2,
			earnedPoints: 2,
			severity: "info",
			message: `No orphan snapshots detected (${all.length} snapshot${all.length === 1 ? "" : "s"} on disk).`,
		});
	}
	return checks;
}

/**
 * Snapshot-dir size check: warn when the snapshots root exceeds the
 * configured `snapshot_dir_size_warn_mb` threshold. Default 500 MB.
 * 0 disables the check.
 */
function checkSnapshotDirSize(config: EnsembleConfig): DoctorCheck[] {
	const thresholdMb = config.settings.snapshot_dir_size_warn_mb ?? 500;
	if (thresholdMb <= 0) return [];
	const root = snapshots.snapshotsRoot();
	if (!existsSync(root)) return [];

	function dirSize(dir: string): number {
		let total = 0;
		try {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				try {
					if (entry.isDirectory()) {
						total += dirSize(full);
					} else if (entry.isFile()) {
						total += statSync(full).size;
					}
				} catch {
					/* ignore per-entry errors */
				}
			}
		} catch {
			/* ignore */
		}
		return total;
	}

	const totalBytes = dirSize(root);
	const totalMb = Math.round(totalBytes / (1024 * 1024));
	if (totalMb >= thresholdMb) {
		return [
			{
				id: "snapshot-dir-size",
				category: "freshness",
				maxPoints: 3,
				earnedPoints: 1,
				severity: "warning",
				message: `Snapshot directory is ${totalMb} MB (threshold ${thresholdMb} MB). Consider shortening snapshot_retention_days or running 'ensemble rollback --prune'.`,
			},
		];
	}
	return [
		{
			id: "snapshot-dir-size",
			category: "freshness",
			maxPoints: 3,
			earnedPoints: 3,
			severity: "info",
			message: `Snapshot directory ${totalMb} MB / ${thresholdMb} MB warn threshold.`,
		},
	];
}

/**
 * Agents + commands drift: compare each library entry's expected fan-out
 * content to the on-disk fan-out file for every client with the relevant
 * directory configured. A mismatch on a file carrying the __ensemble marker
 * means someone edited the fan-out copy directly (drift) — surface it so
 * the user can decide to re-sync or adopt the edit.
 */
function hashString(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

function checkAgentsCommandsDrift(config: EnsembleConfig): DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	const managedMarker = /^---[\s\S]*?__ensemble:\s*true[\s\S]*?---/m;
	let agentsChecked = 0;
	let commandsChecked = 0;
	let driftCount = 0;

	for (const client of Object.values(CLIENTS)) {
		if (client.agentsDir) {
			const dir = expandPath(client.agentsDir);
			for (const a of resolveAgents(config, client.id)) {
				const target = join(dir, `${a.name}.md`);
				if (!existsSync(target)) continue;
				let current: string;
				try {
					current = readFileSync(target, "utf-8");
				} catch {
					continue;
				}
				if (!managedMarker.test(current)) continue;
				agentsChecked++;
				const canonical = readAgentMd(a.name);
				const body = canonical?.body ?? "";
				const expected = agentFanoutContent(a, body);
				if (hashString(current) !== hashString(expected)) {
					driftCount++;
					checks.push({
						id: "agent-drift",
						category: "parity",
						maxPoints: 3,
						earnedPoints: 0,
						severity: "warning",
						message: `Agent '${a.name}' fan-out in ${client.name} drifted from library. Run 'ensemble sync ${client.id}' to re-fan-out.`,
					});
				}
			}
		}
		if (client.commandsDir) {
			const dir = expandPath(client.commandsDir);
			for (const c of resolveCommands(config, client.id)) {
				const target = join(dir, `${c.name}.md`);
				if (!existsSync(target)) continue;
				let current: string;
				try {
					current = readFileSync(target, "utf-8");
				} catch {
					continue;
				}
				if (!managedMarker.test(current)) continue;
				commandsChecked++;
				const canonical = readCommandMd(c.name);
				const body = canonical?.body ?? "";
				const expected = commandFanoutContent(c, body);
				if (hashString(current) !== hashString(expected)) {
					driftCount++;
					checks.push({
						id: "command-drift",
						category: "parity",
						maxPoints: 3,
						earnedPoints: 0,
						severity: "warning",
						message: `Command '${c.name}' fan-out in ${client.name} drifted from library. Run 'ensemble sync ${client.id}' to re-fan-out.`,
					});
				}
			}
		}
	}
	if (driftCount === 0 && agentsChecked + commandsChecked > 0) {
		checks.push({
			id: "agents-commands-drift",
			category: "parity",
			maxPoints: 3,
			earnedPoints: 3,
			severity: "info",
			message: `${agentsChecked} agent fan-out(s) and ${commandsChecked} command fan-out(s) match the library.`,
		});
	}
	return checks;
}

/**
 * Retention config visibility: surface the current snapshot_retention_days
 * and snapshot_dir_size_warn_mb values so the user doesn't have to grep the
 * config file to know the pruning policy.
 */
function checkRetentionConfigVisibility(config: EnsembleConfig): DoctorCheck[] {
	const days = config.settings.snapshot_retention_days;
	const mb = config.settings.snapshot_dir_size_warn_mb ?? 500;
	const daysLabel = days === 0 ? "pruning disabled" : `${days} day${days === 1 ? "" : "s"}`;
	const mbLabel = mb === 0 ? "size warn disabled" : `warn at ${mb} MB`;
	return [
		{
			id: "snapshot-retention-config",
			category: "freshness",
			maxPoints: 1,
			earnedPoints: 1,
			severity: "info",
			message: `Snapshot retention: ${daysLabel}; ${mbLabel}.`,
		},
	];
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
		// v2.0.1 additive checks
		...checkOrphanSnapshots(config),
		...checkSnapshotDirSize(config),
		...checkAgentsCommandsDrift(config),
		...checkRetentionConfigVisibility(config),
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
