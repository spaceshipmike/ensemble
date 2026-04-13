import { useState, useCallback } from "react";
import { useConfig } from "./useConfig";

/** Sync operations — wraps IPC calls for sync, drift, and context cost */
export function useSync() {
  const { config } = useConfig();
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const syncAll = useCallback(async (opts?: { dryRun?: boolean; force?: boolean }) => {
    if (!config) return null;
    setSyncing(true);
    setError(null);
    try {
      const result = await window.ensemble.sync.all(config, opts);
      setLastResult(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      return null;
    } finally {
      setSyncing(false);
    }
  }, [config]);

  const syncClient = useCallback(async (client: string, opts?: { dryRun?: boolean; force?: boolean }) => {
    if (!config) return null;
    setSyncing(true);
    setError(null);
    try {
      const result = await window.ensemble.sync.client(config, client, opts);
      setLastResult(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      return null;
    } finally {
      setSyncing(false);
    }
  }, [config]);

  const preview = useCallback(async () => {
    return syncAll({ dryRun: true });
  }, [syncAll]);

  const contextCost = useCallback(async (client: string) => {
    if (!config) return null;
    return window.ensemble.sync.contextCost(config, client);
  }, [config]);

  return { syncing, lastResult, error, syncAll, syncClient, preview, contextCost };
}
