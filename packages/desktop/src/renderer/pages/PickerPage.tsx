import React, { useEffect, useState } from "react";

interface DetectedClient {
  id: string;
  name: string;
  configPath?: string;
  serversKey?: string;
}

interface PickerPageProps {
  onPick: (client: DetectedClient) => void;
}

type ClientState = "drift" | "sync" | "other" | "empty" | "unknown";

interface ClientRow {
  client: DetectedClient;
  state: ClientState;
  serverCount: number;
  driftCount: number;
  totalCount: number;
}

export function PickerPage({ onPick }: PickerPageProps) {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let detected: DetectedClient[] = [];
      try {
        const detectRes = (await window.ensemble.clients.detect()) as unknown;
        const maybeArray =
          Array.isArray(detectRes)
            ? (detectRes as DetectedClient[])
            : Array.isArray((detectRes as { data?: unknown })?.data)
              ? ((detectRes as { data: DetectedClient[] }).data)
              : null;
        if (maybeArray) {
          detected = maybeArray;
        } else if (
          detectRes &&
          typeof detectRes === "object" &&
          "error" in (detectRes as object) &&
          (detectRes as { error?: string }).error
        ) {
          if (!cancelled) setError((detectRes as { error: string }).error);
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Detection failed");
        return;
      }

      let statuses: Record<string, { total: number; managed: number }> = {};
      try {
        const statusRes = (await window.ensemble.clients.liveStatus()) as unknown;
        const data = (statusRes && typeof statusRes === "object" && "data" in (statusRes as object)
          ? (statusRes as { data: unknown }).data
          : statusRes) as Record<string, { total: number; managed: number }> | undefined;
        if (data && typeof data === "object") statuses = data;
      } catch {
        // non-fatal
      }

      const built: ClientRow[] = detected.map((c) => {
        const s = statuses[c.id] ?? { total: 0, managed: 0 };
        const managed = s.managed;
        const total = s.total;
        const state: ClientState =
          managed > 0 ? "sync" : total > 0 ? "other" : "empty";
        return {
          client: c,
          state,
          serverCount: managed,
          driftCount: 0,
          totalCount: total,
        };
      });

      if (!cancelled) setRows(built);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid="picker-page"
      className="te-scope flex flex-col h-screen w-screen"
      style={{
        background: "#f5f4f0",
        color: "#1a1a1a",
        fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
      }}
    >
      <Header />
      <main className="flex-1 overflow-y-auto px-12 pt-10 pb-16">
        <div className="max-w-3xl">
          <Label>SELECT CHANNEL</Label>
          <div className="mt-6">
            {error && <ErrorLine message={error} />}
            {!rows && !error && <SkeletonRows />}
            {rows && rows.length === 0 && <EmptyState />}
            {rows && rows.length > 0 && (
              <ol
                className="flex flex-col"
                data-testid="picker-list"
                style={{ listStyle: "none", padding: 0, margin: 0 }}
              >
                {rows.map((row, i) => (
                  <PickerRow
                    key={row.client.id ?? row.client.name}
                    index={i + 1}
                    row={row}
                    onClick={() => onPick(row.client)}
                  />
                ))}
              </ol>
            )}
          </div>
          <FootNote count={rows?.length ?? 0} />
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header
      data-drag-region
      className="flex items-center justify-between"
      style={{ padding: "56px 48px 16px 80px" }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="uppercase"
          style={{ fontSize: 11, letterSpacing: "0.14em", color: "#8a8a86" }}
        >
          ENSEMBLE
        </span>
        <span
          className="uppercase"
          style={{ fontSize: 11, letterSpacing: "0.14em", color: "#8a8a86" }}
        >
          / PATCH BAY
        </span>
      </div>
      <span
        className="uppercase"
        style={{ fontSize: 11, letterSpacing: "0.14em", color: "#8a8a86" }}
      >
        v0.1
      </span>
    </header>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontSize: 11,
        letterSpacing: "0.18em",
        color: "#4a4a48",
        borderTop: "1px solid rgba(26,26,26,0.08)",
        paddingTop: 10,
      }}
    >
      {children}
    </div>
  );
}

function PickerRow({
  index,
  row,
  onClick,
}: {
  index: number;
  row: ClientRow;
  onClick: () => void;
}) {
  const num = String(index).padStart(2, "0");
  const name = (row.client.name ?? row.client.id ?? "UNKNOWN").toUpperCase();

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-testid={`picker-row-${row.client.id ?? row.client.name}`}
        data-no-drag
        className="te-row w-full text-left flex items-center gap-6 py-4 outline-none"
        style={{
          borderBottom: "1px solid rgba(26,26,26,0.08)",
          color: "#1a1a1a",
          background: "transparent",
        }}
      >
        <span
          aria-hidden
          style={{
            fontSize: 13,
            color: "#8a8a86",
            width: 28,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {num}
        </span>
        <span
          className="flex-1 truncate"
          style={{
            fontSize: 15,
            letterSpacing: "0.04em",
            fontWeight: 500,
          }}
        >
          {name}
        </span>
        <StateGlyph state={row.state} />
        <span
          className="uppercase"
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            color: "#8a8a86",
            width: 120,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {stateLabel(row)}
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 15,
            color: "#8a8a86",
            width: 16,
            textAlign: "right",
          }}
          className="te-arrow"
        >
          →
        </span>
      </button>
    </li>
  );
}

function StateGlyph({ state }: { state: ClientState }) {
  const filled = state === "drift" || state === "sync" || state === "other";
  const color =
    state === "drift"
      ? "#ff5a1f"
      : state === "sync"
        ? "#2f8f4a"
        : "#8a8a86";
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 0,
        background: filled ? color : "transparent",
        border: filled ? "none" : "1px solid #8a8a86",
      }}
    />
  );
}

function stateLabel(row: ClientRow): string {
  if (row.state === "drift") {
    return row.driftCount === 1 ? "1 DRIFTED" : `${row.driftCount} DRIFTED`;
  }
  if (row.state === "sync") {
    return row.serverCount === 1 ? "1 SERVER" : `${row.serverCount} SERVERS`;
  }
  if (row.state === "other") {
    return row.totalCount === 1 ? "1 SERVER" : `${row.totalCount} SERVERS`;
  }
  return "EMPTY";
}

function SkeletonRows() {
  return (
    <div className="flex flex-col">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="py-4"
          style={{ borderBottom: "1px solid rgba(26,26,26,0.08)" }}
        >
          <div
            style={{
              height: 15,
              width: "40%",
              background: "rgba(26,26,26,0.08)",
              opacity: 0.6,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="py-10 uppercase"
      style={{
        fontSize: 11,
        letterSpacing: "0.18em",
        color: "#8a8a86",
        borderBottom: "1px solid rgba(26,26,26,0.08)",
      }}
    >
      NO CLIENTS DETECTED ON THIS MACHINE
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      className="py-4"
      style={{
        fontSize: 13,
        color: "#d93025",
        borderBottom: "1px solid rgba(26,26,26,0.08)",
      }}
    >
      {message}
    </div>
  );
}

function FootNote({ count }: { count: number }) {
  return (
    <div
      className="mt-10 uppercase"
      style={{
        fontSize: 11,
        letterSpacing: "0.18em",
        color: "#8a8a86",
      }}
    >
      {count} CHANNEL{count === 1 ? "" : "S"} DETECTED · PICK ONE TO BEGIN
    </div>
  );
}
