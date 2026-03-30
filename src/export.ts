/**
 * Profile-as-plugin — export a group as a Claude Code plugin directory.
 *
 * Generates a self-contained plugin package that can be registered as a
 * local marketplace directory. Skills are COPIED (not symlinked) to ensure
 * portability.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getGroup, getServer, CONFIG_DIR } from "./config.js";
import { skillDir } from "./skills.js";
import type { EnsembleConfig } from "./schemas.js";

export interface ExportResult {
	ok: boolean;
	error: string;
	outputDir: string;
	serverCount: number;
	skillCount: number;
	messages: string[];
}

/**
 * Export a group as a CC plugin directory.
 *
 * Creates:
 * - plugin.json manifest with server configs
 * - skills/ directory with COPIED skill files (portable)
 *
 * The output can be registered as a local marketplace.
 */
export function exportGroupAsPlugin(
	config: EnsembleConfig,
	groupName: string,
	outputDir?: string,
): ExportResult {
	const group = getGroup(config, groupName);
	if (!group) {
		return { ok: false, error: `Group '${groupName}' not found.`, outputDir: "", serverCount: 0, skillCount: 0, messages: [] };
	}

	const outDir = outputDir ?? join(CONFIG_DIR, "plugins", groupName);
	mkdirSync(outDir, { recursive: true });

	// Build plugin manifest
	const servers: Record<string, Record<string, unknown>> = {};
	for (const serverName of group.servers) {
		const server = getServer(config, serverName);
		if (!server) continue;
		const entry: Record<string, unknown> = {};
		if (server.command) entry["command"] = server.command;
		if (server.args.length > 0) entry["args"] = server.args;
		if (Object.keys(server.env).length > 0) entry["env"] = server.env;
		if (server.transport && server.transport !== "stdio") entry["transport"] = server.transport;
		servers[serverName] = entry;
	}

	const manifest = {
		name: groupName,
		description: group.description || `Plugin profile generated from group '${groupName}'`,
		servers,
		skills: group.skills,
	};

	writeFileSync(join(outDir, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

	// Copy skills (NOT symlink — must be portable)
	let skillCount = 0;
	if (group.skills.length > 0) {
		const skillsOut = join(outDir, "skills");
		mkdirSync(skillsOut, { recursive: true });

		for (const skillName of group.skills) {
			const srcDir = skillDir(skillName);
			if (!existsSync(srcDir)) continue;
			const destDir = join(skillsOut, skillName);
			mkdirSync(destDir, { recursive: true });
			copyDirContents(srcDir, destDir);
			skillCount++;
		}
	}

	const messages = [
		`Exported group '${groupName}' as plugin to ${outDir}`,
		`  ${Object.keys(servers).length} server(s), ${skillCount} skill(s)`,
	];
	if (group.plugins.length > 0) {
		messages.push(`  ${group.plugins.length} plugin reference(s) (not included in export)`);
	}

	return {
		ok: true,
		error: "",
		outputDir: outDir,
		serverCount: Object.keys(servers).length,
		skillCount,
		messages,
	};
}

function copyDirContents(src: string, dest: string): void {
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			mkdirSync(destPath, { recursive: true });
			copyDirContents(srcPath, destPath);
		} else {
			copyFileSync(srcPath, destPath);
		}
	}
}
