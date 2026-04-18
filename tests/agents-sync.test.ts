import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeAgentMd } from "../src/agents.js";
import { createConfig } from "../src/config.js";
import { installAgent } from "../src/operations.js";
import { restore } from "../src/snapshots.js";
import { syncAgents, syncClient } from "../src/sync.js";

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
		`ensemble-agents-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(tmpDir, { recursive: true });
	for (const k of [
		"ENSEMBLE_AGENTS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		prev[k] = process.env[k];
	}
	process.env.ENSEMBLE_AGENTS_DIR = join(tmpDir, "canon-agents");
	process.env.ENSEMBLE_SNAPSHOTS_DIR = join(tmpDir, "snapshots");
	process.env.ENSEMBLE_CONFIG_DIR = join(tmpDir, "config");
	process.env.ENSEMBLE_CONFIG_PATH = join(tmpDir, "config", "config.json");
	process.env.HOME = tmpDir;
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	for (const k of [
		"ENSEMBLE_AGENTS_DIR",
		"ENSEMBLE_SNAPSHOTS_DIR",
		"ENSEMBLE_CONFIG_DIR",
		"ENSEMBLE_CONFIG_PATH",
		"HOME",
	]) {
		restoreEnv(k);
	}
});

describe("syncAgents — standalone fan-out", () => {
	it("writes a managed copy to the client's agents directory", () => {
		// Seed canonical store.
		writeAgentMd(
			{
				name: "reviewer",
				enabled: true,
				description: "Reviews code.",
				tools: ["Read", "Grep"],
				path: "",
			},
			"# Review\nReview body.",
		);
		let config = createConfig();
		({ config } = installAgent(config, {
			name: "reviewer",
			description: "Reviews code.",
			tools: ["Read", "Grep"],
		}));

		const result = syncAgents(config, "claude-code");
		const target = join(tmpDir, ".claude", "agents", "reviewer.md");
		expect(existsSync(target)).toBe(true);
		const contents = readFileSync(target, "utf-8");
		expect(contents).toContain("__ensemble: true");
		expect(contents).toContain("name: reviewer");
		expect(contents).toContain("description: Reviews code.");
		expect(contents).toContain("tools: [Read, Grep]");
		expect(contents).toContain("Review body.");
		expect(result.actions.some((a) => a.type === "write" && a.agentName === "reviewer")).toBe(true);
	});

	it("reports already-in-sync when state matches", () => {
		writeAgentMd({ name: "x", enabled: true, description: "", tools: [], path: "" });
		let config = createConfig();
		({ config } = installAgent(config, { name: "x" }));

		syncAgents(config, "claude-code");
		const second = syncAgents(config, "claude-code");
		expect(second.messages.join(" ")).toMatch(/already in sync/);
	});

	it("removes managed files whose canonical entry disappeared", () => {
		writeAgentMd({ name: "old", enabled: true, description: "", tools: [], path: "" });
		let config = createConfig();
		({ config } = installAgent(config, { name: "old" }));
		syncAgents(config, "claude-code");
		const target = join(tmpDir, ".claude", "agents", "old.md");
		expect(existsSync(target)).toBe(true);

		// Drop from config — simulate uninstall.
		config = { ...config, agents: [] };
		const result = syncAgents(config, "claude-code");
		expect(existsSync(target)).toBe(false);
		expect(result.actions.some((a) => a.type === "remove" && a.agentName === "old")).toBe(true);
	});

	it("preserves user-authored agent files byte-identical", () => {
		const agentsOutDir = join(tmpDir, ".claude", "agents");
		mkdirSync(agentsOutDir, { recursive: true });
		const userPath = join(agentsOutDir, "mine.md");
		const userContents = "---\nname: mine\ndescription: my own\n---\n# body\n";
		writeFileSync(userPath, userContents, "utf-8");

		writeAgentMd({ name: "mgmt", enabled: true, description: "", tools: [], path: "" });
		let config = createConfig();
		({ config } = installAgent(config, { name: "mgmt" }));
		syncAgents(config, "claude-code");

		// User file untouched, managed file written alongside.
		expect(readFileSync(userPath, "utf-8")).toBe(userContents);
		expect(existsSync(join(agentsOutDir, "mgmt.md"))).toBe(true);
	});

	it("dry-run does not touch the filesystem", () => {
		writeAgentMd({ name: "x", enabled: true, description: "", tools: [], path: "" });
		let config = createConfig();
		({ config } = installAgent(config, { name: "x" }));
		const result = syncAgents(config, "claude-code", { dryRun: true });
		expect(result.messages.join(" ")).toMatch(/would sync/);
		expect(existsSync(join(tmpDir, ".claude", "agents", "x.md"))).toBe(false);
	});
});

describe("syncClient — agents integration + snapshot rollback", () => {
	it("captures agents in the sync snapshot; rollback restores the user-authored file byte-identical", () => {
		// Existing user-authored agent at the fan-out location.
		const agentsOutDir = join(tmpDir, ".claude", "agents");
		mkdirSync(agentsOutDir, { recursive: true });
		const userPath = join(agentsOutDir, "user-agent.md");
		const userContents = "---\nname: user-agent\n---\n# body\n";
		writeFileSync(userPath, userContents, "utf-8");

		// A managed agent the user has had before (so sync will overwrite if it
		// drifts). Seed with the marker so our sniff detects it.
		const managedPath = join(agentsOutDir, "managed.md");
		writeFileSync(
			managedPath,
			"---\n__ensemble: true\nname: managed\ndescription: stale\n---\n",
			"utf-8",
		);

		// Canonical store + config.
		writeAgentMd({ name: "managed", enabled: true, description: "fresh", tools: [], path: "" });
		let config = createConfig();
		({ config } = installAgent(config, { name: "managed", description: "fresh" }));
		config = {
			...config,
			clients: [
				{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
			],
		};

		// Fake Claude Code install.
		writeFileSync(join(tmpDir, ".claude.json"), "{}", "utf-8");
		writeFileSync(join(tmpDir, ".claude", "settings.json"), "{}\n", "utf-8");

		const { result } = syncClient(config, "claude-code");

		expect(result.snapshotId).toBeDefined();
		// Managed agent overwritten with fresh description.
		expect(readFileSync(managedPath, "utf-8")).toContain("description: fresh");
		// User agent untouched.
		expect(readFileSync(userPath, "utf-8")).toBe(userContents);

		// Rollback restores the managed file's pre-sync content byte-identical.
		if (!result.snapshotId) throw new Error("expected snapshotId");
		restore(result.snapshotId);
		expect(readFileSync(managedPath, "utf-8")).toContain("description: stale");
		// User file still untouched.
		expect(readFileSync(userPath, "utf-8")).toBe(userContents);
	});
});
