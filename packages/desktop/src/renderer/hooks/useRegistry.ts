import { useState, useCallback } from "react";

/** Registry operations — search, show, and list backends */
export function useRegistry() {
  const [results, setResults] = useState<unknown[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    setSearching(true);
    setError(null);
    try {
      const r = await window.ensemble.search.registry(query);
      setResults(Array.isArray(r) ? r : []);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registry search failed");
      setResults([]);
      return [];
    } finally {
      setSearching(false);
    }
  }, []);

  const show = useCallback(async (id: string, backend?: string) => {
    try {
      return await window.ensemble.search.show(id, backend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load details");
      return null;
    }
  }, []);

  const backends = useCallback(async () => {
    return window.ensemble.search.backends();
  }, []);

  return { results, searching, error, search, show, backends };
}
