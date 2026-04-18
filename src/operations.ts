/**
 * Pure business logic for all mutations — shared by CLI and app consumers.
 *
 * Every function takes an EnsembleConfig and returns { config, result }.
 * No I/O. No side effects. Callers are responsible for saving.
 */

import { resolve } from "node:path";
import { CLIENTS } from "./clients.js";
import { getAgent, getClient, getCommand, getGroup, getMarketplace, getPlugin, getServer, getSkill } from "./config.js";
import { expandPath } from "./clients.js";
import type {
	Agent,
	Command,
	EnsembleConfig,
	Group,
	Hook,
	InstallClientRecord,
	InstallState,
	LibraryResource,
	Marketplace,
	MarketplaceSource,
	ManagedSetting,
	PivotSpec,
	Plugin,
	Profile,
	ResourceType,
	Server,
	ServerOrigin,
	Skill,
	ToolInfo,
} from "./schemas.js";
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

export interface AgentResult extends OpResult {
	agent: Agent | null;
}

export interface CommandResult extends OpResult {
	command: Command | null;
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
		installState: {},
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

	const plugin: Plugin = {
		name,
		marketplace: resolvedMarketplace,
		enabled: true,
		managed: true,
		installState: {},
	};
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

		const plugin: Plugin = {
			name: pname!,
			marketplace: mkt!,
			enabled: isEnabled,
			managed: false,
			installState: {},
		};
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
		installState: {},
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

// --- Agent operations (pure — no disk I/O for *.md files) ---

export function installAgent(
	config: EnsembleConfig,
	params: {
		name: string;
		description?: string;
		tools?: string[];
		model?: string;
		path?: string;
	},
): OpReturn<AgentResult> {
	if (getAgent(config, params.name)) {
		return { config, result: { ...fail(`Agent '${params.name}' already exists.`), agent: null } };
	}

	const agent: Agent = {
		name: params.name,
		enabled: true,
		description: params.description ?? "",
		tools: params.tools ?? [],
		...(params.model ? { model: params.model } : {}),
		path: params.path ?? "",
		installState: {},
	};

	const agents = config.agents ?? [];
	return {
		config: { ...config, agents: [...agents, agent] },
		result: { ...ok([`Installed agent '${params.name}'.`]), agent },
	};
}

export function uninstallAgent(config: EnsembleConfig, name: string): OpReturn<AgentResult> {
	const agent = getAgent(config, name);
	if (!agent) {
		return { config, result: { ...fail(`Agent '${name}' not found.`), agent: null } };
	}

	const agents = config.agents ?? [];
	return {
		config: {
			...config,
			agents: agents.filter((a) => a.name !== name),
		},
		result: { ...ok([`Removed agent '${name}'.`]), agent },
	};
}

export function enableAgent(config: EnsembleConfig, name: string): OpReturn<AgentResult> {
	const agent = getAgent(config, name);
	if (!agent) {
		return { config, result: { ...fail(`Agent '${name}' not found.`), agent: null } };
	}
	const updated = { ...agent, enabled: true };
	const agents = config.agents ?? [];
	return {
		config: { ...config, agents: agents.map((a) => (a.name === name ? updated : a)) },
		result: { ...ok([`Enabled agent '${name}'.`]), agent: updated },
	};
}

export function disableAgent(config: EnsembleConfig, name: string): OpReturn<AgentResult> {
	const agent = getAgent(config, name);
	if (!agent) {
		return { config, result: { ...fail(`Agent '${name}' not found.`), agent: null } };
	}
	const updated = { ...agent, enabled: false };
	const agents = config.agents ?? [];
	return {
		config: { ...config, agents: agents.map((a) => (a.name === name ? updated : a)) },
		result: { ...ok([`Disabled agent '${name}'.`]), agent: updated },
	};
}

// --- Command operations (pure — no disk I/O for *.md files) ---

export function installCommand(
	config: EnsembleConfig,
	params: {
		name: string;
		description?: string;
		allowedTools?: string[];
		argumentHint?: string;
		path?: string;
	},
): OpReturn<CommandResult> {
	if (getCommand(config, params.name)) {
		return {
			config,
			result: { ...fail(`Command '${params.name}' already exists.`), command: null },
		};
	}

	const command: Command = {
		name: params.name,
		enabled: true,
		description: params.description ?? "",
		allowedTools: params.allowedTools ?? [],
		...(params.argumentHint ? { argumentHint: params.argumentHint } : {}),
		path: params.path ?? "",
		installState: {},
	};

	const commands = config.commands ?? [];
	return {
		config: { ...config, commands: [...commands, command] },
		result: { ...ok([`Installed command '${params.name}'.`]), command },
	};
}

export function uninstallCommand(config: EnsembleConfig, name: string): OpReturn<CommandResult> {
	const command = getCommand(config, name);
	if (!command) {
		return { config, result: { ...fail(`Command '${name}' not found.`), command: null } };
	}
	const commands = config.commands ?? [];
	return {
		config: { ...config, commands: commands.filter((c) => c.name !== name) },
		result: { ...ok([`Removed command '${name}'.`]), command },
	};
}

export function enableCommand(config: EnsembleConfig, name: string): OpReturn<CommandResult> {
	const command = getCommand(config, name);
	if (!command) {
		return { config, result: { ...fail(`Command '${name}' not found.`), command: null } };
	}
	const updated = { ...command, enabled: true };
	const commands = config.commands ?? [];
	return {
		config: { ...config, commands: commands.map((c) => (c.name === name ? updated : c)) },
		result: { ...ok([`Enabled command '${name}'.`]), command: updated },
	};
}

export function disableCommand(config: EnsembleConfig, name: string): OpReturn<CommandResult> {
	const command = getCommand(config, name);
	if (!command) {
		return { config, result: { ...fail(`Command '${name}' not found.`), command: null } };
	}
	const updated = { ...command, enabled: false };
	const commands = config.commands ?? [];
	return {
		config: { ...config, commands: commands.map((c) => (c.name === name ? updated : c)) },
		result: { ...ok([`Disabled command '${name}'.`]), command: updated },
	};
}

// --- Description refresh (v2.0.3 #notes-and-descriptions) ---

/**
 * SHA-256 of a description string, used by doctor to detect when a re-import
 * actually changed the source-owned text. Empty / undefined → empty hash.
 */
export function descriptionHash(text: string | undefined | null): string {
	if (!text) return "";
	// Cheap deterministic hash — Node's createHash is sync and dependency-free.
	const { createHash } = require("node:crypto") as typeof import("node:crypto");
	return createHash("sha256").update(text).digest("hex");
}

export interface DescriptionRefreshInput {
	type: NotedItemType;
	name: string;
	/** Optional plugin marketplace disambiguator. */
	marketplace?: string;
	/** New source-owned description text. Empty string is allowed (clears it). */
	newDescription: string;
}

export interface DescriptionRefreshDelta {
	type: NotedItemType;
	name: string;
	oldDescription: string;
	newDescription: string;
	oldHash: string;
	newHash: string;
	changed: boolean;
}

export interface DescriptionRefreshResult extends OpResult {
	refreshed: DescriptionRefreshDelta[];
}

/**
 * Refresh source-owned descriptions on servers / skills / plugins from upstream
 * metadata. CRITICAL contract (v2.0.3 #notes-and-descriptions): userNotes is
 * never read or written by this function — re-import only touches description
 * and lastDescriptionHash. The returned manifest of deltas powers doctor's
 * "descriptions refreshed" finding.
 *
 * Pure: returns a fresh config and the delta list.
 */
export function refreshDescriptions(
	config: EnsembleConfig,
	inputs: DescriptionRefreshInput[],
): OpReturn<DescriptionRefreshResult> {
	const deltas: DescriptionRefreshDelta[] = [];
	let next: EnsembleConfig = config;

	for (const input of inputs) {
		const newHash = descriptionHash(input.newDescription);

		if (input.type === "server") {
			const idx = next.servers.findIndex((s) => s.name === input.name);
			if (idx < 0) continue;
			const cur = next.servers[idx]!;
			const oldDescription = cur.description ?? "";
			const oldHash = cur.lastDescriptionHash ?? descriptionHash(oldDescription);
			const updated: Server = {
				...cur,
				description: input.newDescription,
				lastDescriptionHash: newHash,
				// userNotes intentionally untouched — re-import preservation contract.
			};
			next = { ...next, servers: next.servers.map((s, i) => (i === idx ? updated : s)) };
			deltas.push({
				type: "server",
				name: input.name,
				oldDescription,
				newDescription: input.newDescription,
				oldHash,
				newHash,
				changed: oldHash !== newHash,
			});
		} else if (input.type === "skill") {
			const idx = next.skills.findIndex((s) => s.name === input.name);
			if (idx < 0) continue;
			const cur = next.skills[idx]!;
			const oldDescription = cur.description ?? "";
			const oldHash = cur.lastDescriptionHash ?? descriptionHash(oldDescription);
			const updated: Skill = {
				...cur,
				description: input.newDescription,
				lastDescriptionHash: newHash,
			};
			next = { ...next, skills: next.skills.map((s, i) => (i === idx ? updated : s)) };
			deltas.push({
				type: "skill",
				name: input.name,
				oldDescription,
				newDescription: input.newDescription,
				oldHash,
				newHash,
				changed: oldHash !== newHash,
			});
		} else {
			const idx = next.plugins.findIndex((p) =>
				p.name === input.name && (input.marketplace ? p.marketplace === input.marketplace : true),
			);
			if (idx < 0) continue;
			const cur = next.plugins[idx]!;
			const oldDescription = cur.description ?? "";
			const oldHash = cur.lastDescriptionHash ?? descriptionHash(oldDescription);
			const updated: Plugin = {
				...cur,
				description: input.newDescription,
				lastDescriptionHash: newHash,
			};
			next = { ...next, plugins: next.plugins.map((p, i) => (i === idx ? updated : p)) };
			deltas.push({
				type: "plugin",
				name: input.name,
				oldDescription,
				newDescription: input.newDescription,
				oldHash,
				newHash,
				changed: oldHash !== newHash,
			});
		}
	}

	const changedCount = deltas.filter((d) => d.changed).length;
	const msg =
		changedCount === 0
			? "No descriptions refreshed."
			: `Refreshed ${changedCount} description${changedCount === 1 ? "" : "s"}.`;
	return {
		config: next,
		result: { ...ok([msg]), refreshed: deltas },
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

// --- Rollback planning (v2.0.1 safe-apply) ---

export interface RollbackPlan extends OpResult {
	snapshotId: string | null;
}

/**
 * Plan a rollback to a previous snapshot. Pure — returns the chosen snapshot
 * id, nothing else. The caller (CLI, desktop bridge) invokes
 * `snapshots.restore(snapshotId)` to perform the I/O.
 *
 * `params.snapshotId` pins a specific snapshot; otherwise pass the output of
 * `snapshots.latest()?.id` as `params.latestId` to signal "restore most
 * recent". We keep this op pure by accepting the candidate id as input rather
 * than reading disk.
 */
export function rollback(
	config: EnsembleConfig,
	params: { snapshotId?: string; latestId?: string | null },
): OpReturn<RollbackPlan> {
	const picked = params.snapshotId ?? params.latestId ?? null;
	if (!picked) {
		return {
			config,
			result: {
				...fail("No snapshot available to restore."),
				snapshotId: null,
			},
		};
	}
	return {
		config,
		result: {
			...ok([`Restoring snapshot '${picked}'.`]),
			snapshotId: picked,
		},
	};
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

// --- Library-first lifecycle (v2.0.1) ---------------------------------------
//
// These operations treat the library as the source of truth and install state
// as a per-resource matrix. They live side-by-side with the v1.3 verbs during
// the migration window. The v1.3 verbs are removed in chunk 13 after the user
// has run `ensemble import-legacy`.
//
// Every helper is pure: it reads and returns config, never performs I/O.

export interface LibraryResourceResult extends OpResult {
	type: ResourceType;
	name: string;
}

export interface InstallStateResult extends OpResult {
	type: ResourceType;
	name: string;
	installState: InstallState;
}

export interface PullResult extends OpResult {
	type: ResourceType;
	name: string;
	alreadyPresent: boolean;
}

/** Read helper — find a library resource by (name, type). Returns the
 *  wrapped tagged-union entry or null if it isn't in the library. */
export function getLibraryResource(
	config: EnsembleConfig,
	name: string,
	type: ResourceType,
): LibraryResource | null {
	switch (type) {
		case "server": {
			const s = config.servers.find((x) => x.name === name);
			return s ? { type: "server", resource: s } : null;
		}
		case "skill": {
			const s = config.skills.find((x) => x.name === name);
			return s ? { type: "skill", resource: s } : null;
		}
		case "plugin": {
			const p = config.plugins.find((x) => x.name === name);
			return p ? { type: "plugin", resource: p } : null;
		}
		case "agent": {
			const a = (config.agents ?? []).find((x) => x.name === name);
			return a ? { type: "agent", resource: a } : null;
		}
		case "command": {
			const c = (config.commands ?? []).find((x) => x.name === name);
			return c ? { type: "command", resource: c } : null;
		}
		case "hook": {
			const h = ((config as EnsembleConfig & { hooks?: Hook[] }).hooks ?? []).find(
				(x) => x.name === name,
			);
			return h ? { type: "hook", resource: h } : null;
		}
		case "setting": {
			const s = (
				(config as EnsembleConfig & { managedSettings?: ManagedSetting[] }).managedSettings ?? []
			).find((x) => x.keyPath === name);
			return s ? { type: "setting", resource: s } : null;
		}
	}
}

/** List every library resource across all seven types, wrapped in their
 *  tagged-union envelope. Useful for pivot filters and display. */
export function listLibraryResources(config: EnsembleConfig): LibraryResource[] {
	const out: LibraryResource[] = [];
	for (const s of config.servers) out.push({ type: "server", resource: s });
	for (const s of config.skills) out.push({ type: "skill", resource: s });
	for (const p of config.plugins) out.push({ type: "plugin", resource: p });
	for (const a of config.agents ?? []) out.push({ type: "agent", resource: a });
	for (const c of config.commands ?? []) out.push({ type: "command", resource: c });
	const hooks = (config as EnsembleConfig & { hooks?: Hook[] }).hooks ?? [];
	for (const h of hooks) out.push({ type: "hook", resource: h });
	const settings =
		(config as EnsembleConfig & { managedSettings?: ManagedSetting[] }).managedSettings ?? [];
	for (const s of settings) out.push({ type: "setting", resource: s });
	return out;
}

/** Read the per-client/per-project install matrix for a single resource. */
export function getInstallState(
	config: EnsembleConfig,
	params: { name: string; type: ResourceType },
): InstallState {
	const entry = getLibraryResource(config, params.name, params.type);
	if (!entry) return {};
	const res = entry.resource as { installState?: InstallState };
	return res.installState ?? {};
}

/** Filter the library through a pivot view. Returns only resources that
 *  match the pivot's criteria. */
export function getLibraryByPivot(
	config: EnsembleConfig,
	pivot: PivotSpec,
): LibraryResource[] {
	const all = listLibraryResources(config);
	switch (pivot.kind) {
		case "library":
			return all;
		case "project": {
			const target = pivot.path;
			return all.filter((r) => {
				const matrix =
					(r.resource as { installState?: InstallState }).installState ?? {};
				for (const entry of Object.values(matrix)) {
					if (target === undefined && entry.projects.length > 0) return true;
					if (target !== undefined && entry.projects.includes(target)) return true;
				}
				return false;
			});
		}
		case "group": {
			const group = getGroup(config, pivot.name);
			if (!group) return [];
			const members = new Set<string>();
			for (const n of group.servers) members.add(`server:${n}`);
			for (const n of group.plugins) members.add(`plugin:${n}`);
			for (const n of group.skills) members.add(`skill:${n}`);
			return all.filter((r) => {
				const key = `${r.type}:${r.type === "setting" ? r.resource.keyPath : r.resource.name}`;
				return members.has(key);
			});
		}
		case "client": {
			const { client, scope, project } = pivot;
			return all.filter((r) => {
				const record = (r.resource as { installState?: InstallState }).installState?.[client];
				if (!record) return false;
				if (scope === "user") return record.installed;
				if (scope === "project") {
					if (project === undefined) return record.projects.length > 0;
					return record.projects.includes(project);
				}
				return record.installed || record.projects.length > 0;
			});
		}
		case "marketplace": {
			return all.filter((r) => {
				if (r.type === "plugin") return r.resource.marketplace === pivot.name;
				if (r.type === "server") return r.resource.origin.client === pivot.name;
				return false;
			});
		}
	}
}

// --- Library-write helpers ---------------------------------------------------

/** Return a new config with `replacement` swapped in for the matching entry
 *  of the given type/name. Silently returns the original config if the
 *  entry isn't found. */
function replaceLibraryResource(
	config: EnsembleConfig,
	name: string,
	type: ResourceType,
	mutator: (r: LibraryResource["resource"]) => LibraryResource["resource"],
): EnsembleConfig {
	switch (type) {
		case "server":
			return {
				...config,
				servers: config.servers.map((s) => (s.name === name ? (mutator(s) as Server) : s)),
			};
		case "skill":
			return {
				...config,
				skills: config.skills.map((s) => (s.name === name ? (mutator(s) as Skill) : s)),
			};
		case "plugin":
			return {
				...config,
				plugins: config.plugins.map((p) => (p.name === name ? (mutator(p) as Plugin) : p)),
			};
		case "agent":
			return {
				...config,
				agents: (config.agents ?? []).map((a) =>
					a.name === name ? (mutator(a) as Agent) : a,
				),
			};
		case "command":
			return {
				...config,
				commands: (config.commands ?? []).map((c) =>
					c.name === name ? (mutator(c) as Command) : c,
				),
			};
		case "hook": {
			const hooks = (config as EnsembleConfig & { hooks?: Hook[] }).hooks ?? [];
			return {
				...config,
				hooks: hooks.map((h) => (h.name === name ? (mutator(h) as Hook) : h)),
			} as EnsembleConfig;
		}
		case "setting": {
			const settings =
				(config as EnsembleConfig & { managedSettings?: ManagedSetting[] })
					.managedSettings ?? [];
			return {
				...config,
				managedSettings: settings.map((s) =>
					s.keyPath === name ? (mutator(s) as ManagedSetting) : s,
				),
			} as EnsembleConfig;
		}
	}
}

/** Return a new config with the matching library entry evicted. */
function removeLibraryEntry(
	config: EnsembleConfig,
	name: string,
	type: ResourceType,
): EnsembleConfig {
	switch (type) {
		case "server":
			return { ...config, servers: config.servers.filter((s) => s.name !== name) };
		case "skill":
			return { ...config, skills: config.skills.filter((s) => s.name !== name) };
		case "plugin":
			return { ...config, plugins: config.plugins.filter((p) => p.name !== name) };
		case "agent":
			return {
				...config,
				agents: (config.agents ?? []).filter((a) => a.name !== name),
			};
		case "command":
			return {
				...config,
				commands: (config.commands ?? []).filter((c) => c.name !== name),
			};
		case "hook": {
			const hooks = (config as EnsembleConfig & { hooks?: Hook[] }).hooks ?? [];
			return { ...config, hooks: hooks.filter((h) => h.name !== name) } as EnsembleConfig;
		}
		case "setting": {
			const settings =
				(config as EnsembleConfig & { managedSettings?: ManagedSetting[] })
					.managedSettings ?? [];
			return {
				...config,
				managedSettings: settings.filter((s) => s.keyPath !== name),
			} as EnsembleConfig;
		}
	}
}

/**
 * Pull a resource from an external marketplace into the library. Library-only —
 * install state stays empty, no client config is mutated. Idempotent: a repeat
 * pull of the same (name, type) is a gentle no-op.
 */
export function pullFromMarketplace(
	config: EnsembleConfig,
	params: {
		name: string;
		type: ResourceType;
		marketplace?: string;
		origin?: Partial<ServerOrigin>;
		command?: string;
		args?: string[];
		env?: Record<string, string>;
		description?: string;
		path?: string;
	},
): OpReturn<PullResult> {
	const existing = getLibraryResource(config, params.name, params.type);
	if (existing) {
		return {
			config,
			result: {
				...ok([`'${params.name}' is already in the library.`]),
				type: params.type,
				name: params.name,
				alreadyPresent: true,
			},
		};
	}

	// Delegate to the type-specific library-add helper below.
	const added = addToLibrary(config, params);
	if (!added.result.ok) {
		return {
			config,
			result: {
				ok: false,
				error: added.result.error,
				messages: [],
				type: params.type,
				name: params.name,
				alreadyPresent: false,
			},
		};
	}
	return {
		config: added.config,
		result: {
			...ok([`Pulled '${params.name}' into the library.`]),
			type: params.type,
			name: params.name,
			alreadyPresent: false,
		},
	};
}

/**
 * Add a resource to the library from a local source (or explicit params).
 * Strict library-first: installState stays empty unless the caller passes
 * an explicit `install` spec.
 */
export function addToLibrary(
	config: EnsembleConfig,
	params: {
		name: string;
		type: ResourceType;
		// Server params
		command?: string;
		args?: string[];
		env?: Record<string, string>;
		url?: string;
		// Skill/agent/command params
		description?: string;
		path?: string;
		// Plugin params
		marketplace?: string;
		// Hook params
		event?: Hook["event"];
		matcher?: string;
		// Setting params
		value?: unknown;
		// Origin and optional install directive
		origin?: Partial<ServerOrigin>;
		install?: { client: string; project?: string };
	},
): OpReturn<LibraryResourceResult> {
	const existing = getLibraryResource(config, params.name, params.type);
	if (existing) {
		return {
			config,
			result: {
				...fail(`'${params.name}' is already in the library.`),
				type: params.type,
				name: params.name,
			},
		};
	}

	let newConfig = config;
	switch (params.type) {
		case "server": {
			const server: Server = {
				name: params.name,
				enabled: true,
				transport: "stdio",
				command: params.command ?? "",
				args: params.args ?? [],
				env: params.env ?? {},
				url: params.url ?? "",
				auth_type: "",
				auth_ref: "",
				origin: {
					source: params.origin?.source ?? "manual",
					client: params.origin?.client ?? "",
					registry_id: params.origin?.registry_id ?? "",
					timestamp: params.origin?.timestamp ?? new Date().toISOString(),
					trust_tier: params.origin?.trust_tier ?? "local",
				},
				tools: [],
				installState: {},
			};
			newConfig = { ...newConfig, servers: [...newConfig.servers, server] };
			break;
		}
		case "skill": {
			const skill: Skill = {
				name: params.name,
				enabled: true,
				description: params.description ?? "",
				path: params.path ?? "",
				origin: params.origin?.source ?? "manual",
				dependencies: [],
				tags: [],
				mode: "pin",
				installState: {},
			};
			newConfig = { ...newConfig, skills: [...newConfig.skills, skill] };
			break;
		}
		case "plugin": {
			const plugin: Plugin = {
				name: params.name,
				marketplace: params.marketplace ?? "",
				enabled: true,
				managed: true,
				installState: {},
			};
			newConfig = { ...newConfig, plugins: [...newConfig.plugins, plugin] };
			break;
		}
		case "agent": {
			const agent: Agent = {
				name: params.name,
				enabled: true,
				description: params.description ?? "",
				tools: [],
				path: params.path ?? "",
				installState: {},
			};
			newConfig = {
				...newConfig,
				agents: [...(newConfig.agents ?? []), agent],
			};
			break;
		}
		case "command": {
			const command: Command = {
				name: params.name,
				enabled: true,
				description: params.description ?? "",
				allowedTools: [],
				path: params.path ?? "",
				installState: {},
			};
			newConfig = {
				...newConfig,
				commands: [...(newConfig.commands ?? []), command],
			};
			break;
		}
		case "hook": {
			if (!params.event || !params.matcher || !params.command) {
				return {
					config,
					result: {
						...fail(
							"Hook resources require event, matcher, and command parameters.",
						),
						type: params.type,
						name: params.name,
					},
				};
			}
			const hook: Hook = {
				name: params.name,
				event: params.event,
				matcher: params.matcher,
				command: params.command,
				installState: {},
			};
			const existingHooks =
				((newConfig as EnsembleConfig & { hooks?: Hook[] }).hooks ?? []) as Hook[];
			newConfig = {
				...newConfig,
				hooks: [...existingHooks, hook],
			} as EnsembleConfig;
			break;
		}
		case "setting": {
			if (params.value === undefined) {
				return {
					config,
					result: {
						...fail("Managed settings require a value parameter."),
						type: params.type,
						name: params.name,
					},
				};
			}
			const setting: ManagedSetting = {
				keyPath: params.name,
				value: params.value,
				installState: {},
			};
			const existingSettings =
				((newConfig as EnsembleConfig & { managedSettings?: ManagedSetting[] })
					.managedSettings ?? []) as ManagedSetting[];
			newConfig = {
				...newConfig,
				managedSettings: [...existingSettings, setting],
			} as EnsembleConfig;
			break;
		}
	}

	// If the caller explicitly asked for an install as part of the add,
	// apply it now so the matrix is populated in one call.
	if (params.install) {
		const installed = installResource(newConfig, {
			name: params.name,
			type: params.type,
			client: params.install.client,
			project: params.install.project,
		});
		if (!installed.result.ok) {
			return {
				config: newConfig,
				result: {
					...ok([
						`Added '${params.name}' to the library (install step: ${installed.result.error}).`,
					]),
					type: params.type,
					name: params.name,
				},
			};
		}
		newConfig = installed.config;
	}

	return {
		config: newConfig,
		result: {
			...ok([`Added '${params.name}' to the library.`]),
			type: params.type,
			name: params.name,
		},
	};
}

/**
 * Destructive remove from library. Cascades uninstalls across every client
 * and project the resource is installed on, then evicts the library entry.
 */
export function removeFromLibrary(
	config: EnsembleConfig,
	params: { name: string; type: ResourceType },
): OpReturn<LibraryResourceResult> {
	const existing = getLibraryResource(config, params.name, params.type);
	if (!existing) {
		return {
			config,
			result: {
				...fail(`'${params.name}' is not in the library.`),
				type: params.type,
				name: params.name,
			},
		};
	}

	let newConfig = config;
	const matrix = getInstallState(newConfig, { name: params.name, type: params.type });

	// Cascade uninstalls so any sync after this produces clean client configs.
	for (const [clientId, record] of Object.entries(matrix)) {
		if (record.installed) {
			const un = uninstallResource(newConfig, {
				name: params.name,
				type: params.type,
				client: clientId,
			});
			if (un.result.ok) newConfig = un.config;
		}
		for (const proj of record.projects) {
			const un = uninstallResource(newConfig, {
				name: params.name,
				type: params.type,
				client: clientId,
				project: proj,
			});
			if (un.result.ok) newConfig = un.config;
		}
	}

	newConfig = removeLibraryEntry(newConfig, params.name, params.type);
	return {
		config: newConfig,
		result: {
			...ok([`Removed '${params.name}' from the library.`]),
			type: params.type,
			name: params.name,
		},
	};
}

/**
 * Install a library resource onto a client (optionally at a project scope).
 * Fails if the client doesn't support project scoping and a project was
 * requested — strict, not best-effort.
 */
export function installResource(
	config: EnsembleConfig,
	params: { name: string; type: ResourceType; client: string; project?: string },
): OpReturn<InstallStateResult> {
	const entry = getLibraryResource(config, params.name, params.type);
	if (!entry) {
		return {
			config,
			result: {
				...fail(`'${params.name}' is not in the library.`),
				type: params.type,
				name: params.name,
				installState: {},
			},
		};
	}

	const clientDef = CLIENTS[params.client];
	if (!clientDef) {
		return {
			config,
			result: {
				...fail(`Unknown client '${params.client}'.`),
				type: params.type,
				name: params.name,
				installState: {},
			},
		};
	}

	if (params.project && !clientDef.supportsProjectScoping) {
		return {
			config,
			result: {
				...fail(
					`Client '${params.client}' does not support per-project install state. Drop --project to install at user scope.`,
				),
				type: params.type,
				name: params.name,
				installState: {},
			},
		};
	}

	const projectAbs = params.project ? resolve(expandPath(params.project)) : undefined;

	const newConfig = replaceLibraryResource(config, params.name, params.type, (r) => {
		const curr: InstallState = (r as { installState?: InstallState }).installState ?? {};
		const record: InstallClientRecord = curr[params.client]
			? { installed: curr[params.client]!.installed, projects: [...curr[params.client]!.projects] }
			: { installed: false, projects: [] };
		if (projectAbs) {
			if (!record.projects.includes(projectAbs)) record.projects.push(projectAbs);
		} else {
			record.installed = true;
		}
		return { ...r, installState: { ...curr, [params.client]: record } } as typeof r;
	});

	const newState = getInstallState(newConfig, params);
	const scopeLabel = projectAbs ? `${params.client} (project ${projectAbs})` : params.client;
	return {
		config: newConfig,
		result: {
			...ok([`Installed '${params.name}' on ${scopeLabel}.`]),
			type: params.type,
			name: params.name,
			installState: newState,
		},
	};
}

/**
 * Uninstall a library resource from a client (optionally a single project
 * scope). The library entry is untouched — it remains available to re-install.
 */
export function uninstallResource(
	config: EnsembleConfig,
	params: { name: string; type: ResourceType; client: string; project?: string },
): OpReturn<InstallStateResult> {
	const entry = getLibraryResource(config, params.name, params.type);
	if (!entry) {
		return {
			config,
			result: {
				...fail(`'${params.name}' is not in the library.`),
				type: params.type,
				name: params.name,
				installState: {},
			},
		};
	}

	const clientDef = CLIENTS[params.client];
	if (!clientDef) {
		return {
			config,
			result: {
				...fail(`Unknown client '${params.client}'.`),
				type: params.type,
				name: params.name,
				installState: {},
			},
		};
	}

	if (params.project && !clientDef.supportsProjectScoping) {
		return {
			config,
			result: {
				...fail(
					`Client '${params.client}' does not support per-project install state. Drop --project to uninstall at user scope.`,
				),
				type: params.type,
				name: params.name,
				installState: {},
			},
		};
	}

	const projectAbs = params.project ? resolve(expandPath(params.project)) : undefined;

	const newConfig = replaceLibraryResource(config, params.name, params.type, (r) => {
		const curr: InstallState = (r as { installState?: InstallState }).installState ?? {};
		const existing = curr[params.client];
		if (!existing) return r;
		const next: InstallClientRecord = {
			installed: existing.installed,
			projects: [...existing.projects],
		};
		if (projectAbs) {
			next.projects = next.projects.filter((p) => p !== projectAbs);
		} else {
			next.installed = false;
		}
		// Drop the client key entirely when the record is empty.
		const matrix = { ...curr };
		if (next.installed || next.projects.length > 0) {
			matrix[params.client] = next;
		} else {
			delete matrix[params.client];
		}
		return { ...r, installState: matrix } as typeof r;
	});

	const newState = getInstallState(newConfig, params);
	const scopeLabel = projectAbs ? `${params.client} (project ${projectAbs})` : params.client;
	return {
		config: newConfig,
		result: {
			...ok([`Uninstalled '${params.name}' from ${scopeLabel}.`]),
			type: params.type,
			name: params.name,
			installState: newState,
		},
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
