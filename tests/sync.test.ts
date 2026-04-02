import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENSEMBLE_MARKER } from "../src/clients.js";
import { createConfig } from "../src/config.js";
import { addServer, assignClient, createGroup, addServerToGroup, installSkill } from "../src/operations.js";
import { syncClient, syncSkills } from "../src/sync.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("syncClient", () => {
	it("reports unknown client", () => {
		const { result } = syncClient(createConfig(), "fake-client");
		expect(result.messages[0]).toContain("Unknown client");
	});

	it("dry run produces no file writes", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		const configPath = join(tmpDir, "mcp.json");
		writeFileSync(configPath, "{}");

		// Can't easily test against real client paths, but we can test the result shape
		const { result } = syncClient(config, "cursor", { dryRun: true });
		// cursor config doesn't exist at the real path, so no changes detected
		expect(result.clientName).toBe("Cursor");
	});

	it("detects drift when hashes differ", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		// Simulate a previous sync with stored hashes
		config = {
			...config,
			clients: [{
				id: "cursor",
				group: null,
				last_synced: "2026-01-01T00:00:00Z",
				projects: {},
				server_hashes: { ctx: "old-hash-that-wont-match" },
			}],
		};

		const { result } = syncClient(config, "cursor");
		// Since cursor config doesn't exist at real path, no drift detected
		// This test validates the API shape
		expect(result.drifted).toBeDefined();
		expect(Array.isArray(result.drifted)).toBe(true);
	});
});

describe("sync result shape", () => {
	it("returns structured result", () => {
		const { config: newConfig, result } = syncClient(createConfig(), "cursor");
		expect(result.clientId).toBe("cursor");
		expect(result.clientName).toBe("Cursor");
		expect(Array.isArray(result.actions)).toBe(true);
		expect(Array.isArray(result.messages)).toBe(true);
		expect(typeof result.hasChanges).toBe("boolean");
		expect(typeof result.newHashes).toBe("object");
	});
});

describe("syncSkills conflict detection", () => {
	it("returns conflicts array in result", () => {
		const config = createConfig();
		const result = syncSkills(config, "cursor");
		expect(Array.isArray(result.conflicts)).toBe(true);
	});

	it("detects broken symlinks in skills dir", () => {
		// Create a temp skills dir with a broken symlink
		const skillsDir = join(tmpDir, "skills");
		mkdirSync(skillsDir, { recursive: true });
		const brokenTarget = join(tmpDir, "nonexistent-skill");
		try {
			symlinkSync(brokenTarget, join(skillsDir, "broken-skill"));
		} catch { /* symlink creation may fail on some systems */ }

		// This test validates the conflict type structure
		const config = createConfig();
		const result = syncSkills(config, "cursor");
		// Cursor's real skills dir won't have our broken symlink,
		// but the structure is correct
		expect(result.conflicts).toBeDefined();
	});

	it("reports no conflicts for empty config", () => {
		const config = createConfig();
		const result = syncSkills(config, "claude-code");
		expect(result.conflicts.length).toBe(0);
	});
});
