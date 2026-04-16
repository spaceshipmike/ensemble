import { useMemo, useState } from "react";
import type { AppWireApi, DiscoveredProject, DiscoveredTool } from "../App";
import {
  FilterTabs,
  ListRow,
  PanelEmpty,
  PanelHeader,
  PanelScroll,
  PanelShell,
} from "../components/Panel";
import { WireRow } from "../components/WireRow";

type Filter = "all" | "server" | "skill" | "agent" | "command" | "style" | "plugin" | "hook";

interface LibraryPanelProps {
  tools: DiscoveredTool[] | null;
  error: string | null;
  projects: DiscoveredProject[] | null;
  wireApi: AppWireApi;
}

type View = { mode: "list" } | { mode: "detail"; toolId: string };

export function LibraryPanel({ tools, error, projects, wireApi }: LibraryPanelProps) {
  const [view, setView] = useState<View>({ mode: "list" });
  const [filter, setFilter] = useState<Filter>("all");

  if (view.mode === "detail") {
    const tool = tools?.find((t) => t.id === view.toolId);
    if (!tool) {
      return (
        <PanelShell>
          <PanelHeader
            label="LIBRARY"
            sublabel="NOT FOUND"
            right={<BackButton onClick={() => setView({ mode: "list" })} />}
          />
          <PanelEmpty>TOOL NOT IN CURRENT SCAN</PanelEmpty>
        </PanelShell>
      );
    }
    return (
      <LibraryDetail
        tool={tool}
        projects={projects}
        wireApi={wireApi}
        onBack={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <LibraryList
      tools={tools}
      error={error}
      filter={filter}
      onFilterChange={setFilter}
      onSelect={(id) => setView({ mode: "detail", toolId: id })}
    />
  );
}

function LibraryList({
  tools,
  error,
  filter,
  onFilterChange,
  onSelect,
}: {
  tools: DiscoveredTool[] | null;
  error: string | null;
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  onSelect: (id: string) => void;
}) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tools?.length ?? 0 };
    for (const t of tools ?? []) c[t.type] = (c[t.type] ?? 0) + 1;
    return c;
  }, [tools]);

  const filtered = useMemo(
    () => (!tools ? [] : filter === "all" ? tools : tools.filter((t) => t.type === filter)),
    [tools, filter],
  );

  return (
    <PanelShell>
      <PanelHeader label="LIBRARY" sublabel="GLOBAL" />
      <FilterTabs<Filter>
        tabs={[
          { id: "all", label: "ALL", count: counts.all },
          { id: "server", label: "SERVERS", count: counts.server ?? 0 },
          { id: "skill", label: "SKILLS", count: counts.skill ?? 0 },
          { id: "agent", label: "AGENTS", count: counts.agent ?? 0 },
          { id: "command", label: "COMMANDS", count: counts.command ?? 0 },
          { id: "style", label: "STYLES", count: counts.style ?? 0 },
          { id: "plugin", label: "PLUGINS", count: counts.plugin ?? 0 },
          { id: "hook", label: "HOOKS", count: counts.hook ?? 0 },
        ]}
        active={filter}
        onChange={onFilterChange}
      />
      <PanelScroll>
        {error && <PanelEmpty>SCAN FAILED · {error}</PanelEmpty>}
        {!error && tools === null && <PanelEmpty>SCANNING…</PanelEmpty>}
        {!error && tools !== null && filtered.length === 0 && (
          <PanelEmpty>
            {tools.length === 0 ? "NO TOOLS FOUND" : `NO ${filter.toUpperCase()}S`}
          </PanelEmpty>
        )}
        {!error &&
          filtered.map((tool, i) => (
            <ListRow
              key={tool.id}
              index={i + 1}
              label={tool.name}
              sublabel={tool.detail}
              meta={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <OriginGlyph origin={tool.origin} />
                  <span>{tool.type.toUpperCase()}</span>
                </span>
              }
              onClick={() => onSelect(tool.id)}
            />
          ))}
      </PanelScroll>
    </PanelShell>
  );
}

function LibraryDetail({
  tool,
  projects,
  wireApi,
  onBack,
}: {
  tool: DiscoveredTool;
  projects: DiscoveredProject[] | null;
  wireApi: AppWireApi;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const wireable = tool.type !== "hook";

  // Mirror the matrix + project list defaults: global + active-registry
  // projects only. Keeps the wire-to list focused on real targets instead
  // of the full unfiltered scan.
  const filteredProjects = useMemo(
    () =>
      (projects ?? []).filter(
        (p) => p.path === "__global__" || p.registryStatus === "active",
      ),
    [projects],
  );

  const handleToggle = async (projectPath: string) => {
    if (!wireable || busy) return;
    setBusy(projectPath);
    const currentlyWired = wireApi.isWired(tool.id, projectPath);
    if (currentlyWired) {
      await wireApi.unwire(tool, projectPath);
    } else {
      await wireApi.wire(tool, projectPath);
    }
    setBusy(null);
  };

  return (
    <PanelShell>
      <PanelHeader
        label="LIBRARY"
        sublabel={tool.type.toUpperCase()}
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
            {tool.name}
          </div>
          {tool.description && (
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.5 }}>
              {tool.description}
            </div>
          )}
          <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
            <MetaItem label="ORIGIN" value={tool.origin.toUpperCase()} />
            <MetaItem label="SCOPE" value={tool.scope.kind === "global" ? "GLOBAL" : "PROJECT"} />
            {tool.filePath && <MetaItem label="PATH" value={shortPath(tool.filePath)} />}
          </div>
        </div>

        <div
          style={{
            padding: "18px 32px 10px",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          {wireable ? "WIRE TO" : "READ-ONLY · HOOKS DEFERRED"} ·{" "}
          {projects ? `${filteredProjects.length} SCOPES` : "LOADING"}
        </div>

        {!projects && <PanelEmpty>LOADING PROJECTS…</PanelEmpty>}
        {filteredProjects.map((project) => {
          const wired = wireApi.isWired(tool.id, project.path);
          return (
            <WireRow
              key={project.path}
              label={project.name}
              sublabel={project.path === "__global__" ? "~/.claude" : shortPath(project.path)}
              wired={wired}
              readOnly={!wireable}
              disabled={busy !== null && busy !== project.path}
              onToggle={() => handleToggle(project.path)}
              meta={busy === project.path ? "…" : project.path === "__global__" ? "USER SCOPE" : ""}
            />
          );
        })}
      </PanelScroll>
    </PanelShell>
  );
}

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
          maxWidth: 360,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function OriginGlyph({ origin }: { origin: "discovered" | "managed" }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        background: origin === "managed" ? "var(--sync)" : "transparent",
        border: origin === "managed" ? "none" : "1px solid var(--ink-3)",
      }}
    />
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
