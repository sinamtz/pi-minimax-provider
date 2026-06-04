import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerMiniMax, {
	buildTextToAudioPayload,
	callMiniMaxJson,
	cleanApiKey,
	formatVoiceList,
	getImageMimeType,
	getMiniMaxApiHost,
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

describe("models", () => {
	it("includes MiniMax-M3 with 1M context and image input", () => {
		const m3 = MODELS.find((model) => model.id === "MiniMax-M3");
		expect(m3).toMatchObject({
			contextWindow: 1000000,
			maxTokens: 524288,
			reasoning: true,
		});
		expect(m3?.input).toContain("image");
	});
});

describe("MiniMax host and JSON helper", () => {
	it("uses the global host by default and strips trailing slash from overrides", () => {
		expect(getMiniMaxApiHost()).toBe("https://api.minimax.io");
		process.env.MINIMAX_API_HOST = "https://api.minimaxi.com/";
		expect(getMiniMaxApiHost()).toBe("https://api.minimaxi.com");
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
	type RegisteredTool = { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }>; details: Record<string, unknown> }> };

	function registeredTools() {
		const tools: Record<string, RegisteredTool> = {};
		const pi = {
			registerTool(tool: { name: string; execute: RegisteredTool["execute"] }) {
				tools[tool.name] = tool;
			},
			registerProvider: vi.fn(),
		};
		registerMiniMax(pi as never);
		return tools;
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
