import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppWireApi, DiscoveredProject, DiscoveredTool, WireMap } from "../../shared/index";
import { Split } from "./components/Split";
import { ToastProvider, useToast } from "./components/Toast";
import { LibraryPanel } from "./panels/LibraryPanel";
import { ProjectsPanel } from "./panels/ProjectsPanel";
import { trpc } from "./trpc";
import { DoctorView } from "./views/DoctorView";
import { MatrixView } from "./views/MatrixView";
import { RegistryView } from "./views/RegistryView";
import { SnapshotsView } from "./views/SnapshotsView";

export type {
  DiscoveredProject,
  DiscoveredTool,
  WireMap,
  AppWireApi,
  ToolType,
} from "../../shared/index";

type View = "patch" | "matrix" | "doctor" | "snapshots" | "registry";

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';

/** Synthetic project node representing the ~/.claude user scope. */
export const GLOBAL_PROJECT: DiscoveredProject = {
  path: "__global__",
  name: "GLOBAL",
  seenIn: ["claude-code"],
  lastSeenAt: Date.now(),
  exists: true,
  isGitRepo: false,
  registryStatus: "active",
};

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const [view, setView] = useState<View>("patch");
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // --- Data queries ---

  const projectsQuery = trpc.projects.scan.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
  });
  const libraryQuery = trpc.library.scanGlobal.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Derive the list of real (non-global) project paths to fan out a bulk
  // per-project scan against.
  const projectPaths = useMemo(() => {
    const scanned = projectsQuery.data ?? [];
    return scanned.filter((p) => p.seenIn.includes("claude-code")).map((p) => p.path);
  }, [projectsQuery.data]);

  const wireMapQuery = trpc.library.scanAllProjects.useQuery(
    { paths: projectPaths },
    { enabled: projectPaths.length > 0, staleTime: Number.POSITIVE_INFINITY },
  );

  // --- Mutations ---

  const wireMutation = trpc.library.wire.useMutation();
  const unwireMutation = trpc.library.unwire.useMutation();
  const bootstrapMutation = trpc.library.bootstrap.useMutation();

  // --- v2.0.2 canonical library store ---
  //
  // Bootstrap runs once per app session after projects have been scanned so
  // project paths can seed project-scope adoption. Idempotent — subsequent
  // invocations are a cheap manifest read. After bootstrap completes, we
  // query the manifest entries and run reconcile against the global scan so
  // the top chrome can surface live counts of {entries, drifts, orphans}.
  //
  // Not on the render hot path — the matrix still reads from scanGlobal.
  // This is a parallel channel that plumbs the store into existence and
  // gives an always-visible validation signal.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (projectsQuery.isLoading || projectsQuery.error) return;
    bootstrappedRef.current = true;
    bootstrapMutation
      .mutateAsync({ projectPaths })
      .then(() => {
        utils.library.entries.invalidate();
        utils.library.reconcileScope.invalidate();
      })
      .catch(() => {
        bootstrappedRef.current = false;
      });
  }, [projectPaths, projectsQuery.isLoading, projectsQuery.error, bootstrapMutation, utils]);

  const entriesQuery = trpc.library.entries.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
  });
  const reconcileQuery = trpc.library.reconcileScope.useQuery(
    { scope: "global" },
    { staleTime: Number.POSITIVE_INFINITY, enabled: (entriesQuery.data?.length ?? 0) > 0 },
  );

  const libraryStatus = useMemo(() => {
    const total = entriesQuery.data?.length ?? 0;
    const r = reconcileQuery.data;
    return {
      total,
      matches: r?.matches.length ?? 0,
      drifts: r?.drifts.length ?? 0,
      orphans: r?.orphans.length ?? 0,
    };
  }, [entriesQuery.data, reconcileQuery.data]);

  // --- Derived state ---

  const projects: DiscoveredProject[] | null = useMemo(() => {
    if (!projectsQuery.data) return null;
    const ccOnly = projectsQuery.data.filter((p) => p.seenIn.includes("claude-code"));
    return [GLOBAL_PROJECT, ...ccOnly];
  }, [projectsQuery.data]);

  // Raw global scan is still what we use to answer "is this wired at the
  // GLOBAL scope?" — the library is canonical, but the matrix cells need
  // to reflect what's actually on disk right now.
  const globalScanTools: DiscoveredTool[] | null = libraryQuery.data ?? null;
  const wireMap: WireMap = wireMapQuery.data ?? {};

  // v2.0.2 matrix rows come from the canonical library. Each manifest entry
  // is projected into a DiscoveredTool with scope: { kind: "library" } so
  // wire() can use the canonical store as the source when the user clicks a
  // cell. Ids match the scan-side format (`type:name` or
  // `plugin:name@marketplace`) so isWired lookups continue to work.
  const libraryTools: DiscoveredTool[] | null = useMemo(() => {
    if (!entriesQuery.data) return null;
    return entriesQuery.data.map((entry): DiscoveredTool => {
      const id =
        entry.type === "plugin"
          ? `plugin:${entry.name}@${entry.pluginMarketplace ?? entry.source}`
          : `${entry.type}:${entry.name}`;
      return {
        id,
        type: entry.type,
        name: entry.name,
        description: "",
        scope: { kind: "library" },
        origin: "managed",
        filePath: entry.filePath,
        detail: entry.source,
        pluginEnabled: entry.type === "plugin" ? true : undefined,
        pluginMarketplace:
          entry.type === "plugin"
            ? entry.pluginMarketplace ?? (entry.source !== "@discovered" ? entry.source : undefined)
            : undefined,
      };
    });
  }, [entriesQuery.data]);

  const projectsError = projectsQuery.error?.message ?? null;
  const libraryError = libraryQuery.error?.message ?? null;

  const loading = projectsQuery.isLoading || libraryQuery.isLoading;

  // --- Wire API ---

  const isWired = useCallback(
    (toolId: string, projectPath: string): boolean => {
      if (projectPath === "__global__") {
        // Look in the raw global scan — the library is canonical, but the
        // matrix cell is "is this currently on disk at the global scope?"
        const tool = globalScanTools?.find((t) => t.id === toolId);
        if (!tool) return false;
        if (tool.type === "plugin") return tool.pluginEnabled === true;
        return true;
      }
      const tools = wireMap[projectPath] ?? [];
      return tools.some((t) => t.id === toolId);
    },
    [globalScanTools, wireMap],
  );

  const refreshOne = useCallback(
    (targetPath: string) => {
      if (targetPath === "__global__") {
        utils.library.scanGlobal.invalidate();
      } else {
        utils.library.scanAllProjects.invalidate();
      }
      // Reconcile result reflects what's on disk vs canonical — any wire
      // change can flip a row between match and drift.
      utils.library.reconcileScope.invalidate();
    },
    [utils],
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

      const name = tool.type === "plugin" ? tool.id.replace(/^plugin:/, "") : tool.name;

      try {
        const res = await wireMutation.mutateAsync({
          type: tool.type,
          name,
          source,
          target,
        });
        if (res.ok) {
          toast(
            `WIRED ${tool.name.toUpperCase()} → ${
              targetPath === "__global__" ? "GLOBAL" : basename(targetPath)
            }`,
          );
        } else {
          toast(`FAILED · ${res.reason ?? "unknown"}`);
        }
        refreshOne(targetPath);
        return { ok: res.ok, reason: res.reason };
      } catch (e) {
        const reason = e instanceof Error ? e.message : "wire failed";
        toast(`FAILED · ${reason}`);
        return { ok: false, reason };
      }
    },
    [toast, wireMutation, refreshOne],
  );

  const unwire = useCallback(
    async (tool: DiscoveredTool, targetPath: string) => {
      const scope =
        targetPath === "__global__"
          ? { kind: "global" as const }
          : { kind: "project" as const, path: targetPath };
      const name = tool.type === "plugin" ? tool.id.replace(/^plugin:/, "") : tool.name;

      try {
        const res = await unwireMutation.mutateAsync({
          type: tool.type,
          name,
          scope,
        });
        if (res.ok) {
          toast(`UNWIRED ${tool.name.toUpperCase()}`);
        } else {
          toast(`SKIPPED · ${res.reason ?? "unknown"}`);
        }
        refreshOne(targetPath);
        return { ok: res.ok, reason: res.reason };
      } catch (e) {
        const reason = e instanceof Error ? e.message : "unwire failed";
        toast(`FAILED · ${reason}`);
        return { ok: false, reason };
      }
    },
    [toast, unwireMutation, refreshOne],
  );

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
      <TopChrome view={view} onViewChange={setView} libraryStatus={libraryStatus} />
      {loading && <LoadingState />}
      {projectsError && !projects && <ErrorState message={projectsError} />}
      {!loading && view === "patch" && (
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
      {!loading && view === "matrix" && (
        <MatrixView
          tools={libraryTools}
          projects={projects}
          wireApi={wireApi}
          libraryError={libraryError}
          projectsError={projectsError}
        />
      )}
      {!loading && view === "doctor" && <DoctorView />}
      {!loading && view === "snapshots" && <SnapshotsView />}
      {!loading && view === "registry" && <RegistryView />}
    </div>
  );
}

function basename(path: string): string {
  const m = /([^/]+)\/?$/.exec(path);
  return m?.[1] ?? path;
}

interface LibraryStatus {
  total: number;
  matches: number;
  drifts: number;
  orphans: number;
}

function TopChrome({
  view,
  onViewChange,
  libraryStatus,
}: {
  view: View;
  onViewChange: (v: View) => void;
  libraryStatus: LibraryStatus;
}) {
  const tabs: { id: View; label: string }[] = [
    { id: "patch", label: "PATCH" },
    { id: "matrix", label: "MATRIX" },
    { id: "doctor", label: "DOCTOR" },
    { id: "snapshots", label: "SNAPSHOTS" },
    { id: "registry", label: "REGISTRY" },
  ];
  const sublabel =
    view === "patch"
      ? "PATCH BAY"
      : view === "matrix"
        ? "MATRIX"
        : view === "doctor"
          ? "DOCTOR"
          : view === "snapshots"
            ? "SNAPSHOTS"
            : "REGISTRY";
  return (
    <div
      data-drag-region
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "44px 32px 14px 32px",
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
          / {sublabel}
        </span>
        <LibraryStatusBadge status={libraryStatus} />
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        {tabs.map((tab) => {
          const active = tab.id === view;
          return (
            <button
              key={tab.id}
              type="button"
              data-no-drag
              onClick={() => onViewChange(tab.id)}
              style={{
                fontFamily: "inherit",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: active ? "var(--graphite)" : "var(--ink-3)",
                fontWeight: active ? 500 : 400,
                borderBottom: active ? "1px solid var(--graphite)" : "1px solid transparent",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                background: "transparent",
                paddingBottom: 2,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LibraryStatusBadge({ status }: { status: LibraryStatus }) {
  if (status.total === 0) return null;
  const hasIssues = status.drifts > 0 || status.orphans > 0;
  return (
    <span
      data-no-drag
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: hasIssues ? "var(--tape)" : "var(--ink-3)",
        marginLeft: 16,
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "baseline",
        gap: 10,
      }}
      title={`Canonical library at ~/.config/ensemble/library: ${status.total} entries, ${status.matches} match the global scope, ${status.drifts} drift, ${status.orphans} orphans`}
    >
      <span style={{ color: "var(--ink-3)" }}>LIB</span>
      <span style={{ color: "var(--graphite)" }}>{status.total}</span>
      {status.drifts > 0 && (
        <>
          <span style={{ color: "var(--ink-3)" }}>·</span>
          <span style={{ color: "var(--tape)" }}>{status.drifts} DRIFT</span>
        </>
      )}
      {status.orphans > 0 && (
        <>
          <span style={{ color: "var(--ink-3)" }}>·</span>
          <span style={{ color: "var(--tape)" }}>{status.orphans} ORPHAN</span>
        </>
      )}
    </span>
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
        FAILED TO LOAD
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{message}</div>
    </div>
  );
}
