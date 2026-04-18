/**
 * Canonical hook store — `~/.config/ensemble/hooks/<name>.json`.
 *
 * Each hook binds a command to one of seven Claude Code lifecycle events
 * (see HookEventSchema) with a matcher (literal tool name or regex). The
 * store is the source of truth; `syncClient` fans the enabled set out into
 * the target client's settings.json under the `hooks` key.
 *
 * ## Invariants
 *
 * - **Auto-generated description.** `description` is computed from
 *   `${event} → ${matcher}` on read. It is never persisted to settings.json
 *   and re-import overwrites any stored value.
 * - **Dual-field contract.** `userNotes` lives only on the library entry.
 *   `toSettingsEntry()` / settings.json writes never read userNotes.
 * - **Additive by marker.** Every entry written to settings.json carries
 *   `__ensemble: true`; entries without the marker survive byte-identical
 *   through fanout.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Hook, type HookEvent, HookSchema } from "./schemas.js";

// --- Paths ---

/** Root of the canonical hooks store. Overridable via ENSEMBLE_HOOKS_DIR. */
export function hooksRoot(): string {
	if (process.env.ENSEMBLE_HOOKS_DIR) return process.env.ENSEMBLE_HOOKS_DIR;
	return join(homedir(), ".config", "ensemble", "hooks");
}

function hookPath(name: string): string {
	return join(hooksRoot(), `${name}.json`);
}

// --- Derived description ---

/** Auto-compute the display description from event + matcher. */
export function describeHook(hook: Pick<Hook, "event" | "matcher">): string {
	return `${hook.event} → ${hook.matcher}`;
}

/** Enrich a parsed hook with the derived description (source-owned). */
function withDescription(hook: Hook): Hook {
	return { ...hook, description: describeHook(hook) };
}

// --- Serialisation ---

/**
 * Return the shape persisted to `<name>.json`. userNotes is round-trip safe;
 * description is dropped on write because it's always re-derived on read.
 */
function toStoredShape(hook: Hook): Record<string, unknown> {
	const { description: _drop, ...rest } = hook;
	void _drop;
	// Only include userNotes if set, to keep the stored file clean.
	if (rest.userNotes === undefined || rest.userNotes === "") {
		const { userNotes: _skip, ...withoutNotes } = rest;
		void _skip;
		return withoutNotes;
	}
	return rest;
}

// --- CRUD ---

export interface AddHookParams {
	name: string;
	event: HookEvent;
	matcher: string;
	command: string;
	userNotes?: string;
}

export interface AddHookResult {
	ok: boolean;
	error?: string;
	hook?: Hook;
}

/**
 * Create a hook entry in the canonical store. Returns an error result if a
 * hook with the same name already exists (use `removeHook` first).
 */
export function addHook(params: AddHookParams): AddHookResult {
	const parsed = HookSchema.safeParse({
		name: params.name,
		event: params.event,
		matcher: params.matcher,
		command: params.command,
		userNotes: params.userNotes,
	});
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
	}

	const dir = hooksRoot();
	mkdirSync(dir, { recursive: true });
	const path = hookPath(params.name);
	if (existsSync(path)) {
		return { ok: false, error: `Hook '${params.name}' already exists.` };
	}
	writeFileSync(path, `${JSON.stringify(toStoredShape(parsed.data), null, 2)}\n`, "utf-8");
	return { ok: true, hook: withDescription(parsed.data) };
}

export interface RemoveHookResult {
	ok: boolean;
	error?: string;
}

export function removeHook(name: string): RemoveHookResult {
	const path = hookPath(name);
	if (!existsSync(path)) {
		return { ok: false, error: `Hook '${name}' not found.` };
	}
	rmSync(path, { force: true });
	return { ok: true };
}

/** Load one hook by name. Returns null if missing or malformed. */
export function getHook(name: string): Hook | null {
	const path = hookPath(name);
	if (!existsSync(path)) return null;
	try {
		const parsed = HookSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
		if (!parsed.success) return null;
		return withDescription(parsed.data);
	} catch {
		return null;
	}
}

/** List every hook in the store, newest first by file name. */
export function listHooks(): Hook[] {
	const dir = hooksRoot();
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".json"))
		.sort((a, b) => a.name.localeCompare(b.name));
	const hooks: Hook[] = [];
	for (const entry of entries) {
		const raw = readFileSync(join(dir, entry.name), "utf-8");
		try {
			const parsed = HookSchema.safeParse(JSON.parse(raw));
			if (parsed.success) hooks.push(withDescription(parsed.data));
		} catch {
			// Skip malformed entries silently — listing is best-effort.
		}
	}
	return hooks;
}

// --- Settings fanout helpers ---

/**
 * The shape a single entry takes inside settings.json under
 * `hooks.<EventName>[]`. We tag every entry with `__ensemble: true` so
 * additive detection can preserve user-authored entries byte-identical.
 *
 * userNotes and description are library-side only and are never serialised
 * here — the dual-field contract.
 */
export interface SettingsHookEntry {
	__ensemble: true;
	matcher: string;
	hooks: Array<{ type: "command"; command: string }>;
}

/** Convert a library Hook into its settings.json entry shape. */
export function toSettingsEntry(hook: Hook): SettingsHookEntry {
	return {
		__ensemble: true,
		matcher: hook.matcher,
		hooks: [{ type: "command", command: hook.command }],
	};
}

/**
 * Build the `hooks` key value that should be merged into settings.json. Takes
 * the full set of library hooks and the current settings-level hooks object
 * (so we can preserve user-authored entries that don't carry the __ensemble
 * marker). Returns a new hooks object with ensemble entries replaced
 * wholesale and user entries passed through byte-identical.
 */
export function buildHooksSettings(
	libraryHooks: Hook[],
	existingHooks: Record<string, unknown> | undefined,
): Record<string, unknown[]> {
	// Group library hooks by event.
	const managedByEvent = new Map<HookEvent, SettingsHookEntry[]>();
	for (const h of libraryHooks) {
		const bucket = managedByEvent.get(h.event) ?? [];
		bucket.push(toSettingsEntry(h));
		managedByEvent.set(h.event, bucket);
	}

	// Preserve user-authored entries (no __ensemble marker) from the existing
	// settings object and prepend/merge them with our managed entries.
	const result: Record<string, unknown[]> = {};
	const events = new Set<string>([
		...Object.keys(existingHooks ?? {}),
		...Array.from(managedByEvent.keys()),
	]);
	for (const event of events) {
		const existing = existingHooks?.[event];
		const userAuthored: unknown[] = [];
		if (Array.isArray(existing)) {
			for (const entry of existing) {
				if (
					entry &&
					typeof entry === "object" &&
					(entry as Record<string, unknown>).__ensemble !== true
				) {
					userAuthored.push(entry);
				}
			}
		}
		const managed = managedByEvent.get(event as HookEvent) ?? [];
		const combined: unknown[] = [...userAuthored, ...managed];
		if (combined.length > 0) {
			result[event] = combined;
		}
	}
	return result;
}
