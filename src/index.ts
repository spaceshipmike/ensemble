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
	RESERVED_MARKETPLACE_NAMES,
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

// Operations (pure functions)
export {
	addServer,
	removeServer,
	enableServer,
	disableServer,
	createGroup,
	deleteGroup,
	addServerToGroup,
	removeServerFromGroup,
	addPluginToGroup,
	removePluginFromGroup,
	addSkillToGroup,
	removeSkillFromGroup,
	assignClient,
	unassignClient,
	installPlugin,
	uninstallPlugin,
	enablePlugin,
	disablePlugin,
	importPlugins,
	addMarketplace,
	removeMarketplace,
	installSkill,
	uninstallSkill,
	enableSkill,
	disableSkill,
	addRule,
	removeRule,
	pinItem,
	trackItem,
	detectCollisions,
	checkSkillDependencies,
	scopeItem,
	setTrustTier,
} from "./operations.js";
export type { OpResult, OpReturn, ServerResult, PluginResult, GroupResult, SkillResult, MarketplaceResult, AssignResult, ScopeResult, CollisionInfo, SkillDependencyInfo } from "./operations.js";

// Clients
export { CLIENTS, detectClients, expandPath, isInstalled, serverToClientEntry, readProjectSettings, writeProjectSettings, ensureProjectEnabledPluginsKey, findOrphanedInClients } from "./clients.js";
export type { ClientDef, ImportedServer } from "./clients.js";

// Sync
export { syncClient, syncSkills, syncAllClients, computeContextCost, doImport } from "./sync.js";
export type { SyncResult, SyncAction, DriftInfo, SkillSyncResult, SkillSyncAction, ContextCostSummary, ImportResult } from "./sync.js";

// Search
export { searchAll, searchServers, searchSkills } from "./search.js";
export type { SearchResult } from "./search.js";

// Registry
export { searchRegistries, showRegistry, listBackends, clearCache, resolveInstallParams, securitySummary, estimatedTokenCost } from "./registry.js";
export type { RegistryServer, ServerDetail, EnvVarSpec, RegistryAdapter } from "./registry.js";

// Doctor
export { runDoctor } from "./doctor.js";
export type { DoctorResult, DoctorCheck, CategoryScore } from "./doctor.js";

// Skills store
export { parseFrontmatter, formatFrontmatter, skillToFrontmatter, frontmatterToSkill, readSkillMd, writeSkillMd, deleteSkillMd, listSkillDirs, skillMdPath } from "./skills.js";

// Projects
export { listProjects, getProject, resolveProjectPath, isAvailable as isProjectRegistryAvailable } from "./projects.js";
export type { RegistryProject } from "./projects.js";

// Export
export { exportGroupAsPlugin } from "./export.js";
export type { ExportResult } from "./export.js";

// Migration
export { migrate, needsMigration } from "./migration.js";
export type { MigrationResult, MigrationAction } from "./migration.js";

// Init
export { initAuto, detectClientLandscape, scanServerLandscape, scanSkillLandscape, importSelectedServers } from "./init.js";
export type { InitResult, DetectedClient, ServerLandscape, SkillLandscape } from "./init.js";
