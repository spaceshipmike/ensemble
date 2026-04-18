// @fctry: #settings

/**
 * Canonical managed-settings store — `~/.config/ensemble/managed-settings.json`.
 *
 * Each entry is a declarative key-path managed setting targeting a specific
 * client's settings.json. Ensemble owns the keys it stores here; `syncManaged`
 * fans them out via `mergeSettings` (src/settings.ts) so that every key
 * Ensemble does not list stays byte-identical.
 *
 * ## Invariants
 *
 * - **Per-client scoping.** Each entry has a `clientId` (default
 *   `"claude-code"`) so the same key path can be managed differently on
 *   different clients.
 * - **Values are JSON-parsed.** `settings set foo.bar '["a","b"]'` stores the
 *   array, not the string. Non-JSON values fall back to the literal string so
 *   callers can write simple scalars like `true` or `42` without quoting.
 * - **File is the source of truth.** Unlike the legacy `config.settings`, this
 *   store is intentionally separate from `~/.config/ensemble/config.json` so
 *   that `ensemble settings` verbs never round-trip the whole config.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { type ManagedSetting, SettingSchema } from "./schemas.js";

// --- Paths ---

/** Root of the canonical managed-settings store. Overridable via env. */
export function managedSettingsPath(): string {
	if (process.env.ENSEMBLE_MANAGED_SETTINGS_PATH) {
		return process.env.ENSEMBLE_MANAGED_SETTINGS_PATH;
	}
	return join(homedir(), ".config", "ensemble", "managed-settings.json");
}

// --- Entry shape ---

/**
 * A single managed-settings entry on disk. Wraps `ManagedSetting` from
 * schemas.ts with a `clientId` so the same key path can be managed per-client.
 */
export const StoredManagedSettingSchema = SettingSchema.extend({
	clientId: z.string().min(1).default("claude-code"),
});
export type StoredManagedSetting = z.infer<typeof StoredManagedSettingSchema>;

const FileSchema = z.object({
	entries: z.array(StoredManagedSettingSchema).default([]),
});

// --- CRUD ---

/** Load every managed setting from the store. Returns [] if the file is missing or malformed. */
export function loadManagedSettings(): StoredManagedSetting[] {
	const path = managedSettingsPath();
	if (!existsSync(path)) return [];
	try {
		const parsed = FileSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
		return parsed.success ? parsed.data.entries : [];
	} catch {
		return [];
	}
}

/** Persist the entire managed-settings store atomically. */
export function saveManagedSettings(entries: StoredManagedSetting[]): void {
	const path = managedSettingsPath();
	mkdirSync(dirname(path), { recursive: true });
	const payload = { entries };
	writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export interface SetManagedSettingParams {
	keyPath: string;
	value: unknown;
	clientId?: string;
	userNotes?: string;
}

export interface SetManagedSettingResult {
	ok: boolean;
	error?: string;
	entry?: StoredManagedSetting;
}

/**
 * Insert or update a managed setting. Matches on `(clientId, keyPath)` pairs;
 * the latest write wins for an existing match.
 */
export function setManagedSetting(params: SetManagedSettingParams): SetManagedSettingResult {
	const parsed = StoredManagedSettingSchema.safeParse({
		keyPath: params.keyPath,
		value: params.value,
		clientId: params.clientId ?? "claude-code",
		...(params.userNotes !== undefined ? { userNotes: params.userNotes } : {}),
	});
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
	}

	const all = loadManagedSettings();
	const idx = all.findIndex(
		(e) => e.clientId === parsed.data.clientId && e.keyPath === parsed.data.keyPath,
	);
	const next = idx >= 0 ? all.map((e, i) => (i === idx ? parsed.data : e)) : [...all, parsed.data];
	saveManagedSettings(next);
	return { ok: true, entry: parsed.data };
}

export interface UnsetManagedSettingResult {
	ok: boolean;
	error?: string;
	removed?: StoredManagedSetting;
}

/** Stop managing a key path. The underlying value in settings.json is left in place. */
export function unsetManagedSetting(
	keyPath: string,
	clientId = "claude-code",
): UnsetManagedSettingResult {
	const all = loadManagedSettings();
	const idx = all.findIndex((e) => e.clientId === clientId && e.keyPath === keyPath);
	if (idx < 0) {
		return { ok: false, error: `No managed setting '${keyPath}' for client '${clientId}'.` };
	}
	const removed = all[idx] as StoredManagedSetting;
	saveManagedSettings(all.filter((_, i) => i !== idx));
	return { ok: true, removed };
}

/** List every managed setting, optionally filtered by clientId. */
export function listManagedSettings(clientId?: string): StoredManagedSetting[] {
	const all = loadManagedSettings();
	return clientId ? all.filter((e) => e.clientId === clientId) : all;
}

/** Look up a single managed setting by (clientId, keyPath). */
export function getManagedSetting(
	keyPath: string,
	clientId = "claude-code",
): StoredManagedSetting | null {
	const all = loadManagedSettings();
	return all.find((e) => e.clientId === clientId && e.keyPath === keyPath) ?? null;
}

/**
 * Parse a CLI-supplied value string. Tries JSON first (so quoted arrays,
 * booleans, and numbers round-trip) and falls back to the literal string.
 */
export function parseSettingValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

/** Convert the stored shape back into the shared ManagedSetting type for fan-out. */
export function toManagedSetting(entry: StoredManagedSetting): ManagedSetting {
	const base: ManagedSetting = { keyPath: entry.keyPath, value: entry.value };
	if (entry.userNotes !== undefined) base.userNotes = entry.userNotes;
	return base;
}
