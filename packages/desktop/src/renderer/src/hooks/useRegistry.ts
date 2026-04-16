import { useCallback, useState } from "react";
import { trpc } from "../trpc";

/**
 * Registry search — wraps `search.registry` / `search.show` / `search.backends`
 * as on-demand queries via the typed tRPC utils.
 */
export function useRegistry() {
  const utils = trpc.useUtils();
  const [results, setResults] = useState<unknown[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string) => {
      setSearching(true);
      setError(null);
      try {
        const r = await utils.search.registry.fetch({ query });
        setResults(Array.isArray(r) ? r : []);
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Registry search failed");
        setResults([]);
        return [];
      } finally {
        setSearching(false);
      }
    },
    [utils],
  );

  const show = useCallback(
    async (id: string) => {
      try {
        return await utils.search.show.fetch({ id });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load details");
        return null;
      }
    },
    [utils],
  );

  const backends = useCallback(() => utils.search.backends.fetch(), [utils]);

  return { results, searching, error, search, show, backends };
}
