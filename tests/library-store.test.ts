/**
 * Library store — smoke tests for the canonical manifest and bootstrap.
 *
 * Uses ENSEMBLE_LIBRARY_ROOT env override to redirect the store to a temp
 * directory so we can verify behavior without touching the user's real
 * `~/.config/ensemble/library/`. Bootstrap invokes scanLibraryGlobal(), which
 * reads the real `~/.claude/` — tests should only assert shape and
 * idempotence, not specific entry contents (which depend on the host).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	bootstrapLibrary,
	hashFile,
	libraryStoreExists,
	manifestPath,
	proposedId,
	readManifest,
	reconcile,
	relinkEntrySource,
	writeManifest,
	type LibraryManifest,
} from "../src/discovery/library-store.js";
import type { DiscoveredTool } from "../src/discovery/library.js";

describe("library-store", () => {
	let tmp: string;
	let originalEnv: string | undefined;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "ensemble-library-store-"));
		originalEnv = process.env.ENSEMBLE_LIBRARY_ROOT;
		process.env.ENSEMBLE_LIBRARY_ROOT = tmp;
	});

	afterEach(() => {
		if (originalEnv === undefined) delete process.env.ENSEMBLE_LIBRARY_ROOT;
		else process.env.ENSEMBLE_LIBRARY_ROOT = originalEnv;
		rmSync(tmp, { recursive: true, force: true });
	});

	it("manifestPath is under the overridden library root", () => {
		expect(manifestPath()).toBe(join(tmp, "library.json"));
	});

	it("libraryStoreExists reflects manifest presence", () => {
		expect(libraryStoreExists()).toBe(false);
		writeManifest({
			version: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			entries: {},
			ignored: [],
		});
		expect(libraryStoreExists()).toBe(true);
	});

	it("writeManifest + readManifest roundtrip preserves entries and ignore list", () => {
		const now = new Date().toISOString();
		const manifest: LibraryManifest = {
			version: 1,
			createdAt: now,
			updatedAt: now,
			entries: {
				"foo@discovered": {
					id: "foo@discovered",
					type: "skill",
					name: "foo",
					source: "@discovered",
					filePath: "skills/foo/SKILL.md",
					contentHash: "abc123",
					createdAt: now,
				},
			},
			ignored: ["bar@discovered"],
		};
		writeManifest(manifest);
		const loaded = readManifest();
		expect(loaded).not.toBeNull();
		expect(loaded?.entries["foo@discovered"]?.name).toBe("foo");
		expect(loaded?.ignored).toEqual(["bar@discovered"]);
	});

	it("readManifest returns null when the store does not exist", () => {
		expect(readManifest()).toBeNull();
	});

	it("hashFile returns a stable sha256 for the same bytes", () => {
		const path = join(tmp, "sample.txt");
		writeFileSync(path, "hello world");
		const h1 = hashFile(path);
		const h2 = hashFile(path);
		expect(h1).toBe(h2);
		// Known sha256 of "hello world"
		expect(h1).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
	});

	it("bootstrapLibrary is idempotent — second call reports created=false", () => {
		const first = bootstrapLibrary([]);
		expect(first.created).toBe(true);
		expect(libraryStoreExists()).toBe(true);
		const second = bootstrapLibrary([]);
		expect(second.created).toBe(false);
		expect(second.entriesAdded).toBe(0);
	});

	it("bootstrapLibrary produces a well-formed manifest", () => {
		bootstrapLibrary([]);
		const manifest = readManifest();
		expect(manifest).not.toBeNull();
		expect(manifest?.version).toBe(1);
		expect(Array.isArray(manifest?.ignored)).toBe(true);
		// Every entry must have stable fields. Per-type content requirements
		// vary: file-based entries have filePath+contentHash, servers have
		// serverDef, plugins have source==marketplace or "@discovered".
		for (const [id, entry] of Object.entries(manifest?.entries ?? {})) {
			expect(entry.id).toBe(id);
			expect(id).toMatch(/@/);
			expect(typeof entry.createdAt).toBe("string");
			if (
				entry.type === "skill" ||
				entry.type === "agent" ||
				entry.type === "command" ||
				entry.type === "style"
			) {
				expect(entry.source).toBe("@discovered");
				expect(entry.filePath).toBeTruthy();
				expect(entry.contentHash).toMatch(/^[a-f0-9]{64}$/);
			} else if (entry.type === "server") {
				expect(entry.source).toBe("@discovered");
				expect(entry.serverDef).toBeTruthy();
			} else if (entry.type === "plugin") {
				expect(typeof entry.source).toBe("string");
				expect(entry.source.length).toBeGreaterThan(0);
			}
			expect(entry.type).not.toBe("hook"); // hooks are skipped
		}
	});
});

describe("library-store · reconcile", () => {
	let tmp: string;
	let originalEnv: string | undefined;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "ensemble-reconcile-"));
		originalEnv = process.env.ENSEMBLE_LIBRARY_ROOT;
		process.env.ENSEMBLE_LIBRARY_ROOT = tmp;
	});

	afterEach(() => {
		if (originalEnv === undefined) delete process.env.ENSEMBLE_LIBRARY_ROOT;
		else process.env.ENSEMBLE_LIBRARY_ROOT = originalEnv;
		rmSync(tmp, { recursive: true, force: true });
	});

	function makeManifest(entries: LibraryManifest["entries"], ignored: string[] = []): LibraryManifest {
		const now = new Date().toISOString();
		return { version: 1, createdAt: now, updatedAt: now, entries, ignored };
	}

	function skillTool(name: string, filePath: string): DiscoveredTool {
		return {
			id: `skill:${name}`,
			type: "skill",
			name,
			description: "",
			scope: { kind: "global" },
			origin: "discovered",
			filePath,
			detail: "",
		};
	}

	function serverTool(name: string, filePath: string): DiscoveredTool {
		return {
			id: `server:${name}`,
			type: "server",
			name,
			description: "",
			scope: { kind: "global" },
			origin: "discovered",
			filePath,
			detail: "",
		};
	}

	function pluginTool(name: string, marketplace: string): DiscoveredTool {
		return {
			id: `plugin:${name}@${marketplace}`,
			type: "plugin",
			name,
			description: "",
			scope: { kind: "global" },
			origin: "discovered",
			detail: marketplace,
			pluginEnabled: true,
			pluginMarketplace: marketplace,
		};
	}

	it("proposedId uses name@discovered for non-plugins and name@marketplace for plugins", () => {
		expect(proposedId(skillTool("foo", "/nonexistent"))).toBe("foo@discovered");
		expect(proposedId(pluginTool("bar", "fctry"))).toBe("bar@fctry");
	});

	it("file tool with matching hash is a match", () => {
		const filePath = join(tmp, "source.md");
		writeFileSync(filePath, "---\nname: foo\n---\nbody");
		const hash = hashFile(filePath);
		const manifest = makeManifest({
			"foo@discovered": {
				id: "foo@discovered",
				type: "skill",
				name: "foo",
				source: "@discovered",
				filePath: "skills/foo/SKILL.md",
				contentHash: hash,
				createdAt: new Date().toISOString(),
			},
		});
		const result = reconcile(manifest, [skillTool("foo", filePath)]);
		expect(result.matches).toHaveLength(1);
		expect(result.drifts).toHaveLength(0);
		expect(result.orphans).toHaveLength(0);
	});

	it("file tool with mismatching hash is drift with content-hash-mismatch reason", () => {
		const filePath = join(tmp, "source.md");
		writeFileSync(filePath, "current");
		const manifest = makeManifest({
			"foo@discovered": {
				id: "foo@discovered",
				type: "skill",
				name: "foo",
				source: "@discovered",
				filePath: "skills/foo/SKILL.md",
				contentHash: "deadbeef".repeat(8),
				createdAt: new Date().toISOString(),
			},
		});
		const result = reconcile(manifest, [skillTool("foo", filePath)]);
		expect(result.drifts).toHaveLength(1);
		expect(result.drifts[0]?.reason).toBe("content-hash-mismatch");
	});

	it("scanned tool with no matching entry is an orphan", () => {
		const filePath = join(tmp, "ghost.md");
		writeFileSync(filePath, "body");
		const manifest = makeManifest({});
		const result = reconcile(manifest, [skillTool("ghost", filePath)]);
		expect(result.orphans).toHaveLength(1);
		expect(result.orphans[0]?.proposedId).toBe("ghost@discovered");
	});

	it("scanned tool whose id is in the ignored list is ignored, not orphan", () => {
		const filePath = join(tmp, "dismissed.md");
		writeFileSync(filePath, "body");
		const manifest = makeManifest({}, ["dismissed@discovered"]);
		const result = reconcile(manifest, [skillTool("dismissed", filePath)]);
		expect(result.ignored).toHaveLength(1);
		expect(result.orphans).toHaveLength(0);
	});

	it("server defs: matching equals match, differing equals drift", () => {
		const jsonPath = join(tmp, ".claude.json");
		const canonical = { command: "node", args: ["server.js"], env: { PORT: "3000" } };
		writeFileSync(
			jsonPath,
			JSON.stringify({ mcpServers: { svc: { ...canonical, __ensemble: true } } }),
		);

		const manifestMatch = makeManifest({
			"svc@discovered": {
				id: "svc@discovered",
				type: "server",
				name: "svc",
				source: "@discovered",
				serverDef: canonical,
				createdAt: new Date().toISOString(),
			},
		});
		const ok = reconcile(manifestMatch, [serverTool("svc", jsonPath)]);
		expect(ok.matches).toHaveLength(1);
		expect(ok.drifts).toHaveLength(0);

		const manifestDrift = makeManifest({
			"svc@discovered": {
				id: "svc@discovered",
				type: "server",
				name: "svc",
				source: "@discovered",
				serverDef: { command: "node", args: ["different.js"] },
				createdAt: new Date().toISOString(),
			},
		});
		const bad = reconcile(manifestDrift, [serverTool("svc", jsonPath)]);
		expect(bad.drifts).toHaveLength(1);
		expect(bad.drifts[0]?.reason).toBe("server-def-mismatch");
	});

	it("plugin is presence-only — always matches if id is present in manifest", () => {
		const manifest = makeManifest({
			"plug@fctry": {
				id: "plug@fctry",
				type: "plugin",
				name: "plug",
				source: "fctry",
				pluginMarketplace: "fctry",
				createdAt: new Date().toISOString(),
			},
		});
		const result = reconcile(manifest, [pluginTool("plug", "fctry")]);
		expect(result.matches).toHaveLength(1);
		expect(result.drifts).toHaveLength(0);
	});

	it("relinkEntrySource renames an entry's id and source, preserves content", () => {
		const now = new Date().toISOString();
		const manifest: LibraryManifest = {
			version: 1,
			createdAt: now,
			updatedAt: now,
			entries: {
				"foo@discovered": {
					id: "foo@discovered",
					type: "skill",
					name: "foo",
					source: "@discovered",
					filePath: "skills/foo/SKILL.md",
					contentHash: "abc".repeat(20) + "abcd",
					createdAt: now,
				},
			},
			ignored: [],
		};
		writeManifest(manifest);

		const result = relinkEntrySource("foo@discovered", "claude-plugins.dev");
		expect(result.ok).toBe(true);
		expect(result.id).toBe("foo@claude-plugins.dev");

		const loaded = readManifest();
		expect(loaded?.entries["foo@discovered"]).toBeUndefined();
		const relinked = loaded?.entries["foo@claude-plugins.dev"];
		expect(relinked).toBeDefined();
		expect(relinked?.source).toBe("claude-plugins.dev");
		// Content preserved
		expect(relinked?.filePath).toBe("skills/foo/SKILL.md");
		expect(relinked?.contentHash).toBe(manifest.entries["foo@discovered"]?.contentHash);
	});

	it("relinkEntrySource refuses collision with existing id", () => {
		const now = new Date().toISOString();
		const manifest: LibraryManifest = {
			version: 1,
			createdAt: now,
			updatedAt: now,
			entries: {
				"foo@discovered": {
					id: "foo@discovered",
					type: "skill",
					name: "foo",
					source: "@discovered",
					createdAt: now,
				},
				"foo@market": {
					id: "foo@market",
					type: "skill",
					name: "foo",
					source: "market",
					createdAt: now,
				},
			},
			ignored: [],
		};
		writeManifest(manifest);

		const result = relinkEntrySource("foo@discovered", "market");
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/already exists/);
	});

	it("hook tools are skipped entirely", () => {
		const hookTool: DiscoveredTool = {
			id: "hook:PreToolUse:1",
			type: "hook",
			name: "PreToolUse:1",
			description: "",
			scope: { kind: "global" },
			origin: "discovered",
			detail: "",
		};
		const result = reconcile(makeManifest({}), [hookTool]);
		expect(result.matches).toHaveLength(0);
		expect(result.orphans).toHaveLength(0);
		expect(result.drifts).toHaveLength(0);
		expect(result.ignored).toHaveLength(0);
	});
});
