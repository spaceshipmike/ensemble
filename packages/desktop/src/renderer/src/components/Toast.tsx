import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);

    const exitTimer = setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 150);
      timersRef.current.set(id, removeTimer);
    }, 2000);
    timersRef.current.set(id, exitTimer);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  const typeStyles: Record<ToastType, string> = {
    success: "text-status-ok",
    error: "text-status-error",
    info: "text-sidebar-text",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`
              px-3 py-1.5 bg-surface-card border border-surface-border rounded-md
              text-secondary ${typeStyles[t.type]} shadow-sm pointer-events-auto
              ${t.exiting ? "toast-exit" : "toast-enter"}
            `}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
