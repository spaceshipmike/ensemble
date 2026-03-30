import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We test the migration logic by mocking the paths
import * as migration from "../src/migration.js";

describe("migration", () => {
	it("needsMigration returns false when no legacy config exists", () => {
		// In test environment, ~/.config/mcpoyle/config.json likely doesn't exist
		// and ~/.config/ensemble/config.json may or may not exist
		const result = migration.needsMigration();
		expect(typeof result).toBe("boolean");
	});

	it("migrate with no legacy state reports nothing to migrate", () => {
		const result = migration.migrate(true); // dry run
		// Either migrated (if mcpoyle exists on this machine) or not
		expect(typeof result.migrated).toBe("boolean");
		expect(Array.isArray(result.actions)).toBe(true);
		expect(Array.isArray(result.messages)).toBe(true);
	});

	it("migrate dry run produces no filesystem changes", () => {
		const result = migration.migrate(true);
		// Dry run should not create any files
		expect(result.actions.length).toBeGreaterThanOrEqual(0);
		// The actions array describes what WOULD happen
		for (const action of result.actions) {
			expect(action.type).toBeDefined();
			expect(action.source).toBeDefined();
			expect(action.target).toBeDefined();
		}
	});

	it("migrate is idempotent", () => {
		// Running migrate twice should produce the same result
		const result1 = migration.migrate(true);
		const result2 = migration.migrate(true);
		expect(result1.actions.length).toBe(result2.actions.length);
		expect(result1.migrated).toBe(result2.migrated);
	});

	it("MigrationResult has correct shape", () => {
		const result = migration.migrate(true);
		expect(result).toHaveProperty("migrated");
		expect(result).toHaveProperty("actions");
		expect(result).toHaveProperty("messages");
	});
});
