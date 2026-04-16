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
	cpSync,
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
import { canonicalPath, readManifest, type FileToolType } from "./library-store.js";

export type WireScope =
	| { kind: "global" }
	| { kind: "project"; path: string }
	/**
	 * v2.0.2: the canonical library store at `~/.config/ensemble/library/`.
	 * Used only as a wire source — tools never "live" in the library scope
	 * for runtime purposes (Claude Code never reads it), so targeting library
	 * from wire is a no-op.
	 */
	| { kind: "library" };

export interface WireRequest {
	/** Tool type — determines the storage strategy. */
	type: ToolType;
	/** Canonical tool name (not the id prefix). */
	name: string;
	/** Where the tool currently lives (source to copy from). */
	source: WireScope;
	/** Where to install it. */
	target: WireScope;
	/**
	 * v2.0.2 move-vs-copy semantics. Defaults to "move":
	 *
	 * - **move** (default): after the target write succeeds, attempt to unwire
	 *   from the source scope. If the source is ensemble-managed the unwire
	 *   removes it; if the source is user-authored (no managed marker), the
	 *   unwire is skipped and the result's `sourceUnwired` flag is false —
	 *   the wire still counts as successful, the source is just untouched.
	 * - **copy**: additive — the source remains wired at both scopes. This is
	 *   the old v2.0.1 behavior and is explicit under v2.0.2, reserved for
	 *   fan-out gestures (e.g. shift-click in the matrix).
	 *
	 * Moving to the same scope the source already lives at is a no-op — the
	 * wire short-circuits to `action: "skipped"` with reason `same-scope`.
	 */
	mode?: "move" | "copy";
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
	/**
	 * Move semantics only — whether the source-scope copy was successfully
	 * removed after the target write. False when the source was not
	 * ensemble-managed and the unwire was skipped for safety; also false
	 * for `mode: "copy"` (no attempt made).
	 */
	sourceUnwired?: boolean;
}

// ------------------------------------------------------------------------
// Paths
// ------------------------------------------------------------------------

function scopeBase(scope: WireScope): string {
	if (scope.kind === "global") return join(homedir(), ".claude");
	if (scope.kind === "library") {
		// Library scope has no Claude Code install dir — path helpers must not
		// ask for one. Call sites that reach here are a bug.
		throw new Error("scopeBase() not valid for library scope");
	}
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
	if (scope.kind === "library") {
		throw new Error("mcpFilePath() not valid for library scope");
	}
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

		// Library cannot be a target — it's a source-only scope.
		if (req.target.kind === "library") {
			return { ok: false, action: "skipped", reason: "library is not a valid wire target" };
		}

		// Move to the same scope the tool already lives at is a no-op.
		if (scopesEqual(req.source, req.target)) {
			return { ok: true, action: "skipped", reason: "same-scope" };
		}

		const wireResult = wireByType(req);
		if (!wireResult.ok) return wireResult;

		// Default mode is "move". Attempt to unwire the source after the
		// target write succeeds. Failure to unwire is non-fatal — we return
		// the successful wire result with sourceUnwired=false and a reason.
		const mode = req.mode ?? "move";
		if (mode === "copy") {
			return { ...wireResult, sourceUnwired: false };
		}

		// When the source is the library itself, "move" semantics don't
		// apply — the library is canonical and isn't consumed by wiring.
		if (req.source.kind === "library") {
			return { ...wireResult, sourceUnwired: false };
		}

		const unwire = unwireTool({
			type: req.type,
			name: req.name,
			scope: req.source,
		});
		return {
			...wireResult,
			sourceUnwired: unwire.ok && unwire.action === "unwired",
			reason: unwire.ok && unwire.action === "unwired"
				? wireResult.reason
				: `moved to target; source left in place (${unwire.reason ?? "not ensemble-managed"})`,
		};
	} catch (e) {
		return { ok: false, action: "failed", reason: e instanceof Error ? e.message : String(e) };
	}
}

/** Dispatch wire to the type-specific implementation without any move logic. */
function wireByType(req: WireRequest): WireResult {
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
}

function scopesEqual(a: WireScope, b: WireScope): boolean {
	if (a.kind === "global" && b.kind === "global") return true;
	if (a.kind === "project" && b.kind === "project") return a.path === b.path;
	return false;
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
	const targetPath = mdPathForTool(req.target, req.type, req.name);
	if (!targetPath) return { ok: false, action: "failed", reason: "bad tool type" };

	const sourcePath =
		req.source.kind === "library"
			? canonicalPath(req.type as FileToolType, req.name)
			: mdPathForTool(req.source, req.type, req.name);
	if (!sourcePath) return { ok: false, action: "failed", reason: "bad tool type" };
	if (!existsSync(sourcePath)) {
		return { ok: false, action: "failed", reason: `source not found: ${sourcePath}` };
	}

	// Skills are directories. When the source is the library, copy the whole
	// canonical skill directory so supporting assets travel too; otherwise
	// fall back to the single-file flow (marker is injected into the
	// frontmatter on write).
	if (req.type === "skill" && req.source.kind === "library") {
		const targetDir = dirname(targetPath);
		mkdirSync(dirname(targetDir), { recursive: true });
		cpSync(dirname(sourcePath), targetDir, { recursive: true });
		// Inject the managed marker into the target SKILL.md.
		try {
			const text = readFileSync(targetPath, "utf-8");
			const { meta, body } = parseFrontmatter(text);
			meta["ensemble"] = "managed";
			writeFileSync(targetPath, formatFrontmatter(meta, body), "utf-8");
		} catch {
			// Non-fatal — file exists, marker just didn't get injected.
		}
		return { ok: true, action: "wired" };
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
	let sourceDef: Record<string, unknown> | null;
	if (req.source.kind === "library") {
		// Pull the server def out of the canonical manifest.
		const manifest = readManifest();
		const entry = manifest?.entries[`${req.name}@discovered`];
		sourceDef = (entry?.serverDef as Record<string, unknown> | undefined) ?? null;
	} else {
		sourceDef = readMcpServerDef(req.source, req.name);
	}
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
