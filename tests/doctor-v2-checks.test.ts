/**
 * v2.0.1 additive doctor checks:
 *   - orphan snapshots
 *   - snapshot-dir size warning
 *   - agents/commands drift
 *   - retention config visibility
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeAgentMd } from "../src/agents.js";
import { writeCommandMd } from "../src/commands.js";
import { createConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { installAgent, installCommand } from "../src/operations.js";
import { capture } from "../src/snapshots.js";
import { syncClient } from "../src/sync.js";

let tmpDir: string;
const prev: Record<string, string | undefined> = {};

function restoreEnv(key: string): void {
	const p = prev[key];
	if (p === undefined) delete process.env[key];
	else process.env[key] = p;
}

beforeEach(() => {
	tmpDir = join(
		tmpdir(),
		`ensemble-doctor-v2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(tmpDir, { recursive: true });
	for (const k of [
		"ENSEMBLE_AGENTS_DIR",
		"ENSEMBLE_COMMANDS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		prev[k] = process.env[k];
	}
	process.env.ENSEMBLE_AGENTS_DIR = join(tmpDir, "canon-agents");
	process.env.ENSEMBLE_COMMANDS_DIR = join(tmpDir, "canon-commands");
	process.env.ENSEMBLE_SNAPSHOTS_DIR = join(tmpDir, "snapshots");
	process.env.ENSEMBLE_CONFIG_DIR = join(tmpDir, "config");
	process.env.ENSEMBLE_CONFIG_PATH = join(tmpDir, "config", "config.json");
	process.env.HOME = tmpDir;
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	for (const k of [
		"ENSEMBLE_AGENTS_DIR",
		"ENSEMBLE_COMMANDS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		restoreEnv(k);
	}
});

// --- Retention config visibility ---

describe("retention config visibility check", () => {
	it("surfaces both retention fields with defaults", () => {
		const result = runDoctor(createConfig());
		const check = result.checks.find((c) => c.id === "snapshot-retention-config");
		expect(check).toBeDefined();
		expect(check?.message).toMatch(/30 days/);
		expect(check?.message).toMatch(/500 MB/);
	});

	it("reports 'pruning disabled' when retention is 0", () => {
		const config = createConfig();
		config.settings.snapshot_retention_days = 0;
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "snapshot-retention-config");
		expect(check?.message).toMatch(/pruning disabled/);
	});

	it("reports 'size warn disabled' when threshold is 0", () => {
		const config = createConfig();
		config.settings.snapshot_dir_size_warn_mb = 0;
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "snapshot-retention-config");
		expect(check?.message).toMatch(/size warn disabled/);
	});
});

// --- Snapshot dir size ---

describe("snapshot-dir size check", () => {
	it("emits info when size is under threshold", () => {
		// Capture a tiny snapshot so the root exists.
		const tinyFile = join(tmpDir, "tiny.txt");
		writeFileSync(tinyFile, "x", "utf-8");
		capture([tinyFile]);

		const result = runDoctor(createConfig());
		const check = result.checks.find((c) => c.id === "snapshot-dir-size");
		expect(check).toBeDefined();
		expect(check?.severity).toBe("info");
	});

	it("warns when size exceeds the configured threshold", () => {
		// Configure an unreasonably small threshold (1 MB) and add a file > 1 MB.
		const big = join(tmpDir, "big.bin");
		writeFileSync(big, Buffer.alloc(2 * 1024 * 1024, 0), "utf-8");
		capture([big]);

		const config = createConfig();
		config.settings.snapshot_dir_size_warn_mb = 1;
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "snapshot-dir-size");
		expect(check).toBeDefined();
		expect(check?.severity).toBe("warning");
		expect(check?.message).toMatch(/MB/);
	});

	it("is skipped entirely when threshold is 0", () => {
		const tinyFile = join(tmpDir, "tiny.txt");
		writeFileSync(tinyFile, "x", "utf-8");
		capture([tinyFile]);

		const config = createConfig();
		config.settings.snapshot_dir_size_warn_mb = 0;
		const result = runDoctor(config);
		expect(result.checks.filter((c) => c.id === "snapshot-dir-size")).toHaveLength(0);
	});
});

// --- Orphan snapshots ---

describe("orphan snapshot check", () => {
	it("flags a snapshot whose captured paths are all gone and unknown to the library", () => {
		// Capture a file that won't exist anymore by the time doctor runs.
		const ghost = join(tmpDir, "gone.md");
		writeFileSync(ghost, "content", "utf-8");
		capture([ghost]);
		rmSync(ghost, { force: true });

		const result = runDoctor(createConfig());
		const check = result.checks.find((c) => c.id === "orphan-snapshot");
		expect(check).toBeDefined();
		expect(check?.message).toMatch(/candidate for pruning/);
	});

	it("does not flag a snapshot whose captured agent path matches a live library entry", () => {
		writeAgentMd({ name: "keeper", enabled: true, description: "", tools: [], path: "" });
		let config = createConfig();
		({ config } = installAgent(config, { name: "keeper" }));

		// Capture the fan-out path for the live agent (the file doesn't need to
		// exist on disk — a snapshot can capture new-file entries too).
		const target = join(tmpDir, ".claude", "agents", "keeper.md");
		capture([target]);

		const result = runDoctor(config);
		const orphanChecks = result.checks.filter(
			(c) => c.id === "orphan-snapshot" && c.severity === "info" && /candidate/.test(c.message),
		);
		expect(orphanChecks).toHaveLength(0);
	});
});

// --- Agents/commands drift ---

describe("agents/commands drift check", () => {
	it("flags a managed fan-out file that was edited outside ensemble", () => {
		writeAgentMd({
			name: "drifty",
			enabled: true,
			description: "original description",
			tools: ["Read"],
			path: "",
		});
		let config = createConfig();
		({ config } = installAgent(config, {
			name: "drifty",
			description: "original description",
			tools: ["Read"],
		}));
		config = {
			...config,
			clients: [
				{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
			],
		};
		writeFileSync(join(tmpDir, ".claude.json"), "{}", "utf-8");
		syncClient(config, "claude-code");

		// Tamper with the fan-out file but keep the __ensemble marker so the
		// drift check recognises it as a managed file.
		const target = join(tmpDir, ".claude", "agents", "drifty.md");
		writeFileSync(
			target,
			"---\n__ensemble: true\nname: drifty\ndescription: edited by hand\n---\n",
			"utf-8",
		);

		const result = runDoctor(config);
		const drift = result.checks.find((c) => c.id === "agent-drift");
		expect(drift).toBeDefined();
		expect(drift?.severity).toBe("warning");
	});

	it("is quiet when fan-out matches the library", () => {
		writeAgentMd({
			name: "clean",
			enabled: true,
			description: "d",
			tools: [],
			path: "",
		});
		let config = createConfig();
		({ config } = installAgent(config, { name: "clean", description: "d" }));
		config = {
			...config,
			clients: [
				{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
			],
		};
		writeFileSync(join(tmpDir, ".claude.json"), "{}", "utf-8");
		syncClient(config, "claude-code");

		const result = runDoctor(config);
		const drift = result.checks.find((c) => c.id === "agent-drift");
		expect(drift).toBeUndefined();
		// Aggregate "all-good" info should appear.
		const info = result.checks.find((c) => c.id === "agents-commands-drift");
		expect(info?.severity).toBe("info");
	});

	it("detects drift on commands as well", () => {
		writeCommandMd({
			name: "cdrift",
			enabled: true,
			description: "d",
			allowedTools: [],
			path: "",
		});
		let config = createConfig();
		({ config } = installCommand(config, { name: "cdrift", description: "d" }));
		config = {
			...config,
			clients: [
				{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
			],
		};
		writeFileSync(join(tmpDir, ".claude.json"), "{}", "utf-8");
		syncClient(config, "claude-code");

		const target = join(tmpDir, ".claude", "commands", "cdrift.md");
		writeFileSync(
			target,
			"---\n__ensemble: true\nname: cdrift\ndescription: edited\n---\n",
			"utf-8",
		);

		const result = runDoctor(config);
		const drift = result.checks.find((c) => c.id === "command-drift");
		expect(drift).toBeDefined();
	});
});
