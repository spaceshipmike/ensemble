import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	agentPath,
	agentToFrontmatter,
	agentsRoot,
	deleteAgentMd,
	frontmatterToAgent,
	isEnsembleManagedAgentFile,
	listAgentFiles,
	readAgentMd,
	toFanoutContent,
	writeAgentMd,
} from "../src/agents.js";
import { createConfig } from "../src/config.js";
import { disableAgent, enableAgent, installAgent, uninstallAgent } from "../src/operations.js";
import type { Agent } from "../src/schemas.js";
import { AgentSchema } from "../src/schemas.js";

let tmpDir: string;
const prev: Record<string, string | undefined> = {};

function restoreEnv(key: string): void {
	const p = prev[key];
	if (p === undefined) delete process.env[key];
	else process.env[key] = p;
}

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-agents-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
	for (const k of ["ENSEMBLE_AGENTS_DIR", "HOME"]) {
		prev[k] = process.env[k];
	}
	process.env.ENSEMBLE_AGENTS_DIR = join(tmpDir, "agents");
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	for (const k of ["ENSEMBLE_AGENTS_DIR", "HOME"]) {
		restoreEnv(k);
	}
});

// --- Schema validation ---

describe("AgentSchema validation", () => {
	it("accepts a minimal valid agent", () => {
		const parsed = AgentSchema.safeParse({ name: "reviewer" });
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.enabled).toBe(true);
			expect(parsed.data.tools).toEqual([]);
			expect(parsed.data.description).toBe("");
		}
	});

	it("rejects empty name", () => {
		expect(AgentSchema.safeParse({ name: "" }).success).toBe(false);
	});

	it("accepts optional model and tools array", () => {
		const parsed = AgentSchema.safeParse({
			name: "haiku-helper",
			model: "claude-haiku-4-5",
			tools: ["Read", "Grep"],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.model).toBe("claude-haiku-4-5");
			expect(parsed.data.tools).toEqual(["Read", "Grep"]);
		}
	});
});

// --- Frontmatter round-trip ---

describe("agentToFrontmatter / frontmatterToAgent", () => {
	it("round-trips a full agent", () => {
		const agent: Agent = {
			name: "code-reviewer",
			enabled: true,
			description: "Reviews code for style + correctness.",
			tools: ["Read", "Grep", "Bash"],
			model: "claude-sonnet-4-5",
			path: "",
			userNotes: "Tune for verbose output.",
			lastDescriptionHash: "abc123",
		};
		const text = agentToFrontmatter(agent, "# Instructions\nReview carefully.");
		const { agent: parsed, body } = frontmatterToAgent(text);
		expect(parsed.name).toBe("code-reviewer");
		expect(parsed.description).toBe("Reviews code for style + correctness.");
		expect(parsed.tools).toEqual(["Read", "Grep", "Bash"]);
		expect(parsed.model).toBe("claude-sonnet-4-5");
		expect(parsed.userNotes).toBe("Tune for verbose output.");
		expect(parsed.lastDescriptionHash).toBe("abc123");
		expect(body).toContain("Review carefully.");
	});

	it("handles a minimal agent with no tools and no model", () => {
		const agent: Agent = {
			name: "simple",
			enabled: true,
			description: "",
			tools: [],
			path: "",
		};
		const text = agentToFrontmatter(agent, "");
		const { agent: parsed } = frontmatterToAgent(text);
		expect(parsed.name).toBe("simple");
		expect(parsed.tools).toEqual([]);
		expect(parsed.model).toBeUndefined();
	});

	it("respects name override", () => {
		const text = "---\nname: original\n---\n";
		const { agent } = frontmatterToAgent(text, "override");
		expect(agent.name).toBe("override");
	});

	it("parses enabled: false correctly", () => {
		const text = "---\nname: x\nenabled: false\n---\n";
		const { agent } = frontmatterToAgent(text);
		expect(agent.enabled).toBe(false);
	});
});

// --- Dual-field contract: fan-out strips userNotes/hash ---

describe("toFanoutContent dual-field contract", () => {
	it("strips userNotes and lastDescriptionHash from fan-out copy", () => {
		const agent: Agent = {
			name: "x",
			enabled: true,
			description: "Visible in UIs.",
			tools: [],
			path: "",
			userNotes: "library-only context",
			lastDescriptionHash: "cafebabe",
		};
		const text = toFanoutContent(agent, "# Body");
		expect(text).toContain("name: x");
		expect(text).toContain("description: Visible in UIs.");
		expect(text).not.toContain("userNotes");
		expect(text).not.toContain("lastDescriptionHash");
		expect(text).not.toContain("library-only context");
	});

	it("adds the __ensemble marker so additive sync can identify managed files", () => {
		const agent: Agent = {
			name: "marked",
			enabled: true,
			description: "",
			tools: [],
			path: "",
		};
		const text = toFanoutContent(agent);
		expect(text).toContain("__ensemble: true");
	});

	it("omits tools from fan-out when empty", () => {
		const agent: Agent = {
			name: "notools",
			enabled: true,
			description: "d",
			tools: [],
			path: "",
		};
		const text = toFanoutContent(agent);
		expect(text).not.toContain("tools:");
	});
});

// --- Store CRUD ---

describe("writeAgentMd / readAgentMd / deleteAgentMd / listAgentFiles", () => {
	it("round-trips through the canonical store", () => {
		const agent: Agent = {
			name: "round",
			enabled: true,
			description: "round trip",
			tools: ["Read"],
			path: "",
		};
		const writtenPath = writeAgentMd(agent, "# Hello");
		expect(writtenPath).toBe(join(agentsRoot(), "round.md"));
		expect(existsSync(writtenPath)).toBe(true);

		const loaded = readAgentMd("round");
		expect(loaded).not.toBeNull();
		expect(loaded?.agent.name).toBe("round");
		expect(loaded?.agent.tools).toEqual(["Read"]);
		expect(loaded?.body).toContain("Hello");
		expect(loaded?.agent.path).toBe(writtenPath);
	});

	it("lists files in the store sorted by name", () => {
		writeAgentMd({ name: "b-agent", enabled: true, description: "", tools: [], path: "" });
		writeAgentMd({ name: "a-agent", enabled: true, description: "", tools: [], path: "" });
		expect(listAgentFiles()).toEqual(["a-agent", "b-agent"]);
	});

	it("readAgentMd returns null for missing names", () => {
		expect(readAgentMd("nonexistent")).toBeNull();
	});

	it("deleteAgentMd removes the store file", () => {
		writeAgentMd({ name: "gone", enabled: true, description: "", tools: [], path: "" });
		expect(existsSync(agentPath("gone"))).toBe(true);
		expect(deleteAgentMd("gone")).toBe(true);
		expect(existsSync(agentPath("gone"))).toBe(false);
		expect(deleteAgentMd("gone")).toBe(false);
	});
});

// --- Operations ---

describe("installAgent / uninstallAgent / enableAgent / disableAgent", () => {
	it("installs and reflects in config", () => {
		const { config, result } = installAgent(createConfig(), {
			name: "helper",
			description: "does stuff",
			tools: ["Read"],
		});
		expect(result.ok).toBe(true);
		expect(config.agents).toHaveLength(1);
		expect(config.agents[0]?.name).toBe("helper");
	});

	it("rejects duplicate installs", () => {
		const { config } = installAgent(createConfig(), { name: "helper" });
		const dup = installAgent(config, { name: "helper" });
		expect(dup.result.ok).toBe(false);
		expect(dup.result.error).toMatch(/already exists/);
	});

	it("disables and re-enables", () => {
		let { config } = installAgent(createConfig(), { name: "x" });
		({ config } = disableAgent(config, "x"));
		expect(config.agents[0]?.enabled).toBe(false);
		({ config } = enableAgent(config, "x"));
		expect(config.agents[0]?.enabled).toBe(true);
	});

	it("uninstall removes the entry", () => {
		let { config } = installAgent(createConfig(), { name: "x" });
		({ config } = uninstallAgent(config, "x"));
		expect(config.agents).toHaveLength(0);
	});

	it("errors on unknown agent for enable/disable/uninstall", () => {
		const config = createConfig();
		expect(disableAgent(config, "nope").result.ok).toBe(false);
		expect(enableAgent(config, "nope").result.ok).toBe(false);
		expect(uninstallAgent(config, "nope").result.ok).toBe(false);
	});
});

// --- isEnsembleManagedAgentFile ---

describe("isEnsembleManagedAgentFile", () => {
	it("detects the marker", () => {
		const file = join(tmpDir, "managed.md");
		writeFileSync(file, "---\n__ensemble: true\nname: m\n---\n# body\n", "utf-8");
		expect(isEnsembleManagedAgentFile(file)).toBe(true);
	});

	it("returns false for user-authored files", () => {
		const file = join(tmpDir, "userauth.md");
		writeFileSync(file, "---\nname: u\ndescription: mine\n---\n# body\n", "utf-8");
		expect(isEnsembleManagedAgentFile(file)).toBe(false);
	});

	it("returns false for missing files", () => {
		expect(isEnsembleManagedAgentFile(join(tmpDir, "nope.md"))).toBe(false);
	});
});
