import { useMemo } from "react";
import { useConfig } from "./useConfig";

type Server = Record<string, unknown>;

/** Server operations — wraps IPC calls with config auto-save */
export function useServers() {
  const { config, loading, error, mutate, reload } = useConfig();

  const servers = useMemo(() => {
    if (!config) return [];
    const s = (config.servers ?? {}) as Record<string, Server>;
    return Object.entries(s).map(([name, server]) => ({ name, ...server }));
  }, [config]);

  const add = async (name: string, server: Server) => {
    return mutate((c) => window.ensemble.servers.add(c, name, server));
  };

  const remove = async (name: string) => {
    return mutate((c) => window.ensemble.servers.remove(c, name));
  };

  const enable = async (name: string) => {
    return mutate((c) => window.ensemble.servers.enable(c, name));
  };

  const disable = async (name: string) => {
    return mutate((c) => window.ensemble.servers.disable(c, name));
  };

  return { servers, loading, error, add, remove, enable, disable, reload };
}
