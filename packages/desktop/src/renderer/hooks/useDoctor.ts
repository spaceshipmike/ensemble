import { useState, useCallback } from "react";
import { useConfig } from "./useConfig";

/** Doctor operations — runs health audit and returns structured results */
export function useDoctor() {
  const { config } = useConfig();
  const [result, setResult] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!config) return null;
    setRunning(true);
    setError(null);
    try {
      const r = await window.ensemble.doctor.run(config);
      setResult(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Doctor failed");
      return null;
    } finally {
      setRunning(false);
    }
  }, [config]);

  return { result, running, error, run };
}
