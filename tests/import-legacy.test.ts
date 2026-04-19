import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENTS, ENSEMBLE_MARKER } from "../src/clients.js";
import { createConfig } from "../src/config.js";
import {
	formatSummary,
	runImportLegacy,
	snapshotClient,
	translateConfig,
	type ClientSnapshot,
} from "../src/import-legacy.js";
import { resolveServers } from "../src/config.js";
import { EnsembleConfigSchema } from "../src/schemas.js";

let tmpDir: string;
let configDir: string;
let configPath: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-import-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
	configDir = join(tmpDir, "config");
	mkdirSync(configDir, { recursive: true });
	configPath = join(configDir, "config.json");
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("translateConfig — pure translator", () => {
	it("a v1.3 config with no disk findings round-trips into v2.0.1 with empty matrices (L2159: no data loss)", () => {
		const v13 = EnsembleConfigSchema.parse({
			servers: [
				{ name: "ctx", command: "npx", args: ["tsx"], enabled: true },
				{ name: "pg", command: "npx", args: ["postgres"], enabled: true },
			],
			plugins: [{ name: "clangd-lsp", marketplace: "claude-plugins-official" }],
			skills: [{ name: "git-workflow", description: "Git best practices" }],
			groups: [{ name: "dev", servers: ["ctx", "pg"] }],
			clients: [{ id: "cursor", group: "dev" }],
			rules: [{ path: "~/Code", group: "dev" }],
		});

		const { next, summary } = translateConfig(v13, [], [], []);

		// Every v1.3 resource is preserved.
		expect(next.servers.map((s) => s.name).sort()).toEqual(["ctx", "pg"]);
		expect(next.plugins.map((p) => p.name)).toEqual(["clangd-lsp"]);
		expect(next.skills.map((s) => s.name)).toEqual(["git-workflow"]);
		// Groups / rules / clients untouched (they drive resolution, not membership).
		expect(next.groups).toEqual(v13.groups);
		expect(next.rules).toEqual(v13.rules);
		expect(next.clients).toEqual(v13.clients);

		// Every library entry has an empty install matrix (no disk findings).
		for (const s of next.servers) expect(s.installState).toEqual({});
		for (const p of next.plugins) expect(p.installState).toEqual({});
		for (const s of next.skills) expect(s.installState).toEqual({});

		// Summary shape
		expect(summary.library.servers).toBe(2);
		expect(summary.library.plugins).toBe(1);
		expect(summary.library.skills).toBe(1);
		expect(summary.discoveredFromDisk.servers).toEqual([]);
		expect(summary.registryOnly.servers.sort()).toEqual(["ctx", "pg"]);
	});

	it("post-migration resolveServers for each scanned client returns exactly the disk-managed set (L2175)", () => {
		const v13 = EnsembleConfigSchema.parse({
			servers: [
				{ name: "a", command: "npx" },
				{ name: "b", command: "npx" },
				{ name: "c", command: "npx" },
			],
		});
		const snapshots: ClientSnapshot[] = [
			{
				clientId: "cursor",
				managedServers: new Map([["a", { command: "npx" }], ["b", { command: "npx" }]]),
				projectManagedServers: new Map(),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
			{
				clientId: "claude-desktop",
				managedServers: new Map([["a", { command: "npx" }]]),
				projectManagedServers: new Map(),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
		];
		const { next } = translateConfig(v13, snapshots, [], []);

		// cursor should project back to {a, b}; claude-desktop to {a}; claude-code to nothing.
		expect(resolveServers(next, "cursor").map((s) => s.name).sort()).toEqual(["a", "b"]);
		expect(resolveServers(next, "claude-desktop").map((s) => s.name)).toEqual(["a"]);
		expect(resolveServers(next, "claude-code").length).toBe(0);
	});

	it("overlays disk findings to reconstruct the install matrix (L2175: dry-run sync reports zero pending)", () => {
		const v13 = EnsembleConfigSchema.parse({
			servers: [{ name: "ctx", command: "npx" }, { name: "pg", command: "npx" }],
		});

		// Simulate: both servers managed on cursor, ctx also managed on claude-desktop
		const snapshots: ClientSnapshot[] = [
			{
				clientId: "cursor",
				managedServers: new Map([["ctx", { command: "npx" }], ["pg", { command: "npx" }]]),
				projectManagedServers: new Map(),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
			{
				clientId: "claude-desktop",
				managedServers: new Map([["ctx", { command: "npx" }]]),
				projectManagedServers: new Map(),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
		];

		const { next } = translateConfig(v13, snapshots, [], []);
		const ctx = next.servers.find((s) => s.name === "ctx")!;
		const pg = next.servers.find((s) => s.name === "pg")!;
		expect(ctx.installState["cursor"]?.installed).toBe(true);
		expect(ctx.installState["claude-desktop"]?.installed).toBe(true);
		expect(pg.installState["cursor"]?.installed).toBe(true);
		expect(pg.installState["claude-desktop"]).toBeUndefined();
	});

	it("reconstructs project-scope install entries for Claude Code", () => {
		const v13 = EnsembleConfigSchema.parse({
			servers: [{ name: "pg", command: "npx" }],
		});
		const snapshots: ClientSnapshot[] = [
			{
				clientId: "claude-code",
				managedServers: new Map([["pg", { command: "npx" }]]),
				projectManagedServers: new Map([
					["/Users/me/Code/app", new Map([["pg", { command: "npx" }]])],
					["/Users/me/Code/other", new Map([["pg", { command: "npx" }]])],
				]),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
		];
		const { next } = translateConfig(v13, snapshots, [], []);
		const pg = next.servers.find((s) => s.name === "pg")!;
		expect(pg.installState["claude-code"]?.installed).toBe(true);
		expect(pg.installState["claude-code"]?.projects.sort()).toEqual([
			"/Users/me/Code/app",
			"/Users/me/Code/other",
		]);
	});

	it("disk-only servers land in library, not installed (ambiguity handling)", () => {
		const v13 = EnsembleConfigSchema.parse({ servers: [] });
		const snapshots: ClientSnapshot[] = [
			{
				clientId: "cursor",
				managedServers: new Map([["ghost-server", { command: "npx" }]]),
				projectManagedServers: new Map(),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
		];
		const { next, summary } = translateConfig(v13, snapshots, [], []);
		expect(next.servers.map((s) => s.name)).toEqual(["ghost-server"]);
		expect(summary.discoveredFromDisk.servers).toEqual([
			{ name: "ghost-server", client: "cursor" },
		]);
		// The discovered-from-disk server IS installed on the client where it was found.
		expect(next.servers[0]!.installState["cursor"]?.installed).toBe(true);
	});

	it("disk-only servers preserve command/args/env/transport from the disk entry (no data loss)", () => {
		const v13 = EnsembleConfigSchema.parse({ servers: [] });
		const snapshots: ClientSnapshot[] = [
			{
				clientId: "cursor",
				managedServers: new Map([
					[
						"context7",
						{
							command: "npx",
							args: ["-y", "@upstash/context7-mcp"],
							env: { NODE_ENV: "production" },
							transport: "stdio",
							__ensemble: true,
						},
					],
				]),
				projectManagedServers: new Map(),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
		];
		const { next } = translateConfig(v13, snapshots, [], []);
		const context7 = next.servers.find((s) => s.name === "context7")!;
		expect(context7.command).toBe("npx");
		expect(context7.args).toEqual(["-y", "@upstash/context7-mcp"]);
		expect(context7.env).toEqual({ NODE_ENV: "production" });
		expect(context7.transport).toBe("stdio");
	});

	it("project-scope disk-only server preserves command/args from that project's entry", () => {
		const v13 = EnsembleConfigSchema.parse({ servers: [] });
		const snapshots: ClientSnapshot[] = [
			{
				clientId: "claude-code",
				managedServers: new Map(),
				projectManagedServers: new Map([
					[
						"/Users/me/Code/app",
						new Map([
							[
								"codebase-memory",
								{ command: "/usr/local/bin/codebase-memory-mcp", args: [], env: {} },
							],
						]),
					],
				]),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
		];
		const { next } = translateConfig(v13, snapshots, [], []);
		const cm = next.servers.find((s) => s.name === "codebase-memory")!;
		expect(cm.command).toBe("/usr/local/bin/codebase-memory-mcp");
		expect(cm.installState["claude-code"]?.projects).toEqual(["/Users/me/Code/app"]);
	});

	it("registry-only servers keep an empty install matrix (conservative drop-nothing)", () => {
		const v13 = EnsembleConfigSchema.parse({
			servers: [{ name: "ctx", command: "npx" }, { name: "deleted-from-disk", command: "npx" }],
		});
		const snapshots: ClientSnapshot[] = [
			{
				clientId: "cursor",
				managedServers: new Map([["ctx", { command: "npx" }]]),
				projectManagedServers: new Map(),
				userPlugins: new Map(),
				projectPlugins: new Map(),
			},
		];
		const { next, summary } = translateConfig(v13, snapshots, [], []);
		const ctx = next.servers.find((s) => s.name === "ctx")!;
		const ghost = next.servers.find((s) => s.name === "deleted-from-disk")!;
		expect(ctx.installState["cursor"]?.installed).toBe(true);
		expect(ghost.installState).toEqual({});
		expect(summary.registryOnly.servers).toEqual(["deleted-from-disk"]);
	});

	it("reconstructs plugin install matrix from discovered plugins", () => {
		const v13 = EnsembleConfigSchema.parse({
			plugins: [{ name: "clangd-lsp", marketplace: "claude-plugins-official" }],
		});
		const { next } = translateConfig(v13, [], [], [
			{
				id: "clangd-lsp@claude-plugins-official",
				name: "clangd-lsp",
				marketplace: "claude-plugins-official",
				scope: "user",
				projectPaths: [],
				registered: true,
			},
		]);
		const plugin = next.plugins[0]!;
		expect(plugin.installState["claude-code"]?.installed).toBe(true);
	});

	it("reconstructs skill install matrix from discovered skills (user + project)", () => {
		const v13 = EnsembleConfigSchema.parse({
			skills: [{ name: "git-workflow", description: "" }],
		});
		const { next } = translateConfig(v13, [], [
			{ name: "git-workflow", source: "user", registered: true },
			{ name: "project-only", source: "project", projectPath: "/Users/me/Code/app", registered: false },
		], []);

		const git = next.skills.find((s) => s.name === "git-workflow")!;
		const projOnly = next.skills.find((s) => s.name === "project-only")!;
		expect(git.installState["claude-code"]?.installed).toBe(true);
		expect(projOnly.installState["claude-code"]?.projects).toEqual(["/Users/me/Code/app"]);
	});
});

describe("summary reporting (L2192: counts + locations)", () => {
	it("summary lists per-type counts matching the translated library", () => {
		const v13 = EnsembleConfigSchema.parse({
			servers: [{ name: "a", command: "npx" }, { name: "b", command: "npx" }],
			plugins: [{ name: "p1", marketplace: "m" }],
			skills: [{ name: "s1", description: "" }],
			agents: [{ name: "reviewer" }],
			commands: [{ name: "evolve" }],
		});
		const { summary } = translateConfig(v13, [], [], []);
		expect(summary.library.servers).toBe(2);
		expect(summary.library.plugins).toBe(1);
		expect(summary.library.skills).toBe(1);
		expect(summary.library.agents).toBe(1);
		expect(summary.library.commands).toBe(1);
	});

	it("formatSummary produces a plain-English summary including counts and the backup path", () => {
		const text = formatSummary({
			library: { servers: 3, plugins: 2, skills: 1, agents: 0, commands: 0, hooks: 0, settings: 0 },
			clientsScanned: ["cursor", "claude-code"],
			discoveredFromDisk: {
				servers: [{ name: "ghost", client: "cursor" }],
				plugins: [],
				skills: [],
			},
			registryOnly: { servers: [], plugins: [], skills: [] },
			backupPath: "/fake/config.json.v1.3.bak",
			configPath: "/fake/config.json",
			dryRun: false,
		});
		expect(text).toContain("Library contains 6 resources");
		expect(text).toContain("3 servers");
		expect(text).toContain("2 plugins");
		expect(text).toContain("1 skill");
		expect(text).toContain("cursor");
		expect(text).toContain("claude-code");
		expect(text).toContain("Found 1 resource on disk");
		expect(text).toContain("/fake/config.json.v1.3.bak");
	});

	it("formatSummary in dry-run mode does not print the backup path", () => {
		const text = formatSummary({
			library: { servers: 0, plugins: 0, skills: 0, agents: 0, commands: 0, hooks: 0, settings: 0 },
			clientsScanned: [],
			discoveredFromDisk: { servers: [], plugins: [], skills: [] },
			registryOnly: { servers: [], plugins: [], skills: [] },
			backupPath: "",
			configPath: "/fake/config.json",
			dryRun: true,
		});
		expect(text).toContain("Import preview");
		expect(text).not.toContain("Backup:");
	});
});

describe("runImportLegacy — end-to-end against a fake config dir", () => {
	it("writes a v2.0.1 config + backup when not dry-run", () => {
		const v13 = {
			servers: [{ name: "ctx", command: "npx", enabled: true }],
			plugins: [],
			skills: [],
			groups: [],
			clients: [],
			rules: [],
			marketplaces: [],
		};
		writeFileSync(configPath, JSON.stringify(v13, null, 2));

		const summary = runImportLegacy({ configPath, dryRun: false, clients: [] });
		expect(summary.dryRun).toBe(false);
		expect(summary.backupPath).toBe(`${configPath}.v1.3.bak`);
		expect(existsSync(`${configPath}.v1.3.bak`)).toBe(true);

		// Original content preserved in backup.
		expect(JSON.parse(readFileSync(`${configPath}.v1.3.bak`, "utf-8"))).toEqual(v13);

		// New config is v2.0.1-shaped (installState on the server).
		const rewritten = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(rewritten.servers[0].installState).toEqual({});
	});

	it("dry-run leaves the original config untouched and writes no backup", () => {
		const v13 = {
			servers: [{ name: "ctx", command: "npx", enabled: true }],
			plugins: [],
			skills: [],
			groups: [],
			clients: [],
			rules: [],
			marketplaces: [],
		};
		writeFileSync(configPath, JSON.stringify(v13, null, 2));
		const beforeMtime = readFileSync(configPath, "utf-8");

		const summary = runImportLegacy({ configPath, dryRun: true, clients: [] });
		expect(summary.dryRun).toBe(true);
		expect(summary.backupPath).toBe("");
		expect(existsSync(`${configPath}.v1.3.bak`)).toBe(false);
		// Original file byte-identical.
		expect(readFileSync(configPath, "utf-8")).toBe(beforeMtime);
	});

	it("is idempotent with an existing backup (does not overwrite the backup on a second run)", () => {
		const v13 = {
			servers: [{ name: "ctx", command: "npx", enabled: true }],
			plugins: [],
			skills: [],
			groups: [],
			clients: [],
			rules: [],
			marketplaces: [],
		};
		writeFileSync(configPath, JSON.stringify(v13, null, 2));

		runImportLegacy({ configPath, dryRun: false, clients: [] });
		const firstBackup = readFileSync(`${configPath}.v1.3.bak`, "utf-8");

		// Second run — config is now v2.0.1 shape; backup must NOT be overwritten.
		runImportLegacy({ configPath, dryRun: false, clients: [] });
		expect(readFileSync(`${configPath}.v1.3.bak`, "utf-8")).toBe(firstBackup);
	});
});

describe("snapshotClient — disk scan honours the __ensemble marker", () => {
	it("ignores unmanaged entries and picks up managed ones", () => {
		// Build a fake cursor config file.
		const fakeCursorConfig = {
			mcpServers: {
				"ensemble-one": { [ENSEMBLE_MARKER]: true, command: "npx" },
				"ensemble-two": { __mcpoyle: true, command: "npx" },
				"user-managed": { command: "npx" },
			},
		};
		const fakeCursorPath = join(tmpDir, "mcp.json");
		writeFileSync(fakeCursorPath, JSON.stringify(fakeCursorConfig));

		// Hand-roll a client def with configPath pointing at our temp file.
		const clientDef = { ...CLIENTS["cursor"]!, configPath: fakeCursorPath };
		const snap = snapshotClient(clientDef);
		expect([...snap.managedServers.keys()].sort()).toEqual(["ensemble-one", "ensemble-two"]);
		// The raw disk entry is preserved verbatim so the translator can restore command/args/env.
		expect(snap.managedServers.get("ensemble-one")).toMatchObject({ command: "npx" });
	});
});
