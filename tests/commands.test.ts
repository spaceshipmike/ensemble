import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	commandPath,
	commandToFrontmatter,
	commandsRoot,
	deleteCommandMd,
	frontmatterToCommand,
	isEnsembleManagedCommandFile,
	listCommandFiles,
	readCommandMd,
	toFanoutContent,
	writeCommandMd,
} from "../src/commands.js";
import { createConfig } from "../src/config.js";
import {
	disableCommand,
	enableCommand,
	installCommand,
	uninstallCommand,
} from "../src/operations.js";
import type { Command } from "../src/schemas.js";
import { CommandSchema } from "../src/schemas.js";

let tmpDir: string;
const prev: Record<string, string | undefined> = {};

function restoreEnv(key: string): void {
	const p = prev[key];
	if (p === undefined) delete process.env[key];
	else process.env[key] = p;
}

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
	for (const k of ["ENSEMBLE_COMMANDS_DIR", "HOME"]) {
		prev[k] = process.env[k];
	}
	process.env.ENSEMBLE_COMMANDS_DIR = join(tmpDir, "commands");
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	for (const k of ["ENSEMBLE_COMMANDS_DIR", "HOME"]) {
		restoreEnv(k);
	}
});

// --- Schema ---

describe("CommandSchema validation", () => {
	it("accepts a minimal command", () => {
		const parsed = CommandSchema.safeParse({ name: "evolve" });
		expect(parsed.success).toBe(true);
	});

	it("rejects empty name", () => {
		expect(CommandSchema.safeParse({ name: "" }).success).toBe(false);
	});

	it("accepts allowedTools and argumentHint", () => {
		const parsed = CommandSchema.safeParse({
			name: "review",
			description: "Audit spec vs reality",
			allowedTools: ["Read", "Grep"],
			argumentHint: "<section>",
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.allowedTools).toEqual(["Read", "Grep"]);
			expect(parsed.data.argumentHint).toBe("<section>");
		}
	});
});

// --- Frontmatter round-trip ---

describe("commandToFrontmatter / frontmatterToCommand", () => {
	it("round-trips a full command with hyphenated keys", () => {
		const command: Command = {
			name: "evolve",
			enabled: true,
			description: "Refine a spec section.",
			allowedTools: ["Read", "Write", "Bash"],
			argumentHint: "<section>",
			path: "",
			userNotes: "Remember to run /fctry:review after.",
			lastDescriptionHash: "hash123",
		};
		const text = commandToFrontmatter(command, "Prompt body for /evolve.");
		// Hyphenated keys in the serialised form.
		expect(text).toContain("allowed-tools: [Read, Write, Bash]");
		expect(text).toContain("argument-hint: <section>");

		const { command: parsed, body } = frontmatterToCommand(text);
		expect(parsed.name).toBe("evolve");
		expect(parsed.description).toBe("Refine a spec section.");
		expect(parsed.allowedTools).toEqual(["Read", "Write", "Bash"]);
		expect(parsed.argumentHint).toBe("<section>");
		expect(parsed.userNotes).toBe("Remember to run /fctry:review after.");
		expect(parsed.lastDescriptionHash).toBe("hash123");
		expect(body).toContain("Prompt body");
	});

	it("handles a minimal command with no allowedTools and no hint", () => {
		const command: Command = {
			name: "simple",
			enabled: true,
			description: "short",
			allowedTools: [],
			path: "",
		};
		const { command: parsed } = frontmatterToCommand(commandToFrontmatter(command));
		expect(parsed.allowedTools).toEqual([]);
		expect(parsed.argumentHint).toBeUndefined();
	});

	it("respects name override", () => {
		const text = "---\nname: original\n---\n";
		const { command } = frontmatterToCommand(text, "override");
		expect(command.name).toBe("override");
	});
});

// --- Dual-field fan-out ---

describe("toFanoutContent dual-field contract", () => {
	it("strips userNotes and lastDescriptionHash from fan-out", () => {
		const command: Command = {
			name: "x",
			enabled: true,
			description: "visible",
			allowedTools: [],
			path: "",
			userNotes: "library-only",
			lastDescriptionHash: "hashy",
		};
		const text = toFanoutContent(command, "# body");
		expect(text).toContain("description: visible");
		expect(text).not.toContain("userNotes");
		expect(text).not.toContain("lastDescriptionHash");
		expect(text).not.toContain("library-only");
	});

	it("adds the __ensemble marker", () => {
		const command: Command = {
			name: "m",
			enabled: true,
			description: "",
			allowedTools: [],
			path: "",
		};
		const text = toFanoutContent(command);
		expect(text).toContain("__ensemble: true");
	});

	it("uses hyphenated keys in fan-out (Claude Code's convention)", () => {
		const command: Command = {
			name: "c",
			enabled: true,
			description: "",
			allowedTools: ["Read"],
			argumentHint: "<arg>",
			path: "",
		};
		const text = toFanoutContent(command);
		expect(text).toContain("allowed-tools: [Read]");
		expect(text).toContain("argument-hint: <arg>");
	});

	it("omits allowed-tools from fan-out when empty", () => {
		const command: Command = {
			name: "none",
			enabled: true,
			description: "",
			allowedTools: [],
			path: "",
		};
		const text = toFanoutContent(command);
		expect(text).not.toContain("allowed-tools");
	});
});

// --- Store CRUD ---

describe("writeCommandMd / readCommandMd / deleteCommandMd / listCommandFiles", () => {
	it("round-trips through the canonical store", () => {
		const command: Command = {
			name: "round",
			enabled: true,
			description: "round trip",
			allowedTools: ["Read"],
			argumentHint: "<section>",
			path: "",
		};
		const writtenPath = writeCommandMd(command, "# Hello command");
		expect(writtenPath).toBe(join(commandsRoot(), "round.md"));
		expect(existsSync(writtenPath)).toBe(true);

		const loaded = readCommandMd("round");
		expect(loaded).not.toBeNull();
		expect(loaded?.command.name).toBe("round");
		expect(loaded?.command.allowedTools).toEqual(["Read"]);
		expect(loaded?.command.argumentHint).toBe("<section>");
		expect(loaded?.body).toContain("Hello command");
		expect(loaded?.command.path).toBe(writtenPath);
	});

	it("lists files sorted", () => {
		writeCommandMd({ name: "b", enabled: true, description: "", allowedTools: [], path: "" });
		writeCommandMd({ name: "a", enabled: true, description: "", allowedTools: [], path: "" });
		expect(listCommandFiles()).toEqual(["a", "b"]);
	});

	it("readCommandMd returns null for missing", () => {
		expect(readCommandMd("nope")).toBeNull();
	});

	it("deleteCommandMd removes and reports existence", () => {
		writeCommandMd({ name: "gone", enabled: true, description: "", allowedTools: [], path: "" });
		expect(existsSync(commandPath("gone"))).toBe(true);
		expect(deleteCommandMd("gone")).toBe(true);
		expect(deleteCommandMd("gone")).toBe(false);
	});
});

// --- Operations ---

describe("installCommand / uninstallCommand / enableCommand / disableCommand", () => {
	it("installs and reflects in config", () => {
		const { config, result } = installCommand(createConfig(), {
			name: "review",
			description: "Audit spec vs reality.",
			allowedTools: ["Read", "Grep"],
			argumentHint: "<scope>",
		});
		expect(result.ok).toBe(true);
		expect(config.commands).toHaveLength(1);
		expect(config.commands[0]?.name).toBe("review");
		expect(config.commands[0]?.argumentHint).toBe("<scope>");
	});

	it("rejects duplicate installs", () => {
		const { config } = installCommand(createConfig(), { name: "evolve" });
		const dup = installCommand(config, { name: "evolve" });
		expect(dup.result.ok).toBe(false);
	});

	it("disables and re-enables", () => {
		let { config } = installCommand(createConfig(), { name: "x" });
		({ config } = disableCommand(config, "x"));
		expect(config.commands[0]?.enabled).toBe(false);
		({ config } = enableCommand(config, "x"));
		expect(config.commands[0]?.enabled).toBe(true);
	});

	it("uninstall removes the entry", () => {
		let { config } = installCommand(createConfig(), { name: "x" });
		({ config } = uninstallCommand(config, "x"));
		expect(config.commands).toHaveLength(0);
	});

	it("errors on unknown command for enable/disable/uninstall", () => {
		const config = createConfig();
		expect(disableCommand(config, "nope").result.ok).toBe(false);
		expect(enableCommand(config, "nope").result.ok).toBe(false);
		expect(uninstallCommand(config, "nope").result.ok).toBe(false);
	});
});

// --- isEnsembleManagedCommandFile ---

describe("isEnsembleManagedCommandFile", () => {
	it("detects the marker", () => {
		const file = join(tmpDir, "managed.md");
		writeFileSync(file, "---\n__ensemble: true\nname: m\n---\n# body\n", "utf-8");
		expect(isEnsembleManagedCommandFile(file)).toBe(true);
	});

	it("returns false for user-authored files", () => {
		const file = join(tmpDir, "user.md");
		writeFileSync(file, "---\nname: mine\n---\n# body\n", "utf-8");
		expect(isEnsembleManagedCommandFile(file)).toBe(false);
	});

	it("returns false for missing files", () => {
		expect(isEnsembleManagedCommandFile(join(tmpDir, "nope.md"))).toBe(false);
	});
});
