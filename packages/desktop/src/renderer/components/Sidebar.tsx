import React from "react";

export type SectionId =
  | "servers"
  | "skills"
  | "plugins"
  | "groups"
  | "clients"
  | "sync"
  | "doctor"
  | "registry"
  | "profiles"
  | "rules";

interface SidebarSection {
  id: SectionId;
  label: string;
}

interface SidebarGroup {
  label: string;
  items: SidebarSection[];
}

const groups: SidebarGroup[] = [
  {
    label: "Manage",
    items: [
      { id: "servers", label: "Servers" },
      { id: "skills", label: "Skills" },
      { id: "plugins", label: "Plugins" },
    ],
  },
  {
    label: "Organize",
    items: [
      { id: "groups", label: "Groups" },
      { id: "profiles", label: "Profiles" },
      { id: "rules", label: "Rules" },
    ],
  },
  {
    label: "Operate",
    items: [
      { id: "sync", label: "Sync" },
      { id: "doctor", label: "Doctor" },
      { id: "clients", label: "Clients" },
    ],
  },
  {
    label: "Discover",
    items: [
      { id: "registry", label: "Registry" },
    ],
  },
];

interface SidebarProps {
  active: SectionId;
  onNavigate: (section: SectionId) => void;
  serverCount?: number;
  skillCount?: number;
  pluginCount?: number;
  groupCount?: number;
}

export function Sidebar({ active, onNavigate, serverCount, skillCount, pluginCount, groupCount }: SidebarProps) {
  const getCount = (id: SectionId): number | undefined => {
    switch (id) {
      case "servers": return serverCount;
      case "skills": return skillCount;
      case "plugins": return pluginCount;
      case "groups": return groupCount;
      default: return undefined;
    }
  };

  return (
    <nav
      data-testid="sidebar"
      style={{
        display: "flex",
        flexDirection: "column",
        width: 224,
        minWidth: 224,
        background: "var(--bone)",
        borderRight: "1px solid var(--hairline)",
        height: "100%",
        paddingTop: 24,
        fontFamily: '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace',
      }}
    >
      <div style={{ padding: "0 24px 20px", borderBottom: "1px solid var(--hairline)" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
          }}
        >
          ENSEMBLE
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 0 24px" }}>
        {groups.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi > 0 ? 28 : 0 }}>
            <div
              style={{
                padding: "0 24px 8px",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              {group.label}
            </div>
            {group.items.map((section) => {
              const isActive = active === section.id;
              const count = getCount(section.id);
              return (
                <button
                  key={section.id}
                  data-testid={`sidebar-${section.id}`}
                  onClick={() => onNavigate(section.id)}
                  className="te-row"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 24px",
                    border: "none",
                    background: isActive ? "var(--bone-sunk)" : "transparent",
                    color: isActive ? "var(--graphite)" : "var(--ink-2)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    textAlign: "left",
                    cursor: "pointer",
                    borderLeft: isActive
                      ? "2px solid var(--graphite)"
                      : "2px solid transparent",
                    paddingLeft: 22,
                  }}
                >
                  <span style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {section.label}
                  </span>
                  {count !== undefined && (
                    <span
                      style={{
                        color: "var(--ink-3)",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 11,
                      }}
                    >
                      {String(count).padStart(2, "0")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
