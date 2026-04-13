import React from "react";
import { EmptyState } from "../components/EmptyState";

interface RulesPageProps {
  config: Record<string, unknown> | null;
}

export function RulesPage({ config }: RulesPageProps) {
  const rules = config
    ? ((config.rules ?? []) as Array<Record<string, unknown>>)
    : [];

  if (rules.length === 0) {
    return (
      <EmptyState
        title="No path rules defined"
        description="Path rules automatically assign groups to projects based on directory path. Add via CLI: ensemble rules add"
      />
    );
  }

  return (
    <div data-testid="rules-page" className="p-6">
      <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide mb-4">
        Rules
        <span className="ml-2 text-secondary font-normal normal-case tracking-normal">{rules.length}</span>
      </h2>
      <table className="w-full text-left">
        <thead>
          <tr className="text-caption text-sidebar-muted uppercase tracking-wider">
            <th className="pb-2 px-3 font-medium">Path</th>
            <th className="pb-2 px-3 font-medium">Group</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, i) => (
            <tr
              key={i}
              data-testid={`rule-row-${i}`}
              className="hover:bg-surface-card transition-colors duration-75"
            >
              <td className="px-3 py-2 text-body font-mono text-sidebar-text">{rule.path as string}</td>
              <td className="px-3 py-2 text-body text-sidebar-muted">{rule.group as string}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
