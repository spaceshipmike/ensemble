import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { trpc } from "../trpc";
import { useConfig } from "./useConfig";

const CONFIG_KEY = [["config", "load"]];

export function useGroups() {
  const { config, loading, error } = useConfig();
  const queryClient = useQueryClient();

  const groups = useMemo(() => {
    if (!config) return [];
    return config.groups ?? [];
  }, [config]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CONFIG_KEY });

  const createMutation = trpc.groups.create.useMutation({ onSuccess: invalidate });
  const deleteMutation = trpc.groups.delete.useMutation({ onSuccess: invalidate });
  const addServerMutation = trpc.groups.addServer.useMutation({ onSuccess: invalidate });
  const removeServerMutation = trpc.groups.removeServer.useMutation({ onSuccess: invalidate });
  const addSkillMutation = trpc.groups.addSkill.useMutation({ onSuccess: invalidate });
  const removeSkillMutation = trpc.groups.removeSkill.useMutation({ onSuccess: invalidate });
  const addPluginMutation = trpc.groups.addPlugin.useMutation({ onSuccess: invalidate });
  const removePluginMutation = trpc.groups.removePlugin.useMutation({ onSuccess: invalidate });

  return {
    groups,
    loading,
    error,
    create: (name: string, description?: string) =>
      createMutation.mutateAsync({ name, description }),
    remove: (name: string) => deleteMutation.mutateAsync({ name }),
    addServer: (group: string, server: string) => addServerMutation.mutateAsync({ group, server }),
    removeServer: (group: string, server: string) =>
      removeServerMutation.mutateAsync({ group, server }),
    addSkill: (group: string, skill: string) => addSkillMutation.mutateAsync({ group, skill }),
    removeSkill: (group: string, skill: string) =>
      removeSkillMutation.mutateAsync({ group, skill }),
    addPlugin: (group: string, plugin: string) => addPluginMutation.mutateAsync({ group, plugin }),
    removePlugin: (group: string, plugin: string) =>
      removePluginMutation.mutateAsync({ group, plugin }),
  };
}
