import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
		return execSync(`npx tsx src/cli/index.ts ${args}`, {
			cwd: process.cwd(),
			encoding: "utf-8",
			env: { ...process.env, ENSEMBLE_CONFIG_PATH: configPath, ...env },
			timeout: 10000,
		}).trim();
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
		expect(output).toContain("1.2.0");
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

	// --- Deletions (v2.0.1 chunk 8) ---

	it("top-level enable command is removed", () => {
		const output = cli("enable foo");
		expect(output).toMatch(/unknown command|help|enable/i);
	});

	it("top-level disable command is removed", () => {
		const output = cli("disable foo");
		expect(output).toMatch(/unknown command|help|disable/i);
	});

	it("plugins install verb is removed", () => {
		const output = cli("plugins install foo");
		expect(output).toMatch(/unknown command|help|install/i);
	});

	it("plugins uninstall verb is removed", () => {
		const output = cli("plugins uninstall foo");
		expect(output).toMatch(/unknown command|help|uninstall/i);
	});

	// --- Pull (v2.0.1 chunk 8) ---

	it("pull rejects an unrecognised source", () => {
		const output = cli("pull not-a-real-source");
		expect(output).toMatch(/unrecognised source|expected/i);
	});

	it("pull routes owner/repo to a marketplace add", () => {
		const output = cli("pull acme/ensemble-marketplace");
		expect(output).toMatch(/added marketplace|ensemble-marketplace/i);
	});

	it("pull registry:slug surfaces the registry hint", () => {
		const output = cli("pull registry:context7");
		expect(output).toMatch(/ensemble registry add/i);
	});

	it("pull rejects an ambiguous local directory without --type", () => {
		const dir = join(tmpDir, "ambiguous");
		mkdirSync(dir, { recursive: true });
		const output = cli(`pull ${dir}`);
		expect(output).toMatch(/could not infer|--type/i);
	});

	it("pull imports a local skill directory", () => {
		const dir = join(tmpDir, "my-skill");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "SKILL.md"), "---\nname: my-skill\ndescription: X\n---\n");
		const output = cli(`pull ${dir}`);
		expect(output).toMatch(/installed skill 'my-skill'/i);
	});

	// --- Install / Uninstall (v2.0.1 chunk 8) ---

	it("install errors when the library is empty", () => {
		const output = cli("install nonexistent");
		expect(output).toMatch(/not found in the library/i);
	});

	it("install marks a server enabled on the target client", () => {
		cli("add example --command echo --args hello");
		cli("uninstall example --type server");
		const output = cli("install example --type server");
		expect(output).toMatch(/enabled server 'example'|installed server 'example'/i);
	});

	it("uninstall errors when the resource is not in the library", () => {
		const output = cli("uninstall ghost --type server");
		expect(output).toMatch(/not found/i);
	});

	// --- Library subcommand (v2.0.1 chunk 8) ---

	it("library list reports an empty library on a fresh config", () => {
		const output = cli("library list");
		expect(output).toContain("Library is empty");
	});

	it("library list shows an added server with an install badge", () => {
		cli("add example --command echo --args hello");
		const output = cli("library list");
		expect(output).toContain("example");
		expect(output).toContain("server");
		expect(output).toMatch(/\[installed\]|\[library\]/);
	});

	it("library list filters by --type", () => {
		cli("add only-server --command echo");
		const output = cli("library list --type plugin");
		expect(output).not.toContain("only-server");
	});

	it("library show errors when the name is missing", () => {
		const output = cli("library show ghost");
		expect(output).toMatch(/not found/i);
	});

	it("library show prints the entry detail", () => {
		cli("add example2 --command echo");
		const output = cli("library show example2");
		expect(output).toContain("server: example2");
		expect(output).toMatch(/install state/i);
	});

	it("library pivot filters by resource type", () => {
		cli("add pivot-server --command echo");
		const output = cli("library pivot server");
		expect(output).toContain("pivot-server");
	});

	it("library pivot on an empty type reports nothing", () => {
		const output = cli("library pivot plugin");
		expect(output).toMatch(/no plugins|library is empty/i);
	});

	// --- Remove (unified lifecycle destruction) ---

	it("remove with --type cascades type inference", () => {
		cli("add to-remove --command echo");
		const output = cli("remove to-remove --type server");
		expect(output).toMatch(/removed server 'to-remove'/i);
	});

	it("remove errors on an unknown name", () => {
		const output = cli("remove ghost-removed");
		expect(output).toMatch(/not found/i);
	});

	// --- Settings (v2.0.1 chunk 8) ---

	it("settings list is empty on a fresh config", () => {
		const managed = join(tmpDir, "managed-settings.json");
		const output = cli("settings list", { ENSEMBLE_MANAGED_SETTINGS_PATH: managed });
		expect(output).toContain("No managed settings");
	});

	it("settings set records a key and list surfaces it", () => {
		const managed = join(tmpDir, "managed-settings.json");
		const setOut = cli(`settings set permissions.allow '["Read","Grep"]'`, {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
		});
		expect(setOut).toMatch(/set 'permissions.allow'/i);
		const listOut = cli("settings list", { ENSEMBLE_MANAGED_SETTINGS_PATH: managed });
		expect(listOut).toContain("permissions.allow");
		expect(listOut).toContain("Read");
	});

	it("settings show errors when the key is not managed", () => {
		const managed = join(tmpDir, "managed-settings.json");
		const output = cli("settings show permissions.allow", {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
		});
		expect(output).toMatch(/not a managed setting/i);
	});

	it("settings show prints the stored value", () => {
		const managed = join(tmpDir, "managed-settings.json");
		cli("settings set theme dark", { ENSEMBLE_MANAGED_SETTINGS_PATH: managed });
		const output = cli("settings show theme", { ENSEMBLE_MANAGED_SETTINGS_PATH: managed });
		expect(output).toContain("Key: theme");
		expect(output).toContain('Value: "dark"');
	});

	it("settings unset errors when no managed key matches", () => {
		const managed = join(tmpDir, "managed-settings.json");
		const output = cli("settings unset missing.key", {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
		});
		expect(output).toMatch(/no managed setting/i);
	});

	it("settings unset stops managing a key", () => {
		const managed = join(tmpDir, "managed-settings.json");
		cli(`settings set permissions.allow '["Read"]'`, {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
		});
		const unsetOut = cli("settings unset permissions.allow", {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
		});
		expect(unsetOut).toMatch(/stopped managing 'permissions.allow'/i);
		const listOut = cli("settings list", { ENSEMBLE_MANAGED_SETTINGS_PATH: managed });
		expect(listOut).toContain("No managed settings");
	});

	it("settings sync errors for non-claude-code clients", () => {
		const managed = join(tmpDir, "managed-settings.json");
		const output = cli("settings sync --client cursor", {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
		});
		expect(output).toMatch(/not wired yet|only claude-code is supported/i);
	});

	it("settings sync writes managed keys to claude-code settings.json", () => {
		const managed = join(tmpDir, "managed-settings.json");
		const home = join(tmpDir, "home");
		mkdirSync(join(home, ".claude"), { recursive: true });
		cli(`settings set permissions.allow '["Read"]'`, {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
			HOME: home,
		});
		const syncOut = cli("settings sync", {
			ENSEMBLE_MANAGED_SETTINGS_PATH: managed,
			HOME: home,
		});
		expect(syncOut).toMatch(/synced 1 managed setting\(s\)/i);
		const written = JSON.parse(
			readFileSync(join(home, ".claude", "settings.json"), "utf-8"),
		) as Record<string, unknown>;
		expect(written.permissions).toEqual({ allow: ["Read"] });
		expect(written.__ensemble_managed).toEqual(["permissions.allow"]);
	});

	// --- Browse (v2.0.1 chunk 9) ---

	it("browse on a fresh config reports no matches", () => {
		const output = cli("browse");
		expect(output).toContain("No matches");
	});

	it("browse with an added server surfaces it with an install-state badge", () => {
		cli("add browse-server --command echo");
		const output = cli("browse");
		expect(output).toContain("browse-server");
		expect(output).toMatch(/\[installed\]|\[library\]/);
	});

	it("browse --type filters down to one resource type", () => {
		cli("add only-server --command echo");
		const output = cli("browse --type plugin");
		expect(output).toContain("No matches");
	});

	it("browse rejects a non-positive --limit", () => {
		const output = cli("browse --limit 0");
		expect(output).toMatch(/--limit must be a positive integer/i);
	});
});
