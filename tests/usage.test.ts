import { describe, expect, it } from "vitest";
import {
	recordUsage,
	getUsageScore,
	type UsageData,
} from "../src/usage.js";
import { searchAll } from "../src/search.js";
import { createConfig } from "../src/config.js";
import { addServer } from "../src/operations.js";

describe("recordUsage", () => {
	it("creates new entry for unknown name", () => {
		const data = recordUsage("postgres", "success", {});
		expect(data["postgres"]).toBeDefined();
		expect(data["postgres"]!.invocations).toBe(1);
		expect(data["postgres"]!.successes).toBe(1);
		expect(data["postgres"]!.failures).toBe(0);
	});

	it("increments existing entry", () => {
		let data: UsageData = {};
		data = recordUsage("postgres", "success", data);
		data = recordUsage("postgres", "success", data);
		data = recordUsage("postgres", "failure", data);
		expect(data["postgres"]!.invocations).toBe(3);
		expect(data["postgres"]!.successes).toBe(2);
		expect(data["postgres"]!.failures).toBe(1);
	});

	it("records timestamp", () => {
		const data = recordUsage("test", "success", {});
		expect(data["test"]!.lastUsed).toBeTruthy();
		// Should be a valid ISO date
		expect(new Date(data["test"]!.lastUsed).getTime()).toBeGreaterThan(0);
	});
});

describe("getUsageScore", () => {
	it("returns neutral 0.5 for cold-start (< 5 invocations)", () => {
		const data: UsageData = {
			"new-tool": {
				invocations: 3,
				lastUsed: new Date().toISOString(),
				successes: 3,
				failures: 0,
			},
		};
		expect(getUsageScore("new-tool", data)).toBe(0.5);
	});

	it("returns neutral 0.5 for unknown name", () => {
		expect(getUsageScore("nonexistent", {})).toBe(0.5);
	});

	it("returns high score for frequently successful tool", () => {
		const data: UsageData = {
			"reliable": {
				invocations: 20,
				lastUsed: new Date().toISOString(),
				successes: 19,
				failures: 1,
			},
		};
		const score = getUsageScore("reliable", data);
		expect(score).toBeGreaterThan(0.7);
	});

	it("returns low score for frequently failing tool", () => {
		const data: UsageData = {
			"broken": {
				invocations: 10,
				lastUsed: new Date().toISOString(),
				successes: 1,
				failures: 9,
			},
		};
		const score = getUsageScore("broken", data);
		expect(score).toBeLessThan(0.5);
	});

	it("scores in 0-1 range", () => {
		const data: UsageData = {
			"test": {
				invocations: 100,
				lastUsed: new Date().toISOString(),
				successes: 50,
				failures: 50,
			},
		};
		const score = getUsageScore("test", data);
		expect(score).toBeGreaterThanOrEqual(0);
		expect(score).toBeLessThanOrEqual(1);
	});
});

describe("usage integration with search", () => {
	it("search works with usage data passed in", () => {
		let config = createConfig();
		({ config } = addServer(config, {
			name: "postgres",
			command: "npx",
			tools: [{ name: "query", description: "Run SQL" }],
		}));

		const usageData: UsageData = {
			"postgres": {
				invocations: 20,
				lastUsed: new Date().toISOString(),
				successes: 18,
				failures: 2,
			},
		};

		const withUsage = searchAll(config, "postgres", 10, { usageData });
		const withoutUsage = searchAll(config, "postgres", 10);

		expect(withUsage.length).toBeGreaterThan(0);
		expect(withoutUsage.length).toBeGreaterThan(0);
		// Both should find postgres but scores may differ
		expect(withUsage[0]?.name).toBe("postgres");
		expect(withoutUsage[0]?.name).toBe("postgres");
	});
});
