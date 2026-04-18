/**
 * Wire-as-move semantics — v2.0.2 default behavior for `wireTool`.
 *
 * Tests use a per-case temp HOME so wire writes hit an isolated filesystem.
 * Actual library code uses `homedir()` via node:os, which reads from
 * process.env.HOME on macOS and Linux, so we can redirect by overriding HOME
 * in beforeEach.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLibrary } from "../src/discovery/library-store.js";
import { wireTool } from "../src/discovery/wire.js";

describe("wire-as-move (v2.0.2)", () => {
	let tmp: string;
	let originalHome: string | undefined;
	let originalLibRoot: string | undefined;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "ensemble-wire-move-"));
		originalHome = process.env.HOME;
		originalLibRoot = process.env.ENSEMBLE_LIBRARY_ROOT;
		process.env.HOME = tmp;
		process.env.ENSEMBLE_LIBRARY_ROOT = join(tmp, "lib");
	});

	afterEach(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalLibRoot === undefined) delete process.env.ENSEMBLE_LIBRARY_ROOT;
		else process.env.ENSEMBLE_LIBRARY_ROOT = originalLibRoot;
		rmSync(tmp, { recursive: true, force: true });
	});

	// ------------------------------------------------------------------
	// Skills (file-based; managed / unmanaged divergence)
	// ------------------------------------------------------------------

	function writeSkillAt(scopeBase: string, name: string, marked: boolean): void {
		const dir = join(scopeBase, "skills", name);
		mkdirSync(dir, { recursive: true });
		const frontmatter = marked
			? `---\nname: ${name}\nensemble: managed\n---\nbody`
			: `---\nname: ${name}\n---\nbody`;
		writeFileSync(join(dir, "SKILL.md"), frontmatter);
	}

	it("default move: ensemble-managed skill is removed from source after target write", () => {
		const globalBase = join(tmp, ".claude");
		writeSkillAt(globalBase, "foo", true);

		const projectPath = join(tmp, "proj");
		mkdirSync(projectPath, { recursive: true });

		const result = wireTool({
			type: "skill",
			name: "foo",
			source: { kind: "global" },
			target: { kind: "project", path: projectPath },
		});

		expect(result.ok).toBe(true);
		expect(result.action).toBe("wired");
		expect(result.sourceUnwired).toBe(true);
		// Target exists
		expect(existsSync(join(projectPath, ".claude", "skills", "foo", "SKILL.md"))).toBe(true);
		// Source removed
		expect(existsSync(join(globalBase, "skills", "foo"))).toBe(false);
	});

	it("default move: unmanaged (user-authored) skill stays at source, still wires target", () => {
		const globalBase = join(tmp, ".claude");
		writeSkillAt(globalBase, "foo", false);

		const projectPath = join(tmp, "proj");
		mkdirSync(projectPath, { recursive: true });

		const result = wireTool({
			type: "skill",
			name: "foo",
			source: { kind: "global" },
			target: { kind: "project", path: projectPath },
		});

		expect(result.ok).toBe(true);
		expect(result.action).toBe("wired");
		expect(result.sourceUnwired).toBe(false);
		expect(result.reason).toMatch(/source left in place/);
		// Both exist
		expect(existsSync(join(projectPath, ".claude", "skills", "foo", "SKILL.md"))).toBe(true);
		expect(existsSync(join(globalBase, "skills", "foo", "SKILL.md"))).toBe(true);
	});

	it("mode copy: additive — source untouched even when managed", () => {
		const globalBase = join(tmp, ".claude");
		writeSkillAt(globalBase, "foo", true);

		const projectPath = join(tmp, "proj");
		mkdirSync(projectPath, { recursive: true });

		const result = wireTool({
			type: "skill",
			name: "foo",
			source: { kind: "global" },
			target: { kind: "project", path: projectPath },
			mode: "copy",
		});

		expect(result.ok).toBe(true);
		expect(result.sourceUnwired).toBe(false);
		expect(existsSync(join(globalBase, "skills", "foo", "SKILL.md"))).toBe(true);
		expect(existsSync(join(projectPath, ".claude", "skills", "foo", "SKILL.md"))).toBe(true);
	});

	it("same-scope wire is a no-op", () => {
		const globalBase = join(tmp, ".claude");
		writeSkillAt(globalBase, "foo", true);

		const result = wireTool({
			type: "skill",
			name: "foo",
			source: { kind: "global" },
			target: { kind: "global" },
		});

		expect(result.ok).toBe(true);
		expect(result.action).toBe("skipped");
		expect(result.reason).toBe("same-scope");
		// Nothing changed
		expect(existsSync(join(globalBase, "skills", "foo", "SKILL.md"))).toBe(true);
	});

	// ------------------------------------------------------------------
	// MCP servers (inline JSON; move drops the entry from source)
	// ------------------------------------------------------------------

	it("default move: ensemble-managed server is removed from source .claude.json", () => {
		const globalJson = join(tmp, ".claude.json");
		writeFileSync(
			globalJson,
			JSON.stringify({
				mcpServers: {
					svc: { command: "node", args: ["s.js"], __ensemble: true },
				},
			}),
		);

		const projectPath = join(tmp, "proj");
		mkdirSync(projectPath, { recursive: true });

		const result = wireTool({
			type: "server",
			name: "svc",
			source: { kind: "global" },
			target: { kind: "project", path: projectPath },
		});

		expect(result.ok).toBe(true);
		expect(result.sourceUnwired).toBe(true);

		// Source no longer has the entry.
		const globalAfter = JSON.parse(readFileSync(globalJson, "utf-8")) as {
			mcpServers?: Record<string, unknown>;
		};
		expect(globalAfter.mcpServers?.svc).toBeUndefined();

		// Target has it.
		const projectMcp = join(projectPath, ".mcp.json");
		const projectAfter = JSON.parse(readFileSync(projectMcp, "utf-8")) as {
			mcpServers?: Record<string, Record<string, unknown>>;
		};
		expect(projectAfter.mcpServers?.svc).toBeDefined();
		expect(projectAfter.mcpServers?.svc?.__ensemble).toBe(true);
	});

	// ------------------------------------------------------------------
	// Library as source (v2.0.2)
	// ------------------------------------------------------------------

	it("library source: skill wires to project without touching the canonical store", () => {
		const globalBase = join(tmp, ".claude");
		writeSkillAt(globalBase, "foo", true);
		bootstrapLibrary([]);

		const projectPath = join(tmp, "proj");
		mkdirSync(projectPath, { recursive: true });

		const result = wireTool({
			type: "skill",
			name: "foo",
			source: { kind: "library" },
			target: { kind: "project", path: projectPath },
		});

		expect(result.ok).toBe(true);
		expect(result.action).toBe("wired");
		expect(result.sourceUnwired).toBe(false);

		const targetSkill = join(projectPath, ".claude", "skills", "foo", "SKILL.md");
		expect(existsSync(targetSkill)).toBe(true);
		const targetContent = readFileSync(targetSkill, "utf-8");
		expect(targetContent).toMatch(/ensemble: managed/);

		const canonical = join(tmp, "lib", "skills", "foo", "SKILL.md");
		expect(existsSync(canonical)).toBe(true);
	});

	it("library is never a valid target — wire fails with descriptive reason", () => {
		const globalBase = join(tmp, ".claude");
		writeSkillAt(globalBase, "foo", true);

		const result = wireTool({
			type: "skill",
			name: "foo",
			source: { kind: "global" },
			target: { kind: "library" },
		});

		expect(result.ok).toBe(false);
		expect(result.action).toBe("skipped");
		expect(result.reason).toMatch(/library is not a valid wire target/);
	});

	it("default move: user-authored server stays at source", () => {
		const globalJson = join(tmp, ".claude.json");
		writeFileSync(
			globalJson,
			JSON.stringify({ mcpServers: { svc: { command: "node", args: ["s.js"] } } }),
		);

		const projectPath = join(tmp, "proj");
		mkdirSync(projectPath, { recursive: true });

		const result = wireTool({
			type: "server",
			name: "svc",
			source: { kind: "global" },
			target: { kind: "project", path: projectPath },
		});

		expect(result.ok).toBe(true);
		expect(result.sourceUnwired).toBe(false);

		const globalAfter = JSON.parse(readFileSync(globalJson, "utf-8")) as {
			mcpServers?: Record<string, unknown>;
		};
		expect(globalAfter.mcpServers?.svc).toBeDefined();
	});
});
