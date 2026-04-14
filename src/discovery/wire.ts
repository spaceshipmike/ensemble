/**
 * Wire operations — copy a discovered tool into a target scope, or remove
 * a managed copy. Paired with the library scanner to implement the
 * (tool, scope) bipartite graph edges.
 *
 * All writes respect the additive-sync rule: ensemble only removes content
 * that it authored, identified by the `ensemble: managed` frontmatter tag
 * (for markdown-based tools) or the `__ensemble: true` JSON flag (for
 * settings/MCP entries). User-authored content is never deleted.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { formatFrontmatter, parseFrontmatter } from "../skills.js";
import type { ToolType } from "./library.js";

export type WireScope =
	| { kind: "global" }
	| { kind: "project"; path: string };

export interface WireRequest {
	/** Tool type — determines the storage strategy. */
	type: ToolType;
	/** Canonical tool name (not the id prefix). */
	name: string;
	/** Where the tool currently lives (source to copy from). */
	source: WireScope;
	/** Where to install it. */
	target: WireScope;
}

export interface UnwireRequest {
	type: ToolType;
	name: string;
	scope: WireScope;
}

export interface WireResult {
	ok: boolean;
	action: "wired" | "unwired" | "skipped" | "failed";
	reason?: string;
}

// ------------------------------------------------------------------------
// Paths
// ------------------------------------------------------------------------

function scopeBase(scope: WireScope): string {
	if (scope.kind === "global") return join(homedir(), ".claude");
	return join(scope.path, ".claude");
}

function mdPathForTool(scope: WireScope, type: ToolType, name: string): string | null {
	const base = scopeBase(scope);
	switch (type) {
		case "skill":
			return join(base, "skills", name, "SKILL.md");
		case "agent":
			return join(base, "agents", `${name}.md`);
		case "command":
			return join(base, "commands", `${name}.md`);
		case "style":
			return join(base, "output-styles", `${name}.md`);
		default:
			return null;
	}
}

function mcpFilePath(scope: WireScope): string {
	if (scope.kind === "global") return join(homedir(), ".claude.json");
	return join(scope.path, ".mcp.json");
}

function settingsPath(scope: WireScope): string {
	return join(scopeBase(scope), "settings.json");
}

// ------------------------------------------------------------------------
// Entry points
// ------------------------------------------------------------------------

export function wireTool(req: WireRequest): WireResult {
	try {
		if (req.type === "hook") {
			return { ok: false, action: "skipped", reason: "hooks are read-only in v1" };
		}
		if (["skill", "agent", "command", "style"].includes(req.type)) {
			return wireMdTool(req);
		}
		if (req.type === "server") {
			return wireMcpServer(req);
		}
		if (req.type === "plugin") {
			return wirePlugin(req);
		}
		return { ok: false, action: "skipped", reason: `unknown type: ${req.type}` };
	} catch (e) {
		return { ok: false, action: "failed", reason: e instanceof Error ? e.message : String(e) };
	}
}

export function unwireTool(req: UnwireRequest): WireResult {
	try {
		if (req.type === "hook") {
			return { ok: false, action: "skipped", reason: "hooks are read-only in v1" };
		}
		if (["skill", "agent", "command", "style"].includes(req.type)) {
			return unwireMdTool(req);
		}
		if (req.type === "server") {
			return unwireMcpServer(req);
		}
		if (req.type === "plugin") {
			return unwirePlugin(req);
		}
		return { ok: false, action: "skipped", reason: `unknown type: ${req.type}` };
	} catch (e) {
		return { ok: false, action: "failed", reason: e instanceof Error ? e.message : String(e) };
	}
}

// ------------------------------------------------------------------------
// Markdown-based tools (skills, agents, commands, output styles)
// ------------------------------------------------------------------------

function wireMdTool(req: WireRequest): WireResult {
	const sourcePath = mdPathForTool(req.source, req.type, req.name);
	const targetPath = mdPathForTool(req.target, req.type, req.name);
	if (!sourcePath || !targetPath) {
		return { ok: false, action: "failed", reason: "bad tool type" };
	}
	if (!existsSync(sourcePath)) {
		return { ok: false, action: "failed", reason: `source not found: ${sourcePath}` };
	}

	// Read source, inject ensemble: managed marker, write target.
	const text = readFileSync(sourcePath, "utf-8");
	const { meta, body } = parseFrontmatter(text);
	meta["ensemble"] = "managed";
	const marked = formatFrontmatter(meta, body);

	mkdirSync(dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, marked, "utf-8");
	return { ok: true, action: "wired" };
}

function unwireMdTool(req: UnwireRequest): WireResult {
	const path = mdPathForTool(req.scope, req.type, req.name);
	if (!path) return { ok: false, action: "failed", reason: "bad tool type" };
	if (!existsSync(path)) {
		return { ok: true, action: "skipped", reason: "not present" };
	}

	// Only delete if the file carries our marker.
	try {
		const text = readFileSync(path, "utf-8");
		const { meta } = parseFrontmatter(text);
		if (String(meta["ensemble"] ?? "").toLowerCase() !== "managed") {
			return { ok: false, action: "skipped", reason: "not ensemble-managed; refusing to delete" };
		}
	} catch (e) {
		return { ok: false, action: "failed", reason: `read failed: ${e instanceof Error ? e.message : e}` };
	}

	// Skills are directories; everything else is a file.
	if (req.type === "skill") {
		rmSync(dirname(path), { recursive: true, force: true });
	} else {
		unlinkSync(path);
	}
	return { ok: true, action: "unwired" };
}

// ------------------------------------------------------------------------
// MCP servers
// ------------------------------------------------------------------------

function wireMcpServer(req: WireRequest): WireResult {
	const sourceDef = readMcpServerDef(req.source, req.name);
	if (!sourceDef) {
		return { ok: false, action: "failed", reason: `source server not found: ${req.name}` };
	}

	const marked = { ...sourceDef, __ensemble: true };
	writeMcpServerDef(req.target, req.name, marked);
	return { ok: true, action: "wired" };
}

function unwireMcpServer(req: UnwireRequest): WireResult {
	const def = readMcpServerDef(req.scope, req.name);
	if (!def) return { ok: true, action: "skipped", reason: "not present" };

	if ((def as Record<string, unknown>).__ensemble !== true) {
		return {
			ok: false,
			action: "skipped",
			reason: "not ensemble-managed; refusing to remove",
		};
	}

	removeMcpServerDef(req.scope, req.name);
	return { ok: true, action: "unwired" };
}

function readMcpServerDef(scope: WireScope, name: string): Record<string, unknown> | null {
	const path = mcpFilePath(scope);
	if (!existsSync(path)) return null;
	try {
		const data = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
		const servers = (data.mcpServers ?? {}) as Record<string, unknown>;
		const def = servers[name];
		if (typeof def !== "object" || def === null) return null;
		return def as Record<string, unknown>;
	} catch {
		return null;
	}
}

function writeMcpServerDef(scope: WireScope, name: string, def: Record<string, unknown>): void {
	const path = mcpFilePath(scope);
	mkdirSync(dirname(path), { recursive: true });

	let data: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			data = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
		} catch {
			data = {};
		}
	}
	const servers = (data.mcpServers ?? {}) as Record<string, unknown>;
	servers[name] = def;
	data.mcpServers = servers;

	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function removeMcpServerDef(scope: WireScope, name: string): void {
	const path = mcpFilePath(scope);
	if (!existsSync(path)) return;
	let data: Record<string, unknown> = {};
	try {
		data = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
	} catch {
		return;
	}
	const servers = (data.mcpServers ?? {}) as Record<string, unknown>;
	delete servers[name];
	data.mcpServers = servers;
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

// ------------------------------------------------------------------------
// Plugins (settings.json → enabledPlugins boolean flip)
// ------------------------------------------------------------------------

function wirePlugin(req: WireRequest): WireResult {
	// For plugins, the "name" is actually the canonical key "plugin-id@marketplace".
	// Wiring sets enabledPlugins[key] = true at the target scope.
	const key = req.name;
	const path = settingsPath(req.target);
	const settings = readSettings(path);
	const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>;

	// Track which keys ensemble set so unwire is safe.
	const managed = (settings.__ensemble_plugins ?? []) as string[];

	enabled[key] = true;
	if (!managed.includes(key)) managed.push(key);

	settings.enabledPlugins = enabled;
	settings.__ensemble_plugins = managed;
	writeSettings(path, settings);
	return { ok: true, action: "wired" };
}

function unwirePlugin(req: UnwireRequest): WireResult {
	const key = req.name;
	const path = settingsPath(req.scope);
	if (!existsSync(path)) return { ok: true, action: "skipped", reason: "no settings.json" };
	const settings = readSettings(path);
	const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>;
	const managed = (settings.__ensemble_plugins ?? []) as string[];

	if (!managed.includes(key)) {
		return {
			ok: false,
			action: "skipped",
			reason: "not ensemble-managed; refusing to remove",
		};
	}

	delete enabled[key];
	settings.enabledPlugins = enabled;
	settings.__ensemble_plugins = managed.filter((k) => k !== key);
	writeSettings(path, settings);
	return { ok: true, action: "unwired" };
}

// ------------------------------------------------------------------------
// Settings helpers
// ------------------------------------------------------------------------

function readSettings(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function writeSettings(path: string, settings: Record<string, unknown>): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}
