import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearCache,
	estimatedTokenCost,
	listBackends,
	resolveInstallParams,
	securitySummary,
} from "../src/registry.js";
import type { ServerDetail } from "../src/registry.js";

describe("securitySummary", () => {
	it("flags secrets and network transport", () => {
		const detail: ServerDetail = {
			name: "test",
			description: "Test server",
			source: "official",
			transport: "http",
			homepage: "",
			envVars: [
				{ name: "API_TOKEN", description: "Auth token", required: true },
				{ name: "DB_HOST", description: "Host", required: false },
			],
			tools: Array.from({ length: 25 }, (_, i) => `tool${i}`),
			toolsRawChars: 0,
			registryType: "npm",
			packageIdentifier: "@mcp/test",
			packageArgs: [],
			stars: 0,
			lastUpdated: "",
			hasReadme: false,
			installs: 0,
		};
		const summary = securitySummary(detail);
		expect(summary.riskFlags).toContain("requires-secrets");
		expect(summary.riskFlags).toContain("network-transport");
		expect(summary.riskFlags).toContain("many-tools");
		expect(summary.toolCount).toBe(25);
	});

	it("returns no flags for safe server", () => {
		const detail: ServerDetail = {
			name: "safe",
			description: "",
			source: "official",
			transport: "stdio",
			homepage: "",
			envVars: [{ name: "HOST", description: "", required: false }],
			tools: ["tool1"],
			toolsRawChars: 0,
			registryType: "npm",
			packageIdentifier: "@mcp/safe",
			packageArgs: [],
			stars: 0,
			lastUpdated: "",
			hasReadme: false,
			installs: 0,
		};
		const summary = securitySummary(detail);
		expect(summary.riskFlags).toEqual([]);
	});
});

describe("estimatedTokenCost", () => {
	it("estimates from raw chars when available", () => {
		const detail = { toolsRawChars: 4000, tools: [] } as unknown as ServerDetail;
		expect(estimatedTokenCost(detail)).toBe(1000);
	});

	it("estimates from tool count as fallback", () => {
		const detail = { toolsRawChars: 0, tools: ["a", "b", "c"] } as unknown as ServerDetail;
		expect(estimatedTokenCost(detail)).toBe(600); // 3 * 200
	});
});

describe("resolveInstallParams", () => {
	it("resolves npm packages", () => {
		const result = resolveInstallParams({
			registryType: "npm",
			packageIdentifier: "@mcp/postgres",
			packageArgs: [],
			transport: "stdio",
		} as unknown as ServerDetail);
		expect(result.command).toBe("npx");
		expect(result.args).toEqual(["-y", "@mcp/postgres"]);
	});

	it("resolves pypi packages", () => {
		const result = resolveInstallParams({
			registryType: "pypi",
			packageIdentifier: "mcp-server-postgres",
			packageArgs: [],
			transport: "stdio",
		} as unknown as ServerDetail);
		expect(result.command).toBe("uvx");
		expect(result.args).toEqual(["mcp-server-postgres"]);
	});
});

describe("listBackends", () => {
	it("returns two default backends", () => {
		const backends = listBackends();
		expect(backends).toHaveLength(2);
		expect(backends[0]?.name).toBe("official");
		expect(backends[1]?.name).toBe("glama");
	});
});
