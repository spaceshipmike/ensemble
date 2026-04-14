/**
 * Project discovery — scan installed AI clients for the projects they've opened.
 *
 * Each client that is project-aware keeps a list of project paths in a
 * well-known location on disk. This module aggregates those across all
 * installed clients, deduplicates by canonical filesystem path, and returns
 * a unified list that powers the desktop app's project panel.
 *
 * Non-goals:
 * - Any write path. Strictly read-only.
 * - Parsing project contents. We only care about path + which clients saw it.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface DiscoveredProject {
	/** Canonical absolute filesystem path. */
	path: string;
	/** Basename of the path — used as display name when no registry metadata exists. */
	name: string;
	/** Client ids (from CLIENTS) that have opened this project. */
	seenIn: string[];
	/** Most recent activity across all clients (epoch ms). */
	lastSeenAt: number;
	/** Whether the path currently exists on disk. */
	exists: boolean;
	/** Whether the path is a git repository. */
	isGitRepo: boolean;
}

interface RawHit {
	path: string;
	clientId: string;
	lastSeenAt: number;
}

/**
 * Top-level entry point. Scan every project-aware client and return the
 * aggregated, deduplicated project list sorted by lastSeenAt descending.
 */
export function scanClientsForProjects(): DiscoveredProject[] {
	const hits: RawHit[] = [];

	hits.push(...scanClaudeCode());
	hits.push(...scanCursor());
	hits.push(...scanWindsurf());
	hits.push(...scanVSCode());

	// Aggregate by canonical path.
	const byPath = new Map<string, { clientIds: Set<string>; lastSeenAt: number }>();
	for (const hit of hits) {
		if (!hit.path) continue;
		const existing = byPath.get(hit.path);
		if (existing) {
			existing.clientIds.add(hit.clientId);
			if (hit.lastSeenAt > existing.lastSeenAt) existing.lastSeenAt = hit.lastSeenAt;
		} else {
			byPath.set(hit.path, {
				clientIds: new Set([hit.clientId]),
				lastSeenAt: hit.lastSeenAt,
			});
		}
	}

	const projects: DiscoveredProject[] = [];
	for (const [path, { clientIds, lastSeenAt }] of byPath) {
		const exists = safeExists(path);
		projects.push({
			path,
			name: basename(path),
			seenIn: Array.from(clientIds).sort(),
			lastSeenAt,
			exists,
			isGitRepo: exists && safeExists(join(path, ".git")),
		});
	}

	projects.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
	return projects;
}

// ------------------------------------------------------------------------
// Claude Code — ~/.claude/projects/<url-encoded-path>/
// Encoding is lossy: "/" becomes "-" so "/Users/mike/Code/my-project" and
// "/Users/mike/Code/my/project" both encode to "-Users-mike-Code-my-project".
// We disambiguate by generating candidate decodings and keeping the one that
// actually exists on disk. If none exist, keep the "all dashes are slashes"
// interpretation anyway — a stale project still counts as "seen".
// ------------------------------------------------------------------------

function scanClaudeCode(): RawHit[] {
	const dir = join(homedir(), ".claude", "projects");
	if (!safeExists(dir)) return [];

	const hits: RawHit[] = [];
	for (const name of safeReaddir(dir)) {
		// Skip anything that isn't a directory (e.g. .DS_Store).
		const full = join(dir, name);
		if (!safeIsDir(full)) continue;
		// Skip dot-prefixed hidden dirs (Claude Code's encoding starts with dashes, not dots).
		if (name.startsWith(".")) continue;
		const trimmed = name.replace(/^-+/, "");
		if (!trimmed) continue;
		const segments = trimmed.split("-");
		const decoded = decodeClaudeCodePath(segments);
		if (!decoded) continue;
		hits.push({
			path: decoded,
			clientId: "claude-code",
			lastSeenAt: safeMtime(full),
		});
	}
	return hits;
}

function safeIsDir(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Greedy decoder that reconstructs a filesystem path from dash-joined segments.
 * Starts with all segments joined by "/"; if that path exists, returns it.
 * Otherwise tries collapsing adjacent segments (treating a dash as a literal
 * dash in a directory name) until a match is found.
 *
 * Worst case O(2^n) but typical paths have <10 segments and most projects
 * have no hyphenated directories, so the first attempt usually succeeds.
 */
function decodeClaudeCodePath(segments: string[]): string | null {
	// Fast path: join all with "/".
	const naive = `/${segments.join("/")}`;
	if (safeExists(naive)) return naive;

	// Fallback: try collapsing adjacent segments pairwise, prefer longest match.
	// We attempt the naive path first, then try collapsing from the end forward.
	for (let i = segments.length - 1; i > 0; i--) {
		const collapsed = [...segments];
		collapsed[i - 1] = `${collapsed[i - 1]}-${collapsed[i]}`;
		collapsed.splice(i, 1);
		const candidate = `/${collapsed.join("/")}`;
		if (safeExists(candidate)) return candidate;
	}

	// Nothing matched — return the naive decoding so the project still appears.
	return naive;
}

// ------------------------------------------------------------------------
// Cursor / Windsurf / VS Code — workspaceStorage directories.
// Each workspace has a workspace.json file with a "folder" URI.
// ------------------------------------------------------------------------

function scanCursor(): RawHit[] {
	return scanWorkspaceStorage(
		join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage"),
		"cursor",
	);
}

function scanWindsurf(): RawHit[] {
	return scanWorkspaceStorage(
		join(homedir(), "Library", "Application Support", "Windsurf", "User", "workspaceStorage"),
		"windsurf",
	);
}

function scanVSCode(): RawHit[] {
	return scanWorkspaceStorage(
		join(homedir(), "Library", "Application Support", "Code", "User", "workspaceStorage"),
		"vscode",
	);
}

function scanWorkspaceStorage(dir: string, clientId: string): RawHit[] {
	if (!safeExists(dir)) return [];
	const hits: RawHit[] = [];
	for (const entry of safeReaddir(dir)) {
		const workspaceFile = join(dir, entry, "workspace.json");
		if (!safeExists(workspaceFile)) continue;
		try {
			// biome-ignore lint: node require for json
			const { readFileSync } = require("node:fs") as typeof import("node:fs");
			const raw = readFileSync(workspaceFile, "utf-8");
			const data = JSON.parse(raw) as { folder?: string };
			if (!data.folder) continue;
			// folder is a file:// URI
			const match = /^file:\/\/(.+)$/.exec(data.folder);
			if (!match?.[1]) continue;
			const path = resolve(decodeURIComponent(match[1]));
			hits.push({
				path,
				clientId,
				lastSeenAt: safeMtime(workspaceFile),
			});
		} catch {
			continue;
		}
	}
	return hits;
}

// ------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------

function safeExists(path: string): boolean {
	try {
		return existsSync(path);
	} catch {
		return false;
	}
}

function safeReaddir(path: string): string[] {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

function safeMtime(path: string): number {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return 0;
	}
}

function basename(path: string): string {
	const trimmed = path.replace(/\/+$/, "");
	const idx = trimmed.lastIndexOf("/");
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}
