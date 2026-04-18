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
	ProfileSchema,
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
	Profile,
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
	saveProfile,
	activateProfile,
	listProfiles,
	showProfile,
	deleteProfile,
	setUserNotes,
	getUserNotes,
	parseNoteRef,
	findNotedItem,
	refreshDescriptions,
	descriptionHash,
	rollback,
} from "./operations.js";
export type { OpResult, OpReturn, ServerResult, PluginResult, GroupResult, SkillResult, MarketplaceResult, AssignResult, ScopeResult, CollisionInfo, SkillDependencyInfo, ProfileResult, NoteResult, NotedItemType, ParsedNoteRef, DescriptionRefreshInput, DescriptionRefreshDelta, DescriptionRefreshResult, RollbackPlan } from "./operations.js";

// Clients
export { CLIENTS, detectClients, expandPath, isInstalled, serverToClientEntry, readProjectSettings, writeProjectSettings, ensureProjectEnabledPluginsKey, findOrphanedInClients, readClientConfig, getManagedServers, resolvedPaths } from "./clients.js";
export type { ClientDef, ImportedServer } from "./clients.js";

// Project discovery
export { scanClientsForProjects } from "./discovery/projects.js";
export type { DiscoveredProject } from "./discovery/projects.js";

// Library discovery (Claude Code extension scan)
export { scanLibraryGlobal, scanLibraryProject } from "./discovery/library.js";
export type { DiscoveredTool, ToolType, ToolScope } from "./discovery/library.js";

// Canonical library store (v2.0.2)
export {
	libraryRoot,
	manifestPath,
	canonicalPath,
	libraryStoreExists,
	readManifest,
	writeManifest,
	hashFile,
	bootstrapLibrary,
	listEntries,
	getEntry,
	reconcile,
	proposedId,
	adoptOrphan,
	promoteDrift,
	ignoreEntry,
	unignoreEntry,
	removeEntry,
	relinkEntrySource,
} from "./discovery/library-store.js";
export type {
	LibraryManifest,
	LibraryEntry,
	FileToolType,
	BootstrapSummary,
	ReconcileResult,
	ReconcileMatch,
	ReconcileDrift,
	ReconcileOrphan,
	ReconcileIgnored,
	DriftReason,
	AdoptResult,
} from "./discovery/library-store.js";

// Wire operations (copy/remove edges between tool and scope)
export { wireTool, unwireTool } from "./discovery/wire.js";
export type { WireRequest, UnwireRequest, WireResult, WireScope } from "./discovery/wire.js";

// Sync
export { syncClient, syncSkills, syncAllClients, computeContextCost, suggestGroupSplits, doImport } from "./sync.js";
export type { SyncResult, SyncAction, DriftInfo, SkillSyncResult, SkillSyncAction, SkillConflict, ContextCostSummary, GroupSplitSuggestion, ImportResult } from "./sync.js";

// Snapshots (v2.0.1 safe-apply and rollback)
export { capture as captureSnapshot, restore as restoreSnapshot, list as listSnapshots, latest as latestSnapshot, get as getSnapshot, prune as pruneSnapshots, snapshotsRoot } from "./snapshots.js";
export type { CaptureOptions as SnapshotCaptureOptions, RestoreResult as SnapshotRestoreResult, PruneOptions as SnapshotPruneOptions } from "./snapshots.js";
export { SnapshotSchema, SnapshotFileEntrySchema } from "./schemas.js";
export type { Snapshot, SnapshotFileEntry } from "./schemas.js";

// Settings (v2.0.1 declarative non-destructive settings.json merge)
export { mergeSettings, readOwnedKeys, buildManagedFromList, MANAGED_KEYS_FIELD } from "./settings.js";
export type { MergeResult, MergeOptions } from "./settings.js";
export { SettingSchema } from "./schemas.js";
export type { ManagedSetting } from "./schemas.js";

// Hooks (v2.0.1 canonical hooks store + fanout)
export { addHook, removeHook, getHook, listHooks, hooksRoot, describeHook, toSettingsEntry, buildHooksSettings } from "./hooks.js";
export type { AddHookParams, AddHookResult, RemoveHookResult, SettingsHookEntry } from "./hooks.js";
export { HookSchema, HookEventSchema } from "./schemas.js";
export type { Hook, HookEvent } from "./schemas.js";

// Search
export { searchAll, searchServers, searchSkills, searchPlugins, searchCapabilities, expandAliases, computeServerQualityScore, computeSkillQualityScore, QUERY_ALIASES } from "./search.js";
export type { SearchResult } from "./search.js";

// Registry
export { searchRegistries, showRegistry, listBackends, clearCache, resolveInstallParams, securitySummary, estimatedTokenCost } from "./registry.js";
export type { RegistryServer, ServerDetail, EnvVarSpec, RegistryAdapter } from "./registry.js";

// Doctor
export { runDoctor } from "./doctor.js";
export type { DoctorResult, DoctorCheck, CategoryScore } from "./doctor.js";

// Discover
export { discover, discoveredSkillToInstallParams, discoveredPluginToInstallParams } from "./discover.js";
export type { DiscoveryReport, DiscoveredSkill, DiscoveredPlugin, DiscoverOptions } from "./discover.js";

// Skills store
export { parseFrontmatter, formatFrontmatter, skillToFrontmatter, frontmatterToSkill, readSkillMd, writeSkillMd, deleteSkillMd, listSkillDirs, skillMdPath } from "./skills.js";

// Projects
export { listProjects, getProject, resolveProjectPath, isAvailable as isProjectRegistryAvailable } from "./projects.js";
export type { RegistryProject } from "./projects.js";

// Setlist capability integration
export { isSetlistAvailable, queryCapabilities as querySetlistCapabilities, getProjectCapabilities, getMcpCapabilities } from "./setlist.js";
export type { SetlistCapability } from "./setlist.js";

// Export
export { exportGroupAsPlugin } from "./export.js";
export type { ExportResult } from "./export.js";

// Secrets
export { scanSecrets, scanSkillContent } from "./secrets.js";
export type { SecretViolation } from "./secrets.js";

// Usage tracking
export { loadUsage, saveUsage, recordUsage, getUsageScore, clearUsage } from "./usage.js";
export type { UsageEntry, UsageData } from "./usage.js";

// Init
export { initAuto, detectClientLandscape, scanServerLandscape, scanSkillLandscape, importSelectedServers } from "./init.js";
export type { InitResult, DetectedClient, ServerLandscape, SkillLandscape } from "./init.js";
