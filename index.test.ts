import { describe, it, expect, vi, afterEach } from "vitest";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
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
	getMiniMaxCnApiBase,
	getMiniMaxToolRegion,
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
	delete process.env.MINIMAX_CN_API_HOST;
	delete process.env.MINIMAX_API_KEY;
	delete process.env.MINIMAX_CN_API_KEY;
	delete process.env.MINIMAX_REGION;
	delete process.env.MINIMAX_BASE_URL;
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

function createFakeSdk() {
	return {
		search: { query: vi.fn(async () => ({ organic: [] })) },
		vision: { describe: vi.fn(async () => ({ content: "image description" })) },
		speech: {
			voices: vi.fn(async () => [{ voice_id: "voice-1", voice_name: "Voice One", description: ["English"] }]),
			synthesize: vi.fn(async () => ({ base_resp: { status_code: 0, status_msg: "success" }, data: { audio_url: "https://audio.example/out.mp3", status: 2 } })),
		},
		image: { generate: vi.fn(async () => ({ base_resp: { status_code: 0, status_msg: "success" }, data: { image_urls: ["https://image.example/out.png"], task_id: "img-1", success_count: 1, failed_count: 0 } })) },
		video: {
			generate: vi.fn(async () => ({ taskId: "video-task-1" })),
			getTask: vi.fn(async () => ({ base_resp: { status_code: 0, status_msg: "success" }, task_id: "video-task-1", status: "Success", file_id: "file-1" })),
			download: vi.fn(async () => ({ size: 10, save: "/tmp/video.mp4", downloadUrl: "https://video.example/out.mp4" })),
		},
		music: { generate: vi.fn(async () => ({ base_resp: { status_code: 0, status_msg: "success" }, data: { audio_url: "https://audio.example/music.mp3", status: 2 } })) },
		quota: { info: vi.fn(async () => ({ model_remains: [] })) },
	};
}

function captureRegistration(sdk = createFakeSdk()) {
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
	const sdkFactory = vi.fn(async (_options?: unknown) => sdk as never);
	registerMiniMax(pi as never, sdkFactory);
	return { tools, providers, sdk, sdkFactory };
}

describe("models", () => {
	it("includes MiniMax-M3 with 1M context, 524288 maxTokens, and image input", () => {
		// M3 is the headline model.  The README documents MiniMax's current
		// permanent-discount pricing of $0.30 / $1.20 per million tokens at ≤512k
		// input, a 1M-token context window, and a 524288-token max output cap.  The
		// extension overrides built-in metadata where needed so cost tracking and
		// output budgets match the documented limits.
		const m3 = MODELS.find((model) => model.id === "MiniMax-M3");
		expect(m3).toMatchObject({
			contextWindow: 1000000,
			maxTokens: 524288,
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0 },
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
			"MiniMax-M3": { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0 },
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

	it("getRequiredMiniMaxApiKey falls back to global or China env keys", async () => {
		delete process.env.MINIMAX_API_KEY;
		delete process.env.MINIMAX_CN_API_KEY;
		await expect(getRequiredMiniMaxApiKey()).rejects.toThrow(/MiniMax API key is required/);

		process.env.MINIMAX_CN_API_KEY = "from-cn-env";
		await expect(getRequiredMiniMaxApiKey()).resolves.toBe("from-cn-env");

		process.env.MINIMAX_API_KEY = "from-global-env";
		await expect(getRequiredMiniMaxApiKey()).resolves.toBe("from-global-env");
	});

	it("resolves the China provider base URL independently", () => {
		expect(getMiniMaxCnApiBase()).toBe("https://api.minimaxi.com/anthropic");
		process.env.MINIMAX_CN_API_HOST = "https://proxy.example.cn/";
		expect(getMiniMaxCnApiBase()).toBe("https://proxy.example.cn/anthropic");
	});

	it("selects the official SDK region explicitly or from regional credentials", () => {
		expect(getMiniMaxToolRegion()).toBe("global");
		process.env.MINIMAX_CN_API_KEY = "cn-key";
		expect(getMiniMaxToolRegion()).toBe("cn");
		process.env.MINIMAX_REGION = "global";
		expect(getMiniMaxToolRegion()).toBe("global");
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
	it("registers all official MiniMax SDK capabilities", () => {
		const { tools } = captureRegistration();
		expect(Object.keys(tools)).toEqual(expect.arrayContaining([
			"minimax_web_search", "minimax_understand_image", "minimax_list_voices", "minimax_text_to_audio",
			"minimax_generate_image", "minimax_video", "minimax_generate_music", "minimax_quota",
		]));
	});

	it("routes web search through the official SDK", async () => {
		const { tools, sdk } = captureRegistration();
		const result = await tools.minimax_web_search.execute("id", { query: "MiniMax docs" });
		expect(sdk.search.query).toHaveBeenCalledWith("MiniMax docs");
		expect(result.content[0].text).toContain("organic");
	});

	it("passes Pi-resolved auth.json credentials into the official SDK", async () => {
		const { tools, sdkFactory } = captureRegistration();
		const modelRegistry = { getApiKeyForProvider: vi.fn(async () => "stored-token-plan-key") };
		await tools.minimax_web_search.execute("id", { query: "MiniMax docs" }, undefined, undefined, { modelRegistry });
		expect(modelRegistry.getApiKeyForProvider).toHaveBeenCalledWith("minimax");
		expect(sdkFactory).toHaveBeenCalledWith({ apiKey: "stored-token-plan-key" });
	});

	it("routes image understanding through the official SDK", async () => {
		const { tools, sdk } = captureRegistration();
		await tools.minimax_understand_image.execute("id", { prompt: "Describe", image_source: "data:image/png;base64,abc" }, undefined, undefined, { cwd: process.cwd() });
		expect(sdk.vision.describe).toHaveBeenCalledWith({ image: "data:image/png;base64,abc", prompt: "Describe" });
	});

	it("formats voice list results", async () => {
		const { tools } = captureRegistration();
		const result = await tools.minimax_list_voices.execute("id", { language: "en" });
		expect(result.content[0].text).toContain("Voice One: voice-1");
		expect(formatVoiceList({ system_voice: [{ voice_name: "Girl", voice_id: "female-shaonv" }], voice_cloning: [] })).toContain("Girl: female-shaonv");
	});

	it("executes text-to-audio URL mode through the SDK", async () => {
		const { tools, sdk } = captureRegistration();
		const result = await tools.minimax_text_to_audio.execute("id", { text: "Hello", output_mode: "url" }, undefined, undefined, { cwd: process.cwd() });
		expect(sdk.speech.synthesize).toHaveBeenCalled();
		expect(result.content[0].text).toContain("Audio URL");
	});

	it("routes image, video, music, and quota operations through the SDK", async () => {
		const { tools, sdk } = captureRegistration();
		await tools.minimax_generate_image.execute("id", { prompt: "A cat" });
		await tools.minimax_video.execute("id", { action: "generate", prompt: "A sunset" });
		await tools.minimax_generate_music.execute("id", { prompt: "Jazz", output_mode: "url" }, undefined, undefined, { cwd: process.cwd() });
		await tools.minimax_quota.execute("id", {});
		expect(sdk.image.generate).toHaveBeenCalled();
		expect(sdk.video.generate).toHaveBeenCalled();
		expect(sdk.music.generate).toHaveBeenCalled();
		expect(sdk.quota.info).toHaveBeenCalled();
	});
});

// =============================================================================
// Provider registration
// =============================================================================
//
// These tests cover the structural correctness of the provider registration.
// The streaming/auth/host overrides are exercised by their dedicated suites.

describe("provider registration", () => {
	function providers() {
		return captureRegistration().providers;
	}

	function provider(name = "minimax") {
		const found = providers().find((entry) => entry.name === name);
		if (!found) throw new Error(`Provider ${name} was not registered`);
		return found;
	}

	it("replaces both international and China MiniMax providers", () => {
		expect(providers().map((entry) => entry.name)).toEqual(["minimax", "minimax-cn"]);
	});

	it("uses api: 'anthropic-messages' so the SDK's anthropicMessagesApi handles streaming", () => {
		expect(provider().config.api).toBe("anthropic-messages");
	});

	it("uses the correct environment key for each regional provider", () => {
		expect(provider("minimax").config.apiKey).toBe("$MINIMAX_API_KEY");
		expect(provider("minimax-cn").config.apiKey).toBe("$MINIMAX_CN_API_KEY");
	});

	async function createRuntime(credentials = new InMemoryCredentialStore()) {
		const runtime = await ModelRuntime.create({ credentials, modelsPath: null, allowModelNetwork: false });
		for (const registration of providers()) {
			runtime.registerProvider(registration.name, registration.config as never);
		}
		return { runtime, credentials };
	}

	it("resolves both regional environment keys through Pi ModelRuntime", async () => {
		const { runtime } = await createRuntime();
		const global = await runtime.getAuth("minimax", { env: { MINIMAX_API_KEY: "global-key" } });
		const china = await runtime.getAuth("minimax-cn", { env: { MINIMAX_CN_API_KEY: "china-key" } });
		expect(global?.auth.apiKey).toBe("global-key");
		expect(china?.auth.apiKey).toBe("china-key");
	});

	it("loads stored credentials for both providers before environment fallbacks", async () => {
		const credentials = new InMemoryCredentialStore();
		await credentials.modify("minimax", async () => ({ type: "api_key", key: "stored-global" }));
		await credentials.modify("minimax-cn", async () => ({ type: "api_key", key: "stored-china" }));
		const { runtime } = await createRuntime(credentials);
		const global = await runtime.getAuth("minimax", { env: { MINIMAX_API_KEY: "env-global" } });
		const china = await runtime.getAuth("minimax-cn", { env: { MINIMAX_CN_API_KEY: "env-china" } });
		expect(global?.auth.apiKey).toBe("stored-global");
		expect(china?.auth.apiKey).toBe("stored-china");
	});

	it("gives runtime API-key overrides highest priority", async () => {
		const credentials = new InMemoryCredentialStore();
		await credentials.modify("minimax", async () => ({ type: "api_key", key: "stored-key" }));
		const { runtime } = await createRuntime(credentials);
		await runtime.setRuntimeApiKey("minimax", "runtime-key");
		const auth = await runtime.getAuth("minimax", { env: { MINIMAX_API_KEY: "env-key" } });
		expect(auth?.auth.apiKey).toBe("runtime-key");
	});

	it("sets regional Anthropic base URLs independently", () => {
		expect(provider("minimax").config.baseUrl).toBe("https://api.minimax.io/anthropic");
		expect(provider("minimax-cn").config.baseUrl).toBe("https://api.minimaxi.com/anthropic");
	});

	it("wires anthropicMessagesApi().streamSimple as the streaming implementation", () => {
		const streamSimple = provider().config.streamSimple;
		expect(typeof streamSimple).toBe("function");
	});

	it("registers the full extension model list for both regions", () => {
		for (const providerName of ["minimax", "minimax-cn"]) {
			const registered = provider(providerName).config.models ?? [];
			expect(registered).toHaveLength(MODELS.length);
			for (const source of MODELS) {
				expect(registered.find((m) => m.id === source.id)).toMatchObject({
					id: source.id,
					name: source.name,
					cost: source.cost,
					contextWindow: source.contextWindow,
					maxTokens: source.maxTokens,
				});
			}
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
