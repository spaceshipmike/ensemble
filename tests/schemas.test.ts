import { describe, expect, it } from "vitest";
import {
	AgentSchema,
	ClientAssignmentSchema,
	CommandSchema,
	EnsembleConfigSchema,
	GroupSchema,
	HookSchema,
	InstallStateSchema,
	LibraryResourceSchema,
	MarketplaceSchema,
	PivotSpecSchema,
	PluginSchema,
	RESERVED_MARKETPLACE_NAMES,
	ResourceTypeSchema,
	ServerSchema,
	SettingSchema,
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

	it("preserves unknown top-level fields for forward compatibility", () => {
		const input = { servers: [{ name: "ctx", command: "npx" }], futureField: "preserved" };
		const config = EnsembleConfigSchema.parse(input);
		expect(config.servers[0]?.name).toBe("ctx");
		// Top-level unknown fields are preserved via .passthrough()
		expect((config as Record<string, unknown>)["futureField"]).toBe("preserved");
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

// --- v2.0.1 library-first schemas ---

describe("InstallStateSchema", () => {
	it("defaults to an empty map for a library-only resource", () => {
		const state = InstallStateSchema.parse({});
		expect(state).toEqual({});
	});

	it("round-trips a single user-scope install", () => {
		const input = { "claude-code": { installed: true, projects: [] } };
		const state = InstallStateSchema.parse(input);
		const reparsed = InstallStateSchema.parse(JSON.parse(JSON.stringify(state)));
		expect(reparsed).toEqual(input);
	});

	it("round-trips user + project scopes across multiple clients", () => {
		const input = {
			"claude-code": {
				installed: true,
				projects: ["/Users/me/Code/app", "/Users/me/Code/other"],
			},
			cursor: { installed: true, projects: [] },
			"codex-cli": { installed: false, projects: [] },
		};
		const state = InstallStateSchema.parse(input);
		const reparsed = InstallStateSchema.parse(JSON.parse(JSON.stringify(state)));
		expect(reparsed).toEqual(input);
	});

	it("applies defaults when installed/projects are omitted", () => {
		const state = InstallStateSchema.parse({ "claude-code": {} });
		expect(state["claude-code"]).toEqual({ installed: false, projects: [] });
	});
});

describe("PivotSpecSchema", () => {
	it("parses a library pivot", () => {
		const pivot = PivotSpecSchema.parse({ kind: "library" });
		expect(pivot.kind).toBe("library");
	});

	it("parses a project pivot with an optional path", () => {
		const pivot = PivotSpecSchema.parse({
			kind: "project",
			path: "/Users/me/Code/app",
		});
		expect(pivot.kind).toBe("project");
		if (pivot.kind === "project") {
			expect(pivot.path).toBe("/Users/me/Code/app");
		}
	});

	it("parses a group pivot requiring a name", () => {
		const pivot = PivotSpecSchema.parse({ kind: "group", name: "dev-tools" });
		expect(pivot.kind).toBe("group");
		if (pivot.kind === "group") {
			expect(pivot.name).toBe("dev-tools");
		}
	});

	it("parses a client pivot with optional scope and project", () => {
		const pivot = PivotSpecSchema.parse({
			kind: "client",
			client: "claude-code",
			scope: "project",
			project: "/Users/me/Code/app",
		});
		expect(pivot.kind).toBe("client");
		if (pivot.kind === "client") {
			expect(pivot.client).toBe("claude-code");
			expect(pivot.scope).toBe("project");
			expect(pivot.project).toBe("/Users/me/Code/app");
		}
	});

	it("parses a marketplace pivot", () => {
		const pivot = PivotSpecSchema.parse({
			kind: "marketplace",
			name: "claude-plugins-official",
		});
		expect(pivot.kind).toBe("marketplace");
	});

	it("rejects a group pivot missing name", () => {
		expect(() => PivotSpecSchema.parse({ kind: "group" })).toThrow();
	});

	it("rejects an unknown pivot kind", () => {
		expect(() => PivotSpecSchema.parse({ kind: "cabinet" })).toThrow();
	});
});

describe("installState field on the seven resource schemas", () => {
	it("ServerSchema defaults installState to an empty map", () => {
		const server = ServerSchema.parse({ name: "pg" });
		expect(server.installState).toEqual({});
	});

	it("PluginSchema defaults installState to an empty map", () => {
		const plugin = PluginSchema.parse({ name: "clangd-lsp" });
		expect(plugin.installState).toEqual({});
	});

	it("SkillSchema defaults installState to an empty map", () => {
		const skill = SkillSchema.parse({ name: "git-workflow" });
		expect(skill.installState).toEqual({});
	});

	it("AgentSchema defaults installState to an empty map", () => {
		const agent = AgentSchema.parse({ name: "reviewer" });
		expect(agent.installState).toEqual({});
	});

	it("CommandSchema defaults installState to an empty map", () => {
		const cmd = CommandSchema.parse({ name: "evolve" });
		expect(cmd.installState).toEqual({});
	});

	it("HookSchema defaults installState to an empty map", () => {
		const hook = HookSchema.parse({
			name: "pre-commit",
			event: "PreToolUse",
			matcher: "Bash",
			command: "echo hi",
		});
		expect(hook.installState).toEqual({});
	});

	it("SettingSchema defaults installState to an empty map", () => {
		const setting = SettingSchema.parse({ keyPath: "permissions.allow", value: [] });
		expect(setting.installState).toEqual({});
	});

	it("round-trips a server with a populated install matrix", () => {
		const input = {
			name: "pg",
			installState: {
				"claude-code": { installed: true, projects: ["/Users/me/Code/app"] },
				cursor: { installed: true, projects: [] },
			},
		};
		const server = ServerSchema.parse(input);
		const reparsed = ServerSchema.parse(JSON.parse(JSON.stringify(server)));
		expect(reparsed.installState).toEqual(input.installState);
	});
});

describe("ResourceTypeSchema", () => {
	it("accepts every resource tag", () => {
		for (const t of ["server", "skill", "plugin", "agent", "command", "hook", "setting"]) {
			expect(ResourceTypeSchema.parse(t)).toBe(t);
		}
	});

	it("rejects an unknown resource type", () => {
		expect(() => ResourceTypeSchema.parse("widget")).toThrow();
	});
});

describe("LibraryResourceSchema", () => {
	it("parses a server resource wrapper", () => {
		const wrapped = LibraryResourceSchema.parse({
			type: "server",
			resource: { name: "pg" },
		});
		expect(wrapped.type).toBe("server");
		if (wrapped.type === "server") {
			expect(wrapped.resource.name).toBe("pg");
		}
	});

	it("parses a hook resource wrapper", () => {
		const wrapped = LibraryResourceSchema.parse({
			type: "hook",
			resource: {
				name: "fmt",
				event: "PreToolUse",
				matcher: "Bash",
				command: "true",
			},
		});
		expect(wrapped.type).toBe("hook");
	});

	it("rejects a mismatch between type tag and resource shape", () => {
		expect(() =>
			LibraryResourceSchema.parse({
				type: "server",
				resource: { keyPath: "permissions.allow", value: [] },
			}),
		).toThrow();
	});
});

describe("Backward compatibility — v1.3 config loads cleanly", () => {
	it("accepts a v1.3-shaped config with no installState anywhere and fills defaults", () => {
		// Simulates a user's existing ~/.config/ensemble/config.json from v1.3.
		const v13 = {
			servers: [
				{ name: "ctx", command: "npx", args: ["tsx", "index.ts"], enabled: true },
				{ name: "pg", command: "npx", args: ["postgres"], enabled: false },
			],
			plugins: [{ name: "clangd-lsp", marketplace: "claude-plugins-official", enabled: true }],
			skills: [{ name: "git-workflow", description: "Git best practices", enabled: true }],
			groups: [],
			clients: [],
			marketplaces: [],
			rules: [],
		};
		const config = EnsembleConfigSchema.parse(v13);
		expect(config.servers[0]?.installState).toEqual({});
		expect(config.servers[1]?.installState).toEqual({});
		expect(config.plugins[0]?.installState).toEqual({});
		expect(config.skills[0]?.installState).toEqual({});
		// enabled is preserved alongside installState during the transition.
		expect(config.servers[0]?.enabled).toBe(true);
		expect(config.servers[1]?.enabled).toBe(false);
	});
});
