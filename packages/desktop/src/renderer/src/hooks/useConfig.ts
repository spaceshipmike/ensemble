import { useQueryClient } from "@tanstack/react-query";
import type { EnsembleConfig } from "ensemble";
import { useEffect } from "react";
import { trpc } from "../trpc";

/**
 * Load the Ensemble config via tRPC and invalidate it whenever the main
 * process reports an external change (e.g. a CLI write).
 *
 * Mutations land directly on the router (see `useServers`, `useGroups`,
 * etc.), so we no longer ship the config back and forth as a request arg.
 * Call sites just invalidate `config.load` after a mutation resolves.
 */
export function useConfig() {
  const queryClient = useQueryClient();
  const configQuery = trpc.config.load.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Keep the query fresh when the CLI writes to config.json on disk.
  trpc.config.onExternalChange.useSubscription(undefined, {
    onData: () => {
      queryClient.invalidateQueries({ queryKey: [["config", "load"]] });
    },
  });

  // Ensure first render has fresh data even if the cache was hydrated.
  const { refetch } = configQuery;
  useEffect(() => {
    refetch();
  }, [refetch]);

  const saveMutation = trpc.config.save.useMutation({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [["config", "load"]] }),
  });

  return {
    config: (configQuery.data ?? null) as EnsembleConfig | null,
    loading: configQuery.isLoading,
    error: configQuery.error ? configQuery.error.message : null,
    reload: () => configQuery.refetch(),
    save: (updated: EnsembleConfig) => saveMutation.mutateAsync({ config: updated }),
  };
}
