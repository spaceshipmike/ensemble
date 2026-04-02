/**
 * Secret scanning — detect leaked credentials in env values and skill content.
 *
 * Values starting with op:// (1Password references) are exempt.
 */

export interface SecretViolation {
	pattern: string;
	field: string;
	serverName?: string;
	snippet: string;
}

interface SecretPattern {
	name: string;
	regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
	{ name: "OpenAI API Key", regex: /sk-[a-zA-Z0-9]{20,}/ },
	{ name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
	{ name: "GitHub PAT", regex: /ghp_[a-zA-Z0-9]{36}/ },
	{ name: "GitHub User Token", regex: /ghu_[a-zA-Z0-9]{36}/ },
	{ name: "GitHub Server Token", regex: /ghs_[a-zA-Z0-9]{36}/ },
	{ name: "Slack Token", regex: /xox[bpas]-[a-zA-Z0-9-]+/ },
	{ name: "Private Key", regex: /-----BEGIN.*PRIVATE KEY-----/ },
	{ name: "GitLab PAT", regex: /glpat-[a-zA-Z0-9-]{20}/ },
];

/**
 * Scan env values for leaked secrets. Values starting with op:// are exempt.
 */
export function scanSecrets(
	env: Record<string, string>,
	serverName?: string,
): SecretViolation[] {
	const violations: SecretViolation[] = [];

	for (const [key, value] of Object.entries(env)) {
		if (!value || value.startsWith("op://")) continue;

		for (const { name, regex } of SECRET_PATTERNS) {
			if (regex.test(value)) {
				violations.push({
					pattern: name,
					field: key,
					serverName,
					snippet: `${value.slice(0, 8)}...`,
				});
			}
		}
	}

	return violations;
}

/**
 * Scan skill content (SKILL.md body) for leaked secrets.
 */
export function scanSkillContent(content: string): SecretViolation[] {
	const violations: SecretViolation[] = [];

	for (const { name, regex } of SECRET_PATTERNS) {
		const match = regex.exec(content);
		if (match) {
			violations.push({
				pattern: name,
				field: "content",
				snippet: `${match[0].slice(0, 8)}...`,
			});
		}
	}

	return violations;
}
