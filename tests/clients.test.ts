import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CLIENTS,
	ENSEMBLE_MARKER,
	dictToToml,
	getManagedServers,
	getUnmanagedServers,
	importServersFromClient,
	readClientConfig,
	serverToClientEntry,
	writeClientConfig,
} from "../src/clients.js";
import type { Server } from "../src/schemas.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ensemble-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("CLIENTS", () => {
	it("has 17 client definitions", () => {
		expect(Object.keys(CLIENTS)).toHaveLength(17);
	});

	it("includes expected clients", () => {
		expect(CLIENTS["claude-desktop"]).toBeDefined();
		expect(CLIENTS["claude-code"]).toBeDefined();
		expect(CLIENTS["cursor"]).toBeDefined();
		expect(CLIENTS["vscode"]).toBeDefined();
		expect(CLIENTS["zed"]).toBeDefined();
		expect(CLIENTS["jetbrains"]).toBeDefined();
		expect(CLIENTS["amp"]).toBeDefined();
	});

	it("claude-code supports plugins and skills", () => {
		expect(CLIENTS["claude-code"]?.supportsPlugins).toBe(true);
		expect(CLIENTS["claude-code"]?.skillsDir).toBeTruthy();
	});

	it("cursor supports skills", () => {
		expect(CLIENTS["cursor"]?.skillsDir).toBeTruthy();
	});
});

describe("serverToClientEntry", () => {
	it("converts a stdio server", () => {
		const server: Server = {
			name: "ctx",
			enabled: true,
			transport: "stdio",
			command: "npx",
			args: ["tsx", "index.ts"],
			env: { KEY: "val" },
			url: "",
			auth_type: "",
			auth_ref: "",
			origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" },
			tools: [],
		};
		const entry = serverToClientEntry(server);
		expect(entry[ENSEMBLE_MARKER]).toBe(true);
		expect(entry["command"]).toBe("npx");
		expect(entry["args"]).toEqual(["tsx", "index.ts"]);
		expect(entry["env"]).toEqual({ KEY: "val" });
		expect(entry["transport"]).toBeUndefined(); // stdio is default, not written
	});

	it("converts an HTTP server", () => {
		const server: Server = {
			name: "remote",
			enabled: true,
			transport: "http",
			command: "",
			args: [],
			env: {},
			url: "https://mcp.example.com",
			auth_type: "bearer",
			auth_ref: "op://Dev/token",
			origin: { source: "manual", client: "", registry_id: "", timestamp: "", trust_tier: "local" },
			tools: [],
		};
		const entry = serverToClientEntry(server);
		expect(entry["url"]).toBe("https://mcp.example.com");
		expect(entry["transport"]).toBe("http");
		expect(entry["auth"]).toEqual({ type: "bearer", ref: "op://Dev/token" });
	});
});

describe("managed/unmanaged server detection", () => {
	const config = {
		mcpServers: {
			managed: { command: "npx", [ENSEMBLE_MARKER]: true },
			manual: { command: "uvx" },
		},
	};

	it("gets managed servers", () => {
		const managed = getManagedServers(config, "mcpServers");
		expect(Object.keys(managed)).toEqual(["managed"]);
	});

	it("gets unmanaged servers", () => {
		const unmanaged = getUnmanagedServers(config, "mcpServers");
		expect(Object.keys(unmanaged)).toEqual(["manual"]);
	});
});

describe("writeClientConfig", () => {
	it("writes JSON and preserves unmanaged entries", () => {
		const configPath = join(tmpDir, "mcp.json");
		writeFileSync(
			configPath,
			JSON.stringify({
				mcpServers: {
					manual: { command: "echo" },
				},
			}),
		);

		const newServers = {
			managed: { command: "npx", [ENSEMBLE_MARKER]: true },
		};
		writeClientConfig(configPath, "mcpServers", newServers);

		const result = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(result.mcpServers.manual).toEqual({ command: "echo" });
		expect(result.mcpServers.managed[ENSEMBLE_MARKER]).toBe(true);
	});
});

describe("importServersFromClient", () => {
	it("imports non-managed servers", () => {
		const config = {
			mcpServers: {
				ctx: { command: "npx", args: ["tsx", "index.ts"] },
				managed: { command: "uvx", [ENSEMBLE_MARKER]: true },
			},
		};
		const imported = importServersFromClient(config, "mcpServers");
		expect(imported).toHaveLength(1);
		expect(imported[0]?.name).toBe("ctx");
		expect(imported[0]?.command).toBe("npx");
	});
});

describe("dictToToml", () => {
	it("serializes simple values", () => {
		const toml = dictToToml({ key: "value", num: 42, flag: true });
		expect(toml).toContain('key = "value"');
		expect(toml).toContain("num = 42");
		expect(toml).toContain("flag = true");
	});

	it("serializes nested tables", () => {
		const toml = dictToToml({ servers: { ctx: { command: "npx" } } });
		expect(toml).toContain("[servers]");
		expect(toml).toContain("[servers.ctx]");
		expect(toml).toContain('command = "npx"');
	});

	it("quotes keys containing special characters and round-trips through parser", async () => {
		const { parse } = await import("smol-toml");
		const input: Record<string, unknown> = {
			"gpt-5.3-codex": "gpt-5.4",
			"key with spaces": "value",
			projects: {
				"/Users/mike/Code/chorus-app": {
					model: "opus",
				},
				"github@openai-curated": {
					enabled: true,
				},
				safe_key: {
					name: "ok",
				},
			},
		};
		const tomlStr = dictToToml(input);
		const parsed = parse(tomlStr);
		expect(parsed["gpt-5.3-codex"]).toBe("gpt-5.4");
		expect(parsed["key with spaces"]).toBe("value");
		expect((parsed.projects as Record<string, unknown>)["/Users/mike/Code/chorus-app"]).toEqual({
			model: "opus",
		});
		expect((parsed.projects as Record<string, unknown>)["github@openai-curated"]).toEqual({
			enabled: true,
		});
		expect((parsed.projects as Record<string, unknown>).safe_key).toEqual({ name: "ok" });
	});
});

describe("readClientConfig", () => {
	it("returns empty for missing file", () => {
		const result = readClientConfig(join(tmpDir, "nonexistent.json"));
		expect(result).toEqual({});
	});

	it("reads JSON", () => {
		const path = join(tmpDir, "config.json");
		writeFileSync(path, '{"key": "value"}');
		const result = readClientConfig(path);
		expect(result["key"]).toBe("value");
	});
});
