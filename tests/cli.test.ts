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
		return err.stdout?.trim() ?? err.stderr?.trim() ?? "";
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
});
