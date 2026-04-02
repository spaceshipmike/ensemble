import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { addServer, installSkill } from "../src/operations.js";
import { runDoctor } from "../src/doctor.js";

describe("runDoctor", () => {
	it("returns structured result for empty config", () => {
		const result = runDoctor(createConfig());
		// Empty config may still find orphaned entries on the real filesystem
		expect(typeof result.errors).toBe("number");
		expect(typeof result.warnings).toBe("number");
		expect(typeof result.scorePercent).toBe("number");
		expect(result.scorePercent).toBeLessThanOrEqual(100);
	});

	it("returns structured result", () => {
		const result = runDoctor(createConfig());
		expect(typeof result.totalPoints).toBe("number");
		expect(typeof result.earnedPoints).toBe("number");
		expect(typeof result.scorePercent).toBe("number");
		expect(Array.isArray(result.checks)).toBe(true);
	});

	it("detects missing env vars", () => {
		let config = createConfig();
		({ config } = addServer(config, {
			name: "postgres",
			command: "npx",
			env: { DATABASE_URL: "" },
		}));
		const result = runDoctor(config);
		const envCheck = result.checks.find((c) => c.id === "env-vars");
		expect(envCheck).toBeDefined();
		expect(envCheck?.severity).toBe("error");
		expect(envCheck?.message).toContain("DATABASE_URL");
	});

	it("detects unresolved skill dependencies", () => {
		let config = createConfig();
		({ config } = installSkill(config, {
			name: "git-workflow",
			dependencies: ["github-mcp"],
		}));
		const result = runDoctor(config);
		const depCheck = result.checks.find((c) => c.id === "unresolved-skill-dep");
		expect(depCheck).toBeDefined();
		expect(depCheck?.severity).toBe("info");
		expect(depCheck?.message).toContain("github-mcp");
	});

	it("check results include fix suggestions", () => {
		let config = createConfig();
		config = {
			...config,
			clients: [{ id: "cursor", group: null, last_synced: null, projects: {}, server_hashes: {} }],
		};
		const result = runDoctor(config);
		const staleCheck = result.checks.find((c) => c.id === "stale-config");
		expect(staleCheck).toBeDefined();
		expect(staleCheck?.fix?.command).toContain("ensemble sync");
	});

	it("warns on missing skill description", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "bare-skill" }));
		const result = runDoctor(config);
		const check = result.checks.find(
			(c) => c.id === "skill-frontmatter-completeness" && c.message.includes("no description"),
		);
		expect(check).toBeDefined();
		expect(check?.severity).toBe("warning");
	});

	it("info on missing skill tags", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "no-tags", description: "A skill" }));
		const result = runDoctor(config);
		const check = result.checks.find(
			(c) => c.id === "skill-frontmatter-completeness" && c.message.includes("no tags"),
		);
		expect(check).toBeDefined();
		expect(check?.severity).toBe("info");
	});

	it("warns on multiline description", () => {
		let config = createConfig();
		({ config } = installSkill(config, {
			name: "multi-desc",
			description: "line one\nline two",
		}));
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "skill-description-format");
		expect(check).toBeDefined();
		expect(check?.message).toContain("multiline");
	});

	it("warns on long description", () => {
		let config = createConfig();
		({ config } = installSkill(config, {
			name: "long-desc",
			description: "x".repeat(150),
		}));
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "skill-description-format");
		expect(check).toBeDefined();
		expect(check?.message).toContain("exceeds 120");
	});

	it("info on non-kebab-case skill name", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "MySkill_v2", description: "test" }));
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "skill-directory-naming");
		expect(check).toBeDefined();
		expect(check?.severity).toBe("info");
	});

	it("warns on skill depending on disabled server", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "db-server", command: "npx" }));
		// Disable the server
		config = {
			...config,
			servers: config.servers.map((s) =>
				s.name === "db-server" ? { ...s, enabled: false } : s,
			),
		};
		({ config } = installSkill(config, {
			name: "db-skill",
			description: "needs db",
			dependencies: ["db-server"],
		}));
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "skill-broken-dependency");
		expect(check).toBeDefined();
		expect(check?.message).toContain("disabled server");
	});

	it("detects secrets in server env", () => {
		let config = createConfig();
		({ config } = addServer(config, {
			name: "leaky",
			command: "npx",
			env: { API_KEY: "sk-abcdefghijklmnopqrstuvwxyz1234567890" },
		}));
		const result = runDoctor(config);
		const check = result.checks.find((c) => c.id === "secret-in-env");
		expect(check).toBeDefined();
		expect(check?.severity).toBe("error");
		expect(check?.message).toContain("OpenAI API Key");
	});
});
