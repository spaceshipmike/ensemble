import { useState, useEffect, useCallback, useRef } from "react";

/** Ensemble config state — loads from shared config.json, saves on mutation */
export function useConfig() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await window.ensemble.config.load();
      if (result.ok) {
        setConfig(result.data);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Listen for external config changes (from CLI or other tools)
  useEffect(() => {
    const unsub = window.ensemble.config.onExternalChange(() => {
      if (!savingRef.current) {
        load();
      }
    });
    return unsub;
  }, [load]);

  /** Save config and update local state */
  const save = useCallback(async (updated: Record<string, unknown>) => {
    savingRef.current = true;
    try {
      await window.ensemble.config.save(updated);
      setConfig(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      savingRef.current = false;
    }
  }, []);

  /** Run an operation that returns { config, result } and auto-save */
  const mutate = useCallback(
    async <T>(
      fn: (config: Record<string, unknown>) => Promise<{ config: Record<string, unknown>; result: T }>,
    ): Promise<T | null> => {
      if (!config) return null;
      try {
        const { config: updated, result } = await fn(config);
        await save(updated);
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Operation failed");
        return null;
      }
    },
    [config, save],
  );

  return { config, loading, error, reload: load, save, mutate };
}
