// @fctry: #browse-engine

/**
 * Browse engine — pure-function primitive backing both `ensemble browse` and
 * the desktop Registry view.
 *
 * `browseSearch` fuzzy-matches a query against the library (installed +
 * library-only entries) and a discoverable set (marketplace-advertised
 * entries that aren't yet in the library). Results are merged into a single
 * ranked list with an install-state badge.
 *
 * ## Ranking
 *
 * 1. `installed` entries first (in the library AND enabled on ≥1 client).
 * 2. `library` entries next (in the library but disabled everywhere).
 * 3. `discoverable` entries last (not yet in the library; suggest an
 *    install command for each).
 * 4. Within each tier, ties break by fuzzy match score (lower = better).
 *
 * ## Marketplace filter
 *
 * A leading token of the form `@<marketplace-name>/<rest>` restricts results
 * to entries that originate from that marketplace. The filter chip is
 * consumed from the query string; the remaining `<rest>` is the fuzzy part.
 *
 * ## Limits
 *
 * Default limit = 50 rows. Callers pass `{ limit }` to override.
 */

import type { EnsembleConfig } from "./schemas.js";

// --- Types ---

export type InstallState = "installed" | "library" | "discoverable";

export interface BrowseResult {
	name: string;
	type: string;
	source: string;
	installState: InstallState;
	/** For `discoverable` entries, the exact command to run next. */
	installCommand?: string;
	/** Internal match score. Lower = better. Exposed for debugging. */
	score?: number;
}

export interface DiscoverableEntry {
	name: string;
	type: string;
	marketplace: string;
	/** Command to run to bring this into the library. */
	installCommand: string;
}

export interface BrowseOptions {
	query?: string;
	type?: string;
	marketplace?: string;
	limit?: number;
	/**
	 * Marketplace-advertised entries not in the library. When the CLI has no
	 * marketplace index it passes `[]` and the engine falls back to
	 * library-only results.
	 */
	discoverable?: DiscoverableEntry[];
}

export interface BrowseParseResult {
	query: string;
	marketplace?: string;
}

// --- Query parsing ---

/**
 * Parse a `@marketplace/query` filter chip from the query string. Returns
 * the remaining fuzzy query and the matched marketplace name (if any).
 *
 * Examples:
 *   "@official/react-docs"  → { query: "react-docs", marketplace: "official" }
 *   "plain fuzzy string"   → { query: "plain fuzzy string" }
 *   "@acme/ hello world"   → { query: "hello world", marketplace: "acme" }
 */
export function parseMarketplaceFilter(raw: string): BrowseParseResult {
	const trimmed = raw.trim();
	if (!trimmed.startsWith("@")) return { query: trimmed };
	const slash = trimmed.indexOf("/");
	if (slash < 0) return { query: trimmed };
	const marketplace = trimmed.slice(1, slash);
	if (!marketplace) return { query: trimmed };
	const query = trimmed.slice(slash + 1).trim();
	return { query, marketplace };
}

// --- Fuzzy match ---

/**
 * Return a match score for `query` against `candidate`. Lower is better.
 * Returns `null` when the query's characters do not appear in order inside
 * the candidate (subsequence test). Empty query returns 0 (every candidate
 * matches equally).
 *
 * The scoring uses the classic subsequence-with-gap penalty: contiguous
 * matches beat scattered matches. We don't depend on a fuzzy library so the
 * engine stays pure-function and dependency-free.
 */
export function fuzzyScore(query: string, candidate: string): number | null {
	if (!query) return 0;
	const q = query.toLowerCase();
	const c = candidate.toLowerCase();
	let qi = 0;
	let lastHit = -1;
	let gaps = 0;
	for (let ci = 0; ci < c.length && qi < q.length; ci++) {
		if (c[ci] === q[qi]) {
			if (lastHit >= 0 && ci - lastHit > 1) gaps += ci - lastHit - 1;
			lastHit = ci;
			qi++;
		}
	}
	if (qi < q.length) return null;
	// Prefer shorter names; prefer matches near the start; penalise gaps.
	return gaps + c.length * 0.1 + Math.max(0, lastHit - q.length + 1) * 0.05;
}

// --- Library entry collection ---

interface InternalCandidate {
	name: string;
	type: string;
	source: string;
	installed: boolean;
}

function collectLibraryCandidates(config: EnsembleConfig): InternalCandidate[] {
	const out: InternalCandidate[] = [];
	for (const s of config.servers) {
		out.push({
			name: s.name,
			type: "server",
			source: s.origin.source || "manual",
			installed: s.enabled,
		});
	}
	for (const p of config.plugins) {
		out.push({
			name: p.name,
			type: "plugin",
			source: p.marketplace || "local",
			installed: p.enabled,
		});
	}
	for (const s of config.skills) {
		out.push({
			name: s.name,
			type: "skill",
			source: s.origin || "manual",
			installed: s.enabled,
		});
	}
	for (const a of config.agents ?? []) {
		out.push({
			name: a.name,
			type: "agent",
			source: "manual",
			installed: a.enabled,
		});
	}
	for (const c of config.commands ?? []) {
		out.push({
			name: c.name,
			type: "command",
			source: "manual",
			installed: c.enabled,
		});
	}
	return out;
}

// --- Main entry ---

const DEFAULT_LIMIT = 50;
const TIER_RANK: Record<InstallState, number> = {
	installed: 0,
	library: 1,
	discoverable: 2,
};

export function browseSearch(config: EnsembleConfig, options: BrowseOptions = {}): BrowseResult[] {
	const { query: parsedQuery, marketplace: inlineMarketplace } = parseMarketplaceFilter(
		options.query ?? "",
	);
	const marketplaceFilter = options.marketplace ?? inlineMarketplace;
	const typeFilter = options.type;
	const limit = options.limit && options.limit > 0 ? options.limit : DEFAULT_LIMIT;

	const hits: BrowseResult[] = [];

	// Library side.
	for (const cand of collectLibraryCandidates(config)) {
		if (typeFilter && cand.type !== typeFilter) continue;
		if (marketplaceFilter && cand.source !== marketplaceFilter) continue;
		const score = fuzzyScore(parsedQuery, cand.name);
		if (score === null) continue;
		hits.push({
			name: cand.name,
			type: cand.type,
			source: cand.source,
			installState: cand.installed ? "installed" : "library",
			score,
		});
	}

	// Discoverable side (marketplace-advertised but not in library).
	const libraryIndex = new Set<string>();
	for (const h of hits) libraryIndex.add(`${h.type}:${h.name}`);
	for (const d of options.discoverable ?? []) {
		if (typeFilter && d.type !== typeFilter) continue;
		if (marketplaceFilter && d.marketplace !== marketplaceFilter) continue;
		if (libraryIndex.has(`${d.type}:${d.name}`)) continue;
		const score = fuzzyScore(parsedQuery, d.name);
		if (score === null) continue;
		hits.push({
			name: d.name,
			type: d.type,
			source: d.marketplace,
			installState: "discoverable",
			installCommand: d.installCommand,
			score,
		});
	}

	// Sort: tier first, then score, then name.
	hits.sort((a, b) => {
		const tierDelta = TIER_RANK[a.installState] - TIER_RANK[b.installState];
		if (tierDelta !== 0) return tierDelta;
		const scoreDelta = (a.score ?? 0) - (b.score ?? 0);
		if (scoreDelta !== 0) return scoreDelta;
		return a.name.localeCompare(b.name);
	});

	return hits.slice(0, limit);
}
