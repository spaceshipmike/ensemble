/**
 * Ensemble — Central manager for MCP servers, skills, and plugins across AI clients.
 *
 * Library-first API:
 *   import { loadConfig, saveConfig } from 'ensemble';
 *   import { addServer, syncClient } from 'ensemble/operations';
 */

// Config I/O
export {
	loadConfig,
	saveConfig,
	createConfig,
	CONFIG_DIR,
	CONFIG_PATH,
	SKILLS_DIR,
	CACHE_DIR,
	computeEntryHash,
	getServer,
	getGroup,
	getClient,
	getPlugin,
	getSkill,
	getMarketplace,
	matchRule,
	resolveServers,
	resolvePlugins,
	resolveSkills,
} from "./config.js";

// Schemas and types
export {
	// Schemas
	EnsembleConfigSchema,
	ServerSchema,
	PluginSchema,
	MarketplaceSchema,
	GroupSchema,
	SkillSchema,
	PathRuleSchema,
	ClientAssignmentSchema,
	SettingsSchema,
	ServerOriginSchema,
	ToolInfoSchema,
	MarketplaceSourceSchema,
	ProjectAssignmentSchema,
	// Constants
	RESERVED_MARKETPLACE_NAMES,
	// Helpers
	qualifiedPluginName,
} from "./schemas.js";

// Re-export types
export type {
	EnsembleConfig,
	Server,
	Plugin,
	Marketplace,
	MarketplaceSource,
	Group,
	Skill,
	PathRule,
	ClientAssignment,
	ProjectAssignment,
	Settings,
	ServerOrigin,
	ToolInfo,
} from "./schemas.js";
