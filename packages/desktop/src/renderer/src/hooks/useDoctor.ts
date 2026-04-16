import { trpc } from "../trpc";

/**
 * Doctor — runs the health audit on demand. `run()` refetches the query
 * so the latest result lands in `result` automatically.
 */
export function useDoctor() {
  const query = trpc.doctor.run.useQuery(undefined, {
    enabled: false,
    staleTime: 0,
  });

  return {
    result: query.data ?? null,
    running: query.isFetching,
    error: query.error ? query.error.message : null,
    run: () => query.refetch().then((r) => r.data ?? null),
  };
}
