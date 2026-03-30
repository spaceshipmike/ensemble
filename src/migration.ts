/**
 * Migration from mcpoyle to Ensemble.
 *
 * Detects legacy mcpoyle installations and migrates:
 * - Config file (~/.config/mcpoyle/config.json → ~/.config/ensemble/config.json)
 * - Skills store (~/.config/mcpoyle/skills/ → ~/.config/ensemble/skills/)
 * - Cache directory (~/.config/mcpoyle/cache/ → ~/.config/ensemble/cache/)
 * - Client config markers (__mcpoyle → __ensemble)
 * - Symlinks in client skills directories (update targets)
 * - Meta-skill rename (mcpoyle-usage → ensemble-usage)
 *
 * Migration is idempotent — running it twice produces the same result.
 */

import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	renameSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CLIENTS, ENSEMBLE_MARKER, LEGACY_MARKER, expandPath, resolvedPaths } from "./clients.js";
import { CONFIG_DIR, SKILLS_DIR, CACHE_DIR } from "./config.js";

const LEGACY_CONFIG_DIR = join(homedir(), ".config", "mcpoyle");
const LEGACY_CONFIG_PATH = join(LEGACY_CONFIG_DIR, "config.json");
const LEGACY_SKILLS_DIR = join(LEGACY_CONFIG_DIR, "skills");
const LEGACY_CACHE_DIR = join(LEGACY_CONFIG_DIR, "cache");

export interface MigrationAction {
	type: "copy-config" | "move-skills" | "move-cache" | "replace-marker" | "update-symlink" | "rename-skill";
	source: string;
	target: string;
	detail?: string;
}

export interface MigrationResult {
	migrated: boolean;
	actions: MigrationAction[];
	messages: string[];
}

/** Check if a mcpoyle installation exists that needs migration. */
export function needsMigration(): boolean {
	return existsSync(LEGACY_CONFIG_PATH) && !existsSync(join(CONFIG_DIR, "config.json"));
}

/** Run the full migration from mcpoyle to Ensemble. Idempotent. */
export function migrate(dryRun = false): MigrationResult {
	const actions: MigrationAction[] = [];
	const messages: string[] = [];

	// 1. Migrate config file
	if (existsSync(LEGACY_CONFIG_PATH) && !existsSync(join(CONFIG_DIR, "config.json"))) {
		actions.push({
			type: "copy-config",
			source: LEGACY_CONFIG_PATH,
			target: join(CONFIG_DIR, "config.json"),
		});
		if (!dryRun) {
			mkdirSync(CONFIG_DIR, { recursive: true });
			copyFileSync(LEGACY_CONFIG_PATH, join(CONFIG_DIR, "config.json"));
		}
		messages.push("Copied config from mcpoyle to ensemble");
	}

	// 2. Migrate skills store
	if (existsSync(LEGACY_SKILLS_DIR) && !existsSync(SKILLS_DIR)) {
		const skillDirs = readdirSync(LEGACY_SKILLS_DIR, { withFileTypes: true })
			.filter((d) => d.isDirectory());

		for (const skillDir of skillDirs) {
			const source = join(LEGACY_SKILLS_DIR, skillDir.name);
			const target = join(SKILLS_DIR, skillDir.name);
			actions.push({ type: "move-skills", source, target });
			if (!dryRun) {
				mkdirSync(target, { recursive: true });
				// Copy files recursively
				copyDirRecursive(source, target);
			}
		}

		// Rename mcpoyle-usage to ensemble-usage if present
		const legacyMeta = join(SKILLS_DIR, "mcpoyle-usage");
		const newMeta = join(SKILLS_DIR, "ensemble-usage");
		if (!dryRun && existsSync(legacyMeta) && !existsSync(newMeta)) {
			renameSync(legacyMeta, newMeta);
			// Update the SKILL.md content
			const skillPath = join(newMeta, "SKILL.md");
			if (existsSync(skillPath)) {
				let content = readFileSync(skillPath, "utf-8");
				content = content.replace(/mcpoyle/g, "ensemble").replace(/mcp /g, "ensemble ");
				writeFileSync(skillPath, content, "utf-8");
			}
			actions.push({ type: "rename-skill", source: "mcpoyle-usage", target: "ensemble-usage" });
		}

		if (skillDirs.length > 0) {
			messages.push(`Migrated ${skillDirs.length} skill(s) to ensemble store`);
		}
	}

	// 3. Migrate cache
	if (existsSync(LEGACY_CACHE_DIR) && !existsSync(CACHE_DIR)) {
		actions.push({ type: "move-cache", source: LEGACY_CACHE_DIR, target: CACHE_DIR });
		if (!dryRun) {
			mkdirSync(dirname(CACHE_DIR), { recursive: true });
			copyDirRecursive(LEGACY_CACHE_DIR, CACHE_DIR);
		}
		messages.push("Migrated cache to ensemble directory");
	}

	// 4. Replace __mcpoyle markers in client configs
	for (const clientDef of Object.values(CLIENTS)) {
		for (const configPath of resolvedPaths(clientDef)) {
			if (!existsSync(configPath)) continue;
			try {
				const raw = readFileSync(configPath, "utf-8");
				if (raw.includes(LEGACY_MARKER)) {
					const updated = raw.replace(new RegExp(`"${LEGACY_MARKER}"`, "g"), `"${ENSEMBLE_MARKER}"`);
					if (updated !== raw) {
						actions.push({
							type: "replace-marker",
							source: configPath,
							target: configPath,
							detail: `${LEGACY_MARKER} → ${ENSEMBLE_MARKER}`,
						});
						if (!dryRun) {
							writeFileSync(configPath, updated, "utf-8");
						}
					}
				}
			} catch {
				// Skip unreadable configs
			}
		}
	}

	// 5. Update symlinks in client skills directories
	for (const clientDef of Object.values(CLIENTS)) {
		if (!clientDef.skillsDir) continue;
		const skillsDir = expandPath(clientDef.skillsDir);
		if (!existsSync(skillsDir)) continue;

		try {
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const skillMd = join(skillsDir, entry.name, "SKILL.md");
				try {
					const stat = lstatSync(skillMd);
					if (stat.isSymbolicLink()) {
						const target = readlinkSync(skillMd);
						if (target.includes(".config/mcpoyle/skills/")) {
							const newTarget = target.replace(".config/mcpoyle/skills/", ".config/ensemble/skills/");
							actions.push({
								type: "update-symlink",
								source: skillMd,
								target: newTarget,
							});
							if (!dryRun) {
								unlinkSync(skillMd);
								symlinkSync(newTarget, skillMd);
							}
						}
					}
				} catch {
					// Not a symlink or error reading
				}
			}
		} catch {
			// Can't read skills dir
		}
	}

	if (actions.length === 0) {
		messages.push("No mcpoyle installation found — nothing to migrate");
	}

	// 6. Update config to replace mcpoyle references
	if (!dryRun && existsSync(join(CONFIG_DIR, "config.json"))) {
		try {
			let configContent = readFileSync(join(CONFIG_DIR, "config.json"), "utf-8");
			if (configContent.includes("mcpoyle")) {
				configContent = configContent.replace(/\.config\/mcpoyle\//g, ".config/ensemble/");
				configContent = configContent.replace(/mcpoyle-usage/g, "ensemble-usage");
				writeFileSync(join(CONFIG_DIR, "config.json"), configContent, "utf-8");
			}
		} catch {
			// Non-fatal
		}
	}

	return {
		migrated: actions.length > 0,
		actions,
		messages,
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
