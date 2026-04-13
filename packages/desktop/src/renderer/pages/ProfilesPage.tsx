import React from "react";
import { EmptyState } from "../components/EmptyState";

interface ProfilesPageProps {
  config: Record<string, unknown> | null;
}

export function ProfilesPage({ config }: ProfilesPageProps) {
  const profiles = config
    ? Object.entries((config.profiles ?? {}) as Record<string, Record<string, unknown>>)
    : [];
  const activeProfile = config?.activeProfile as string | null;

  if (profiles.length === 0) {
    return (
      <EmptyState
        title="No profiles saved"
        description="Profiles are named snapshots of your client assignments, rules, and settings. Save via CLI: ensemble profiles save"
      />
    );
  }

  return (
    <div data-testid="profiles-page" className="p-6">
      <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide mb-4">
        Profiles
        <span className="ml-2 text-secondary font-normal normal-case tracking-normal">{profiles.length}</span>
      </h2>
      <div>
        {profiles.map(([name, profile]) => (
          <div
            key={name}
            data-testid={`profile-row-${name}`}
            className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-surface-card transition-colors duration-75"
          >
            <div className="flex items-center gap-3">
              {activeProfile === name && (
                <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              )}
              <span className={`text-body ${activeProfile === name ? "text-sidebar-text font-medium" : "text-sidebar-text"}`}>
                {name}
              </span>
            </div>
            <span className="text-secondary text-sidebar-muted">
              {(profile.created as string) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
