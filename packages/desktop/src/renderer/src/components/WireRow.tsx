import type React from "react";

interface WireRowProps {
  label: string;
  sublabel?: string;
  wired: boolean;
  disabled?: boolean;
  /** If true, the row renders as a read-only indicator (no interaction). */
  readOnly?: boolean;
  onToggle?: () => void;
  /** Optional meta slot on the right. */
  meta?: React.ReactNode;
}

/**
 * Square-glyph toggle row used in detail views to represent edges in the
 * (tool, scope) bipartite graph. The glyph IS the control — no checkbox,
 * no switch. Filled --sync = wired; outlined --ink-3 = not wired.
 */
export function WireRow({
  label,
  sublabel,
  wired,
  disabled,
  readOnly,
  onToggle,
  meta,
}: WireRowProps) {
  const interactive = !readOnly && !disabled;
  return (
    <button
      type="button"
      onClick={interactive ? onToggle : undefined}
      disabled={!interactive}
      className="te-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        width: "100%",
        textAlign: "left",
        padding: "12px 32px",
        background: "transparent",
        color: "var(--graphite)",
        fontFamily: "inherit",
        border: "none",
        borderBottom: "1px solid var(--hairline)",
        cursor: interactive ? "pointer" : "default",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <WireGlyph wired={wired} dim={disabled} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: wired ? "var(--graphite)" : "var(--ink-2)",
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

function WireGlyph({ wired, dim }: { wired: boolean; dim?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        flexShrink: 0,
        background: wired ? (dim ? "var(--ink-3)" : "var(--sync)") : "transparent",
        border: wired ? "none" : "1px solid var(--ink-3)",
      }}
    />
  );
}
