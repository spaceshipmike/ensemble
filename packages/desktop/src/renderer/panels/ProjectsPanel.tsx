import React, { useMemo, useState } from "react";
import {
  FilterTabs,
  ListRow,
  PanelEmpty,
  PanelHeader,
  PanelScroll,
  PanelShell,
} from "../components/Panel";
import { WireRow } from "../components/WireRow";
import type { AppWireApi, DiscoveredProject, DiscoveredTool, WireMap } from "../App";

type Filter = "all" | "recent" | "git" | "missing";
type View = { mode: "list" } | { mode: "detail"; projectPath: string };

interface ProjectsPanelProps {
  projects: DiscoveredProject[] | null;
  error: string | null;
  tools: DiscoveredTool[] | null;
  wireMap: WireMap;
  wireApi: AppWireApi;
}

export function ProjectsPanel({ projects, error, tools, wireMap, wireApi }: ProjectsPanelProps) {
  const [view, setView] = useState<View>({ mode: "list" });
  const [filter, setFilter] = useState<Filter>("git");

  if (view.mode === "detail") {
    const project = projects?.find((p) => p.path === view.projectPath);
    if (!project) {
      return (
        <PanelShell>
          <PanelHeader
            label="PROJECT"
            sublabel="NOT FOUND"
            right={<BackButton onClick={() => setView({ mode: "list" })} />}
          />
          <PanelEmpty>PROJECT NOT IN CURRENT SCAN</PanelEmpty>
        </PanelShell>
      );
    }
    return (
      <ProjectDetail
        project={project}
        allTools={tools}
        wireMap={wireMap}
        wireApi={wireApi}
        onBack={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <ProjectList
      projects={projects}
      error={error}
      filter={filter}
      onFilterChange={setFilter}
      onSelect={(path) => setView({ mode: "detail", projectPath: path })}
    />
  );
}

function ProjectList({
  projects,
  error,
  filter,
  onFilterChange,
  onSelect,
}: {
  projects: DiscoveredProject[] | null;
  error: string | null;
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  onSelect: (path: string) => void;
}) {
  const counts = useMemo(() => {
    if (!projects) return { all: 0, recent: 0, git: 0, missing: 0 };
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    // GLOBAL always included in every filter
    const real = projects.filter((p) => p.path !== "__global__");
    return {
      all: projects.length,
      recent: 1 + real.filter((p) => now - p.lastSeenAt < sevenDays).length,
      git: 1 + real.filter((p) => p.isGitRepo).length,
      missing: real.filter((p) => !p.exists).length,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const isGlobal = (p: DiscoveredProject) => p.path === "__global__";
    switch (filter) {
      case "all":
        return projects;
      case "recent":
        return projects.filter((p) => isGlobal(p) || now - p.lastSeenAt < sevenDays);
      case "git":
        return projects.filter((p) => isGlobal(p) || p.isGitRepo);
      case "missing":
        return projects.filter((p) => !isGlobal(p) && !p.exists);
    }
  }, [projects, filter]);

  return (
    <PanelShell>
      <PanelHeader label="PROJECTS" sublabel="CLAUDE CODE" />
      <FilterTabs<Filter>
        tabs={[
          { id: "git", label: "GIT REPOS", count: counts.git },
          { id: "recent", label: "RECENT", count: counts.recent },
          { id: "all", label: "ALL", count: counts.all },
          { id: "missing", label: "MISSING", count: counts.missing },
        ]}
        active={filter}
        onChange={onFilterChange}
      />
      <PanelScroll>
        {error && <PanelEmpty>SCAN FAILED · {error}</PanelEmpty>}
        {!error && projects === null && <PanelEmpty>SCANNING…</PanelEmpty>}
        {!error && projects !== null && filtered.length === 0 && (
          <PanelEmpty>NO PROJECTS MATCH THIS FILTER</PanelEmpty>
        )}
        {!error &&
          filtered.map((project, i) => {
            const isGlobal = project.path === "__global__";
            return (
              <ListRow
                key={project.path}
                index={i + 1}
                label={project.name}
                sublabel={isGlobal ? "~/.claude · USER SCOPE" : shortPath(project.path)}
                meta={
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isGlobal && <span style={{ color: "var(--sync)" }}>GLOBAL</span>}
                    {!isGlobal && !project.exists && (
                      <span style={{ color: "var(--tape)" }}>MISSING</span>
                    )}
                    {!isGlobal && project.exists && !project.isGitRepo && (
                      <span style={{ color: "var(--ink-3)" }}>NO GIT</span>
                    )}
                  </span>
                }
                onClick={() => onSelect(project.path)}
              />
            );
          })}
      </PanelScroll>
    </PanelShell>
  );
}

function ProjectDetail({
  project,
  allTools,
  wireMap,
  wireApi,
  onBack,
}: {
  project: DiscoveredProject;
  allTools: DiscoveredTool[] | null;
  wireMap: WireMap;
  wireApi: AppWireApi;
  onBack: () => void;
}) {
  const isGlobal = project.path === "__global__";
  const [busy, setBusy] = useState<string | null>(null);

  // All library tools that could be wired to this project, organized by type
  // filter. For the project detail, we enumerate the library (global) tools
  // and show each with its wired state against this project scope.
  const [filter, setFilter] = useState<ProjectDetailFilter>("wired");

  const toolsHere = isGlobal
    ? allTools ?? []
    : wireMap[project.path] ?? [];

  const filteredTools = useMemo(() => {
    if (filter === "wired") return toolsHere;
    return (allTools ?? []).filter((t) => t.type !== "hook");
  }, [filter, toolsHere, allTools]);

  const handleToggle = async (tool: DiscoveredTool) => {
    if (tool.type === "hook" || busy) return;
    setBusy(tool.id);
    const currentlyWired = wireApi.isWired(tool.id, project.path);
    if (currentlyWired) {
      await wireApi.unwire(tool, project.path);
    } else {
      await wireApi.wire(tool, project.path);
    }
    setBusy(null);
  };

  return (
    <PanelShell>
      <PanelHeader
        label="PROJECT"
        sublabel={isGlobal ? "GLOBAL" : "CLAUDE CODE"}
        right={<BackButton onClick={onBack} />}
      />
      <PanelScroll>
        <div style={{ padding: "24px 32px 16px", borderBottom: "1px solid var(--hairline)" }}>
          <div
            style={{
              fontSize: 20,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              fontWeight: 500,
              color: "var(--graphite)",
              wordBreak: "break-word",
            }}
          >
            {project.name}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
            <MetaItem
              label="PATH"
              value={isGlobal ? "~/.claude" : shortPath(project.path)}
            />
            {!isGlobal && (
              <MetaItem
                label="LAST SEEN"
                value={project.lastSeenAt ? formatRelative(project.lastSeenAt) : "—"}
              />
            )}
            {!isGlobal && (
              <MetaItem label="GIT" value={project.isGitRepo ? "YES" : "NO"} />
            )}
            <MetaItem label="TOOLS" value={String(toolsHere.length)} />
          </div>
        </div>

        <FilterTabs<ProjectDetailFilter>
          tabs={[
            { id: "wired", label: "WIRED", count: toolsHere.length },
            {
              id: "available",
              label: "AVAILABLE",
              count: (allTools ?? []).filter((t) => t.type !== "hook").length,
            },
          ]}
          active={filter}
          onChange={setFilter}
        />

        {filteredTools.length === 0 && (
          <PanelEmpty>
            {filter === "wired"
              ? isGlobal
                ? "NO TOOLS AT USER SCOPE"
                : "NO TOOLS AT PROJECT SCOPE"
              : "NO TOOLS IN LIBRARY"}
          </PanelEmpty>
        )}
        {filteredTools.map((tool) => {
          const wired = wireApi.isWired(tool.id, project.path);
          const readOnly = tool.type === "hook";
          return (
            <WireRow
              key={tool.id}
              label={tool.name}
              sublabel={`${tool.type.toUpperCase()}${tool.detail ? ` · ${tool.detail.slice(0, 70)}` : ""}`}
              wired={wired}
              readOnly={readOnly}
              disabled={busy !== null && busy !== tool.id}
              onToggle={() => handleToggle(tool)}
              meta={
                busy === tool.id
                  ? "…"
                  : tool.origin === "managed"
                    ? "MANAGED"
                    : "DISCOVERED"
              }
            />
          );
        })}
      </PanelScroll>
    </PanelShell>
  );
}

type ProjectDetailFilter = "wired" | "available";

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--ink-2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 420,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-no-drag
      style={{
        fontFamily: "inherit",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        background: "transparent",
        border: "none",
        color: "var(--ink-2)",
        cursor: "pointer",
        padding: 0,
      }}
    >
      ← BACK
    </button>
  );
}

function shortPath(path: string): string {
  // eslint-disable-next-line no-useless-escape
  return path.replace(/^\/Users\/[^\/]+/, "~");
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  if (days < 30) return `${days}D AGO`;
  if (days < 365) return `${Math.floor(days / 30)}MO AGO`;
  return `${Math.floor(days / 365)}Y AGO`;
}
