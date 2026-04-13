import React, { useState, useCallback } from "react";
import { EmptyState } from "../components/EmptyState";

interface GroupsPageProps {
  config: Record<string, unknown> | null;
  onMutate: (
    fn: (config: Record<string, unknown>) => Promise<{ config: Record<string, unknown>; result: unknown }>,
  ) => Promise<unknown>;
}

export function GroupsPage({ config, onMutate }: GroupsPageProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  const groupsArr = config
    ? (Array.isArray(config.groups) ? config.groups : []) as Array<Record<string, unknown>>
    : [];
  const groups: Array<[string, Record<string, unknown>]> = groupsArr.map((g) => [g.name as string, g]);
  const serversArr = config
    ? (Array.isArray(config.servers) ? config.servers : []) as Array<Record<string, unknown>>
    : [];
  const servers = serversArr.map((s) => s.name as string);
  const skillsArr = config
    ? (Array.isArray(config.skills) ? config.skills : []) as Array<Record<string, unknown>>
    : [];
  const skills = skillsArr.map((s) => s.name as string);

  const handleDrop = useCallback(
    async (groupName: string, e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const data = e.dataTransfer.getData("application/json");
      if (!data) return;
      try {
        const { type, name } = JSON.parse(data) as { type: string; name: string };
        if (type === "server") {
          await onMutate((c) => window.ensemble.groups.addServer(c, groupName, name));
        } else if (type === "skill") {
          await onMutate((c) => window.ensemble.groups.addSkill(c, groupName, name));
        } else if (type === "plugin") {
          await onMutate((c) => window.ensemble.groups.addPlugin(c, groupName, name));
        }
      } catch { /* ignore bad drag data */ }
    },
    [onMutate],
  );

  const handleRemoveMember = useCallback(
    async (groupName: string, type: string, name: string) => {
      if (type === "server") {
        await onMutate((c) => window.ensemble.groups.removeServer(c, groupName, name));
      } else if (type === "skill") {
        await onMutate((c) => window.ensemble.groups.removeSkill(c, groupName, name));
      } else if (type === "plugin") {
        await onMutate((c) => window.ensemble.groups.removePlugin(c, groupName, name));
      }
    },
    [onMutate],
  );

  const handleCreateGroup = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newGroupName.trim()) return;
      await onMutate((c) =>
        window.ensemble.groups.create(c, newGroupName.trim(), newGroupDesc.trim() || undefined),
      );
      setNewGroupName("");
      setNewGroupDesc("");
      setShowCreate(false);
    },
    [onMutate, newGroupName, newGroupDesc],
  );

  if (groups.length === 0 && !showCreate) {
    return (
      <EmptyState
        title="No groups created"
        description="Groups organize servers, skills, and plugins into named collections."
        action="Create Group"
        onAction={() => setShowCreate(true)}
      />
    );
  }

  return (
    <div data-testid="groups-page" className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide">Groups</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 bg-accent text-surface-bg rounded-md text-body font-medium hover:bg-accent-hover transition-colors"
        >
          Create Group
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreateGroup} className="mb-6 p-4 bg-surface-card rounded-lg border border-surface-border space-y-3">
          <input
            data-testid="new-group-name"
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Group name"
            className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-md text-body text-sidebar-text focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-md text-body text-sidebar-text focus:outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="text-body text-sidebar-muted">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-accent text-surface-bg rounded-md text-body font-medium">Create</button>
          </div>
        </form>
      )}

      {/* Draggable items */}
      {(servers.length > 0 || skills.length > 0) && (
        <div className="mb-6 p-4 bg-surface-card rounded-lg border border-surface-border">
          <div className="text-secondary text-sidebar-muted mb-2">Drag items to a group below</div>
          <div className="flex flex-wrap gap-2">
            {servers.map((name) => (
              <div
                key={`s-${name}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/json", JSON.stringify({ type: "server", name }));
                }}
                className="px-2 py-1 bg-surface-border rounded text-secondary text-sidebar-text cursor-grab active:cursor-grabbing"
                data-testid={`drag-server-${name}`}
              >
                {name}
              </div>
            ))}
            {skills.map((name) => (
              <div
                key={`k-${name}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/json", JSON.stringify({ type: "skill", name }));
                }}
                className="px-2 py-1 bg-surface-border rounded text-secondary text-sidebar-text cursor-grab active:cursor-grabbing"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group cards (drop targets) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map(([name, group]) => {
          const groupServers = (group.servers ?? []) as string[];
          const groupSkills = (group.skills ?? []) as string[];
          const groupPlugins = (group.plugins ?? []) as string[];
          const isDragOver = dragOver === name;

          return (
            <div
              key={name}
              data-testid={`group-card-${name}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(name); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(name, e)}
              className={`p-4 rounded-lg border transition-colors ${
                isDragOver
                  ? "border-accent bg-accent/10"
                  : "border-surface-border bg-surface-card"
              }`}
            >
              <div className="text-body font-medium text-sidebar-text mb-1">{name}</div>
              {group.description && (
                <div className="text-secondary text-sidebar-muted mb-3">{group.description as string}</div>
              )}

              {groupServers.length > 0 && (
                <div className="mb-2">
                  <div className="text-secondary text-sidebar-muted mb-1">Servers</div>
                  <div className="flex flex-wrap gap-1">
                    {groupServers.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-border rounded text-secondary text-sidebar-text"
                      >
                        {s}
                        <button
                          onClick={() => handleRemoveMember(name, "server", s)}
                          className="text-sidebar-muted hover:text-status-error"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {groupSkills.length > 0 && (
                <div className="mb-2">
                  <div className="text-secondary text-sidebar-muted mb-1">Skills</div>
                  <div className="flex flex-wrap gap-1">
                    {groupSkills.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-border rounded text-secondary text-sidebar-text"
                      >
                        {s}
                        <button
                          onClick={() => handleRemoveMember(name, "skill", s)}
                          className="text-sidebar-muted hover:text-status-error"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {groupPlugins.length > 0 && (
                <div>
                  <div className="text-secondary text-sidebar-muted mb-1">Plugins</div>
                  <div className="flex flex-wrap gap-1">
                    {groupPlugins.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-border rounded text-secondary text-sidebar-text"
                      >
                        {p}
                        <button
                          onClick={() => handleRemoveMember(name, "plugin", p)}
                          className="text-sidebar-muted hover:text-status-error"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {groupServers.length === 0 && groupSkills.length === 0 && groupPlugins.length === 0 && (
                <div className="text-secondary text-sidebar-muted italic">
                  {isDragOver ? "Drop to add" : "Empty — drag items here"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
