import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import {
	addMarketplace,
	addPluginToGroup,
	addRule,
	addServer,
	addServerToGroup,
	addSkillToGroup,
	assignClient,
	checkSkillDependencies,
	createGroup,
	deleteGroup,
	detectCollisions,
	disablePlugin,
	disableServer,
	disableSkill,
	enablePlugin,
	enableServer,
	enableSkill,
	importPlugins,
	installPlugin,
	installSkill,
	pinItem,
	removeMarketplace,
	removePluginFromGroup,
	removeRule,
	removeServer,
	removeServerFromGroup,
	removeSkillFromGroup,
	trackItem,
	unassignClient,
	uninstallPlugin,
	uninstallSkill,
	setUserNotes,
	getUserNotes,
	parseNoteRef,
} from "../src/operations.js";
import { RESERVED_MARKETPLACE_NAMES } from "../src/schemas.js";

function configWithServer(name = "ctx") {
	const { config } = addServer(createConfig(), { name, command: "npx" });
	return config;
}

function configWithGroup(groupName = "dev", serverName = "ctx") {
	let config = configWithServer(serverName);
	({ config } = createGroup(config, groupName));
	({ config } = addServerToGroup(config, groupName, serverName));
	return config;
}

// --- Server operations ---

describe("addServer", () => {
	it("adds a server", () => {
		const { config, result } = addServer(createConfig(), { name: "ctx", command: "npx" });
		expect(result.ok).toBe(true);
		expect(result.server?.name).toBe("ctx");
		expect(config.servers).toHaveLength(1);
	});

	it("rejects duplicate name", () => {
		const config = configWithServer();
		const { result } = addServer(config, { name: "ctx", command: "uvx" });
		expect(result.ok).toBe(false);
		expect(result.error).toContain("already exists");
	});

	it("preserves origin metadata", () => {
		const { result } = addServer(createConfig(), {
			name: "github",
			command: "npx",
			origin: { source: "registry", trust_tier: "official", registry_id: "@anthropic/github" },
		});
		expect(result.server?.origin.source).toBe("registry");
		expect(result.server?.origin.trust_tier).toBe("official");
	});
});

describe("removeServer", () => {
	it("removes and cascades to groups", () => {
		const config = configWithGroup();
		const { config: newConfig, result } = removeServer(config, "ctx");
		expect(result.ok).toBe(true);
		expect(newConfig.servers).toHaveLength(0);
		expect(newConfig.groups[0]?.servers).toEqual([]);
	});

	it("fails for nonexistent server", () => {
		const { result } = removeServer(createConfig(), "nope");
		expect(result.ok).toBe(false);
	});
});

describe("enable/disable server", () => {
	it("enables a disabled server", () => {
		let config = configWithServer();
		({ config } = disableServer(config, "ctx"));
		expect(config.servers[0]?.enabled).toBe(false);
		({ config } = enableServer(config, "ctx"));
		expect(config.servers[0]?.enabled).toBe(true);
	});
});

// --- Group operations ---

describe("createGroup / deleteGroup", () => {
	it("creates and deletes a group", () => {
		let config = createConfig();
		({ config } = createGroup(config, "dev", "Development servers"));
		expect(config.groups).toHaveLength(1);
		expect(config.groups[0]?.description).toBe("Development servers");

		({ config } = deleteGroup(config, "dev"));
		expect(config.groups).toHaveLength(0);
	});

	it("rejects duplicate group name", () => {
		let config = createConfig();
		({ config } = createGroup(config, "dev"));
		const { result } = createGroup(config, "dev");
		expect(result.ok).toBe(false);
	});

	it("unsets client assignments when group is deleted", () => {
		let config = configWithGroup();
		({ config } = assignClient(config, "cursor", "dev"));
		({ config } = deleteGroup(config, "dev"));
		expect(config.clients.find((c) => c.id === "cursor")?.group).toBeNull();
	});
});

describe("addServerToGroup / removeServerFromGroup", () => {
	it("adds and removes servers", () => {
		let config = configWithServer();
		({ config } = createGroup(config, "dev"));
		({ config } = addServerToGroup(config, "dev", "ctx"));
		expect(config.groups[0]?.servers).toEqual(["ctx"]);

		({ config } = removeServerFromGroup(config, "dev", "ctx"));
		expect(config.groups[0]?.servers).toEqual([]);
	});

	it("fails for nonexistent group", () => {
		const { result } = addServerToGroup(configWithServer(), "nope", "ctx");
		expect(result.ok).toBe(false);
	});

	it("fails for nonexistent server", () => {
		let config = createConfig();
		({ config } = createGroup(config, "dev"));
		const { result } = addServerToGroup(config, "dev", "nope");
		expect(result.ok).toBe(false);
	});
});

// --- Plugin operations ---

describe("installPlugin / uninstallPlugin", () => {
	it("installs and uninstalls a plugin", () => {
		let config = createConfig();
		({ config } = installPlugin(config, "clangd-lsp"));
		expect(config.plugins).toHaveLength(1);
		expect(config.plugins[0]?.marketplace).toBe("claude-plugins-official");

		({ config } = uninstallPlugin(config, "clangd-lsp"));
		expect(config.plugins).toHaveLength(0);
	});

	it("rejects duplicate install", () => {
		let config = createConfig();
		({ config } = installPlugin(config, "clangd-lsp"));
		const { result } = installPlugin(config, "clangd-lsp");
		expect(result.ok).toBe(false);
	});

	it("uninstall cascades to groups", () => {
		let config = createConfig();
		({ config } = installPlugin(config, "clangd-lsp"));
		({ config } = createGroup(config, "dev"));
		({ config } = addPluginToGroup(config, "dev", "clangd-lsp"));
		({ config } = uninstallPlugin(config, "clangd-lsp"));
		expect(config.groups[0]?.plugins).toEqual([]);
	});
});

describe("enable/disable plugin", () => {
	it("toggles plugin state", () => {
		let config = createConfig();
		({ config } = installPlugin(config, "clangd-lsp"));
		({ config } = disablePlugin(config, "clangd-lsp"));
		expect(config.plugins[0]?.enabled).toBe(false);
		({ config } = enablePlugin(config, "clangd-lsp"));
		expect(config.plugins[0]?.enabled).toBe(true);
	});
});

describe("importPlugins", () => {
	it("imports plugins from enabledPlugins map", () => {
		const { config, result } = importPlugins(createConfig(), {
			"clangd-lsp@claude-plugins-official": true,
			"my-plugin@custom": false,
		});
		expect(result.imported).toHaveLength(2);
		expect(config.plugins).toHaveLength(2);
		expect(config.plugins[0]?.managed).toBe(false);
		expect(config.plugins[1]?.enabled).toBe(false);
	});

	it("skips already-imported plugins", () => {
		let config = createConfig();
		({ config } = installPlugin(config, "clangd-lsp"));
		const { result } = importPlugins(config, { "clangd-lsp@claude-plugins-official": true });
		expect(result.imported).toHaveLength(0);
	});
});

// --- Marketplace operations ---

describe("addMarketplace / removeMarketplace", () => {
	it("adds and removes a marketplace", () => {
		let config = createConfig();
		({ config } = addMarketplace(config, "my-plugins", { source: "github", repo: "myorg/plugins", path: "", url: "" }));
		expect(config.marketplaces).toHaveLength(1);

		({ config } = removeMarketplace(config, "my-plugins"));
		expect(config.marketplaces).toHaveLength(0);
	});

	it("rejects reserved names", () => {
		for (const name of RESERVED_MARKETPLACE_NAMES) {
			const { result } = addMarketplace(createConfig(), name, { source: "github", repo: "x/y", path: "", url: "" });
			expect(result.ok).toBe(false);
		}
	});
});

// --- Skill operations ---

describe("installSkill / uninstallSkill", () => {
	it("installs and uninstalls a skill", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "git-workflow", description: "Git best practices" }));
		expect(config.skills).toHaveLength(1);

		({ config } = uninstallSkill(config, "git-workflow"));
		expect(config.skills).toHaveLength(0);
	});

	it("uninstall cascades to groups", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "git-workflow" }));
		({ config } = createGroup(config, "dev"));
		({ config } = addSkillToGroup(config, "dev", "git-workflow"));
		({ config } = uninstallSkill(config, "git-workflow"));
		expect(config.groups[0]?.skills).toEqual([]);
	});
});

describe("enable/disable skill", () => {
	it("toggles skill state", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "git-workflow" }));
		({ config } = disableSkill(config, "git-workflow"));
		expect(config.skills[0]?.enabled).toBe(false);
		({ config } = enableSkill(config, "git-workflow"));
		expect(config.skills[0]?.enabled).toBe(true);
	});
});

// --- Assignment operations ---

describe("assignClient / unassignClient", () => {
	it("assigns a group to a client", () => {
		let config = configWithGroup();
		({ config } = assignClient(config, "cursor", "dev"));
		expect(config.clients.find((c) => c.id === "cursor")?.group).toBe("dev");
	});

	it("unassigns a client", () => {
		let config = configWithGroup();
		({ config } = assignClient(config, "cursor", "dev"));
		({ config } = unassignClient(config, "cursor"));
		expect(config.clients.find((c) => c.id === "cursor")?.group).toBeNull();
	});

	it("assigns at project level for claude-code", () => {
		let config = configWithGroup();
		({ config } = assignClient(config, "claude-code", "dev", { projectPath: "/tmp/myapp" }));
		const cc = config.clients.find((c) => c.id === "claude-code");
		const projects = cc?.projects ?? {};
		const projectKeys = Object.keys(projects);
		expect(projectKeys.length).toBeGreaterThan(0);
	});

	it("rejects project flag for non-claude-code", () => {
		const config = configWithGroup();
		const { result } = assignClient(config, "cursor", "dev", { projectPath: "/tmp/myapp" });
		expect(result.ok).toBe(false);
	});

	it("rejects unknown client", () => {
		const { result } = assignClient(createConfig(), "fake-client", "dev");
		expect(result.ok).toBe(false);
	});
});

// --- Rules ---

describe("addRule / removeRule", () => {
	it("adds and removes rules", () => {
		let config = createConfig();
		({ config } = createGroup(config, "work"));
		({ config } = addRule(config, "~/Code/work", "work"));
		expect(config.rules).toHaveLength(1);

		({ config } = removeRule(config, "~/Code/work"));
		expect(config.rules).toHaveLength(0);
	});

	it("rejects rule for nonexistent group", () => {
		const { result } = addRule(createConfig(), "~/Code", "nope");
		expect(result.ok).toBe(false);
	});
});

// --- Pin / Track ---

describe("pinItem / trackItem", () => {
	it("pins and tracks a skill", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "git-workflow", mode: "track" }));
		expect(config.skills[0]?.mode).toBe("track");

		({ config } = pinItem(config, "git-workflow"));
		expect(config.skills[0]?.mode).toBe("pin");

		({ config } = trackItem(config, "git-workflow"));
		expect(config.skills[0]?.mode).toBe("track");
	});
});

// --- Collision detection ---

describe("detectCollisions", () => {
	it("detects server collision between global and project group", () => {
		let config = configWithGroup("global", "ctx");
		({ config } = createGroup(config, "project"));
		({ config } = addServerToGroup(config, "project", "ctx"));
		({ config } = assignClient(config, "claude-code", "global"));
		({ config } = assignClient(config, "claude-code", "project", { projectPath: "/tmp/app" }));

		const collisions = detectCollisions(config);
		expect(collisions).toHaveLength(1);
		expect(collisions[0]?.itemName).toBe("ctx");
		expect(collisions[0]?.itemType).toBe("server");
	});
});

// --- Dependency intelligence ---

describe("checkSkillDependencies", () => {
	it("reports missing and satisfied dependencies", () => {
		let config = configWithServer("github-mcp");
		({ config } = installSkill(config, {
			name: "git-workflow",
			dependencies: ["github-mcp", "missing-server"],
		}));

		const deps = checkSkillDependencies(config);
		expect(deps).toHaveLength(1);
		expect(deps[0]?.satisfied).toEqual(["github-mcp"]);
		expect(deps[0]?.missing).toEqual(["missing-server"]);
	});

	it("reports disabled dependencies", () => {
		let config = configWithServer("github-mcp");
		({ config } = disableServer(config, "github-mcp"));
		({ config } = installSkill(config, {
			name: "git-workflow",
			dependencies: ["github-mcp"],
		}));

		const deps = checkSkillDependencies(config);
		expect(deps[0]?.disabled).toEqual(["github-mcp"]);
	});
});

// --- Operations layer purity ---

describe("operations purity", () => {
	it("does not mutate the input config", () => {
		const original = createConfig();
		const originalServersLength = original.servers.length;
		addServer(original, { name: "ctx", command: "npx" });
		expect(original.servers.length).toBe(originalServersLength);
	});

	it("returns structured results, not strings", () => {
		const { result } = addServer(createConfig(), { name: "ctx", command: "npx" });
		expect(typeof result.ok).toBe("boolean");
		expect(typeof result.error).toBe("string");
		expect(Array.isArray(result.messages)).toBe(true);
		expect(result.server).toBeDefined();
	});

	describe("setUserNotes / getUserNotes (v2.0.3 #notes-and-descriptions)", () => {
		it("parseNoteRef parses type:name and bare names", () => {
			expect(parseNoteRef("server:ctx")).toEqual({ type: "server", name: "ctx" });
			expect(parseNoteRef("skill:writer")).toEqual({ type: "skill", name: "writer" });
			expect(parseNoteRef("plugin:fctry@official")).toEqual({
				type: "plugin",
				name: "fctry",
				marketplace: "official",
			});
			expect(parseNoteRef("ctx")).toEqual({ type: null, name: "ctx" });
			expect(parseNoteRef("  ")).toEqual({ type: null, name: "" });
		});

		it("sets notes on a server and reads them back", () => {
			const config = configWithServer("ctx");
			const { config: next, result } = setUserNotes(config, {
				ref: "server:ctx",
				text: "trusted source",
			});
			expect(result.ok).toBe(true);
			expect(result.userNotes).toBe("trusted source");
			const got = getUserNotes(next, "server:ctx");
			expect(got?.userNotes).toBe("trusted source");
		});

		it("empty string deletes the userNotes key entirely", () => {
			const config = configWithServer("ctx");
			const { config: withNote } = setUserNotes(config, { ref: "server:ctx", text: "hello" });
			const { config: cleared, result } = setUserNotes(withNote, { ref: "server:ctx", text: "" });
			expect(result.ok).toBe(true);
			expect(result.userNotes).toBe(null);
			const server = cleared.servers.find((s) => s.name === "ctx");
			expect(server).toBeDefined();
			expect("userNotes" in (server as object)).toBe(false);
		});

		it("bare name resolves across servers, skills, plugins", () => {
			const config = configWithServer("alpha");
			const { config: withSkill } = installSkill(config, { name: "beta" });
			const { result: aRes } = setUserNotes(withSkill, { ref: "alpha", text: "x" });
			expect(aRes.type).toBe("server");
			const { result: bRes } = setUserNotes(withSkill, { ref: "beta", text: "y" });
			expect(bRes.type).toBe("skill");
		});

		it("returns failure when the item does not exist", () => {
			const { result } = setUserNotes(createConfig(), { ref: "server:nope", text: "x" });
			expect(result.ok).toBe(false);
			expect(result.error).toMatch(/not found/);
		});

		it("getUserNotes returns null when item has no notes", () => {
			const config = configWithServer("ctx");
			expect(getUserNotes(config, "server:ctx")?.userNotes).toBe(null);
		});
	});
});
