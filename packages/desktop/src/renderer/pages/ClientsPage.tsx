import React, { useEffect, useState } from "react";

interface ClientsPageProps {
  config: Record<string, unknown> | null;
}

export function ClientsPage({ config }: ClientsPageProps) {
  const [detectedClients, setDetectedClients] = useState<Array<{ name: string; installed: boolean }>>([]);

  useEffect(() => {
    window.ensemble.clients
      .detect()
      .then((res: unknown) => {
        const r = res as { ok?: boolean; data?: Array<{ name: string; installed: boolean }> };
        if (r.data) setDetectedClients(r.data);
        else if (Array.isArray(res)) setDetectedClients(res as Array<{ name: string; installed: boolean }>);
      })
      .catch(() => {});
  }, []);

  const assignments = (config?.clients ?? {}) as Record<string, Record<string, unknown>>;
  const installed = detectedClients.filter((c) => c.installed);
  const notInstalled = detectedClients.filter((c) => !c.installed);

  return (
    <div data-testid="clients-page" className="p-6">
      <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide mb-4">
        Clients
      </h2>

      {installed.length > 0 && (
        <div className="mb-6">
          <div className="text-secondary text-sidebar-muted uppercase tracking-wide mb-2 px-3">Installed</div>
          <div>
            {installed.map((client) => {
              const assignment = assignments[client.name];
              return (
                <div
                  key={client.name}
                  data-testid={`client-row-${client.name}`}
                  className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-surface-card transition-colors duration-75"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-status-ok shrink-0" />
                    <span className="text-body text-sidebar-text">{client.name}</span>
                  </div>
                  <span className="text-secondary text-sidebar-muted">
                    {assignment
                      ? `${(assignment as Record<string, unknown>).group ?? "all"}`
                      : "unassigned"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {notInstalled.length > 0 && (
        <div>
          <div className="text-secondary text-sidebar-muted uppercase tracking-wide mb-2 px-3">Not detected</div>
          <div>
            {notInstalled.map((client) => (
              <div
                key={client.name}
                data-testid={`client-row-${client.name}`}
                className="flex items-center gap-3 px-3 py-2 rounded-md"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-sidebar-muted/40 shrink-0" />
                <span className="text-body text-sidebar-muted">{client.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
