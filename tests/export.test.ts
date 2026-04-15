import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { addServer, createGroup, addServerToGroup, installSkill, addSkillToGroup, setUserNotes } from "../src/operations.js";
import { writeSkillMd } from "../src/skills.js";
import { exportGroupAsPlugin } from "../src/export.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-export-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("exportGroupAsPlugin", () => {
	it("exports a server-only group", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx", args: ["tsx", "index.ts"] }));
		({ config } = addServer(config, { name: "prm", command: "uvx", args: ["prm"] }));
		({ config } = createGroup(config, "dev", "Development servers"));
		({ config } = addServerToGroup(config, "dev", "ctx"));
		({ config } = addServerToGroup(config, "dev", "prm"));

		const outputDir = join(tmpDir, "dev-plugin");
		const result = exportGroupAsPlugin(config, "dev", outputDir);

		expect(result.ok).toBe(true);
		expect(result.serverCount).toBe(2);
		expect(result.skillCount).toBe(0);

		// Verify manifest
		const manifest = JSON.parse(readFileSync(join(outputDir, "plugin.json"), "utf-8"));
		expect(manifest.name).toBe("dev");
		expect(manifest.description).toBe("Development servers");
		expect(manifest.servers.ctx.command).toBe("npx");
		expect(manifest.servers.prm.command).toBe("uvx");
	});

	it("exports a group with skills (copied, not symlinked)", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		({ config } = installSkill(config, { name: "git-workflow", description: "Git best practices" }));
		({ config } = createGroup(config, "dev"));
		({ config } = addServerToGroup(config, "dev", "ctx"));
		({ config } = addSkillToGroup(config, "dev", "git-workflow"));

		// Write the actual SKILL.md to canonical store
		const skillPath = writeSkillMd(config.skills[0]!, "# Git Workflow\nDo things");

		const outputDir = join(tmpDir, "dev-plugin");
		const result = exportGroupAsPlugin(config, "dev", outputDir);

		expect(result.ok).toBe(true);
		expect(result.skillCount).toBe(1);

		// Verify skill was COPIED (file exists, not symlink)
		const copiedSkill = join(outputDir, "skills", "git-workflow", "SKILL.md");
		expect(existsSync(copiedSkill)).toBe(true);

		// Verify it's a real file, not a symlink
		const { lstatSync } = require("node:fs");
		expect(lstatSync(copiedSkill).isSymbolicLink()).toBe(false);

		// Verify content
		const content = readFileSync(copiedSkill, "utf-8");
		expect(content).toContain("Git Workflow");
	});

	it("fails for nonexistent group", () => {
		const result = exportGroupAsPlugin(createConfig(), "nope");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("includes userNotes by default and strips them with stripNotes", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		({ config } = installSkill(config, { name: "writer", description: "Frontmatter writer" }));
		({ config } = createGroup(config, "dev"));
		({ config } = addServerToGroup(config, "dev", "ctx"));
		({ config } = addSkillToGroup(config, "dev", "writer"));
		({ config } = setUserNotes(config, { ref: "server:ctx", text: "trusted local" }));
		({ config } = setUserNotes(config, { ref: "skill:writer", text: "preferred for ADRs" }));
		writeSkillMd(config.skills[0]!, "# Writer");

		const includedDir = join(tmpDir, "dev-plugin-with-notes");
		exportGroupAsPlugin(config, "dev", includedDir);
		const withNotes = JSON.parse(readFileSync(join(includedDir, "plugin.json"), "utf-8"));
		expect(withNotes.servers.ctx.userNotes).toBe("trusted local");
		expect(withNotes.skillNotes.writer).toBe("preferred for ADRs");

		const strippedDir = join(tmpDir, "dev-plugin-stripped");
		exportGroupAsPlugin(config, "dev", strippedDir, { stripNotes: true });
		const stripped = JSON.parse(readFileSync(join(strippedDir, "plugin.json"), "utf-8"));
		expect(stripped.servers.ctx.userNotes).toBeUndefined();
		expect(stripped.skillNotes).toBeUndefined();
		// Byte-clean check: the literal key must not appear in the file.
		const raw = readFileSync(join(strippedDir, "plugin.json"), "utf-8");
		expect(raw).not.toContain("userNotes");
		expect(raw).not.toContain("skillNotes");
	});

	it("generates valid plugin.json manifest", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx", env: { KEY: "val" } }));
		({ config } = createGroup(config, "dev"));
		({ config } = addServerToGroup(config, "dev", "ctx"));

		const outputDir = join(tmpDir, "dev-plugin");
		exportGroupAsPlugin(config, "dev", outputDir);

		const manifest = JSON.parse(readFileSync(join(outputDir, "plugin.json"), "utf-8"));
		// Manifest should be self-contained — no __ensemble markers
		expect(JSON.stringify(manifest)).not.toContain("__ensemble");
		expect(manifest.servers.ctx.env.KEY).toBe("val");
	});
});
