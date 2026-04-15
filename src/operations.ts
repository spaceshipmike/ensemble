/**
 * Pure business logic for all mutations — shared by CLI and app consumers.
 *
 * Every function takes an EnsembleConfig and returns { config, result }.
 * No I/O. No side effects. Callers are responsible for saving.
 */

import { resolve } from "node:path";
import { CLIENTS } from "./clients.js";
import { getClient, getGroup, getMarketplace, getPlugin, getServer, getSkill } from "./config.js";
import { expandPath } from "./clients.js";
import type { EnsembleConfig, Group, Marketplace, MarketplaceSource, Plugin, Profile, Server, ServerOrigin, Skill, ToolInfo } from "./schemas.js";
import { RESERVED_MARKETPLACE_NAMES } from "./schemas.js";

// --- Result types ---

export interface OpResult {
	ok: boolean;
	error: string;
	messages: string[];
}

export interface ServerResult extends OpResult {
	server: Server | null;
}

export interface PluginResult extends OpResult {
	plugin: Plugin | null;
}

export interface MarketplaceResult extends OpResult {
	marketplace: Marketplace | null;
}

export interface GroupResult extends OpResult {
	group: Group | null;
}

export interface SkillResult extends OpResult {
	skill: Skill | null;
}

export interface AssignResult extends OpResult {
	clientId: string;
	group: string | null;
	projectPath: string | null;
}

export interface ScopeResult extends OpResult {
	itemType: string;
	itemName: string;
	globalGroup: string;
	projectGroup: string;
	projectPath: string;
}

export interface ImportPluginsResult extends OpResult {
	imported: Plugin[];
}

export interface CollisionInfo {
	itemName: string;
	itemType: "server" | "plugin" | "skill";
	globalGroup: string;
	projectGroup: string;
	projectPath: string;
}

export interface SkillDependencyInfo {
	skillName: string;
	dependencies: string[];
	satisfied: string[];
	missing: string[];
	disabled: string[];
}

export interface ProfileResult extends OpResult {
	profile: Profile | null;
}

// --- Helpers ---

function ok(messages: string[]): OpResult {
	return { ok: true, error: "", messages };
}

function fail(error: string): OpResult {
	return { ok: false, error, messages: [] };
}

// --- Operation return type ---

export interface OpReturn<R = OpResult> {
	config: EnsembleConfig;
	result: R;
}

// --- Server operations ---

export function addServer(
	config: EnsembleConfig,
	params: {
		name: string;
		command?: string;
		args?: string[];
		env?: Record<string, string>;
		transport?: "stdio" | "http" | "sse" | "streamable-http";
		url?: string;
		authType?: string;
		authRef?: string;
		origin?: Partial<ServerOrigin>;
		tools?: ToolInfo[];
	},
): OpReturn<ServerResult> {
	if (getServer(config, params.name)) {
		return { config, result: { ...fail(`Server '${params.name}' already exists.`), server: null } };
	}

	const server: Server = {
		name: params.name,
		enabled: true,
		transport: params.transport ?? "stdio",
		command: params.command ?? "",
		args: params.args ?? [],
		env: params.env ?? {},
		url: params.url ?? "",
		auth_type: (params.authType ?? "") as Server["auth_type"],
		auth_ref: params.authRef ?? "",
		origin: {
			source: params.origin?.source ?? "manual",
			client: params.origin?.client ?? "",
			registry_id: params.origin?.registry_id ?? "",
			timestamp: params.origin?.timestamp ?? "",
			trust_tier: params.origin?.trust_tier ?? "local",
		},
		tools: params.tools ?? [],
	};

	return {
		config: { ...config, servers: [...config.servers, server] },
		result: { ...ok([`Added server '${params.name}'.`]), server },
	};
}

export function removeServer(config: EnsembleConfig, name: string): OpReturn<ServerResult> {
	const server = getServer(config, name);
	if (!server) {
		return { config, result: { ...fail(`Server '${name}' not found.`), server: null } };
	}

	return {
		config: {
			...config,
			servers: config.servers.filter((s) => s.name !== name),
			groups: config.groups.map((g) => ({
				...g,
				servers: g.servers.filter((s) => s !== name),
			})),
		},
		result: { ...ok([`Removed server '${name}'.`]), server },
	};
}

export function enableServer(config: EnsembleConfig, name: string): OpReturn<ServerResult> {
	const server = getServer(config, name);
	if (!server) {
		return { config, result: { ...fail(`Server '${name}' not found.`), server: null } };
	}
	const updated = { ...server, enabled: true };
	return {
		config: { ...config, servers: config.servers.map((s) => (s.name === name ? updated : s)) },
		result: { ...ok([`Enabled server '${name}'.`]), server: updated },
	};
}

export function disableServer(config: EnsembleConfig, name: string): OpReturn<ServerResult> {
	const server = getServer(config, name);
	if (!server) {
		return { config, result: { ...fail(`Server '${name}' not found.`), server: null } };
	}
	const updated = { ...server, enabled: false };
	return {
		config: { ...config, servers: config.servers.map((s) => (s.name === name ? updated : s)) },
		result: { ...ok([`Disabled server '${name}'.`]), server: updated },
	};
}

// --- Group operations ---

export function createGroup(
	config: EnsembleConfig,
	name: string,
	description = "",
): OpReturn<GroupResult> {
	if (getGroup(config, name)) {
		return { config, result: { ...fail(`Group '${name}' already exists.`), group: null } };
	}
	const group: Group = { name, description, servers: [], plugins: [], skills: [] };
	return {
		config: { ...config, groups: [...config.groups, group] },
		result: { ...ok([`Created group '${name}'.`]), group },
	};
}

export function deleteGroup(config: EnsembleConfig, name: string): OpReturn<GroupResult> {
	const group = getGroup(config, name);
	if (!group) {
		return { config, result: { ...fail(`Group '${name}' not found.`), group: null } };
	}
	return {
		config: {
			...config,
			groups: config.groups.filter((g) => g.name !== name),
			clients: config.clients.map((c) => (c.group === name ? { ...c, group: null } : c)),
		},
		result: { ...ok([`Deleted group '${name}'.`]), group },
	};
}

export function addServerToGroup(
	config: EnsembleConfig,
	groupName: string,
	serverName: string,
): OpReturn {
	const group = getGroup(config, groupName);
	if (!group) return { config, result: fail(`Group '${groupName}' not found.`) };
	if (!getServer(config, serverName))
		return { config, result: fail(`Server '${serverName}' not found.`) };
	if (group.servers.includes(serverName))
		return { config, result: ok([`Server '${serverName}' already in group '${groupName}'.`]) };

	return {
		config: {
			...config,
			groups: config.groups.map((g) =>
				g.name === groupName ? { ...g, servers: [...g.servers, serverName] } : g,
			),
		},
		result: ok([`Added '${serverName}' to group '${groupName}'.`]),
	};
}

export function removeServerFromGroup(
	config: EnsembleConfig,
	groupName: string,
	serverName: string,
): OpReturn {
	const group = getGroup(config, groupName);
	if (!group) return { config, result: fail(`Group '${groupName}' not found.`) };
	if (!group.servers.includes(serverName))
		return { config, result: fail(`Server '${serverName}' not in group '${groupName}'.`) };

	return {
		config: {
			...config,
			groups: config.groups.map((g) =>
				g.name === groupName ? { ...g, servers: g.servers.filter((s) => s !== serverName) } : g,
			),
		},
		result: ok([`Removed '${serverName}' from group '${groupName}'.`]),
	};
}

export function addPluginToGroup(
	config: EnsembleConfig,
	groupName: string,
	pluginName: string,
): OpReturn {
	const group = getGroup(config, groupName);
	if (!group) return { config, result: fail(`Group '${groupName}' not found.`) };
	if (!getPlugin(config, pluginName))
		return { config, result: fail(`Plugin '${pluginName}' not found.`) };
	if (group.plugins.includes(pluginName))
		return { config, result: ok([`Plugin '${pluginName}' already in group '${groupName}'.`]) };

	return {
		config: {
			...config,
			groups: config.groups.map((g) =>
				g.name === groupName ? { ...g, plugins: [...g.plugins, pluginName] } : g,
			),
		},
		result: ok([`Added '${pluginName}' to group '${groupName}'.`]),
	};
}

export function removePluginFromGroup(
	config: EnsembleConfig,
	groupName: string,
	pluginName: string,
): OpReturn {
	const group = getGroup(config, groupName);
	if (!group) return { config, result: fail(`Group '${groupName}' not found.`) };
	if (!group.plugins.includes(pluginName))
		return { config, result: fail(`Plugin '${pluginName}' not in group '${groupName}'.`) };

	return {
		config: {
			...config,
			groups: config.groups.map((g) =>
				g.name === groupName
					? { ...g, plugins: g.plugins.filter((p) => p !== pluginName) }
					: g,
			),
		},
		result: ok([`Removed '${pluginName}' from group '${groupName}'.`]),
	};
}

export function addSkillToGroup(
	config: EnsembleConfig,
	groupName: string,
	skillName: string,
): OpReturn {
	const group = getGroup(config, groupName);
	if (!group) return { config, result: fail(`Group '${groupName}' not found.`) };
	if (!getSkill(config, skillName))
		return { config, result: fail(`Skill '${skillName}' not found.`) };
	if (group.skills.includes(skillName))
		return { config, result: ok([`Skill '${skillName}' already in group '${groupName}'.`]) };

	return {
		config: {
			...config,
			groups: config.groups.map((g) =>
				g.name === groupName ? { ...g, skills: [...g.skills, skillName] } : g,
			),
		},
		result: ok([`Added '${skillName}' to group '${groupName}'.`]),
	};
}

export function removeSkillFromGroup(
	config: EnsembleConfig,
	groupName: string,
	skillName: string,
): OpReturn {
	const group = getGroup(config, groupName);
	if (!group) return { config, result: fail(`Group '${groupName}' not found.`) };
	if (!group.skills.includes(skillName))
		return { config, result: fail(`Skill '${skillName}' not in group '${groupName}'.`) };

	return {
		config: {
			...config,
			groups: config.groups.map((g) =>
				g.name === groupName ? { ...g, skills: g.skills.filter((s) => s !== skillName) } : g,
			),
		},
		result: ok([`Removed '${skillName}' from group '${groupName}'.`]),
	};
}

// --- Assignment operations ---

export function assignClient(
	config: EnsembleConfig,
	clientId: string,
	group: string | null,
	options?: { assignAll?: boolean; projectPath?: string },
): OpReturn<AssignResult> {
	const client = CLIENTS[clientId];
	if (!client) {
		return {
			config,
			result: {
				...fail(`Unknown client: ${clientId}`),
				clientId,
				group: null,
				projectPath: null,
			},
		};
	}

	if (options?.projectPath && clientId !== "claude-code") {
		return {
			config,
			result: {
				...fail("--project is only supported for claude-code."),
				clientId,
				group: null,
				projectPath: null,
			},
		};
	}

	const effectiveGroup = options?.assignAll ? null : group;
	if (!options?.assignAll && !group) {
		return {
			config,
			result: {
				...fail("Specify a group name or use --all."),
				clientId,
				group: null,
				projectPath: null,
			},
		};
	}
	if (effectiveGroup && !getGroup(config, effectiveGroup)) {
		return {
			config,
			result: {
				...fail(`Group '${effectiveGroup}' not found.`),
				clientId,
				group: null,
				projectPath: null,
			},
		};
	}

	let newConfig = { ...config };
	const existing = getClient(config, clientId);

	if (options?.projectPath) {
		const absPath = resolve(expandPath(options.projectPath));
		const clientAssignment = existing
			? { ...existing }
			: { id: clientId, group: null, last_synced: null, projects: {}, server_hashes: {} };
		clientAssignment.projects = {
			...clientAssignment.projects,
			[absPath]: { group: effectiveGroup, last_synced: null },
		};
		newConfig = {
			...newConfig,
			clients: existing
				? newConfig.clients.map((c) => (c.id === clientId ? clientAssignment : c))
				: [...newConfig.clients, clientAssignment],
		};
		const msg = effectiveGroup
			? `Assigned group '${effectiveGroup}' to Claude Code project ${absPath}.`
			: `Assigned all enabled servers to Claude Code project ${absPath}.`;
		return {
			config: newConfig,
			result: { ...ok([msg]), clientId, group: effectiveGroup, projectPath: absPath },
		};
	}

	const clientAssignment = existing
		? { ...existing, group: effectiveGroup }
		: {
				id: clientId,
				group: effectiveGroup,
				last_synced: null,
				projects: {},
				server_hashes: {},
			};
	newConfig = {
		...newConfig,
		clients: existing
			? newConfig.clients.map((c) => (c.id === clientId ? clientAssignment : c))
			: [...newConfig.clients, clientAssignment],
	};
	const msg = effectiveGroup
		? `Assigned group '${effectiveGroup}' to ${client.name}.`
		: `Assigned all enabled servers to ${client.name}.`;
	return {
		config: newConfig,
		result: { ...ok([msg]), clientId, group: effectiveGroup, projectPath: null },
	};
}

export function unassignClient(
	config: EnsembleConfig,
	clientId: string,
	projectPath?: string,
): OpReturn<AssignResult> {
	const client = CLIENTS[clientId];
	if (!client) {
		return {
			config,
			result: { ...fail(`Unknown client: ${clientId}`), clientId, group: null, projectPath: null },
		};
	}

	if (projectPath && clientId !== "claude-code") {
		return {
			config,
			result: {
				...fail("--project is only supported for claude-code."),
				clientId,
				group: null,
				projectPath: null,
			},
		};
	}

	const existing = getClient(config, clientId);
	if (!existing) {
		return {
			config,
			result: { ...ok([`No assignment for ${client.name}.`]), clientId, group: null, projectPath: null },
		};
	}

	if (projectPath) {
		const absPath = resolve(expandPath(projectPath));
		const newProjects = { ...existing.projects };
		delete newProjects[absPath];
		return {
			config: {
				...config,
				clients: config.clients.map((c) =>
					c.id === clientId ? { ...c, projects: newProjects } : c,
				),
			},
			result: {
				...ok([`Removed project assignment for ${absPath}.`]),
				clientId,
				group: null,
				projectPath: absPath,
			},
		};
	}

	return {
		config: {
			...config,
			clients: config.clients.map((c) => (c.id === clientId ? { ...c, group: null } : c)),
		},
		result: {
			...ok([`Unassigned ${client.name} — will receive all enabled servers.`]),
			clientId,
			group: null,
			projectPath: null,
		},
	};
}

// --- Scope operation ---

export function scopeItem(
	config: EnsembleConfig,
	name: string,
	projectPath: string,
): OpReturn<ScopeResult> {
	const absPath = resolve(expandPath(projectPath));
	const projectBasename = absPath.split("/").pop() || "project";

	const server = getServer(config, name);
	const plugin = getPlugin(config, name);
	if (!server && !plugin) {
		return {
			config,
			result: {
				...fail(`'${name}' is not a known server or plugin.`),
				itemType: "",
				itemName: name,
				globalGroup: "",
				projectGroup: "",
				projectPath: absPath,
			},
		};
	}

	const itemType = server ? "server" : "plugin";
	let newConfig = { ...config };
	const messages: string[] = [];

	// Ensure claude-code client assignment exists
	let assignment = getClient(newConfig, "claude-code");
	if (!assignment) {
		assignment = { id: "claude-code", group: null, last_synced: null, projects: {}, server_hashes: {} };
		newConfig = { ...newConfig, clients: [...newConfig.clients, assignment] };
	}

	// Step 1: Ensure global uses a group
	let globalGroupName = assignment.group;
	if (!globalGroupName) {
		globalGroupName = "claude-code-global";
		if (!getGroup(newConfig, globalGroupName)) {
			const globalGroup: Group = {
				name: globalGroupName,
				description: "Auto-created global group for Claude Code",
				servers: newConfig.servers.filter((s) => s.enabled).map((s) => s.name),
				plugins: newConfig.plugins.filter((p) => p.enabled).map((p) => p.name),
				skills: [],
			};
			newConfig = { ...newConfig, groups: [...newConfig.groups, globalGroup] };
			messages.push(`Created group '${globalGroupName}' with all enabled items.`);
		}
		newConfig = {
			...newConfig,
			clients: newConfig.clients.map((c) =>
				c.id === "claude-code" ? { ...c, group: globalGroupName } : c,
			),
		};
	}

	const globalGroup = getGroup(newConfig, globalGroupName);
	if (!globalGroup) {
		return {
			config,
			result: {
				...fail(`Global group '${globalGroupName}' not found.`),
				itemType, itemName: name, globalGroup: globalGroupName ?? "", projectGroup: "", projectPath: absPath,
			},
		};
	}

	// Step 2: Ensure project has a group
	const existingProj = getClient(newConfig, "claude-code")?.projects[absPath];
	let projGroupName = existingProj?.group;
	if (!projGroupName) {
		projGroupName = projectBasename;
		if (getGroup(newConfig, projGroupName) && projGroupName === globalGroupName) {
			projGroupName = `${projectBasename}-project`;
		}
		if (!getGroup(newConfig, projGroupName)) {
			const projGroup: Group = {
				name: projGroupName,
				description: `Servers and plugins for ${projectBasename}`,
				servers: [...globalGroup.servers],
				plugins: [...globalGroup.plugins],
				skills: [],
			};
			newConfig = { ...newConfig, groups: [...newConfig.groups, projGroup] };
			messages.push(`Created group '${projGroupName}' for project.`);
		}
		// Assign project
		newConfig = {
			...newConfig,
			clients: newConfig.clients.map((c) =>
				c.id === "claude-code"
					? { ...c, projects: { ...c.projects, [absPath]: { group: projGroupName ?? null, last_synced: null } } }
					: c,
			),
		};
	}

	// Step 3: Add to project group, remove from global group
	newConfig = {
		...newConfig,
		groups: newConfig.groups.map((g) => {
			if (g.name === projGroupName) {
				if (itemType === "server" && !g.servers.includes(name)) {
					return { ...g, servers: [...g.servers, name] };
				}
				if (itemType === "plugin" && !g.plugins.includes(name)) {
					return { ...g, plugins: [...g.plugins, name] };
				}
			}
			if (g.name === globalGroupName) {
				if (itemType === "server") {
					return { ...g, servers: g.servers.filter((s) => s !== name) };
				}
				if (itemType === "plugin") {
					return { ...g, plugins: g.plugins.filter((p) => p !== name) };
				}
			}
			return g;
		}),
	};

	messages.push(
		`Scoped ${itemType} '${name}' to project ${absPath}.`,
		`  removed from: ${globalGroupName} (global)`,
		`  added to:     ${projGroupName} (project)`,
		"Run 'ensemble sync claude-code' to apply.",
	);

	return {
		config: newConfig,
		result: {
			...ok(messages),
			itemType,
			itemName: name,
			globalGroup: globalGroupName ?? "",
			projectGroup: projGroupName ?? "",
			projectPath: absPath,
		},
	};
}

// --- Plugin operations (pure — no CC settings I/O) ---

export function installPlugin(
	config: EnsembleConfig,
	name: string,
	marketplaceName?: string,
): OpReturn<PluginResult> {
	if (getPlugin(config, name)) {
		return { config, result: { ...fail(`Plugin '${name}' is already installed.`), plugin: null } };
	}

	let resolvedMarketplace = marketplaceName;
	if (!resolvedMarketplace) {
		if (config.marketplaces.length === 1) {
			resolvedMarketplace = config.marketplaces[0]!.name;
		} else if (config.marketplaces.length > 1) {
			return {
				config,
				result: {
					...fail("Multiple marketplaces available. Specify --marketplace."),
					plugin: null,
				},
			};
		} else {
			resolvedMarketplace = "claude-plugins-official";
		}
	}

	const plugin: Plugin = { name, marketplace: resolvedMarketplace, enabled: true, managed: true };
	return {
		config: { ...config, plugins: [...config.plugins, plugin] },
		result: { ...ok([`Installed plugin '${name}' from ${resolvedMarketplace}.`]), plugin },
	};
}

export function uninstallPlugin(config: EnsembleConfig, name: string): OpReturn<PluginResult> {
	const plugin = getPlugin(config, name);
	if (!plugin) {
		return { config, result: { ...fail(`Plugin '${name}' not found.`), plugin: null } };
	}

	return {
		config: {
			...config,
			plugins: config.plugins.filter((p) => p.name !== name),
			groups: config.groups.map((g) => ({
				...g,
				plugins: g.plugins.filter((p) => p !== name),
			})),
		},
		result: { ...ok([`Uninstalled plugin '${name}'.`]), plugin },
	};
}

export function enablePlugin(config: EnsembleConfig, name: string): OpReturn<PluginResult> {
	const plugin = getPlugin(config, name);
	if (!plugin) {
		return { config, result: { ...fail(`Plugin '${name}' not found.`), plugin: null } };
	}
	const updated = { ...plugin, enabled: true };
	return {
		config: {
			...config,
			plugins: config.plugins.map((p) => (p.name === name ? updated : p)),
		},
		result: { ...ok([`Enabled plugin '${name}'.`]), plugin: updated },
	};
}

export function disablePlugin(config: EnsembleConfig, name: string): OpReturn<PluginResult> {
	const plugin = getPlugin(config, name);
	if (!plugin) {
		return { config, result: { ...fail(`Plugin '${name}' not found.`), plugin: null } };
	}
	const updated = { ...plugin, enabled: false };
	return {
		config: {
			...config,
			plugins: config.plugins.map((p) => (p.name === name ? updated : p)),
		},
		result: { ...ok([`Disabled plugin '${name}'.`]), plugin: updated },
	};
}

export function importPlugins(
	config: EnsembleConfig,
	enabledPlugins: Record<string, boolean>,
): OpReturn<ImportPluginsResult> {
	const imported: Plugin[] = [];
	let newConfig = { ...config };

	for (const [qualifiedName, isEnabled] of Object.entries(enabledPlugins)) {
		const [pname, mkt] = qualifiedName.includes("@")
			? [qualifiedName.slice(0, qualifiedName.lastIndexOf("@")), qualifiedName.slice(qualifiedName.lastIndexOf("@") + 1)]
			: [qualifiedName, ""];

		if (getPlugin(newConfig, pname!)) continue;

		const plugin: Plugin = { name: pname!, marketplace: mkt!, enabled: isEnabled, managed: false };
		newConfig = { ...newConfig, plugins: [...newConfig.plugins, plugin] };
		imported.push(plugin);
	}

	const msg = imported.length > 0 ? `Imported ${imported.length} plugin(s).` : "No new plugins to import.";
	return {
		config: newConfig,
		result: { ...ok([msg]), imported },
	};
}

// --- Marketplace operations (pure — no CC settings I/O) ---

export function addMarketplace(
	config: EnsembleConfig,
	name: string,
	source: MarketplaceSource,
): OpReturn<MarketplaceResult> {
	if (RESERVED_MARKETPLACE_NAMES.has(name)) {
		return { config, result: { ...fail(`'${name}' is a reserved marketplace name.`), marketplace: null } };
	}
	if (getMarketplace(config, name)) {
		return { config, result: { ...fail(`Marketplace '${name}' already exists.`), marketplace: null } };
	}

	const marketplace: Marketplace = { name, source };
	return {
		config: { ...config, marketplaces: [...config.marketplaces, marketplace] },
		result: { ...ok([`Added marketplace '${name}'.`]), marketplace },
	};
}

export function removeMarketplace(
	config: EnsembleConfig,
	name: string,
): OpReturn<MarketplaceResult> {
	const marketplace = getMarketplace(config, name);
	if (!marketplace) {
		return { config, result: { ...fail(`Marketplace '${name}' not found.`), marketplace: null } };
	}

	return {
		config: { ...config, marketplaces: config.marketplaces.filter((m) => m.name !== name) },
		result: { ...ok([`Removed marketplace '${name}'.`]), marketplace },
	};
}

// --- Skill operations (pure — no disk I/O for SKILL.md files) ---

export function installSkill(
	config: EnsembleConfig,
	params: {
		name: string;
		description?: string;
		origin?: string;
		dependencies?: string[];
		tags?: string[];
		path?: string;
		mode?: "pin" | "track";
	},
): OpReturn<SkillResult> {
	if (getSkill(config, params.name)) {
		return { config, result: { ...fail(`Skill '${params.name}' already exists.`), skill: null } };
	}

	const skill: Skill = {
		name: params.name,
		enabled: true,
		description: params.description ?? "",
		path: params.path ?? "",
		origin: params.origin ?? "manual",
		dependencies: params.dependencies ?? [],
		tags: params.tags ?? [],
		mode: params.mode ?? "pin",
	};

	return {
		config: { ...config, skills: [...config.skills, skill] },
		result: { ...ok([`Installed skill '${params.name}'.`]), skill },
	};
}

export function uninstallSkill(config: EnsembleConfig, name: string): OpReturn<SkillResult> {
	const skill = getSkill(config, name);
	if (!skill) {
		return { config, result: { ...fail(`Skill '${name}' not found.`), skill: null } };
	}

	return {
		config: {
			...config,
			skills: config.skills.filter((s) => s.name !== name),
			groups: config.groups.map((g) => ({
				...g,
				skills: g.skills.filter((s) => s !== name),
			})),
		},
		result: { ...ok([`Removed skill '${name}'.`]), skill },
	};
}

export function enableSkill(config: EnsembleConfig, name: string): OpReturn<SkillResult> {
	const skill = getSkill(config, name);
	if (!skill) {
		return { config, result: { ...fail(`Skill '${name}' not found.`), skill: null } };
	}
	const updated = { ...skill, enabled: true };
	return {
		config: { ...config, skills: config.skills.map((s) => (s.name === name ? updated : s)) },
		result: { ...ok([`Enabled skill '${name}'.`]), skill: updated },
	};
}

export function disableSkill(config: EnsembleConfig, name: string): OpReturn<SkillResult> {
	const skill = getSkill(config, name);
	if (!skill) {
		return { config, result: { ...fail(`Skill '${name}' not found.`), skill: null } };
	}
	const updated = { ...skill, enabled: false };
	return {
		config: { ...config, skills: config.skills.map((s) => (s.name === name ? updated : s)) },
		result: { ...ok([`Disabled skill '${name}'.`]), skill: updated },
	};
}

// --- Notes operations (v2.0.3 #notes-and-descriptions) ---

export type NotedItemType = "server" | "skill" | "plugin";

export interface ParsedNoteRef {
	type: NotedItemType | null;
	name: string;
	marketplace?: string;
}

/** Parse a ref of the form "type:name", "plugin:name@marketplace", or bare "name". */
export function parseNoteRef(ref: string): ParsedNoteRef {
	const trimmed = (ref ?? "").trim();
	if (!trimmed) return { type: null, name: "" };
	const colonIdx = trimmed.indexOf(":");
	if (colonIdx > 0) {
		const head = trimmed.slice(0, colonIdx).toLowerCase();
		const tail = trimmed.slice(colonIdx + 1);
		if (head === "server" || head === "skill" || head === "plugin") {
			if (head === "plugin") {
				const atIdx = tail.lastIndexOf("@");
				if (atIdx > 0) {
					return { type: "plugin", name: tail.slice(0, atIdx), marketplace: tail.slice(atIdx + 1) };
				}
			}
			return { type: head, name: tail };
		}
	}
	// Bare name — type unknown, caller resolves via search.
	if (trimmed.includes("@") && !trimmed.startsWith("@")) {
		const atIdx = trimmed.lastIndexOf("@");
		return { type: "plugin", name: trimmed.slice(0, atIdx), marketplace: trimmed.slice(atIdx + 1) };
	}
	return { type: null, name: trimmed };
}

export interface NoteResult extends OpResult {
	type: NotedItemType | null;
	name: string;
	userNotes: string | null;
}

/**
 * Locate a notable item. With `parsed.type` set, looks only in that bucket.
 * With `parsed.type === null`, searches servers → skills → plugins and returns
 * the first hit. Returns null if nothing matches or multiple ambiguous matches
 * are found across types.
 */
export function findNotedItem(
	config: EnsembleConfig,
	parsed: ParsedNoteRef,
): { type: NotedItemType; item: Server | Skill | Plugin } | null {
	const { type, name, marketplace } = parsed;
	if (type === "server") {
		const s = getServer(config, name);
		return s ? { type: "server", item: s } : null;
	}
	if (type === "skill") {
		const s = getSkill(config, name);
		return s ? { type: "skill", item: s } : null;
	}
	if (type === "plugin") {
		const p = config.plugins.find((p) =>
			p.name === name && (marketplace ? p.marketplace === marketplace : true),
		);
		return p ? { type: "plugin", item: p } : null;
	}
	// Bare name — search all three buckets.
	const s = getServer(config, name);
	if (s) return { type: "server", item: s };
	const sk = getSkill(config, name);
	if (sk) return { type: "skill", item: sk };
	const pl = config.plugins.find((p) => p.name === name);
	if (pl) return { type: "plugin", item: pl };
	return null;
}

/**
 * Set, update, or clear a userNotes value on a server, skill, or plugin.
 *
 * Empty string deletes the userNotes key entirely (the v2.0.3 spec choice —
 * we don't store empty strings, the absence of the key is the canonical
 * "no notes" state).
 *
 * Pure: returns a fresh config with one item replaced.
 */
export function setUserNotes(
	config: EnsembleConfig,
	params: { ref: string; text: string },
): OpReturn<NoteResult> {
	const parsed = parseNoteRef(params.ref);
	if (!parsed.name) {
		return {
			config,
			result: { ...fail("Ref must be a non-empty name."), type: null, name: "", userNotes: null },
		};
	}
	const found = findNotedItem(config, parsed);
	if (!found) {
		const label = parsed.type ? `${parsed.type} '${parsed.name}'` : `item '${parsed.name}'`;
		return {
			config,
			result: { ...fail(`${label} not found.`), type: parsed.type, name: parsed.name, userNotes: null },
		};
	}

	const text = params.text ?? "";
	const empty = text === "";

	let nextConfig: EnsembleConfig = config;
	if (found.type === "server") {
		const cur = found.item as Server;
		const { userNotes: _omit, ...rest } = cur;
		void _omit;
		const updated: Server = empty ? (rest as Server) : { ...cur, userNotes: text };
		nextConfig = {
			...config,
			servers: config.servers.map((s) => (s.name === cur.name ? updated : s)),
		};
	} else if (found.type === "skill") {
		const cur = found.item as Skill;
		const { userNotes: _omit, ...rest } = cur;
		void _omit;
		const updated: Skill = empty ? (rest as Skill) : { ...cur, userNotes: text };
		nextConfig = {
			...config,
			skills: config.skills.map((s) => (s.name === cur.name ? updated : s)),
		};
	} else {
		const cur = found.item as Plugin;
		const { userNotes: _omit, ...rest } = cur;
		void _omit;
		const updated: Plugin = empty ? (rest as Plugin) : { ...cur, userNotes: text };
		nextConfig = {
			...config,
			plugins: config.plugins.map((p) =>
				p.name === cur.name && p.marketplace === cur.marketplace ? updated : p,
			),
		};
	}

	const verb = empty ? "Cleared notes on" : "Updated notes on";
	return {
		config: nextConfig,
		result: {
			...ok([`${verb} ${found.type} '${parsed.name}'.`]),
			type: found.type,
			name: parsed.name,
			userNotes: empty ? null : text,
		},
	};
}

/** Return the current userNotes for a ref, or null if the item has none. */
export function getUserNotes(
	config: EnsembleConfig,
	ref: string,
): { type: NotedItemType; name: string; userNotes: string | null } | null {
	const parsed = parseNoteRef(ref);
	const found = findNotedItem(config, parsed);
	if (!found) return null;
	const item = found.item as { userNotes?: string };
	return {
		type: found.type,
		name: (found.item as { name: string }).name,
		userNotes: typeof item.userNotes === "string" && item.userNotes !== "" ? item.userNotes : null,
	};
}

// --- Rules operations ---

export function addRule(config: EnsembleConfig, path: string, group: string): OpReturn {
	if (!getGroup(config, group)) {
		return { config, result: fail(`Group '${group}' not found.`) };
	}
	const absPath = resolve(expandPath(path));
	const existing = config.rules.find((r) => resolve(expandPath(r.path)) === absPath);
	if (existing) {
		return { config, result: fail(`Rule for '${absPath}' already exists (→ ${existing.group}).`) };
	}

	return {
		config: { ...config, rules: [...config.rules, { path, group }] },
		result: ok([`Added rule: ${path} → ${group}`, "Projects under this path will get this group on next sync."]),
	};
}

export function removeRule(config: EnsembleConfig, path: string): OpReturn {
	const absPath = resolve(expandPath(path));
	const rule = config.rules.find((r) => resolve(expandPath(r.path)) === absPath);
	if (!rule) {
		return { config, result: fail(`No rule for '${path}'.`) };
	}

	return {
		config: { ...config, rules: config.rules.filter((r) => r !== rule) },
		result: ok([`Removed rule for '${path}'.`]),
	};
}

// --- Trust tier ---

export function setTrustTier(
	config: EnsembleConfig,
	name: string,
	tier: "official" | "community" | "local",
): OpReturn<ServerResult> {
	const server = getServer(config, name);
	if (!server) {
		return { config, result: { ...fail(`Server '${name}' not found.`), server: null } };
	}
	const updated = { ...server, origin: { ...server.origin, trust_tier: tier } };
	return {
		config: { ...config, servers: config.servers.map((s) => (s.name === name ? updated : s)) },
		result: { ...ok([`Set trust tier for '${name}' to '${tier}'.`]), server: updated },
	};
}

// --- Pin / Track ---

export function pinItem(config: EnsembleConfig, name: string): OpReturn {
	const skill = getSkill(config, name);
	if (skill) {
		return {
			config: {
				...config,
				skills: config.skills.map((s) => (s.name === name ? { ...s, mode: "pin" as const } : s)),
			},
			result: ok([`Pinned skill '${name}' — will not auto-update.`]),
		};
	}

	const server = getServer(config, name);
	if (server) {
		return { config, result: ok([`Pinned server '${name}' — will not auto-update.`]) };
	}

	return { config, result: fail(`'${name}' is not a known server or skill.`) };
}

export function trackItem(config: EnsembleConfig, name: string): OpReturn {
	const skill = getSkill(config, name);
	if (skill) {
		return {
			config: {
				...config,
				skills: config.skills.map((s) =>
					s.name === name ? { ...s, mode: "track" as const } : s,
				),
			},
			result: ok([`Tracking skill '${name}' — will check for updates.`]),
		};
	}

	const server = getServer(config, name);
	if (server) {
		if (!server.origin.registry_id) {
			return { config, result: fail(`Server '${name}' has no registry ID — cannot track.`) };
		}
		return { config, result: ok([`Tracking server '${name}' — will check for registry updates.`]) };
	}

	return { config, result: fail(`'${name}' is not a known server or skill.`) };
}

// --- Collision detection ---

export function detectCollisions(
	config: EnsembleConfig,
	clientId = "claude-code",
): CollisionInfo[] {
	const assignment = getClient(config, clientId);
	if (!assignment?.group) return [];

	const globalGroup = getGroup(config, assignment.group);
	if (!globalGroup) return [];

	const collisions: CollisionInfo[] = [];

	for (const [projPath, projData] of Object.entries(assignment.projects)) {
		if (!projData.group) continue;
		const projGroup = getGroup(config, projData.group);
		if (!projGroup) continue;

		for (const name of projGroup.servers) {
			if (globalGroup.servers.includes(name)) {
				collisions.push({
					itemName: name,
					itemType: "server",
					globalGroup: assignment.group,
					projectGroup: projData.group,
					projectPath: projPath,
				});
			}
		}
		for (const name of projGroup.plugins) {
			if (globalGroup.plugins.includes(name)) {
				collisions.push({
					itemName: name,
					itemType: "plugin",
					globalGroup: assignment.group,
					projectGroup: projData.group,
					projectPath: projPath,
				});
			}
		}
		for (const name of projGroup.skills) {
			if (globalGroup.skills.includes(name)) {
				collisions.push({
					itemName: name,
					itemType: "skill",
					globalGroup: assignment.group,
					projectGroup: projData.group,
					projectPath: projPath,
				});
			}
		}
	}

	return collisions;
}

// --- Dependency intelligence ---

// --- Profile operations ---

export function saveProfile(
	config: EnsembleConfig,
	name: string,
): OpReturn<ProfileResult> {
	const profile: Profile = {
		name,
		clients: [...config.clients],
		rules: [...config.rules],
		settings: { ...config.settings },
		createdAt: new Date().toISOString(),
	};

	const newProfiles = { ...config.profiles, [name]: profile };
	return {
		config: { ...config, profiles: newProfiles },
		result: { ...ok([`Saved profile '${name}'.`]), profile },
	};
}

export function activateProfile(
	config: EnsembleConfig,
	name: string,
): OpReturn<ProfileResult> {
	const profile = config.profiles[name];
	if (!profile) {
		return { config, result: { ...fail(`Profile '${name}' not found.`), profile: null } };
	}

	return {
		config: {
			...config,
			clients: [...profile.clients],
			rules: [...profile.rules],
			settings: { ...profile.settings },
			activeProfile: name,
		},
		result: { ...ok([`Activated profile '${name}'.`]), profile },
	};
}

export function listProfiles(
	config: EnsembleConfig,
): OpReturn<ProfileResult> {
	const names = Object.keys(config.profiles);
	if (names.length === 0) {
		return { config, result: { ...ok(["No profiles saved."]), profile: null } };
	}

	const messages = names.map((n) => {
		const active = config.activeProfile === n ? " (active)" : "";
		return `${n}${active}`;
	});
	return { config, result: { ...ok(messages), profile: null } };
}

export function showProfile(
	config: EnsembleConfig,
	name: string,
): OpReturn<ProfileResult> {
	const profile = config.profiles[name];
	if (!profile) {
		return { config, result: { ...fail(`Profile '${name}' not found.`), profile: null } };
	}

	const messages = [
		`Profile: ${name}${config.activeProfile === name ? " (active)" : ""}`,
		`Clients: ${profile.clients.length}`,
		`Rules: ${profile.rules.length}`,
		`Created: ${profile.createdAt}`,
	];
	return { config, result: { ...ok(messages), profile } };
}

export function deleteProfile(
	config: EnsembleConfig,
	name: string,
): OpReturn<ProfileResult> {
	const profile = config.profiles[name];
	if (!profile) {
		return { config, result: { ...fail(`Profile '${name}' not found.`), profile: null } };
	}

	const newProfiles = { ...config.profiles };
	delete newProfiles[name];
	const newActive = config.activeProfile === name ? null : config.activeProfile;

	return {
		config: { ...config, profiles: newProfiles, activeProfile: newActive },
		result: { ...ok([`Deleted profile '${name}'.`]), profile },
	};
}

// --- Dependency intelligence ---

export function checkSkillDependencies(config: EnsembleConfig): SkillDependencyInfo[] {
	return config.skills
		.filter((s) => s.dependencies.length > 0)
		.map((skill) => {
			const satisfied: string[] = [];
			const missing: string[] = [];
			const disabled: string[] = [];
			for (const dep of skill.dependencies) {
				const server = getServer(config, dep);
				if (!server) missing.push(dep);
				else if (!server.enabled) disabled.push(dep);
				else satisfied.push(dep);
			}
			return {
				skillName: skill.name,
				dependencies: skill.dependencies,
				satisfied,
				missing,
				disabled,
			};
		});
}
