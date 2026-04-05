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
