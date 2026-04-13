import { contextBridge, ipcRenderer } from "electron";

export type IpcResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const api = {
  platform: process.platform,

  // Config
  config: {
    load: () => ipcRenderer.invoke("config:load"),
    save: (config: unknown) => ipcRenderer.invoke("config:save", config),
    path: () => ipcRenderer.invoke("config:path"),
    onExternalChange: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("config:external-change", handler);
      return () => ipcRenderer.removeListener("config:external-change", handler);
    },
  },

  // Servers
  servers: {
    add: (config: unknown, name: string, server: unknown) =>
      ipcRenderer.invoke("servers:add", config, name, server),
    remove: (config: unknown, name: string) =>
      ipcRenderer.invoke("servers:remove", config, name),
    enable: (config: unknown, name: string) =>
      ipcRenderer.invoke("servers:enable", config, name),
    disable: (config: unknown, name: string) =>
      ipcRenderer.invoke("servers:disable", config, name),
  },

  // Groups
  groups: {
    create: (config: unknown, name: string, description?: string) =>
      ipcRenderer.invoke("groups:create", config, name, description),
    delete: (config: unknown, name: string) =>
      ipcRenderer.invoke("groups:delete", config, name),
    addServer: (config: unknown, group: string, server: string) =>
      ipcRenderer.invoke("groups:addServer", config, group, server),
    removeServer: (config: unknown, group: string, server: string) =>
      ipcRenderer.invoke("groups:removeServer", config, group, server),
    addSkill: (config: unknown, group: string, skill: string) =>
      ipcRenderer.invoke("groups:addSkill", config, group, skill),
    removeSkill: (config: unknown, group: string, skill: string) =>
      ipcRenderer.invoke("groups:removeSkill", config, group, skill),
    addPlugin: (config: unknown, group: string, plugin: string) =>
      ipcRenderer.invoke("groups:addPlugin", config, group, plugin),
    removePlugin: (config: unknown, group: string, plugin: string) =>
      ipcRenderer.invoke("groups:removePlugin", config, group, plugin),
  },

  // Clients
  clients: {
    detect: () => ipcRenderer.invoke("clients:detect"),
    liveStatus: () => ipcRenderer.invoke("clients:liveStatus"),
    assign: (config: unknown, client: string, group: string) =>
      ipcRenderer.invoke("clients:assign", config, client, group),
    unassign: (config: unknown, client: string) =>
      ipcRenderer.invoke("clients:unassign", config, client),
  },

  // Sync
  sync: {
    client: (config: unknown, client: string, opts?: { dryRun?: boolean; force?: boolean }) =>
      ipcRenderer.invoke("sync:client", config, client, opts),
    skills: (config: unknown, client: string, opts?: { dryRun?: boolean }) =>
      ipcRenderer.invoke("sync:skills", config, client, opts),
    all: (config: unknown, opts?: { dryRun?: boolean; force?: boolean }) =>
      ipcRenderer.invoke("sync:all", config, opts),
    contextCost: (config: unknown, client: string) =>
      ipcRenderer.invoke("sync:contextCost", config, client),
    suggestSplits: (config: unknown) =>
      ipcRenderer.invoke("sync:suggestSplits", config),
  },

  // Plugins
  plugins: {
    install: (config: unknown, name: string, marketplace: string) =>
      ipcRenderer.invoke("plugins:install", config, name, marketplace),
    uninstall: (config: unknown, name: string) =>
      ipcRenderer.invoke("plugins:uninstall", config, name),
    enable: (config: unknown, name: string) =>
      ipcRenderer.invoke("plugins:enable", config, name),
    disable: (config: unknown, name: string) =>
      ipcRenderer.invoke("plugins:disable", config, name),
    import: (config: unknown) =>
      ipcRenderer.invoke("plugins:import", config),
  },

  // Marketplaces
  marketplaces: {
    add: (config: unknown, name: string, source: unknown) =>
      ipcRenderer.invoke("marketplaces:add", config, name, source),
    remove: (config: unknown, name: string) =>
      ipcRenderer.invoke("marketplaces:remove", config, name),
  },

  // Skills
  skills: {
    install: (config: unknown, name: string, skill: unknown) =>
      ipcRenderer.invoke("skills:install", config, name, skill),
    uninstall: (config: unknown, name: string) =>
      ipcRenderer.invoke("skills:uninstall", config, name),
    enable: (config: unknown, name: string) =>
      ipcRenderer.invoke("skills:enable", config, name),
    disable: (config: unknown, name: string) =>
      ipcRenderer.invoke("skills:disable", config, name),
    listDirs: () => ipcRenderer.invoke("skills:listDirs"),
    read: (name: string) => ipcRenderer.invoke("skills:read", name),
    checkDeps: (config: unknown) => ipcRenderer.invoke("skills:checkDeps", config),
  },

  // Rules
  rules: {
    add: (config: unknown, path: string, group: string) =>
      ipcRenderer.invoke("rules:add", config, path, group),
    remove: (config: unknown, path: string) =>
      ipcRenderer.invoke("rules:remove", config, path),
  },

  // Profiles
  profiles: {
    save: (config: unknown, name: string) =>
      ipcRenderer.invoke("profiles:save", config, name),
    activate: (config: unknown, name: string) =>
      ipcRenderer.invoke("profiles:activate", config, name),
    list: (config: unknown) =>
      ipcRenderer.invoke("profiles:list", config),
    delete: (config: unknown, name: string) =>
      ipcRenderer.invoke("profiles:delete", config, name),
  },

  // Collisions
  collisions: {
    detect: (config: unknown) => ipcRenderer.invoke("collisions:detect", config),
  },

  // Search
  search: {
    local: (config: unknown, query: string) =>
      ipcRenderer.invoke("search:local", config, query),
    registry: (query: string) =>
      ipcRenderer.invoke("search:registry", query),
    show: (id: string, backend?: string) =>
      ipcRenderer.invoke("registry:show", id, backend),
    backends: () => ipcRenderer.invoke("registry:backends"),
  },

  // Doctor
  doctor: {
    run: (config: unknown) => ipcRenderer.invoke("doctor:run", config),
  },
} as const;

export type EnsembleAPI = typeof api;

contextBridge.exposeInMainWorld("ensemble", api);
