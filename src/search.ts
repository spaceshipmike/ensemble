/**
 * Local capability search — BM25-style term frequency matching over servers and skills.
 *
 * Features: query alias expansion, multi-signal quality scoring, usage-based learning.
 */

import type { EnsembleConfig, Server, Skill } from "./schemas.js";
import { getUsageScore, type UsageData } from "./usage.js";

export interface SearchResult {
	name: string;
	score: number;
	matchedFields: string[];
	matchedTools: string[];
	resultType: "server" | "skill";
}

// --- Query alias expansion ---

export const QUERY_ALIASES: Record<string, string[]> = {
	k8s: ["kubernetes"],
	mcp: ["model context protocol", "model-context-protocol"],
	cli: ["command line", "terminal"],
	fs: ["filesystem", "file system"],
	db: ["database"],
	auth: ["authentication", "authorization"],
	js: ["javascript"],
	ts: ["typescript"],
	py: ["python"],
	ml: ["machine learning"],
	ai: ["artificial intelligence"],
	api: ["application programming interface"],
	ci: ["continuous integration"],
	cd: ["continuous deployment", "continuous delivery"],
	vcs: ["version control"],
	git: ["version control", "repository"],
	sql: ["database", "query"],
	nosql: ["mongodb", "redis", "dynamodb"],
	aws: ["amazon web services"],
	gcp: ["google cloud platform"],
	oss: ["open source"],
	devops: ["deployment", "infrastructure"],
	infra: ["infrastructure"],
	deps: ["dependencies"],
	pkg: ["package"],
	env: ["environment"],
	config: ["configuration"],
	msg: ["message", "messaging"],
	ws: ["websocket"],
	http: ["web", "request"],
};

/**
 * Expand query aliases — returns the original query with alias expansions OR-joined.
 */
export function expandAliases(query: string): string {
	const words = query.toLowerCase().split(/\s+/);
	const expanded: string[] = [];

	for (const word of words) {
		expanded.push(word);
		const aliases = QUERY_ALIASES[word];
		if (aliases) {
			expanded.push(...aliases);
		}
	}

	return expanded.join(" ");
}

// --- Quality scoring ---

/**
 * Compute a quality score (0-1) for a server based on static signals.
 */
export function computeServerQualityScore(
	server: Server,
	_config: EnsembleConfig,
): number {
	let score = 0;
	let signals = 0;

	// Signal: has tools (completeness)
	signals++;
	if (server.tools.length > 0) score += 1;

	// Signal: has origin timestamp (recency indicator)
	signals++;
	if (server.origin.timestamp) {
		const age = Date.now() - new Date(server.origin.timestamp).getTime();
		const dayMs = 86400000;
		// Decay: 1.0 for today, ~0.5 for 30 days, ~0.25 for 90 days
		score += Math.max(0, 1 - age / (90 * dayMs));
	}

	// Signal: trust tier
	signals++;
	if (server.origin.trust_tier === "official") score += 1;
	else if (server.origin.trust_tier === "community") score += 0.5;
	else score += 0.25; // local

	// Signal: enabled
	signals++;
	if (server.enabled) score += 1;

	return signals > 0 ? score / signals : 0.5;
}

/**
 * Compute a quality score (0-1) for a skill based on static signals.
 */
export function computeSkillQualityScore(
	skill: Skill,
	_config: EnsembleConfig,
): number {
	let score = 0;
	let signals = 0;

	// Signal: frontmatter completeness
	signals++;
	let completeness = 0;
	if (skill.name) completeness += 0.3;
	if (skill.description) completeness += 0.4;
	if (skill.tags.length > 0) completeness += 0.3;
	score += completeness;

	// Signal: has dependencies declared (indicates quality)
	signals++;
	score += skill.dependencies.length > 0 ? 0.7 : 0.3;

	// Signal: enabled
	signals++;
	if (skill.enabled) score += 1;

	return signals > 0 ? score / signals : 0.5;
}

// --- BM25 core ---

function tokenize(text: string): string[] {
	return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function termFrequency(tokens: string[], term: string): number {
	return tokens.filter((t) => t === term || t.includes(term)).length;
}

function bm25Score(
	tf: number,
	docLen: number,
	avgDocLen: number,
	df: number,
	nDocs: number,
	k1 = 1.5,
	b = 0.75,
): number {
	if (df === 0 || nDocs === 0) return 0;
	const idf = Math.log((nDocs - df + 0.5) / (df + 0.5) + 1);
	const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docLen) / Math.max(avgDocLen, 1)));
	return idf * tfNorm;
}

export function searchServers(
	config: EnsembleConfig,
	query: string,
	limit = 20,
	options?: { usageData?: UsageData },
): SearchResult[] {
	const expandedQuery = expandAliases(query);
	const queryTerms = tokenize(expandedQuery);
	if (queryTerms.length === 0 || config.servers.length === 0) return [];

	const docs = config.servers.map((s) => {
		const tokens: string[] = [];
		tokens.push(...Array(3).fill(tokenize(s.name)).flat()); // 3x name boost
		for (const tool of s.tools) {
			tokens.push(...Array(2).fill(tokenize(tool.name)).flat()); // 2x tool name
			if (tool.description) tokens.push(...tokenize(tool.description));
		}
		return { server: s, tokens, len: tokens.length };
	});

	const nDocs = docs.length;
	const avgDocLen = docs.reduce((sum, d) => sum + d.len, 0) / Math.max(nDocs, 1);

	const df: Record<string, number> = {};
	for (const term of queryTerms) {
		df[term] = docs.filter((d) => d.tokens.some((t) => t.includes(term))).length;
	}

	const results: SearchResult[] = [];
	for (const { server, tokens, len: docLen } of docs) {
		let bm25Total = 0;
		for (const term of queryTerms) {
			const tf = termFrequency(tokens, term);
			if (tf > 0) bm25Total += bm25Score(tf, docLen, avgDocLen, df[term]!, nDocs);
		}
		if (bm25Total > 0) {
			const matchedFields: string[] = [];
			const matchedTools: string[] = [];
			const nameTokens = tokenize(server.name);
			if (queryTerms.some((term) => nameTokens.some((t) => t.includes(term)))) {
				matchedFields.push("name");
			}
			for (const tool of server.tools) {
				const toolTokens = [...tokenize(tool.name), ...tokenize(tool.description)];
				if (queryTerms.some((term) => toolTokens.some((t) => t.includes(term)))) {
					matchedTools.push(tool.name);
				}
			}
			if (matchedTools.length > 0) matchedFields.push("tools");

			// Blend BM25 with quality score (and optionally usage score)
			const staticQuality = computeServerQualityScore(server, config);
			let qualityScore: number;
			if (options?.usageData) {
				const usageScore = getUsageScore(server.name, options.usageData);
				qualityScore = 0.5 * staticQuality + 0.5 * usageScore;
			} else {
				qualityScore = staticQuality;
			}
			const maxBm25 = Math.max(bm25Total, 1); // normalize
			const normalizedBm25 = bm25Total / maxBm25;
			const finalScore = 0.6 * normalizedBm25 + 0.4 * qualityScore;

			results.push({
				name: server.name,
				score: finalScore * bm25Total, // scale back to BM25 magnitude for sorting
				matchedFields,
				matchedTools: matchedTools.slice(0, 5),
				resultType: "server",
			});
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, limit);
}

export function searchSkills(
	config: EnsembleConfig,
	query: string,
	limit = 20,
	options?: { usageData?: UsageData },
): SearchResult[] {
	const expandedQuery = expandAliases(query);
	const queryTerms = tokenize(expandedQuery);
	if (queryTerms.length === 0 || config.skills.length === 0) return [];

	const docs = config.skills.map((s) => {
		const tokens: string[] = [];
		tokens.push(...Array(3).fill(tokenize(s.name)).flat()); // 3x name boost
		for (const tag of s.tags) {
			tokens.push(...Array(2).fill(tokenize(tag)).flat()); // 2x tag boost
		}
		if (s.description) tokens.push(...tokenize(s.description));
		return { skill: s, tokens, len: tokens.length };
	});

	const nDocs = docs.length;
	const avgDocLen = docs.reduce((sum, d) => sum + d.len, 0) / Math.max(nDocs, 1);

	const df: Record<string, number> = {};
	for (const term of queryTerms) {
		df[term] = docs.filter((d) => d.tokens.some((t) => t.includes(term))).length;
	}

	const results: SearchResult[] = [];
	for (const { skill, tokens, len: docLen } of docs) {
		let bm25Total = 0;
		for (const term of queryTerms) {
			const tf = termFrequency(tokens, term);
			if (tf > 0) bm25Total += bm25Score(tf, docLen, avgDocLen, df[term]!, nDocs);
		}
		if (bm25Total > 0) {
			const matchedFields: string[] = [];
			if (queryTerms.some((term) => tokenize(skill.name).some((t) => t.includes(term)))) {
				matchedFields.push("name");
			}
			if (skill.tags.some((tag) => queryTerms.some((term) => tokenize(tag).some((t) => t.includes(term))))) {
				matchedFields.push("tags");
			}
			if (skill.description && queryTerms.some((term) => tokenize(skill.description).some((t) => t.includes(term)))) {
				matchedFields.push("description");
			}

			// Blend BM25 with quality score (and optionally usage score)
			const staticQuality = computeSkillQualityScore(skill, config);
			let qualityScore: number;
			if (options?.usageData) {
				const usageScore = getUsageScore(skill.name, options.usageData);
				qualityScore = 0.5 * staticQuality + 0.5 * usageScore;
			} else {
				qualityScore = staticQuality;
			}
			const maxBm25 = Math.max(bm25Total, 1);
			const normalizedBm25 = bm25Total / maxBm25;
			const finalScore = 0.6 * normalizedBm25 + 0.4 * qualityScore;

			results.push({
				name: skill.name,
				score: finalScore * bm25Total,
				matchedFields,
				matchedTools: [],
				resultType: "skill",
			});
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, limit);
}

export function searchAll(
	config: EnsembleConfig,
	query: string,
	limit = 20,
	options?: { usageData?: UsageData },
): SearchResult[] {
	const combined = [...searchServers(config, query, limit, options), ...searchSkills(config, query, limit, options)];
	combined.sort((a, b) => b.score - a.score);
	return combined.slice(0, limit);
}
