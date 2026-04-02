/**
 * Usage tracking — record and retrieve tool/server usage for self-learning search.
 *
 * Storage: ~/.config/ensemble/usage.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR } from "./config.js";

export interface UsageEntry {
	invocations: number;
	lastUsed: string;
	successes: number;
	failures: number;
}

export type UsageData = Record<string, UsageEntry>;

const USAGE_PATH = join(CONFIG_DIR, "usage.json");
const COLD_START_THRESHOLD = 5;
const NEUTRAL_SCORE = 0.5;

export function loadUsage(): UsageData {
	if (!existsSync(USAGE_PATH)) return {};
	try {
		return JSON.parse(readFileSync(USAGE_PATH, "utf-8")) as UsageData;
	} catch {
		return {};
	}
}

export function saveUsage(data: UsageData): void {
	mkdirSync(dirname(USAGE_PATH), { recursive: true });
	writeFileSync(USAGE_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export function recordUsage(
	name: string,
	outcome: "success" | "failure",
	data?: UsageData,
): UsageData {
	const usage = data ?? loadUsage();
	const existing = usage[name] ?? {
		invocations: 0,
		lastUsed: "",
		successes: 0,
		failures: 0,
	};

	const updated: UsageEntry = {
		invocations: existing.invocations + 1,
		lastUsed: new Date().toISOString(),
		successes: existing.successes + (outcome === "success" ? 1 : 0),
		failures: existing.failures + (outcome === "failure" ? 1 : 0),
	};

	return { ...usage, [name]: updated };
}

/**
 * Get a usage-based quality score (0-1).
 * Returns 0.5 (neutral) for cold-start items with fewer than 5 invocations.
 */
export function getUsageScore(name: string, data?: UsageData): number {
	const usage = data ?? loadUsage();
	const entry = usage[name];
	if (!entry || entry.invocations < COLD_START_THRESHOLD) {
		return NEUTRAL_SCORE;
	}

	// Success rate as primary signal
	const successRate = entry.invocations > 0
		? entry.successes / entry.invocations
		: NEUTRAL_SCORE;

	// Recency boost: more recent usage gets a slight boost
	const daysSinceUse = entry.lastUsed
		? (Date.now() - new Date(entry.lastUsed).getTime()) / 86400000
		: 30;
	const recencyFactor = Math.max(0, 1 - daysSinceUse / 90);

	// Blend: 70% success rate, 30% recency
	return 0.7 * successRate + 0.3 * recencyFactor;
}

export function clearUsage(): void {
	if (existsSync(USAGE_PATH)) {
		writeFileSync(USAGE_PATH, "{}\n", "utf-8");
	}
}

export const USAGE_PATH_FOR_TESTING = USAGE_PATH;
