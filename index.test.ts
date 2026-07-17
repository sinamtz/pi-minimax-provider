import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerMiniMax, {
	buildTextToAudioPayload,
	callMiniMaxJson,
	formatVoiceList,
	getImageMimeType,
	getMiniMaxApiBase,
	getMiniMaxApiHost,
	getRequiredMiniMaxApiKey,
	imageSourceToDataUrl,
	resolveAudioOutputPath,
	resolveSpeechOptions,
	writeMiniMaxAudioFile,
	MODELS,
} from "./index.js";

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.MINIMAX_API_HOST;
	delete process.env.MINIMAX_API_KEY;
	delete process.env.MINIMAX_MCP_BASE_PATH;
});

// =============================================================================
// Test helpers
// =============================================================================

type RegisteredTool = { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }>; details: Record<string, unknown> }> };

type ProviderCall = {
	name: string;
	config: {
		name?: string;
		baseUrl?: string;
		apiKey?: string;
		api?: string;
		streamSimple?: unknown;
		models?: Array<{
			id: string;
			name: string;
			reasoning: boolean;
			input: string[];
			cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
			contextWindow: number;
			maxTokens: number;
			compat?: { forceAdaptiveThinking?: boolean };
		}>;
		oauth?: unknown;
	};
};

function captureRegistration() {
	const tools: Record<string, RegisteredTool> = {};
	const providers: ProviderCall[] = [];
	const pi = {
		registerTool(tool: { name: string; execute: RegisteredTool["execute"] }) {
			tools[tool.name] = tool;
		},
		registerProvider(name: string, config: ProviderCall["config"]) {
			providers.push({ name, config });
		},
	};
	registerMiniMax(pi as never);
	return { tools, providers };
}

describe("models", () => {
	it("includes MiniMax-M3 with 1M context, 524288 maxTokens, and image input", () => {
		// M3 is the headline model.  The README documents pricing of $0.60 / $2.40
		// per million tokens at ≤512k input, a 1M-token context window, and a
		// 524288-token max output cap.  The built-in minimax provider in pi-ai has
		// 0.30 / 1.20 pricing and 128000 maxTokens — this extension overrides those
		// so cost tracking and output budgets match the documented limits.
		const m3 = MODELS.find((model) => model.id === "MiniMax-M3");
		expect(m3).toMatchObject({
			contextWindow: 1000000,
			maxTokens: 524288,
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 0.60, output: 2.40, cacheRead: 0.12, cacheWrite: 0 },
		});
	});

	it("includes the full M2 series with M2.7, M2.5, M2.1, and M2 base variants", () => {
		// The built-in pi-ai provider only ships M2.7 / M2.7-highspeed / M3.  This
		// extension adds the older M2.5, M2.1, and M2 variants so users on the
		// documented pricing tiers can pick the model they pay for.
		const ids = MODELS.map((m) => m.id).sort();
		expect(ids).toEqual([
			"MiniMax-M2",
			"MiniMax-M2.1",
			"MiniMax-M2.1-highspeed",
			"MiniMax-M2.5",
			"MiniMax-M2.5-highspeed",
			"MiniMax-M2.7",
			"MiniMax-M2.7-highspeed",
			"MiniMax-M3",
		]);
	});

	it("uses the README-documented pricing for every model", () => {
		// Snapshot test: any drift here means the pricing page in the README
		// needs to be updated alongside the code change.
		const expected: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
			"MiniMax-M3": { input: 0.60, output: 2.40, cacheRead: 0.12, cacheWrite: 0 },
			"MiniMax-M2.7": { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0.375 },
			"MiniMax-M2.7-highspeed": { input: 0.60, output: 2.40, cacheRead: 0.06, cacheWrite: 0.375 },
			"MiniMax-M2.5": { input: 0.30, output: 1.20, cacheRead: 0.03, cacheWrite: 0.375 },
			"MiniMax-M2.5-highspeed": { input: 0.60, output: 2.40, cacheRead: 0.03, cacheWrite: 0.375 },
			"MiniMax-M2.1": { input: 0.30, output: 1.20, cacheRead: 0.03, cacheWrite: 0.375 },
			"MiniMax-M2.1-highspeed": { input: 0.60, output: 2.40, cacheRead: 0.03, cacheWrite: 0.375 },
			"MiniMax-M2": { input: 0.30, output: 1.20, cacheRead: 0.03, cacheWrite: 0.375 },
		};
		for (const model of MODELS) {
			expect(model.cost).toEqual(expected[model.id]);
		}
	});

	it("caps M2.x maxTokens at 65536 (the documented M2 recommendation)", () => {
		// The README says M2-series max_tokens is configured to MiniMax's
		// recommended cap of 65,536.  Built-in pi-ai ships 131072 for M2.7,
		// which exceeds what we should be sending.
		const m2 = MODELS.filter((m) => m.id.startsWith("MiniMax-M2"));
		expect(m2.length).toBeGreaterThan(0);
		for (const model of m2) {
			expect(model.maxTokens).toBe(65536);
		}
	});

	it("marks M3 as multimodal and M2.x as text-only", () => {
		const m3 = MODELS.find((m) => m.id === "MiniMax-M3");
		expect(m3?.input).toEqual(["text", "image"]);

		const m2 = MODELS.filter((m) => m.id.startsWith("MiniMax-M2"));
		for (const model of m2) {
			expect(model.input).toEqual(["text"]);
		}
	});

	it("flags highspeed variants with speed=\"highspeed\"", () => {
		const highspeed = MODELS.filter((m) => m.id.endsWith("-highspeed"));
		const standard = MODELS.filter((m) => !m.id.endsWith("-highspeed") && m.id !== "MiniMax-M3");
		for (const model of highspeed) {
			expect(model.speed).toBe("highspeed");
		}
		for (const model of standard) {
			expect(model.speed).toBe("standard");
		}
	});
});

describe("MiniMax host and JSON helper", () => {
	it("uses the global host by default and strips trailing slash from overrides", () => {
		expect(getMiniMaxApiHost()).toBe("https://api.minimax.io");
		process.env.MINIMAX_API_HOST = "https://api.minimaxi.com/";
		expect(getMiniMaxApiHost()).toBe("https://api.minimaxi.com");
	});

	it("getMiniMaxApiBase appends /anthropic and honors MINIMAX_API_HOST", () => {
		delete process.env.MINIMAX_API_HOST;
		expect(getMiniMaxApiBase()).toBe("https://api.minimax.io/anthropic");

		process.env.MINIMAX_API_HOST = "https://api.minimaxi.com";
		expect(getMiniMaxApiBase()).toBe("https://api.minimaxi.com/anthropic");

		// Trailing slash on the host override is normalized so we never end up
		// with "https://api.minimaxi.com//anthropic".
		process.env.MINIMAX_API_HOST = "https://api.minimaxi.com/";
		expect(getMiniMaxApiBase()).toBe("https://api.minimaxi.com/anthropic");
	});

	it("getRequiredMiniMaxApiKey prefers options.apiKey over env", async () => {
		process.env.MINIMAX_API_KEY = "from-env";
		await expect(getRequiredMiniMaxApiKey({ apiKey: "from-options" })).resolves.toBe("from-options");
	});

	it("getRequiredMiniMaxApiKey falls back to MINIMAX_API_KEY env", async () => {
		delete process.env.MINIMAX_API_KEY;
		await expect(getRequiredMiniMaxApiKey()).rejects.toThrow(/MiniMax API key is required/);

		process.env.MINIMAX_API_KEY = "from-env";
		await expect(getRequiredMiniMaxApiKey()).resolves.toBe("from-env");
	});

	it("posts JSON and parses successful MiniMax responses", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, base_resp: { status_code: 0 } }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(callMiniMaxJson("/v1/test", { hello: "world" }, "sk-test")).resolves.toEqual({ ok: true, base_resp: { status_code: 0 } });
		expect(fetchMock).toHaveBeenCalledWith("https://api.minimax.io/v1/test", expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ hello: "world" }),
			headers: expect.objectContaining({ Authorization: "Bearer sk-test", "Content-Type": "application/json" }),
		}));
	});

	it("throws for MiniMax status errors", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ base_resp: { status_code: 1004, status_msg: "invalid api key" } }), { status: 200 })));
		await expect(callMiniMaxJson("/v1/test", {}, "bad-key")).rejects.toThrow("1004 invalid api key");
	});

	it("throws for malformed JSON", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
		await expect(callMiniMaxJson("/v1/test", {}, "sk-test")).rejects.toThrow("malformed JSON");
	});
});

describe("image helpers", () => {
	it("detects supported image mime types", () => {
		expect(getImageMimeType("a.png")).toBe("image/png");
		expect(getImageMimeType("a.webp")).toBe("image/webp");
		expect(getImageMimeType("a.jpg")).toBe("image/jpeg");
		expect(getImageMimeType("ignored", "image/png")).toBe("image/png");
	});

	it("passes data URLs through unchanged", async () => {
		await expect(imageSourceToDataUrl("data:image/png;base64,abc", process.cwd())).resolves.toBe("data:image/png;base64,abc");
	});

	it("normalizes local paths and strips a leading @", async () => {
		const dir = await mkdtemp(join(tmpdir(), "minimax-image-"));
		try {
			await writeFile(join(dir, "image.png"), Buffer.from("hello"));
			const dataUrl = await imageSourceToDataUrl("@image.png", dir);
			expect(dataUrl).toBe(`data:image/png;base64,${Buffer.from("hello").toString("base64")}`);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("speech helpers", () => {
	it("resolves default speech options and builds MiniMax payload", () => {
		const options = resolveSpeechOptions({ text: "Hello" });
		expect(options.voice_id).toBe("female-shaonv");
		expect(options.model).toBe("speech-2.8-hd");
		expect(options.emotion).toBe("neutral");
		expect(buildTextToAudioPayload(options)).toMatchObject({
			model: "speech-2.8-hd",
			text: "Hello",
			voice_setting: { voice_id: "female-shaonv", speed: 1, vol: 1, pitch: 0, emotion: "neutral" },
			audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
			language_boost: "auto",
		});
	});

	it("validates speech parameter ranges and enums", () => {
		expect(() => resolveSpeechOptions({ text: "Hello", speed: 3 })).toThrow("Speed");
		expect(() => resolveSpeechOptions({ text: "Hello", volume: -1 })).toThrow("Volume");
		expect(resolveSpeechOptions({ text: "Hello", format: "wav" }).format).toBe("wav");
		expect(() => resolveSpeechOptions({ text: "Hello", format: "ogg" as never })).toThrow("Format");
		expect(() => resolveSpeechOptions({ text: "x".repeat(10001) })).toThrow("limit");
	});

	it("adds URL output request to speech payload", () => {
		const options = resolveSpeechOptions({ text: "Hello", output_mode: "url" });
		expect(buildTextToAudioPayload(options).output_format).toBe("url");
	});

	it("creates generated output paths and refuses overwrites", async () => {
		const dir = await mkdtemp(join(tmpdir(), "minimax-audio-"));
		try {
			const generated = await resolveAudioOutputPath({ text: "Hello", format: "mp3" }, dir);
			expect(generated).toMatch(/minimax-t2a-.*\.mp3$/);

			const explicit = join(dir, "out.mp3");
			await writeMiniMaxAudioFile({ hexAudio: Buffer.from("audio").toString("hex"), outputPath: explicit, cwd: dir, format: "mp3", text: "Hello" });
			await expect(writeMiniMaxAudioFile({ hexAudio: "00", outputPath: explicit, cwd: dir, format: "mp3", text: "Hello" })).rejects.toThrow("Refusing to overwrite");
			expect(await readFile(explicit, "utf8")).toBe("audio");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("throws when no audio data is supplied", async () => {
		await expect(writeMiniMaxAudioFile({ hexAudio: "", cwd: process.cwd(), format: "mp3", text: "Hello" })).rejects.toThrow("No audio data");
	});
});

describe("registered tools", () => {
	function registeredTools() {
		return captureRegistration().tools;
	}

	it("registers native MiniMax tools", () => {
		const tools = registeredTools();
		expect(Object.keys(tools)).toEqual(expect.arrayContaining([
			"minimax_web_search",
			"minimax_understand_image",
			"minimax_list_voices",
			"minimax_text_to_audio",
		]));
	});

	it("executes web search with the expected payload", async () => {
		process.env.MINIMAX_API_KEY = "sk-test";
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic: [], base_resp: { status_code: 0 } }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const result = await registeredTools().minimax_web_search.execute("id", { query: "MiniMax docs" });
		expect(result.content[0].text).toContain("organic");
		expect(fetchMock).toHaveBeenCalledWith("https://api.minimax.io/v1/coding_plan/search", expect.objectContaining({ body: JSON.stringify({ q: "MiniMax docs" }) }));
	});

	it("formats voice list results", () => {
		expect(formatVoiceList({ system_voice: [{ voice_name: "Girl", voice_id: "female-shaonv" }], voice_cloning: [] })).toContain("Girl: female-shaonv");
	});

	it("executes text-to-audio URL mode", async () => {
		process.env.MINIMAX_API_KEY = "sk-test";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { audio: "https://audio.example/out.mp3" }, base_resp: { status_code: 0 } }), { status: 200 })));
		const result = await registeredTools().minimax_text_to_audio.execute("id", { text: "Hello", output_mode: "url" }, undefined, undefined, { cwd: process.cwd() });
		expect(result.content[0].text).toContain("Audio URL");
		expect(result.details.url).toBe("https://audio.example/out.mp3");
	});
});

// =============================================================================
// Provider registration
// =============================================================================
//
// These tests cover the structural correctness of the provider registration.
// The streaming/auth/host overrides are exercised by their dedicated suites.

describe("provider registration", () => {
	function provider() {
		return captureRegistration().providers[0];
	}

	it("registers exactly one provider with id 'minimax'", () => {
		const { providers } = captureRegistration();
		expect(providers).toHaveLength(1);
		expect(providers[0].name).toBe("minimax");
	});

	it("uses api: 'anthropic-messages' so the SDK's anthropicMessagesApi handles streaming", () => {
		expect(provider().config.api).toBe("anthropic-messages");
	});

	it("uses env-interpolation syntax ($MINIMAX_API_KEY) for the apiKey field", () => {
		// Without the leading "$", the SDK's resolveConfigValue treats the string
		// as a literal API key and would send "MINIMAX_API_KEY" as the Bearer
		// token — guaranteeing a 401 if auth.json is ever missing.
		expect(provider().config.apiKey).toBe("$MINIMAX_API_KEY");
	});

	it("sets baseUrl to the env-aware /anthropic endpoint", () => {
		delete process.env.MINIMAX_API_HOST;
		expect(captureRegistration().providers[0].config.baseUrl).toBe("https://api.minimax.io/anthropic");

		process.env.MINIMAX_API_HOST = "https://api.minimaxi.com";
		expect(captureRegistration().providers[0].config.baseUrl).toBe("https://api.minimaxi.com/anthropic");
	});

	it("wires anthropicMessagesApi().streamSimple as the streaming implementation", () => {
		const streamSimple = provider().config.streamSimple;
		expect(typeof streamSimple).toBe("function");
	});

	it("registers all 8 MiniMax models from MODELS, with id/name/cost/contextWindow/maxTokens preserved", () => {
		const registered = provider().config.models ?? [];
		expect(registered).toHaveLength(MODELS.length);

		for (const source of MODELS) {
			const found = registered.find((m) => m.id === source.id);
			expect(found, `expected ${source.id} to be registered`).toBeDefined();
			expect(found).toMatchObject({
				id: source.id,
				name: source.name,
				reasoning: source.reasoning,
				input: source.input,
				cost: source.cost,
				contextWindow: source.contextWindow,
				maxTokens: source.maxTokens,
			});
		}
	});

	it("enables compat.forceAdaptiveThinking on M3 only", () => {
		const registered = provider().config.models ?? [];
		for (const model of registered) {
			if (model.id === "MiniMax-M3") {
				expect(model.compat).toEqual({ forceAdaptiveThinking: true });
			} else {
				expect(model.compat).toBeUndefined();
			}
		}
	});
});
