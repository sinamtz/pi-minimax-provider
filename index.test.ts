import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerMiniMax, {
	buildAnthropicMessages,
	buildTextToAudioPayload,
	callMiniMaxJson,
	formatVoiceList,
	getImageMimeType,
	getMiniMaxApiBase,
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

	it("getMiniMaxApiBase honors MINIMAX_API_HOST for the streaming endpoint", () => {
		delete process.env.MINIMAX_API_HOST;
		expect(getMiniMaxApiBase()).toBe("https://api.minimax.io/anthropic");

		process.env.MINIMAX_API_HOST = "https://api.minimaxi.com";
		expect(getMiniMaxApiBase()).toBe("https://api.minimaxi.com/anthropic");

		// Trailing slash on the override is normalized away.
		process.env.MINIMAX_API_HOST = "https://api.minimaxi.com/";
		expect(getMiniMaxApiBase()).toBe("https://api.minimaxi.com/anthropic");
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

// =============================================================================
// Tests for buildAnthropicMessages
// =============================================================================
//
// These guard against MiniMax API error 2013: "tool call result does not follow
// tool call".  The Messages API requires all tool_result blocks for an assistant
// turn to live in the immediately-following user message.  Pi's context can have
// intervening non-standard entries (branchSummary, compactionSummary, custom
// extension entries, etc.) that this helper must work around.

type ToolResultLike = {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: Array<{ type: "text"; text: string }>;
	isError: boolean;
	timestamp: number;
};

describe("buildAnthropicMessages — tool result ordering", () => {
	const assistantWithTwoCalls = {
		role: "assistant" as const,
		content: [
			{ type: "toolCall" as const, id: "call_a", name: "bash", arguments: { command: "ls" } },
			{ type: "toolCall" as const, id: "call_b", name: "read", arguments: { path: "/tmp/x" } },
		],
		api: "anthropic-messages",
		provider: "minimax",
		model: "MiniMax-M3",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse" as const,
		timestamp: 0,
	};
	const userText = (text: string) => ({
		role: "user" as const,
		content: [{ type: "text" as const, text }],
		timestamp: 0,
	});
	const resultA: ToolResultLike = {
		role: "toolResult",
		toolCallId: "call_a",
		toolName: "bash",
		content: [{ type: "text", text: "LICENSE\nREADME.md" }],
		isError: false,
		timestamp: 1,
	};
	const resultB: ToolResultLike = {
		role: "toolResult",
		toolCallId: "call_b",
		toolName: "read",
		content: [{ type: "text", text: "file contents" }],
		isError: false,
		timestamp: 2,
	};

	it("groups consecutive tool results for one assistant turn into a single user message", () => {
		const out = buildAnthropicMessages(
			[
				userText("go"),
				assistantWithTwoCalls,
				resultA,
				resultB,
			],
			"sys",
		);
		// Expect: system, user, assistant[tool_use, tool_use], user[tool_result, tool_result]
		expect(out).toHaveLength(4);
		expect(out[0]).toMatchObject({ role: "system" });
		expect(out[1]).toMatchObject({ role: "user" });
		expect(out[2]).toMatchObject({ role: "assistant" });
		expect(out[3]).toMatchObject({ role: "user" });
		expect((out[3].content as Array<{ type: string }>)).toHaveLength(2);
		expect((out[3].content as Array<{ type: string }>)[0]).toMatchObject({ type: "tool_result", tool_use_id: "call_a" });
		expect((out[3].content as Array<{ type: string }>)[1]).toMatchObject({ type: "tool_result", tool_use_id: "call_b" });
	});

	it("reorders tool_results to match the tool_use order from the preceding assistant", () => {
		// Results arrive in reverse completion order — the API requires the same order as tool_use
		const out = buildAnthropicMessages(
			[
				userText("go"),
				assistantWithTwoCalls,
				resultB,
				resultA,
			],
			undefined,
		);
		const toolResults = (out[2].content as Array<{ tool_use_id: string }>);
		expect(toolResults[0]).toMatchObject({ tool_use_id: "call_a" });
		expect(toolResults[1]).toMatchObject({ tool_use_id: "call_b" });
	});

	it("groups tool results even when a branchSummary user message sits between them", () => {
		// Pi sometimes inserts a branchSummary user message between parallel tool
		// results.  The naive "append to last user message" logic fails here; the
		// fix scans backward to find the most recent pure-tool-result user message.
		const out = buildAnthropicMessages(
			[
				userText("go"),
				assistantWithTwoCalls,
				resultA,
				// Branch summary inserted between tool results
				userText("The conversation history before this point was compacted into the following summary: ..."),
				resultB,
			],
			undefined,
		);
		// Walk through messages and verify each assistant with tool_use is followed by a user
		// message whose content is all tool_result blocks.
		for (let i = 0; i < out.length; i++) {
			const m = out[i];
			if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
			const hasToolUse = (m.content as Array<{ type: string }>).some((b) => b.type === "tool_use");
			if (!hasToolUse) continue;
			const next = out[i + 1];
			expect(next).toBeDefined();
			expect(next!.role).toBe("user");
			expect(Array.isArray(next!.content)).toBe(true);
			const blocks = next!.content as Array<{ type: string }>;
			expect(blocks.length).toBeGreaterThan(0);
			for (const block of blocks) {
				expect(block.type).toBe("tool_result");
			}
		}
	});

	it("does not group tool results from different assistant turns", () => {
		// Second assistant turn has its own tool_use; its tool_result must be in
		// its own user message, not appended to the first turn's user message.
		const assistantWithOneCall = {
			role: "assistant" as const,
			content: [
				{ type: "toolCall" as const, id: "call_x", name: "bash", arguments: {} },
			],
			api: "anthropic-messages",
			provider: "minimax",
			model: "MiniMax-M3",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: "toolUse" as const,
			timestamp: 0,
		};
		const resultX: ToolResultLike = {
			role: "toolResult",
			toolCallId: "call_x",
			toolName: "bash",
			content: [{ type: "text", text: "ok" }],
			isError: false,
			timestamp: 3,
		};

		const out = buildAnthropicMessages(
			[
				userText("go"),
				assistantWithTwoCalls,
				resultA,
				resultB,
				userText("next turn"),
				assistantWithOneCall,
				resultX,
			],
			undefined,
		);

		const secondAssistantIdx = out.findIndex(
			(m) => m.role === "assistant" && Array.isArray(m.content) && (m.content as Array<{ type: string; id?: string }>).some((b) => b.type === "tool_use" && b.id === "call_x"),
		);
		expect(secondAssistantIdx).toBeGreaterThan(-1);
		const nextAfter = out[secondAssistantIdx + 1];
		expect(nextAfter).toBeDefined();
		expect(nextAfter!.role).toBe("user");
		expect(Array.isArray(nextAfter!.content)).toBe(true);
		const blocks = nextAfter!.content as Array<{ tool_use_id?: string }>;
		expect(blocks.length).toBe(1);
		expect(blocks[0]).toMatchObject({ tool_use_id: "call_x" });
	});

	it("handles a single tool result with no prior user message by emitting its own user message", () => {
		const out = buildAnthropicMessages(
			[
				userText("go"),
				assistantWithTwoCalls,
				resultA,
			],
			undefined,
		);
		// Verify each assistant with tool_use is followed by a tool_result user message
		for (let i = 0; i < out.length; i++) {
			const m = out[i];
			if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
			const hasToolUse = (m.content as Array<{ type: string }>).some((b) => b.type === "tool_use");
			if (!hasToolUse) continue;
			const next = out[i + 1];
			expect(next).toBeDefined();
			expect(next!.role).toBe("user");
			expect(Array.isArray(next!.content)).toBe(true);
		}
	});

	it("includes the system prompt as the first message when provided", () => {
		const out = buildAnthropicMessages(
			[userText("hi")],
			"You are a helpful assistant.",
		);
		expect(out[0]).toMatchObject({ role: "system", content: "You are a helpful assistant." });
	});
});
