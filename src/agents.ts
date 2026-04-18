/**
 * Canonical agent store — `~/.config/ensemble/agents/<name>.md`.
 *
 * Each agent is a single markdown file with YAML frontmatter defining
 * `name` / `description` / optional `tools` / optional `model`, followed by
 * the agent's prompt body. The store is the source of truth; `syncAgents`
 * fans the enabled set out into the target client's agents directory (e.g.,
 * `~/.claude/agents/`) as a symlink to the canonical file.
 *
 * ## Invariants
 *
 * - **Dual-field contract.** `description` is source-owned — it comes from
 *   upstream frontmatter and re-import overwrites it. `userNotes` is
 *   library-side only; re-import never touches it and it is never
 *   round-tripped into fan-out copies.
 * - **Additive fan-out.** Managed fan-out targets are identified by the
 *   symlink pointing back into the canonical store, mirroring the skills
 *   strategy. Non-managed agent files in the target dir are preserved
 *   byte-identical.
 * - **Re-import overwrite.** `description` and `lastDescriptionHash` are
 *   refreshed on re-import; `userNotes` is preserved across re-imports.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Agent } from "./schemas.js";
import { formatFrontmatter, parseFrontmatter } from "./skills.js";

// --- Paths ---

/** Root of the canonical agents store. Overridable via ENSEMBLE_AGENTS_DIR. */
export function agentsRoot(): string {
	if (process.env.ENSEMBLE_AGENTS_DIR) return process.env.ENSEMBLE_AGENTS_DIR;
	return join(homedir(), ".config", "ensemble", "agents");
}

export function agentPath(name: string): string {
	return join(agentsRoot(), `${name}.md`);
}

// --- Frontmatter <-> Agent ---

/**
 * Serialise an Agent to the on-disk frontmatter + body string. `userNotes`
 * and `lastDescriptionHash` never appear in the fan-out copy — they are
 * library-side only — but they ARE written into the canonical store so the
 * dual-field contract round-trips.
 */
export function agentToFrontmatter(agent: Agent, body = ""): string {
	const meta: Record<string, string | string[]> = {
		name: agent.name,
		enabled: agent.enabled ? "true" : "false",
	};
	if (agent.description) meta.description = agent.description;
	if (agent.tools.length > 0) meta.tools = agent.tools;
	if (agent.model) meta.model = agent.model;
	// Library-side fields are stored inside the canonical file so the store
	// is self-describing, but they are stripped when building a fan-out copy
	// (see toFanoutContent below).
	if (agent.userNotes) meta.userNotes = agent.userNotes;
	if (agent.lastDescriptionHash) meta.lastDescriptionHash = agent.lastDescriptionHash;
	return formatFrontmatter(meta, body);
}

/** Parse an agent markdown file back into an Agent record + body. */
export function frontmatterToAgent(
	text: string,
	nameOverride = "",
): { agent: Agent; body: string } {
	const { meta, body } = parseFrontmatter(text);
	const name = nameOverride || String(meta.name ?? "");
	const enabledVal = String(meta.enabled ?? "true").toLowerCase();

	let tools = meta.tools ?? [];
	if (typeof tools === "string") {
		tools = tools
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
	}

	const modelValue = meta.model;
	const userNotesValue = meta.userNotes;
	const hashValue = meta.lastDescriptionHash;

	const agent: Agent = {
		name,
		enabled: !["false", "0", "no"].includes(enabledVal),
		description: String(meta.description ?? ""),
		tools,
		...(typeof modelValue === "string" && modelValue ? { model: modelValue } : {}),
		path: "",
		...(typeof userNotesValue === "string" && userNotesValue ? { userNotes: userNotesValue } : {}),
		...(typeof hashValue === "string" && hashValue ? { lastDescriptionHash: hashValue } : {}),
	};
	return { agent, body };
}

/**
 * Build the fan-out copy string — the frontmatter that goes into
 * `~/.claude/agents/<name>.md`. Dual-field contract: `userNotes` and
 * `lastDescriptionHash` are library-side only and never appear here.
 * The `__ensemble: true` marker lets additive-sync recognise managed
 * fan-out copies and preserve user-authored agent files byte-identical.
 */
export function toFanoutContent(agent: Agent, body = ""): string {
	const meta: Record<string, string | string[]> = {
		__ensemble: "true",
		name: agent.name,
	};
	if (agent.description) meta.description = agent.description;
	if (agent.tools.length > 0) meta.tools = agent.tools;
	if (agent.model) meta.model = agent.model;
	return formatFrontmatter(meta, body);
}

/** Check whether an on-disk agent file is ensemble-managed (frontmatter marker). */
export function isEnsembleManagedAgentFile(path: string): boolean {
	if (!existsSync(path)) return false;
	try {
		const text = readFileSync(path, "utf-8");
		const { meta } = parseFrontmatter(text);
		return String(meta.__ensemble ?? "") === "true";
	} catch {
		return false;
	}
}

// --- Store operations ---

/** Read an agent from the canonical store by name. Returns null if missing. */
export function readAgentMd(name: string): { agent: Agent; body: string } | null {
	const path = agentPath(name);
	if (!existsSync(path)) return null;
	const text = readFileSync(path, "utf-8");
	const result = frontmatterToAgent(text, name);
	result.agent.path = path;
	return result;
}

/** Write an agent to the canonical store. Returns the path written. */
export function writeAgentMd(agent: Agent, body = ""): string {
	const dir = agentsRoot();
	mkdirSync(dir, { recursive: true });
	const path = agentPath(agent.name);
	writeFileSync(path, agentToFrontmatter(agent, body), "utf-8");
	return path;
}

/** Remove an agent's canonical file. Returns true if it existed. */
export function deleteAgentMd(name: string): boolean {
	const path = agentPath(name);
	if (!existsSync(path)) return false;
	rmSync(path, { force: true });
	return true;
}

/** List every agent file in the canonical store, sorted by name. */
export function listAgentFiles(): string[] {
	const dir = agentsRoot();
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isFile() && d.name.endsWith(".md"))
		.map((d) => d.name.slice(0, -3))
		.sort();
}
