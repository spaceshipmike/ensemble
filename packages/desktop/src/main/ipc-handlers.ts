import { ipcMain } from "electron";
import {
  loadConfig,
  saveConfig,
  createConfig,
  CONFIG_PATH,
  addServer,
  removeServer,
  enableServer,
  disableServer,
  createGroup,
  deleteGroup,
  addServerToGroup,
  removeServerFromGroup,
  addSkillToGroup,
  removeSkillFromGroup,
  addPluginToGroup,
  removePluginFromGroup,
  detectClients,
  assignClient,
  unassignClient,
  syncClient,
  syncSkills,
  syncAllClients,
  computeContextCost,
  suggestGroupSplits,
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
  listSkillDirs,
  readSkillMd,
  checkSkillDependencies,
  addRule,
  removeRule,
  saveProfile,
  activateProfile,
  listProfiles,
  deleteProfile,
  detectCollisions,
  searchAll,
  searchRegistries,
  showRegistry,
  listBackends,
  runDoctor,
  readClientConfig,
  getManagedServers,
  resolvedPaths,
} from "ensemble";
import type { EnsembleConfig } from "ensemble";

/** Load config fresh from disk (Zod-validated). */
function fresh(): EnsembleConfig {
  try {
    return loadConfig();
  } catch {
    return createConfig();
  }
}

/** Run a pure operation: load fresh config, apply op, save, return result. */
function runOp<T>(op: (config: EnsembleConfig) => { config: EnsembleConfig; result: T }): { ok: true; data: T; config: EnsembleConfig } | { ok: false; error: string } {
  try {
    const { config, result } = op(fresh());
    saveConfig(config);
    return { ok: true, data: result, config };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Operation failed" };
  }
}

/** Register all IPC handlers for Ensemble operations */
export function registerIpcHandlers(): void {
  // --- Config ---
  ipcMain.handle("config:load", async () => {
    try {
      return { ok: true, data: loadConfig() };
    } catch {
      return { ok: true, data: createConfig() };
    }
  });

  ipcMain.handle("config:save", async (_e, config: EnsembleConfig) => {
    saveConfig(config);
    return { ok: true };
  });

  ipcMain.handle("config:path", () => CONFIG_PATH);

  // --- Servers ---
  ipcMain.handle("servers:add", async (_e, _config: unknown, name: string, server: Record<string, unknown>) => {
    return runOp((c) => addServer(c, { name, ...server } as Parameters<typeof addServer>[1]));
  });

  ipcMain.handle("servers:remove", async (_e, _config: unknown, name: string) => {
    return runOp((c) => removeServer(c, name));
  });

  ipcMain.handle("servers:enable", async (_e, _config: unknown, name: string) => {
    return runOp((c) => enableServer(c, name));
  });

  ipcMain.handle("servers:disable", async (_e, _config: unknown, name: string) => {
    return runOp((c) => disableServer(c, name));
  });

  // --- Groups ---
  ipcMain.handle("groups:create", async (_e, _config: unknown, name: string, description?: string) => {
    return runOp((c) => createGroup(c, name, description));
  });

  ipcMain.handle("groups:delete", async (_e, _config: unknown, name: string) => {
    return runOp((c) => deleteGroup(c, name));
  });

  ipcMain.handle("groups:addServer", async (_e, _config: unknown, group: string, server: string) => {
    return runOp((c) => addServerToGroup(c, group, server));
  });

  ipcMain.handle("groups:removeServer", async (_e, _config: unknown, group: string, server: string) => {
    return runOp((c) => removeServerFromGroup(c, group, server));
  });

  ipcMain.handle("groups:addSkill", async (_e, _config: unknown, group: string, skill: string) => {
    return runOp((c) => addSkillToGroup(c, group, skill));
  });

  ipcMain.handle("groups:removeSkill", async (_e, _config: unknown, group: string, skill: string) => {
    return runOp((c) => removeSkillFromGroup(c, group, skill));
  });

  ipcMain.handle("groups:addPlugin", async (_e, _config: unknown, group: string, plugin: string) => {
    return runOp((c) => addPluginToGroup(c, group, plugin));
  });

  ipcMain.handle("groups:removePlugin", async (_e, _config: unknown, group: string, plugin: string) => {
    return runOp((c) => removePluginFromGroup(c, group, plugin));
  });

  // --- Clients ---
  ipcMain.handle("clients:detect", async () => {
    try {
      return { ok: true, data: detectClients() };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Detection failed" };
    }
  });

  ipcMain.handle("clients:liveStatus", async () => {
    try {
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
      return { ok: true, data: statuses };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Live status failed" };
    }
  });

  ipcMain.handle("clients:assign", async (_e, _config: unknown, client: string, group: string) => {
    return runOp((c) => assignClient(c, client, group));
  });

  ipcMain.handle("clients:unassign", async (_e, _config: unknown, client: string) => {
    return runOp((c) => unassignClient(c, client));
  });

  // --- Sync ---
  ipcMain.handle("sync:client", async (_e, _config: unknown, client: string, opts?: { dryRun?: boolean; force?: boolean }) => {
    try {
      const config = fresh();
      const { config: newConfig, result } = syncClient(config, client, opts);
      if (!opts?.dryRun) saveConfig(newConfig);
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Sync failed" };
    }
  });

  ipcMain.handle("sync:skills", async (_e, _config: unknown, client: string, opts?: { dryRun?: boolean }) => {
    try {
      const config = fresh();
      const { config: newConfig, result } = syncSkills(config, client, opts);
      if (!opts?.dryRun) saveConfig(newConfig);
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Skill sync failed" };
    }
  });

  ipcMain.handle("sync:all", async (_e, _config: unknown, opts?: { dryRun?: boolean; force?: boolean }) => {
    try {
      const config = fresh();
      const { config: newConfig, results } = syncAllClients(config, opts);
      if (!opts?.dryRun) saveConfig(newConfig);
      return { ok: true, data: results };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Sync failed" };
    }
  });

  ipcMain.handle("sync:contextCost", async (_e, _config: unknown, client: string) => {
    try {
      return { ok: true, data: computeContextCost(fresh(), client) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Context cost failed" };
    }
  });

  ipcMain.handle("sync:suggestSplits", async () => {
    try {
      return { ok: true, data: suggestGroupSplits(fresh()) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Split suggestion failed" };
    }
  });

  // --- Plugins ---
  ipcMain.handle("plugins:install", async (_e, _config: unknown, name: string, marketplace: string) => {
    return runOp((c) => installPlugin(c, name, marketplace));
  });

  ipcMain.handle("plugins:uninstall", async (_e, _config: unknown, name: string) => {
    return runOp((c) => uninstallPlugin(c, name));
  });

  ipcMain.handle("plugins:enable", async (_e, _config: unknown, name: string) => {
    return runOp((c) => enablePlugin(c, name));
  });

  ipcMain.handle("plugins:disable", async (_e, _config: unknown, name: string) => {
    return runOp((c) => disablePlugin(c, name));
  });

  ipcMain.handle("plugins:import", async () => {
    return runOp((c) => importPlugins(c));
  });

  // --- Marketplaces ---
  ipcMain.handle("marketplaces:add", async (_e, _config: unknown, name: string, source: Record<string, string>) => {
    return runOp((c) => addMarketplace(c, name, source as Parameters<typeof addMarketplace>[2]));
  });

  ipcMain.handle("marketplaces:remove", async (_e, _config: unknown, name: string) => {
    return runOp((c) => removeMarketplace(c, name));
  });

  // --- Skills ---
  ipcMain.handle("skills:install", async (_e, _config: unknown, name: string, skill: Record<string, unknown>) => {
    return runOp((c) => installSkill(c, name, skill as Parameters<typeof installSkill>[2]));
  });

  ipcMain.handle("skills:uninstall", async (_e, _config: unknown, name: string) => {
    return runOp((c) => uninstallSkill(c, name));
  });

  ipcMain.handle("skills:enable", async (_e, _config: unknown, name: string) => {
    return runOp((c) => enableSkill(c, name));
  });

  ipcMain.handle("skills:disable", async (_e, _config: unknown, name: string) => {
    return runOp((c) => disableSkill(c, name));
  });

  ipcMain.handle("skills:listDirs", async () => {
    try {
      return { ok: true, data: listSkillDirs() };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to list skill dirs" };
    }
  });

  ipcMain.handle("skills:read", async (_e, name: string) => {
    try {
      return { ok: true, data: readSkillMd(name) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to read skill" };
    }
  });

  ipcMain.handle("skills:checkDeps", async () => {
    try {
      return { ok: true, data: checkSkillDependencies(fresh()) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Dependency check failed" };
    }
  });

  // --- Rules ---
  ipcMain.handle("rules:add", async (_e, _config: unknown, path: string, group: string) => {
    return runOp((c) => addRule(c, path, group));
  });

  ipcMain.handle("rules:remove", async (_e, _config: unknown, path: string) => {
    return runOp((c) => removeRule(c, path));
  });

  // --- Profiles ---
  ipcMain.handle("profiles:save", async (_e, _config: unknown, name: string) => {
    return runOp((c) => saveProfile(c, name));
  });

  ipcMain.handle("profiles:activate", async (_e, _config: unknown, name: string) => {
    return runOp((c) => activateProfile(c, name));
  });

  ipcMain.handle("profiles:list", async () => {
    try {
      return { ok: true, data: listProfiles(fresh()) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to list profiles" };
    }
  });

  ipcMain.handle("profiles:delete", async (_e, _config: unknown, name: string) => {
    return runOp((c) => deleteProfile(c, name));
  });

  // --- Collisions ---
  ipcMain.handle("collisions:detect", async () => {
    try {
      return { ok: true, data: detectCollisions(fresh()) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Collision detection failed" };
    }
  });

  // --- Search ---
  ipcMain.handle("search:local", async (_e, _config: unknown, query: string) => {
    try {
      return { ok: true, data: searchAll(fresh(), query) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Search failed" };
    }
  });

  ipcMain.handle("search:registry", async (_e, query: string) => {
    try {
      return { ok: true, data: await searchRegistries(query) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Registry search failed" };
    }
  });

  ipcMain.handle("registry:show", async (_e, id: string, backend?: string) => {
    try {
      return { ok: true, data: await showRegistry(id, backend) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Registry show failed" };
    }
  });

  ipcMain.handle("registry:backends", async () => {
    try {
      return { ok: true, data: listBackends() };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to list backends" };
    }
  });

  // --- Doctor ---
  ipcMain.handle("doctor:run", async () => {
    try {
      return { ok: true, data: runDoctor(fresh()) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Doctor failed" };
    }
  });
}
