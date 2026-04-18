/**
 * Snapshots — pre-write captures that make `ensemble sync` (and any other
 * mutating surface) reversible.
 *
 * Each snapshot lives at `<snapshotsRoot>/<id>/` where the id is
 * `<iso-timestamp>-<hash6>`. Inside:
 *
 *   - `manifest.json` — SnapshotSchema-shaped record of every captured file
 *   - `files/<encoded-path>` — verbatim pre-write copy of each existing file
 *
 * Files that did not exist at capture time are recorded with state "new-file"
 * and no copy; on rollback, any new-file entry is deleted.
 *
 * Capture is synchronous and idempotent per path (deduping repeated paths
 * inside a single capture call). Retention pruning runs on demand and removes
 * any snapshot dir older than the configured window.
 *
 * This module does I/O. `operations.ts` stays pure and delegates restore
 * work to callers who invoke `restore()` here directly.
 */

import { createHash, randomBytes } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { type Snapshot, type SnapshotFileEntry, SnapshotSchema } from "./schemas.js";

// --- Paths ---

/**
 * Root directory for snapshots. Overridable for tests via
 * `ENSEMBLE_SNAPSHOTS_DIR`. Defaults to `~/.config/ensemble/snapshots`.
 */
export function snapshotsRoot(): string {
	if (process.env.ENSEMBLE_SNAPSHOTS_DIR) return process.env.ENSEMBLE_SNAPSHOTS_DIR;
	return join(homedir(), ".config", "ensemble", "snapshots");
}

function snapshotDir(id: string): string {
	return join(snapshotsRoot(), id);
}

// --- ID + encoding helpers ---

/**
 * Encode an absolute filesystem path into a single safe filename so the
 * pre-write copy can live flat under `<snapshot>/files/`.
 *
 * We use a simple reversible-ish encoding: replace path separators with `__`
 * and non-safe chars with `_`. We prefix with a short sha1 of the full path
 * so two otherwise-colliding encodings stay distinct.
 */
function encodePath(absPath: string): string {
	const hash = createHash("sha1").update(absPath).digest("hex").slice(0, 8);
	const sanitized = absPath
		.split(sep)
		.filter(Boolean)
		.join("__")
		.replace(/[^A-Za-z0-9._-]/g, "_");
	return `${hash}__${sanitized}`;
}

function shortHash(input: string): string {
	return createHash("sha256").update(input).digest("hex").slice(0, 6);
}

/**
 * Generate a snapshot id. Combines ISO-8601 timestamp (colons → dashes for
 * fs-friendliness) with a short hash seeded from both the inputs and a
 * random token so concurrent captures never collide.
 */
function generateId(files: string[], now: Date = new Date()): string {
	const stamp = now.toISOString().replace(/[:]/g, "-");
	const seed = `${files.slice().sort().join("|")}|${randomBytes(4).toString("hex")}`;
	return `${stamp}-${shortHash(seed)}`;
}

// --- Capture ---

export interface CaptureOptions {
	/** Optional label to record under `syncContext` (e.g., "sync claude-code"). */
	syncContext?: string;
	/** Override the snapshot id (tests only). */
	idOverride?: string;
}

/**
 * Capture a snapshot of the given files.
 *
 * - Existing files are copied verbatim into `<snapshot>/files/`.
 * - Missing files are recorded with state "new-file" so rollback can delete
 *   anything a sync subsequently creates.
 * - Duplicate paths are deduped.
 * - Files are resolved to absolute paths before storage.
 */
export function capture(files: string[], options: CaptureOptions = {}): Snapshot {
	const absUnique = Array.from(
		new Set(files.filter((f) => typeof f === "string" && f.length > 0).map((f) => resolve(f))),
	);

	const id = options.idOverride ?? generateId(absUnique);
	const dir = snapshotDir(id);
	mkdirSync(dir, { recursive: true });
	const filesDir = join(dir, "files");
	mkdirSync(filesDir, { recursive: true });

	const entries: SnapshotFileEntry[] = [];
	for (const absPath of absUnique) {
		if (existsSync(absPath)) {
			const encoded = encodePath(absPath);
			const dest = join(filesDir, encoded);
			copyFileSync(absPath, dest);
			entries.push({
				path: absPath,
				state: "existing",
				preContentPath: join("files", encoded),
			});
		} else {
			entries.push({ path: absPath, state: "new-file" });
		}
	}

	const snapshot: Snapshot = {
		id,
		createdAt: new Date().toISOString(),
		syncContext: options.syncContext,
		files: entries,
	};

	writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
	return snapshot;
}

// --- Listing ---

/**
 * List all snapshots on disk in reverse-chronological order (newest first).
 * Snapshots without a readable manifest are skipped silently.
 */
export function list(): Snapshot[] {
	const root = snapshotsRoot();
	if (!existsSync(root)) return [];
	const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
	const snapshots: Snapshot[] = [];
	for (const d of dirs) {
		const manifestPath = join(root, d.name, "manifest.json");
		if (!existsSync(manifestPath)) continue;
		try {
			const raw = readFileSync(manifestPath, "utf-8");
			const parsed = SnapshotSchema.parse(JSON.parse(raw));
			snapshots.push(parsed);
		} catch {
			// Malformed manifest — ignore.
		}
	}
	return snapshots.sort((a, b) =>
		a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
	);
}

/** Get the most recent snapshot, or null if none exist. */
export function latest(): Snapshot | null {
	const all = list();
	return all[0] ?? null;
}

/** Load a specific snapshot by id. Throws if missing. */
export function get(id: string): Snapshot {
	const manifestPath = join(snapshotDir(id), "manifest.json");
	if (!existsSync(manifestPath)) {
		throw new Error(`Snapshot '${id}' not found`);
	}
	const raw = readFileSync(manifestPath, "utf-8");
	return SnapshotSchema.parse(JSON.parse(raw));
}

// --- Restore ---

export interface RestoreResult {
	snapshotId: string;
	restored: string[];
	deleted: string[];
	missing: string[];
}

/**
 * Restore files captured in the given snapshot.
 *
 * - "existing" entries: the pre-write copy is written back byte-identical.
 * - "new-file" entries: the file is deleted if it exists.
 *
 * Returns a structured result listing what happened. Missing pre-content
 * copies (corrupted snapshot) are reported under `missing` rather than
 * throwing, so a partial restore still completes.
 */
export function restore(snapshotId: string): RestoreResult {
	const snapshot = get(snapshotId);
	const dir = snapshotDir(snapshotId);
	const restored: string[] = [];
	const deleted: string[] = [];
	const missing: string[] = [];

	for (const entry of snapshot.files) {
		if (entry.state === "existing") {
			if (!entry.preContentPath) {
				missing.push(entry.path);
				continue;
			}
			const src = join(dir, entry.preContentPath);
			if (!existsSync(src)) {
				missing.push(entry.path);
				continue;
			}
			mkdirSync(dirname(entry.path), { recursive: true });
			copyFileSync(src, entry.path);
			restored.push(entry.path);
		} else {
			// new-file: delete whatever the sync subsequently wrote.
			if (existsSync(entry.path)) {
				rmSync(entry.path, { force: true });
			}
			deleted.push(entry.path);
		}
	}

	return { snapshotId, restored, deleted, missing };
}

// --- Retention pruning ---

export interface PruneOptions {
	/** Days to retain. 0 disables pruning. Defaults to 30. */
	retentionDays?: number;
	/** Reference time (tests). */
	now?: Date;
}

/**
 * Remove snapshot directories older than the retention window.
 * Returns the ids that were pruned.
 */
export function prune(options: PruneOptions = {}): string[] {
	const retentionDays = options.retentionDays ?? 30;
	if (retentionDays <= 0) return [];

	const now = options.now ?? new Date();
	const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
	const root = snapshotsRoot();
	if (!existsSync(root)) return [];

	const pruned: string[] = [];
	for (const d of readdirSync(root, { withFileTypes: true })) {
		if (!d.isDirectory()) continue;
		const dir = join(root, d.name);
		const manifestPath = join(dir, "manifest.json");
		let createdMs: number;
		if (existsSync(manifestPath)) {
			try {
				const raw = readFileSync(manifestPath, "utf-8");
				const parsed = SnapshotSchema.parse(JSON.parse(raw));
				createdMs = Date.parse(parsed.createdAt);
				if (Number.isNaN(createdMs)) {
					createdMs = statSync(dir).mtimeMs;
				}
			} catch {
				createdMs = statSync(dir).mtimeMs;
			}
		} else {
			// Orphaned dir without a manifest — treat as stale.
			createdMs = statSync(dir).mtimeMs;
		}
		if (createdMs < cutoffMs) {
			rmSync(dir, { recursive: true, force: true });
			pruned.push(basename(dir));
		}
	}
	return pruned;
}
