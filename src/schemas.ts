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
	// Notes & description (v2.0.3 #server-model-fields)
	// `description` is source-owned (auto-populated from upstream registry metadata,
	// refreshed on re-import). `userNotes` is user-owned freeform text that
	// re-import never touches. `lastDescriptionHash` lets doctor surface
	// "descriptions refreshed" findings on re-import.
	description: z.string().optional(),
	userNotes: z.string().optional(),
	lastDescriptionHash: z.string().optional(),
});

export const PluginSchema = z.object({
	name: z.string(),
	marketplace: z.string().default(""),
	enabled: z.boolean().default(true),
	managed: z.boolean().default(true),
	// Notes & description (v2.0.3 #plugin-model-fields)
	description: z.string().optional(),
	userNotes: z.string().optional(),
	lastDescriptionHash: z.string().optional(),
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
	// Source-owned (v2.0.3 #skill-model-fields): description comes from SKILL.md
	// frontmatter and is overwritten on re-import.
	description: z.string().default(""),
	path: z.string().default(""),
	origin: z.string().default(""),
	dependencies: z.array(z.string()).default([]),
	tags: z.array(z.string()).default([]),
	mode: z.enum(["pin", "track"]).default("pin"),
	// Notes & description hash (v2.0.3)
	userNotes: z.string().optional(),
	lastDescriptionHash: z.string().optional(),
});

// TODO(v2.0.3): When agents.ts / commands.ts / hooks.ts modules land, their
// schemas should include both `description` (source-owned, refreshed on
// re-import) and `userNotes` (user-owned, preserved across re-imports) from
// day one — same shape as ServerSchema / PluginSchema / SkillSchema above.

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
	usage_tracking: z.boolean().default(false),
	// v2.0.1 safe-apply: how many days of snapshots to keep before pruning.
	// 0 disables pruning.
	snapshot_retention_days: z.number().int().min(0).default(30),
});

// --- Hook schema (v2.0.1 canonical hooks store) ---

/**
 * The seven Claude Code lifecycle events a hook can bind to.
 * See https://docs.claude.com/en/docs/claude-code/hooks.
 */
export const HookEventSchema = z.enum([
	"PreToolUse",
	"PostToolUse",
	"SessionStart",
	"UserPromptSubmit",
	"PreCompact",
	"Stop",
	"Notification",
]);

/**
 * A library hook entry. `name` is the stable id under
 * `~/.config/ensemble/hooks/<name>.json`. `event` and `matcher` are required;
 * `matcher` may be a literal tool name or a regex. `command` is the shell
 * command the hook invokes.
 *
 * `description` is source-owned and auto-computed from `${event} → ${matcher}`
 * (see src/hooks.ts). It is never round-tripped into settings.json — it lives
 * on the library entry for operator context. `userNotes` is user-owned
 * freeform text, also library-side only, honouring the dual-field contract.
 */
export const HookSchema = z.object({
	name: z.string().min(1),
	event: HookEventSchema,
	matcher: z.string().min(1),
	command: z.string().min(1),
	// description is auto-computed on serialize (not stored in the library JSON)
	description: z.string().optional(),
	userNotes: z.string().optional(),
});

// --- Managed settings schema (v2.0.1 non-destructive settings.json merge) ---

/**
 * A single declarative managed setting — one key path inside a client's
 * settings.json, a value, and an optional user-authored note.
 *
 * The `userNotes` field is user-owned (never round-tripped into settings.json
 * itself) — it lives on the library entry for operator context. The `keyPath`
 * is a dot-separated path (e.g., "permissions.allow", "hooks.PreToolUse").
 */
export const SettingSchema = z.object({
	keyPath: z.string().min(1),
	value: z.unknown(),
	userNotes: z.string().optional(),
});

// --- Snapshot schemas (v2.0.1 safe-apply and rollback) ---

export const SnapshotFileEntrySchema = z.object({
	/** Absolute path that was captured. */
	path: z.string(),
	/** "existing" means the file had content pre-sync and preContentPath points to its snapshot copy.
	 *  "new-file" means the file did not exist pre-sync and rollback must delete it. */
	state: z.enum(["existing", "new-file"]),
	/** Path (relative to the snapshot dir) to the verbatim pre-write copy of this file.
	 *  Only set when state === "existing". */
	preContentPath: z.string().optional(),
});

export const SnapshotSchema = z.object({
	/** Stable snapshot id: "<iso-timestamp>-<hash6>". Used as the directory name. */
	id: z.string(),
	/** ISO-8601 timestamp when the snapshot was captured. */
	createdAt: z.string(),
	/** Optional free-form label describing why the snapshot was taken
	 *  (e.g., "sync claude-code", "hook add lint"). */
	syncContext: z.string().optional(),
	/** One entry per captured file. */
	files: z.array(SnapshotFileEntrySchema),
});

export const ProfileSchema = z.object({
	name: z.string(),
	clients: z.array(ClientAssignmentSchema).default([]),
	rules: z.array(PathRuleSchema).default([]),
	settings: SettingsSchema.default({}),
	createdAt: z.string().default(""),
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
	profiles: z.record(ProfileSchema).default({}),
	activeProfile: z.string().nullable().default(null),
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
export type Profile = z.infer<typeof ProfileSchema>;
export type EnsembleConfig = z.infer<typeof EnsembleConfigSchema>;
export type SnapshotFileEntry = z.infer<typeof SnapshotFileEntrySchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type ManagedSetting = z.infer<typeof SettingSchema>;
export type HookEvent = z.infer<typeof HookEventSchema>;
export type Hook = z.infer<typeof HookSchema>;

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
