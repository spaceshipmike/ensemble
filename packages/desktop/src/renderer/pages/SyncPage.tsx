import React, { useState, useCallback, useEffect } from "react";
import { useToast } from "../components/Toast";

interface SyncPageProps {
  config: Record<string, unknown> | null;
  onMutate: (
    fn: (config: Record<string, unknown>) => Promise<{ config: Record<string, unknown>; result: unknown }>,
  ) => Promise<unknown>;
}

type SyncAction = {
  type: "add" | "remove" | "update" | "skip-drift";
  name: string;
  detail?: string;
};

type DriftInfo = {
  name: string;
  currentHash: string;
  storedHash: string;
};

type SyncResult = {
  clientId: string;
  clientName: string;
  actions: SyncAction[];
  messages: string[];
  hasChanges: boolean;
  drifted: DriftInfo[];
  newHashes: Record<string, string>;
};

export function SyncPage({ config, onMutate: _onMutate }: SyncPageProps) {
  const [previewResults, setPreviewResults] = useState<SyncResult[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handlePreview = useCallback(async () => {
    if (!config) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await window.ensemble.sync.all(config, { dryRun: true }) as { ok: boolean; data?: SyncResult[]; error?: string };
      if (res.ok && res.data) {
        setPreviewResults(res.data);
      } else {
        setError(res.error ?? "Preview failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setSyncing(false);
    }
  }, [config, toast]);

  const handleSync = useCallback(async () => {
    if (!config) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await window.ensemble.sync.all(config) as { ok: boolean; data?: SyncResult[]; error?: string };
      if (res.ok && res.data) {
        setLastSync(res.data);
        setPreviewResults(null);
        toast("Sync complete");
      } else {
        setError(res.error ?? "Sync failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [config, toast]);

  const handleForceSync = useCallback(async () => {
    if (!config) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await window.ensemble.sync.all(config, { force: true }) as { ok: boolean; data?: SyncResult[]; error?: string };
      if (res.ok && res.data) {
        setLastSync(res.data);
        setPreviewResults(null);
        toast("Force sync complete");
      } else {
        setError(res.error ?? "Sync failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [config, toast]);

  // Auto-preview when config becomes available
  const configLoaded = config !== null;
  useEffect(() => {
    if (configLoaded) {
      handlePreview();
    }
  }, [configLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderActions = (results: SyncResult[]) => {
    const hasChanges = results.some((r) => r.hasChanges || r.drifted.length > 0);
    if (!hasChanges) {
      return (
        <div className="text-body text-status-ok p-4 bg-surface-card rounded-lg border border-surface-border text-center">
          All clients are in sync
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {results
          .filter((r) => r.hasChanges || r.drifted.length > 0)
          .map((result) => (
            <div
              key={result.clientId}
              data-testid={`sync-client-${result.clientId}`}
              className="p-4 bg-surface-card rounded-lg border border-surface-border"
            >
              <div className="text-body font-medium text-sidebar-text mb-3">{result.clientName}</div>

              {result.actions.length > 0 && (
                <div className="space-y-1 mb-3">
                  {result.actions.map((action, i) => (
                    <div key={`${result.clientId}-${action.name}-${i}`} className="flex items-center gap-2 text-secondary">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono ${
                          action.type === "add"
                            ? "bg-status-ok/20 text-status-ok"
                            : action.type === "remove"
                              ? "bg-status-error/20 text-status-error"
                              : action.type === "skip-drift"
                                ? "bg-status-warn/20 text-status-warn"
                                : "bg-accent/20 text-accent"
                        }`}
                      >
                        {action.type}
                      </span>
                      <span className="text-sidebar-text">{action.name}</span>
                      {action.detail && (
                        <span className="text-sidebar-muted">{action.detail}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {result.drifted.length > 0 && (
                <div className="mt-3 pt-3 border-t border-surface-border">
                  <div className="text-secondary text-status-warn mb-2">Drift detected</div>
                  {result.drifted.map((d) => (
                    <div key={`${result.clientId}-drift-${d.name}`} className="text-secondary mb-2 p-2 bg-surface-bg rounded">
                      <div className="font-medium text-sidebar-text mb-1">{d.name}</div>
                      <div className="text-sidebar-muted font-mono">
                        Stored hash: {d.storedHash.slice(0, 12)}...
                      </div>
                      <div className="text-sidebar-muted font-mono">
                        Current hash: {d.currentHash.slice(0, 12)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.messages.length > 0 && (
                <div className="mt-2 text-secondary text-sidebar-muted">
                  {result.messages.map((msg, i) => (
                    <div key={`${result.clientId}-msg-${i}`}>{msg}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div data-testid="sync-page" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide">Sync</h2>
        <div className="flex gap-2">
          <button
            data-testid="preview-btn"
            onClick={handlePreview}
            disabled={syncing}
            className="px-3 py-1.5 border border-surface-border text-sidebar-text rounded-md text-body hover:bg-sidebar-hover transition-colors disabled:opacity-50"
          >
            Preview
          </button>
          <button
            data-testid="sync-btn"
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 bg-accent text-surface-bg rounded-md text-body font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync All"}
          </button>
          <button
            data-testid="force-sync-btn"
            onClick={handleForceSync}
            disabled={syncing}
            className="px-3 py-1.5 border border-status-warn text-status-warn rounded-md text-body hover:bg-status-warn/10 transition-colors disabled:opacity-50"
            title="Force sync — overwrite manual changes"
          >
            Force
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-status-error/10 border border-status-error/30 rounded-md text-body text-status-error">
          {error}
        </div>
      )}

      {previewResults && (
        <div className="mb-6">
          <div className="text-secondary text-sidebar-muted mb-2 uppercase tracking-wide">Preview (dry run)</div>
          {renderActions(previewResults)}
        </div>
      )}

      {lastSync && (
        <div>
          <div className="text-secondary text-status-ok mb-2 uppercase tracking-wide">Last sync result</div>
          {renderActions(lastSync)}
        </div>
      )}
    </div>
  );
}
