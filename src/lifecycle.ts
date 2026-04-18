// @fctry: #library-first-resource-intake

/**
 * Lifecycle dispatcher — translates the v2.0.1 noun-first verbs
 * (`pull`, `install`, `uninstall`, `remove`, `library ...`) into calls on the
 * existing operations layer.
 *
 * The CLI stays thin: it parses argv, calls one of the functions below, and
 * prints the result. All routing (source-form → adapter, type inference,
 * cascade behaviour) lives here so both the CLI and desktop IPC can share it.
 *
 * ## Source forms accepted by `pull`
 *
 * - `owner/repo`          → marketplace add (GitHub shorthand)
 * - `./path` / absolute   → local library add (type inferred from directory contents)
 * - `registry:<slug>`     → registry add (official/glama lookup)
 * - `https://...`         → marketplace add via git/url source
 *
 * The `--type` flag disambiguates cases where the source form alone is
 * ambiguous (e.g. a local directory that could host either a skill or a
 * plugin manifest).
 */

import { existsSync, readFileSync } from "node:fs";
import { basename as pathBasename, join as pathJoin } from "node:path";
import {
	addMarketplace,
	installPlugin as installPluginOp,
	installSkill as installSkillOp,
} from "./operations.js";
import type { EnsembleConfig, Marketplace, MarketplaceSource, Plugin } from "./schemas.js";

// --- Types ---

export type ResourceType = "server" | "skill" | "plugin" | "agent" | "command" | "hook";

export interface LifecycleResult {
	ok: boolean;
	error?: string;
	messages: string[];
}

export interface PullParams {
	source: string;
	/** Disambiguator when inference can't decide. */
	type?: ResourceType;
	/** Name override for the library entry (defaults to derived from source). */
	name?: string;
}

export interface PullOutcome extends LifecycleResult {
	/** What form the source was routed as. */
	kind?: "marketplace" | "registry" | "local";
	/** The created library entry, when the routing produced one. */
	marketplace?: Marketplace;
	plugin?: Plugin;
}

// --- Source classification ---

const OWNER_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const REGISTRY_RE = /^registry:(.+)$/;
const URL_RE = /^(https?|git|ssh):\/\//;

export type SourceKind = "registry" | "url" | "owner-repo" | "local-path";

export function classifySource(source: string): SourceKind | null {
	if (!source) return null;
	if (REGISTRY_RE.test(source)) return "registry";
	if (URL_RE.test(source)) return "url";
	if (source.startsWith("./") || source.startsWith("../") || source.startsWith("/")) {
		return "local-path";
	}
	if (OWNER_REPO_RE.test(source)) return "owner-repo";
	return null;
}

// --- pull ---

export function pull(
	config: EnsembleConfig,
	params: PullParams,
): { config: EnsembleConfig; result: PullOutcome } {
	const kind = classifySource(params.source);
	if (kind === null) {
		return {
			config,
			result: {
				ok: false,
				error: `Unrecognised source '${params.source}'. Expected owner/repo, ./path, registry:<slug>, or a URL.`,
				messages: [],
			},
		};
	}

	// registry:<slug> → we do not fetch remote metadata from this pure dispatch
	// layer (that call is async and lives in registry.ts). Instead we surface a
	// helpful instruction to use `ensemble registry add <slug>` so the behaviour
	// is explicit. Chunk 8 keeps `pull` routing synchronous; an async wrapper
	// lands with the desktop Registry view in a follow-up.
	if (kind === "registry") {
		const slug = params.source.replace(/^registry:/, "");
		return {
			config,
			result: {
				ok: false,
				error: `Registry sources route through 'ensemble registry add ${slug}' today. Run that and we'll pull the server metadata for you.`,
				messages: [],
				kind: "registry",
			},
		};
	}

	if (kind === "owner-repo") {
		// Default to marketplace add (the common "pull this plugin catalog" flow).
		// `--type` can force a non-marketplace interpretation in the future; for
		// now every owner/repo pull lands as a marketplace.
		const name = params.name ?? sourceToMarketplaceName(params.source);
		const marketplaceSource: MarketplaceSource = {
			source: "github",
			repo: params.source,
			path: "",
			url: "",
		};
		const { config: next, result } = addMarketplace(config, name, marketplaceSource);
		return {
			config: next,
			result: {
				ok: result.ok,
				messages: result.messages,
				...(result.error !== undefined ? { error: result.error } : {}),
				kind: "marketplace",
				...(result.marketplace ? { marketplace: result.marketplace } : {}),
			},
		};
	}

	if (kind === "url") {
		const name = params.name ?? sourceToMarketplaceName(params.source);
		const marketplaceSource: MarketplaceSource = {
			source: params.source.endsWith(".git") ? "git" : "url",
			repo: "",
			path: "",
			url: params.source,
		};
		const { config: next, result } = addMarketplace(config, name, marketplaceSource);
		return {
			config: next,
			result: {
				ok: result.ok,
				messages: result.messages,
				...(result.error !== undefined ? { error: result.error } : {}),
				kind: "marketplace",
				...(result.marketplace ? { marketplace: result.marketplace } : {}),
			},
		};
	}

	// Local path — infer type from contents or honour explicit --type.
	if (kind === "local-path") {
		const localType = params.type ?? inferLocalType(params.source);
		if (!localType) {
			return {
				config,
				result: {
					ok: false,
					error: `Could not infer resource type at '${params.source}'. Pass --type <skill|plugin|agent|command|hook|server>.`,
					messages: [],
					kind: "local",
				},
			};
		}

		if (localType === "skill") {
			const skillPath = pathJoin(params.source, "SKILL.md");
			if (!existsSync(skillPath)) {
				return {
					config,
					result: {
						ok: false,
						error: `Expected SKILL.md at '${skillPath}'.`,
						messages: [],
						kind: "local",
					},
				};
			}
			const name = params.name ?? pathBasename(params.source);
			const { config: next, result } = installSkillOp(config, { name, path: skillPath });
			return {
				config: next,
				result: {
					ok: result.ok,
					messages: result.messages,
					...(result.error !== undefined ? { error: result.error } : {}),
					kind: "local",
				},
			};
		}

		if (localType === "plugin") {
			// A local directory interpreted as a plugin means "drop this directory
			// in the library as a plugin entry". Defer to installPlugin so that
			// registration and marketplace semantics stay in one place.
			const name = params.name ?? pathBasename(params.source);
			const { config: next, result } = installPluginOp(config, name, "local");
			return {
				config: next,
				result: {
					ok: result.ok,
					messages: result.messages,
					...(result.error !== undefined ? { error: result.error } : {}),
					kind: "local",
					...(result.plugin ? { plugin: result.plugin } : {}),
				},
			};
		}

		return {
			config,
			result: {
				ok: false,
				error: `Pull does not yet support local ${localType} sources. Use 'ensemble ${localType}s add' for now.`,
				messages: [],
				kind: "local",
			},
		};
	}

	return {
		config,
		result: {
			ok: false,
			error: `Unhandled source kind '${kind}'.`,
			messages: [],
		},
	};
}

// --- remove (destructive) ---

export interface RemoveParams {
	name: string;
	type?: ResourceType;
}

export interface RemoveOutcome extends LifecycleResult {
	removedType?: ResourceType;
}

/**
 * Remove a resource from the library entirely. The caller has already
 * confirmed with the user (or passed --yes) — this function does not prompt.
 * Cascade uninstall from client configs is handled at the CLI layer because
 * it requires access to on-disk settings; the pure operation only evicts the
 * library entry.
 */
export function remove(
	config: EnsembleConfig,
	params: RemoveParams,
): { config: EnsembleConfig; result: RemoveOutcome } {
	const typeHint = params.type ?? inferLibraryType(config, params.name);
	if (!typeHint) {
		return {
			config,
			result: {
				ok: false,
				error: `'${params.name}' not found in the library. Pass --type <type> to disambiguate.`,
				messages: [],
			},
		};
	}

	if (typeHint === "server") {
		const has = config.servers.some((s) => s.name === params.name);
		if (!has) {
			return {
				config,
				result: { ok: false, error: `Server '${params.name}' not found.`, messages: [] },
			};
		}
		return {
			config: { ...config, servers: config.servers.filter((s) => s.name !== params.name) },
			result: {
				ok: true,
				messages: [`Removed server '${params.name}' from library.`],
				removedType: "server",
			},
		};
	}

	if (typeHint === "plugin") {
		const has = config.plugins.some((p) => p.name === params.name);
		if (!has) {
			return {
				config,
				result: { ok: false, error: `Plugin '${params.name}' not found.`, messages: [] },
			};
		}
		return {
			config: { ...config, plugins: config.plugins.filter((p) => p.name !== params.name) },
			result: {
				ok: true,
				messages: [`Removed plugin '${params.name}' from library.`],
				removedType: "plugin",
			},
		};
	}

	if (typeHint === "skill") {
		const has = config.skills.some((s) => s.name === params.name);
		if (!has) {
			return {
				config,
				result: { ok: false, error: `Skill '${params.name}' not found.`, messages: [] },
			};
		}
		return {
			config: { ...config, skills: config.skills.filter((s) => s.name !== params.name) },
			result: {
				ok: true,
				messages: [`Removed skill '${params.name}' from library.`],
				removedType: "skill",
			},
		};
	}

	if (typeHint === "agent") {
		const agents = config.agents ?? [];
		const has = agents.some((a) => a.name === params.name);
		if (!has) {
			return {
				config,
				result: { ok: false, error: `Agent '${params.name}' not found.`, messages: [] },
			};
		}
		return {
			config: { ...config, agents: agents.filter((a) => a.name !== params.name) },
			result: {
				ok: true,
				messages: [`Removed agent '${params.name}' from library.`],
				removedType: "agent",
			},
		};
	}

	if (typeHint === "command") {
		const commands = config.commands ?? [];
		const has = commands.some((c) => c.name === params.name);
		if (!has) {
			return {
				config,
				result: { ok: false, error: `Command '${params.name}' not found.`, messages: [] },
			};
		}
		return {
			config: { ...config, commands: commands.filter((c) => c.name !== params.name) },
			result: {
				ok: true,
				messages: [`Removed command '${params.name}' from library.`],
				removedType: "command",
			},
		};
	}

	return {
		config,
		result: {
			ok: false,
			error: `Type '${typeHint}' not supported by remove yet.`,
			messages: [],
		},
	};
}

// --- library list / show / pivot ---

export interface LibraryListEntry {
	name: string;
	type: ResourceType;
	installed: boolean;
	source: string;
}

export interface LibraryListParams {
	type?: ResourceType;
	filter?: "installed" | "not-installed";
}

/**
 * Build a flat list of every library entry with an install-state badge.
 * Install state in v2.0.1 is boolean per-entry (derived from `enabled` on
 * existing typed entries and presence in client groups). Per-client/
 * per-project scoping is tracked on the operations layer and surfaced via
 * `library show`.
 */
export function libraryList(
	config: EnsembleConfig,
	params: LibraryListParams = {},
): LibraryListEntry[] {
	const out: LibraryListEntry[] = [];
	const push = (name: string, type: ResourceType, installed: boolean, source: string) => {
		if (params.type && params.type !== type) return;
		if (params.filter === "installed" && !installed) return;
		if (params.filter === "not-installed" && installed) return;
		out.push({ name, type, installed, source });
	};
	for (const s of config.servers) push(s.name, "server", s.enabled, s.origin.source || "manual");
	for (const p of config.plugins) push(p.name, "plugin", p.enabled, p.marketplace || "local");
	for (const s of config.skills) push(s.name, "skill", s.enabled, s.origin || "manual");
	for (const a of config.agents ?? []) push(a.name, "agent", a.enabled, "manual");
	for (const c of config.commands ?? []) push(c.name, "command", c.enabled, "manual");
	return out;
}

export interface LibraryShowDetail {
	type: ResourceType;
	name: string;
	source: string;
	installState: { global: boolean; projects: string[] };
	notes?: string;
	description?: string;
}

export function libraryShow(
	config: EnsembleConfig,
	name: string,
	type?: ResourceType,
): LibraryShowDetail | null {
	if (!type || type === "server") {
		const s = config.servers.find((x) => x.name === name);
		if (s) {
			return {
				type: "server",
				name: s.name,
				source: s.origin.source || "manual",
				installState: { global: s.enabled, projects: [] },
				...(s.userNotes !== undefined ? { notes: s.userNotes } : {}),
				...(s.description !== undefined ? { description: s.description } : {}),
			};
		}
	}
	if (!type || type === "plugin") {
		const p = config.plugins.find((x) => x.name === name);
		if (p) {
			return {
				type: "plugin",
				name: p.name,
				source: p.marketplace || "local",
				installState: { global: p.enabled, projects: [] },
				...(p.userNotes !== undefined ? { notes: p.userNotes } : {}),
				...(p.description !== undefined ? { description: p.description } : {}),
			};
		}
	}
	if (!type || type === "skill") {
		const s = config.skills.find((x) => x.name === name);
		if (s) {
			return {
				type: "skill",
				name: s.name,
				source: s.origin || "manual",
				installState: { global: s.enabled, projects: [] },
				...(s.userNotes !== undefined ? { notes: s.userNotes } : {}),
				description: s.description,
			};
		}
	}
	if (!type || type === "agent") {
		const a = (config.agents ?? []).find((x) => x.name === name);
		if (a) {
			return {
				type: "agent",
				name: a.name,
				source: "manual",
				installState: { global: a.enabled, projects: [] },
				...(a.userNotes !== undefined ? { notes: a.userNotes } : {}),
				description: a.description,
			};
		}
	}
	if (!type || type === "command") {
		const c = (config.commands ?? []).find((x) => x.name === name);
		if (c) {
			return {
				type: "command",
				name: c.name,
				source: "manual",
				installState: { global: c.enabled, projects: [] },
				...(c.userNotes !== undefined ? { notes: c.userNotes } : {}),
				description: c.description,
			};
		}
	}
	return null;
}

// --- Inference helpers ---

function sourceToMarketplaceName(source: string): string {
	// owner/repo → repo; url → last path segment minus .git; else source
	if (OWNER_REPO_RE.test(source)) {
		const slash = source.indexOf("/");
		return source.slice(slash + 1);
	}
	if (URL_RE.test(source)) {
		const stripped = source.replace(/\.git$/, "").replace(/\/$/, "");
		return stripped.slice(stripped.lastIndexOf("/") + 1) || source;
	}
	return source;
}

/**
 * Best-effort type inference for a local directory. Checks for well-known
 * manifests in the target; returns null when the directory is ambiguous and
 * the caller should require --type.
 */
function inferLocalType(path: string): ResourceType | null {
	if (!existsSync(path)) return null;
	if (existsSync(pathJoin(path, "SKILL.md"))) return "skill";
	if (existsSync(pathJoin(path, ".claude-plugin", "plugin.json"))) return "plugin";
	if (existsSync(pathJoin(path, "plugin.json"))) return "plugin";
	// Single .md file with a name field → agent or command; ambiguous, require --type.
	try {
		const mdAtRoot = existsSync(path) && path.endsWith(".md") ? readFileSync(path, "utf-8") : null;
		if (mdAtRoot) return null; // ambiguous — agent vs command
	} catch {
		// ignore
	}
	return null;
}

/** Look up a name across every library entry type. First hit wins. */
export function inferLibraryType(config: EnsembleConfig, name: string): ResourceType | null {
	if (config.servers.some((s) => s.name === name)) return "server";
	if (config.plugins.some((p) => p.name === name)) return "plugin";
	if (config.skills.some((s) => s.name === name)) return "skill";
	if ((config.agents ?? []).some((a) => a.name === name)) return "agent";
	if ((config.commands ?? []).some((c) => c.name === name)) return "command";
	return null;
}
