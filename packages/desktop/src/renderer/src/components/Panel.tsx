import type React from "react";

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';

/**
 * Container for a panel (library or projects side of the split).
 * Owns padding, scroll, and background.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  );
}

/**
 * Top strip of a panel: mode label left, actions right.
 */
export function PanelHeader({
  label,
  sublabel,
  right,
}: {
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 32px 14px",
        borderBottom: "1px solid var(--hairline)",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        {sublabel && (
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
        )}
      </div>
      {right && <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{right}</div>}
    </div>
  );
}

/**
 * Horizontal filter tabs shown under the panel header.
 */
export function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: "10px 32px",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: isActive ? "var(--graphite)" : "var(--ink-3)",
              background: "transparent",
              border: "none",
              padding: "4px 12px 4px 0",
              cursor: "pointer",
              fontWeight: isActive ? 500 : 400,
              borderBottom: isActive ? "1px solid var(--graphite)" : "1px solid transparent",
              marginBottom: -10,
              paddingBottom: 10,
            }}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                style={{
                  marginLeft: 6,
                  color: "var(--ink-3)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A numbered list row. Used for library items, project items, and wire rows.
 * Primary content is the label (uppercase caps). Right side is a meta slot.
 */
export function ListRow({
  index,
  label,
  sublabel,
  meta,
  onClick,
  selected,
}: {
  index: number;
  label: string;
  sublabel?: string;
  meta?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const num = String(index).padStart(2, "0");
  return (
    <button
      type="button"
      onClick={onClick}
      className="te-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        width: "100%",
        textAlign: "left",
        padding: "14px 32px",
        borderBottom: "1px solid var(--hairline)",
        background: selected ? "var(--bone-sunk)" : "transparent",
        color: "var(--graphite)",
        fontFamily: "inherit",
        border: "none",
        borderTop: "none",
        borderLeft: selected ? "2px solid var(--graphite)" : "2px solid transparent",
        borderRight: "none",
        cursor: "pointer",
        paddingLeft: 30,
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          width: 28,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {num}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 14,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--ink-3)",
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
      {meta && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {meta}
        </span>
      )}
    </button>
  );
}

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "32px",
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

export function PanelScroll({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</div>;
}
