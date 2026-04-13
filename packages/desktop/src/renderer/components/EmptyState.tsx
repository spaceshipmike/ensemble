import React from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, action, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <h3 className="text-subhead font-medium text-sidebar-text mb-2">{title}</h3>
      <p className="text-body text-sidebar-muted max-w-md mb-4">{description}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-accent text-surface-bg rounded-md text-body font-medium hover:bg-accent-hover transition-colors"
        >
          {action}
        </button>
      )}
    </div>
  );
}
