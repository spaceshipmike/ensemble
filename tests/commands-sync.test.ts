import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeCommandMd } from "../src/commands.js";
import { createConfig } from "../src/config.js";
import { installCommand } from "../src/operations.js";
import { restore } from "../src/snapshots.js";
import { syncClient, syncCommands } from "../src/sync.js";

let tmpDir: string;
const prev: Record<string, string | undefined> = {};

function restoreEnv(key: string): void {
	const p = prev[key];
	if (p === undefined) delete process.env[key];
	else process.env[key] = p;
}

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-cmd-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
	for (const k of [
		"ENSEMBLE_COMMANDS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		prev[k] = process.env[k];
	}
	process.env.ENSEMBLE_COMMANDS_DIR = join(tmpDir, "canon-commands");
	process.env.ENSEMBLE_SNAPSHOTS_DIR = join(tmpDir, "snapshots");
	process.env.ENSEMBLE_CONFIG_DIR = join(tmpDir, "config");
	process.env.ENSEMBLE_CONFIG_PATH = join(tmpDir, "config", "config.json");
	process.env.HOME = tmpDir;
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	for (const k of [
		"ENSEMBLE_COMMANDS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		restoreEnv(k);
	}
});

describe("syncCommands — standalone fan-out", () => {
	it("writes a managed copy to the client's commands directory", () => {
		writeCommandMd(
			{
				name: "review",
				enabled: true,
				description: "Audit spec vs reality.",
				allowedTools: ["Read", "Grep"],
				argumentHint: "<scope>",
				path: "",
			},
			"Prompt body for /review.",
		);
		let config = createConfig();
		({ config } = installCommand(config, {
			name: "review",
			description: "Audit spec vs reality.",
			allowedTools: ["Read", "Grep"],
			argumentHint: "<scope>",
		}));

		syncCommands(config, "claude-code");
		const target = join(tmpDir, ".claude", "commands", "review.md");
		expect(existsSync(target)).toBe(true);
		const contents = readFileSync(target, "utf-8");
		expect(contents).toContain("__ensemble: true");
		expect(contents).toContain("description: Audit spec vs reality.");
		expect(contents).toContain("allowed-tools: [Read, Grep]");
		expect(contents).toContain("argument-hint: <scope>");
		expect(contents).toContain("Prompt body for /review.");
	});

	it("reports already-in-sync when state matches", () => {
		writeCommandMd({ name: "x", enabled: true, description: "", allowedTools: [], path: "" });
		let config = createConfig();
		({ config } = installCommand(config, { name: "x" }));
		syncCommands(config, "claude-code");
		const second = syncCommands(config, "claude-code");
		expect(second.messages.join(" ")).toMatch(/already in sync/);
	});

	it("removes managed files whose canonical entry disappeared", () => {
		writeCommandMd({ name: "old", enabled: true, description: "", allowedTools: [], path: "" });
		let config = createConfig();
		({ config } = installCommand(config, { name: "old" }));
		syncCommands(config, "claude-code");
		const target = join(tmpDir, ".claude", "commands", "old.md");
		expect(existsSync(target)).toBe(true);

		config = { ...config, commands: [] };
		syncCommands(config, "claude-code");
		expect(existsSync(target)).toBe(false);
	});

	it("preserves user-authored command files byte-identical", () => {
		const outDir = join(tmpDir, ".claude", "commands");
		mkdirSync(outDir, { recursive: true });
		const userPath = join(outDir, "mine.md");
		const userContents = "---\nname: mine\ndescription: my own\n---\n# body\n";
		writeFileSync(userPath, userContents, "utf-8");

		writeCommandMd({ name: "mgmt", enabled: true, description: "", allowedTools: [], path: "" });
		let config = createConfig();
		({ config } = installCommand(config, { name: "mgmt" }));
		syncCommands(config, "claude-code");

		expect(readFileSync(userPath, "utf-8")).toBe(userContents);
		expect(existsSync(join(outDir, "mgmt.md"))).toBe(true);
	});

	it("dry-run does not touch the filesystem", () => {
		writeCommandMd({ name: "x", enabled: true, description: "", allowedTools: [], path: "" });
		let config = createConfig();
		({ config } = installCommand(config, { name: "x" }));
		const result = syncCommands(config, "claude-code", { dryRun: true });
		expect(result.messages.join(" ")).toMatch(/would sync/);
		expect(existsSync(join(tmpDir, ".claude", "commands", "x.md"))).toBe(false);
	});
});

describe("syncClient — commands integration + snapshot rollback", () => {
	it("captures commands in the sync snapshot; rollback restores byte-identical", () => {
		const outDir = join(tmpDir, ".claude", "commands");
		mkdirSync(outDir, { recursive: true });
		const userPath = join(outDir, "user-cmd.md");
		const userContents = "---\nname: user-cmd\n---\n# body\n";
		writeFileSync(userPath, userContents, "utf-8");

		const managedPath = join(outDir, "managed.md");
		writeFileSync(
			managedPath,
			"---\n__ensemble: true\nname: managed\ndescription: stale\n---\n",
			"utf-8",
		);

		writeCommandMd({
			name: "managed",
			enabled: true,
			description: "fresh",
			allowedTools: [],
			path: "",
		});
		let config = createConfig();
		({ config } = installCommand(config, { name: "managed", description: "fresh" }));
		config = {
			...config,
			clients: [
				{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
			],
		};

		writeFileSync(join(tmpDir, ".claude.json"), "{}", "utf-8");
		writeFileSync(join(tmpDir, ".claude", "settings.json"), "{}\n", "utf-8");

		const { result } = syncClient(config, "claude-code");
		expect(result.snapshotId).toBeDefined();
		expect(readFileSync(managedPath, "utf-8")).toContain("description: fresh");
		expect(readFileSync(userPath, "utf-8")).toBe(userContents);

		if (!result.snapshotId) throw new Error("expected snapshotId");
		restore(result.snapshotId);
		expect(readFileSync(managedPath, "utf-8")).toContain("description: stale");
		expect(readFileSync(userPath, "utf-8")).toBe(userContents);
	});
});
