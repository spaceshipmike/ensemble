import React from "react";

interface RegistryCardProps {
  server: {
    id?: string;
    name: string;
    description?: string;
    trust_tier?: string;
    quality_score?: number;
    tool_count?: number;
    stars?: number;
    last_updated?: string;
    backend?: string;
  };
  onInstall: (id: string, backend?: string) => void;
  onShowDetails: (id: string, backend?: string) => void;
}

export function RegistryCard({ server, onInstall, onShowDetails }: RegistryCardProps) {
  const id = server.id ?? server.name;
  const trustColors: Record<string, string> = {
    official: "bg-status-ok/20 text-status-ok",
    community: "bg-accent/20 text-accent",
    local: "bg-surface-border text-sidebar-muted",
  };

  return (
    <div
      data-testid={`registry-card-${id}`}
      className="p-4 bg-surface-card rounded-lg border border-surface-border hover:border-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-body font-medium text-sidebar-text">{server.name}</span>
            {server.trust_tier && (
              <span className={`text-secondary px-1.5 py-0.5 rounded ${trustColors[server.trust_tier] ?? trustColors.local}`}>
                {server.trust_tier}
              </span>
            )}
          </div>
          {server.description && (
            <p className="text-secondary text-sidebar-muted mt-1 line-clamp-2">{server.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3 text-secondary text-sidebar-muted">
          {server.tool_count !== undefined && (
            <span>{server.tool_count} tools</span>
          )}
          {server.stars !== undefined && (
            <span>{server.stars} stars</span>
          )}
          {server.quality_score !== undefined && (
            <span>Q: {Math.round(server.quality_score * 100)}%</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onShowDetails(id, server.backend)}
            className="px-2 py-1 text-secondary text-sidebar-muted hover:text-sidebar-text transition-colors"
          >
            Details
          </button>
          <button
            data-testid={`install-${id}`}
            onClick={() => onInstall(id, server.backend)}
            className="px-3 py-1 bg-accent text-surface-bg rounded text-secondary font-medium hover:bg-accent-hover transition-colors"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
