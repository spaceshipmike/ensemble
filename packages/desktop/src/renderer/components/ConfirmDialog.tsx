import React, { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-surface-bg/60 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        data-testid="confirm-dialog"
        className="bg-surface-card border border-surface-border rounded-lg p-6 max-w-sm mx-4"
      >
        <h3 className="text-body font-medium text-sidebar-text mb-2">{title}</h3>
        <p className="text-secondary text-sidebar-muted mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-secondary text-sidebar-muted hover:text-sidebar-text transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="confirm-btn"
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-md text-secondary font-medium transition-colors ${
              destructive
                ? "bg-status-error text-surface-bg hover:bg-status-error/80"
                : "bg-accent text-surface-bg hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
