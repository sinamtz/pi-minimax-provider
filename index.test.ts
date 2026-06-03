import { describe, it, expect } from "vitest";
import { cleanApiKey } from "./index.js";

describe("cleanApiKey", () => {
	it("strips oauth: prefix", () => {
		expect(cleanApiKey("oauth:sk-1234567890abcdef")).toBe("sk-1234567890abcdef");
	});

	it("passes through regular API keys unchanged", () => {
		expect(cleanApiKey("sk-1234567890abcdef")).toBe("sk-1234567890abcdef");
	});

	it("handles empty string", () => {
		expect(cleanApiKey("")).toBe("");
	});

	it("handles keys without oauth prefix", () => {
		expect(cleanApiKey("sk-test-key")).toBe("sk-test-key");
	});
});

describe("provider registration", () => {
	it("uses $MINIMAX_API_KEY template syntax so Pi resolves the env var at request time", () => {
		// Regression test: previously used bare "MINIMAX_API_KEY" which Pi treated as
		// a literal string, sending "Authorization: Bearer MINIMAX_API_KEY" to the API.
		// The $ prefix tells Pi's resolveConfigValue to interpolate process.env.MINIMAX_API_KEY.
		// See: https://github.com/sinamtz/pi-minimax-provider/issues/3
		const source = (await import("node:fs")).readFileSync(new URL("./index.ts", import.meta.url), "utf-8");
		const match = source.match(/apiKey:\s*"([^"]+)"/);
		expect(match).toBeTruthy();
		const apiKeyValue = match![1];
		expect(apiKeyValue).toBe("$MINIMAX_API_KEY");
		expect(apiKeyValue).not.toBe("MINIMAX_API_KEY");
	});
});
