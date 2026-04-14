import React, { useCallback, useEffect, useState } from "react";
import { ToastProvider, useToast } from "./components/Toast";
import { useConfig } from "./hooks/useConfig";
import { Split } from "./components/Split";
import { LibraryPanel } from "./panels/LibraryPanel";
import { ProjectsPanel } from "./panels/ProjectsPanel";

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';

export interface DiscoveredProject {
  path: string;
  name: string;
  seenIn: string[];
  lastSeenAt: number;
  exists: boolean;
  isGitRepo: boolean;
}

export type ToolType =
  | "server"
  | "skill"
  | "agent"
  | "command"
  | "style"
  | "plugin"
  | "hook";

export interface DiscoveredTool {
  id: string;
  type: ToolType;
  name: string;
  description: string;
  scope: { kind: "global" } | { kind: "project"; path: string };
  origin: "discovered" | "managed";
  filePath?: string;
  detail: string;
  /** Plugin-only: whether the plugin is enabled at its discovered scope. */
  pluginEnabled?: boolean;
}

/** Synthetic project node representing the ~/.claude user scope. */
export const GLOBAL_PROJECT: DiscoveredProject = {
  path: "__global__",
  name: "GLOBAL",
  seenIn: ["claude-code"],
  lastSeenAt: Date.now(),
  exists: true,
  isGitRepo: false,
};

/** Map from project path ("__global__" or an absolute path) to tools at that scope. */
export type WireMap = Record<string, DiscoveredTool[]>;

export interface AppWireApi {
  /** Is the given tool present at the given project scope? */
  isWired: (toolId: string, projectPath: string) => boolean;
  /** Wire a tool from its source scope to a target project scope. */
  wire: (
    tool: DiscoveredTool,
    targetPath: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  /** Unwire (remove) a tool from a target project scope. */
  unwire: (
    tool: DiscoveredTool,
    targetPath: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
}

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const { config, loading, error } = useConfig();
  const [projects, setProjects] = useState<DiscoveredProject[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [libraryTools, setLibraryTools] = useState<DiscoveredTool[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [wireMap, setWireMap] = useState<WireMap>({});
  const { toast } = useToast();

  const reloadProjects = useCallback(async () => {
    try {
      const res = (await window.ensemble.projects.scan()) as {
        ok: boolean;
        data?: DiscoveredProject[];
        error?: string;
      };
      if (res.ok && res.data) {
        const ccOnly = res.data.filter((p) => p.seenIn.includes("claude-code"));
        setProjects([GLOBAL_PROJECT, ...ccOnly]);
        setProjectsError(null);
        return ccOnly.map((p) => p.path);
      }
      setProjectsError(res.error ?? "Project scan failed");
      return [];
    } catch (e) {
      setProjectsError(e instanceof Error ? e.message : String(e));
      return [];
    }
  }, []);

  const reloadLibrary = useCallback(async () => {
    try {
      const res = (await window.ensemble.library.scanGlobal()) as {
        ok: boolean;
        data?: DiscoveredTool[];
        error?: string;
      };
      if (res.ok && res.data) {
        setLibraryTools(res.data);
        setLibraryError(null);
      } else {
        setLibraryError(res.error ?? "Library scan failed");
      }
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reloadWireMap = useCallback(async (projectPaths: string[]) => {
    try {
      const res = (await window.ensemble.library.scanAllProjects(projectPaths)) as {
        ok: boolean;
        data?: WireMap;
        error?: string;
      };
      if (res.ok && res.data) setWireMap(res.data);
    } catch {
      // non-fatal — wire map stays stale
    }
  }, []);

  const reloadAll = useCallback(async () => {
    const paths = await reloadProjects();
    await reloadLibrary();
    await reloadWireMap(paths);
  }, [reloadProjects, reloadLibrary, reloadWireMap]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const isWired = useCallback(
    (toolId: string, projectPath: string): boolean => {
      if (projectPath === "__global__") {
        const tool = libraryTools?.find((t) => t.id === toolId);
        if (!tool) return false;
        // For plugins, presence in the library is not enough — must be enabled.
        if (tool.type === "plugin") return tool.pluginEnabled === true;
        // For hooks, they're "wired" if they exist (read-only).
        return true;
      }
      const tools = wireMap[projectPath] ?? [];
      // For plugins at project scope, scanProjectEnabledPlugins already filters
      // to enabled === true entries, so presence implies enabled.
      return tools.some((t) => t.id === toolId);
    },
    [libraryTools, wireMap],
  );

  const wire = useCallback(
    async (tool: DiscoveredTool, targetPath: string) => {
      const target =
        targetPath === "__global__"
          ? { kind: "global" as const }
          : { kind: "project" as const, path: targetPath };
      const source =
        tool.scope.kind === "global"
          ? { kind: "global" as const }
          : { kind: "project" as const, path: tool.scope.path };

      // Plugins use their canonical key as the "name"
      const name = tool.type === "plugin" ? tool.id.replace(/^plugin:/, "") : tool.name;

      const res = (await window.ensemble.library.wire({
        type: tool.type,
        name,
        source,
        target,
      })) as { ok: boolean; data?: { ok: boolean; reason?: string; action?: string }; error?: string };

      const ok = res?.data?.ok ?? res?.ok ?? false;
      if (ok) {
        toast(`WIRED ${tool.name.toUpperCase()} → ${targetPath === "__global__" ? "GLOBAL" : basename(targetPath)}`);
      } else {
        toast(`FAILED · ${res?.data?.reason ?? res?.error ?? "unknown"}`);
      }

      // Refresh scope data
      if (targetPath === "__global__") {
        await reloadLibrary();
      } else {
        await refreshOneProject(targetPath);
      }

      return { ok, reason: res?.data?.reason ?? res?.error };
    },
    [toast, reloadLibrary],
  );

  const unwire = useCallback(
    async (tool: DiscoveredTool, targetPath: string) => {
      const scope =
        targetPath === "__global__"
          ? { kind: "global" as const }
          : { kind: "project" as const, path: targetPath };
      const name = tool.type === "plugin" ? tool.id.replace(/^plugin:/, "") : tool.name;

      const res = (await window.ensemble.library.unwire({
        type: tool.type,
        name,
        scope,
      })) as { ok: boolean; data?: { ok: boolean; reason?: string; action?: string }; error?: string };

      const ok = res?.data?.ok ?? res?.ok ?? false;
      if (ok) {
        toast(`UNWIRED ${tool.name.toUpperCase()}`);
      } else {
        toast(`SKIPPED · ${res?.data?.reason ?? res?.error ?? "unknown"}`);
      }

      if (targetPath === "__global__") {
        await reloadLibrary();
      } else {
        await refreshOneProject(targetPath);
      }

      return { ok, reason: res?.data?.reason ?? res?.error };
    },
    [toast, reloadLibrary],
  );

  const refreshOneProject = useCallback(async (projectPath: string) => {
    try {
      const res = (await window.ensemble.library.scanProject(projectPath)) as {
        ok: boolean;
        data?: DiscoveredTool[];
      };
      if (res.ok && res.data) {
        setWireMap((prev) => ({ ...prev, [projectPath]: res.data! }));
      }
    } catch {
      // non-fatal
    }
  }, []);

  const wireApi: AppWireApi = { isWired, wire, unwire };

  return (
    <div
      data-testid="app-root"
      className="te-app te-scope"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bone)",
        color: "var(--graphite)",
        fontFamily: MONO,
      }}
    >
      <TopChrome />
      {loading && <LoadingState />}
      {error && !config && <ErrorState message={error} />}
      {!loading && (
        <Split
          left={
            <LibraryPanel
              tools={libraryTools}
              error={libraryError}
              projects={projects}
              wireApi={wireApi}
            />
          }
          right={
            <ProjectsPanel
              projects={projects}
              error={projectsError}
              tools={libraryTools}
              wireMap={wireMap}
              wireApi={wireApi}
            />
          }
        />
      )}
    </div>
  );
}

function basename(path: string): string {
  const m = /([^/]+)\/?$/.exec(path);
  return m?.[1] ?? path;
}

function TopChrome() {
  return (
    <div
      data-drag-region
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "44px 24px 14px 88px",
        borderBottom: "1px solid var(--hairline-strong)",
        background: "var(--bone)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--graphite)",
            fontWeight: 500,
          }}
        >
          ENSEMBLE
        </span>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          / PATCH BAY
        </span>
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        {["PATCH", "MATRIX", "DOCTOR"].map((label, i) => (
          <span
            key={label}
            data-no-drag
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: i === 0 ? "var(--graphite)" : "var(--ink-3)",
              fontWeight: i === 0 ? 500 : 400,
              borderBottom: i === 0 ? "1px solid var(--graphite)" : "1px solid transparent",
              paddingBottom: 2,
              cursor: "default",
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
      }}
    >
      LOADING CONFIGURATION…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        flexDirection: "column",
        gap: 8,
        padding: 48,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--tape)",
        }}
      >
        FAILED TO LOAD CONFIG
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{message}</div>
    </div>
  );
}
