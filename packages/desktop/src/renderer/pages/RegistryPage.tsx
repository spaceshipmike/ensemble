import React, { useState, useCallback } from "react";
import { RegistryCard } from "../components/RegistryCard";

interface RegistryPageProps {
  config: Record<string, unknown> | null;
  onMutate: (
    fn: (config: Record<string, unknown>) => Promise<{ config: Record<string, unknown>; result: unknown }>,
  ) => Promise<unknown>;
}

type RegistryServer = Record<string, unknown>;

export function RegistryPage({ config, onMutate }: RegistryPageProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistryServer[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setDetail(null);
    try {
      const r = await window.ensemble.search.registry(query.trim());
      setResults(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed — registry may be unavailable");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleShowDetails = useCallback(async (id: string, backend?: string) => {
    try {
      const d = await window.ensemble.search.show(id, backend);
      setDetail(d as Record<string, unknown>);
    } catch {
      setError("Failed to load server details");
    }
  }, []);

  const handleInstall = useCallback(async (id: string, _backend?: string) => {
    if (!config) return;
    setInstalling(id);
    try {
      // Use the registry show + resolve pattern to get install params
      const details = await window.ensemble.search.show(id);
      if (details) {
        const d = details as Record<string, unknown>;
        const name = (d.name as string) ?? id;
        const server: Record<string, unknown> = {};
        if (d.command) server.command = d.command;
        if (d.args) server.args = d.args;
        if (d.env) server.env = d.env;
        if (d.url) server.url = d.url;
        server.enabled = true;
        server.origin = { source: "registry", id, installed_at: new Date().toISOString() };
        await onMutate((c) => window.ensemble.servers.add(c, name, server));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setInstalling(null);
    }
  }, [config, onMutate]);

  return (
    <div data-testid="registry-page" className="p-6">
      <h2 className="text-body font-medium text-sidebar-muted uppercase tracking-wide mb-4">Registry</h2>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          data-testid="registry-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search MCP servers (e.g., filesystem, github, database)..."
          className="flex-1 px-3 py-2 bg-surface-bg border border-surface-border rounded-md text-body text-sidebar-text focus:outline-none focus:border-accent"
        />
        <button
          data-testid="registry-search-btn"
          type="submit"
          disabled={searching}
          className="px-4 py-2 bg-accent text-surface-bg rounded-md text-body font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {error && (
        <div data-testid="registry-error" className="mb-4 p-3 bg-status-error/10 border border-status-error/30 rounded-md text-body text-status-error">
          {error}
        </div>
      )}

      {detail && (
        <div className="mb-6 p-4 bg-surface-card rounded-lg border border-accent/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-body font-medium text-sidebar-text">{detail.name as string}</h3>
            <button onClick={() => setDetail(null)} className="text-secondary text-sidebar-muted hover:text-sidebar-text">Close</button>
          </div>
          <pre className="text-secondary text-sidebar-muted overflow-auto max-h-60 bg-surface-bg p-3 rounded">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {results.map((server, i) => (
            <RegistryCard
              key={(server.id as string) ?? i}
              server={{
                id: server.id as string,
                name: (server.name as string) ?? (server.id as string) ?? `result-${i}`,
                description: server.description as string,
                trust_tier: server.trust_tier as string,
                quality_score: server.quality_score as number,
                tool_count: server.tool_count as number,
                stars: server.stars as number,
                backend: server.backend as string,
              }}
              onInstall={handleInstall}
              onShowDetails={handleShowDetails}
            />
          ))}
        </div>
      )}

      {!searching && results.length === 0 && query && (
        <div className="text-center text-body text-sidebar-muted py-8">
          No results found for "{query}"
        </div>
      )}

      {installing && (
        <div className="fixed bottom-4 right-4 px-4 py-2 bg-accent text-surface-bg rounded-md text-body shadow-lg">
          Installing {installing}...
        </div>
      )}
    </div>
  );
}
