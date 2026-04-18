/**
 * Canonical slash command store — `~/.config/ensemble/commands/<name>.md`.
 *
 * Each command is a single markdown file with YAML frontmatter defining
 * `description` (required) and optional `allowed-tools` / `argument-hint`,
 * followed by the prompt body. `syncCommands` fans the enabled set out into
 * the target client's commands directory (e.g., `~/.claude/commands/`).
 *
 * ## Invariants
 *
 * - **Dual-field contract.** `description` is source-owned — upstream
 *   frontmatter authoritative; re-import overwrites it. `userNotes` is
 *   library-side only and never round-tripped into fan-out.
 * - **Additive fan-out.** Managed fan-out files are identified by the
 *   `__ensemble: true` frontmatter marker. User-authored command files
 *   without the marker are preserved byte-identical.
 * - **Re-import overwrite.** `description` and `lastDescriptionHash` are
 *   refreshed on re-import; `userNotes` survives.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Command } from "./schemas.js";
import { formatFrontmatter, parseFrontmatter } from "./skills.js";

// --- Paths ---

/** Root of the canonical commands store. Overridable via ENSEMBLE_COMMANDS_DIR. */
export function commandsRoot(): string {
	if (process.env.ENSEMBLE_COMMANDS_DIR) return process.env.ENSEMBLE_COMMANDS_DIR;
	return join(homedir(), ".config", "ensemble", "commands");
}

export function commandPath(name: string): string {
	return join(commandsRoot(), `${name}.md`);
}

// --- Frontmatter <-> Command ---

/**
 * Serialise a Command to the on-disk frontmatter + body string. Library-side
 * fields round-trip into the canonical store (so the store is self-describing)
 * but are stripped when building a fan-out copy (see toFanoutContent).
 *
 * On-disk frontmatter uses the Claude Code key names (`allowed-tools`,
 * `argument-hint`) — the schema exposes the JS-friendly `allowedTools`/
 * `argumentHint` to TypeScript consumers.
 */
export function commandToFrontmatter(command: Command, body = ""): string {
	const meta: Record<string, string | string[]> = {
		name: command.name,
		enabled: command.enabled ? "true" : "false",
	};
	if (command.description) meta.description = command.description;
	if (command.allowedTools.length > 0) meta["allowed-tools"] = command.allowedTools;
	if (command.argumentHint) meta["argument-hint"] = command.argumentHint;
	if (command.userNotes) meta.userNotes = command.userNotes;
	if (command.lastDescriptionHash) meta.lastDescriptionHash = command.lastDescriptionHash;
	return formatFrontmatter(meta, body);
}

/** Parse a command markdown file back into a Command record + body. */
export function frontmatterToCommand(
	text: string,
	nameOverride = "",
): { command: Command; body: string } {
	const { meta, body } = parseFrontmatter(text);
	const name = nameOverride || String(meta.name ?? "");
	const enabledVal = String(meta.enabled ?? "true").toLowerCase();

	let allowedTools = meta["allowed-tools"] ?? [];
	if (typeof allowedTools === "string") {
		allowedTools = allowedTools
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
	}

	const argHintValue = meta["argument-hint"];
	const userNotesValue = meta.userNotes;
	const hashValue = meta.lastDescriptionHash;

	const command: Command = {
		name,
		enabled: !["false", "0", "no"].includes(enabledVal),
		description: String(meta.description ?? ""),
		allowedTools,
		...(typeof argHintValue === "string" && argHintValue ? { argumentHint: argHintValue } : {}),
		path: "",
		installState: {},
		...(typeof userNotesValue === "string" && userNotesValue ? { userNotes: userNotesValue } : {}),
		...(typeof hashValue === "string" && hashValue ? { lastDescriptionHash: hashValue } : {}),
	};
	return { command, body };
}

/**
 * Build the fan-out copy — the frontmatter written into
 * `~/.claude/commands/<name>.md`. Dual-field contract: library-side fields
 * are stripped. The `__ensemble: true` marker lets additive-sync identify
 * managed copies vs user-authored files.
 */
export function toFanoutContent(command: Command, body = ""): string {
	const meta: Record<string, string | string[]> = {
		__ensemble: "true",
		name: command.name,
	};
	if (command.description) meta.description = command.description;
	if (command.allowedTools.length > 0) meta["allowed-tools"] = command.allowedTools;
	if (command.argumentHint) meta["argument-hint"] = command.argumentHint;
	return formatFrontmatter(meta, body);
}

/** Check whether an on-disk command file is ensemble-managed. */
export function isEnsembleManagedCommandFile(path: string): boolean {
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

/** Read a command from the canonical store by name. Returns null if missing. */
export function readCommandMd(name: string): { command: Command; body: string } | null {
	const path = commandPath(name);
	if (!existsSync(path)) return null;
	const text = readFileSync(path, "utf-8");
	const result = frontmatterToCommand(text, name);
	result.command.path = path;
	return result;
}

/** Write a command to the canonical store. Returns the path written. */
export function writeCommandMd(command: Command, body = ""): string {
	const dir = commandsRoot();
	mkdirSync(dir, { recursive: true });
	const path = commandPath(command.name);
	writeFileSync(path, commandToFrontmatter(command, body), "utf-8");
	return path;
}

/** Remove a command's canonical file. Returns true if it existed. */
export function deleteCommandMd(name: string): boolean {
	const path = commandPath(name);
	if (!existsSync(path)) return false;
	rmSync(path, { force: true });
	return true;
}

/** List every command file in the canonical store, sorted by name. */
export function listCommandFiles(): string[] {
	const dir = commandsRoot();
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isFile() && d.name.endsWith(".md"))
		.map((d) => d.name.slice(0, -3))
		.sort();
}
