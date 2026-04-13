import { useMemo } from "react";
import { useConfig } from "./useConfig";

type Group = Record<string, unknown>;

/** Group operations — wraps IPC calls with config auto-save */
export function useGroups() {
  const { config, loading, error, mutate } = useConfig();

  const groups = useMemo(() => {
    if (!config) return [];
    const g = (config.groups ?? {}) as Record<string, Group>;
    return Object.entries(g).map(([name, group]) => ({ name, ...group }));
  }, [config]);

  const create = async (name: string, description?: string) => {
    return mutate((c) => window.ensemble.groups.create(c, name, description));
  };

  const remove = async (name: string) => {
    return mutate((c) => window.ensemble.groups.delete(c, name));
  };

  const addServer = async (group: string, server: string) => {
    return mutate((c) => window.ensemble.groups.addServer(c, group, server));
  };

  const removeServer = async (group: string, server: string) => {
    return mutate((c) => window.ensemble.groups.removeServer(c, group, server));
  };

  const addSkill = async (group: string, skill: string) => {
    return mutate((c) => window.ensemble.groups.addSkill(c, group, skill));
  };

  const removeSkill = async (group: string, skill: string) => {
    return mutate((c) => window.ensemble.groups.removeSkill(c, group, skill));
  };

  const addPlugin = async (group: string, plugin: string) => {
    return mutate((c) => window.ensemble.groups.addPlugin(c, group, plugin));
  };

  const removePlugin = async (group: string, plugin: string) => {
    return mutate((c) => window.ensemble.groups.removePlugin(c, group, plugin));
  };

  return { groups, loading, error, create, remove, addServer, removeServer, addSkill, removeSkill, addPlugin, removePlugin };
}
