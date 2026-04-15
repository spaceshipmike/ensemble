/**
 * Library store — the canonical, Ensemble-owned inventory under
 * `~/.config/ensemble/library/`, independent of any Claude Code scope.
 *
 * This is the v2.0.2 refinement of the library concept: Claude Code never
 * reads this directory. Install state (which scopes a resource is wired to)
 * is the only thing projected into `.claude/`; the library is the upstream.
 *
 * First slice (this commit):
 * - Manifest schema + load/save.
 * - Bootstrap: populate the store from a scan of `~/.claude/` global + known
 *   project `.claude/`s. File-based types only (skill, agent, command, style).
 *   Servers and plugins are deferred until after the file-based loop is
 *   proven — they store differently (inline JSON / marketplace ref) and
 *   bolt on cheaply once the core hash/file pipeline works.
 * - Identity: `name@source` where source is "@discovered" for bootstrap
 *   adoptions, or a marketplace id once linked.
 * - Ignore list: string array of entry ids the user has dismissed (empty
 *   until a UI gesture produces one).
 *
 * Not in this commit: server storage, plugin storage, orphan/drift
 * reconciliation, per-entry history. Those land behind the same schema.
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { scanLibraryGlobal, scanLibraryProject, type DiscoveredTool, type ToolType } from "./library.js";

// ------------------------------------------------------------------------
// Schema
// ------------------------------------------------------------------------

/** Types whose canonical form is a markdown file in the library store. */
export type FileToolType = "skill" | "agent" | "command" | "style";

export interface LibraryEntry {
	/** "name@source", e.g. "pencil@official-mcp", "foo@discovered". */
	id: string;
	type: ToolType;
	name: string;
	/** Marketplace id, "@discovered", or "@local". */
	source: string;
	/** Path relative to library root, present for file-based types. */
	filePath?: string;
	/** SHA-256 of canonical content, present for file-based types. */
	contentHash?: string;
	/** MCP server definition, present for type === "server". */
	serverDef?: {
		command?: string;
		args?: string[];
		env?: Record<string, string>;
		transport?: string;
		url?: string;
		[key: string]: unknown;
	};
	/** Marketplace key for type === "plugin" (e.g. "fctry"). */
	pluginMarketplace?: string;
	/** ISO timestamp — when added to the library. */
	createdAt: string;
}

export interface LibraryManifest {
	/** Manifest format version (not spec-version). */
	version: 1;
	createdAt: string;
	updatedAt: string;
	entries: Record<string, LibraryEntry>;
	/** Entry ids the user has dismissed. Orphan detection skips these. */
	ignored: string[];
}

// ------------------------------------------------------------------------
// Paths
// ------------------------------------------------------------------------

/** Root of the canonical library store. Override for tests via env. */
export function libraryRoot(): string {
	const override = process.env.ENSEMBLE_LIBRARY_ROOT;
	if (override) return override;
	return join(homedir(), ".config", "ensemble", "library");
}

export function manifestPath(): string {
	return join(libraryRoot(), "library.json");
}

/** Canonical subdirectory for a given file-based tool type. */
function subdirForType(type: FileToolType): string {
	switch (type) {
		case "skill":
			return "skills";
		case "agent":
			return "agents";
		case "command":
			return "commands";
		case "style":
			return "styles";
	}
}

/** Canonical absolute path for a file-based entry's content. */
export function canonicalPath(type: FileToolType, name: string): string {
	const sub = subdirForType(type);
	if (type === "skill") {
		// Skills are directories — canonical file is SKILL.md inside.
		return join(libraryRoot(), sub, name, "SKILL.md");
	}
	return join(libraryRoot(), sub, `${name}.md`);
}

function isFileToolType(type: ToolType): type is FileToolType {
	return type === "skill" || type === "agent" || type === "command" || type === "style";
}

// ------------------------------------------------------------------------
// Manifest load / save
// ------------------------------------------------------------------------

/** Whether the library store has been initialized on disk. */
export function libraryStoreExists(): boolean {
	return existsSync(manifestPath());
}

/** Load the library manifest. Returns null if the store does not exist. */
export function readManifest(): LibraryManifest | null {
	const path = manifestPath();
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw) as LibraryManifest;
		// Minimal shape check — bail out on anything unexpected.
		if (parsed.version !== 1 || typeof parsed.entries !== "object") return null;
		return parsed;
	} catch {
		return null;
	}
}

/** Persist the manifest. Caller is responsible for keeping it consistent. */
export function writeManifest(manifest: LibraryManifest): void {
	const path = manifestPath();
	mkdirSync(dirname(path), { recursive: true });
	const next: LibraryManifest = { ...manifest, updatedAt: new Date().toISOString() };
	writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

/** Create an empty manifest in memory. Does not write. */
function emptyManifest(): LibraryManifest {
	const now = new Date().toISOString();
	return {
		version: 1,
		createdAt: now,
		updatedAt: now,
		entries: {},
		ignored: [],
	};
}

// ------------------------------------------------------------------------
// Hashing
// ------------------------------------------------------------------------

/** SHA-256 of a file's bytes. Throws if the file cannot be read. */
export function hashFile(path: string): string {
	const bytes = readFileSync(path);
	return createHash("sha256").update(bytes).digest("hex");
}

/** Read one server def out of a Claude Code config file. */
function readServerDefFromJson(jsonPath: string, serverName: string): Record<string, unknown> | null {
	try {
		const data = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
		const servers = (data.mcpServers ?? {}) as Record<string, unknown>;
		const def = servers[serverName];
		if (typeof def !== "object" || def === null) return null;
		return def as Record<string, unknown>;
	} catch {
		return null;
	}
}

// ------------------------------------------------------------------------
// Entry builders — write canonical content (if any) and return a LibraryEntry
// ------------------------------------------------------------------------

/**
 * Copy a file-based tool's content into the canonical library store and
 * return the matching LibraryEntry. For skills, the entire skill directory
 * is copied (so supporting assets travel with the canonical SKILL.md).
 * Returns null if the source is missing or unreadable.
 */
function buildFileEntry(tool: DiscoveredTool, createdAt: string): LibraryEntry | null {
	if (!isFileToolType(tool.type)) return null;
	if (!tool.filePath || !existsSync(tool.filePath)) return null;

	const canonicalDest = canonicalPath(tool.type, tool.name);
	mkdirSync(dirname(canonicalDest), { recursive: true });
	if (tool.type === "skill") {
		cpSync(dirname(tool.filePath), dirname(canonicalDest), { recursive: true });
	} else {
		cpSync(tool.filePath, canonicalDest);
	}
	const hash = hashFile(canonicalDest);
	const relPath = relative(libraryRoot(), canonicalDest);

	return {
		id: `${tool.name}@discovered`,
		type: tool.type,
		name: tool.name,
		source: "@discovered",
		filePath: relPath,
		contentHash: hash,
		createdAt,
	};
}

/**
 * Read an MCP server definition from its source JSON and build a LibraryEntry
 * carrying the def inline. Strips the `__ensemble` marker.
 */
function buildServerEntry(tool: DiscoveredTool, createdAt: string): LibraryEntry | null {
	if (tool.type !== "server") return null;
	if (!tool.filePath || !existsSync(tool.filePath)) return null;

	const def = readServerDefFromJson(tool.filePath, tool.name);
	if (!def) return null;
	const { __ensemble, ...cleanDef } = def as Record<string, unknown>;
	void __ensemble;

	return {
		id: `${tool.name}@discovered`,
		type: "server",
		name: tool.name,
		source: "@discovered",
		serverDef: cleanDef as LibraryEntry["serverDef"],
		createdAt,
	};
}

/**
 * Build a LibraryEntry for a plugin. Plugins carry their marketplace identity
 * natively — the library discovery scanner stores it in `pluginMarketplace` — so
 * plugin entries use the marketplace as the real source, not "@discovered".
 */
function buildPluginEntry(tool: DiscoveredTool, createdAt: string): LibraryEntry | null {
	if (tool.type !== "plugin") return null;
	const marketplace = tool.pluginMarketplace || "";
	const source = marketplace || "@discovered";
	return {
		id: `${tool.name}@${source}`,
		type: "plugin",
		name: tool.name,
		source,
		pluginMarketplace: marketplace || undefined,
		createdAt,
	};
}

/** Dispatch to the right builder for the tool's type. */
function buildEntry(tool: DiscoveredTool, createdAt: string): LibraryEntry | null {
	if (tool.type === "hook") return null;
	if (tool.type === "server") return buildServerEntry(tool, createdAt);
	if (tool.type === "plugin") return buildPluginEntry(tool, createdAt);
	return buildFileEntry(tool, createdAt);
}

// ------------------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------------------

export interface BootstrapSummary {
	/** Whether a new store was created (false if one already existed). */
	created: boolean;
	/** Total entries in the manifest after bootstrap. */
	entriesTotal: number;
	/** Entries added by this bootstrap call (0 if `created === false`). */
	entriesAdded: number;
	/** Breakdown by type for newly-added entries. */
	byType: Partial<Record<ToolType, number>>;
	/** Source of each adopted entry, for audit in logs. */
	adoptedFrom: Record<string, "global" | string>;
	/** Milliseconds from start to finish. */
	durationMs: number;
}

/**
 * Populate the canonical library store from a scan of the user's existing
 * Claude Code installs.
 *
 * Idempotent: if the store already exists, returns a no-op summary and leaves
 * everything untouched. First-time invocation scans `~/.claude/` global plus
 * any project paths passed in, picks the first copy of each unique
 * (type, name) resource found, copies the file content into the library
 * store, and writes the manifest.
 *
 * Deduplication preference: global > first project in the input order.
 */
export function bootstrapLibrary(projectPaths: string[] = []): BootstrapSummary {
	const start = Date.now();

	if (libraryStoreExists()) {
		const existing = readManifest();
		return {
			created: false,
			entriesTotal: existing ? Object.keys(existing.entries).length : 0,
			entriesAdded: 0,
			byType: {},
			adoptedFrom: {},
			durationMs: Date.now() - start,
		};
	}

	const manifest = emptyManifest();
	const byType: Partial<Record<ToolType, number>> = {};
	const adoptedFrom: Record<string, "global" | string> = {};

	// Plugin dedup includes marketplace so the same plugin name from two
	// different marketplaces coexists. Other types dedup by name.
	const seen = new Set<string>();
	const dedupKey = (tool: DiscoveredTool): string =>
		tool.type === "plugin"
			? `plugin:${tool.name}@${tool.pluginMarketplace || ""}`
			: `${tool.type}:${tool.name}`;

	const processTool = (tool: DiscoveredTool, origin: "global" | string): void => {
		const key = dedupKey(tool);
		if (seen.has(key)) return;
		seen.add(key);

		const entry = buildEntry(tool, manifest.createdAt);
		if (!entry) return;
		manifest.entries[entry.id] = entry;
		byType[tool.type] = (byType[tool.type] ?? 0) + 1;
		adoptedFrom[entry.id] = origin;
	};

	// Global scope takes precedence.
	try {
		for (const tool of scanLibraryGlobal()) processTool(tool, "global");
	} catch {
		// Scan failures are non-fatal for bootstrap — partial coverage is fine.
	}

	// Project scopes in input order.
	for (const projectPath of projectPaths) {
		try {
			for (const tool of scanLibraryProject(projectPath)) processTool(tool, projectPath);
		} catch {
			// Same — a single project scan failure doesn't abort the whole bootstrap.
		}
	}

	writeManifest(manifest);

	return {
		created: true,
		entriesTotal: Object.keys(manifest.entries).length,
		entriesAdded: Object.keys(manifest.entries).length,
		byType,
		adoptedFrom,
		durationMs: Date.now() - start,
	};
}

// ------------------------------------------------------------------------
// Read helpers (for callers that want to project the store)
// ------------------------------------------------------------------------

/** Return all entries in a stable order (by type, then name). */
export function listEntries(manifest: LibraryManifest): LibraryEntry[] {
	return Object.values(manifest.entries).sort((a, b) => {
		if (a.type !== b.type) return a.type.localeCompare(b.type);
		return a.name.localeCompare(b.name);
	});
}

/** Lookup an entry by id. */
export function getEntry(manifest: LibraryManifest, id: string): LibraryEntry | null {
	return manifest.entries[id] ?? null;
}

// ------------------------------------------------------------------------
// Mutations — adopt / promote / ignore
// ------------------------------------------------------------------------

export interface AdoptResult {
	ok: boolean;
	id?: string;
	reason?: string;
}

/**
 * Adopt a scanned orphan into the library. Copies file content (or captures
 * a server def) into the canonical store, appends a manifest entry, and
 * persists. Idempotent — if an entry with the same id already exists, this
 * is a no-op returning ok=true.
 *
 * Fails quietly if the manifest is missing or the tool cannot be built.
 */
export function adoptOrphan(tool: DiscoveredTool): AdoptResult {
	const manifest = readManifest();
	if (!manifest) return { ok: false, reason: "library store does not exist" };

	const entry = buildEntry(tool, new Date().toISOString());
	if (!entry) return { ok: false, reason: `cannot adopt tool of type ${tool.type}` };

	if (manifest.entries[entry.id]) {
		return { ok: true, id: entry.id, reason: "already present" };
	}

	manifest.entries[entry.id] = entry;
	// If the id was in the ignored list, remove it — adopting overrides dismiss.
	const ignoredIdx = manifest.ignored.indexOf(entry.id);
	if (ignoredIdx >= 0) manifest.ignored.splice(ignoredIdx, 1);

	writeManifest(manifest);
	return { ok: true, id: entry.id };
}

/**
 * Promote the on-disk version of a drifted tool into the library: rewrite
 * canonical content from the tool's source, rehash, update the manifest
 * entry. The previous canonical content is overwritten. Caller is
 * responsible for confirming user intent — this function assumes the
 * decision has been made.
 */
export function promoteDrift(tool: DiscoveredTool): AdoptResult {
	const manifest = readManifest();
	if (!manifest) return { ok: false, reason: "library store does not exist" };

	const id = proposedId(tool);
	const existing = manifest.entries[id];
	if (!existing) return { ok: false, reason: `no entry ${id} to promote` };

	// Rebuild entry from the tool — this copies fresh content / re-reads def.
	const rebuilt = buildEntry(tool, existing.createdAt);
	if (!rebuilt) return { ok: false, reason: "cannot rebuild entry" };

	manifest.entries[id] = rebuilt;
	writeManifest(manifest);
	return { ok: true, id };
}

/**
 * Add an entry id to the manifest's ignored list so future scans skip it
 * during orphan detection. Safe to call on ids that are not currently
 * orphaned — the ignore is persistent.
 */
export function ignoreEntry(id: string): AdoptResult {
	const manifest = readManifest();
	if (!manifest) return { ok: false, reason: "library store does not exist" };
	if (!manifest.ignored.includes(id)) manifest.ignored.push(id);
	writeManifest(manifest);
	return { ok: true, id };
}

/** Inverse of ignoreEntry — remove an id from the ignored list. */
export function unignoreEntry(id: string): AdoptResult {
	const manifest = readManifest();
	if (!manifest) return { ok: false, reason: "library store does not exist" };
	const idx = manifest.ignored.indexOf(id);
	if (idx >= 0) manifest.ignored.splice(idx, 1);
	writeManifest(manifest);
	return { ok: true, id };
}

/**
 * Relink an entry's `source` to a new marketplace identifier. This is a
 * pure metadata rename: the entry's content (file path, hash, server def,
 * etc.) is preserved, but the id is rewritten as `name@newSource` and the
 * entry moves under the new key in the manifest.
 *
 * Refuses to relink when:
 * - The target id already exists in the manifest (collision)
 * - The entry does not exist
 * - The new source is an empty string
 *
 * Does not touch the ignored list — relink preserves the user's intent.
 */
export function relinkEntrySource(id: string, newSource: string): AdoptResult {
	if (!newSource || newSource.trim().length === 0) {
		return { ok: false, reason: "new source must be non-empty" };
	}
	const manifest = readManifest();
	if (!manifest) return { ok: false, reason: "library store does not exist" };

	const entry = manifest.entries[id];
	if (!entry) return { ok: false, reason: `no entry ${id}` };

	const newId = `${entry.name}@${newSource}`;
	if (newId === id) return { ok: true, id }; // no-op

	if (manifest.entries[newId]) {
		return { ok: false, reason: `entry ${newId} already exists` };
	}

	manifest.entries[newId] = {
		...entry,
		id: newId,
		source: newSource,
		pluginMarketplace: entry.type === "plugin" ? newSource : entry.pluginMarketplace,
	};
	delete manifest.entries[id];

	writeManifest(manifest);
	return { ok: true, id: newId };
}

/**
 * Delete an entry from the library. File-based entries also lose their
 * canonical content (the whole skill directory, or the single md file).
 * The id is added to the ignored list so future scans don't immediately
 * re-adopt the entry as an orphan if the on-disk copy still exists.
 */
export function removeEntry(id: string): AdoptResult {
	const manifest = readManifest();
	if (!manifest) return { ok: false, reason: "library store does not exist" };
	const entry = manifest.entries[id];
	if (!entry) return { ok: false, reason: `no entry ${id}` };

	// Best-effort canonical content cleanup for file-based types.
	if (isFileToolType(entry.type) && entry.filePath) {
		const absPath = join(libraryRoot(), entry.filePath);
		try {
			if (entry.type === "skill") {
				// Skills are directories — remove the whole thing.
				rmSync(dirname(absPath), { recursive: true, force: true });
			} else if (existsSync(absPath)) {
				rmSync(absPath, { force: true });
			}
		} catch {
			// Non-fatal — manifest entry is still removed below.
		}
	}

	delete manifest.entries[id];
	// Add to ignored so the next scan doesn't immediately re-adopt from any
	// still-present on-disk copy at a CC scope.
	if (!manifest.ignored.includes(id)) manifest.ignored.push(id);
	writeManifest(manifest);
	return { ok: true, id };
}

// ------------------------------------------------------------------------
// Reconcile
// ------------------------------------------------------------------------

/** Reason a scanned tool was flagged as drift from its library entry. */
export type DriftReason =
	| "content-hash-mismatch" // file content differs from canonical
	| "server-def-mismatch" // MCP server definition differs
	| "missing-canonical" // library entry claims a file that no longer exists in the store
	| "unknown";

/** A single (tool, scope) occurrence's reconciliation status. */
export interface ReconcileMatch {
	tool: DiscoveredTool;
	entry: LibraryEntry;
}

export interface ReconcileDrift {
	tool: DiscoveredTool;
	entry: LibraryEntry;
	reason: DriftReason;
}

export interface ReconcileOrphan {
	tool: DiscoveredTool;
	/** Identity the tool would have if adopted. */
	proposedId: string;
}

export interface ReconcileIgnored {
	tool: DiscoveredTool;
	id: string;
}

export interface ReconcileResult {
	matches: ReconcileMatch[];
	drifts: ReconcileDrift[];
	orphans: ReconcileOrphan[];
	ignored: ReconcileIgnored[];
}

/**
 * Compute the proposed library id for a scanned tool. Mirrors the identity
 * rules used by bootstrap so reconcile can match scans against the manifest.
 */
export function proposedId(tool: DiscoveredTool): string {
	if (tool.type === "plugin") {
		const marketplace = tool.pluginMarketplace || "@discovered";
		return `${tool.name}@${marketplace}`;
	}
	return `${tool.name}@discovered`;
}

/**
 * Classify every tool occurrence in `scan` against the library manifest.
 *
 * Pure function — no filesystem writes, no manifest mutation. The caller
 * decides how to present each bucket (DOCTOR categories, CLI output,
 * interactive adoption prompts). Reconcile reads from disk only to hash
 * file content for drift comparison.
 *
 * Rules:
 * - Hook tools are skipped entirely (read-only in v2.0.1).
 * - Tools whose proposed id matches a manifest entry:
 *     - file-based: hash the on-disk file and compare to entry.contentHash;
 *       mismatch → drift, match → match.
 *     - server: re-read the source JSON, compare (stripped) def to entry.serverDef;
 *       mismatch → drift, match → match.
 *     - plugin: presence-only, always a match (no content to drift).
 * - Tools with no matching entry:
 *     - id in manifest.ignored → ignored bucket.
 *     - otherwise → orphan bucket.
 */
export function reconcile(manifest: LibraryManifest, scan: DiscoveredTool[]): ReconcileResult {
	const result: ReconcileResult = { matches: [], drifts: [], orphans: [], ignored: [] };
	const ignoredSet = new Set(manifest.ignored);

	for (const tool of scan) {
		if (tool.type === "hook") continue;

		const id = proposedId(tool);
		const entry = manifest.entries[id];

		if (!entry) {
			if (ignoredSet.has(id)) result.ignored.push({ tool, id });
			else result.orphans.push({ tool, proposedId: id });
			continue;
		}

		const drift = checkDrift(tool, entry);
		if (drift) result.drifts.push({ tool, entry, reason: drift });
		else result.matches.push({ tool, entry });
	}

	return result;
}

/** Return a drift reason if the scanned tool differs from its entry, else null. */
function checkDrift(tool: DiscoveredTool, entry: LibraryEntry): DriftReason | null {
	if (isFileToolType(tool.type)) {
		if (!tool.filePath || !existsSync(tool.filePath)) return null;
		if (!entry.contentHash) return null;
		try {
			const diskHash = hashFile(tool.filePath);
			return diskHash === entry.contentHash ? null : "content-hash-mismatch";
		} catch {
			return "unknown";
		}
	}

	if (tool.type === "server") {
		if (!tool.filePath || !existsSync(tool.filePath)) return null;
		if (!entry.serverDef) return null;
		const diskDef = readServerDefFromJson(tool.filePath, tool.name);
		if (!diskDef) return null;
		const { __ensemble, ...cleanDisk } = diskDef;
		void __ensemble;
		return shallowDefEqual(cleanDisk, entry.serverDef) ? null : "server-def-mismatch";
	}

	// Plugin — no content, no drift.
	return null;
}

/**
 * Compare two MCP server definitions for equality. Order-independent on keys,
 * deep-equal on values. Good enough for drift detection; not a general JSON
 * equality.
 */
function shallowDefEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const ak = Object.keys(a).sort();
	const bk = Object.keys(b).sort();
	if (ak.length !== bk.length) return false;
	for (let i = 0; i < ak.length; i++) {
		if (ak[i] !== bk[i]) return false;
	}
	return JSON.stringify(sortedStringify(a)) === JSON.stringify(sortedStringify(b));
}

function sortedStringify(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortedStringify);
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) out[key] = sortedStringify(obj[key]);
		return out;
	}
	return value;
}
