/**
 * Snapshots inspector — browse the pre-sync snapshot ring and restore on
 * demand. Backs the v2.0.1 safe-apply story in the desktop app.
 *
 * - Reverse-chronological list on the left (newest first).
 * - Per-snapshot detail on the right: metadata + expandable per-file entries.
 * - Restore button with a confirmation dialog whose copy mirrors the
 *   `ensemble rollback` CLI warning so the two surfaces stay in sync.
 */

import { useState } from "react";
import { trpc } from "../trpc";

const MONO = '"Commit Mono", "SF Mono", ui-monospace, Menlo, monospace';

export function SnapshotsView() {
  const snapshotsQuery = trpc.snapshots.list.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
  });
  const restoreMutation = trpc.snapshots.restore.useMutation();
  const utils = trpc.useUtils();

  const snapshots = snapshotsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Keep the selected snapshot in sync with the list.
  const selected =
    (selectedId ? snapshots.find((s) => s.id === selectedId) : null) ?? snapshots[0] ?? null;

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
      <SnapshotsList
        snapshots={snapshots}
        selectedId={selected?.id ?? null}
        onSelect={(id) => setSelectedId(id)}
        loading={snapshotsQuery.isLoading}
      />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "32px 40px" }}>
        {selected ? (
          <SnapshotDetail
            snapshot={selected}
            onRestore={() => setConfirmOpen(true)}
            restoring={restoreMutation.isPending}
          />
        ) : (
          <EmptyState loading={snapshotsQuery.isLoading} />
        )}
      </div>
      {confirmOpen && selected && (
        <RestoreConfirmDialog
          snapshot={selected}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={async () => {
            await restoreMutation.mutateAsync({ id: selected.id });
            setConfirmOpen(false);
            await utils.snapshots.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

// --- List --------------------------------------------------------------------

type SnapshotSummary = {
  id: string;
  createdAt: string;
  syncContext?: string;
  files: Array<{ path: string; state: "existing" | "new-file"; preContentPath?: string }>;
};

function SnapshotsList({
  snapshots,
  selectedId,
  onSelect,
  loading,
}: {
  snapshots: SnapshotSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: "1px solid var(--hairline)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          padding: "32px 20px 12px 20px",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--graphite-dim)",
        }}
      >
        Snapshots ({snapshots.length})
      </div>
      {loading && <div style={{ padding: "12px 20px", fontSize: 12 }}>Loading…</div>}
      {!loading && snapshots.length === 0 && (
        <div style={{ padding: "12px 20px", fontSize: 12, color: "var(--graphite-dim)" }}>
          No snapshots yet.
        </div>
      )}
      {snapshots.map((s) => {
        const active = s.id === selectedId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            data-testid={`snapshot-item-${s.id}`}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 20px",
              background: active ? "var(--graphite)" : "transparent",
              color: active ? "var(--bone)" : "var(--graphite)",
              border: "none",
              borderBottom: "1px solid var(--hairline)",
              fontFamily: MONO,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.7 }}>{formatTimestamp(s.createdAt)}</div>
            <div style={{ marginTop: 2 }}>{s.syncContext ?? "(no context)"}</div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
              {s.files.length} file{s.files.length === 1 ? "" : "s"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// --- Detail ------------------------------------------------------------------

function SnapshotDetail({
  snapshot,
  onRestore,
  restoring,
}: {
  snapshot: SnapshotSummary;
  onRestore: () => void;
  restoring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--graphite-dim)",
            }}
          >
            Snapshot
          </div>
          <div style={{ fontSize: 14, marginTop: 4, wordBreak: "break-all" }}>{snapshot.id}</div>
        </div>
        <button
          type="button"
          onClick={onRestore}
          disabled={restoring}
          data-testid="restore-button"
          style={{
            fontFamily: MONO,
            fontSize: 12,
            padding: "8px 16px",
            border: "1px solid var(--graphite)",
            background: "var(--bone)",
            color: "var(--graphite)",
            cursor: restoring ? "wait" : "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          {restoring ? "Restoring…" : "Restore"}
        </button>
      </div>

      <MetaRow label="Captured" value={formatTimestamp(snapshot.createdAt)} />
      <MetaRow label="Context" value={snapshot.syncContext ?? "(no context)"} />
      <MetaRow label="Files" value={`${snapshot.files.length}`} />

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          data-testid="files-toggle"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--graphite)",
          }}
        >
          {expanded ? "▼" : "▶"} File manifest
        </button>
        {expanded && (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "12px 0 0 0",
              borderTop: "1px solid var(--hairline)",
            }}
          >
            {snapshot.files.map((f) => (
              <li
                key={f.path}
                style={{
                  borderBottom: "1px solid var(--hairline)",
                  padding: "8px 0",
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ wordBreak: "break-all", flex: 1 }}>{f.path}</span>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: f.state === "new-file" ? "var(--graphite-dim)" : "var(--graphite)",
                    flexShrink: 0,
                  }}
                >
                  {f.state === "new-file" ? "new" : "captured"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 16, fontSize: 12, marginTop: 8 }}>
      <span
        style={{
          width: 100,
          flexShrink: 0,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--graphite-dim)",
          fontSize: 11,
        }}
      >
        {label}
      </span>
      <span style={{ wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div style={{ fontSize: 13, color: "var(--graphite-dim)", padding: "20px 0" }}>
      {loading
        ? "Loading snapshots…"
        : "No snapshot selected. Snapshots are captured automatically before each `ensemble sync`."}
    </div>
  );
}

// --- Confirm dialog ----------------------------------------------------------
//
// Copy mirrors the `ensemble rollback` CLI warning per the v2.0.1 plan
// (chunk 7 approved assumption). `N files will be overwritten / n files
// will be deleted.`

function RestoreConfirmDialog({
  snapshot,
  onCancel,
  onConfirm,
}: {
  snapshot: SnapshotSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const overwriteCount = snapshot.files.filter((f) => f.state === "existing").length;
  const deleteCount = snapshot.files.filter((f) => f.state === "new-file").length;
  const when = formatTimestamp(snapshot.createdAt);
  const message = `Restore snapshot from ${when}? This will overwrite ${overwriteCount} file${overwriteCount === 1 ? "" : "s"} currently on disk with their state at snapshot time. ${deleteCount} file${deleteCount === 1 ? "" : "s"} will be deleted. Continue?`;

  return (
    <div
      data-testid="restore-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(30, 30, 30, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "var(--bone)",
          border: "1px solid var(--hairline-strong)",
          padding: "28px 32px",
          maxWidth: 540,
          width: "92%",
          fontFamily: MONO,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--graphite-dim)",
            marginBottom: 12,
          }}
        >
          Confirm restore
        </div>
        <p
          data-testid="restore-dialog-message"
          style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}
        >
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button
            type="button"
            onClick={onCancel}
            data-testid="restore-dialog-cancel"
            style={{
              fontFamily: MONO,
              fontSize: 12,
              padding: "8px 16px",
              border: "1px solid var(--graphite)",
              background: "var(--bone)",
              color: "var(--graphite)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="restore-dialog-confirm"
            style={{
              fontFamily: MONO,
              fontSize: 12,
              padding: "8px 16px",
              border: "1px solid var(--graphite)",
              background: "var(--graphite)",
              color: "var(--bone)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Helpers -----------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  } catch {
    return iso;
  }
}
