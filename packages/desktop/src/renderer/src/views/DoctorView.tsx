import { useMemo, useState } from "react";
import type { DiscoveredTool, LibraryEntry, ReconcileResult } from "../../../shared/index";
import { trpc } from "../trpc";

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';

type Section = "summary" | "entries" | "drifts" | "orphans" | "ignored";

export function DoctorView() {
  const [section, setSection] = useState<Section>("summary");

  const entriesQuery = trpc.library.entries.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY });
  const reconcileQuery = trpc.library.reconcileScope.useQuery(
    { scope: "global" },
    { staleTime: Number.POSITIVE_INFINITY },
  );

  const entries = entriesQuery.data ?? [];
  const reconcile = reconcileQuery.data ?? null;

  const counts = useMemo(() => {
    return {
      entries: entries.length,
      drifts: reconcile?.drifts.length ?? 0,
      orphans: reconcile?.orphans.length ?? 0,
      ignored: reconcile?.ignored.length ?? 0,
    };
  }, [entries, reconcile]);

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        background: "var(--bone)",
        color: "var(--graphite)",
        fontFamily: MONO,
      }}
    >
      <DoctorSidebar active={section} onChange={setSection} counts={counts} />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "32px 40px" }}>
        {section === "summary" && <SummaryPanel counts={counts} reconcile={reconcile} />}
        {section === "entries" && <EntriesPanel entries={entries} />}
        {section === "drifts" && <DriftsPanel reconcile={reconcile} />}
        {section === "orphans" && <OrphansPanel reconcile={reconcile} />}
        {section === "ignored" && <IgnoredPanel reconcile={reconcile} />}
      </div>
    </div>
  );
}

function DoctorSidebar({
  active,
  onChange,
  counts,
}: {
  active: Section;
  onChange: (s: Section) => void;
  counts: { entries: number; drifts: number; orphans: number; ignored: number };
}) {
  const items: { id: Section; label: string; count?: number; warn?: boolean }[] = [
    { id: "summary", label: "SUMMARY" },
    { id: "entries", label: "LIBRARY", count: counts.entries },
    { id: "drifts", label: "DRIFT", count: counts.drifts, warn: counts.drifts > 0 },
    { id: "orphans", label: "ORPHANS", count: counts.orphans, warn: counts.orphans > 0 },
    { id: "ignored", label: "IGNORED", count: counts.ignored },
  ];
  return (
    <div
      style={{
        width: 200,
        flexShrink: 0,
        borderRight: "1px solid var(--hairline)",
        padding: "32px 0",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: isActive ? "var(--graphite)" : "var(--ink-3)",
              background: isActive ? "var(--bone-sunk)" : "transparent",
              border: "none",
              borderLeft: isActive ? "2px solid var(--graphite)" : "2px solid transparent",
              padding: "10px 30px",
              cursor: "pointer",
              fontWeight: isActive ? 500 : 400,
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" && (
              <span
                style={{
                  color: item.warn ? "var(--tape)" : "var(--ink-3)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------
// Panels
// ------------------------------------------------------------------------

function SummaryPanel({
  counts,
  reconcile,
}: {
  counts: { entries: number; drifts: number; orphans: number; ignored: number };
  reconcile: ReconcileResult | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
      <SectionTitle>LIBRARY HEALTH</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        <Stat label="ENTRIES" value={counts.entries} />
        <Stat label="MATCHES" value={reconcile?.matches.length ?? 0} />
        <Stat label="DRIFT" value={counts.drifts} warn={counts.drifts > 0} />
        <Stat label="ORPHANS" value={counts.orphans} warn={counts.orphans > 0} />
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, marginTop: 12 }}>
        The canonical library lives at <Code>~/.config/ensemble/library/</Code>. It is independent
        of Claude Code's scope system — scans reconcile against it without modifying anything until
        you explicitly adopt an orphan, promote a drift, or ignore an entry.
      </div>
    </div>
  );
}

function EntriesPanel({ entries }: { entries: LibraryEntry[] }) {
  const utils = trpc.useUtils();
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const removeMutation = trpc.library.removeEntry.useMutation({
    onSuccess: () => {
      utils.library.entries.invalidate();
      utils.library.reconcileScope.invalidate();
    },
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, LibraryEntry[]>();
    for (const e of entries) {
      const list = groups.get(e.type) ?? [];
      list.push(e);
      groups.set(e.type, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  if (entries.length === 0) {
    return <EmptyState>NO LIBRARY ENTRIES</EmptyState>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <SectionTitle>LIBRARY · {entries.length} ENTRIES</SectionTitle>
      {grouped.map(([type, group]) => (
        <div key={type}>
          <GroupHeader>
            {type.toUpperCase()}S · {group.length}
          </GroupHeader>
          {group.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onRemove={() => removeMutation.mutate({ id: entry.id })}
              removing={removeMutation.isPending && removeMutation.variables?.id === entry.id}
              linking={linkingId === entry.id}
              onToggleLink={() =>
                setLinkingId((cur) => (cur === entry.id ? null : entry.id))
              }
              onLinked={() => setLinkingId(null)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EntryRow({
  entry,
  onRemove,
  removing,
  linking,
  onToggleLink,
  onLinked,
}: {
  entry: LibraryEntry;
  onRemove: () => void;
  removing: boolean;
  linking: boolean;
  onToggleLink: () => void;
  onLinked: () => void;
}) {
  const isDiscovered = entry.source === "@discovered";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "10px 0",
        borderBottom: "1px solid var(--hairline)",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--graphite)",
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {entry.name}
            {entry.type === "plugin" && entry.pluginMarketplace && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: "var(--ink-3)",
                  letterSpacing: "0.08em",
                  fontWeight: 400,
                }}
              >
                @{entry.pluginMarketplace}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 10,
              color: isDiscovered ? "var(--tape)" : "var(--ink-3)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            {entry.source}
            {entry.contentHash && ` · ${entry.contentHash.slice(0, 8)}`}
          </div>
        </div>
        <SmallButton
          label={linking ? "CANCEL" : isDiscovered ? "LINK SOURCE" : "CHANGE SOURCE"}
          onClick={onToggleLink}
        />
        <SmallButton
          label={removing ? "REMOVING…" : "REMOVE"}
          onClick={onRemove}
          disabled={removing}
        />
      </div>
      {linking && <SourceLinkPicker entry={entry} onDone={onLinked} />}
    </div>
  );
}

// ------------------------------------------------------------------------
// Source link picker
// ------------------------------------------------------------------------

function SourceLinkPicker({ entry, onDone }: { entry: LibraryEntry; onDone: () => void }) {
  const utils = trpc.useUtils();
  const candidatesQuery = trpc.library.searchSourceCandidates.useQuery(
    { name: entry.name, type: entry.type },
    { staleTime: 60_000 },
  );
  const relinkMutation = trpc.library.relinkSource.useMutation({
    onSuccess: () => {
      utils.library.entries.invalidate();
      utils.library.reconcileScope.invalidate();
      onDone();
    },
  });
  const addMarketplaceMutation = trpc.marketplaces.add.useMutation();
  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const applySource = (source: string) => {
    relinkMutation.mutate({ id: entry.id, newSource: source });
  };

  const addAndLinkRepo = async () => {
    if (!repoInput.trim()) return;
    setValidating(true);
    setRepoError(null);
    try {
      const validation = await utils.marketplaces.validateGithubRepo.fetch({
        repo: repoInput.trim(),
      });
      if (!validation.ok) {
        setRepoError(validation.reason ?? "invalid");
        setValidating(false);
        return;
      }
      // Use owner/repo as the marketplace name (overwritable later).
      const marketplaceName = repoInput.trim();
      await addMarketplaceMutation.mutateAsync({
        name: marketplaceName,
        source: { source: "github", repo: marketplaceName, path: "", url: "" },
      });
      applySource(marketplaceName);
    } catch (e) {
      setRepoError(e instanceof Error ? e.message : "failed");
    } finally {
      setValidating(false);
    }
  };

  const candidates = candidatesQuery.data ?? [];
  const registryHits = candidates.filter((c) => c.channel === "registry");
  const marketplaceHits = candidates.filter((c) => c.channel === "marketplace");

  return (
    <div
      style={{
        margin: "0 0 8px 24px",
        padding: "14px 18px",
        border: "1px solid var(--hairline-strong)",
        background: "var(--bone)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        LINK SOURCE FOR {entry.name.toUpperCase()}
      </div>

      {candidatesQuery.isLoading && <PickerEmpty>SEARCHING…</PickerEmpty>}

      {!candidatesQuery.isLoading && registryHits.length > 0 && (
        <PickerSection title="REGISTRY MATCHES">
          {registryHits.map((c) => (
            <PickerRow
              key={`reg-${c.source}-${c.label}`}
              label={c.label}
              sub={`${c.source} · ${c.confidence}`}
              onApply={() => applySource(c.source)}
            />
          ))}
        </PickerSection>
      )}

      {!candidatesQuery.isLoading && marketplaceHits.length > 0 && (
        <PickerSection title="CONFIGURED MARKETPLACES">
          {marketplaceHits.map((c) => (
            <PickerRow
              key={`mp-${c.source}`}
              label={c.label}
              sub={c.marketplaceSource?.source ?? "marketplace"}
              onApply={() => applySource(c.source)}
            />
          ))}
        </PickerSection>
      )}

      {!candidatesQuery.isLoading &&
        registryHits.length === 0 &&
        marketplaceHits.length === 0 && <PickerEmpty>NO CANDIDATES FOUND</PickerEmpty>}

      <PickerSection title="ADD GITHUB REPO">
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
            style={{
              fontFamily: "inherit",
              fontSize: 11,
              padding: "6px 10px",
              border: "1px solid var(--hairline-strong)",
              background: "var(--bone)",
              color: "var(--graphite)",
              flex: 1,
              minWidth: 0,
              outline: "none",
            }}
          />
          <SmallButton
            label={validating ? "VALIDATING…" : "ADD + LINK"}
            onClick={addAndLinkRepo}
            disabled={validating || !repoInput.trim()}
          />
        </div>
        {repoError && (
          <div style={{ fontSize: 10, color: "var(--tape)", marginTop: 6, letterSpacing: "0.08em" }}>
            {repoError.toUpperCase()}
          </div>
        )}
      </PickerSection>
    </div>
  );
}

function PickerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--ink-3)",
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function PickerRow({
  label,
  sub,
  onApply,
}: {
  label: string;
  sub: string;
  onApply: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 0",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--graphite)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 9,
            color: "var(--ink-3)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      </div>
      <SmallButton label="USE" onClick={onApply} />
    </div>
  );
}

function PickerEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        padding: "6px 0",
      }}
    >
      {children}
    </div>
  );
}

function DriftsPanel({ reconcile }: { reconcile: ReconcileResult | null }) {
  const utils = trpc.useUtils();
  const promoteMutation = trpc.library.promoteDrift.useMutation({
    onSuccess: () => {
      utils.library.entries.invalidate();
      utils.library.reconcileScope.invalidate();
    },
  });

  if (!reconcile || reconcile.drifts.length === 0) {
    return <EmptyState>NO DRIFT — ALL ENTRIES MATCH ON-DISK COPIES</EmptyState>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle>DRIFT · {reconcile.drifts.length}</SectionTitle>
      <Description>
        These entries exist in the library but their on-disk copies have diverged. Promote the
        disk version to overwrite the canonical copy, or leave as-is and the next sync will restore
        the library version.
      </Description>
      {reconcile.drifts.map((drift) => (
        <ActionRow
          key={`${drift.entry.id}-${drift.reason}`}
          name={drift.entry.name}
          sub={`${drift.entry.type.toUpperCase()} · ${drift.reason.toUpperCase()}`}
          action={{
            label: promoteMutation.isPending ? "PROMOTING…" : "PROMOTE",
            onClick: () => promoteMutation.mutate({ tool: drift.tool }),
            disabled: promoteMutation.isPending,
          }}
        />
      ))}
    </div>
  );
}

function OrphansPanel({ reconcile }: { reconcile: ReconcileResult | null }) {
  const utils = trpc.useUtils();
  const adoptMutation = trpc.library.adoptOrphan.useMutation({
    onSuccess: () => {
      utils.library.entries.invalidate();
      utils.library.reconcileScope.invalidate();
    },
  });
  const ignoreMutation = trpc.library.ignore.useMutation({
    onSuccess: () => {
      utils.library.reconcileScope.invalidate();
    },
  });

  if (!reconcile || reconcile.orphans.length === 0) {
    return <EmptyState>NO ORPHANS — EVERY SCANNED TOOL MATCHES A LIBRARY ENTRY</EmptyState>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle>ORPHANS · {reconcile.orphans.length}</SectionTitle>
      <Description>
        These tools exist at some scope but have no library entry. Adopt to bring them into the
        canonical library, or ignore to stop being flagged on future scans.
      </Description>
      {reconcile.orphans.map((orphan) => (
        <ActionRow
          key={orphan.proposedId}
          name={orphan.tool.name}
          sub={`${orphan.tool.type.toUpperCase()} · ${orphan.proposedId}`}
          action={{
            label: adoptMutation.isPending ? "ADOPTING…" : "ADOPT",
            onClick: () => adoptMutation.mutate({ tool: orphan.tool as DiscoveredTool }),
            disabled: adoptMutation.isPending,
          }}
          secondary={{
            label: "IGNORE",
            onClick: () => ignoreMutation.mutate({ id: orphan.proposedId }),
            disabled: ignoreMutation.isPending,
          }}
        />
      ))}
    </div>
  );
}

function IgnoredPanel({ reconcile }: { reconcile: ReconcileResult | null }) {
  const utils = trpc.useUtils();
  const unignoreMutation = trpc.library.unignore.useMutation({
    onSuccess: () => {
      utils.library.reconcileScope.invalidate();
    },
  });

  if (!reconcile || reconcile.ignored.length === 0) {
    return <EmptyState>NO IGNORED ENTRIES</EmptyState>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle>IGNORED · {reconcile.ignored.length}</SectionTitle>
      <Description>
        These tool ids have been dismissed. They exist on disk but the library will not flag them
        as orphans. Restore to start tracking again.
      </Description>
      {reconcile.ignored.map((ig) => (
        <ActionRow
          key={ig.id}
          name={ig.tool.name}
          sub={`${ig.tool.type.toUpperCase()} · ${ig.id}`}
          action={{
            label: "RESTORE",
            onClick: () => unignoreMutation.mutate({ id: ig.id }),
            disabled: unignoreMutation.isPending,
          }}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------
// Building blocks
// ------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-2)",
        fontWeight: 500,
        margin: 0,
      }}
    >
      {children}
    </h2>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: "1px solid var(--hairline-strong)",
      }}
    >
      {children}
    </div>
  );
}

function Description({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 640 }}>
      {children}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "18px 20px",
        border: "1px solid var(--hairline-strong)",
        background: "var(--bone)",
      }}
    >
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
          fontSize: 32,
          fontFamily: "inherit",
          fontWeight: 500,
          color: warn && value > 0 ? "var(--tape)" : "var(--graphite)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionRow({
  name,
  sub,
  action,
  secondary,
}: {
  name: string;
  sub: string;
  action: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "14px 0",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--graphite)",
            letterSpacing: "0.02em",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--ink-3)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginTop: 3,
          }}
        >
          {sub}
        </div>
      </div>
      {secondary && <SmallButton {...secondary} />}
      <SmallButton {...action} />
    </div>
  );
}

function SmallButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "inherit",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: disabled ? "var(--ink-3)" : "var(--graphite)",
        background: "transparent",
        border: "1px solid var(--hairline-strong)",
        padding: "6px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        minHeight: 200,
      }}
    >
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "inherit",
        fontSize: 11,
        color: "var(--graphite)",
        background: "var(--bone-sunk)",
        padding: "2px 6px",
      }}
    >
      {children}
    </code>
  );
}
