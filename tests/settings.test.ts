import { describe, expect, it } from "vitest";
import {
	MANAGED_KEYS_FIELD,
	buildManagedFromList,
	mergeSettings,
	readOwnedKeys,
} from "../src/settings.js";

// Byte-identity helper: deep-compare via JSON serialisation with a stable
// key order. For this test we compare the serialised string directly so
// "byte-identical" in the invariant maps to "same JSON output".
function serialize(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

describe("mergeSettings non-destructive merge", () => {
	it("preserves every unowned user key byte-identical when modifying two owned keys", () => {
		// Operator-authored settings.json with ten heterogeneous keys.
		const userSettings: Record<string, unknown> = {
			permissions: {
				allow: ["Bash(git:*)", "Read(~/.config/**)"],
				deny: ["Bash(rm:*)"],
			},
			env: {
				CLAUDE_LOG_LEVEL: "debug",
				CLAUDE_THEME: "dark",
			},
			model: "claude-opus-4-7",
			hooks: {
				UserPromptSubmit: [{ matcher: "*", command: "echo hi" }],
			},
			statusLine: { type: "command", command: "date" },
			includeCoAuthoredBy: false,
			cleanupPeriodDays: 7,
			apiKeyHelper: "~/.config/claude/get-key.sh",
			tipsHistory: { gitStatusTip: 3, editingCodeTip: 5 },
			outputStyle: "Explanatory",
		};

		// The two Ensemble-owned keys.
		const managed = {
			enabledPlugins: { "foo@bar": true, "baz@qux": false },
			extraKnownMarketplaces: { "my-mkt": { source: { source: "github" } } },
		};

		const { merged, ownedKeys } = mergeSettings(userSettings, managed, [
			"enabledPlugins",
			"extraKnownMarketplaces",
		]);

		expect(ownedKeys).toEqual(["enabledPlugins", "extraKnownMarketplaces"]);

		// Every original user key must be byte-identical in the merged output.
		for (const key of Object.keys(userSettings)) {
			expect(serialize(merged[key])).toBe(serialize(userSettings[key]));
		}

		// The owned keys must reflect the new values.
		expect(merged.enabledPlugins).toEqual(managed.enabledPlugins);
		expect(merged.extraKnownMarketplaces).toEqual(managed.extraKnownMarketplaces);

		// The tracking key is present.
		expect(merged[MANAGED_KEYS_FIELD]).toEqual(["enabledPlugins", "extraKnownMarketplaces"]);
	});

	it("is idempotent — merging the same inputs twice produces the same output", () => {
		const existing: Record<string, unknown> = {
			permissions: { allow: ["x"] },
			foo: "bar",
		};
		const managed = { "hooks.PreToolUse": [{ matcher: "Bash", command: "echo" }] };

		const first = mergeSettings(existing, managed, ["hooks.PreToolUse"]);
		const second = mergeSettings(first.merged, managed, ["hooks.PreToolUse"]);

		expect(serialize(second.merged)).toBe(serialize(first.merged));
		expect(second.ownedKeys).toEqual(first.ownedKeys);
	});

	it("releases a previously-owned key when it drops out of ownedKeys", () => {
		// A file already owned by ensemble for enabledPlugins.
		const existing: Record<string, unknown> = {
			permissions: { allow: ["x"] },
			enabledPlugins: { "old@mkt": true },
			[MANAGED_KEYS_FIELD]: ["enabledPlugins"],
		};
		// Next sync owns nothing (plugins were all uninstalled).
		const { merged, ownedKeys } = mergeSettings(existing, {}, []);

		expect("enabledPlugins" in merged).toBe(false);
		expect(merged[MANAGED_KEYS_FIELD]).toBeUndefined();
		expect(ownedKeys).toEqual([]);
		// Unowned permissions key untouched.
		expect(merged.permissions).toEqual({ allow: ["x"] });
	});

	it("keeps previously-owned keys intact when releasePreviouslyOwned=false", () => {
		const existing: Record<string, unknown> = {
			permissions: { allow: ["x"] },
			enabledPlugins: { "keep-me@mkt": true },
			[MANAGED_KEYS_FIELD]: ["enabledPlugins"],
		};
		const { merged } = mergeSettings(
			existing,
			{ extraKnownMarketplaces: {} },
			["extraKnownMarketplaces"],
			{
				releasePreviouslyOwned: false,
			},
		);
		// enabledPlugins stays even though not re-declared.
		expect(merged.enabledPlugins).toEqual({ "keep-me@mkt": true });
	});

	it("writes nested paths without clobbering sibling keys", () => {
		const existing: Record<string, unknown> = {
			hooks: {
				UserPromptSubmit: [{ matcher: "*", command: "user-hook" }],
			},
		};
		const managed = { hooks: { PreToolUse: [{ matcher: "Bash", command: "ensemble-hook" }] } };
		const { merged } = mergeSettings(existing, managed, ["hooks.PreToolUse"]);

		const hooks = merged.hooks as Record<string, unknown>;
		expect(hooks.UserPromptSubmit).toEqual([{ matcher: "*", command: "user-hook" }]);
		expect(hooks.PreToolUse).toEqual([{ matcher: "Bash", command: "ensemble-hook" }]);
	});

	it("deletes a leaf owned key without removing unowned siblings", () => {
		const existing: Record<string, unknown> = {
			hooks: {
				UserPromptSubmit: [{ matcher: "*", command: "user-hook" }],
				PreToolUse: [{ matcher: "Bash", command: "ensemble-hook" }],
			},
			[MANAGED_KEYS_FIELD]: ["hooks.PreToolUse"],
		};
		const { merged } = mergeSettings(existing, {}, []);
		const hooks = merged.hooks as Record<string, unknown>;
		expect(hooks.UserPromptSubmit).toEqual([{ matcher: "*", command: "user-hook" }]);
		expect(hooks.PreToolUse).toBeUndefined();
	});

	it("does not mutate the input objects", () => {
		const existing: Record<string, unknown> = {
			permissions: { allow: ["x"] },
			enabledPlugins: { old: true },
		};
		const existingClone = JSON.parse(JSON.stringify(existing));
		const managed = { enabledPlugins: { new: true } };
		mergeSettings(existing, managed, ["enabledPlugins"]);
		expect(existing).toEqual(existingClone);
	});

	it("sorts ownedKeys deterministically", () => {
		const { merged, ownedKeys } = mergeSettings({}, { b: 1, a: 2, c: 3 }, ["c", "a", "b"]);
		expect(ownedKeys).toEqual(["a", "b", "c"]);
		expect(merged[MANAGED_KEYS_FIELD]).toEqual(["a", "b", "c"]);
	});

	it("ignores empty key paths", () => {
		const { ownedKeys } = mergeSettings({}, { foo: 1 }, ["", "foo"]);
		expect(ownedKeys).toEqual(["foo"]);
	});

	it("replaces a non-object parent with an object when needed", () => {
		const existing: Record<string, unknown> = {
			hooks: "should-be-object-but-isnt",
		};
		const { merged } = mergeSettings(existing, { hooks: { PreToolUse: [] } }, ["hooks.PreToolUse"]);
		expect(merged.hooks).toEqual({ PreToolUse: [] });
	});
});

describe("readOwnedKeys", () => {
	it("returns empty array when tracking field is missing", () => {
		expect(readOwnedKeys({})).toEqual([]);
	});

	it("returns empty array when tracking field is malformed", () => {
		expect(readOwnedKeys({ [MANAGED_KEYS_FIELD]: "not-an-array" })).toEqual([]);
		expect(readOwnedKeys({ [MANAGED_KEYS_FIELD]: null })).toEqual([]);
	});

	it("filters out non-string entries", () => {
		expect(readOwnedKeys({ [MANAGED_KEYS_FIELD]: ["a", 1, null, "b", "", "c"] })).toEqual([
			"a",
			"b",
			"c",
		]);
	});
});

describe("buildManagedFromList", () => {
	it("builds a managed object and ownedKeys from a list of ManagedSetting entries", () => {
		const { managed, ownedKeys } = buildManagedFromList([
			{ keyPath: "permissions.allow", value: ["Bash(git:*)"] },
			{ keyPath: "hooks.PreToolUse", value: [{ matcher: "Bash", command: "x" }] },
			{ keyPath: "model", value: "claude-opus-4-7" },
		]);
		expect(ownedKeys).toEqual(["permissions.allow", "hooks.PreToolUse", "model"]);
		expect(managed).toEqual({
			permissions: { allow: ["Bash(git:*)"] },
			hooks: { PreToolUse: [{ matcher: "Bash", command: "x" }] },
			model: "claude-opus-4-7",
		});
	});

	it("rejects entries with empty keyPath", () => {
		expect(() => buildManagedFromList([{ keyPath: "", value: 1 }])).toThrow();
	});
});
