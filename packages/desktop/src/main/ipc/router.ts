/**
 * Ensemble tRPC router — the typed IPC surface between the main process and
 * the renderer. Each sub-router corresponds to a domain in the legacy
 * `ipcMain.handle("<prefix>:<action>")` namespace.
 *
 * Conventions
 * -----------
 * - Reads are `.query()`, writes are `.mutation()`.
 * - All input shapes are validated with zod (`.input(...)`).
 * - The vestigial `_config: unknown` argument from the old handlers is
 *   dropped. Mutations always `loadConfig()` fresh from disk, apply the
 *   pure operation, then `saveConfig()` — the renderer never ships config
 *   across the wire.
 * - Procedures throw on error; tRPC's error channel replaces the old
 *   `{ ok, data, error }` envelope.
 * - `config.onExternalChange` is a tRPC subscription wired to the
 *   EventEmitter in `config-watcher.ts`.
 */

import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import {
  CONFIG_PATH,
  activateProfile,
  addMarketplace,
  adoptOrphan,
  browseSearch,
  bootstrapLibrary,
  ignoreEntry,
  libraryStoreExists,
  listEntries as listLibraryEntries,
  promoteDrift,
  readManifest,
  reconcile as reconcileLibrary,
  relinkEntrySource,
  removeEntry,
  unignoreEntry,
  addPluginToGroup,
  addRule,
  addServer,
  listSnapshots,
  getSnapshot,
  restoreSnapshot,
  addServerToGroup,
  addSkillToGroup,
  assignClient,
  checkSkillDependencies,
  computeContextCost,
  createConfig,
  createGroup,
  deleteGroup,
  deleteProfile,
  detectClients,
  detectCollisions,
  disablePlugin,
  disableServer,
  disableSkill,
  enablePlugin,
  enableServer,
  enableSkill,
  getManagedServers,
  getUserNotes,
  setUserNotes,
  installPlugin,
  installSkill,
  listBackends,
  listProfiles,
  listProjects as listRegistryProjects,
  listSkillDirs,
  loadConfig,
  readClientConfig,
  readSkillMd,
  removeMarketplace,
  removePluginFromGroup,
  removeRule,
  removeServer,
  removeServerFromGroup,
  removeSkillFromGroup,
  resolvedPaths,
  runDoctor,
  saveConfig,
  saveProfile,
  scanClientsForProjects,
  scanLibraryGlobal,
  scanLibraryProject,
  searchAll,
  searchRegistries,
  showRegistry,
  suggestGroupSplits,
  syncAllClients,
  syncClient,
  syncSkills,
  unassignClient,
  uninstallPlugin,
  uninstallSkill,
  unwireTool,
  wireTool,
} from "ensemble";
import type {
  AdoptResult,
  BootstrapSummary,
  EnsembleConfig,
  LibraryEntry,
  LibraryManifest,
  ReconcileResult,
} from "ensemble";
import { z } from "zod";
import type { DiscoveredProject, DiscoveredTool, WireMap, WireResult } from "../../shared/index.js";
import { configEvents } from "../config-watcher.js";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create({ isServer: true, transformer: superjson });
const { router, procedure } = t;

/** Load config fresh from disk, falling back to a blank config. */
function fresh(): EnsembleConfig {
  try {
    return loadConfig();
  } catch {
    return createConfig();
  }
}

/**
 * Apply a pure operation on a freshly-loaded config, persist, and return the
 * operation's result. Mirrors the semantics of the old `runOp` helper but
 * drops the `{ ok, data }` envelope — errors propagate via tRPC.
 */
function runOp<T>(op: (config: EnsembleConfig) => { config: EnsembleConfig; result: T }): T {
  const { config, result } = op(fresh());
  saveConfig(config);
  return result;
}

// --- Shared input schemas ---------------------------------------------------

const scopeSchema = z.union([
  z.object({ kind: z.literal("global") }),
  z.object({ kind: z.literal("project"), path: z.string() }),
  z.object({ kind: z.literal("library") }),
]);

const toolTypeSchema = z.enum(["server", "skill", "agent", "command", "style", "plugin", "hook"]);

const wireRequestSchema = z.object({
  type: toolTypeSchema,
  name: z.string(),
  source: scopeSchema,
  target: scopeSchema,
});

const unwireRequestSchema = z.object({
  type: toolTypeSchema,
  name: z.string(),
  scope: scopeSchema,
});

/**
 * Minimal projection of DiscoveredTool accepted by adopt/promote mutations.
 * The renderer already has the full scan object, so we accept it verbatim
 * and pass through to the library store functions which know what fields
 * they need.
 */
const discoveredToolSchema = z.object({
  id: z.string(),
  type: toolTypeSchema,
  name: z.string(),
  description: z.string(),
  scope: scopeSchema,
  origin: z.enum(["discovered", "managed"]),
  filePath: z.string().optional(),
  detail: z.string(),
  pluginEnabled: z.boolean().optional(),
  pluginMarketplace: z.string().optional(),
});

const syncOptsSchema = z
  .object({ dryRun: z.boolean().optional(), force: z.boolean().optional() })
  .optional();

const syncSkillsOptsSchema = z.object({ dryRun: z.boolean().optional() }).optional();

// --- Config -----------------------------------------------------------------

const configRouter = router({
  load: procedure.query((): EnsembleConfig => {
    try {
      return loadConfig();
    } catch {
      return createConfig();
    }
  }),

  save: procedure.input(z.object({ config: z.unknown() })).mutation(({ input }) => {
    saveConfig(input.config as EnsembleConfig);
    return { ok: true as const };
  }),

  path: procedure.query((): string => CONFIG_PATH),

  /**
   * Subscribe to external-change events emitted by `config-watcher.ts` when
   * something outside the desktop app (e.g. the CLI) rewrites the config
   * file. Renderer clients invalidate their cached `config.load` query on
   * each fire.
   */
  onExternalChange: procedure.subscription(() => {
    return observable<{ at: number }>((emit) => {
      const handler = () => emit.next({ at: Date.now() });
      configEvents.on("change", handler);
      return () => {
        configEvents.off("change", handler);
      };
    });
  }),
});

// --- Servers ----------------------------------------------------------------

const serversRouter = router({
  add: procedure
    .input(
      z.object({
        name: z.string(),
        server: z.record(z.unknown()),
      }),
    )
    .mutation(({ input }) =>
      runOp((c) =>
        addServer(c, {
          name: input.name,
          ...input.server,
        } as Parameters<typeof addServer>[1]),
      ),
    ),

  remove: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => removeServer(c, input.name))),

  enable: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => enableServer(c, input.name))),

  disable: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => disableServer(c, input.name))),
});

// --- Groups -----------------------------------------------------------------

const groupsRouter = router({
  create: procedure
    .input(z.object({ name: z.string(), description: z.string().optional() }))
    .mutation(({ input }) => runOp((c) => createGroup(c, input.name, input.description))),

  delete: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => deleteGroup(c, input.name))),

  addServer: procedure
    .input(z.object({ group: z.string(), server: z.string() }))
    .mutation(({ input }) => runOp((c) => addServerToGroup(c, input.group, input.server))),

  removeServer: procedure
    .input(z.object({ group: z.string(), server: z.string() }))
    .mutation(({ input }) => runOp((c) => removeServerFromGroup(c, input.group, input.server))),

  addSkill: procedure
    .input(z.object({ group: z.string(), skill: z.string() }))
    .mutation(({ input }) => runOp((c) => addSkillToGroup(c, input.group, input.skill))),

  removeSkill: procedure
    .input(z.object({ group: z.string(), skill: z.string() }))
    .mutation(({ input }) => runOp((c) => removeSkillFromGroup(c, input.group, input.skill))),

  addPlugin: procedure
    .input(z.object({ group: z.string(), plugin: z.string() }))
    .mutation(({ input }) => runOp((c) => addPluginToGroup(c, input.group, input.plugin))),

  removePlugin: procedure
    .input(z.object({ group: z.string(), plugin: z.string() }))
    .mutation(({ input }) => runOp((c) => removePluginFromGroup(c, input.group, input.plugin))),
});

// --- Projects ---------------------------------------------------------------

const projectsRouter = router({
  /**
   * Scan detected clients' history for recently-used project paths, then
   * enrich each entry with its registry status (active/archived/…).
   */
  scan: procedure.query((): DiscoveredProject[] => {
    const scanned = scanClientsForProjects();
    const pathToStatus = new Map<string, string>();
    const pathToDisplayName = new Map<string, string>();
    try {
      for (const p of listRegistryProjects()) {
        for (const path of p.paths) {
          pathToStatus.set(path, p.status);
          // Only override when the registry actually has a non-empty
          // display name — otherwise fall back to the basename from scan.
          if (p.displayName && p.displayName.trim().length > 0) {
            pathToDisplayName.set(path, p.displayName);
          }
        }
      }
    } catch {
      // Registry is optional.
    }
    return scanned.map((p) => ({
      ...p,
      name: pathToDisplayName.get(p.path) ?? p.name,
      registryStatus: pathToStatus.get(p.path) ?? "unregistered",
    }));
  }),
});

// --- Library (Claude Code extension scan) ----------------------------------

const libraryRouter = router({
  scanGlobal: procedure.query((): DiscoveredTool[] => scanLibraryGlobal()),

  scanProject: procedure
    .input(z.object({ path: z.string() }))
    .query(({ input }): DiscoveredTool[] => scanLibraryProject(input.path)),

  scanAllProjects: procedure
    .input(z.object({ paths: z.array(z.string()) }))
    .query(({ input }): WireMap => {
      const result: WireMap = {};
      for (const path of input.paths) {
        try {
          result[path] = scanLibraryProject(path);
        } catch {
          result[path] = [];
        }
      }
      return result;
    }),

  wire: procedure.input(wireRequestSchema).mutation(({ input }): WireResult => wireTool(input)),

  unwire: procedure
    .input(unwireRequestSchema)
    .mutation(({ input }): WireResult => unwireTool(input)),

  // --- Canonical library store (v2.0.2) ---

  /**
   * Ensure the canonical library store at `~/.config/ensemble/library/` is
   * populated. Idempotent: if the store already exists, this is a cheap
   * manifest read that returns the current counts. First-time invocation
   * scans `~/.claude/` + the supplied project paths and copies file content
   * into the store.
   *
   * Does not modify anything the renderer currently reads — this is the
   * v2.0.2 canonical store sitting alongside the existing scan path until
   * the renderer is ready to read from it directly.
   */
  bootstrap: procedure
    .input(z.object({ projectPaths: z.array(z.string()).default([]) }))
    .mutation(({ input }): BootstrapSummary => bootstrapLibrary(input.projectPaths)),

  /** Return the canonical library manifest, or null if the store is empty. */
  manifest: procedure.query((): LibraryManifest | null => readManifest()),

  /** Return the library entries in stable order. Empty array if no store. */
  entries: procedure.query((): LibraryEntry[] => {
    const m = readManifest();
    if (!m) return [];
    return listLibraryEntries(m);
  }),

  /**
   * Reconcile the current manifest against a fresh scan of one scope. The
   * renderer passes the scan it already has (from `library.scanGlobal` or
   * `library.scanProject`) and gets back a bucketed `{matches, drifts,
   * orphans, ignored}` result.
   */
  reconcileScope: procedure
    .input(
      z.object({
        scope: z.union([z.literal("global"), z.object({ path: z.string() })]),
      }),
    )
    .query(({ input }): ReconcileResult | null => {
      const manifest = readManifest();
      if (!manifest) return null;
      const tools =
        input.scope === "global" ? scanLibraryGlobal() : scanLibraryProject(input.scope.path);
      return reconcileLibrary(manifest, tools);
    }),

  /** Whether the canonical library store has been initialized. */
  storeExists: procedure.query((): boolean => libraryStoreExists()),

  /**
   * Adopt a scanned orphan into the library. Copies its content (or server
   * def) into the canonical store and appends a manifest entry.
   */
  adoptOrphan: procedure
    .input(z.object({ tool: discoveredToolSchema }))
    .mutation(({ input }): AdoptResult => adoptOrphan(input.tool)),

  /**
   * Promote the on-disk version of a drifted tool into the library. The
   * previous canonical content is overwritten with what's currently on disk.
   */
  promoteDrift: procedure
    .input(z.object({ tool: discoveredToolSchema }))
    .mutation(({ input }): AdoptResult => promoteDrift(input.tool)),

  /**
   * Add an entry id to the ignored list so future scans stop flagging it as
   * an orphan. Persistent until the user adopts it.
   */
  ignore: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }): AdoptResult => ignoreEntry(input.id)),

  /** Remove an entry id from the ignored list. */
  unignore: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }): AdoptResult => unignoreEntry(input.id)),

  /**
   * Delete an entry from the library. File-based entries lose their canonical
   * content; the id is added to the ignored list so future scans don't
   * immediately re-adopt the on-disk copy as an orphan.
   */
  removeEntry: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }): AdoptResult => removeEntry(input.id)),

  /**
   * Relink a library entry's source to a new marketplace identifier. Pure
   * metadata rename — the entry's content is preserved but the id rewrites
   * from `name@oldSource` to `name@newSource`.
   */
  relinkSource: procedure
    .input(z.object({ id: z.string(), newSource: z.string() }))
    .mutation(({ input }): AdoptResult => relinkEntrySource(input.id, input.newSource)),

  /**
   * Compose candidate sources for relinking a library entry. Returns an
   * aggregated list drawn from two channels:
   *
   * 1. **Registry adapters** — `searchRegistries(entry.name)` across
   *    claude-plugins.dev, Official MCP Registry, and Glama. Filtered to
   *    close name matches to keep noise down.
   * 2. **Configured marketplaces** — every marketplace already in
   *    `config.marketplaces`. Useful for local-directory sources and for
   *    GitHub repos the user has previously added.
   *
   * The renderer can show a third "Add GitHub repo…" section that writes
   * through `marketplaces.add` and then re-runs this query to pick up the
   * new option.
   */
  searchSourceCandidates: procedure
    .input(z.object({ name: z.string(), type: toolTypeSchema }))
    .query(async ({ input }): Promise<SourceCandidate[]> => {
      const out: SourceCandidate[] = [];

      // --- Channel 1: registry adapters (async) ---
      try {
        const hits = await searchRegistries(input.name);
        for (const hit of hits) {
          // Accept exact or prefix name matches to keep candidates focused.
          const hitName = String((hit as Record<string, unknown>).name ?? "").toLowerCase();
          const needle = input.name.toLowerCase();
          if (!hitName) continue;
          if (hitName === needle || hitName.startsWith(needle)) {
            out.push({
              source: String(
                (hit as Record<string, unknown>).source ??
                  (hit as Record<string, unknown>).backend ??
                  "registry",
              ),
              label: String((hit as Record<string, unknown>).displayName ?? hit.name),
              confidence: hitName === needle ? "exact" : "partial",
              channel: "registry",
            });
          }
        }
      } catch {
        // Registry queries are optional — fall through.
      }

      // --- Channel 2: configured marketplaces ---
      try {
        const cfg = loadConfig();
        for (const mp of cfg.marketplaces ?? []) {
          out.push({
            source: mp.name,
            label: mp.name,
            confidence: "configured",
            channel: "marketplace",
            marketplaceSource: mp.source as SourceCandidate["marketplaceSource"],
          });
        }
      } catch {
        // No config available — not fatal.
      }

      return out;
    }),
});

/** Single entry in the source-candidates picker. */
interface SourceCandidate {
  /** The string that will become `entry.source` after relink. */
  source: string;
  /** Human-readable label for the UI. */
  label: string;
  /** Confidence tier — renderer can sort and style by this. */
  confidence: "exact" | "partial" | "configured";
  /** Which channel the candidate came from. */
  channel: "registry" | "marketplace";
  /** For marketplace channel, the raw source descriptor for provenance. */
  marketplaceSource?: { source: string; repo?: string; path?: string; url?: string };
}

// --- Clients ----------------------------------------------------------------

const clientsRouter = router({
  detect: procedure.query(() => detectClients()),

  liveStatus: procedure.query(() => {
    const clients = detectClients();
    const statuses: Record<string, { total: number; managed: number }> = {};
    for (const client of clients) {
      let total = 0;
      let managed = 0;
      for (const path of resolvedPaths(client)) {
        try {
          const raw = readClientConfig(path);
          const keys = client.serversKey.split(".");
          let node: unknown = raw;
          for (const k of keys) {
            if (node && typeof node === "object") {
              node = (node as Record<string, unknown>)[k];
            } else {
              node = undefined;
              break;
            }
          }
          if (node && typeof node === "object") {
            total += Object.keys(node as Record<string, unknown>).length;
          }
          managed += Object.keys(getManagedServers(raw, client.serversKey)).length;
        } catch {
          // ignore unreadable files
        }
      }
      statuses[client.id] = { total, managed };
    }
    return statuses;
  }),

  assign: procedure
    .input(z.object({ client: z.string(), group: z.string() }))
    .mutation(({ input }) => runOp((c) => assignClient(c, input.client, input.group))),

  unassign: procedure
    .input(z.object({ client: z.string() }))
    .mutation(({ input }) => runOp((c) => unassignClient(c, input.client))),
});

// --- Sync -------------------------------------------------------------------

const syncRouter = router({
  client: procedure
    .input(z.object({ client: z.string(), opts: syncOptsSchema }))
    .mutation(({ input }) => {
      const config = fresh();
      const { config: newConfig, result } = syncClient(config, input.client, input.opts);
      if (!input.opts?.dryRun) saveConfig(newConfig);
      return result;
    }),

  skills: procedure
    .input(z.object({ client: z.string(), opts: syncSkillsOptsSchema }))
    .mutation(({ input }) => {
      // syncSkills returns a SkillSyncResult directly and does not mutate
      // config, so there's nothing to persist after it runs.
      return syncSkills(fresh(), input.client, input.opts);
    }),

  all: procedure.input(z.object({ opts: syncOptsSchema }).optional()).mutation(({ input }) => {
    const config = fresh();
    const { config: newConfig, results } = syncAllClients(config, input?.opts);
    if (!input?.opts?.dryRun) saveConfig(newConfig);
    return results;
  }),

  contextCost: procedure
    .input(z.object({ client: z.string() }))
    .query(({ input }) => computeContextCost(fresh(), input.client)),

  suggestSplits: procedure.query(() => {
    const config = fresh();
    return suggestGroupSplits(config, config.servers);
  }),
});

// --- Plugins ----------------------------------------------------------------

const pluginsRouter = router({
  install: procedure
    .input(z.object({ name: z.string(), marketplace: z.string() }))
    .mutation(({ input }) => runOp((c) => installPlugin(c, input.name, input.marketplace))),

  uninstall: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => uninstallPlugin(c, input.name))),

  enable: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => enablePlugin(c, input.name))),

  disable: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => disablePlugin(c, input.name))),
});

// --- Marketplaces -----------------------------------------------------------

const marketplacesRouter = router({
  add: procedure
    .input(
      z.object({
        name: z.string(),
        source: z.record(z.string()),
      }),
    )
    .mutation(({ input }) =>
      runOp((c) =>
        addMarketplace(c, input.name, input.source as Parameters<typeof addMarketplace>[2]),
      ),
    ),

  remove: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => removeMarketplace(c, input.name))),

  /**
   * Pre-flight validation for manually-entered GitHub marketplace repos.
   * Hits the unauthenticated GitHub API once — `GET /repos/:owner/:repo` —
   * and returns `{ ok, reason }`. Rate-limit exhaustion is treated as a
   * soft pass (`ok: true, reason: "rate-limited"`) rather than a hard fail
   * so a temporary limit doesn't block the user. Actual 404s are hard fails.
   */
  validateGithubRepo: procedure
    .input(z.object({ repo: z.string() }))
    .query(async ({ input }): Promise<{ ok: boolean; reason?: string }> => {
      const match = /^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)$/.exec(input.repo.trim());
      if (!match) {
        return { ok: false, reason: "expected owner/repo format" };
      }
      const [, owner, repo] = match;
      try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (res.status === 200) return { ok: true };
        if (res.status === 404) return { ok: false, reason: "repo not found" };
        if (res.status === 403 || res.status === 429) {
          return { ok: true, reason: "rate-limited (not verified)" };
        }
        return { ok: false, reason: `github returned ${res.status}` };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "network error" };
      }
    }),
});

// --- Skills -----------------------------------------------------------------

const skillsRouter = router({
  install: procedure
    .input(
      z.object({
        name: z.string(),
        skill: z.record(z.unknown()),
      }),
    )
    .mutation(({ input }) =>
      runOp((c) =>
        installSkill(c, {
          name: input.name,
          ...input.skill,
        } as Parameters<typeof installSkill>[1]),
      ),
    ),

  uninstall: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => uninstallSkill(c, input.name))),

  enable: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => enableSkill(c, input.name))),

  disable: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => disableSkill(c, input.name))),

  listDirs: procedure.query(() => listSkillDirs()),

  read: procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => readSkillMd(input.name)),

  checkDeps: procedure.query(() => checkSkillDependencies(fresh())),
});

// --- Rules ------------------------------------------------------------------

const rulesRouter = router({
  add: procedure
    .input(z.object({ path: z.string(), group: z.string() }))
    .mutation(({ input }) => runOp((c) => addRule(c, input.path, input.group))),

  remove: procedure
    .input(z.object({ path: z.string() }))
    .mutation(({ input }) => runOp((c) => removeRule(c, input.path))),
});

// --- Profiles ---------------------------------------------------------------

const profilesRouter = router({
  save: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => saveProfile(c, input.name))),

  activate: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => activateProfile(c, input.name))),

  list: procedure.query(() => listProfiles(fresh())),

  delete: procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => runOp((c) => deleteProfile(c, input.name))),
});

// --- Collisions -------------------------------------------------------------

const collisionsRouter = router({
  detect: procedure.query(() => detectCollisions(fresh())),
});

// --- Search -----------------------------------------------------------------
// The old `registry:show` / `registry:backends` channels live here too so
// the renderer can address them uniformly as `search.show` / `search.backends`.

const searchRouter = router({
  local: procedure
    .input(z.object({ query: z.string() }))
    .query(({ input }) => searchAll(fresh(), input.query)),

  registry: procedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => searchRegistries(input.query)),

  show: procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => showRegistry(input.id)),

  backends: procedure.query(() => listBackends()),
});

// --- Doctor -----------------------------------------------------------------

const doctorRouter = router({
  run: procedure.query(() => runDoctor(fresh())),
});

// --- Notes ------------------------------------------------------------------
// Stub IPC surface for the v2.0.3 userNotes feature. The renderer rewrite will
// consume these procedures once the detail-pane inline-edit UI lands.

const noteRefSchema = z.object({ ref: z.string().min(1) });

const notesRouter = router({
  get: procedure
    .input(noteRefSchema)
    .query(({ input }) => getUserNotes(fresh(), input.ref)),

  set: procedure
    .input(z.object({ ref: z.string().min(1), text: z.string() }))
    .mutation(({ input }) => runOp((c) => setUserNotes(c, { ref: input.ref, text: input.text }))),
});

// --- Snapshots --------------------------------------------------------------
// v2.0.1 safe-apply surface: the renderer uses these procedures to drive the
// desktop snapshots inspector (reverse-chronological list, per-file expand,
// restore with confirmation copy mirroring `ensemble rollback`).

const snapshotsRouter = router({
  /** All snapshots on disk, newest first. */
  list: procedure.query(() => listSnapshots()),

  /** Load a single snapshot by id (includes the full file manifest). */
  show: procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => getSnapshot(input.id)),

  /**
   * Restore a snapshot. The renderer must have already confirmed with the
   * user — this mutation does the file I/O unconditionally.
   */
  restore: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => restoreSnapshot(input.id)),
});

const browseRouter = router({
  /**
   * Fuzzy-search the library + discoverable catalog. Mirrors the `ensemble
   * browse` CLI surface. The renderer supplies the query string, optional
   * `type` / `marketplace` filters, and an optional `limit`. The engine
   * reads config fresh on every call so renderer state stays stateless.
   */
  list: procedure
    .input(
      z
        .object({
          query: z.string().optional(),
          type: z.string().optional(),
          marketplace: z.string().optional(),
          limit: z.number().int().positive().optional(),
        })
        .default({}),
    )
    .query(({ input }) => {
      const config = fresh();
      return browseSearch(config, {
        ...(input.query !== undefined ? { query: input.query } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.marketplace !== undefined ? { marketplace: input.marketplace } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
    }),
});

// --- Root -------------------------------------------------------------------

export const appRouter = router({
  config: configRouter,
  servers: serversRouter,
  groups: groupsRouter,
  projects: projectsRouter,
  library: libraryRouter,
  clients: clientsRouter,
  sync: syncRouter,
  plugins: pluginsRouter,
  marketplaces: marketplacesRouter,
  skills: skillsRouter,
  rules: rulesRouter,
  profiles: profilesRouter,
  collisions: collisionsRouter,
  search: searchRouter,
  doctor: doctorRouter,
  notes: notesRouter,
  snapshots: snapshotsRouter,
  browse: browseRouter,
});

export type AppRouter = typeof appRouter;
