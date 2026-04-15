/**
 * Re-import preservation contract (v2.0.3 #notes-and-descriptions).
 *
 * When upstream metadata is re-imported, the source-owned `description` field
 * is overwritten and `lastDescriptionHash` is updated. The user-owned
 * `userNotes` field MUST NEVER be touched. This file pins that contract for
 * servers, skills, and plugins.
 */

import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import {
	addServer,
	descriptionHash,
	installPlugin,
	installSkill,
	addMarketplace,
	refreshDescriptions,
	setUserNotes,
} from "../src/operations.js";

describe("refreshDescriptions preserves userNotes (re-import contract)", () => {
	it("server: refresh updates description, leaves userNotes alone", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		({ config } = setUserNotes(config, { ref: "server:ctx", text: "trusted local" }));

		const { config: next, result } = refreshDescriptions(config, [
			{ type: "server", name: "ctx", newDescription: "Context server v2" },
		]);
		expect(result.ok).toBe(true);
		const server = next.servers.find((s) => s.name === "ctx");
		expect(server?.description).toBe("Context server v2");
		expect(server?.userNotes).toBe("trusted local");
		expect(server?.lastDescriptionHash).toBe(descriptionHash("Context server v2"));
		expect(result.refreshed[0]?.changed).toBe(true);
	});

	it("skill: refresh updates description, leaves userNotes alone", () => {
		let config = createConfig();
		({ config } = installSkill(config, { name: "writer", description: "old text" }));
		({ config } = setUserNotes(config, { ref: "skill:writer", text: "preferred for ADRs" }));

		const { config: next, result } = refreshDescriptions(config, [
			{ type: "skill", name: "writer", newDescription: "new frontmatter text" },
		]);
		expect(result.ok).toBe(true);
		const skill = next.skills.find((s) => s.name === "writer");
		expect(skill?.description).toBe("new frontmatter text");
		expect(skill?.userNotes).toBe("preferred for ADRs");
	});

	it("plugin: refresh updates description, leaves userNotes alone", () => {
		let config = createConfig();
		({ config } = addMarketplace(config, "official", { source: "directory", path: "/m" }));
		({ config } = installPlugin(config, "fctry", "official"));
		({ config } = setUserNotes(config, { ref: "plugin:fctry@official", text: "internal use only" }));

		const { config: next, result } = refreshDescriptions(config, [
			{ type: "plugin", name: "fctry", marketplace: "official", newDescription: "Factory commands" },
		]);
		expect(result.ok).toBe(true);
		const plugin = next.plugins.find((p) => p.name === "fctry");
		expect(plugin?.description).toBe("Factory commands");
		expect(plugin?.userNotes).toBe("internal use only");
	});

	it("identical re-import marks delta as unchanged on the second pass", () => {
		let config = createConfig();
		({ config } = addServer(config, { name: "ctx", command: "npx" }));
		const first = refreshDescriptions(config, [
			{ type: "server", name: "ctx", newDescription: "v1" },
		]);
		expect(first.result.refreshed[0]?.changed).toBe(true);
		const second = refreshDescriptions(first.config, [
			{ type: "server", name: "ctx", newDescription: "v1" },
		]);
		expect(second.result.refreshed[0]?.changed).toBe(false);
	});

	it("descriptionHash is deterministic and empty-safe", () => {
		expect(descriptionHash("hello")).toBe(descriptionHash("hello"));
		expect(descriptionHash("")).toBe("");
		expect(descriptionHash(undefined)).toBe("");
		expect(descriptionHash("a")).not.toBe(descriptionHash("b"));
	});
});
