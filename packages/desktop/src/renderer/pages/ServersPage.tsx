import React, { useState, useMemo, useCallback } from "react";
import { EmptyState } from "../components/EmptyState";
import { ServerForm } from "../components/ServerForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";

interface ServersPageProps {
  config: Record<string, unknown> | null;
  onMutate: (
    fn: (config: Record<string, unknown>) => Promise<{ config: Record<string, unknown>; result: unknown }>,
  ) => Promise<unknown>;
}

export function ServersPage({ config, onMutate }: ServersPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const { toast } = useToast();

  const servers = useMemo(() => {
    if (!config) return [];
    return (Array.isArray(config.servers) ? config.servers : []) as Array<Record<string, unknown>>;
  }, [config]);

  const existingNames = useMemo(() => servers.map((s) => s.name as string), [servers]);

  const handleAdd = useCallback(
    async (name: string, server: Record<string, unknown>) => {
      await onMutate((c) => window.ensemble.servers.add(c, name, server));
      setShowForm(false);
      toast(`Added ${name}`);
    },
    [onMutate, toast],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      await onMutate((c) => window.ensemble.servers.remove(c, name));
      setDeleteTarget(null);
      toast(`Removed ${name}`);
    },
    [onMutate, toast],
  );

  const handleToggle = useCallback(
    async (name: string, currentlyEnabled: boolean) => {
      if (currentlyEnabled) {
        await onMutate((c) => window.ensemble.servers.disable(c, name));
        toast(`Disabled ${name}`);
      } else {
        await onMutate((c) => window.ensemble.servers.enable(c, name));
        toast(`Enabled ${name}`);
      }
    },
    [onMutate, toast],
  );

  if (showForm) {
    return (
      <div className="p-6">
        <ServerForm
          existingNames={existingNames}
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <EmptyState
        title="No servers configured"
        description="Add MCP servers to manage them across your AI clients."
        action="Add Server"
        onAction={() => setShowForm(true)}
      />
    );
  }

  return (
    <div data-testid="servers-page" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide">
          Servers
          <span className="ml-2 text-secondary font-normal normal-case tracking-normal">{servers.length}</span>
        </h2>
        <button
          data-testid="add-server-btn"
          onClick={() => setShowForm(true)}
          className="px-2.5 py-1 bg-accent text-surface-bg rounded text-secondary font-medium hover:bg-accent-hover transition-colors"
        >
          Add
        </button>
      </div>

      <div>
        {servers.map((server) => {
          const name = server.name as string;
          const isEnabled = (server.enabled as boolean) ?? true;
          return (
            <div
              key={name}
              data-testid={`server-row-${name}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-surface-card group transition-colors duration-75"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  data-testid={`toggle-${name}`}
                  onClick={() => handleToggle(name, isEnabled)}
                  className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-150 cursor-pointer ring-2 ring-transparent hover:ring-sidebar-hover ${
                    isEnabled ? "bg-status-ok" : "bg-sidebar-muted"
                  }`}
                  title={isEnabled ? "Disable" : "Enable"}
                />
                <div className="min-w-0">
                  <div className="text-body text-sidebar-text truncate">{name}</div>
                  <div className="text-secondary text-sidebar-muted truncate font-mono">
                    {(server.command as string) ?? (server.url as string) ?? "—"}
                    {server.args && ` ${(server.args as string[]).join(" ")}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {(() => {
                  const tier =
                    ((server.origin as Record<string, unknown> | undefined)?.trust_tier as
                      | string
                      | undefined) ?? "";
                  return tier ? (
                    <span
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--ink-3)",
                      }}
                    >
                      {tier}
                    </span>
                  ) : null;
                })()}
                <button
                  data-testid={`delete-${name}`}
                  onClick={() => setDeleteTarget(name)}
                  className="text-secondary text-sidebar-muted hover:text-status-error opacity-0 group-hover:opacity-100 transition-all duration-75"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Remove Server"
          message={`Remove "${deleteTarget}" from Ensemble? This will also remove it from any groups.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
