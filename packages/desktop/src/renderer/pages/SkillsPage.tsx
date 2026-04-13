import React from "react";
import { EmptyState } from "../components/EmptyState";

interface SkillsPageProps {
  config: Record<string, unknown> | null;
}

export function SkillsPage({ config }: SkillsPageProps) {
  const skills = config
    ? (Array.isArray(config.skills) ? config.skills : []) as Array<Record<string, unknown>>
    : [];

  if (skills.length === 0) {
    return (
      <EmptyState
        title="No skills installed"
        description="Skills are SKILL.md files that teach AI agents workflows and patterns. Install via CLI: ensemble skills add"
      />
    );
  }

  return (
    <div data-testid="skills-page" className="p-6">
      <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide mb-3">
        Skills
        <span className="ml-2 text-secondary font-normal normal-case tracking-normal">{skills.length}</span>
      </h2>
      <div>
        {skills.map((skill) => {
          const name = skill.name as string;
          const isEnabled = (skill.enabled ?? true) as boolean;
          return (
            <div
              key={name}
              data-testid={`skill-row-${name}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-surface-card transition-colors duration-75"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isEnabled ? "bg-status-ok" : "bg-sidebar-muted"}`} />
                <div className="min-w-0">
                  <span className="text-body text-sidebar-text truncate block">{name}</span>
                  {skill.description && (
                    <span className="text-secondary text-sidebar-muted truncate block">{skill.description as string}</span>
                  )}
                </div>
              </div>
              {skill.tags && (
                <div className="flex gap-1 shrink-0 ml-3">
                  {((skill.tags as string[]) ?? []).slice(0, 3).map((tag) => (
                    <span key={tag} className="text-caption px-1.5 py-0.5 rounded bg-surface-border/50 text-sidebar-muted">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
