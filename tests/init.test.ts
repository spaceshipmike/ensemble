import { describe, expect, it } from "vitest";
import {
	detectClientLandscape,
	scanServerLandscape,
	scanSkillLandscape,
	importSelectedServers,
} from "../src/init.js";
import { createConfig } from "../src/config.js";

describe("detectClientLandscape", () => {
	it("returns all client definitions with install status", () => {
		const landscape = detectClientLandscape();
		expect(landscape.length).toBeGreaterThan(0);
		for (const client of landscape) {
			expect(client.def).toBeDefined();
			expect(client.def.id).toBeTruthy();
			expect(typeof client.installed).toBe("boolean");
			expect(typeof client.supportsSkills).toBe("boolean");
		}
	});

	it("marks skills support correctly", () => {
		const landscape = detectClientLandscape();
		const claudeCode = landscape.find((c) => c.def.id === "claude-code");
		expect(claudeCode?.supportsSkills).toBe(true);

		const claudeDesktop = landscape.find((c) => c.def.id === "claude-desktop");
		expect(claudeDesktop?.supportsSkills).toBe(false);
	});
});

describe("scanServerLandscape", () => {
	it("returns server landscape from detected clients", () => {
		const clients = detectClientLandscape();
		const servers = scanServerLandscape(clients);
		// On a real dev machine, there should be some servers
		expect(Array.isArray(servers)).toBe(true);
		for (const s of servers) {
			expect(s.name).toBeTruthy();
			expect(s.foundIn.length).toBeGreaterThan(0);
		}
	});

	it("deduplicates servers across clients", () => {
		const clients = detectClientLandscape();
		const servers = scanServerLandscape(clients);
		const names = servers.map((s) => s.name);
		const unique = new Set(names);
		expect(names.length).toBe(unique.size); // No duplicates
	});
});

describe("scanSkillLandscape", () => {
	it("returns skill landscape", () => {
		const clients = detectClientLandscape();
		const skills = scanSkillLandscape(clients);
		expect(Array.isArray(skills)).toBe(true);
	});
});

describe("importSelectedServers", () => {
	it("imports servers into config", () => {
		const config = createConfig();
		const servers = [
			{ name: "test-server", command: "echo", args: ["hello"], foundIn: ["cursor"] },
		];
		const { config: newConfig, count } = importSelectedServers(config, servers);
		expect(count).toBe(1);
		expect(newConfig.servers.length).toBe(1);
		expect(newConfig.servers[0]?.name).toBe("test-server");
	});

	it("skips already-existing servers", () => {
		const config = createConfig();
		const servers = [
			{ name: "test-server", command: "echo", args: [], foundIn: ["cursor"] },
		];
		const { config: config1 } = importSelectedServers(config, servers);
		const { config: config2, count } = importSelectedServers(config1, servers);
		expect(count).toBe(0);
		expect(config2.servers.length).toBe(1);
	});
});
