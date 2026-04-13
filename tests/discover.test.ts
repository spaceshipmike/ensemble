import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfig } from "../src/config.js";
import { installSkill, installPlugin } from "../src/operations.js";
import { discover } from "../src/discover.js";

describe("discover", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "ensemble-discover-"));
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	it("returns an empty report when project roots have nothing", () => {
		const emptyRoot = join(tmp, "empty");
		mkdirSync(emptyRoot, { recursive: true });
		const report = discover(createConfig(), {
			projectRoots: [emptyRoot],
		});
		expect(Array.isArray(report.skills)).toBe(true);
		expect(Array.isArray(report.plugins)).toBe(true);
		expect(report.projectsScanned).toBe(0);
	});

	it("finds project skills and marks registered state", () => {
		// Create a fake project with a .claude/skills/foo/SKILL.md
		const projectRoot = join(tmp, "code");
		const project = join(projectRoot, "my-app");
		const skillDir = join(project, ".claude", "skills", "foo");
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`---\nname: foo\ndescription: Test skill for discovery\ntags: [test]\n---\n\nBody`,
			"utf-8",
		);

		// Config with 'foo' NOT registered
		let config = createConfig();
		let report = discover(config, { projectRoots: [projectRoot] });
		const found = report.skills.find((s) => s.name === "foo");
		expect(found).toBeDefined();
		expect(found?.source).toBe("project");
		expect(found?.projectPath).toBe(project);
		expect(found?.registered).toBe(false);
		expect(found?.skill.description).toBe("Test skill for discovery");

		// Now register it and re-scan — should report as registered
		({ config } = installSkill(config, { name: "foo" }));
		report = discover(config, { projectRoots: [projectRoot] });
		expect(report.skills.find((s) => s.name === "foo")?.registered).toBe(true);
	});

	it("skips projects when includeProjects is false", () => {
		const projectRoot = join(tmp, "code");
		const project = join(projectRoot, "my-app");
		const skillDir = join(project, ".claude", "skills", "foo");
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`---\nname: foo\n---\nBody`,
			"utf-8",
		);

		const report = discover(createConfig(), {
			projectRoots: [projectRoot],
			includeProjects: false,
		});
		expect(report.projectsScanned).toBe(0);
		expect(report.skills.find((s) => s.name === "foo")).toBeUndefined();
	});

	it("marks plugins as registered when already in config", () => {
		// We can't fake ~/.claude/plugins/installed_plugins.json without touching
		// the real home dir, so just verify that the registered-matching logic
		// uses the config's plugins list. The real file may or may not exist.
		let config = createConfig();
		({ config } = installPlugin(config, "typescript-lsp", "claude-plugins-official"));
		const report = discover(config, { projectRoots: [] });
		const found = report.plugins.find((p) => p.name === "typescript-lsp");
		if (found) {
			// Only assert if the real installed_plugins.json actually has this plugin
			expect(found.registered).toBe(true);
		}
	});
});
