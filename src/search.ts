/**
 * Local capability search — BM25-style term frequency matching over servers and skills.
 */

import type { EnsembleConfig } from "./schemas.js";

export interface SearchResult {
	name: string;
	score: number;
	matchedFields: string[];
	matchedTools: string[];
	resultType: "server" | "skill";
}

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
): SearchResult[] {
	const queryTerms = tokenize(query);
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
		let totalScore = 0;
		for (const term of queryTerms) {
			const tf = termFrequency(tokens, term);
			if (tf > 0) totalScore += bm25Score(tf, docLen, avgDocLen, df[term]!, nDocs);
		}
		if (totalScore > 0) {
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
			results.push({
				name: server.name,
				score: totalScore,
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
): SearchResult[] {
	const queryTerms = tokenize(query);
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
		let totalScore = 0;
		for (const term of queryTerms) {
			const tf = termFrequency(tokens, term);
			if (tf > 0) totalScore += bm25Score(tf, docLen, avgDocLen, df[term]!, nDocs);
		}
		if (totalScore > 0) {
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
			results.push({ name: skill.name, score: totalScore, matchedFields, matchedTools: [], resultType: "skill" });
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, limit);
}

export function searchAll(
	config: EnsembleConfig,
	query: string,
	limit = 20,
): SearchResult[] {
	const combined = [...searchServers(config, query, limit), ...searchSkills(config, query, limit)];
	combined.sort((a, b) => b.score - a.score);
	return combined.slice(0, limit);
}
