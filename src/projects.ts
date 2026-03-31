/**
 * Project registry reader — reads from the project-registry SQLite database.
 *
 * Optional integration. If better-sqlite3 is not installed or the DB doesn't
 * exist, all functions return graceful fallbacks (empty arrays, null).
 */

export interface RegistryProject {
	name: string;
	displayName: string;
	type: string;
	status: string;
	paths: string[];
	fields: Record<string, string>;
}

// biome-ignore lint: dynamic require for optional dependency
// biome-ignore lint: dynamic require for optional dependency
let dbModule: any = null;

/** Check if the project registry database exists. */
export function isAvailable(): boolean {
	const { existsSync } = require("node:fs") as typeof import("node:fs");
	const { homedir } = require("node:os") as typeof import("node:os");
	const { join } = require("node:path") as typeof import("node:path");
	const dbPath = join(homedir(), ".local", "share", "project-registry", "registry.db");
	return existsSync(dbPath);
}

// biome-ignore lint: dynamic require for optional dep
function getDb(): any | null {
	if (dbModule === null) {
		try {
			dbModule = require("better-sqlite3");
		} catch {
			return null;
		}
	}

	const { existsSync } = require("node:fs") as typeof import("node:fs");
	const { homedir } = require("node:os") as typeof import("node:os");
	const { join } = require("node:path") as typeof import("node:path");
	const dbPath = join(homedir(), ".local", "share", "project-registry", "registry.db");
	if (!existsSync(dbPath)) return null;

	try {
		return new (dbModule as any)(dbPath, { readonly: true });
	} catch {
		return null;
	}
}

/** List all projects from the registry. */
export function listProjects(statusFilter?: string): RegistryProject[] {
	const db = getDb();
	if (!db) return [];

	try {
		const query = statusFilter
			? "SELECT id, name, display_name, type, status FROM projects WHERE status = ?"
			: "SELECT id, name, display_name, type, status FROM projects";
		const rows = (statusFilter ? db.prepare(query).all(statusFilter) : db.prepare(query).all()) as {
			id: number;
			name: string;
			display_name: string;
			type: string;
			status: string;
		}[];

		return rows.map((row) => ({
			name: row.name,
			displayName: row.display_name || row.name,
			type: row.type,
			status: row.status,
			paths: getProjectPaths(db, row.id),
			fields: getProjectFields(db, row.id),
		}));
	} catch {
		return [];
	} finally {
		db.close();
	}
}

/** Get a single project by name. */
export function getProject(name: string): RegistryProject | null {
	const db = getDb();
	if (!db) return null;

	try {
		const row = db.prepare("SELECT id, name, display_name, type, status FROM projects WHERE name = ?").get(name) as
			| { id: number; name: string; display_name: string; type: string; status: string }
			| undefined;
		if (!row) return null;

		return {
			name: row.name,
			displayName: row.display_name || row.name,
			type: row.type,
			status: row.status,
			paths: getProjectPaths(db, row.id),
			fields: getProjectFields(db, row.id),
		};
	} catch {
		return null;
	} finally {
		db.close();
	}
}

/** Resolve a project name to its primary filesystem path (prefers ~/Code/ paths). */
export function resolveProjectPath(name: string): string | null {
	const project = getProject(name);
	if (!project || project.paths.length === 0) return null;

	// Prefer paths under ~/Code/ (execution surface)
	const codePaths = project.paths.filter((p) => p.includes("/Code/"));
	if (codePaths.length > 0) return codePaths[0] ?? null;
	return project.paths[0] ?? null;
}

// biome-ignore lint: dynamic type for optional dep
function getProjectPaths(db: any, projectId: number): string[] {
	try {
		const rows = db.prepare("SELECT path FROM project_paths WHERE project_id = ?").all(projectId) as {
			path: string;
		}[];
		return rows.map((r) => r.path);
	} catch {
		return [];
	}
}

// biome-ignore lint: dynamic type for optional dep
function getProjectFields(db: any, projectId: number): Record<string, string> {
	try {
		const rows = db.prepare("SELECT field_name, field_value FROM project_fields WHERE project_id = ?").all(projectId) as {
			field_name: string;
			field_value: string;
		}[];
		const fields: Record<string, string> = {};
		for (const row of rows) {
			fields[row.field_name] = row.field_value;
		}
		return fields;
	} catch {
		return {};
	}
}
