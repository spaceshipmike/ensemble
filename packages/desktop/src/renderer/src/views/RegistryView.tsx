/**
 * Registry view — the desktop surface for `browse`. Wraps
 * `trpc.browse.list` so the CLI and the GUI consume the same engine.
 *
 * The v2.0.1 scope is intentionally small: a query box, a type filter, and
 * a result table. Richer views (card/slim toggles, one-key install) were
 * dropped in the /fctry:evolve browse scope-reduction pass.
 */

import { useMemo, useState } from "react";
import { trpc } from "../trpc";

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';
const TYPES = ["", "server", "plugin", "skill", "agent", "command", "hook"] as const;

export function RegistryView() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("");
  const input = useMemo(
    () => ({
      ...(query ? { query } : {}),
      ...(type ? { type } : {}),
    }),
    [query, type],
  );
  const browseQuery = trpc.browse.list.useQuery(input, { staleTime: 5_000 });
  const results = browseQuery.data ?? [];

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
        padding: "32px 40px",
        gap: 16,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="fuzzy match or @marketplace/query…"
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid var(--hairline-strong)",
            background: "transparent",
            color: "inherit",
            fontFamily: MONO,
            fontSize: 13,
          }}
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
          style={{
            padding: "8px 12px",
            fontFamily: MONO,
            background: "transparent",
            color: "inherit",
            border: "1px solid var(--hairline-strong)",
          }}
        >
          {TYPES.map((t) => (
            <option key={t || "any"} value={t}>
              {t || "any type"}
            </option>
          ))}
        </select>
      </header>

      {browseQuery.isLoading && <div>Loading…</div>}
      {browseQuery.error && (
        <div style={{ color: "var(--alert)" }}>Error: {browseQuery.error.message}</div>
      )}

      {!browseQuery.isLoading && results.length === 0 && <div>No matches.</div>}

      {results.length > 0 && (
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--hairline-strong)" }}>
                <th style={{ padding: "6px 8px" }}>name</th>
                <th style={{ padding: "6px 8px" }}>type</th>
                <th style={{ padding: "6px 8px" }}>source</th>
                <th style={{ padding: "6px 8px" }}>state</th>
                <th style={{ padding: "6px 8px" }}>install cmd</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr
                  key={`${r.type}:${r.name}`}
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <td style={{ padding: "6px 8px" }}>{r.name}</td>
                  <td style={{ padding: "6px 8px" }}>{r.type}</td>
                  <td style={{ padding: "6px 8px" }}>{r.source}</td>
                  <td style={{ padding: "6px 8px" }}>[{r.installState}]</td>
                  <td style={{ padding: "6px 8px" }}>{r.installCommand ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
