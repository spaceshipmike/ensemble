import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared in-memory config state that every mocked operation mutates.
let currentConfig: Record<string, unknown> = {
  servers: {},
  groups: {},
  clients: {},
  plugins: {},
  skills: {},
  rules: [],
  profiles: {},
  marketplaces: {},
};

const saveSpy = vi.fn();

// Minimal fake of the `ensemble` library — enough for the router contract
// tests to cover one read + one write per sub-router without touching disk.
vi.mock("ensemble", () => {
  const passthrough = (result: unknown) => (config: unknown) => ({
    config,
    result,
  });
  return {
    CONFIG_PATH: "/tmp/ensemble-test-config.json",
    loadConfig: () => currentConfig,
    saveConfig: (c: Record<string, unknown>) => {
      currentConfig = c;
      saveSpy(c);
    },
    createConfig: () => ({}),

    // Servers / groups / plugins / skills / marketplaces / rules / profiles
    // all use the same passthrough shape: `(config, …args) => { config, result }`.
    addServer: vi.fn(passthrough({ added: true })),
    removeServer: vi.fn(passthrough({ removed: true })),
    enableServer: vi.fn(passthrough({ enabled: true })),
    disableServer: vi.fn(passthrough({ disabled: true })),

    createGroup: vi.fn(passthrough({ created: true })),
    deleteGroup: vi.fn(passthrough({ deleted: true })),
    addServerToGroup: vi.fn(passthrough({ ok: true })),
    removeServerFromGroup: vi.fn(passthrough({ ok: true })),
    addSkillToGroup: vi.fn(passthrough({ ok: true })),
    removeSkillFromGroup: vi.fn(passthrough({ ok: true })),
    addPluginToGroup: vi.fn(passthrough({ ok: true })),
    removePluginFromGroup: vi.fn(passthrough({ ok: true })),

    detectClients: vi.fn(() => [
      { id: "claude-code", name: "Claude Code", serversKey: "mcpServers" },
    ]),
    assignClient: vi.fn(passthrough({ assigned: true })),
    unassignClient: vi.fn(passthrough({ unassigned: true })),

    syncClient: vi.fn((config: unknown) => ({
      config,
      result: { clientId: "claude-code", actions: [] },
    })),
    syncSkills: vi.fn((config: unknown) => ({
      config,
      result: { actions: [] },
    })),
    syncAllClients: vi.fn((config: unknown) => ({
      config,
      results: [{ clientId: "claude-code", actions: [] }],
    })),
    computeContextCost: vi.fn(() => ({ cost: 0 })),
    suggestGroupSplits: vi.fn(() => []),

    installPlugin: vi.fn(passthrough({ installed: true })),
    uninstallPlugin: vi.fn(passthrough({ uninstalled: true })),
    enablePlugin: vi.fn(passthrough({ enabled: true })),
    disablePlugin: vi.fn(passthrough({ disabled: true })),

    addMarketplace: vi.fn(passthrough({ added: true })),
    removeMarketplace: vi.fn(passthrough({ removed: true })),

    installSkill: vi.fn(passthrough({ installed: true })),
    uninstallSkill: vi.fn(passthrough({ uninstalled: true })),
    enableSkill: vi.fn(passthrough({ enabled: true })),
    disableSkill: vi.fn(passthrough({ disabled: true })),
    listSkillDirs: vi.fn(() => ["/tmp/skills"]),
    readSkillMd: vi.fn(() => "# SKILL"),
    checkSkillDependencies: vi.fn(() => ({ ok: true, missing: [] })),

    addRule: vi.fn(passthrough({ added: true })),
    removeRule: vi.fn(passthrough({ removed: true })),

    saveProfile: vi.fn(passthrough({ saved: true })),
    activateProfile: vi.fn(passthrough({ activated: true })),
    listProfiles: vi.fn(() => []),
    deleteProfile: vi.fn(passthrough({ deleted: true })),

    detectCollisions: vi.fn(() => []),

    searchAll: vi.fn(() => []),
    searchRegistries: vi.fn(async () => []),
    showRegistry: vi.fn(async () => ({ id: "test", name: "test" })),
    listBackends: vi.fn(() => ["official", "glama"]),

    runDoctor: vi.fn(() => ({
      checks: [],
      totalPoints: 0,
      earnedPoints: 0,
      scorePercent: 100,
      errors: 0,
      warnings: 0,
      infos: 0,
      categoryScores: {},
      serverCount: 0,
      groupCount: 0,
      pluginCount: 0,
      skillCount: 0,
    })),

    readClientConfig: vi.fn(() => ({})),
    getManagedServers: vi.fn(() => ({})),
    resolvedPaths: vi.fn(() => []),

    scanClientsForProjects: vi.fn(() => [
      {
        path: "/tmp/project-a",
        name: "project-a",
        seenIn: ["claude-code"],
        lastSeenAt: 0,
        exists: true,
        isGitRepo: true,
      },
    ]),
    listProjects: vi.fn(() => [{ paths: ["/tmp/project-a"], status: "active" }]),

    scanLibraryGlobal: vi.fn(() => []),
    scanLibraryProject: vi.fn(() => []),
    wireTool: vi.fn(() => ({ ok: true, action: "wired" })),
    unwireTool: vi.fn(() => ({ ok: true, action: "unwired" })),

    listSnapshots: vi.fn(() => [
      {
        id: "2026-04-18T10-00-00.000Z-abcdef",
        createdAt: "2026-04-18T10:00:00.000Z",
        syncContext: "sync claude-code",
        files: [
          {
            path: "/tmp/file.md",
            state: "existing",
            preContentPath: "files/abcdef__tmp__file.md",
          },
        ],
      },
    ]),
    getSnapshot: vi.fn((id: string) => ({
      id,
      createdAt: "2026-04-18T10:00:00.000Z",
      syncContext: "sync claude-code",
      files: [{ path: "/tmp/file.md", state: "existing" }],
    })),
    browseSearch: vi.fn((_config: unknown, options: { query?: string; type?: string } = {}) => {
      const stub = [
        {
          name: "alpha",
          type: "server",
          source: "manual",
          installState: "installed" as const,
        },
        {
          name: "beta",
          type: "skill",
          source: "manual",
          installState: "library" as const,
        },
      ];
      let results = stub;
      if (options.type) results = results.filter((r) => r.type === options.type);
      if (options.query) {
        const q = options.query.toLowerCase();
        results = results.filter((r) => r.name.toLowerCase().includes(q));
      }
      return results;
    }),
    restoreSnapshot: vi.fn((id: string) => ({
      snapshotId: id,
      restored: ["/tmp/file.md"],
      deleted: [],
      missing: [],
    })),

    // --- Agents / Commands (chunk 10) ---
    installAgent: vi.fn(
      (c: { agents?: unknown[] }, params: { name: string; description?: string }) => ({
        config: {
          ...c,
          agents: [
            ...(c.agents ?? []),
            { name: params.name, description: params.description ?? "" },
          ],
        },
        result: {
          ok: true,
          messages: [],
          agent: { name: params.name, description: params.description ?? "" },
        },
      }),
    ),
    uninstallAgent: vi.fn((c: { agents?: { name: string }[] }, name: string) => ({
      config: { ...c, agents: (c.agents ?? []).filter((a) => a.name !== name) },
      result: { ok: true, messages: [], agent: { name } },
    })),
    enableAgent: vi.fn((c: unknown, name: string) => ({
      config: c,
      result: { ok: true, messages: [], agent: { name, enabled: true } },
    })),
    disableAgent: vi.fn((c: unknown) => ({ config: c, result: { ok: true, messages: [] } })),

    installCommand: vi.fn(
      (c: { commands?: unknown[] }, params: { name: string; description?: string }) => ({
        config: {
          ...c,
          commands: [
            ...(c.commands ?? []),
            { name: params.name, description: params.description ?? "" },
          ],
        },
        result: {
          ok: true,
          messages: [],
          command: { name: params.name, description: params.description ?? "" },
        },
      }),
    ),
    uninstallCommand: vi.fn((c: { commands?: { name: string }[] }, name: string) => ({
      config: { ...c, commands: (c.commands ?? []).filter((x) => x.name !== name) },
      result: { ok: true, messages: [], command: { name } },
    })),
    enableCommand: vi.fn((c: unknown, name: string) => ({
      config: c,
      result: { ok: true, messages: [], command: { name, enabled: true } },
    })),
    disableCommand: vi.fn((c: unknown) => ({ config: c, result: { ok: true, messages: [] } })),

    // --- Hooks (chunk 10) ---
    addHook: vi.fn((params: { name: string; event: string; matcher: string; command: string }) => ({
      ok: true,
      hook: { ...params, description: `${params.event} → ${params.matcher}` },
    })),
    removeHook: vi.fn(() => ({ ok: true })),
    getHook: vi.fn((name: string) => ({
      name,
      event: "PreToolUse",
      matcher: "*",
      command: "echo hi",
      description: "PreToolUse → *",
    })),
    listHooks: vi.fn(() => [
      {
        name: "lint-on-write",
        event: "PreToolUse",
        matcher: "Write",
        command: "npm run lint",
        description: "PreToolUse → Write",
      },
    ]),

    // --- Managed settings (chunk 10) ---
    listManagedSettings: vi.fn(() => [
      { keyPath: "permissions.allow", value: ["Read"], clientId: "claude-code" },
    ]),
    getManagedSetting: vi.fn((keyPath: string, clientId?: string) => ({
      keyPath,
      value: ["Read"],
      clientId: clientId ?? "claude-code",
    })),
    setManagedSetting: vi.fn((params: { keyPath: string; value: unknown; clientId?: string }) => ({
      ok: true,
      entry: {
        keyPath: params.keyPath,
        value: params.value,
        clientId: params.clientId ?? "claude-code",
      },
    })),
    unsetManagedSetting: vi.fn((keyPath: string, clientId?: string) => ({
      ok: true,
      removed: { keyPath, value: null, clientId: clientId ?? "claude-code" },
    })),
  };
});

const { appRouter } = await import("./router");

const caller = appRouter.createCaller({});

beforeEach(() => {
  saveSpy.mockClear();
});

describe("configRouter", () => {
  it("load returns the current config", async () => {
    const c = await caller.config.load();
    expect(c).toBeDefined();
  });
  it("path returns the CONFIG_PATH", async () => {
    expect(await caller.config.path()).toBe("/tmp/ensemble-test-config.json");
  });
  it("save persists via saveConfig", async () => {
    await caller.config.save({ config: { servers: {} } });
    expect(saveSpy).toHaveBeenCalled();
  });
});

describe("serversRouter", () => {
  it("add persists", async () => {
    const res = await caller.servers.add({
      name: "s1",
      server: { command: "echo" },
    });
    expect(res).toEqual({ added: true });
    expect(saveSpy).toHaveBeenCalled();
  });
  it("remove persists", async () => {
    const res = await caller.servers.remove({ name: "s1" });
    expect(res).toEqual({ removed: true });
  });
});

describe("groupsRouter", () => {
  it("create persists", async () => {
    const res = await caller.groups.create({ name: "g1" });
    expect(res).toEqual({ created: true });
  });
  it("addServer persists", async () => {
    const res = await caller.groups.addServer({ group: "g1", server: "s1" });
    expect(res).toEqual({ ok: true });
  });
});

describe("projectsRouter", () => {
  it("scan enriches with registry status", async () => {
    const scanned = await caller.projects.scan();
    expect(scanned[0].registryStatus).toBe("active");
  });
});

describe("libraryRouter", () => {
  it("scanGlobal returns tools", async () => {
    const tools = await caller.library.scanGlobal();
    expect(Array.isArray(tools)).toBe(true);
  });
  it("wire returns a wire result", async () => {
    const res = await caller.library.wire({
      type: "server",
      name: "s1",
      source: { kind: "global" },
      target: { kind: "project", path: "/tmp/p" },
    });
    expect(res.ok).toBe(true);
  });
});

describe("clientsRouter", () => {
  it("detect returns clients", async () => {
    const clients = await caller.clients.detect();
    expect(clients.length).toBeGreaterThan(0);
  });
  it("assign persists", async () => {
    const res = await caller.clients.assign({
      client: "claude-code",
      group: "g1",
    });
    expect(res).toEqual({ assigned: true });
  });
});

describe("syncRouter", () => {
  it("contextCost returns a value", async () => {
    const cost = await caller.sync.contextCost({ client: "claude-code" });
    expect(cost).toEqual({ cost: 0 });
  });
  it("all returns per-client results", async () => {
    const results = await caller.sync.all({ opts: { dryRun: true } });
    expect(results[0].clientId).toBe("claude-code");
  });
});

describe("pluginsRouter", () => {
  it("install persists", async () => {
    const res = await caller.plugins.install({
      name: "p1",
      marketplace: "official",
    });
    expect(res).toEqual({ installed: true });
  });
  it("enable persists", async () => {
    const res = await caller.plugins.enable({ name: "p1" });
    expect(res).toEqual({ enabled: true });
  });
});

describe("marketplacesRouter", () => {
  it("add persists", async () => {
    const res = await caller.marketplaces.add({
      name: "m1",
      source: { type: "git", url: "git://x" },
    });
    expect(res).toEqual({ added: true });
  });
  it("remove persists", async () => {
    const res = await caller.marketplaces.remove({ name: "m1" });
    expect(res).toEqual({ removed: true });
  });
});

describe("skillsRouter", () => {
  it("listDirs returns dirs", async () => {
    const dirs = await caller.skills.listDirs();
    expect(dirs).toContain("/tmp/skills");
  });
  it("install persists", async () => {
    const res = await caller.skills.install({
      name: "k1",
      skill: { path: "/tmp/skill.md" },
    });
    expect(res).toEqual({ installed: true });
  });
});

describe("rulesRouter", () => {
  it("add persists", async () => {
    const res = await caller.rules.add({ path: "/tmp", group: "g1" });
    expect(res).toEqual({ added: true });
  });
  it("remove persists", async () => {
    const res = await caller.rules.remove({ path: "/tmp" });
    expect(res).toEqual({ removed: true });
  });
});

describe("profilesRouter", () => {
  it("list returns profiles", async () => {
    const profiles = await caller.profiles.list();
    expect(profiles).toEqual([]);
  });
  it("save persists", async () => {
    const res = await caller.profiles.save({ name: "default" });
    expect(res).toEqual({ saved: true });
  });
});

describe("collisionsRouter", () => {
  it("detect returns collisions", async () => {
    const c = await caller.collisions.detect();
    expect(c).toEqual([]);
  });
});

describe("searchRouter", () => {
  it("backends returns a list", async () => {
    const b = await caller.search.backends();
    expect(b).toContain("official");
  });
  it("registry searches", async () => {
    const r = await caller.search.registry({ query: "test" });
    expect(r).toEqual([]);
  });
});

describe("doctorRouter", () => {
  it("run returns a doctor result", async () => {
    const r = await caller.doctor.run();
    expect(r.scorePercent).toBe(100);
  });
});

describe("snapshotsRouter", () => {
  it("list returns all snapshots newest-first", async () => {
    const snaps = await caller.snapshots.list();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].id).toBe("2026-04-18T10-00-00.000Z-abcdef");
    expect(snaps[0].files[0].path).toBe("/tmp/file.md");
  });

  it("show returns a single snapshot by id", async () => {
    const snap = await caller.snapshots.show({ id: "abc" });
    expect(snap.id).toBe("abc");
    expect(snap.files).toBeDefined();
  });

  it("restore returns a restore result", async () => {
    const result = await caller.snapshots.restore({ id: "abc" });
    expect(result.snapshotId).toBe("abc");
    expect(result.restored).toContain("/tmp/file.md");
  });
});

describe("browseRouter", () => {
  it("list returns the default result set with no filters", async () => {
    const rows = await caller.browse.list({});
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("alpha");
  });

  it("list applies the type filter", async () => {
    const rows = await caller.browse.list({ type: "skill" });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("skill");
  });

  it("list applies the fuzzy query", async () => {
    const rows = await caller.browse.list({ query: "alp" });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("alpha");
  });
});

// --- Agents / Commands / Hooks / Settings (chunk 10) -----------------------

describe("agentsRouter", () => {
  it("list returns an empty array on a fresh config", async () => {
    const agents = await caller.agents.list();
    expect(Array.isArray(agents)).toBe(true);
  });

  it("setOrAdd installs a new agent", async () => {
    const agent = await caller.agents.setOrAdd({
      name: "reviewer",
      description: "Reviews code.",
    });
    expect(agent?.name).toBe("reviewer");
    expect(saveSpy).toHaveBeenCalled();
  });

  it("remove evicts an agent from the canonical store", async () => {
    const res = await caller.agents.remove({ name: "reviewer" });
    expect(res).toEqual({ removed: "reviewer" });
  });
});

describe("commandsRouter", () => {
  it("list returns an empty array on a fresh config", async () => {
    const cmds = await caller.commands.list();
    expect(Array.isArray(cmds)).toBe(true);
  });

  it("setOrAdd installs a new command", async () => {
    const cmd = await caller.commands.setOrAdd({
      name: "evolve",
      description: "Evolve the spec.",
      argumentHint: "<section>",
    });
    expect(cmd?.name).toBe("evolve");
    expect(saveSpy).toHaveBeenCalled();
  });

  it("remove evicts a command from the canonical store", async () => {
    const res = await caller.commands.remove({ name: "evolve" });
    expect(res).toEqual({ removed: "evolve" });
  });
});

describe("hooksRouter", () => {
  it("list returns the canonical hooks", async () => {
    const hooks = await caller.hooks.list();
    expect(hooks).toHaveLength(1);
    expect(hooks[0].name).toBe("lint-on-write");
  });

  it("setOrAdd creates a new hook", async () => {
    const hook = await caller.hooks.setOrAdd({
      name: "fmt",
      event: "PreToolUse",
      matcher: "Edit",
      command: "npm run format",
    });
    expect(hook?.name).toBe("fmt");
    expect(hook?.description).toContain("PreToolUse");
  });

  it("remove evicts a hook", async () => {
    const res = await caller.hooks.remove({ name: "fmt" });
    expect(res).toEqual({ removed: "fmt" });
  });
});

describe("settingsRouter", () => {
  it("list returns the managed settings", async () => {
    const entries = await caller.settings.list({});
    expect(entries).toHaveLength(1);
    expect(entries[0].keyPath).toBe("permissions.allow");
  });

  it("setOrAdd records a managed key", async () => {
    const entry = await caller.settings.setOrAdd({
      keyPath: "theme",
      value: "dark",
    });
    expect(entry?.keyPath).toBe("theme");
    expect(entry?.value).toBe("dark");
  });

  it("remove stops managing a key", async () => {
    const res = await caller.settings.remove({ keyPath: "theme" });
    expect(res).toEqual({ removed: "theme" });
  });
});
