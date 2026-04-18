import { describe, expect, it } from "vitest";
import { browseSearch, fuzzyScore, parseMarketplaceFilter } from "../src/browse.js";
import type { EnsembleConfig } from "../src/schemas.js";

function emptyConfig(): EnsembleConfig {
	return {
		servers: [],
		groups: [],
		clients: [],
		plugins: [],
		marketplaces: [],
		rules: [],
		skills: [],
		agents: [],
		commands: [],
		settings: {
			adopt_unmanaged_plugins: false,
			registry_cache_ttl: 3600,
			sync_cost_warning_threshold: 50,
			usage_tracking: false,
			snapshot_retention_days: 30,
			snapshot_dir_size_warn_mb: 500,
		},
		profiles: {},
		activeProfile: null,
	};
}

function configWith(overrides: Partial<EnsembleConfig>): EnsembleConfig {
	return { ...emptyConfig(), ...overrides };
}

function server(
	name: string,
	enabled: boolean,
	trust: "official" | "community" | "local" = "local",
) {
	return {
		name,
		enabled,
		transport: "stdio" as const,
		command: "echo",
		args: [],
		env: {},
		url: "",
		auth_type: "" as const,
		auth_ref: "",
		origin: {
			source: "manual" as const,
			client: "",
			registry_id: "",
			timestamp: "",
			trust_tier: trust,
		},
		tools: [],
	};
}

describe("parseMarketplaceFilter", () => {
	it("returns the query as-is when no @marketplace prefix is present", () => {
		expect(parseMarketplaceFilter("hello world")).toEqual({ query: "hello world" });
	});

	it("extracts a leading @marketplace/rest token", () => {
		expect(parseMarketplaceFilter("@official/react")).toEqual({
			query: "react",
			marketplace: "official",
		});
	});

	it("handles a space after the filter chip", () => {
		expect(parseMarketplaceFilter("@acme/ hello")).toEqual({
			query: "hello",
			marketplace: "acme",
		});
	});

	it("ignores malformed @prefix with no slash", () => {
		expect(parseMarketplaceFilter("@nobody")).toEqual({ query: "@nobody" });
	});
});

describe("fuzzyScore", () => {
	it("returns 0 for an empty query", () => {
		expect(fuzzyScore("", "anything")).toBe(0);
	});

	it("returns null when characters do not match in order", () => {
		expect(fuzzyScore("xyz", "hello")).toBeNull();
	});

	it("returns a finite score for a subsequence match", () => {
		const score = fuzzyScore("hlo", "hello");
		expect(score).not.toBeNull();
		expect(typeof score).toBe("number");
	});

	it("prefers tighter matches over scattered matches", () => {
		const tight = fuzzyScore("foo", "foobar") ?? Number.POSITIVE_INFINITY;
		const loose = fuzzyScore("foo", "fabczxo") ?? Number.POSITIVE_INFINITY;
		expect(tight).toBeLessThan(loose);
	});
});

describe("browseSearch", () => {
	it("returns an empty array for an empty library and no discoverable", () => {
		const out = browseSearch(emptyConfig());
		expect(out).toEqual([]);
	});

	it("ranks installed entries above library-only entries", () => {
		const config = configWith({
			servers: [server("alpha", true), server("beta", false)],
		});
		const out = browseSearch(config, { query: "a" });
		const alpha = out.find((r) => r.name === "alpha");
		const beta = out.find((r) => r.name === "beta");
		expect(alpha?.installState).toBe("installed");
		expect(beta?.installState).toBe("library");
		// alpha must appear before beta in the ranking
		expect(out.findIndex((r) => r.name === "alpha")).toBeLessThan(
			out.findIndex((r) => r.name === "beta"),
		);
	});

	it("ranks library entries above discoverable entries", () => {
		const config = configWith({ servers: [server("alpha", false)] });
		const out = browseSearch(config, {
			query: "a",
			discoverable: [
				{
					name: "apricot",
					type: "server",
					marketplace: "acme",
					installCommand: "ensemble pull acme/apricot",
				},
			],
		});
		const alphaIdx = out.findIndex((r) => r.name === "alpha");
		const apricotIdx = out.findIndex((r) => r.name === "apricot");
		expect(out[alphaIdx]?.installState).toBe("library");
		expect(out[apricotIdx]?.installState).toBe("discoverable");
		expect(alphaIdx).toBeLessThan(apricotIdx);
	});

	it("applies the --type filter", () => {
		const config = configWith({
			servers: [server("alpha", true)],
			skills: [
				{
					name: "beta",
					enabled: true,
					description: "",
					path: "",
					origin: "manual",
					dependencies: [],
					tags: [],
					mode: "pin",
				},
			],
		});
		const out = browseSearch(config, { query: "", type: "skill" });
		expect(out.map((r) => r.name)).toEqual(["beta"]);
	});

	it("applies the --marketplace filter via option", () => {
		const config = configWith({
			plugins: [
				{ name: "one", marketplace: "acme", enabled: true, managed: true },
				{ name: "two", marketplace: "other", enabled: true, managed: true },
			],
		});
		const out = browseSearch(config, { marketplace: "acme" });
		expect(out.map((r) => r.name)).toEqual(["one"]);
	});

	it("applies the @marketplace/ filter inline from the query", () => {
		const config = configWith({
			plugins: [
				{ name: "one", marketplace: "acme", enabled: true, managed: true },
				{ name: "two", marketplace: "other", enabled: true, managed: true },
			],
		});
		const out = browseSearch(config, { query: "@acme/" });
		expect(out.map((r) => r.name)).toEqual(["one"]);
	});

	it("returns discoverable install commands unchanged", () => {
		const out = browseSearch(emptyConfig(), {
			query: "x",
			discoverable: [
				{
					name: "xylophone",
					type: "skill",
					marketplace: "acme",
					installCommand: "ensemble pull acme/xylophone",
				},
			],
		});
		expect(out[0]?.installCommand).toBe("ensemble pull acme/xylophone");
	});

	it("honours the limit option", () => {
		const names = ["apple", "apricot", "avocado", "acai", "artichoke"];
		const config = configWith({
			servers: names.map((n) => server(n, true)),
		});
		const out = browseSearch(config, { query: "a", limit: 2 });
		expect(out).toHaveLength(2);
	});

	it("returns same engine output for CLI and desktop (pure function)", () => {
		const config = configWith({ servers: [server("alpha", true)] });
		const a = browseSearch(config, { query: "a" });
		const b = browseSearch(config, { query: "a" });
		expect(a).toEqual(b);
	});

	it("ranks better fuzzy matches ahead of worse matches within the same tier", () => {
		const config = configWith({
			servers: [server("alphaxxxxx", true), server("alpha", true)],
		});
		const out = browseSearch(config, { query: "alpha" });
		expect(out[0]?.name).toBe("alpha");
	});
});
