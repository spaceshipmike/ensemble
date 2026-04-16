/**
 * Guided onboarding — `ensemble init` command logic.
 *
 * Walks through client detection, server/skill import, group creation,
 * assignment, and initial sync. Safe to re-run — skips completed steps.
 *
 * Two modes:
 * - Interactive: prompts at each step (handled by CLI layer)
 * - Auto (--auto): imports everything, creates no groups, syncs all
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	CLIENTS,
	type ClientDef,
	detectClients,
	expandPath,
	importServersFromClient,
	readClientConfig,
} from "./clients.js";
import { getServer, loadConfig } from "./config.js";
import { addServer, installSkill } from "./operations.js";
import { frontmatterToSkill } from "./skills.js";
import { syncClient, syncSkills } from "./sync.js";
import type { EnsembleConfig } from "./schemas.js";

// --- Types ---

export interface DetectedClient {
	def: ClientDef;
	installed: boolean;
	supportsSkills: boolean;
}

export interface ServerLandscape {
	name: string;
	command: string;
	args: string[];
	foundIn: string[]; // client IDs where this server exists
}

export interface SkillLandscape {
	name: string;
	foundIn: string[];
}

export interface InitResult {
	config: EnsembleConfig;
	detectedClients: DetectedClient[];
	serversImported: number;
	skillsImported: number;
	groupsCreated: string[];
	clientsSynced: string[];
	messages: string[];
}

// --- Detection ---

export function detectClientLandscape(): DetectedClient[] {
	const detected = detectClients();
	return Object.values(CLIENTS).map((def) => ({
		def,
		installed: detected.some((d) => d.id === def.id),
		supportsSkills: !!def.skillsDir,
	}));
}

export function scanServerLandscape(clients: DetectedClient[]): ServerLandscape[] {
	const serverMap = new Map<string, ServerLandscape>();

	for (const client of clients) {
		if (!client.installed) continue;
		const configPath = expandPath(client.def.configPath);
		if (!existsSync(configPath) || client.def.globPattern) continue;

		try {
			const config = readClientConfig(configPath);
			const servers = importServersFromClient(config, client.def.serversKey);
			for (const s of servers) {
				const existing = serverMap.get(s.name);
				if (existing) {
					existing.foundIn.push(client.def.id);
				} else {
					serverMap.set(s.name, {
						name: s.name,
						command: s.command,
						args: s.args,
						foundIn: [client.def.id],
					});
				}
			}
		} catch {
			// Skip unreadable configs
		}
	}

	return Array.from(serverMap.values());
}

export function scanSkillLandscape(clients: DetectedClient[]): SkillLandscape[] {
	const skillMap = new Map<string, SkillLandscape>();

	for (const client of clients) {
		if (!client.installed || !client.def.skillsDir) continue;
		const skillsDir = expandPath(client.def.skillsDir);
		if (!existsSync(skillsDir)) continue;

		try {
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const skillMd = join(skillsDir, entry.name, "SKILL.md");
				if (!existsSync(skillMd)) continue;

				const existing = skillMap.get(entry.name);
				if (existing) {
					existing.foundIn.push(client.def.id);
				} else {
					skillMap.set(entry.name, {
						name: entry.name,
						foundIn: [client.def.id],
					});
				}
			}
		} catch {
			// Skip unreadable skills dirs
		}
	}

	return Array.from(skillMap.values());
}

// --- Auto init ---

export function initAuto(): InitResult {
	let config = loadConfig();
	const messages: string[] = [];

	// 1. Detect clients
	const detectedClients = detectClientLandscape();
	const installed = detectedClients.filter((c) => c.installed);
	messages.push(`Detected ${installed.length} installed client(s)`);

	// 2. Scan and import servers
	const landscape = scanServerLandscape(detectedClients);
	let serversImported = 0;
	for (const entry of landscape) {
		if (getServer(config, entry.name)) continue; // Already exists
		const { config: newConfig, result } = addServer(config, {
			name: entry.name,
			command: entry.command,
			args: entry.args,
			origin: {
				source: "import",
				client: entry.foundIn[0],
				timestamp: new Date().toISOString(),
			},
		});
		if (result.ok) {
			config = newConfig;
			serversImported++;
		}
	}
	if (serversImported > 0) {
		messages.push(`Imported ${serversImported} server(s)`);
	}

	// 3. Scan and import skills
	const skillLandscape = scanSkillLandscape(detectedClients);
	let skillsImported = 0;
	for (const entry of skillLandscape) {
		if (config.skills.some((s) => s.name === entry.name)) continue;
		// Read the SKILL.md to extract metadata
		const clientDef = CLIENTS[entry.foundIn[0]!];
		if (!clientDef?.skillsDir) continue;
		const skillMdPath = join(expandPath(clientDef.skillsDir), entry.name, "SKILL.md");
		if (!existsSync(skillMdPath)) continue;

		try {
			const { readFileSync } = require("node:fs") as typeof import("node:fs");
			const content = readFileSync(skillMdPath, "utf-8");
			const { skill } = frontmatterToSkill(content, entry.name);
			const { config: newConfig, result } = installSkill(config, {
				name: entry.name,
				description: skill.description,
				origin: "import",
				tags: skill.tags,
				dependencies: skill.dependencies,
				path: skillMdPath,
			});
			if (result.ok) {
				config = newConfig;
				skillsImported++;
			}
		} catch {
			// Skip unreadable skills
		}
	}
	if (skillsImported > 0) {
		messages.push(`Imported ${skillsImported} skill(s)`);
	}

	// 4. Install ensemble-usage meta-skill if not present
	if (!config.skills.some((s) => s.name === "ensemble-usage")) {
		const { config: newConfig, result } = installSkill(config, {
			name: "ensemble-usage",
			description: "Teaches AI agents how to use Ensemble CLI commands",
			origin: "builtin",
		});
		if (result.ok) {
			config = newConfig;
			messages.push("Installed ensemble-usage meta-skill");
		}
	}

	// 5. No groups in auto mode

	// 6. Sync all detected clients
	const clientsSynced: string[] = [];
	for (const client of installed) {
		const { config: newConfig } = syncClient(config, client.def.id);
		config = newConfig;
		clientsSynced.push(client.def.id);
		// Sync skills for clients that support them
		if (client.supportsSkills) {
			syncSkills(config, client.def.id);
		}
	}
	if (clientsSynced.length > 0) {
		messages.push(`Synced ${clientsSynced.length} client(s)`);
	}

	return {
		config,
		detectedClients,
		serversImported,
		skillsImported,
		groupsCreated: [],
		clientsSynced,
		messages,
	};
}

// --- Interactive init helpers (for CLI layer) ---

export function importSelectedServers(
	config: EnsembleConfig,
	servers: ServerLandscape[],
): { config: EnsembleConfig; count: number } {
	let count = 0;
	let current = config;
	for (const entry of servers) {
		if (getServer(current, entry.name)) continue;
		const { config: newConfig, result } = addServer(current, {
			name: entry.name,
			command: entry.command,
			args: entry.args,
			origin: {
				source: "import",
				client: entry.foundIn[0],
				timestamp: new Date().toISOString(),
			},
		});
		if (result.ok) {
			current = newConfig;
			count++;
		}
	}
	return { config: current, count };
}
