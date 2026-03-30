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
});
