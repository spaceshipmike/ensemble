import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import {
	addServer,
	assignClient,
	createGroup,
	addRule,
	saveProfile,
	activateProfile,
	listProfiles,
	showProfile,
	deleteProfile,
} from "../src/operations.js";

function configWithClients() {
	let config = createConfig();
	({ config } = addServer(config, { name: "postgres", command: "npx" }));
	({ config } = createGroup(config, "dev", "Development servers"));
	({ config } = assignClient(config, "cursor", "dev"));
	({ config } = addRule(config, "~/projects", "dev"));
	return config;
}

describe("saveProfile", () => {
	it("saves current config as a profile", () => {
		const config = configWithClients();
		const { config: newConfig, result } = saveProfile(config, "work");
		expect(result.ok).toBe(true);
		expect(result.profile).toBeDefined();
		expect(result.profile?.name).toBe("work");
		expect(newConfig.profiles["work"]).toBeDefined();
		expect(newConfig.profiles["work"]!.clients.length).toBe(1);
		expect(newConfig.profiles["work"]!.rules.length).toBe(1);
	});

	it("overwrites existing profile with same name", () => {
		let config = configWithClients();
		({ config } = saveProfile(config, "work"));
		// Change config and resave
		({ config } = assignClient(config, "claude-code", null, { assignAll: true }));
		const { config: newConfig } = saveProfile(config, "work");
		expect(newConfig.profiles["work"]!.clients.length).toBe(2);
	});
});

describe("activateProfile", () => {
	it("swaps clients, rules, and settings", () => {
		let config = configWithClients();
		// Save profile
		({ config } = saveProfile(config, "work"));
		// Modify config
		({ config } = assignClient(config, "claude-code", null, { assignAll: true }));
		expect(config.clients.length).toBe(2);

		// Activate saved profile — should revert to 1 client
		const { config: activated, result } = activateProfile(config, "work");
		expect(result.ok).toBe(true);
		expect(activated.clients.length).toBe(1);
		expect(activated.clients[0]?.id).toBe("cursor");
		expect(activated.activeProfile).toBe("work");
	});

	it("fails for nonexistent profile", () => {
		const { result } = activateProfile(createConfig(), "nope");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("restores rules from profile", () => {
		let config = configWithClients();
		({ config } = saveProfile(config, "with-rules"));
		// Remove rules
		config = { ...config, rules: [] };
		expect(config.rules.length).toBe(0);

		const { config: activated } = activateProfile(config, "with-rules");
		expect(activated.rules.length).toBe(1);
	});
});

describe("listProfiles", () => {
	it("returns message for empty profiles", () => {
		const { result } = listProfiles(createConfig());
		expect(result.messages[0]).toContain("No profiles");
	});

	it("lists saved profiles", () => {
		let config = configWithClients();
		({ config } = saveProfile(config, "work"));
		({ config } = saveProfile(config, "personal"));
		const { result } = listProfiles(config);
		expect(result.messages.length).toBe(2);
		expect(result.messages.some((m) => m.includes("work"))).toBe(true);
		expect(result.messages.some((m) => m.includes("personal"))).toBe(true);
	});

	it("marks active profile", () => {
		let config = configWithClients();
		({ config } = saveProfile(config, "work"));
		({ config } = activateProfile(config, "work"));
		const { result } = listProfiles(config);
		expect(result.messages[0]).toContain("(active)");
	});
});

describe("showProfile", () => {
	it("shows profile details", () => {
		let config = configWithClients();
		({ config } = saveProfile(config, "work"));
		const { result } = showProfile(config, "work");
		expect(result.ok).toBe(true);
		expect(result.profile?.name).toBe("work");
		expect(result.messages.some((m) => m.includes("Clients:"))).toBe(true);
	});

	it("fails for nonexistent profile", () => {
		const { result } = showProfile(createConfig(), "nope");
		expect(result.ok).toBe(false);
	});
});

describe("deleteProfile", () => {
	it("removes a profile", () => {
		let config = configWithClients();
		({ config } = saveProfile(config, "work"));
		expect(Object.keys(config.profiles).length).toBe(1);

		const { config: newConfig, result } = deleteProfile(config, "work");
		expect(result.ok).toBe(true);
		expect(Object.keys(newConfig.profiles).length).toBe(0);
	});

	it("clears activeProfile if deleting active", () => {
		let config = configWithClients();
		({ config } = saveProfile(config, "work"));
		({ config } = activateProfile(config, "work"));
		expect(config.activeProfile).toBe("work");

		const { config: newConfig } = deleteProfile(config, "work");
		expect(newConfig.activeProfile).toBeNull();
	});

	it("fails for nonexistent profile", () => {
		const { result } = deleteProfile(createConfig(), "nope");
		expect(result.ok).toBe(false);
	});
});
