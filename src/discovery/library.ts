/**
 * Library discovery — scan the user's Claude Code configuration for all
 * tool types (MCP servers, skills, subagents, slash commands, output styles,
 * plugins, hooks) at global (user) scope and optionally at a specific project
 * scope.
 *
 * Unlike the legacy ensemble config-first model, the library here is a read
 * over what Claude Code already sees on disk. Origin is tagged so the app can
 * show DISCOVERED vs MANAGED (ensemble-marked) content differently.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "../skills.js";

export type ToolType =
	| "server"
	| "skill"
	| "agent"
	| "command"
	| "style"
	| "plugin"
	| "hook";

export type ToolScope =
	| { kind: "global" }
	| { kind: "project"; path: string };

export interface DiscoveredTool {
	/** Stable id derived from type + name. */
	id: string;
	type: ToolType;
	name: string;
	description: string;
	scope: ToolScope;
	/** DISCOVERED if user-authored, MANAGED if ensemble added it. */
	origin: "discovered" | "managed";
	/** File path for file-based tools. */
	filePath?: string;
	/** Raw detail string shown under the name in lists. */
	detail: string;
	/** Plugin-only: whether the plugin is enabled at the scope where it was discovered.
	 * For plugins, presence in the library does NOT imply wired — this flag does. */
	pluginEnabled?: boolean;
	/** Plugin-only: marketplace identifier (e.g. "fctry"). Empty when unknown.
	 * Disambiguates the marketplace carrier from the user-facing description field. */
	pluginMarketplace?: string;
}

export interface LibrarySnapshot {
	globalTools: DiscoveredTool[];
}

/**
 * Entry point. Scan user-scope Claude Code locations and return a flat
 * list of discovered tools.
 */
export function scanLibraryGlobal(): DiscoveredTool[] {
	const tools: DiscoveredTool[] = [];
	const home = homedir();
	const claudeDir = join(home, ".claude");
	const settingsPath = join(claudeDir, "settings.json");
	const userJsonPath = join(home, ".claude.json");
	const installedPluginsPath = join(claudeDir, "plugins", "installed_plugins.json");

	// --- MCP servers ---
	tools.push(...scanMcpServers(userJsonPath, { kind: "global" }));

	// --- File-based types ---
	tools.push(...scanFileTools(join(claudeDir, "skills"), "skill", { kind: "global" }, true));
	tools.push(...scanFileTools(join(claudeDir, "agents"), "agent", { kind: "global" }, false));
	tools.push(...scanFileTools(join(claudeDir, "commands"), "command", { kind: "global" }, false));
	tools.push(...scanFileTools(join(claudeDir, "output-styles"), "style", { kind: "global" }, false));

	// --- Plugins from installed_plugins.json (authoritative inventory) ---
	tools.push(...scanInstalledPlugins(installedPluginsPath, settingsPath));

	// --- Hooks from settings.json ---
	if (safeExists(settingsPath)) {
		const settings = safeParseJson(settingsPath);
		if (settings) {
			tools.push(...scanHooks(settings, { kind: "global" }));
		}
	}

	return tools;
}

/**
 * Scan a single project's .claude/ directory and .mcp.json for tools.
 */
export function scanLibraryProject(projectPath: string): DiscoveredTool[] {
	if (!safeExists(projectPath)) return [];
	const tools: DiscoveredTool[] = [];
	const dotClaude = join(projectPath, ".claude");
	const scope: ToolScope = { kind: "project", path: projectPath };

	// MCP servers — project has a dedicated .mcp.json file
	const mcpPath = join(projectPath, ".mcp.json");
	if (safeExists(mcpPath)) {
		const data = safeParseJson(mcpPath);
		if (data?.mcpServers && typeof data.mcpServers === "object") {
			for (const [name, def] of Object.entries(data.mcpServers as Record<string, unknown>)) {
				if (!name || typeof def !== "object" || def === null) continue;
				tools.push({
					id: `server:${name}`,
					type: "server",
					name,
					description: "",
					scope,
					origin: isManagedJson(def) ? "managed" : "discovered",
					filePath: mcpPath,
					detail: mcpDetail(def as Record<string, unknown>),
				});
			}
		}
	}

	// File-based types
	if (safeExists(dotClaude)) {
		tools.push(...scanFileTools(join(dotClaude, "skills"), "skill", scope, true));
		tools.push(...scanFileTools(join(dotClaude, "agents"), "agent", scope, false));
		tools.push(...scanFileTools(join(dotClaude, "commands"), "command", scope, false));
		tools.push(...scanFileTools(join(dotClaude, "output-styles"), "style", scope, false));

		const settingsPath = join(dotClaude, "settings.json");
		if (safeExists(settingsPath)) {
			const settings = safeParseJson(settingsPath);
			if (settings) {
				tools.push(...scanProjectEnabledPlugins(settings, scope));
				tools.push(...scanHooks(settings, scope));
			}
		}
	}

	return tools;
}

/**
 * Read enabledPlugins at a project's settings.json and emit one entry per
 * plugin where the value === true. This represents actively-wired plugins
 * at the project scope; disabled entries are ignored.
 */
function scanProjectEnabledPlugins(
	settings: Record<string, unknown>,
	scope: ToolScope,
): DiscoveredTool[] {
	const enabled = settings.enabledPlugins;
	if (!enabled || typeof enabled !== "object") return [];
	const out: DiscoveredTool[] = [];
	for (const [key, value] of Object.entries(enabled as Record<string, unknown>)) {
		if (!key || value !== true) continue;
		const atIdx = key.lastIndexOf("@");
		const pluginName = atIdx > 0 ? key.slice(0, atIdx) : key;
		const marketplace = atIdx > 0 ? key.slice(atIdx + 1) : "";
		out.push({
			id: `plugin:${key}`,
			type: "plugin",
			name: pluginName,
			description: "",
			scope,
			origin: "discovered",
			detail: marketplace || "no marketplace",
			pluginEnabled: true,
			pluginMarketplace: marketplace,
		});
	}
	return out;
}

// ------------------------------------------------------------------------
// Type-specific scanners
// ------------------------------------------------------------------------

function scanMcpServers(userJsonPath: string, scope: ToolScope): DiscoveredTool[] {
	if (!safeExists(userJsonPath)) return [];
	const data = safeParseJson(userJsonPath);
	if (!data?.mcpServers || typeof data.mcpServers !== "object") return [];
	const out: DiscoveredTool[] = [];
	for (const [name, def] of Object.entries(data.mcpServers as Record<string, unknown>)) {
		if (!name || typeof def !== "object" || def === null) continue;
		out.push({
			id: `server:${name}`,
			type: "server",
			name,
			description: "",
			scope,
			origin: isManagedJson(def) ? "managed" : "discovered",
			filePath: userJsonPath,
			detail: mcpDetail(def as Record<string, unknown>),
		});
	}
	return out;
}

/**
 * Scan a directory of markdown-based tools.
 * @param nested true for skills (one dir per skill containing SKILL.md),
 *               false for flat dirs of <name>.md files.
 */
function scanFileTools(
	dir: string,
	type: ToolType,
	scope: ToolScope,
	nested: boolean,
): DiscoveredTool[] {
	if (!safeExists(dir)) return [];
	const out: DiscoveredTool[] = [];

	if (nested) {
		for (const entry of safeReaddir(dir)) {
			const subdir = join(dir, entry);
			if (!safeIsDir(subdir)) continue;
			const mdPath = join(subdir, "SKILL.md");
			if (!safeExists(mdPath)) continue;
			const tool = readMdTool(mdPath, type, scope, entry);
			if (tool) out.push(tool);
		}
	} else {
		for (const entry of safeReaddir(dir)) {
			if (!entry.endsWith(".md")) continue;
			const path = join(dir, entry);
			if (!safeIsFile(path)) continue;
			const baseName = entry.replace(/\.md$/, "");
			const tool = readMdTool(path, type, scope, baseName);
			if (tool) out.push(tool);
		}
	}

	return out;
}

function readMdTool(
	path: string,
	type: ToolType,
	scope: ToolScope,
	fallbackName: string,
): DiscoveredTool | null {
	try {
		const text = readFileSync(path, "utf-8");
		const { meta } = parseFrontmatter(text);
		const name = String(meta["name"] ?? fallbackName);
		const description = String(meta["description"] ?? "");
		const managed = String(meta["ensemble"] ?? "").toLowerCase() === "managed";
		return {
			id: `${type}:${name}`,
			type,
			name,
			description,
			scope,
			origin: managed ? "managed" : "discovered",
			filePath: path,
			detail: description || shortPath(path),
		};
	} catch {
		return null;
	}
}

// Legacy scanPlugins removed — replaced by scanInstalledPlugins (global inventory)
// and scanProjectEnabledPlugins (per-project enabled state).

/**
 * Read the authoritative plugin inventory from ~/.claude/plugins/installed_plugins.json.
 * Each key is a canonical "plugin-id@marketplace" string; the value is an array of
 * installation records with scope / projectPath / version / installPath.
 *
 * For the library view we emit one row per unique plugin id. Wire state for each
 * scope is determined separately by reading enabledPlugins at that scope.
 */
function scanInstalledPlugins(installedPath: string, userSettingsPath: string): DiscoveredTool[] {
	if (!safeExists(installedPath)) return [];
	const data = safeParseJson(installedPath);
	if (!data) return [];
	const plugins = data.plugins;
	if (!plugins || typeof plugins !== "object") return [];

	const userSettings = safeExists(userSettingsPath) ? safeParseJson(userSettingsPath) : null;
	const enabledMap = (userSettings?.enabledPlugins ?? {}) as Record<string, unknown>;

	const out: DiscoveredTool[] = [];
	for (const [key, installsRaw] of Object.entries(plugins as Record<string, unknown>)) {
		if (!key) continue;
		const installs = Array.isArray(installsRaw) ? installsRaw : [];
		// Parse id + marketplace
		const atIdx = key.lastIndexOf("@");
		const pluginName = atIdx > 0 ? key.slice(0, atIdx) : key;
		const marketplace = atIdx > 0 ? key.slice(atIdx + 1) : "";

		// Aggregate install metadata
		const versions = new Set<string>();
		const scopes = new Set<string>();
		for (const install of installs as Record<string, unknown>[]) {
			if (typeof install.version === "string") versions.add(install.version);
			if (typeof install.scope === "string") scopes.add(install.scope);
		}

		const globallyEnabled = enabledMap[key] === true;
		const versionStr = Array.from(versions).join(", ") || "?";
		const detailBits: string[] = [marketplace || "no marketplace", `v${versionStr}`];
		if (globallyEnabled) detailBits.push("ENABLED");
		else if (enabledMap[key] === false) detailBits.push("DISABLED");

		out.push({
			id: `plugin:${key}`,
			type: "plugin",
			name: pluginName,
			description: "",
			scope: { kind: "global" },
			origin: "discovered",
			detail: detailBits.join(" · "),
			pluginEnabled: globallyEnabled,
			pluginMarketplace: marketplace,
		});
	}
	return out;
}

function scanHooks(settings: Record<string, unknown>, scope: ToolScope): DiscoveredTool[] {
	const hooks = settings.hooks;
	if (!hooks || typeof hooks !== "object") return [];
	const out: DiscoveredTool[] = [];
	for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
		if (!Array.isArray(entries)) continue;
		entries.forEach((entry, i) => {
			if (!entry || typeof entry !== "object") return;
			const matcher = ((entry as Record<string, unknown>).matcher as string | undefined) ?? "";
			const hookSteps = (entry as Record<string, unknown>).hooks;
			const stepCount = Array.isArray(hookSteps) ? hookSteps.length : 0;
			out.push({
				id: `hook:${event}:${i}`,
				type: "hook",
				name: `${event}${matcher ? ` · ${matcher}` : ""}`,
				description: `${stepCount} step${stepCount === 1 ? "" : "s"}`,
				scope,
				origin: "discovered",
				detail: matcher || event,
			});
		});
	}
	return out;
}

// ------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------

function isManagedJson(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"__ensemble" in (value as object) &&
		(value as Record<string, unknown>).__ensemble === true
	);
}

function mcpDetail(def: Record<string, unknown>): string {
	const command = def.command as string | undefined;
	const url = def.url as string | undefined;
	const args = Array.isArray(def.args) ? (def.args as string[]) : [];
	if (command) return args.length ? `${command} ${args.join(" ")}` : command;
	if (url) return url;
	return "";
}

function safeExists(path: string): boolean {
	try {
		return existsSync(path);
	} catch {
		return false;
	}
}

function safeIsDir(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function safeIsFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function safeReaddir(path: string): string[] {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

function safeParseJson(path: string): Record<string, unknown> | null {
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
		return null;
	} catch {
		return null;
	}
}

function shortPath(path: string): string {
	return path.replace(homedir(), "~");
}
