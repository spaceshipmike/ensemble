/**
 * Zod schemas for the Ensemble data model.
 *
 * These schemas serve as both runtime validators and the source of TypeScript types.
 * Consumers can import schemas for validation: `import { ServerSchema } from 'ensemble/schemas'`
 */

import { z } from "zod";

// --- Atomic schemas ---

export const ServerOriginSchema = z.object({
	source: z.enum(["manual", "registry", "import", "builtin"]).default("manual"),
	client: z.string().default(""),
	registry_id: z.string().default(""),
	timestamp: z.string().default(""),
	trust_tier: z.enum(["official", "community", "local"]).default("local"),
});

export const ToolInfoSchema = z.object({
	name: z.string(),
	description: z.string().default(""),
});

export const ServerSchema = z.object({
	name: z.string(),
	enabled: z.boolean().default(true),
	transport: z.enum(["stdio", "http", "sse", "streamable-http"]).default("stdio"),
	command: z.string().default(""),
	args: z.array(z.string()).default([]),
	env: z.record(z.string()).default({}),
	// HTTP transport fields
	url: z.string().default(""),
	auth_type: z.enum(["", "bearer", "api-key", "header"]).default(""),
	auth_ref: z.string().default(""),
	// Provenance
	origin: ServerOriginSchema.default({}),
	// Tool metadata
	tools: z.array(ToolInfoSchema).default([]),
});

export const PluginSchema = z.object({
	name: z.string(),
	marketplace: z.string().default(""),
	enabled: z.boolean().default(true),
	managed: z.boolean().default(true),
});

export const MarketplaceSourceSchema = z.object({
	source: z.enum(["github", "directory", "git", "url"]),
	repo: z.string().default(""),
	path: z.string().default(""),
	url: z.string().default(""),
});

export const MarketplaceSchema = z.object({
	name: z.string(),
	source: MarketplaceSourceSchema.default({ source: "directory" }),
});

export const SkillSchema = z.object({
	name: z.string(),
	enabled: z.boolean().default(true),
	description: z.string().default(""),
	path: z.string().default(""),
	origin: z.string().default(""),
	dependencies: z.array(z.string()).default([]),
	tags: z.array(z.string()).default([]),
	mode: z.enum(["pin", "track"]).default("pin"),
});

export const GroupSchema = z.object({
	name: z.string(),
	description: z.string().default(""),
	servers: z.array(z.string()).default([]),
	plugins: z.array(z.string()).default([]),
	skills: z.array(z.string()).default([]),
});

export const PathRuleSchema = z.object({
	path: z.string(),
	group: z.string(),
});

export const ProjectAssignmentSchema = z.object({
	path: z.string(),
	group: z.string().nullable().default(null),
	last_synced: z.string().nullable().default(null),
});

export const ClientAssignmentSchema = z.object({
	id: z.string(),
	group: z.string().nullable().default(null),
	last_synced: z.string().nullable().default(null),
	projects: z.record(z.object({
		group: z.string().nullable().default(null),
		last_synced: z.string().nullable().default(null),
	})).default({}),
	server_hashes: z.record(z.string()).default({}),
});

export const SettingsSchema = z.object({
	adopt_unmanaged_plugins: z.boolean().default(false),
	registry_cache_ttl: z.number().default(3600),
	sync_cost_warning_threshold: z.number().default(50),
});

export const EnsembleConfigSchema = z.object({
	servers: z.array(ServerSchema).default([]),
	groups: z.array(GroupSchema).default([]),
	clients: z.array(ClientAssignmentSchema).default([]),
	plugins: z.array(PluginSchema).default([]),
	marketplaces: z.array(MarketplaceSchema).default([]),
	rules: z.array(PathRuleSchema).default([]),
	skills: z.array(SkillSchema).default([]),
	settings: SettingsSchema.default({}),
}).passthrough();

// --- Inferred types ---

export type ServerOrigin = z.infer<typeof ServerOriginSchema>;
export type ToolInfo = z.infer<typeof ToolInfoSchema>;
export type Server = z.infer<typeof ServerSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
export type MarketplaceSource = z.infer<typeof MarketplaceSourceSchema>;
export type Marketplace = z.infer<typeof MarketplaceSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type PathRule = z.infer<typeof PathRuleSchema>;
export type ProjectAssignment = z.infer<typeof ProjectAssignmentSchema>;
export type ClientAssignment = z.infer<typeof ClientAssignmentSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type EnsembleConfig = z.infer<typeof EnsembleConfigSchema>;

// --- Constants ---

export const RESERVED_MARKETPLACE_NAMES = new Set([
	"claude-code-marketplace",
	"claude-code-plugins",
	"claude-plugins-official",
	"anthropic-marketplace",
	"anthropic-plugins",
	"agent-skills",
	"life-sciences",
]);

// --- Helpers ---

/** Get the qualified name of a plugin (name@marketplace). */
export function qualifiedPluginName(plugin: Plugin): string {
	return plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name;
}
