import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	formatFrontmatter,
	frontmatterToSkill,
	parseFrontmatter,
	skillToFrontmatter,
} from "../src/skills.js";

describe("parseFrontmatter", () => {
	it("parses basic frontmatter", () => {
		const { meta, body } = parseFrontmatter("---\nname: test\ndescription: A test skill\n---\n\nBody here");
		expect(meta["name"]).toBe("test");
		expect(meta["description"]).toBe("A test skill");
		expect(body).toBe("Body here");
	});

	it("parses inline lists", () => {
		const { meta } = parseFrontmatter("---\ntags: [git, workflow, ci]\n---\n");
		expect(meta["tags"]).toEqual(["git", "workflow", "ci"]);
	});

	it("strips quotes from values", () => {
		const { meta } = parseFrontmatter('---\nname: "quoted"\n---\n');
		expect(meta["name"]).toBe("quoted");
	});

	it("returns empty meta when no frontmatter", () => {
		const { meta, body } = parseFrontmatter("Just body text");
		expect(meta).toEqual({});
		expect(body).toBe("Just body text");
	});

	it("handles missing closing delimiter", () => {
		const { meta, body } = parseFrontmatter("---\nname: test\nno closing");
		expect(meta).toEqual({});
		expect(body).toBe("---\nname: test\nno closing");
	});
});

describe("formatFrontmatter", () => {
	it("formats metadata and body", () => {
		const result = formatFrontmatter({ name: "test", tags: ["a", "b"] }, "Body");
		expect(result).toContain("---");
		expect(result).toContain("name: test");
		expect(result).toContain("tags: [a, b]");
		expect(result).toContain("Body");
	});
});

describe("skillToFrontmatter / frontmatterToSkill", () => {
	it("round-trips a skill", () => {
		const skill = {
			name: "git-workflow",
			enabled: true,
			description: "Git best practices",
			path: "",
			origin: "catalog",
			dependencies: ["github-mcp"],
			tags: ["git", "workflow"],
			mode: "track" as const,
		};
		const text = skillToFrontmatter(skill, "# Instructions\nDo things");
		const result = frontmatterToSkill(text);
		expect(result.skill.name).toBe("git-workflow");
		expect(result.skill.description).toBe("Git best practices");
		expect(result.skill.origin).toBe("catalog");
		expect(result.skill.dependencies).toEqual(["github-mcp"]);
		expect(result.skill.tags).toEqual(["git", "workflow"]);
		expect(result.skill.mode).toBe("track");
		expect(result.body).toBe("# Instructions\nDo things");
	});

	it("handles disabled skill", () => {
		const skill = {
			name: "test",
			enabled: false,
			description: "",
			path: "",
			origin: "",
			dependencies: [],
			tags: [],
			mode: "pin" as const,
		};
		const text = skillToFrontmatter(skill);
		const result = frontmatterToSkill(text);
		expect(result.skill.enabled).toBe(false);
	});

	it("respects name override", () => {
		const text = "---\nname: original\n---\n";
		const result = frontmatterToSkill(text, "override");
		expect(result.skill.name).toBe("override");
	});
});
