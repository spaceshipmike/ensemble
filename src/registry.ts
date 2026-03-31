/**
 * Registry adapter framework — search, show, install across extensible backends.
 *
 * Two built-in adapters: Official MCP Registry and Glama.
 * Uses TTL-based file caching to avoid repeated network calls.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR } from "./config.js";

const OFFICIAL_BASE = "https://registry.modelcontextprotocol.io/v0";
const GLAMA_BASE = "https://glama.ai/api/mcp/v1";
const TIMEOUT_MS = 10_000;

// --- Result types ---

export interface RegistryServer {
	name: string;
	description: string;
	source: "official" | "glama" | "skills-catalog";
	transport: string;
	qualifiedId: string;
	stars: number;
	lastUpdated: string;
	hasReadme: boolean;
	installs: number;
}

export interface EnvVarSpec {
	name: string;
	description: string;
	required: boolean;
}

export interface ServerDetail {
	name: string;
	description: string;
	source: string;
	transport: string;
	homepage: string;
	envVars: EnvVarSpec[];
	tools: string[];
	toolsRawChars: number;
	registryType: string; // "npm", "pypi", "oci"
	packageIdentifier: string;
	packageArgs: string[];
	stars: number;
	lastUpdated: string;
	hasReadme: boolean;
	installs: number;
}

export function securitySummary(detail: ServerDetail): {
	command: string;
	envVars: { name: string; required: boolean }[];
	riskFlags: string[];
	toolCount: number;
	transport: string;
} {
	const flags: string[] = [];
	if (detail.envVars.some((ev) => /SECRET|TOKEN|PASSWORD|API_KEY/i.test(ev.name))) {
		flags.push("requires-secrets");
	}
	if (["sse", "http", "streamable-http"].includes(detail.transport)) {
		flags.push("network-transport");
	}
	if (detail.tools.length > 20) {
		flags.push("many-tools");
	}
	return {
		command: detail.packageIdentifier || "(unknown)",
		envVars: detail.envVars.map((ev) => ({ name: ev.name, required: ev.required })),
		riskFlags: flags,
		toolCount: detail.tools.length,
		transport: detail.transport,
	};
}

export function estimatedTokenCost(detail: ServerDetail): number {
	if (detail.toolsRawChars > 0) return Math.floor(detail.toolsRawChars / 4);
	return detail.tools.length * 200;
}

// --- Cache ---

function cacheKey(prefix: string, query: string): string {
	const h = createHash("sha256").update(`${prefix}:${query}`).digest("hex").slice(0, 16);
	return `${prefix}_${h}.json`;
}

function readCache(key: string, ttl: number): unknown | null {
	const path = join(CACHE_DIR, key);
	if (!existsSync(path)) return null;
	try {
		const data = JSON.parse(readFileSync(path, "utf-8")) as { timestamp: number; payload: unknown };
		if (Date.now() / 1000 - data.timestamp > ttl) {
			unlinkSync(path);
			return null;
		}
		return data.payload;
	} catch {
		return null;
	}
}

function writeCache(key: string, payload: unknown): void {
	mkdirSync(CACHE_DIR, { recursive: true });
	try {
		writeFileSync(
			join(CACHE_DIR, key),
			JSON.stringify({ timestamp: Date.now() / 1000, payload }),
			"utf-8",
		);
	} catch {
		// Cache write failure is non-fatal
	}
}

export function clearCache(): number {
	if (!existsSync(CACHE_DIR)) return 0;
	let count = 0;
	for (const f of readdirSync(CACHE_DIR)) {
		if (f.endsWith(".json")) {
			unlinkSync(join(CACHE_DIR, f));
			count++;
		}
	}
	return count;
}

// --- Adapter interface ---

export interface RegistryAdapter {
	name: string;
	baseUrl: string;
	search(query: string, limit?: number, useCache?: boolean, cacheTtl?: number): Promise<RegistryServer[]>;
	show(serverId: string, useCache?: boolean, cacheTtl?: number): Promise<ServerDetail | null>;
}

// --- Official MCP Registry ---

export const officialAdapter: RegistryAdapter = {
	name: "official",
	baseUrl: OFFICIAL_BASE,

	async search(query, limit = 20, useCache = true, cacheTtl = 3600) {
		const key = cacheKey("official_search", `${query}:${limit}`);
		if (useCache) {
			const cached = readCache(key, cacheTtl);
			if (cached) return cached as RegistryServer[];
		}

		try {
			const url = `${OFFICIAL_BASE}/servers?${new URLSearchParams({ search: query, limit: String(limit) })}`;
			const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
			if (!resp.ok) return [];
			const data = await resp.json();
			const servers = Array.isArray(data) ? data : (data as Record<string, unknown>)["servers"] ?? [];

			const results: RegistryServer[] = (servers as Record<string, unknown>[]).map((s) => {
				const name = (s["name"] as string) || (s["qualifiedName"] as string) || "";
				const desc = ((s["description"] as string) || "").slice(0, 120);
				const packages = (s["packages"] as Record<string, unknown>[]) || [];
				let transport = "stdio";
				if (packages[0]) {
					const t = packages[0]["transport"];
					if (typeof t === "object" && t !== null) transport = (t as Record<string, string>)["type"] || "stdio";
				}
				return {
					name, description: desc, source: "official" as const, transport,
					qualifiedId: name, stars: 0, lastUpdated: "", hasReadme: false, installs: 0,
				};
			});

			if (useCache && results.length > 0) writeCache(key, results);
			return results;
		} catch {
			return [];
		}
	},

	async show(serverId, useCache = true, cacheTtl = 3600) {
		const key = cacheKey("official_show", serverId);
		if (useCache) {
			const cached = readCache(key, cacheTtl);
			if (cached) return cached as ServerDetail;
		}

		try {
			const url = `${OFFICIAL_BASE}/servers?${new URLSearchParams({ search: serverId, limit: "5" })}`;
			const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
			if (!resp.ok) return null;
			const data = await resp.json();
			const servers = (Array.isArray(data) ? data : (data as Record<string, unknown>)["servers"] ?? []) as Record<string, unknown>[];

			const match = servers.find((s) => {
				const n = (s["name"] as string) || (s["qualifiedName"] as string) || "";
				return n === serverId || n.endsWith(`/${serverId}`);
			}) || servers[0];
			if (!match) return null;

			const detail = parseOfficialDetail(match);
			if (useCache) writeCache(key, detail);
			return detail;
		} catch {
			return null;
		}
	},
};

function parseOfficialDetail(s: Record<string, unknown>): ServerDetail {
	const name = (s["name"] as string) || (s["qualifiedName"] as string) || "";
	const packages = (s["packages"] as Record<string, unknown>[]) || [];
	const pkg = packages[0] || {};
	const envVars: EnvVarSpec[] = ((pkg["environmentVariables"] as Record<string, unknown>[]) || []).map((ev) => ({
		name: (ev["name"] as string) || "",
		description: (ev["description"] as string) || "",
		required: ev["required"] === true,
	}));
	const transportInfo = pkg["transport"];
	const transport = typeof transportInfo === "object" && transportInfo !== null
		? (transportInfo as Record<string, string>)["type"] || "stdio"
		: "stdio";

	return {
		name,
		description: (s["description"] as string) || "",
		source: "official",
		transport,
		homepage: typeof s["repository"] === "object" && s["repository"] !== null
			? ((s["repository"] as Record<string, string>)["url"] || "")
			: "",
		envVars,
		tools: ((s["tools"] as Record<string, unknown>[]) || []).map((t) => (t["name"] as string) || ""),
		toolsRawChars: 0,
		registryType: (pkg["registryType"] as string) || "",
		packageIdentifier: (pkg["identifier"] as string) || (pkg["name"] as string) || "",
		packageArgs: ((pkg["packageArguments"] as Record<string, unknown>[]) || []).map((a) => (a["name"] as string) || ""),
		stars: 0,
		lastUpdated: "",
		hasReadme: false,
		installs: 0,
	};
}

// --- Glama ---

export const glamaAdapter: RegistryAdapter = {
	name: "glama",
	baseUrl: GLAMA_BASE,

	async search(query, limit = 20, useCache = true, cacheTtl = 3600) {
		const key = cacheKey("glama_search", `${query}:${limit}`);
		if (useCache) {
			const cached = readCache(key, cacheTtl);
			if (cached) return cached as RegistryServer[];
		}

		try {
			const url = `${GLAMA_BASE}/servers?${new URLSearchParams({ query, first: String(limit) })}`;
			const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
			if (!resp.ok) return [];
			const data = await resp.json() as Record<string, unknown>;

			// Glama uses GraphQL-style edges/nodes structure
			let serversRaw: Record<string, unknown>[] = [];
			if (data["data"]) {
				const edges = ((data["data"] as Record<string, unknown>)["servers"] as Record<string, unknown>)?.["edges"] as Record<string, unknown>[] ?? [];
				serversRaw = edges.map((e) => (e["node"] as Record<string, unknown>) ?? e);
			} else if (data["servers"]) {
				serversRaw = data["servers"] as Record<string, unknown>[];
			} else if (data["edges"]) {
				serversRaw = (data["edges"] as Record<string, unknown>[]).map((e) => (e["node"] as Record<string, unknown>) ?? e);
			} else if (Array.isArray(data)) {
				serversRaw = data as Record<string, unknown>[];
			}

			const results: RegistryServer[] = serversRaw.map((s) => {
				const name = (s["name"] as string) || (s["slug"] as string) || "";
				const namespace = (s["namespace"] as string) || "";
				const qualified = namespace ? `${namespace}/${name}` : name;
				let transport = "stdio";
				const attrs = s["attributes"] as string[] | undefined;
				if (Array.isArray(attrs) && attrs.some((a) => typeof a === "string" && a.toLowerCase().includes("remote"))) {
					transport = "http";
				}
				return {
					name: qualified || name,
					description: ((s["description"] as string) || "").slice(0, 120),
					source: "glama" as const,
					transport,
					qualifiedId: qualified || name,
					stars: 0,
					lastUpdated: "",
					hasReadme: false,
					installs: 0,
				};
			});

			if (useCache && results.length > 0) writeCache(key, results);
			return results;
		} catch {
			return [];
		}
	},

	async show(serverId, useCache = true, cacheTtl = 3600) {
		const key = cacheKey("glama_show", serverId);
		if (useCache) {
			const cached = readCache(key, cacheTtl);
			if (cached) return cached as ServerDetail;
		}

		try {
			const url = `${GLAMA_BASE}/servers/${encodeURIComponent(serverId)}`;
			const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
			if (!resp.ok) return null;
			const s = (await resp.json()) as Record<string, unknown>;

			const name = (s["name"] as string) || (s["slug"] as string) || "";
			const namespace = (s["namespace"] as string) || "";
			const qualified = namespace ? `${namespace}/${name}` : name;

			// Parse environmentVariablesJsonSchema (JSON Schema format)
			const envVars: EnvVarSpec[] = [];
			const envSchema = s["environmentVariablesJsonSchema"] as Record<string, unknown> | undefined;
			if (envSchema && typeof envSchema === "object") {
				const props = (envSchema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
				const requiredKeys = (envSchema["required"] ?? []) as string[];
				for (const [key, val] of Object.entries(props)) {
					envVars.push({
						name: key,
						description: (val["description"] as string) || "",
						required: requiredKeys.includes(key),
					});
				}
			}

			// Parse tools with raw char counting
			const tools: string[] = [];
			let toolsRawChars = 0;
			for (const tool of (s["tools"] as Record<string, unknown>[]) ?? []) {
				if (typeof tool === "object" && tool !== null) {
					tools.push((tool["name"] as string) || "");
					toolsRawChars += JSON.stringify(tool).length;
				}
			}

			const homepage = (s["url"] as string) ||
				(typeof s["repository"] === "object" && s["repository"] !== null
					? ((s["repository"] as Record<string, string>)["url"] || "")
					: "");

			const detail: ServerDetail = {
				name: qualified,
				description: (s["description"] as string) || "",
				source: "glama",
				transport: "stdio",
				homepage,
				envVars,
				tools,
				toolsRawChars,
				registryType: "",
				packageIdentifier: "",
				packageArgs: [],
				stars: 0,
				lastUpdated: "",
				hasReadme: false,
				installs: 0,
			};

			if (useCache) writeCache(key, detail);
			return detail;
		} catch {
			return null;
		}
	},
};

// --- Multi-registry search ---

const defaultAdapters: RegistryAdapter[] = [officialAdapter, glamaAdapter];

export async function searchRegistries(
	query: string,
	options?: { limit?: number; useCache?: boolean; cacheTtl?: number; adapters?: RegistryAdapter[] },
): Promise<RegistryServer[]> {
	const adapters = options?.adapters ?? defaultAdapters;
	const results = await Promise.allSettled(
		adapters.map((a) => a.search(query, options?.limit ?? 20, options?.useCache ?? true, options?.cacheTtl ?? 3600)),
	);

	const merged: RegistryServer[] = [];
	const seen = new Set<string>();
	for (const r of results) {
		if (r.status === "fulfilled") {
			for (const server of r.value) {
				if (!seen.has(server.name)) {
					seen.add(server.name);
					merged.push(server);
				}
			}
		}
	}
	return merged.slice(0, options?.limit ?? 20);
}

export async function showRegistry(
	serverId: string,
	options?: { useCache?: boolean; cacheTtl?: number; adapters?: RegistryAdapter[] },
): Promise<ServerDetail | null> {
	const adapters = options?.adapters ?? defaultAdapters;
	for (const adapter of adapters) {
		const detail = await adapter.show(serverId, options?.useCache ?? true, options?.cacheTtl ?? 3600);
		if (detail) return detail;
	}
	return null;
}

/** List available registry backends. */
export function listBackends(adapters?: RegistryAdapter[]): { name: string; baseUrl: string }[] {
	return (adapters ?? defaultAdapters).map((a) => ({ name: a.name, baseUrl: a.baseUrl }));
}

/** Resolve registry metadata to Ensemble server params for install. */
export function resolveInstallParams(detail: ServerDetail): {
	command: string;
	args: string[];
	transport: string;
} {
	const { registryType, packageIdentifier } = detail;
	if (registryType === "npm") {
		return { command: "npx", args: ["-y", packageIdentifier, ...detail.packageArgs], transport: detail.transport };
	}
	if (registryType === "pypi") {
		return { command: "uvx", args: [packageIdentifier, ...detail.packageArgs], transport: detail.transport };
	}
	return { command: packageIdentifier, args: detail.packageArgs, transport: detail.transport };
}
