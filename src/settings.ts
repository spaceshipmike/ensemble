/**
 * Declarative settings management — the non-destructive key-level merge
 * primitive for client settings.json files.
 *
 * ## Invariants
 *
 * - **Byte-identical for unowned keys.** `mergeSettings` only touches keys
 *   listed in `ownedKeys`; every other key passes through untouched. If the
 *   caller writes the returned object back with the same serializer, any
 *   key the user owns is byte-identical pre/post.
 *
 * - **Idempotent.** `mergeSettings(mergeSettings(x, managed, owned), managed,
 *   owned)` produces the same output as `mergeSettings(x, managed, owned)`.
 *
 * - **Ownership tracking.** A sibling key `__ensemble_managed` stores the
 *   dot-path list of owned keys. Round-tripping through merge preserves that
 *   list; removing ownership drops the path.
 *
 * ## Key paths
 *
 * Paths are dot-separated (e.g. `"permissions.allow"`, `"hooks.PreToolUse"`).
 * Nested objects are created as needed; non-object parents are replaced with
 * a new object (the existing value is considered "unowned detritus" at that
 * intermediate position, which is the same contract the pre-v2.0.1
 * `setNested` helper used for server entries).
 *
 * ## What this module does NOT do
 *
 * It does not read or write files. `syncClient` (and the hook store in chunk
 * 3) compose a managed object and hand it here; callers persist the result
 * through `writeCCSettings` / `writeFileSync` on their own.
 */

import { type ManagedSetting, SettingSchema } from "./schemas.js";

/** Sibling key used to track which dot-paths Ensemble owns in a settings object. */
export const MANAGED_KEYS_FIELD = "__ensemble_managed";

// --- Path helpers ---

function splitPath(keyPath: string): string[] {
	if (!keyPath) return [];
	return keyPath.split(".").filter((p) => p.length > 0);
}

function getByPath(obj: unknown, parts: string[]): unknown {
	let cur: unknown = obj;
	for (const p of parts) {
		if (typeof cur !== "object" || cur === null) return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

/**
 * Set `value` at the given path inside `target`, creating intermediate
 * objects as needed. Mutates target in place.
 */
function setByPath(target: Record<string, unknown>, parts: string[], value: unknown): void {
	if (parts.length === 0) return;
	let cur: Record<string, unknown> = target;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		if (p === undefined) return;
		const existing = cur[p];
		if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
			cur[p] = {};
		}
		cur = cur[p] as Record<string, unknown>;
	}
	const leaf = parts[parts.length - 1];
	if (leaf === undefined) return;
	cur[leaf] = value;
}

/**
 * Remove the leaf key at the given path inside `target`. Intermediate objects
 * that become empty as a result are left in place (operator keys may live
 * alongside them). Mutates target in place.
 */
function deleteByPath(target: Record<string, unknown>, parts: string[]): void {
	if (parts.length === 0) return;
	let cur: Record<string, unknown> | undefined = target;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		if (p === undefined) return;
		const next = cur?.[p];
		if (typeof next !== "object" || next === null || Array.isArray(next)) return;
		cur = next as Record<string, unknown>;
	}
	const leaf = parts[parts.length - 1];
	if (cur && leaf !== undefined && leaf in cur) {
		// Remove the key entirely so serializers don't write `"x": null`.
		Reflect.deleteProperty(cur, leaf);
	}
}

// --- Deep clone (structured-clone for our JSON-shaped settings) ---

/**
 * Deep-clone a JSON-compatible value. We avoid `structuredClone` because the
 * library targets Node 20+ and keeping the dependency surface explicit is
 * cheaper than relying on a global.
 */
function deepClone<T>(value: T): T {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = deepClone(v);
	}
	return out as T;
}

// --- Merge ---

export interface MergeResult {
	/** The merged settings object — pass this to the client writer. */
	merged: Record<string, unknown>;
	/** Dot-paths Ensemble owns after the merge. */
	ownedKeys: string[];
}

export interface MergeOptions {
	/**
	 * Paths previously owned but no longer in `ownedKeys` — remove their leaves.
	 * Defaults to reading `__ensemble_managed` from `existing`, which is the
	 * behaviour every sync path wants.
	 */
	releasePreviouslyOwned?: boolean;
}

/**
 * Non-destructive key-level merge.
 *
 * @param existing — the current settings object read from disk (or {}).
 * @param managed — a sparse object whose keys Ensemble owns. Only the paths
 *                  listed in `ownedKeys` are read; keys present in `managed`
 *                  but absent from `ownedKeys` are ignored (so callers can
 *                  derive both from the same object safely).
 * @param ownedKeys — dot-paths Ensemble owns for this merge. Any previously
 *                    owned path not listed here is removed (released back to
 *                    the user) when `releasePreviouslyOwned` is true.
 */
export function mergeSettings(
	existing: Record<string, unknown>,
	managed: Record<string, unknown>,
	ownedKeys: string[],
	options: MergeOptions = {},
): MergeResult {
	const releasePreviouslyOwned = options.releasePreviouslyOwned ?? true;

	// Clone so we never mutate the caller's input — byte-identity for unowned
	// keys depends on this strict isolation.
	const merged = deepClone(existing);

	// Discover previously-owned paths.
	const previouslyOwned = readOwnedKeys(merged);

	// Release paths Ensemble no longer owns.
	if (releasePreviouslyOwned) {
		const nowOwnedSet = new Set(ownedKeys);
		for (const prevPath of previouslyOwned) {
			if (!nowOwnedSet.has(prevPath)) {
				deleteByPath(merged, splitPath(prevPath));
			}
		}
	}

	// Apply each newly-owned value.
	const normalisedPaths: string[] = [];
	for (const keyPath of ownedKeys) {
		const parts = splitPath(keyPath);
		if (parts.length === 0) continue;
		const value = getByPath(managed, parts);
		if (value === undefined) continue; // caller may list a path with no value (becomes release)
		setByPath(merged, parts, deepClone(value));
		normalisedPaths.push(parts.join("."));
	}

	// Record ownership on the sibling tracking key (sorted for determinism).
	const sortedOwned = Array.from(new Set(normalisedPaths)).sort();
	if (sortedOwned.length > 0) {
		merged[MANAGED_KEYS_FIELD] = sortedOwned;
	} else {
		// No owned keys: drop the tracking key entirely so the file stays clean.
		Reflect.deleteProperty(merged, MANAGED_KEYS_FIELD);
	}

	return { merged, ownedKeys: sortedOwned };
}

/**
 * Extract the current owned-key list from a settings object. Missing or
 * malformed tracking key yields an empty list.
 */
export function readOwnedKeys(settings: Record<string, unknown>): string[] {
	const raw = settings[MANAGED_KEYS_FIELD];
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	for (const entry of raw) {
		if (typeof entry === "string" && entry.length > 0) out.push(entry);
	}
	return out;
}

/**
 * Parse an array of ManagedSetting records into the `(managed, ownedKeys)`
 * pair that `mergeSettings` expects. Useful when callers want to declare
 * their managed settings as a typed list rather than a sparse object.
 */
export function buildManagedFromList(entries: ManagedSetting[]): {
	managed: Record<string, unknown>;
	ownedKeys: string[];
} {
	const managed: Record<string, unknown> = {};
	const ownedKeys: string[] = [];
	for (const entry of entries) {
		SettingSchema.parse(entry);
		const parts = splitPath(entry.keyPath);
		if (parts.length === 0) continue;
		setByPath(managed, parts, entry.value);
		ownedKeys.push(parts.join("."));
	}
	return { managed, ownedKeys };
}
