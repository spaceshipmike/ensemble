import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { trpc } from "../trpc";
import { useConfig } from "./useConfig";

type Server = Record<string, unknown>;

const CONFIG_KEY = [["config", "load"]];

/**
 * Server mutations — each exposed method is a thin wrapper over a tRPC
 * mutation that, on success, invalidates `config.load` so the rest of the
 * UI re-reads from the freshly-persisted config.
 */
export function useServers() {
  const { config, loading, error, reload } = useConfig();
  const queryClient = useQueryClient();

  const servers = useMemo(() => {
    if (!config) return [];
    return config.servers ?? [];
  }, [config]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CONFIG_KEY });

  const addMutation = trpc.servers.add.useMutation({ onSuccess: invalidate });
  const removeMutation = trpc.servers.remove.useMutation({ onSuccess: invalidate });
  const enableMutation = trpc.servers.enable.useMutation({ onSuccess: invalidate });
  const disableMutation = trpc.servers.disable.useMutation({ onSuccess: invalidate });

  return {
    servers,
    loading,
    error,
    reload,
    add: (name: string, server: Server) =>
      addMutation.mutateAsync({ name, server: server as Record<string, unknown> }),
    remove: (name: string) => removeMutation.mutateAsync({ name }),
    enable: (name: string) => enableMutation.mutateAsync({ name }),
    disable: (name: string) => disableMutation.mutateAsync({ name }),
  };
}
