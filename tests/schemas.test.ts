import { describe, expect, it } from "vitest";
import {
	ClientAssignmentSchema,
	EnsembleConfigSchema,
	GroupSchema,
	MarketplaceSchema,
	PluginSchema,
	RESERVED_MARKETPLACE_NAMES,
	ServerSchema,
	SettingsSchema,
	SkillSchema,
	qualifiedPluginName,
} from "../src/schemas.js";

describe("ServerSchema", () => {
	it("parses a minimal stdio server", () => {
		const server = ServerSchema.parse({ name: "ctx", command: "npx", args: ["tsx", "index.ts"] });
		expect(server.name).toBe("ctx");
		expect(server.enabled).toBe(true);
		expect(server.transport).toBe("stdio");
		expect(server.command).toBe("npx");
		expect(server.args).toEqual(["tsx", "index.ts"]);
		expect(server.env).toEqual({});
		expect(server.origin.source).toBe("manual");
		expect(server.tools).toEqual([]);
	});

	it("parses an HTTP server with auth", () => {
		const server = ServerSchema.parse({
			name: "remote-db",
			transport: "http",
			url: "https://mcp.example.com/db",
			auth_type: "bearer",
			auth_ref: "op://Dev/db/token",
		});
		expect(server.transport).toBe("http");
		expect(server.url).toBe("https://mcp.example.com/db");
		expect(server.auth_type).toBe("bearer");
	});

	it("applies defaults for missing optional fields", () => {
		const server = ServerSchema.parse({ name: "bare" });
		expect(server.enabled).toBe(true);
		expect(server.transport).toBe("stdio");
		expect(server.command).toBe("");
		expect(server.args).toEqual([]);
		expect(server.env).toEqual({});
		expect(server.url).toBe("");
		expect(server.origin.trust_tier).toBe("local");
	});

	it("rejects missing name", () => {
		expect(() => ServerSchema.parse({})).toThrow();
	});

	it("parses server with origin and tools", () => {
		const server = ServerSchema.parse({
			name: "github",
			origin: { source: "registry", trust_tier: "official", timestamp: "2026-03-01T00:00:00Z" },
			tools: [
				{ name: "search", description: "Search repos" },
				{ name: "clone" },
			],
		});
		expect(server.origin.source).toBe("registry");
		expect(server.origin.trust_tier).toBe("official");
		expect(server.tools).toHaveLength(2);
		expect(server.tools[1]?.description).toBe("");
	});
});

describe("PluginSchema", () => {
	it("parses a plugin", () => {
		const plugin = PluginSchema.parse({ name: "clangd-lsp", marketplace: "claude-plugins-official" });
		expect(plugin.name).toBe("clangd-lsp");
		expect(plugin.marketplace).toBe("claude-plugins-official");
		expect(plugin.enabled).toBe(true);
		expect(plugin.managed).toBe(true);
	});

	it("qualifiedPluginName includes marketplace", () => {
		const plugin = PluginSchema.parse({ name: "clangd-lsp", marketplace: "claude-plugins-official" });
		expect(qualifiedPluginName(plugin)).toBe("clangd-lsp@claude-plugins-official");
	});

	it("qualifiedPluginName without marketplace returns name only", () => {
		const plugin = PluginSchema.parse({ name: "local-plugin" });
		expect(qualifiedPluginName(plugin)).toBe("local-plugin");
	});
});

describe("SkillSchema", () => {
	it("parses a skill with dependencies and tags", () => {
		const skill = SkillSchema.parse({
			name: "git-workflow",
			description: "Git best practices",
			dependencies: ["github-mcp"],
			tags: ["git", "workflow"],
		});
		expect(skill.name).toBe("git-workflow");
		expect(skill.mode).toBe("pin");
		expect(skill.dependencies).toEqual(["github-mcp"]);
	});
});

describe("GroupSchema", () => {
	it("parses a group with servers, plugins, and skills", () => {
		const group = GroupSchema.parse({
			name: "dev-tools",
			description: "Dev servers",
			servers: ["ctx", "prm"],
			plugins: ["clangd-lsp"],
			skills: ["git-workflow"],
		});
		expect(group.servers).toEqual(["ctx", "prm"]);
		expect(group.plugins).toEqual(["clangd-lsp"]);
		expect(group.skills).toEqual(["git-workflow"]);
	});

	it("defaults to empty arrays", () => {
		const group = GroupSchema.parse({ name: "empty" });
		expect(group.servers).toEqual([]);
		expect(group.plugins).toEqual([]);
		expect(group.skills).toEqual([]);
	});
});

describe("MarketplaceSchema", () => {
	it("parses a GitHub marketplace", () => {
		const mp = MarketplaceSchema.parse({
			name: "my-plugins",
			source: { source: "github", repo: "myorg/plugins" },
		});
		expect(mp.source.source).toBe("github");
		expect(mp.source.repo).toBe("myorg/plugins");
	});

	it("parses a directory marketplace", () => {
		const mp = MarketplaceSchema.parse({
			name: "local",
			source: { source: "directory", path: "/Users/me/plugins" },
		});
		expect(mp.source.source).toBe("directory");
		expect(mp.source.path).toBe("/Users/me/plugins");
	});
});

describe("ClientAssignmentSchema", () => {
	it("parses with project assignments as record", () => {
		const client = ClientAssignmentSchema.parse({
			id: "claude-code",
			group: "dev-tools",
			projects: {
				"/Users/me/code/app": { group: "minimal", last_synced: null },
			},
		});
		expect(client.id).toBe("claude-code");
		expect(client.group).toBe("dev-tools");
		expect(client.projects["/Users/me/code/app"]?.group).toBe("minimal");
	});
});

describe("SettingsSchema", () => {
	it("applies defaults", () => {
		const settings = SettingsSchema.parse({});
		expect(settings.adopt_unmanaged_plugins).toBe(false);
		expect(settings.registry_cache_ttl).toBe(3600);
		expect(settings.sync_cost_warning_threshold).toBe(50);
	});
});

describe("EnsembleConfigSchema", () => {
	it("parses an empty object to valid defaults", () => {
		const config = EnsembleConfigSchema.parse({});
		expect(config.servers).toEqual([]);
		expect(config.groups).toEqual([]);
		expect(config.clients).toEqual([]);
		expect(config.plugins).toEqual([]);
		expect(config.marketplaces).toEqual([]);
		expect(config.rules).toEqual([]);
		expect(config.skills).toEqual([]);
		expect(config.settings.adopt_unmanaged_plugins).toBe(false);
	});

	it("round-trips a full config", () => {
		const input = {
			servers: [{ name: "ctx", command: "npx", args: ["tsx", "index.ts"] }],
			groups: [{ name: "dev", servers: ["ctx"] }],
			clients: [{ id: "cursor", group: "dev" }],
			plugins: [{ name: "clangd-lsp", marketplace: "claude-plugins-official" }],
			marketplaces: [{ name: "official", source: { source: "github", repo: "anthropics/claude-plugins-official" } }],
			rules: [{ path: "~/Code", group: "dev" }],
			skills: [{ name: "git-workflow", description: "Git best practices" }],
			settings: { registry_cache_ttl: 7200 },
		};
		const config = EnsembleConfigSchema.parse(input);
		// Round-trip: serialize and re-parse
		const json = JSON.parse(JSON.stringify(config));
		const reparsed = EnsembleConfigSchema.parse(json);
		expect(reparsed).toEqual(config);
	});

	it("preserves extra fields via passthrough-like behavior on nested objects", () => {
		// Zod strips unknown fields by default — this test documents that behavior
		const input = { servers: [{ name: "ctx", command: "npx", unknownField: "value" }] };
		const config = EnsembleConfigSchema.parse(input);
		expect(config.servers[0]?.name).toBe("ctx");
		// Unknown fields are stripped by Zod's default behavior
		expect((config.servers[0] as Record<string, unknown>)["unknownField"]).toBeUndefined();
	});

	it("rejects invalid transport type", () => {
		expect(() =>
			EnsembleConfigSchema.parse({
				servers: [{ name: "bad", transport: "websocket" }],
			}),
		).toThrow();
	});
});

describe("RESERVED_MARKETPLACE_NAMES", () => {
	it("contains known reserved names", () => {
		expect(RESERVED_MARKETPLACE_NAMES.has("claude-plugins-official")).toBe(true);
		expect(RESERVED_MARKETPLACE_NAMES.has("my-custom-marketplace")).toBe(false);
	});
});
