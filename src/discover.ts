/**
 * Discovery — scan well-known Claude Code directories for skills and plugins
 * that aren't yet registered in Ensemble's canonical store.
 *
 * Non-destructive: read-only scan + report. Import is a separate explicit step.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { frontmatterToSkill } from "./skills.js";
import type { EnsembleConfig, Skill } from "./schemas.js";

// --- Types ---

export interface DiscoveredSkill {
	name: string;
	source: "user" | "project";
	sourcePath: string;           // absolute path to SKILL.md
	projectPath?: string;         // set when source === "project"
	skill: Skill;                 // parsed frontmatter
	registered: boolean;          // already in ensemble store?
}

export interface DiscoveredPlugin {
	id: string;                   // e.g. "typescript-lsp@claude-plugins-official"
	name: string;
	marketplace: string;
	version: string;
	scope: "user" | "project" | "local";
	projectPaths: string[];       // where it's installed (may be empty for user scope)
	installPath: string;
	registered: boolean;          // already in ensemble config.plugins?
}

export interface DiscoveryReport {
	skills: DiscoveredSkill[];
	plugins: DiscoveredPlugin[];
	scannedPaths: string[];
	projectsScanned: number;
}

export interface DiscoverOptions {
	includeProjects?: boolean;    // default true
	projectRoots?: string[];      // default: ~/Code, ~/Projects
}

// --- Known paths ---

const USER_SKILLS_DIR = join(homedir(), ".claude", "skills");
const INSTALLED_PLUGINS_JSON = join(homedir(), ".claude", "plugins", "installed_plugins.json");

function defaultProjectRoots(): string[] {
	return [
		join(homedir(), "Code"),
		join(homedir(), "Projects"),
	].filter(existsSync);
}

// --- Skill scanning ---

function parseSkillMd(mdPath: string, nameHint: string): Skill | null {
	try {
		const text = readFileSync(mdPath, "utf-8");
		const { skill } = frontmatterToSkill(text, nameHint);
		skill.path = mdPath;
		return skill;
	} catch {
		return null;
	}
}

function scanSkillsDir(
	dir: string,
	source: "user" | "project",
	projectPath: string | undefined,
	registeredNames: Set<string>,
): DiscoveredSkill[] {
	if (!existsSync(dir)) return [];
	const out: DiscoveredSkill[] = [];
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const skillMd = join(dir, entry.name, "SKILL.md");
		if (!existsSync(skillMd)) continue;
		const skill = parseSkillMd(skillMd, entry.name);
		if (!skill) continue;
		out.push({
			name: entry.name,
			source,
			sourcePath: skillMd,
			projectPath,
			skill,
			registered: registeredNames.has(entry.name),
		});
	}
	return out;
}

// --- Plugin scanning ---

interface InstalledPluginEntry {
	scope: string;
	projectPath?: string;
	installPath: string;
	version: string;
}

interface InstalledPluginsFile {
	version?: number;
	plugins?: Record<string, InstalledPluginEntry[]>;
}

function scanInstalledPlugins(registeredIds: Set<string>): DiscoveredPlugin[] {
	if (!existsSync(INSTALLED_PLUGINS_JSON)) return [];
	let parsed: InstalledPluginsFile;
	try {
		parsed = JSON.parse(readFileSync(INSTALLED_PLUGINS_JSON, "utf-8"));
	} catch {
		return [];
	}
	if (!parsed.plugins) return [];

	const out: DiscoveredPlugin[] = [];
	for (const [fullId, entries] of Object.entries(parsed.plugins)) {
		if (!Array.isArray(entries) || entries.length === 0) continue;
		const [name, marketplace = ""] = fullId.split("@");
		if (!name) continue;

		const scopes = new Set(entries.map((e) => e.scope));
		let scope: "user" | "project" | "local" = "project";
		if (scopes.has("user")) scope = "user";
		else if (scopes.has("local")) scope = "local";

		const projectPaths = entries
			.map((e) => e.projectPath)
			.filter((p): p is string => typeof p === "string" && p.length > 0);

		out.push({
			id: fullId,
			name,
			marketplace,
			version: entries[0]!.version ?? "",
			scope,
			projectPaths,
			installPath: entries[0]!.installPath ?? "",
			registered: registeredIds.has(name) || registeredIds.has(fullId),
		});
	}
	return out;
}

// --- Project discovery ---

function findProjectsWithClaudeDir(root: string, maxDepth = 2): string[] {
	if (!existsSync(root)) return [];
	const found: string[] = [];
	const walk = (dir: string, depth: number) => {
		if (depth > maxDepth) return;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		// Is this dir itself a project with .claude?
		if (existsSync(join(dir, ".claude"))) {
			found.push(dir);
			return; // don't recurse into projects
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			walk(join(dir, entry.name), depth + 1);
		}
	};
	walk(root, 0);
	return found;
}

// --- Main API ---

export function discover(
	config: EnsembleConfig,
	opts: DiscoverOptions = {},
): DiscoveryReport {
	const includeProjects = opts.includeProjects !== false;
	const projectRoots = opts.projectRoots ?? defaultProjectRoots();

	const registeredSkillNames = new Set(config.skills.map((s) => s.name));
	const registeredPluginIds = new Set<string>();
	for (const p of config.plugins) {
		registeredPluginIds.add(p.name);
		if (p.marketplace) registeredPluginIds.add(`${p.name}@${p.marketplace}`);
	}

	const scannedPaths: string[] = [];
	const skills: DiscoveredSkill[] = [];

	// User skills
	if (existsSync(USER_SKILLS_DIR)) {
		scannedPaths.push(USER_SKILLS_DIR);
		skills.push(...scanSkillsDir(USER_SKILLS_DIR, "user", undefined, registeredSkillNames));
	}

	// Project skills
	let projectsScanned = 0;
	if (includeProjects) {
		for (const root of projectRoots) {
			const projects = findProjectsWithClaudeDir(root);
			for (const proj of projects) {
				projectsScanned++;
				const projSkillsDir = join(proj, ".claude", "skills");
				if (existsSync(projSkillsDir)) {
					scannedPaths.push(projSkillsDir);
					skills.push(...scanSkillsDir(projSkillsDir, "project", proj, registeredSkillNames));
				}
			}
		}
	}

	// Plugins (from user-level installed_plugins.json)
	const plugins: DiscoveredPlugin[] = [];
	if (existsSync(INSTALLED_PLUGINS_JSON)) {
		scannedPaths.push(INSTALLED_PLUGINS_JSON);
		plugins.push(...scanInstalledPlugins(registeredPluginIds));
	}

	// Sort deterministically
	skills.sort((a, b) => a.name.localeCompare(b.name));
	plugins.sort((a, b) => a.id.localeCompare(b.id));

	return { skills, plugins, scannedPaths, projectsScanned };
}

// --- Import helpers (pure operations) ---

/**
 * Return a skill ready to be inserted into config.skills via installSkill.
 * The caller is responsible for copying/linking SKILL.md into SKILLS_DIR.
 */
export function discoveredSkillToInstallParams(d: DiscoveredSkill): {
	name: string;
	description: string;
	origin: string;
	dependencies: string[];
	tags: string[];
	path: string;
} {
	return {
		name: d.name,
		description: d.skill.description,
		origin: d.source === "user" ? "discovered:~/.claude" : `discovered:${d.projectPath}`,
		dependencies: d.skill.dependencies,
		tags: d.skill.tags,
		path: d.sourcePath,
	};
}

export function discoveredPluginToInstallParams(d: DiscoveredPlugin): {
	name: string;
	marketplace: string;
} {
	return { name: d.name, marketplace: d.marketplace };
}
