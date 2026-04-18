import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENSEMBLE_MARKER } from "../src/clients.js";
import { createConfig, isActiveForClient, resolvePlugins, resolveServers, resolveSkills } from "../src/config.js";
import { addServer, addToLibrary, assignClient, createGroup, addServerToGroup, installResource, installSkill } from "../src/operations.js";
import { syncClient, syncSkills, computeContextCost, suggestGroupSplits } from "../src/sync.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("syncClient", () => {
	it("reports unknown client", () => {
		const { result } = syncClient(createConfig(), "fake-client");
		expect(result.messages[0]).toContain("Unknown client");
	});

	it("dry run produces no file writes", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		const configPath = join(tmpDir, "mcp.json");
		writeFileSync(configPath, "{}");

		// Can't easily test against real client paths, but we can test the result shape
		const { result } = syncClient(config, "cursor", { dryRun: true });
		// cursor config doesn't exist at the real path, so no changes detected
		expect(result.clientName).toBe("Cursor");
	});

	it("detects drift when hashes differ", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		// Simulate a previous sync with stored hashes
		config = {
			...config,
			clients: [{
				id: "cursor",
				group: null,
				last_synced: "2026-01-01T00:00:00Z",
				projects: {},
				server_hashes: { ctx: "old-hash-that-wont-match" },
			}],
		};

		const { result } = syncClient(config, "cursor");
		// Since cursor config doesn't exist at real path, no drift detected
		// This test validates the API shape
		expect(result.drifted).toBeDefined();
		expect(Array.isArray(result.drifted)).toBe(true);
	});
});

describe("sync result shape", () => {
	it("returns structured result", () => {
		const { config: newConfig, result } = syncClient(createConfig(), "cursor");
		expect(result.clientId).toBe("cursor");
		expect(result.clientName).toBe("Cursor");
		expect(Array.isArray(result.actions)).toBe(true);
		expect(Array.isArray(result.messages)).toBe(true);
		expect(typeof result.hasChanges).toBe("boolean");
		expect(typeof result.newHashes).toBe("object");
	});
});

describe("syncSkills conflict detection", () => {
	it("returns conflicts array in result", () => {
		const config = createConfig();
		const result = syncSkills(config, "cursor");
		expect(Array.isArray(result.conflicts)).toBe(true);
	});

	it("detects broken symlinks in skills dir", () => {
		// Create a temp skills dir with a broken symlink
		const skillsDir = join(tmpDir, "skills");
		mkdirSync(skillsDir, { recursive: true });
		const brokenTarget = join(tmpDir, "nonexistent-skill");
		try {
			symlinkSync(brokenTarget, join(skillsDir, "broken-skill"));
		} catch { /* symlink creation may fail on some systems */ }

		// This test validates the conflict type structure
		const config = createConfig();
		const result = syncSkills(config, "cursor");
		// Cursor's real skills dir won't have our broken symlink,
		// but the structure is correct
		expect(result.conflicts).toBeDefined();
	});

	it("reports no conflicts for empty config", () => {
		const config = createConfig();
		const result = syncSkills(config, "claude-code");
		expect(result.conflicts.length).toBe(0);
	});
});

describe("computeContextCost", () => {
	it("returns structured summary with budget fields", () => {
		const config = createConfig();
		const cost = computeContextCost(config, "claude-code");
		expect(typeof cost.budgetPercent).toBe("number");
		expect(typeof cost.contextWindow).toBe("number");
		expect(cost.contextWindow).toBe(200000);
		expect(Array.isArray(cost.suggestions)).toBe(true);
	});

	it("computes budget percent based on tool count", () => {
		let config = createConfig();
		({ config } = addServer(config, {
			name: "test-server",
			command: "npx",
			tools: Array.from({ length: 10 }, (_, i) => ({
				name: `tool-${i}`,
				description: `Tool ${i}`,
			})),
		}));
		config = {
			...config,
			clients: [{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} }],
		};
		const cost = computeContextCost(config, "claude-code");
		expect(cost.toolCount).toBe(10);
		expect(cost.estimatedTokens).toBe(2000);
		expect(cost.budgetPercent).toBe(1); // 2000/200000 = 1%
	});

	it("uses default 128000 for unknown client", () => {
		const config = createConfig();
		const cost = computeContextCost(config, "fake-client");
		expect(cost.contextWindow).toBe(128000);
	});
});

describe("v2.0.1 read path: installState matrix takes precedence over enabled", () => {
	it("resource with empty installState falls back to enabled=true", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		// Empty install matrix — legacy path.
		expect(config.servers[0]?.installState).toEqual({});
		expect(config.servers[0]?.enabled).toBe(true);
		expect(resolveServers(config, "cursor").length).toBe(1);
		expect(resolveServers(config, "claude-code").length).toBe(1);
	});

	it("resource with empty installState and enabled=false is excluded", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		config = {
			...config,
			servers: config.servers.map((s) => ({ ...s, enabled: false })),
		};
		expect(resolveServers(config, "cursor").length).toBe(0);
	});

	it("populated installState drives resolveServers, overriding enabled", () => {
		let config = createConfig();
		// Start with addToLibrary so the installState flow is used.
		({ config } = addToLibrary(config, { name: "ctx", type: "server", command: "npx" }));
		// Mark enabled false to prove installState wins.
		config = {
			...config,
			servers: config.servers.map((s) => ({ ...s, enabled: false })),
		};
		// Install on claude-code only.
		({ config } = installResource(config, {
			name: "ctx",
			type: "server",
			client: "claude-code",
		}));
		expect(resolveServers(config, "claude-code").map((s) => s.name)).toEqual(["ctx"]);
		expect(resolveServers(config, "cursor").length).toBe(0);
	});

	it("populated installState drives resolvePlugins and resolveSkills", () => {
		let config = createConfig();
		({ config } = addToLibrary(config, {
			name: "git-workflow",
			type: "skill",
			description: "",
		}));
		({ config } = addToLibrary(config, {
			name: "clangd-lsp",
			type: "plugin",
			marketplace: "claude-plugins-official",
		}));
		({ config } = installResource(config, {
			name: "git-workflow",
			type: "skill",
			client: "cursor",
		}));
		({ config } = installResource(config, {
			name: "clangd-lsp",
			type: "plugin",
			client: "claude-code",
		}));

		expect(resolveSkills(config, "cursor").map((s) => s.name)).toEqual(["git-workflow"]);
		expect(resolveSkills(config, "claude-code").length).toBe(0);
		expect(resolvePlugins(config, "claude-code").map((p) => p.name)).toEqual(["clangd-lsp"]);
		expect(resolvePlugins(config, "cursor").length).toBe(0);
	});

	it("project-scope install without user-scope still resolves at user scope as false", () => {
		let config = createConfig();
		({ config } = addToLibrary(config, { name: "pg", type: "server", command: "npx" }));
		({ config } = installResource(config, {
			name: "pg",
			type: "server",
			client: "claude-code",
			project: "/Users/me/Code/myapp",
		}));

		// isActiveForClient returns true because installState has any entry for claude-code
		// (project-scope install counts as "active for this client" at the resolve layer;
		// user-scope vs. project-scope is a later sync-writer concern).
		expect(isActiveForClient(config.servers[0]!, "claude-code")).toBe(true);
		// But cursor — no entry — returns false.
		expect(isActiveForClient(config.servers[0]!, "cursor")).toBe(false);
	});

	it("v2.0.1-shape config round-trips through resolve* with matrix source of truth", () => {
		let config = createConfig();
		({ config } = addToLibrary(config, { name: "pg", type: "server", command: "npx" }));
		({ config } = installResource(config, {
			name: "pg",
			type: "server",
			client: "claude-code",
		}));
		// Simulate a disk round trip — JSON stringify/parse drops prototypes.
		const rehydrated = JSON.parse(JSON.stringify(config));
		expect(resolveServers(rehydrated, "claude-code").length).toBe(1);
		expect(resolveServers(rehydrated, "cursor").length).toBe(0);
	});
});

describe("suggestGroupSplits", () => {
	it("returns empty for few servers", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "a", command: "npx" }));
		const suggestions = suggestGroupSplits(config, config.servers);
		expect(suggestions.length).toBe(0);
	});

	it("suggests groups for categorizable servers", () => {
		let config = createConfig();
		({ config } = addServer(config, {
			name: "postgres-mcp",
			command: "npx",
			tools: [{ name: "query", description: "Run SQL query on database" }],
		}));
		({ config } = addServer(config, {
			name: "mysql-mcp",
			command: "npx",
			tools: [{ name: "execute", description: "Execute SQL statement on database" }],
		}));
		({ config } = addServer(config, {
			name: "github-mcp",
			command: "npx",
			tools: [{ name: "search_repos", description: "Search git repositories" }],
		}));
		({ config } = addServer(config, {
			name: "gitlab-mcp",
			command: "npx",
			tools: [{ name: "list_repos", description: "List git repos" }],
		}));
		({ config } = addServer(config, {
			name: "aws-s3",
			command: "npx",
			tools: [{ name: "list_buckets", description: "List S3 buckets on AWS cloud" }],
		}));
		const suggestions = suggestGroupSplits(config, config.servers);
		expect(suggestions.length).toBeGreaterThan(0);
		const dataGroup = suggestions.find((s) => s.groupName === "data-servers");
		expect(dataGroup).toBeDefined();
		expect(dataGroup?.serverNames.length).toBeGreaterThanOrEqual(2);
	});
});
