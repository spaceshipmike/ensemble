import { useCallback, useState } from "react";
import { trpc } from "../trpc";

type SyncOpts = { dryRun?: boolean; force?: boolean };

/**
 * Sync operations — thin wrappers over `sync.*` tRPC mutations. State
 * (`syncing`, `lastResult`, `error`) is local so components can show
 * progress without managing it themselves.
 */
export function useSync() {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const syncAllMutation = trpc.sync.all.useMutation();
  const syncClientMutation = trpc.sync.client.useMutation();
  const utils = trpc.useUtils();

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    setSyncing(true);
    setError(null);
    try {
      const result = await fn();
      setLastResult(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

  const syncAll = useCallback(
    (opts?: SyncOpts) => run(() => syncAllMutation.mutateAsync({ opts })),
    [run, syncAllMutation],
  );

  const syncClient = useCallback(
    (client: string, opts?: SyncOpts) =>
      run(() => syncClientMutation.mutateAsync({ client, opts })),
    [run, syncClientMutation],
  );

  const preview = useCallback(() => syncAll({ dryRun: true }), [syncAll]);

  const contextCost = useCallback(
    (client: string) => utils.sync.contextCost.fetch({ client }),
    [utils],
  );

  return {
    syncing,
    lastResult,
    error,
    syncAll,
    syncClient,
    preview,
    contextCost,
  };
}
