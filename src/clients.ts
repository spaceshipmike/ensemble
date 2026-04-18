/**
 * Client definitions, detection, and config file read/write.
 *
 * Defines the 17 AI clients Ensemble supports, their config paths,
 * format adapters, and the __ensemble marker system.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Server } from "./schemas.js";

export const ENSEMBLE_MARKER = "__ensemble";
export const LEGACY_MARKER = "__mcpoyle";
export const BACKUP_SUFFIX = ".ensemble-backup";

// --- Client definition ---

export interface ClientDef {
	id: string;
	name: string;
	configPath: string; // unexpanded (~ allowed)
	serversKey: string; // dot-separated key for server entries
	detectPaths?: string[];
	globPattern?: boolean;
	configFormat: "json" | "toml";
	skillsDir?: string; // unexpanded path for skills directory
	supportsPlugins?: boolean;
	contextWindow?: number; // max context window in tokens
	// Strict detection — when set, `isInstalled` ignores config files entirely
	// and requires the real artifact (app bundle or binary on PATH).
	// Config-file detection cannot be trusted because Ensemble itself writes
	// these files during sync, creating self-reinforcing phantom installs.
	requireApp?: string | string[]; // macOS .app bundle path; any-of semantics
	requireBin?: string; // binary name to resolve on PATH
	requireVscodeExtension?: string; // directory prefix in ~/.vscode/extensions
}

// --- Client registry ---

export const CLIENTS: Record<string, ClientDef> = {};

const clientDefs: ClientDef[] = [
	{
		id: "claude-desktop",
		name: "Claude Desktop",
		configPath: "~/Library/Application Support/Claude/claude_desktop_config.json",
		serversKey: "mcpServers",
		requireApp: "/Applications/Claude.app",
		configFormat: "json",
		contextWindow: 200000,
	},
	{
		id: "claude-code",
		name: "Claude Code",
		configPath: "~/.claude.json",
		serversKey: "mcpServers",
		requireBin: "claude",
		configFormat: "json",
		skillsDir: "~/.claude/skills",
		supportsPlugins: true,
		contextWindow: 200000,
	},
	{
		id: "cursor",
		name: "Cursor",
		configPath: "~/.cursor/mcp.json",
		serversKey: "mcpServers",
		requireApp: "/Applications/Cursor.app",
		configFormat: "json",
		skillsDir: "~/.cursor/skills",
		contextWindow: 128000,
	},
	{
		id: "vscode",
		name: "VS Code (Copilot)",
		configPath: "~/Library/Application Support/Code/User/settings.json",
		serversKey: "mcp.servers",
		requireApp: "/Applications/Visual Studio Code.app",
		configFormat: "json",
	},
	{
		id: "windsurf",
		name: "Windsurf",
		configPath: "~/.windsurf/mcp.json",
		serversKey: "mcpServers",
		requireApp: "/Applications/Windsurf.app",
		configFormat: "json",
		skillsDir: "~/.windsurf/skills",
	},
	{
		id: "zed",
		name: "Zed",
		configPath: "~/.config/zed/settings.json",
		serversKey: "context_servers",
		requireApp: "/Applications/Zed.app",
		configFormat: "json",
	},
	{
		id: "jetbrains",
		name: "JetBrains",
		configPath: "~/.config/JetBrains/*/mcp.json",
		serversKey: "mcpServers",
		configFormat: "json",
		globPattern: true,
	},
	{
		id: "gemini-cli",
		name: "Gemini CLI",
		configPath: "~/.gemini/settings.json",
		serversKey: "mcpServers",
		requireBin: "gemini",
		configFormat: "json",
		skillsDir: "~/.gemini/skills",
	},
	{
		// CLI and desktop app share ~/.codex/config.toml — one config, two
		// surfaces. Installed if either the `codex` binary or the Codex.app
		// bundle is present.
		id: "codex-cli",
		name: "Codex",
		configPath: "~/.codex/config.toml",
		serversKey: "mcp_servers",
		requireBin: "codex",
		requireApp: "/Applications/Codex.app",
		configFormat: "toml",
		skillsDir: "~/.codex/skills",
	},
	{
		id: "mcpx",
		name: "mcpx",
		configPath: "~/.config/mcpx/config.toml",
		serversKey: "servers",
		requireBin: "mcpx",
		configFormat: "toml",
	},
	{
		id: "copilot-cli",
		name: "Copilot CLI",
		configPath: "~/.copilot/mcp-config.json",
		serversKey: "mcpServers",
		// `gh` alone isn't sufficient — require the gh-copilot extension directory
		// to be present so users with plain `gh` aren't falsely flagged.
		requireBin: "gh-copilot",
		configFormat: "json",
	},
	{
		id: "copilot-jetbrains",
		name: "Copilot JetBrains",
		configPath: "~/.config/github-copilot/mcp.json",
		serversKey: "mcpServers",
		requireApp: [
			"/Applications/IntelliJ IDEA.app",
			"/Applications/IntelliJ IDEA Community Edition.app",
			"/Applications/PyCharm.app",
			"/Applications/PyCharm Community Edition.app",
			"/Applications/WebStorm.app",
			"/Applications/RubyMine.app",
			"/Applications/GoLand.app",
			"/Applications/PhpStorm.app",
			"/Applications/CLion.app",
			"/Applications/DataGrip.app",
			"/Applications/Rider.app",
			"/Applications/AppCode.app",
			"/Applications/Android Studio.app",
		],
		configFormat: "json",
	},
	{
		id: "amazon-q",
		name: "Amazon Q",
		configPath: "~/.aws/amazonq/mcp.json",
		serversKey: "mcpServers",
		requireApp: "/Applications/Amazon Q.app",
		configFormat: "json",
	},
	{
		id: "cline",
		name: "Cline",
		configPath:
			"~/.vscode/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
		serversKey: "mcpServers",
		requireVscodeExtension: "saoudrizwan.claude-dev",
		configFormat: "json",
	},
	{
		id: "roo-code",
		name: "Roo Code",
		configPath:
			"~/.vscode/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json",
		serversKey: "mcpServers",
		requireVscodeExtension: "rooveterinaryinc.roo-cline",
		configFormat: "json",
	},
	{
		id: "opencode",
		name: "OpenCode",
		configPath: "~/.opencode/config.json",
		serversKey: "mcpServers",
		requireBin: "opencode",
		configFormat: "json",
		skillsDir: "~/.opencode/skills",
	},
	{
		id: "amp",
		name: "Amp",
		configPath: "~/.ampcode/mcp.json",
		serversKey: "mcpServers",
		requireBin: "amp",
		configFormat: "json",
		skillsDir: "~/.ampcode/skills",
	},
];

for (const c of clientDefs) {
	CLIENTS[c.id] = c;
}

// --- Path helpers ---

export function expandPath(p: string): string {
	return p.replace(/^~/, homedir());
}

function isBinOnPath(name: string): boolean {
	const pathEnv = process.env.PATH;
	if (!pathEnv) return false;
	for (const dir of pathEnv.split(":")) {
		if (!dir) continue;
		if (existsSync(join(dir, name))) return true;
	}
	return false;
}

function hasVscodeExtension(prefix: string): boolean {
	// VS Code must actually be installed for an extension to be usable.
	if (!existsSync("/Applications/Visual Studio Code.app")) return false;
	const extDir = expandPath("~/.vscode/extensions");
	if (!existsSync(extDir)) return false;
	try {
		const { readdirSync } = require("node:fs") as typeof import("node:fs");
		const entries = readdirSync(extDir);
		return entries.some((e: string) => e.startsWith(`${prefix}-`) || e === prefix);
	} catch {
		return false;
	}
}

export function isInstalled(client: ClientDef): boolean {
	// Strict mode: any declared real-artifact requirement matching is sufficient.
	// OR semantics — used when a client has multiple surfaces (e.g. Codex has
	// both a CLI binary and a desktop app sharing one config).
	const hasStrict =
		client.requireApp !== undefined ||
		client.requireBin !== undefined ||
		client.requireVscodeExtension !== undefined;

	if (hasStrict) {
		if (client.requireApp !== undefined) {
			const apps = Array.isArray(client.requireApp)
				? client.requireApp
				: [client.requireApp];
			if (apps.some((p) => existsSync(expandPath(p)))) return true;
		}
		if (client.requireBin !== undefined && isBinOnPath(client.requireBin)) {
			return true;
		}
		if (
			client.requireVscodeExtension !== undefined &&
			hasVscodeExtension(client.requireVscodeExtension)
		) {
			return true;
		}
		return false;
	}

	// Legacy fallback — config-file based, kept for clients that haven't been
	// annotated with strict detection yet.
	if (client.globPattern) {
		return resolvedPaths(client).length > 0;
	}
	if (client.detectPaths) {
		return client.detectPaths.some((p) => existsSync(expandPath(p)));
	}
	return existsSync(expandPath(client.configPath));
}

export function resolvedPaths(client: ClientDef): string[] {
	if (!client.globPattern) {
		return [expandPath(client.configPath)];
	}
	// For glob patterns (JetBrains), use fs to scan
	const expanded = expandPath(client.configPath);
	const parts = expanded.split("*");
	if (parts.length !== 2) return [expanded];
	const parentDir = parts[0]!.slice(0, -1); // remove trailing /
	const suffix = parts[1]; // e.g., "/mcp.json"
	if (!existsSync(parentDir)) return [];
	const { readdirSync } = require("node:fs") as typeof import("node:fs");
	const entries = readdirSync(parentDir, { withFileTypes: true });
	const matches: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			const candidate = join(parentDir, entry.name, suffix!.slice(1));
			if (existsSync(candidate)) {
				matches.push(candidate);
			}
		}
	}
	return matches.sort();
}

/** Detect which clients are installed. */
export function detectClients(): ClientDef[] {
	return Object.values(CLIENTS).filter(isInstalled);
}

// --- Config read/write ---

export function readClientConfig(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	const raw = readFileSync(path, "utf-8");
	if (path.endsWith(".toml")) {
		return parseToml(raw) as Record<string, unknown>;
	}
	return JSON.parse(raw) as Record<string, unknown>;
}

function backupConfig(path: string): void {
	if (!existsSync(path)) return;
	const backupPath = `${path}${BACKUP_SUFFIX}`;
	if (!existsSync(backupPath)) {
		copyFileSync(path, backupPath);
	}
}

// --- Nested key helpers ---

function getNested(obj: Record<string, unknown>, key: string): unknown {
	const parts = key.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (typeof current !== "object" || current === null) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function setNested(obj: Record<string, unknown>, key: string, value: unknown): void {
	const parts = key.split(".");
	let current: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i]!;
		if (typeof current[part] !== "object" || current[part] === null) {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}
	current[parts[parts.length - 1]!] = value;
}

function getNestedPath(obj: Record<string, unknown>, parts: string[]): unknown {
	let current: unknown = obj;
	for (const part of parts) {
		if (typeof current !== "object" || current === null) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function setNestedPath(obj: Record<string, unknown>, parts: string[], value: unknown): void {
	let current: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i]!;
		if (typeof current[part] !== "object" || current[part] === null) {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}
	current[parts[parts.length - 1]!] = value;
}

// --- Server entry conversion ---

/** Convert a Server to the dict format used in client configs. */
export function serverToClientEntry(server: Server): Record<string, unknown> {
	const entry: Record<string, unknown> = { [ENSEMBLE_MARKER]: true };

	if (["sse", "http", "streamable-http"].includes(server.transport) && server.url) {
		entry["url"] = server.url;
		entry["transport"] = server.transport;
		if (server.auth_type && server.auth_ref) {
			entry["auth"] = { type: server.auth_type, ref: server.auth_ref };
		}
		if (Object.keys(server.env).length > 0) {
			entry["env"] = server.env;
		}
	} else {
		if (server.command) entry["command"] = server.command;
		if (server.args.length > 0) entry["args"] = server.args;
		if (Object.keys(server.env).length > 0) entry["env"] = server.env;
		if (server.transport && server.transport !== "stdio") {
			entry["transport"] = server.transport;
		}
	}
	return entry;
}

/** Check if a server entry is managed by ensemble (or legacy mcpoyle). */
function isManaged(entry: unknown): boolean {
	if (typeof entry !== "object" || entry === null) return false;
	const e = entry as Record<string, unknown>;
	return e[ENSEMBLE_MARKER] === true || e[LEGACY_MARKER] === true;
}

/** Get ensemble-managed server entries from a client config. */
export function getManagedServers(
	config: Record<string, unknown>,
	serversKey: string,
): Record<string, Record<string, unknown>> {
	const servers = getNested(config, serversKey);
	if (typeof servers !== "object" || servers === null) return {};
	const result: Record<string, Record<string, unknown>> = {};
	for (const [k, v] of Object.entries(servers as Record<string, unknown>)) {
		if (isManaged(v)) result[k] = v as Record<string, unknown>;
	}
	return result;
}

/** Get non-ensemble server entries from a client config. */
export function getUnmanagedServers(
	config: Record<string, unknown>,
	serversKey: string,
): Record<string, unknown> {
	const servers = getNested(config, serversKey);
	if (typeof servers !== "object" || servers === null) return {};
	const result: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(servers as Record<string, unknown>)) {
		if (!isManaged(v)) result[k] = v;
	}
	return result;
}

/** Write merged servers into a client config file, backing up first. */
export function writeClientConfig(
	path: string,
	serversKey: string,
	newServers: Record<string, unknown>,
): void {
	backupConfig(path);
	const existing = existsSync(path) ? readClientConfig(path) : {};
	const unmanaged = getUnmanagedServers(existing, serversKey);
	const merged = { ...unmanaged, ...newServers };
	setNested(existing, serversKey, merged);

	mkdirSync(dirname(path), { recursive: true });
	if (path.endsWith(".toml")) {
		writeFileSync(path, dictToToml(existing), "utf-8");
	} else {
		writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
	}
}

// --- Nested path variants (for project-level Claude Code configs) ---

export function getManagedServersNested(
	config: Record<string, unknown>,
	keyPath: string[],
): Record<string, Record<string, unknown>> {
	const servers = getNestedPath(config, keyPath);
	if (typeof servers !== "object" || servers === null) return {};
	const result: Record<string, Record<string, unknown>> = {};
	for (const [k, v] of Object.entries(servers as Record<string, unknown>)) {
		if (isManaged(v)) result[k] = v as Record<string, unknown>;
	}
	return result;
}

export function writeServersNested(
	path: string,
	keyPath: string[],
	newServers: Record<string, unknown>,
): void {
	backupConfig(path);
	const existing = existsSync(path) ? readClientConfig(path) : {};
	const currentServers = getNestedPath(existing, keyPath);
	const unmanaged: Record<string, unknown> = {};
	if (typeof currentServers === "object" && currentServers !== null) {
		for (const [k, v] of Object.entries(currentServers as Record<string, unknown>)) {
			if (!isManaged(v)) unmanaged[k] = v;
		}
	}
	setNestedPath(existing, keyPath, { ...unmanaged, ...newServers });
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
}

/** Get the JSON key path for a Claude Code project's mcpServers. */
export function projectServersKey(projectPath: string): string[] {
	const absPath = resolve(expandPath(projectPath));
	return ["projects", absPath, "mcpServers"];
}

// --- Claude Code settings helpers ---

// CC_SETTINGS_PATH is kept for import-compat with external consumers; do not
// cache it because $HOME may be overridden by tests / sandboxes. Use
// `ccSettingsPath()` internally so every read/write resolves lazily.
export const CC_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

/** Current Claude Code settings.json path — resolves $HOME at call time. */
export function ccSettingsPath(): string {
	return join(homedir(), ".claude", "settings.json");
}

export function readCCSettings(path?: string): Record<string, unknown> {
	const p = path ?? ccSettingsPath();
	if (!existsSync(p)) return {};
	return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
}

export function writeCCSettings(settings: Record<string, unknown>, path?: string): void {
	const p = path ?? ccSettingsPath();
	backupConfig(p);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

export function getEnabledPlugins(settings: Record<string, unknown>): Record<string, boolean> {
	return (settings["enabledPlugins"] ?? {}) as Record<string, boolean>;
}

export function getExtraMarketplaces(settings: Record<string, unknown>): Record<string, unknown> {
	return (settings["extraKnownMarketplaces"] ?? {}) as Record<string, unknown>;
}

// --- Orphan detection ---

/** Check if a server name exists as a managed entry in any client config (for diagnostic messages). */
export function findOrphanedInClients(name: string): string[] {
	const foundIn: string[] = [];
	for (const client of Object.values(CLIENTS)) {
		for (const path of resolvedPaths(client)) {
			try {
				const config = readClientConfig(path);
				const managed = getManagedServers(config, client.serversKey);
				if (name in managed) {
					foundIn.push(`${client.name} (${path})`);
				}
			} catch {
				continue;
			}
		}
	}
	return foundIn;
}

// --- Project settings helpers ---

export function readProjectSettings(projectPath: string, local = false): Record<string, unknown> {
	const resolved = resolve(expandPath(projectPath));
	const fname = local ? "settings.local.json" : "settings.json";
	const path = join(resolved, ".claude", fname);
	if (!existsSync(path)) return {};
	return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

export function writeProjectSettings(
	projectPath: string,
	settings: Record<string, unknown>,
	local = false,
): void {
	const resolved = resolve(expandPath(projectPath));
	const fname = local ? "settings.local.json" : "settings.json";
	const path = join(resolved, ".claude", fname);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

export function ensureProjectEnabledPluginsKey(projectPath: string): void {
	const settings = readProjectSettings(projectPath, false);
	if (!("enabledPlugins" in settings)) {
		settings["enabledPlugins"] = {};
		writeProjectSettings(projectPath, settings, false);
	}
}

// --- Import helpers ---

export interface ImportedServer {
	name: string;
	command: string;
	args: string[];
	env: Record<string, string>;
	transport: string;
	url: string;
	authType: string;
	authRef: string;
}

/** Extract non-managed server definitions from a client config. */
export function importServersFromClient(
	config: Record<string, unknown>,
	serversKey: string,
): ImportedServer[] {
	const servers = getNested(config, serversKey);
	if (typeof servers !== "object" || servers === null) return [];
	const result: ImportedServer[] = [];
	for (const [name, entry] of Object.entries(servers as Record<string, unknown>)) {
		if (typeof entry !== "object" || entry === null) continue;
		const e = entry as Record<string, unknown>;
		if (e[ENSEMBLE_MARKER] || e[LEGACY_MARKER]) continue;
		const auth = (typeof e["auth"] === "object" && e["auth"] !== null ? e["auth"] : {}) as Record<
			string,
			string
		>;
		result.push({
			name,
			command: (e["command"] as string) ?? "",
			args: (e["args"] as string[]) ?? [],
			env: (e["env"] as Record<string, string>) ?? {},
			transport: (e["transport"] as string) ?? "stdio",
			url: (e["url"] as string) ?? "",
			authType: auth["type"] ?? "",
			authRef: auth["ref"] ?? "",
		});
	}
	return result;
}

// --- TOML writer ---

function tomlKey(k: string): string {
	return /^[A-Za-z0-9_-]+$/.test(k) ? k : `"${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlValue(v: unknown): string {
	if (typeof v === "boolean") return v ? "true" : "false";
	if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
	if (typeof v === "string") return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	if (Array.isArray(v)) return `[${v.map(tomlValue).join(", ")}]`;
	if (typeof v === "object" && v !== null) {
		const items = Object.entries(v as Record<string, unknown>).map(
			([k, val]) => `${tomlKey(k)} = ${tomlValue(val)}`,
		);
		return `{${items.join(", ")}}`;
	}
	return `"${v}"`;
}

export function dictToToml(data: Record<string, unknown>, prefix = ""): string {
	const lines: string[] = [];
	const tables: [string, Record<string, unknown>][] = [];

	for (const [key, val] of Object.entries(data)) {
		if (typeof val === "object" && val !== null && !Array.isArray(val)) {
			tables.push([key, val as Record<string, unknown>]);
		} else {
			lines.push(`${tomlKey(key)} = ${tomlValue(val)}`);
		}
	}

	for (const [tableKey, tableVal] of tables) {
		const fullKey = prefix ? `${prefix}.${tomlKey(tableKey)}` : tomlKey(tableKey);
		lines.push("");
		lines.push(`[${fullKey}]`);
		const subTables: [string, Record<string, unknown>][] = [];
		for (const [k, v] of Object.entries(tableVal)) {
			if (typeof v === "object" && v !== null && !Array.isArray(v)) {
				subTables.push([k, v as Record<string, unknown>]);
			} else {
				lines.push(`${tomlKey(k)} = ${tomlValue(v)}`);
			}
		}
		for (const [subKey, subVal] of subTables) {
			const subFull = `${fullKey}.${tomlKey(subKey)}`;
			lines.push("");
			lines.push(`[${subFull}]`);
			for (const [k, v] of Object.entries(subVal)) {
				if (typeof v === "object" && v !== null && !Array.isArray(v)) {
					lines.push("");
					lines.push(`[${subFull}.${tomlKey(k)}]`);
					for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
						lines.push(`${tomlKey(k2)} = ${tomlValue(v2)}`);
					}
				} else {
					lines.push(`${tomlKey(k)} = ${tomlValue(v)}`);
				}
			}
		}
	}

	return `${lines.join("\n")}\n`;
}
