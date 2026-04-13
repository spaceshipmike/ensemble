import React, { useState, useCallback, useEffect } from "react";

interface DoctorPageProps {
  config: Record<string, unknown> | null;
  onMutate: (
    fn: (config: Record<string, unknown>) => Promise<{ config: Record<string, unknown>; result: unknown }>,
  ) => Promise<unknown>;
}

type DoctorCheck = {
  id: string;
  category: string;
  maxPoints: number;
  earnedPoints: number;
  severity: "error" | "warning" | "info";
  message: string;
  fix?: { command: string; description: string };
};

type DoctorResult = {
  checks: DoctorCheck[];
  totalPoints: number;
  earnedPoints: number;
  scorePercent: number;
  errors: number;
  warnings: number;
  infos: number;
  categoryScores: Record<string, { earned: number; max: number }>;
  serverCount: number;
  groupCount: number;
  pluginCount: number;
  skillCount: number;
};

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';

export function DoctorPage({ config, onMutate: _onMutate }: DoctorPageProps) {
  const [result, setResult] = useState<DoctorResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const runDoctor = useCallback(async () => {
    if (!config) return;
    setRunning(true);
    setError(null);
    try {
      const res = (await window.ensemble.doctor.run(config)) as {
        ok: boolean;
        data?: DoctorResult;
        error?: string;
      };
      if (res.ok && res.data) {
        setResult(res.data);
      } else {
        setError(res.error ?? "Doctor failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [config]);

  const configLoaded = config !== null;
  useEffect(() => {
    if (configLoaded) runDoctor();
  }, [configLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const categories = result
    ? Object.entries(result.categoryScores).map(([name, score]) => ({
        name,
        earned: score.earned,
        max: score.max,
        checks: result.checks.filter((c) => c.category === name),
      }))
    : [];

  const overallState: "sync" | "signal" | "tape" =
    result && result.errors > 0
      ? "tape"
      : result && result.warnings > 0
        ? "signal"
        : "sync";

  return (
    <div
      data-testid="doctor-page"
      className="te-scope"
      style={{
        background: "var(--bone)",
        color: "var(--graphite)",
        fontFamily: MONO,
        minHeight: "100%",
        padding: "40px 48px 64px",
      }}
    >
      <div style={{ maxWidth: 880 }}>
        <Header onRun={runDoctor} running={running} />

        {error && <ErrorLine message={error} />}

        {!result && !error && running && <SkeletonLedger />}

        {result && (
          <>
            <ScoreLedger result={result} overallState={overallState} />
            <Label style={{ marginTop: 40 }}>CATEGORIES</Label>
            <ol
              data-testid="doctor-category-list"
              style={{ listStyle: "none", margin: "16px 0 0", padding: 0 }}
            >
              {categories.map((cat, i) => (
                <CategoryRow
                  key={cat.name}
                  index={i + 1}
                  category={cat}
                  expanded={expanded.has(cat.name)}
                  onToggle={() => toggleCategory(cat.name)}
                />
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

function Header({ onRun, running }: { onRun: () => void; running: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--hairline)",
        paddingBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={labelStyle}>DIAGNOSTICS</span>
        <span style={{ ...labelStyle, color: "var(--ink-3)" }}>/ HEALTH</span>
      </div>
      <button
        data-testid="run-doctor-btn"
        type="button"
        onClick={onRun}
        disabled={running}
        data-no-drag
        className="te-chip"
        style={{
          ...labelStyle,
          background: "var(--bone)",
          border: "1px solid var(--hairline-strong)",
          borderRadius: 2,
          padding: "6px 12px",
          cursor: running ? "default" : "pointer",
          opacity: running ? 0.5 : 1,
          color: "var(--graphite)",
        }}
      >
        {running ? "RUNNING…" : "RE-RUN ▸"}
      </button>
    </div>
  );
}

function ScoreLedger({
  result,
  overallState,
}: {
  result: DoctorResult;
  overallState: "sync" | "signal" | "tape";
}) {
  const color =
    overallState === "tape"
      ? "var(--tape)"
      : overallState === "signal"
        ? "var(--signal)"
        : "var(--sync)";

  return (
    <div style={{ marginTop: 24 }}>
      <LedgerRow
        label="SCORE"
        value={
          <span style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 500,
                color,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}
            >
              {result.earnedPoints}
              <span style={{ color: "var(--ink-3)", fontSize: 20 }}> / {result.totalPoints}</span>
            </span>
            <span style={{ ...metaStyle }}>{result.scorePercent}%</span>
          </span>
        }
      />
      <LedgerRow
        label="STATUS"
        value={
          <span style={{ display: "flex", gap: 16 }}>
            <StatusChip count={result.errors} label="ERRORS" color="var(--tape)" />
            <StatusChip count={result.warnings} label="WARNINGS" color="var(--signal)" />
            <StatusChip count={result.infos} label="NOTES" color="var(--ink-3)" />
          </span>
        }
      />
      <LedgerRow
        label="INVENTORY"
        value={
          <span style={{ ...metaStyle, display: "flex", gap: 24 }}>
            <span>{result.serverCount} {result.serverCount === 1 ? "SERVER" : "SERVERS"}</span>
            <span>{result.groupCount} {result.groupCount === 1 ? "GROUP" : "GROUPS"}</span>
            <span>{result.pluginCount} {result.pluginCount === 1 ? "PLUGIN" : "PLUGINS"}</span>
            <span>{result.skillCount} {result.skillCount === 1 ? "SKILL" : "SKILLS"}</span>
          </span>
        }
        last
      />
    </div>
  );
}

function StatusChip({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  const dim = count === 0;
  return (
    <span
      style={{
        ...metaStyle,
        color: dim ? "var(--ink-3)" : color,
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: dim ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          background: dim ? "transparent" : color,
          border: dim ? "1px solid var(--ink-3)" : "none",
        }}
      />
      {count} {label}
    </span>
  );
}

function LedgerRow({
  label,
  value,
  last,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "16px 0",
        borderBottom: last ? "none" : "1px solid var(--hairline)",
      }}
    >
      <span style={{ ...labelStyle, width: 120, color: "var(--ink-2)" }}>{label}</span>
      <span style={{ flex: 1 }}>{value}</span>
    </div>
  );
}

function CategoryRow({
  index,
  category,
  expanded,
  onToggle,
}: {
  index: number;
  category: { name: string; earned: number; max: number; checks: DoctorCheck[] };
  expanded: boolean;
  onToggle: () => void;
}) {
  const num = String(index).padStart(2, "0");
  const name = category.name.replace(/[_-]/g, " ").toUpperCase();
  const pct = category.max > 0 ? category.earned / category.max : 0;
  const scoreColor =
    pct >= 0.8 ? "var(--sync)" : pct >= 0.5 ? "var(--signal)" : "var(--tape)";

  return (
    <li data-testid={`doctor-category-${category.name}`}>
      <button
        type="button"
        onClick={onToggle}
        data-no-drag
        className="te-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          width: "100%",
          textAlign: "left",
          padding: "16px 0",
          borderBottom: "1px solid var(--hairline)",
          background: "transparent",
          color: "var(--graphite)",
          fontFamily: MONO,
          outline: "none",
          border: "none",
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            width: 28,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {num}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: "0.04em",
          }}
        >
          {name}
        </span>
        <span style={{ ...metaStyle, color: "var(--ink-3)" }}>
          {category.checks.length} {category.checks.length === 1 ? "CHECK" : "CHECKS"}
        </span>
        <span
          style={{
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
            color: scoreColor,
            width: 72,
            textAlign: "right",
          }}
        >
          {category.earned}/{category.max}
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            width: 16,
            textAlign: "right",
          }}
        >
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: "0 0 0 52px",
            background: "var(--bone-sunk)",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          {category.checks.map((check, i) => (
            <CheckRow key={`${check.id}-${i}`} check={check} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CheckRow({ check }: { check: DoctorCheck }) {
  const severityColor =
    check.severity === "error"
      ? "var(--tape)"
      : check.severity === "warning"
        ? "var(--signal)"
        : "var(--ink-3)";
  const severityLabel =
    check.severity === "error"
      ? "ERROR"
      : check.severity === "warning"
        ? "WARNING"
        : "NOTE";

  return (
    <li
      data-testid={`doctor-check-${check.id}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: "12px 24px 12px 0",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <span
        style={{
          ...labelStyle,
          color: severityColor,
          width: 80,
          flexShrink: 0,
          paddingTop: 2,
        }}
      >
        {severityLabel}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--graphite)", lineHeight: 1.5 }}>
          {check.message}
        </div>
        {check.fix && (
          <div style={{ marginTop: 4, ...metaStyle, color: "var(--ink-3)" }}>
            SUGGESTED FIX · {check.fix.description}{" "}
            <code
              style={{
                marginLeft: 6,
                padding: "1px 6px",
                background: "var(--bone)",
                border: "1px solid var(--hairline)",
                fontFamily: MONO,
                fontSize: 11,
                color: "var(--graphite)",
              }}
            >
              {check.fix.command}
            </code>
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ink-3)",
          flexShrink: 0,
          paddingTop: 2,
        }}
      >
        {check.earnedPoints}/{check.maxPoints}
      </span>
    </li>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...labelStyle, color: "var(--ink-2)", ...style }}>{children}</div>;
}

function SkeletonLedger() {
  return (
    <div style={{ marginTop: 24 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 24,
            width: `${60 - i * 10}%`,
            background: "var(--hairline)",
            marginBottom: 16,
          }}
        />
      ))}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: "12px 0",
        fontSize: 13,
        color: "var(--tape)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      {message}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--ink-2)",
};

const metaStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  fontVariantNumeric: "tabular-nums",
};
