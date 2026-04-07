import { describe, expect, it, vi, beforeEach } from "vitest";
import { isSetlistAvailable, queryCapabilities, getProjectCapabilities, getMcpCapabilities, _resetForTesting } from "../src/setlist.js";
import { searchCapabilities, searchAll } from "../src/search.js";
import { runDoctor, type DoctorCheck } from "../src/doctor.js";
import { EnsembleConfigSchema } from "../src/schemas.js";

// Mock @setlist/core as unavailable by default
vi.mock("@setlist/core", () => {
	throw new Error("Module not found");
});

function makeConfig(overrides?: Record<string, unknown>) {
	return EnsembleConfigSchema.parse({
		servers: [
			{ name: "knowmarks-mcp", command: "npx", args: ["knowmarks-mcp"], enabled: true },
			{ name: "setlist", command: "npx", args: ["setlist-mcp"], enabled: true },
			{ name: "disabled-server", command: "npx", args: ["disabled"], enabled: false },
		],
		...overrides,
	});
}

describe("setlist reader (unavailable)", () => {
	beforeEach(() => _resetForTesting());

	it("isSetlistAvailable returns false when @setlist/core is not installed", () => {
		expect(isSetlistAvailable()).toBe(false);
	});

	it("queryCapabilities returns empty array when unavailable", () => {
		expect(queryCapabilities()).toEqual([]);
	});

	it("getProjectCapabilities returns empty array when unavailable", () => {
		expect(getProjectCapabilities("chorus")).toEqual([]);
	});

	it("getMcpCapabilities returns empty array when unavailable", () => {
		expect(getMcpCapabilities()).toEqual([]);
	});
});

describe("searchCapabilities (unavailable)", () => {
	beforeEach(() => _resetForTesting());

	it("returns empty when setlist is not available", () => {
		const config = makeConfig();
		const results = searchCapabilities(config, "knowledge");
		expect(results).toEqual([]);
	});

	it("searchAll works without capabilities", () => {
		const config = makeConfig();
		const results = searchAll(config, "knowmarks", 10);
		expect(results.some((r) => r.resultType === "server")).toBe(true);
		expect(results.some((r) => r.resultType === "capability")).toBe(false);
	});
});

describe("doctor capability check (unavailable)", () => {
	beforeEach(() => _resetForTesting());

	it("produces no capability checks when setlist is unavailable", () => {
		const config = makeConfig();
		const result = runDoctor(config);
		const capChecks = result.checks.filter((c: DoctorCheck) => c.category === "capability");
		expect(capChecks).toEqual([]);
	});
});
