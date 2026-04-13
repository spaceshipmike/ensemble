import React from "react";
import { EmptyState } from "../components/EmptyState";

interface PluginsPageProps {
  config: Record<string, unknown> | null;
}

export function PluginsPage({ config }: PluginsPageProps) {
  const plugins = config
    ? (Array.isArray(config.plugins) ? config.plugins : []) as Array<Record<string, unknown>>
    : [];

  if (plugins.length === 0) {
    return (
      <EmptyState
        title="No plugins installed"
        description="Plugins extend Claude Code with additional functionality. Install via CLI: ensemble plugins install"
      />
    );
  }

  return (
    <div data-testid="plugins-page" className="p-6">
      <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide mb-3">
        Plugins
        <span className="ml-2 text-secondary font-normal normal-case tracking-normal">{plugins.length}</span>
      </h2>
      <div>
        {plugins.map((plugin) => {
          const name = plugin.name as string;
          const isEnabled = plugin.enabled as boolean;
          return (
            <div
              key={name}
              data-testid={`plugin-row-${name}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-surface-card transition-colors duration-75"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isEnabled ? "bg-status-ok" : "bg-sidebar-muted"}`} />
                <span className="text-body text-sidebar-text truncate">{name}</span>
              </div>
              <span className="text-secondary text-sidebar-muted shrink-0 ml-3">
                {(plugin.marketplace as string) ?? ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
