import { describe, expect, it } from "vitest";
import { scanSecrets, scanSkillContent } from "../src/secrets.js";

describe("scanSecrets", () => {
	it("detects OpenAI API key", () => {
		const violations = scanSecrets({ OPENAI_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz1234567890" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("OpenAI API Key");
		expect(violations[0]?.field).toBe("OPENAI_API_KEY");
	});

	it("detects AWS access key", () => {
		const violations = scanSecrets({ AWS_KEY: "AKIAIOSFODNN7EXAMPLE" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("AWS Access Key");
	});

	it("detects GitHub PAT", () => {
		const violations = scanSecrets({ GH_TOKEN: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("GitHub PAT");
	});

	it("detects Slack token", () => {
		const violations = scanSecrets({ SLACK: "xoxb-1234567890-abcdef" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("Slack Token");
	});

	it("detects private key header", () => {
		const violations = scanSecrets({ KEY: "-----BEGIN RSA PRIVATE KEY-----\ndata" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("Private Key");
	});

	it("detects GitLab PAT", () => {
		const violations = scanSecrets({ GL: "glpat-abcdefghij1234567890" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("GitLab PAT");
	});

	it("detects GitHub user token", () => {
		const violations = scanSecrets({ GH: "ghu_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("GitHub User Token");
	});

	it("detects GitHub server token", () => {
		const violations = scanSecrets({ GH: "ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij" });
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("GitHub Server Token");
	});

	it("exempts op:// references", () => {
		const violations = scanSecrets({ API_KEY: "op://vault/item/field" });
		expect(violations.length).toBe(0);
	});

	it("skips empty values", () => {
		const violations = scanSecrets({ EMPTY: "" });
		expect(violations.length).toBe(0);
	});

	it("returns no violations for safe values", () => {
		const violations = scanSecrets({ PORT: "3000", HOST: "localhost" });
		expect(violations.length).toBe(0);
	});

	it("includes serverName when provided", () => {
		const violations = scanSecrets(
			{ KEY: "sk-abcdefghijklmnopqrstuvwxyz1234567890" },
			"my-server",
		);
		expect(violations[0]?.serverName).toBe("my-server");
	});

	it("detects multiple violations in one env", () => {
		const violations = scanSecrets({
			OPENAI: "sk-abcdefghijklmnopqrstuvwxyz1234567890",
			AWS: "AKIAIOSFODNN7EXAMPLE",
		});
		expect(violations.length).toBe(2);
	});
});

describe("scanSkillContent", () => {
	it("detects secrets in markdown content", () => {
		const content = "Use this key: sk-abcdefghijklmnopqrstuvwxyz1234567890";
		const violations = scanSkillContent(content);
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("OpenAI API Key");
		expect(violations[0]?.field).toBe("content");
	});

	it("returns no violations for clean content", () => {
		const content = "# My Skill\n\nThis skill does useful things.";
		const violations = scanSkillContent(content);
		expect(violations.length).toBe(0);
	});

	it("detects private key in content", () => {
		const content = "-----BEGIN RSA PRIVATE KEY-----\nbase64data\n-----END RSA PRIVATE KEY-----";
		const violations = scanSkillContent(content);
		expect(violations.length).toBe(1);
		expect(violations[0]?.pattern).toBe("Private Key");
	});
});
