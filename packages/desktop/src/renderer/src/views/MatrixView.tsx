import React, { useMemo, useState } from "react";
import type { AppWireApi, DiscoveredProject, DiscoveredTool, ToolType } from "../App";

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';

const TYPE_ORDER: ToolType[] = ["server", "skill", "agent", "command", "style", "plugin", "hook"];

type StatusFilter = "active" | "archived" | "unregistered" | "all";

const TYPE_LABEL: Record<ToolType, string> = {
  server: "SERVERS",
  skill: "SKILLS",
  agent: "AGENTS",
  command: "COMMANDS",
  style: "STYLES",
  plugin: "PLUGINS",
  hook: "HOOKS",
};

interface MatrixViewProps {
  tools: DiscoveredTool[] | null;
  projects: DiscoveredProject[] | null;
  wireApi: AppWireApi;
  libraryError: string | null;
  projectsError: string | null;
}

type Hover =
  | { kind: "none" }
  | { kind: "row"; toolId: string }
  | { kind: "col"; projectPath: string };

export function MatrixView({
  tools,
  projects,
  wireApi,
  libraryError,
  projectsError,
}: MatrixViewProps) {
  const [hover, setHover] = useState<Hover>({ kind: "none" });
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | ToolType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const visibleTools = useMemo(() => {
    if (!tools) return [];
    const filtered = typeFilter === "all" ? tools : tools.filter((t) => t.type === typeFilter);
    return [...filtered].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }, [tools, typeFilter]);

  const grouped = useMemo(() => {
    const groups: { type: ToolType; tools: DiscoveredTool[] }[] = [];
    for (const t of visibleTools) {
      const last = groups[groups.length - 1];
      if (last && last.type === t.type) last.tools.push(t);
      else groups.push({ type: t.type, tools: [t] });
    }
    return groups;
  }, [visibleTools]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: tools?.length ?? 0 };
    for (const t of tools ?? []) c[t.type] = (c[t.type] ?? 0) + 1;
    return c;
  }, [tools]);

  const columns = useMemo(() => {
    if (!projects) return [];
    return projects.filter((p) => {
      if (p.path === "__global__") return true;
      if (statusFilter === "all") return true;
      return p.registryStatus === statusFilter;
    });
  }, [projects, statusFilter]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {
      active: 1, // GLOBAL always present
      archived: 0,
      unregistered: 0,
      all: projects?.length ?? 0,
    };
    for (const p of projects ?? []) {
      if (p.path === "__global__") continue;
      if (p.registryStatus === "active") c.active = (c.active ?? 0) + 1;
      else if (p.registryStatus === "archived") c.archived = (c.archived ?? 0) + 1;
      else c.unregistered = (c.unregistered ?? 0) + 1;
    }
    return c;
  }, [projects]);

  const handleCellClick = async (tool: DiscoveredTool, project: DiscoveredProject) => {
    if (tool.type === "hook") return;
    const cellKey = `${tool.id}::${project.path}`;
    if (busyCell) return;
    setBusyCell(cellKey);
    const wired = wireApi.isWired(tool.id, project.path);
    if (wired) await wireApi.unwire(tool, project.path);
    else await wireApi.wire(tool, project.path);
    setBusyCell(null);
  };

  const loading = tools === null || projects === null;
  const error = libraryError || projectsError;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: "var(--bone)",
        color: "var(--graphite)",
        fontFamily: MONO,
      }}
    >
      <MatrixHeader
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        counts={typeCounts}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        toolCount={visibleTools.length}
        scopeCount={columns.length}
      />

      {error && <MatrixEmpty>SCAN FAILED · {error}</MatrixEmpty>}
      {!error && loading && <MatrixEmpty>SCANNING…</MatrixEmpty>}
      {!error && !loading && visibleTools.length === 0 && (
        <MatrixEmpty>NO TOOLS IN CURRENT FILTER</MatrixEmpty>
      )}
      {!error && !loading && visibleTools.length > 0 && (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
            position: "relative",
          }}
          onMouseLeave={() => setHover({ kind: "none" })}
        >
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--graphite)",
              minWidth: "100%",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    ...stickyTopLeft,
                    minWidth: 280,
                    padding: "14px 18px 14px 30px",
                    borderBottom: "1px solid var(--hairline-strong)",
                    borderRight: "1px solid var(--hairline)",
                    background: "var(--bone)",
                    textAlign: "left",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "var(--ink-3)",
                    fontWeight: 500,
                  }}
                >
                  TOOL / SCOPE
                </th>
                {columns.map((project) => {
                  const isGlobal = project.path === "__global__";
                  const colActive = hover.kind === "col" && hover.projectPath === project.path;
                  return (
                    <th
                      key={project.path}
                      onMouseEnter={() => setHover({ kind: "col", projectPath: project.path })}
                      style={{
                        ...stickyTop,
                        minWidth: 72,
                        maxWidth: 140,
                        padding: "14px 10px",
                        borderBottom: "1px solid var(--hairline-strong)",
                        borderRight: "1px solid var(--hairline)",
                        background: colActive ? "var(--bone-sunk)" : "var(--bone)",
                        textAlign: "center",
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        color: isGlobal ? "var(--graphite)" : "var(--ink-2)",
                        fontWeight: isGlobal ? 500 : 400,
                        verticalAlign: "bottom",
                      }}
                      title={isGlobal ? "~/.claude · USER SCOPE" : project.path}
                    >
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 120,
                        }}
                      >
                        {truncate(project.name, 14)}
                      </div>
                      {!isGlobal && !project.exists && (
                        <div style={{ marginTop: 4, color: "var(--tape)", fontSize: 9 }}>
                          MISSING
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <React.Fragment key={group.type}>
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      style={{
                        ...stickyLeft,
                        padding: "16px 30px 6px",
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        color: "var(--ink-3)",
                        background: "var(--bone)",
                        borderBottom: "1px solid var(--hairline)",
                      }}
                    >
                      {TYPE_LABEL[group.type]} · {group.tools.length}
                    </td>
                  </tr>
                  {group.tools.map((tool) => {
                    const rowActive = hover.kind === "row" && hover.toolId === tool.id;
                    const dimmed = hover.kind === "row" && hover.toolId !== tool.id;
                    return (
                      <tr
                        key={tool.id}
                        style={{
                          opacity: dimmed ? 0.35 : 1,
                          transition: "opacity 80ms linear",
                        }}
                        onMouseEnter={() => setHover({ kind: "row", toolId: tool.id })}
                      >
                        <td
                          style={{
                            ...stickyLeft,
                            padding: "10px 18px 10px 30px",
                            borderBottom: "1px solid var(--hairline)",
                            borderRight: "1px solid var(--hairline)",
                            background: rowActive ? "var(--bone-sunk)" : "var(--bone)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 280,
                          }}
                          title={tool.description || tool.name}
                        >
                          <span
                            aria-hidden
                            style={{
                              display: "inline-block",
                              width: 6,
                              height: 6,
                              marginRight: 10,
                              verticalAlign: "middle",
                              background: tool.origin === "managed" ? "var(--sync)" : "transparent",
                              border: tool.origin === "managed" ? "none" : "1px solid var(--ink-3)",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 12,
                              letterSpacing: "0.04em",
                              fontWeight: 500,
                              verticalAlign: "middle",
                            }}
                          >
                            {tool.name}
                          </span>
                          {tool.type === "plugin" && tool.pluginMarketplace && (
                            <span
                              style={{
                                marginLeft: 10,
                                fontSize: 10,
                                color: "var(--ink-3)",
                                letterSpacing: "0.08em",
                                verticalAlign: "middle",
                                textTransform: "none",
                              }}
                            >
                              @{tool.pluginMarketplace}
                            </span>
                          )}
                        </td>
                        {columns.map((project) => {
                          const wired = wireApi.isWired(tool.id, project.path);
                          const isHook = tool.type === "hook";
                          const cellKey = `${tool.id}::${project.path}`;
                          const isBusy = busyCell === cellKey;
                          const colActive =
                            hover.kind === "col" && hover.projectPath === project.path;
                          return (
                            <td
                              key={project.path}
                              onMouseEnter={() =>
                                setHover({ kind: "col", projectPath: project.path })
                              }
                              style={{
                                padding: 0,
                                borderBottom: "1px solid var(--hairline)",
                                borderRight: "1px solid var(--hairline)",
                                background: colActive ? "var(--bone-sunk)" : "transparent",
                                textAlign: "center",
                                verticalAlign: "middle",
                              }}
                            >
                              <Cell
                                wired={wired}
                                isHook={isHook}
                                busy={isBusy}
                                onClick={() => handleCellClick(tool, project)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MatrixLegend />
    </div>
  );
}

function Cell({
  wired,
  isHook,
  busy,
  onClick,
}: {
  wired: boolean;
  isHook: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const size = 14;
  const box: React.CSSProperties = {
    width: size,
    height: size,
    display: "inline-block",
    verticalAlign: "middle",
  };
  let body: React.ReactNode;
  if (isHook) {
    body = (
      <span
        aria-label="read-only"
        style={{
          ...box,
          background: "repeating-linear-gradient(45deg, var(--ink-3) 0 1px, transparent 1px 4px)",
          border: "1px solid var(--hairline-strong)",
        }}
      />
    );
  } else if (busy) {
    body = (
      <span
        style={{
          ...box,
          border: "1px dashed var(--ink-3)",
        }}
      />
    );
  } else if (wired) {
    body = (
      <span
        aria-label="wired"
        style={{
          ...box,
          background: "var(--graphite)",
          border: "1px solid var(--graphite)",
        }}
      />
    );
  } else {
    body = (
      <span
        aria-label="unwired"
        style={{
          ...box,
          background: "transparent",
          border: "1px solid var(--hairline-strong)",
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isHook}
      style={{
        width: "100%",
        height: 32,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: isHook ? "not-allowed" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {body}
    </button>
  );
}

function MatrixHeader({
  typeFilter,
  onTypeFilterChange,
  counts,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  toolCount,
  scopeCount,
}: {
  typeFilter: "all" | ToolType;
  onTypeFilterChange: (f: "all" | ToolType) => void;
  counts: Record<string, number>;
  statusFilter: StatusFilter;
  onStatusFilterChange: (f: StatusFilter) => void;
  statusCounts: Record<string, number>;
  toolCount: number;
  scopeCount: number;
}) {
  const statusTabs: { id: StatusFilter; label: string }[] = [
    { id: "active", label: "ACTIVE" },
    { id: "archived", label: "ARCHIVED" },
    { id: "unregistered", label: "UNREGISTERED" },
    { id: "all", label: "ALL" },
  ];
  const tabs: { id: "all" | ToolType; label: string }[] = [
    { id: "all", label: "ALL" },
    { id: "server", label: "SERVERS" },
    { id: "skill", label: "SKILLS" },
    { id: "agent", label: "AGENTS" },
    { id: "command", label: "COMMANDS" },
    { id: "style", label: "STYLES" },
    { id: "plugin", label: "PLUGINS" },
    { id: "hook", label: "HOOKS" },
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "14px 32px 10px",
        borderBottom: "1px solid var(--hairline)",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 20,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {statusTabs.map((s) => {
            const active = s.id === statusFilter;
            const count = statusCounts[s.id] ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onStatusFilterChange(s.id)}
                style={{
                  fontFamily: "inherit",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: active ? "var(--graphite)" : "var(--ink-3)",
                  background: "transparent",
                  border: "none",
                  padding: "2px 14px 4px 0",
                  cursor: "pointer",
                  fontWeight: active ? 500 : 400,
                  borderBottom: active ? "1px solid var(--graphite)" : "1px solid transparent",
                }}
              >
                {s.label}
                <span
                  style={{
                    marginLeft: 6,
                    color: "var(--ink-3)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {toolCount} TOOLS · {scopeCount} SCOPES
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {tabs.map((t) => {
          const active = t.id === typeFilter;
          const count = counts[t.id] ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTypeFilterChange(t.id)}
              style={{
                fontFamily: "inherit",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: active ? "var(--graphite)" : "var(--ink-3)",
                background: "transparent",
                border: "none",
                padding: "4px 14px 4px 0",
                cursor: "pointer",
                fontWeight: active ? 500 : 400,
                borderBottom: active ? "1px solid var(--graphite)" : "1px solid transparent",
                paddingBottom: 6,
              }}
            >
              {t.label}
              <span
                style={{ marginLeft: 6, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MatrixLegend() {
  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        padding: "10px 32px",
        borderTop: "1px solid var(--hairline)",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        flexShrink: 0,
      }}
    >
      <LegendSwatch kind="wired" label="WIRED" />
      <LegendSwatch kind="unwired" label="UNWIRED" />
      <LegendSwatch kind="hook" label="READ-ONLY" />
      <LegendSwatch kind="managed" label="MANAGED" />
    </div>
  );
}

function LegendSwatch({
  kind,
  label,
}: {
  kind: "wired" | "unwired" | "hook" | "managed";
  label: string;
}) {
  let swatch: React.CSSProperties = {
    width: 10,
    height: 10,
    display: "inline-block",
    verticalAlign: "middle",
    marginRight: 8,
  };
  if (kind === "wired") {
    swatch = { ...swatch, background: "var(--graphite)" };
  } else if (kind === "unwired") {
    swatch = { ...swatch, border: "1px solid var(--hairline-strong)" };
  } else if (kind === "hook") {
    swatch = {
      ...swatch,
      background: "repeating-linear-gradient(45deg, var(--ink-3) 0 1px, transparent 1px 4px)",
      border: "1px solid var(--hairline-strong)",
    };
  } else {
    swatch = { ...swatch, background: "var(--sync)" };
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span style={swatch} />
      {label}
    </span>
  );
}

function MatrixEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
      }}
    >
      {children}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

const stickyTop: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const stickyLeft: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 1,
};

const stickyTopLeft: React.CSSProperties = {
  position: "sticky",
  top: 0,
  left: 0,
  zIndex: 3,
};
