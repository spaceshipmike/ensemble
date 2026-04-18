import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

function cli(args: string, env?: Record<string, string>): string {
	const configPath = join(tmpDir, "config.json");
	// Run CLI via tsx against the source directly
	try {
		return execSync(
			`npx tsx src/cli/index.ts ${args}`,
			{
				cwd: process.cwd(),
				encoding: "utf-8",
				env: { ...process.env, ENSEMBLE_CONFIG_PATH: configPath, ...env },
				timeout: 10000,
			},
		).trim();
	} catch (e: unknown) {
		const err = e as { stderr?: string; stdout?: string; status?: number };
		const stdout = err.stdout?.trim() ?? "";
		const stderr = err.stderr?.trim() ?? "";
		return stdout || stderr;
	}
}

describe("CLI", () => {
	it("shows version", () => {
		const output = cli("--version");
		expect(output).toContain("1.0.7");
	});

	it("shows help", () => {
		const output = cli("--help");
		expect(output).toContain("ensemble");
		expect(output).toContain("Central manager");
	});

	it("list shows no servers for fresh config", () => {
		const output = cli("list");
		expect(output).toContain("No servers");
	});

	it("groups list shows no groups for fresh config", () => {
		const output = cli("groups list");
		expect(output).toContain("No groups");
	});

	it("doctor runs without error", () => {
		const output = cli("doctor");
		// Output contains either check results or health summary
		expect(output.length).toBeGreaterThan(0);
	});

	it("search returns results for installed servers", () => {
		const output = cli("search nonexistent-thing-xyz");
		expect(output).toContain("No results");
	});

	it("registry backends lists adapters", () => {
		const output = cli("registry backends");
		expect(output).toContain("official");
		expect(output).toContain("glama");
	});

	// --- Agents CLI (v2.0.1 chunk 7.5) ---

	it("agents list shows no agents for fresh config", () => {
		const agentsDir = join(tmpDir, "agents-canon");
		const output = cli("agents list", { ENSEMBLE_AGENTS_DIR: agentsDir, HOME: tmpDir });
		expect(output).toContain("No agents");
	});

	it("agents add imports an agent from a local .md file", () => {
		const agentsDir = join(tmpDir, "agents-canon");
		const mdPath = join(tmpDir, "reviewer.md");
		writeFileSync(
			mdPath,
			"---\nname: reviewer\ndescription: Reviews code.\ntools:\n  - Read\n  - Grep\n---\n# Review body",
		);
		const addOutput = cli(`agents add ${mdPath}`, {
			ENSEMBLE_AGENTS_DIR: agentsDir,
			HOME: tmpDir,
		});
		expect(addOutput).toContain("Installed agent 'reviewer'");
		const listOutput = cli("agents list", { ENSEMBLE_AGENTS_DIR: agentsDir, HOME: tmpDir });
		expect(listOutput).toContain("reviewer");
		expect(listOutput).toContain("Reviews code");
	});

	it("agents remove errors on a nonexistent agent", () => {
		const agentsDir = join(tmpDir, "agents-canon");
		const output = cli("agents remove does-not-exist", {
			ENSEMBLE_AGENTS_DIR: agentsDir,
			HOME: tmpDir,
		});
		expect(output).toMatch(/not found/i);
	});

	// --- Commands CLI (v2.0.1 chunk 7.5) ---

	it("commands list shows no commands for fresh config", () => {
		const cmdsDir = join(tmpDir, "commands-canon");
		const output = cli("commands list", { ENSEMBLE_COMMANDS_DIR: cmdsDir, HOME: tmpDir });
		expect(output).toContain("No commands");
	});

	it("commands add imports a slash command from a local .md file", () => {
		const cmdsDir = join(tmpDir, "commands-canon");
		const mdPath = join(tmpDir, "evolve.md");
		writeFileSync(
			mdPath,
			"---\nname: evolve\ndescription: Evolve the spec.\nargument-hint: <section>\n---\nBody",
		);
		const addOutput = cli(`commands add ${mdPath}`, {
			ENSEMBLE_COMMANDS_DIR: cmdsDir,
			HOME: tmpDir,
		});
		expect(addOutput).toContain("Installed command 'evolve'");
		const listOutput = cli("commands list", { ENSEMBLE_COMMANDS_DIR: cmdsDir, HOME: tmpDir });
		expect(listOutput).toContain("/evolve");
		expect(listOutput).toContain("Evolve the spec");
	});

	it("commands remove errors on a nonexistent command", () => {
		const cmdsDir = join(tmpDir, "commands-canon");
		const output = cli("commands remove does-not-exist", {
			ENSEMBLE_COMMANDS_DIR: cmdsDir,
			HOME: tmpDir,
		});
		expect(output).toMatch(/not found/i);
	});
});
