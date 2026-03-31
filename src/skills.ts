/**
 * Skill store — SKILL.md I/O, frontmatter parser, canonical store operations.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR } from "./config.js";
import type { Skill } from "./schemas.js";

// --- Path helpers ---

export function skillDir(name: string): string {
	return join(SKILLS_DIR, name);
}

export function skillMdPath(name: string): string {
	return join(skillDir(name), "SKILL.md");
}

// --- Frontmatter parser ---

export function parseFrontmatter(text: string): { meta: Record<string, string | string[]>; body: string } {
	const lines = text.split("\n");
	if (!lines[0] || lines[0].trim() !== "---") {
		return { meta: {}, body: text };
	}

	let endIdx: number | undefined;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]!.trim() === "---") {
			endIdx = i;
			break;
		}
	}

	if (endIdx === undefined) {
		return { meta: {}, body: text };
	}

	const meta: Record<string, string | string[]> = {};
	for (let i = 1; i < endIdx; i++) {
		const line = lines[i]!.trim();
		if (!line || line.startsWith("#")) continue;
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		let val = line.slice(colonIdx + 1).trim();

		// Parse inline list: [item1, item2]
		if (val.startsWith("[") && val.endsWith("]")) {
			const inner = val.slice(1, -1);
			meta[key] = inner
				.split(",")
				.map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
				.filter(Boolean);
		} else {
			// Strip quotes
			if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
				val = val.slice(1, -1);
			}
			meta[key] = val;
		}
	}

	const body = lines.slice(endIdx + 1).join("\n").trim();
	return { meta, body };
}

export function formatFrontmatter(meta: Record<string, string | string[]>, body: string): string {
	const lines = ["---"];
	for (const [key, val] of Object.entries(meta)) {
		if (Array.isArray(val)) {
			lines.push(`${key}: [${val.join(", ")}]`);
		} else {
			lines.push(`${key}: ${val}`);
		}
	}
	lines.push("---");
	lines.push("");
	if (body) lines.push(body);
	return `${lines.join("\n")}\n`;
}

// --- Skill <-> frontmatter conversion ---

export function skillToFrontmatter(skill: Skill, body = ""): string {
	const meta: Record<string, string | string[]> = {
		name: skill.name,
		enabled: skill.enabled ? "true" : "false",
	};
	if (skill.description) meta["description"] = skill.description;
	if (skill.origin) meta["origin"] = skill.origin;
	if (skill.dependencies.length > 0) meta["dependencies"] = skill.dependencies;
	if (skill.tags.length > 0) meta["tags"] = skill.tags;
	if (skill.mode && skill.mode !== "pin") meta["mode"] = skill.mode;
	return formatFrontmatter(meta, body);
}

export function frontmatterToSkill(text: string, nameOverride = ""): { skill: Skill; body: string } {
	const { meta, body } = parseFrontmatter(text);
	const name = nameOverride || String(meta["name"] ?? "");
	const enabledVal = String(meta["enabled"] ?? "true").toLowerCase();

	let deps = meta["dependencies"] ?? [];
	if (typeof deps === "string") {
		deps = deps.split(",").map((d) => d.trim()).filter(Boolean);
	}

	let tags = meta["tags"] ?? [];
	if (typeof tags === "string") {
		tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
	}

	const skill: Skill = {
		name,
		enabled: !["false", "0", "no"].includes(enabledVal),
		description: String(meta["description"] ?? ""),
		path: "",
		origin: String(meta["origin"] ?? ""),
		dependencies: deps,
		tags,
		mode: (String(meta["mode"] ?? "pin")) as "pin" | "track",
	};
	return { skill, body };
}

// --- Store operations ---

export function readSkillMd(name: string): { skill: Skill; body: string } | null {
	const path = skillMdPath(name);
	if (!existsSync(path)) return null;
	const text = readFileSync(path, "utf-8");
	const result = frontmatterToSkill(text, name);
	result.skill.path = path;
	return result;
}

export function writeSkillMd(skill: Skill, body = ""): string {
	const path = skillMdPath(skill.name);
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, skillToFrontmatter(skill, body), "utf-8");
	return path;
}

export function deleteSkillMd(name: string): boolean {
	const dir = skillDir(name);
	if (!existsSync(dir)) return false;
	rmSync(dir, { recursive: true, force: true });
	return true;
}

export function listSkillDirs(): string[] {
	if (!existsSync(SKILLS_DIR)) return [];
	return readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(join(SKILLS_DIR, d.name, "SKILL.md")))
		.map((d) => d.name)
		.sort();
}
