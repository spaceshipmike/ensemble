import React from "react";

interface ClientChipProps {
  index: number;
  name: string;
  state: "drift" | "sync" | "empty" | "unknown";
  onSwap: () => void;
}

export function ClientChip({ index, name, state, onSwap }: ClientChipProps) {
  const num = String(index).padStart(2, "0");
  const color =
    state === "drift"
      ? "var(--signal)"
      : state === "sync"
        ? "var(--sync)"
        : "var(--ink-3)";

  return (
    <button
      type="button"
      onClick={onSwap}
      data-testid="client-chip"
      data-no-drag
      className="te-chip flex items-center gap-3 px-3 py-2 outline-none"
      style={{
        border: "1px solid var(--hairline-strong)",
        background: "var(--bone)",
        color: "var(--graphite)",
        fontFamily: "var(--te-mono)",
        borderRadius: 2,
      }}
      title="Swap channel"
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          background: color,
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.08em",
        }}
      >
        {num}
      </span>
      <span
        className="uppercase truncate"
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          fontWeight: 500,
          maxWidth: 140,
        }}
      >
        {name}
      </span>
      <span
        aria-hidden
        style={{ fontSize: 11, color: "var(--ink-3)" }}
      >
        ⇄
      </span>
    </button>
  );
}
