/**
 * Setlist capability reader — reads from @setlist/core's capability registry.
 *
 * Optional integration. If @setlist/core is not installed, all functions
 * return graceful fallbacks (empty arrays, false). Same pattern as projects.ts
 * with better-sqlite3.
 */

export interface SetlistCapability {
	project: string;
	name: string;
	type: string;
	description: string;
	inputs?: string;
	outputs?: string;
	requires_auth?: boolean;
	invocation_model?: string;
	audience?: string;
}

// biome-ignore lint: dynamic import for optional dependency
let registryModule: any = null;
let registryInstance: any = null;
let loadAttempted = false;

function getRegistry(): any | null {
	if (loadAttempted) return registryInstance;
	loadAttempted = true;

	try {
		registryModule = require("@setlist/core");
		registryInstance = new registryModule.Registry();
		return registryInstance;
	} catch {
		return null;
	}
}

/** Check if @setlist/core is available and can connect. */
export function isSetlistAvailable(): boolean {
	return getRegistry() !== null;
}

/** Query capabilities across all projects, optionally filtered. */
export function queryCapabilities(opts?: {
	project_name?: string;
	capability_type?: string;
	keyword?: string;
}): SetlistCapability[] {
	const registry = getRegistry();
	if (!registry) return [];

	try {
		const rows = registry.queryCapabilities(opts) as Record<string, unknown>[];
		return rows.map(toCapability);
	} catch {
		return [];
	}
}

/** Get capabilities for a specific project. */
export function getProjectCapabilities(projectName: string): SetlistCapability[] {
	return queryCapabilities({ project_name: projectName });
}

/** Get all capabilities that declare MCP as their invocation model. */
export function getMcpCapabilities(): SetlistCapability[] {
	return queryCapabilities().filter((c) => c.invocation_model === "MCP");
}

function toCapability(row: Record<string, unknown>): SetlistCapability {
	const cap: SetlistCapability = {
		project: row.project as string,
		name: row.name as string,
		type: row.type as string,
		description: (row.description as string) ?? "",
	};
	if (row.inputs) cap.inputs = row.inputs as string;
	if (row.outputs) cap.outputs = row.outputs as string;
	if (row.requires_auth != null) cap.requires_auth = row.requires_auth as boolean;
	if (row.invocation_model) cap.invocation_model = row.invocation_model as string;
	if (row.audience) cap.audience = row.audience as string;
	return cap;
}

/** Reset the cached registry instance (for testing). */
export function _resetForTesting(): void {
	registryModule = null;
	registryInstance = null;
	loadAttempted = false;
}
