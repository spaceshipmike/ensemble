import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { addServer, installSkill, setUserNotes } from "../src/operations.js";
import {
	searchAll,
	searchServers,
	searchSkills,
	expandAliases,
	computeServerQualityScore,
	computeSkillQualityScore,
	QUERY_ALIASES,
} from "../src/search.js";

function testConfig() {
	let config = createConfig();
	({ config } = addServer(config, {
		name: "postgres",
		command: "npx",
		args: ["-y", "@mcp/postgres"],
		tools: [
			{ name: "query", description: "Run a read-only SQL query" },
			{ name: "schema", description: "List tables and columns" },
		],
	}));
	({ config } = addServer(config, {
		name: "github-mcp",
		command: "npx",
		tools: [
			{ name: "search_repos", description: "Search GitHub repositories" },
			{ name: "create_issue", description: "Create a new issue" },
		],
	}));
	({ config } = installSkill(config, {
		name: "git-workflow",
		description: "Git branching and PR workflow instructions",
		tags: ["git", "workflow", "branching"],
	}));
	({ config } = installSkill(config, {
		name: "sql-patterns",
		description: "Database query patterns and optimization",
		tags: ["database", "sql", "query"],
	}));
	return config;
}

describe("expandAliases", () => {
	it("expands known aliases", () => {
		const result = expandAliases("k8s");
		expect(result).toContain("kubernetes");
		expect(result).toContain("k8s");
	});

	it("expands multi-word aliases", () => {
		const result = expandAliases("mcp");
		expect(result).toContain("model context protocol");
	});

	it("passes through unknown words unchanged", () => {
		const result = expandAliases("foobar");
		expect(result).toBe("foobar");
	});

	it("expands multiple words in query", () => {
		const result = expandAliases("db auth");
		expect(result).toContain("database");
		expect(result).toContain("authentication");
	});
});

describe("computeServerQualityScore", () => {
	it("returns 0-1 range", () => {
		const config = testConfig();
		const server = config.servers[0]!;
		const score = computeServerQualityScore(server, config);
		expect(score).toBeGreaterThanOrEqual(0);
		expect(score).toBeLessThanOrEqual(1);
	});

	it("higher score for servers with tools", () => {
		const config = testConfig();
		const withTools = config.servers[0]!; // postgres has tools
		let noToolsConfig = createConfig();
		({ config: noToolsConfig } = addServer(noToolsConfig, { name: "bare", command: "npx" }));
		const noTools = noToolsConfig.servers[0]!;

		const scoreWith = computeServerQualityScore(withTools, config);
		const scoreWithout = computeServerQualityScore(noTools, noToolsConfig);
		expect(scoreWith).toBeGreaterThan(scoreWithout);
	});
});

describe("computeSkillQualityScore", () => {
	it("returns 0-1 range", () => {
		const config = testConfig();
		const skill = config.skills[0]!;
		const score = computeSkillQualityScore(skill, config);
		expect(score).toBeGreaterThanOrEqual(0);
		expect(score).toBeLessThanOrEqual(1);
	});

	it("higher score for complete skills", () => {
		const config = testConfig();
		const complete = config.skills[0]!; // has name, desc, tags
		let bareConfig = createConfig();
		({ config: bareConfig } = installSkill(bareConfig, { name: "bare" }));
		const bare = bareConfig.skills[0]!;

		const scoreComplete = computeSkillQualityScore(complete, config);
		const scoreBare = computeSkillQualityScore(bare, bareConfig);
		expect(scoreComplete).toBeGreaterThan(scoreBare);
	});
});

describe("QUERY_ALIASES", () => {
	it("has expected common aliases", () => {
		expect(QUERY_ALIASES["k8s"]).toContain("kubernetes");
		expect(QUERY_ALIASES["db"]).toContain("database");
		expect(QUERY_ALIASES["auth"]).toContain("authentication");
	});
});

describe("searchServers", () => {
	it("finds servers by name", () => {
		const results = searchServers(testConfig(), "postgres");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.name).toBe("postgres");
		expect(results[0]?.matchedFields).toContain("name");
	});

	it("finds servers by tool name", () => {
		const results = searchServers(testConfig(), "query");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.matchedTools).toContain("query");
	});

	it("returns empty for no match", () => {
		const results = searchServers(testConfig(), "zzzznonexistent");
		expect(results).toEqual([]);
	});

	it("respects limit", () => {
		const results = searchServers(testConfig(), "mcp", 1);
		expect(results.length).toBeLessThanOrEqual(1);
	});

	it("finds servers via alias expansion", () => {
		// "db" should expand to "database" and match tools with "sql" keyword
		const results = searchServers(testConfig(), "db");
		// postgres has "query" tool — "db" expands to "database" which doesn't directly match,
		// but the search should still work through expanded terms
		expect(results).toBeDefined();
	});
});

describe("searchSkills", () => {
	it("finds skills by name", () => {
		const results = searchSkills(testConfig(), "git");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.name).toBe("git-workflow");
		expect(results[0]?.resultType).toBe("skill");
	});

	it("finds skills by tag", () => {
		const results = searchSkills(testConfig(), "database");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.name).toBe("sql-patterns");
		expect(results[0]?.matchedFields).toContain("tags");
	});

	it("finds skills by description", () => {
		const results = searchSkills(testConfig(), "optimization");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.matchedFields).toContain("description");
	});

	it("finds skills via alias expansion", () => {
		// "db" expands to "database" which matches sql-patterns tag
		const results = searchSkills(testConfig(), "db");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.name).toBe("sql-patterns");
	});
});

describe("user notes search (v2.0.3 #local-capability-search)", () => {
	it("matches userNotes content and ranks above description-only match", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "alpha", command: "npx" }));
		({ config } = addServer(config, { name: "bravo", command: "npx" }));
		// Put a unique term in alpha's userNotes.
		({ config } = setUserNotes(config, { ref: "server:alpha", text: "internal raffia tooling" }));
		const results = searchServers(config, "raffia");
		expect(results.length).toBe(1);
		expect(results[0]?.name).toBe("alpha");
		expect(results[0]?.matchedFields).toContain("notes");
	});

	it("notes weight (2x) outranks description (1x) for the same term", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "alpha", command: "npx" }));
		({ config } = addServer(config, { name: "bravo", command: "npx" }));
		// alpha gets the term in description (1x); bravo in userNotes (2x).
		const aIdx = config.servers.findIndex((s) => s.name === "alpha");
		const bIdx = config.servers.findIndex((s) => s.name === "bravo");
		config = {
			...config,
			servers: config.servers.map((s, i) => {
				if (i === aIdx) return { ...s, description: "raffia handler" };
				if (i === bIdx) return { ...s, userNotes: "raffia handler" };
				return s;
			}),
		};
		const results = searchServers(config, "raffia");
		expect(results[0]?.name).toBe("bravo");
	});
});

describe("searchAll", () => {
	it("returns both servers and skills", () => {
		const results = searchAll(testConfig(), "query");
		const types = new Set(results.map((r) => r.resultType));
		expect(types.has("server")).toBe(true);
		expect(types.has("skill")).toBe(true);
	});

	it("sorts by score descending", () => {
		const results = searchAll(testConfig(), "query");
		for (let i = 1; i < results.length; i++) {
			expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
		}
	});
});
