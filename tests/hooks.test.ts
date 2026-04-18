import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createConfig } from "../src/config.js";
import {
	addHook,
	buildHooksSettings,
	describeHook,
	getHook,
	hooksRoot,
	listHooks,
	removeHook,
	toSettingsEntry,
} from "../src/hooks.js";
import { addServer } from "../src/operations.js";
import type { Hook, HookEvent } from "../src/schemas.js";
import { MANAGED_KEYS_FIELD } from "../src/settings.js";
import { restore } from "../src/snapshots.js";
import { syncClient } from "../src/sync.js";

let tmpDir: string;
const prev: Record<string, string | undefined> = {};

function restoreEnv(key: string): void {
	const p = prev[key];
	if (p === undefined) process.env[key] = undefined;
	else process.env[key] = p;
	if (p === undefined) delete process.env[key];
}

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-hooks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
	for (const k of [
		"ENSEMBLE_HOOKS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		prev[k] = process.env[k];
	}
	process.env.ENSEMBLE_HOOKS_DIR = join(tmpDir, "hooks");
	process.env.ENSEMBLE_SNAPSHOTS_DIR = join(tmpDir, "snapshots");
	process.env.ENSEMBLE_CONFIG_DIR = join(tmpDir, "config");
	process.env.ENSEMBLE_CONFIG_PATH = join(tmpDir, "config", "config.json");
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	for (const k of [
		"ENSEMBLE_HOOKS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		restoreEnv(k);
	}
});

// --- Schema / CRUD ---

describe("HookSchema validation", () => {
	const validEvents: HookEvent[] = [
		"PreToolUse",
		"PostToolUse",
		"SessionStart",
		"UserPromptSubmit",
		"PreCompact",
		"Stop",
		"Notification",
	];

	it("accepts all seven lifecycle events", () => {
		for (const event of validEvents) {
			const result = addHook({
				name: `h-${event}`,
				event,
				matcher: "*",
				command: "echo hi",
			});
			expect(result.ok).toBe(true);
			expect(result.hook?.event).toBe(event);
		}
	});

	it("rejects an unknown event", () => {
		const result = addHook({
			name: "bad",
			event: "NotAnEvent" as HookEvent,
			matcher: "*",
			command: "echo",
		});
		expect(result.ok).toBe(false);
	});

	it("rejects empty matcher and empty command", () => {
		expect(addHook({ name: "x", event: "PreToolUse", matcher: "", command: "echo" }).ok).toBe(
			false,
		);
		expect(addHook({ name: "x", event: "PreToolUse", matcher: "*", command: "" }).ok).toBe(false);
	});
});

describe("addHook / getHook / listHooks / removeHook", () => {
	it("round-trips a hook through the canonical store", () => {
		const add = addHook({
			name: "lint",
			event: "PreToolUse",
			matcher: "Bash",
			command: "eslint .",
			userNotes: "Runs before any bash command — skip with --no-hooks.",
		});
		expect(add.ok).toBe(true);

		const got = getHook("lint");
		expect(got).not.toBeNull();
		expect(got?.event).toBe("PreToolUse");
		expect(got?.command).toBe("eslint .");
		expect(got?.userNotes).toBe("Runs before any bash command — skip with --no-hooks.");
	});

	it("auto-generates description from event → matcher", () => {
		addHook({ name: "h", event: "PostToolUse", matcher: "Write", command: "echo" });
		const got = getHook("h");
		expect(got?.description).toBe("PostToolUse → Write");
		expect(describeHook({ event: "Stop", matcher: "*" })).toBe("Stop → *");
	});

	it("rejects duplicate names", () => {
		addHook({ name: "h", event: "PreToolUse", matcher: "Bash", command: "echo" });
		const dup = addHook({ name: "h", event: "PreToolUse", matcher: "Bash", command: "echo" });
		expect(dup.ok).toBe(false);
		expect(dup.error).toMatch(/already exists/);
	});

	it("listHooks returns entries sorted by file name", () => {
		addHook({ name: "b-hook", event: "Stop", matcher: "*", command: "echo b" });
		addHook({ name: "a-hook", event: "Stop", matcher: "*", command: "echo a" });
		const all = listHooks();
		expect(all.map((h) => h.name)).toEqual(["a-hook", "b-hook"]);
	});

	it("removeHook deletes the store file", () => {
		addHook({ name: "toremove", event: "PreToolUse", matcher: "*", command: "echo" });
		const path = join(hooksRoot(), "toremove.json");
		expect(existsSync(path)).toBe(true);
		const rm = removeHook("toremove");
		expect(rm.ok).toBe(true);
		expect(existsSync(path)).toBe(false);
	});

	it("removeHook reports error for unknown name", () => {
		expect(removeHook("nonexistent").ok).toBe(false);
	});

	it("never persists description to the stored file (source-owned)", () => {
		addHook({ name: "h", event: "PreToolUse", matcher: "Bash", command: "echo" });
		const raw = JSON.parse(readFileSync(join(hooksRoot(), "h.json"), "utf-8"));
		expect(raw.description).toBeUndefined();
	});

	it("does not persist empty userNotes (keeps the store clean)", () => {
		addHook({ name: "h", event: "PreToolUse", matcher: "Bash", command: "echo", userNotes: "" });
		const raw = JSON.parse(readFileSync(join(hooksRoot(), "h.json"), "utf-8"));
		expect("userNotes" in raw).toBe(false);
	});
});

// --- Settings fanout ---

describe("toSettingsEntry / buildHooksSettings", () => {
	it("tags every managed entry with __ensemble marker", () => {
		const entry = toSettingsEntry({
			name: "h",
			event: "PreToolUse",
			matcher: "Bash",
			command: "echo",
		});
		expect(entry.__ensemble).toBe(true);
	});

	it("userNotes NEVER round-trips into settings.json", () => {
		const entry = toSettingsEntry({
			name: "h",
			event: "PreToolUse",
			matcher: "Bash",
			command: "echo",
			userNotes: "operator-only context",
			description: "PreToolUse → Bash",
		});
		expect((entry as unknown as Record<string, unknown>).userNotes).toBeUndefined();
		expect((entry as unknown as Record<string, unknown>).description).toBeUndefined();
	});

	it("preserves user-authored hook entries byte-identical", () => {
		const libHooks: Hook[] = [
			{ name: "mine", event: "PreToolUse", matcher: "Bash", command: "eslint" },
		];
		const existing = {
			PreToolUse: [{ hooks: [{ type: "command", command: "user-wrote-this" }] }],
			UserPromptSubmit: [{ hooks: [{ type: "command", command: "another-user-hook" }] }],
		};
		const merged = buildHooksSettings(libHooks, existing);

		// User's PreToolUse entry survived first in the list.
		expect(merged.PreToolUse?.[0]).toEqual(existing.PreToolUse[0]);
		// Ensemble entry is appended with the marker.
		expect(merged.PreToolUse?.[1]).toMatchObject({ __ensemble: true, matcher: "Bash" });
		// Unrelated event: user entry fully preserved.
		expect(merged.UserPromptSubmit).toEqual(existing.UserPromptSubmit);
	});

	it("drops events with no library and no user entries", () => {
		const merged = buildHooksSettings([], {});
		expect(merged).toEqual({});
	});
});

// --- Integration with syncClient ---

describe("hooks fanout through syncClient", () => {
	it("writes a hook to claude-code settings.json while preserving unrelated keys + creates a snapshot + rollback restores byte-identical", () => {
		process.env.HOME = tmpDir;

		// Seed the user's settings.json with keys Ensemble does NOT own.
		const settingsPath = join(tmpDir, ".claude", "settings.json");
		mkdirSync(join(tmpDir, ".claude"), { recursive: true });
		const userSettings = {
			permissions: {
				allow: ["Bash(git:*)", "Read(~/.config/**)"],
				deny: ["Bash(rm:*)"],
			},
			env: { CLAUDE_LOG_LEVEL: "debug" },
			model: "claude-opus-4-7",
			hooks: {
				UserPromptSubmit: [{ hooks: [{ type: "command", command: "user-authored-hook.sh" }] }],
			},
		};
		const userSettingsJson = `${JSON.stringify(userSettings, null, 2)}\n`;
		writeFileSync(settingsPath, userSettingsJson, "utf-8");

		// Seed a fake .claude.json so claude-code is "installed" from sync's view.
		writeFileSync(join(tmpDir, ".claude.json"), "{}", "utf-8");

		// Register a hook in the library store.
		addHook({
			name: "lint-before-bash",
			event: "PreToolUse",
			matcher: "Bash",
			command: "eslint .",
		});

		// Build a config that will drive claude-code sync.
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		config = {
			...config,
			clients: [
				{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
			],
		};

		const { result } = syncClient(config, "claude-code");

		// Snapshot captured.
		expect(result.snapshotId).toBeDefined();

		// Settings.json now contains:
		// - user's permissions / env / model / UserPromptSubmit entry untouched
		// - PreToolUse: our managed entry with __ensemble marker
		// - __ensemble_managed sibling tracking key
		const after = JSON.parse(readFileSync(settingsPath, "utf-8"));

		// User keys byte-identical.
		expect(after.permissions).toEqual(userSettings.permissions);
		expect(after.env).toEqual(userSettings.env);
		expect(after.model).toBe(userSettings.model);

		// User-authored hook entry preserved.
		expect(after.hooks.UserPromptSubmit).toEqual(userSettings.hooks.UserPromptSubmit);

		// Managed hook entry written under PreToolUse.
		expect(after.hooks.PreToolUse).toHaveLength(1);
		expect(after.hooks.PreToolUse[0].__ensemble).toBe(true);
		expect(after.hooks.PreToolUse[0].matcher).toBe("Bash");
		expect(after.hooks.PreToolUse[0].hooks).toEqual([{ type: "command", command: "eslint ." }]);

		// Tracking key written.
		expect(after[MANAGED_KEYS_FIELD]).toEqual(
			["enabledPlugins", "extraKnownMarketplaces", "hooks"].sort(),
		);

		// Rollback restores the original settings.json byte-identical.
		if (!result.snapshotId) throw new Error("expected snapshotId");
		restore(result.snapshotId);
		expect(readFileSync(settingsPath, "utf-8")).toBe(userSettingsJson);
	});
});
