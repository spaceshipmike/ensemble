import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	computeEntryHash,
	createConfig,
	getClient,
	getGroup,
	getMarketplace,
	getPlugin,
	getServer,
	getSkill,
	loadConfig,
	matchRule,
	resolvePlugins,
	resolveServers,
	resolveSkills,
	saveConfig,
} from "../src/config.js";
import type { EnsembleConfig } from "../src/schemas.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("createConfig", () => {
	it("returns a valid empty config", () => {
		const config = createConfig();
		expect(config.servers).toEqual([]);
		expect(config.groups).toEqual([]);
		expect(config.settings.registry_cache_ttl).toBe(3600);
	});
});

describe("loadConfig / saveConfig", () => {
	it("returns default config when file does not exist", () => {
		const config = loadConfig(join(tmpDir, "nonexistent.json"));
		expect(config.servers).toEqual([]);
	});

	it("round-trips a config to disk", () => {
		const configPath = join(tmpDir, "config.json");
		const config = createConfig();
		config.servers.push({
			name: "ctx",
			enabled: true,
			transport: "stdio",
			command: "npx",
			args: ["tsx", "index.ts"],
			env: { API_KEY: "op://Dev/ctx/key" },
			url: "",
			auth_type: "",
			auth_ref: "",
			origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" },
			tools: [],
		});
		saveConfig(config, configPath);

		const loaded = loadConfig(configPath);
		expect(loaded.servers).toHaveLength(1);
		expect(loaded.servers[0]?.name).toBe("ctx");
		expect(loaded.servers[0]?.env["API_KEY"]).toBe("op://Dev/ctx/key");
	});

	it("creates parent directories on save", () => {
		const configPath = join(tmpDir, "nested", "deep", "config.json");
		const config = createConfig();
		saveConfig(config, configPath);
		const raw = readFileSync(configPath, "utf-8");
		expect(JSON.parse(raw).servers).toEqual([]);
	});

	it("overwrites existing config", () => {
		const configPath = join(tmpDir, "config.json");
		const config1 = createConfig();
		config1.servers.push({
			name: "first",
			enabled: true,
			transport: "stdio",
			command: "echo",
			args: [],
			env: {},
			url: "",
			auth_type: "",
			auth_ref: "",
			origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" },
			tools: [],
		});
		saveConfig(config1, configPath);

		const config2 = createConfig();
		config2.servers.push({
			name: "second",
			enabled: true,
			transport: "stdio",
			command: "echo",
			args: [],
			env: {},
			url: "",
			auth_type: "",
			auth_ref: "",
			origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" },
			tools: [],
		});
		saveConfig(config2, configPath);

		const loaded = loadConfig(configPath);
		expect(loaded.servers).toHaveLength(1);
		expect(loaded.servers[0]?.name).toBe("second");
	});
});

describe("computeEntryHash", () => {
	it("produces consistent hashes", () => {
		const entry = { name: "ctx", command: "npx", args: ["tsx"] };
		const hash1 = computeEntryHash(entry);
		const hash2 = computeEntryHash(entry);
		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64); // SHA-256 hex
	});

	it("strips __ensemble marker", () => {
		const withMarker = { name: "ctx", command: "npx", __ensemble: true };
		const without = { name: "ctx", command: "npx" };
		expect(computeEntryHash(withMarker)).toBe(computeEntryHash(without));
	});

	it("strips __mcpoyle marker (migration compat)", () => {
		const withMarker = { name: "ctx", command: "npx", __mcpoyle: true };
		const without = { name: "ctx", command: "npx" };
		expect(computeEntryHash(withMarker)).toBe(computeEntryHash(without));
	});

	it("different entries produce different hashes", () => {
		const entry1 = { name: "ctx", command: "npx" };
		const entry2 = { name: "prm", command: "uvx" };
		expect(computeEntryHash(entry1)).not.toBe(computeEntryHash(entry2));
	});
});

describe("query helpers", () => {
	const config: EnsembleConfig = {
		servers: [
			{ name: "ctx", enabled: true, transport: "stdio", command: "npx", args: [], env: {}, url: "", auth_type: "", auth_ref: "", origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" }, tools: [] },
			{ name: "prm", enabled: false, transport: "stdio", command: "uvx", args: [], env: {}, url: "", auth_type: "", auth_ref: "", origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" }, tools: [] },
		],
		groups: [
			{ name: "dev", description: "", servers: ["ctx"], plugins: [], skills: [] },
		],
		clients: [
			{ id: "cursor", group: "dev", last_synced: null, projects: {}, server_hashes: {} },
			{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
		],
		plugins: [
			{ name: "clangd-lsp", marketplace: "claude-plugins-official", enabled: true, managed: true },
		],
		marketplaces: [
			{ name: "official", source: { source: "github", repo: "anthropics/official", path: "", url: "" } },
		],
		rules: [
			{ path: "~/Code/work", group: "dev" },
		],
		skills: [
			{ name: "git-workflow", enabled: true, description: "Git", path: "", origin: "", dependencies: [], tags: [], mode: "pin" },
		],
		settings: { adopt_unmanaged_plugins: false, registry_cache_ttl: 3600, sync_cost_warning_threshold: 50 },
	};

	it("getServer finds by name", () => {
		expect(getServer(config, "ctx")?.name).toBe("ctx");
		expect(getServer(config, "nonexistent")).toBeUndefined();
	});

	it("getGroup finds by name", () => {
		expect(getGroup(config, "dev")?.name).toBe("dev");
	});

	it("getClient finds by id", () => {
		expect(getClient(config, "cursor")?.group).toBe("dev");
	});

	it("getPlugin finds by name or qualified name", () => {
		expect(getPlugin(config, "clangd-lsp")?.name).toBe("clangd-lsp");
		expect(getPlugin(config, "clangd-lsp@claude-plugins-official")?.name).toBe("clangd-lsp");
	});

	it("getSkill finds by name", () => {
		expect(getSkill(config, "git-workflow")?.description).toBe("Git");
	});

	it("getMarketplace finds by name", () => {
		expect(getMarketplace(config, "official")?.source.source).toBe("github");
	});
});

describe("matchRule", () => {
	const config: EnsembleConfig = {
		servers: [],
		groups: [],
		clients: [],
		plugins: [],
		marketplaces: [],
		rules: [
			{ path: "~/Code", group: "default" },
			{ path: "~/Code/work", group: "work" },
		],
		skills: [],
		settings: { adopt_unmanaged_plugins: false, registry_cache_ttl: 3600, sync_cost_warning_threshold: 50 },
	};

	it("matches the most specific rule", () => {
		const homeDir = require("node:os").homedir();
		const rule = matchRule(config, `${homeDir}/Code/work/myapp`);
		expect(rule?.group).toBe("work");
	});

	it("falls back to less specific rule", () => {
		const homeDir = require("node:os").homedir();
		const rule = matchRule(config, `${homeDir}/Code/personal/myapp`);
		expect(rule?.group).toBe("default");
	});

	it("returns undefined for no match", () => {
		const rule = matchRule(config, "/tmp/random");
		expect(rule).toBeUndefined();
	});
});

describe("resolveServers", () => {
	const config: EnsembleConfig = {
		servers: [
			{ name: "ctx", enabled: true, transport: "stdio", command: "npx", args: [], env: {}, url: "", auth_type: "", auth_ref: "", origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" }, tools: [] },
			{ name: "prm", enabled: true, transport: "stdio", command: "uvx", args: [], env: {}, url: "", auth_type: "", auth_ref: "", origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" }, tools: [] },
			{ name: "disabled", enabled: false, transport: "stdio", command: "echo", args: [], env: {}, url: "", auth_type: "", auth_ref: "", origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" }, tools: [] },
		],
		groups: [{ name: "dev", description: "", servers: ["ctx"], plugins: [], skills: [] }],
		clients: [
			{ id: "cursor", group: "dev", last_synced: null, projects: {}, server_hashes: {} },
			{ id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} },
		],
		plugins: [],
		marketplaces: [],
		rules: [],
		skills: [],
		settings: { adopt_unmanaged_plugins: false, registry_cache_ttl: 3600, sync_cost_warning_threshold: 50 },
	};

	it("resolves by group assignment", () => {
		const servers = resolveServers(config, "cursor");
		expect(servers).toHaveLength(1);
		expect(servers[0]?.name).toBe("ctx");
	});

	it("returns all enabled when no group", () => {
		const servers = resolveServers(config, "claude-code");
		expect(servers).toHaveLength(2); // ctx and prm, not disabled
	});

	it("explicit group overrides client assignment", () => {
		const servers = resolveServers(config, "cursor", "nonexistent");
		expect(servers).toEqual([]); // group doesn't exist
	});

	it("returns empty for nonexistent group", () => {
		const servers = resolveServers(config, "cursor", "nope");
		expect(servers).toEqual([]);
	});
});
