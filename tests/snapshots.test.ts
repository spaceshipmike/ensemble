import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createConfig, loadConfig, saveConfig } from "../src/config.js";
import { addServer, addServerToGroup, assignClient, createGroup } from "../src/operations.js";
import {
	capture,
	get as getSnapshot,
	latest,
	list as listSnapshots,
	prune,
	restore,
	snapshotsRoot,
} from "../src/snapshots.js";
import { syncClient } from "../src/sync.js";

let tmpDir: string;
let previousSnapshotsDir: string | undefined;
let previousConfigDir: string | undefined;
let previousConfigPath: string | undefined;

beforeEach(() => {
	tmpDir = join(
		tmpdir(),
		`ensemble-snapshots-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(tmpDir, { recursive: true });
	previousSnapshotsDir = process.env.ENSEMBLE_SNAPSHOTS_DIR;
	previousConfigDir = process.env.ENSEMBLE_CONFIG_DIR;
	previousConfigPath = process.env.ENSEMBLE_CONFIG_PATH;
	process.env.ENSEMBLE_SNAPSHOTS_DIR = join(tmpDir, "snapshots");
	process.env.ENSEMBLE_CONFIG_DIR = join(tmpDir, "config");
	process.env.ENSEMBLE_CONFIG_PATH = join(tmpDir, "config", "config.json");
});

function restoreEnv(key: string, prev: string | undefined): void {
	if (prev === undefined) process.env[key] = undefined;
	else process.env[key] = prev;
	if (prev === undefined) {
		// Node's `process.env` treats an assignment of undefined as string "undefined";
		// delete is the only way to truly unset, but Biome's noDelete disallows it in
		// production code. Confining the delete to a helper keeps the rest clean and
		// behavioural parity is what matters for env restoration.
		delete process.env[key];
	}
}

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	restoreEnv("ENSEMBLE_SNAPSHOTS_DIR", previousSnapshotsDir);
	restoreEnv("ENSEMBLE_CONFIG_DIR", previousConfigDir);
	restoreEnv("ENSEMBLE_CONFIG_PATH", previousConfigPath);
});

describe("snapshots.capture", () => {
	it("writes a manifest and pre-content copies for existing files", () => {
		const file = join(tmpDir, "config.json");
		writeFileSync(file, '{"hello":"world"}', "utf-8");

		const snap = capture([file]);
		expect(snap.id).toMatch(/\d{4}-\d{2}-\d{2}T/);
		expect(snap.files).toHaveLength(1);
		expect(snap.files[0]?.state).toBe("existing");
		expect(snap.files[0]?.preContentPath).toBeDefined();

		const manifestPath = join(snapshotsRoot(), snap.id, "manifest.json");
		const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(parsed.id).toBe(snap.id);
		expect(parsed.files[0].path).toBe(file);

		const entry = snap.files[0];
		if (!entry?.preContentPath) throw new Error("expected preContentPath");
		const preContent = readFileSync(join(snapshotsRoot(), snap.id, entry.preContentPath), "utf-8");
		expect(preContent).toBe('{"hello":"world"}');
	});

	it("records missing files with state=new-file", () => {
		const missing = join(tmpDir, "does-not-exist.json");
		const snap = capture([missing]);
		expect(snap.files).toHaveLength(1);
		expect(snap.files[0]?.state).toBe("new-file");
		expect(snap.files[0]?.preContentPath).toBeUndefined();
	});

	it("dedupes repeated paths", () => {
		const file = join(tmpDir, "dup.json");
		writeFileSync(file, "x", "utf-8");
		const snap = capture([file, file, file]);
		expect(snap.files).toHaveLength(1);
	});

	it("includes syncContext when provided", () => {
		const snap = capture([join(tmpDir, "x.json")], { syncContext: "test-run" });
		expect(snap.syncContext).toBe("test-run");
	});
});

describe("snapshots.restore", () => {
	it("restores existing files byte-identical", () => {
		const file = join(tmpDir, "data.json");
		const original = '{"key":"original","n":42}\n';
		writeFileSync(file, original, "utf-8");

		const snap = capture([file]);
		// Mutate the file to simulate a sync write.
		writeFileSync(file, '{"key":"mutated"}', "utf-8");

		const result = restore(snap.id);
		expect(result.restored).toContain(file);
		const restoredContent = readFileSync(file, "utf-8");
		expect(restoredContent).toBe(original);
	});

	it("deletes files that were new at capture time", () => {
		const file = join(tmpDir, "new.json");
		expect(existsSync(file)).toBe(false);

		const snap = capture([file]);
		// Simulate a sync creating the file.
		writeFileSync(file, "written-by-sync", "utf-8");
		expect(existsSync(file)).toBe(true);

		restore(snap.id);
		expect(existsSync(file)).toBe(false);
	});

	it("throws for unknown snapshot id", () => {
		expect(() => restore("nonexistent-id")).toThrow(/not found/);
	});
});

describe("snapshots.list and latest", () => {
	it("returns empty list when no snapshots exist", () => {
		expect(listSnapshots()).toEqual([]);
		expect(latest()).toBeNull();
	});

	it("returns snapshots newest-first and latest() matches", async () => {
		const file = join(tmpDir, "f.txt");
		writeFileSync(file, "1");
		const first = capture([file]);
		// Ensure different timestamp (ISO seconds precision would collide).
		await new Promise((r) => setTimeout(r, 15));
		const second = capture([file]);

		const all = listSnapshots();
		expect(all.length).toBe(2);
		expect(all[0]?.id).toBe(second.id);
		expect(all[1]?.id).toBe(first.id);
		expect(latest()?.id).toBe(second.id);
	});

	it("get() loads a specific snapshot", () => {
		const file = join(tmpDir, "f.txt");
		writeFileSync(file, "hi");
		const snap = capture([file]);
		const loaded = getSnapshot(snap.id);
		expect(loaded.id).toBe(snap.id);
	});
});

describe("snapshots.prune", () => {
	it("removes snapshots older than the retention window", () => {
		const file = join(tmpDir, "f.txt");
		writeFileSync(file, "x");
		const snap = capture([file]);

		// Rewrite the manifest with a very old createdAt.
		const manifestPath = join(snapshotsRoot(), snap.id, "manifest.json");
		const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
		parsed.createdAt = "2020-01-01T00:00:00.000Z";
		writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");

		const pruned = prune({ retentionDays: 30, now: new Date("2026-01-01T00:00:00Z") });
		expect(pruned).toContain(snap.id);
		expect(existsSync(join(snapshotsRoot(), snap.id))).toBe(false);
	});

	it("does not prune snapshots inside the window", () => {
		const file = join(tmpDir, "f.txt");
		writeFileSync(file, "x");
		const snap = capture([file]);
		const pruned = prune({ retentionDays: 30 });
		expect(pruned).not.toContain(snap.id);
	});

	it("treats retentionDays=0 as disabled", () => {
		const file = join(tmpDir, "f.txt");
		writeFileSync(file, "x");
		const snap = capture([file]);
		const manifestPath = join(snapshotsRoot(), snap.id, "manifest.json");
		const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
		parsed.createdAt = "2020-01-01T00:00:00.000Z";
		writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
		const pruned = prune({ retentionDays: 0 });
		expect(pruned).toEqual([]);
	});
});

describe("syncClient safe-apply integration", () => {
	it("captures a snapshot when a sync writes and rollback restores byte-identical state", () => {
		// Point a fake Cursor config file at a writable path so sync has
		// somewhere to touch. We can't override the hard-coded client path, so
		// we mock by setting the Cursor config as-if it exists.
		// The easiest path: make the Cursor config path in the real
		// filesystem unreachable and instead test directly against a
		// synthetic client path via the CC_SETTINGS / writeFileSync surface.
		// For integration, use claude-code's settings.json via the CC_SETTINGS
		// path override through a staged write.
		//
		// Simpler: capture() is called from syncClient only when real writes
		// happen. We drive that by writing a stand-in client config file
		// under tmpDir, setting HOME to tmpDir so Cursor's expandPath points
		// inside our sandbox, and then running syncClient("cursor").
		const originalHome = process.env.HOME;
		process.env.HOME = tmpDir;
		try {
			// Create a fake Cursor config that syncClient("cursor") will find.
			const cursorDir = join(tmpDir, ".cursor");
			mkdirSync(cursorDir, { recursive: true });
			const cursorPath = join(cursorDir, "mcp.json");
			const pre =
				'{\n  "mcpServers": {\n    "user-keeper": {\n      "command": "npx",\n      "args": ["-y", "@user/server"]\n    }\n  }\n}\n';
			writeFileSync(cursorPath, pre, "utf-8");

			// Build a config with one enabled server so sync has work.
			let config = createConfig();
			({ config } = addServer(config, { name: "managed-ctx", command: "npx" }));
			config = {
				...config,
				clients: [
					{ id: "cursor", group: null, last_synced: null, projects: {}, server_hashes: {} },
				],
			};

			const { result } = syncClient(config, "cursor");
			expect(result.hasChanges).toBe(true);
			expect(result.snapshotId).toBeDefined();
			expect(result.snapshotFiles ?? []).toContain(cursorPath);

			// After sync, the config file now contains both entries.
			const after = readFileSync(cursorPath, "utf-8");
			expect(after).not.toBe(pre);
			expect(after).toContain("managed-ctx");

			// Rollback restores byte-identical pre-sync contents.
			if (!result.snapshotId) throw new Error("expected snapshotId");
			const restoreResult = restore(result.snapshotId);
			expect(restoreResult.restored).toContain(cursorPath);
			const restored = readFileSync(cursorPath, "utf-8");
			expect(restored).toBe(pre);
		} finally {
			restoreEnv("HOME", originalHome);
		}
	});

	it("does not capture a snapshot for dry-run syncs", () => {
		const originalHome = process.env.HOME;
		process.env.HOME = tmpDir;
		try {
			const cursorDir = join(tmpDir, ".cursor");
			mkdirSync(cursorDir, { recursive: true });
			writeFileSync(join(cursorDir, "mcp.json"), "{}", "utf-8");

			let config = createConfig();
			({ config } = addServer(config, { name: "s", command: "npx" }));
			config = {
				...config,
				clients: [
					{ id: "cursor", group: null, last_synced: null, projects: {}, server_hashes: {} },
				],
			};

			const { result } = syncClient(config, "cursor", { dryRun: true });
			expect(result.snapshotId).toBeUndefined();
		} finally {
			restoreEnv("HOME", originalHome);
		}
	});

	it("does not capture a snapshot when nothing would change", () => {
		const originalHome = process.env.HOME;
		process.env.HOME = tmpDir;
		try {
			const cursorDir = join(tmpDir, ".cursor");
			mkdirSync(cursorDir, { recursive: true });
			writeFileSync(join(cursorDir, "mcp.json"), "{}", "utf-8");

			// Empty config, no managed servers to sync.
			let config = createConfig();
			config = {
				...config,
				clients: [
					{ id: "cursor", group: null, last_synced: null, projects: {}, server_hashes: {} },
				],
			};

			const { result } = syncClient(config, "cursor");
			expect(result.hasChanges).toBe(false);
			expect(result.snapshotId).toBeUndefined();
		} finally {
			restoreEnv("HOME", originalHome);
		}
	});
});
