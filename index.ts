/**
 * Pi MiniMax Provider Extension
 *
 * Provides access to MiniMax AI models through their Anthropic-compatible API.
 * Custom streaming implementation with Bearer token auth.
 *
 * Authentication (in order of priority):
 *   1. Pre-resolved API key from SDK's AuthStorage (runtime overrides)
 *   2. API key from ~/.pi/agent/auth.json (via /login or direct edit)
 *   3. MINIMAX_API_KEY environment variable
 *
 * Usage:
 *   # Using /login command (recommended)
 *   pi -e ./pi-minimax-provider
 *   /login -> minimax  # Prompts for API key, saves to auth.json
 *
 *   # Using environment variable
 *   MINIMAX_API_KEY=your-api-key pi -e ./pi-minimax-provider
 */

import {
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { MiniMaxSDK, type Region } from "mmx-cli/sdk";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, resolve } from "node:path";

// =============================================================================
// Constants
// =============================================================================

const MINIMAX_API_HOST = "https://api.minimax.io";
const MINIMAX_CN_API_HOST = "https://api.minimaxi.com";
const MINIMAX_API_SOURCE = "Pi-MiniMax-Provider";

// =============================================================================
// Models - MiniMax M2 Series
// =============================================================================

interface MiniMaxModel {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
	description: string;
	speed: "standard" | "highspeed";
}



export const MODELS: MiniMaxModel[] = [
	// MiniMax M3
	{
		id: "MiniMax-M3",
		name: "MiniMax M3",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 524288,
		description: "Frontier multimodal coding model with 1M context window",
		speed: "standard",
	},
	// MiniMax M2.7 Series
	{
		id: "MiniMax-M2.7",
		name: "MiniMax M2.7",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
		contextWindow: 204800,
		maxTokens: 65536,
		description: "Beginning the journey of recursive self-improvement (~60 tps)",
		speed: "standard",
	},
	{
		id: "MiniMax-M2.7-highspeed",
		name: "MiniMax M2.7 (Highspeed)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.6, output: 2.4, cacheRead: 0.06, cacheWrite: 0.375 },
		contextWindow: 204800,
		maxTokens: 65536,
		description: "M2.7 Highspeed: Same performance, faster (~100 tps)",
		speed: "highspeed",
	},
	// MiniMax M2.5 Series
	{
		id: "MiniMax-M2.5",
		name: "MiniMax M2.5",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
		contextWindow: 204800,
		maxTokens: 65536,
		description: "Peak Performance. Ultimate Value. Master the Complex (~60 tps)",
		speed: "standard",
	},
	{
		id: "MiniMax-M2.5-highspeed",
		name: "MiniMax M2.5 (Highspeed)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.6, output: 2.4, cacheRead: 0.03, cacheWrite: 0.375 },
		contextWindow: 204800,
		maxTokens: 65536,
		description: "M2.5 Highspeed: Same performance, faster (~100 tps)",
		speed: "highspeed",
	},
	// MiniMax M2.1 Series
	{
		id: "MiniMax-M2.1",
		name: "MiniMax M2.1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
		contextWindow: 204800,
		maxTokens: 65536,
		description: "Powerful Multi-Language Programming Capabilities (~60 tps)",
		speed: "standard",
	},
	{
		id: "MiniMax-M2.1-highspeed",
		name: "MiniMax M2.1 (Highspeed)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.6, output: 2.4, cacheRead: 0.03, cacheWrite: 0.375 },
		contextWindow: 204800,
		maxTokens: 65536,
		description: "M2.1 Highspeed: Faster and More Agile (~100 tps)",
		speed: "highspeed",
	},
	// MiniMax M2
	{
		id: "MiniMax-M2",
		name: "MiniMax M2",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
		contextWindow: 204800,
		maxTokens: 65536,
		description: "Agentic capabilities, Advanced reasoning",
		speed: "standard",
	},
];

// =============================================================================
// API Key + Host Resolution
// =============================================================================
//
// The MiniMax Anthropic-compatible endpoint is reached via the SDK's built-in
// anthropicMessagesApi, which already authenticates via envApiKeyAuth. This
// helper exists only for the native tools (web search, TTS, vision) which run
// outside the SDK's auth resolution.
//
// For streaming, registerProvider wires up envApiKeyAuth("MINIMAX_API_KEY")
// and the SDK handles the rest.

/**
 * Resolve the MiniMax API host, honoring MINIMAX_API_HOST for users on the
 * Mainland China endpoint or behind a proxy.  Read at provider-registration
 * time (and on every native-tool call) since the env var is part of the
 * process environment.
 */
export function getMiniMaxApiHost(): string {
	return (process.env.MINIMAX_API_HOST || MINIMAX_API_HOST).replace(/\/$/, "");
}

/**
 * Resolve the Anthropic-compatible endpoint base URL (host + "/anthropic").
 */
export function getMiniMaxApiBase(): string {
	return `${getMiniMaxApiHost()}/anthropic`;
}

/** Resolve the Mainland China Anthropic-compatible endpoint. */
export function getMiniMaxCnApiBase(): string {
	const host = (process.env.MINIMAX_CN_API_HOST || MINIMAX_CN_API_HOST).replace(/\/$/, "");
	return `${host}/anthropic`;
}

/**
 * Get the MiniMax API key for native tools.  Priority:
 * 1. `options.apiKey` — SDK pre-resolved key (covers runtime overrides, login,
 *    and provider-scoped env)
 * 2. `process.env.MINIMAX_API_KEY` — ambient env fallback
 */
export function getMiniMaxToolRegion(): Region {
	const configured = process.env.MINIMAX_REGION;
	if (configured === "global" || configured === "cn") return configured;
	if (getMiniMaxApiHost().includes("minimaxi.com")) return "cn";
	if (!process.env.MINIMAX_API_KEY && process.env.MINIMAX_CN_API_KEY) return "cn";
	return "global";
}

export async function getRequiredMiniMaxApiKey(options?: SimpleStreamOptions, region = getMiniMaxToolRegion()): Promise<string> {
	const regionalKey = region === "cn" ? process.env.MINIMAX_CN_API_KEY : process.env.MINIMAX_API_KEY;
	const fallbackKey = region === "cn" ? process.env.MINIMAX_API_KEY : process.env.MINIMAX_CN_API_KEY;
	const apiKey = options?.apiKey ?? regionalKey ?? fallbackKey ?? "";
	if (!apiKey) {
		throw new Error("MiniMax API key is required. Use /login for minimax/minimax-cn or set MINIMAX_API_KEY/MINIMAX_CN_API_KEY.");
	}
	return apiKey;
}

export async function createMiniMaxToolsSdk(options?: SimpleStreamOptions): Promise<MiniMaxSDK> {
	const region = getMiniMaxToolRegion();
	const apiKey = await getRequiredMiniMaxApiKey(options, region);
	const regionalHost = region === "cn"
		? (process.env.MINIMAX_CN_API_HOST || MINIMAX_CN_API_HOST).replace(/\/$/, "")
		: getMiniMaxApiHost();
	return new MiniMaxSDK({
		apiKey,
		region,
		baseUrl: process.env.MINIMAX_BASE_URL || regionalHost,
	});
}

export const VOICE_TYPE_VALUES = ["all", "system", "voice_cloning"] as const;
export const SPEECH_EMOTION_VALUES = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"] as const;
export const AUDIO_FORMAT_VALUES = ["mp3", "pcm", "flac", "wav"] as const;
export const OUTPUT_MODE_VALUES = ["local", "url"] as const;
export const SAMPLE_RATE_VALUES = [8000, 16000, 22050, 24000, 32000, 44100] as const;
export const BITRATE_VALUES = [32000, 64000, 128000, 256000] as const;
export const CHANNEL_VALUES = [1, 2] as const;

const SpeechEmotionSchema = Type.Union(SPEECH_EMOTION_VALUES.map((value) => Type.Literal(value)));
const AudioFormatSchema = Type.Union(AUDIO_FORMAT_VALUES.map((value) => Type.Literal(value)));
const OutputModeSchema = Type.Union(OUTPUT_MODE_VALUES.map((value) => Type.Literal(value)));
const SampleRateSchema = Type.Union(SAMPLE_RATE_VALUES.map((value) => Type.Literal(value)));
const BitrateSchema = Type.Union(BITRATE_VALUES.map((value) => Type.Literal(value)));
const ChannelSchema = Type.Union(CHANNEL_VALUES.map((value) => Type.Literal(value)));

type SpeechEmotion = typeof SPEECH_EMOTION_VALUES[number];
type AudioFormat = typeof AUDIO_FORMAT_VALUES[number];
type OutputMode = typeof OUTPUT_MODE_VALUES[number];

const DEFAULT_VOICE_ID = "female-shaonv";
const DEFAULT_SPEECH_MODEL = "speech-2.8-hd";
const DEFAULT_SPEED = 1.0;
const DEFAULT_VOLUME = 1.0;
const DEFAULT_PITCH = 0;
const DEFAULT_EMOTION: SpeechEmotion = "neutral";
const DEFAULT_SAMPLE_RATE = 32000;
const DEFAULT_BITRATE = 128000;
const DEFAULT_CHANNEL = 1;
const DEFAULT_FORMAT: AudioFormat = "mp3";
const DEFAULT_LANGUAGE_BOOST = "auto";
const DEFAULT_OUTPUT_MODE: OutputMode = "local";
const MAX_SYNC_TTS_CHARS = 10000;

export interface SpeechOptions {
	text: string;
	output_path?: string;
	voice_id: string;
	model: string;
	speed: number;
	volume: number;
	pitch: number;
	emotion: SpeechEmotion;
	sample_rate: number;
	bitrate: number;
	channel: number;
	format: AudioFormat;
	language_boost: string;
	output_mode: OutputMode;
	allow_overwrite: boolean;
}

function assertNonEmpty(value: string | undefined, name: string): string {
	if (!value || value.trim() === "") {
		throw new Error(`${name} is required.`);
	}
	return value;
}

function assertInRange(value: number, min: number, max: number, name: string): void {
	if (!Number.isFinite(value) || value < min || value > max) {
		throw new Error(`${name} must be between ${min} and ${max}.`);
	}
}

export function resolveSpeechOptions(input: Partial<SpeechOptions> & { text: string }): SpeechOptions {
	const text = assertNonEmpty(input.text, "Text");
	if (text.length > MAX_SYNC_TTS_CHARS) {
		throw new Error(`Text exceeds the synchronous MiniMax text-to-speech limit of ${MAX_SYNC_TTS_CHARS} characters.`);
	}

	const options: SpeechOptions = {
		text,
		output_path: input.output_path,
		voice_id: input.voice_id || DEFAULT_VOICE_ID,
		model: input.model || DEFAULT_SPEECH_MODEL,
		speed: input.speed ?? DEFAULT_SPEED,
		volume: input.volume ?? DEFAULT_VOLUME,
		pitch: input.pitch ?? DEFAULT_PITCH,
		emotion: input.emotion || DEFAULT_EMOTION,
		sample_rate: input.sample_rate ?? DEFAULT_SAMPLE_RATE,
		bitrate: input.bitrate ?? DEFAULT_BITRATE,
		channel: input.channel ?? DEFAULT_CHANNEL,
		format: input.format || DEFAULT_FORMAT,
		language_boost: input.language_boost || DEFAULT_LANGUAGE_BOOST,
		output_mode: input.output_mode || DEFAULT_OUTPUT_MODE,
		allow_overwrite: input.allow_overwrite ?? false,
	};

	assertInRange(options.speed, 0.5, 2, "Speed");
	assertInRange(options.volume, 0, 10, "Volume");
	assertInRange(options.pitch, -12, 12, "Pitch");
	if (!SPEECH_EMOTION_VALUES.includes(options.emotion)) throw new Error(`Emotion must be one of: ${SPEECH_EMOTION_VALUES.join(", ")}.`);
	if (!SAMPLE_RATE_VALUES.includes(options.sample_rate as typeof SAMPLE_RATE_VALUES[number])) throw new Error(`Sample rate must be one of: ${SAMPLE_RATE_VALUES.join(", ")}.`);
	if (!BITRATE_VALUES.includes(options.bitrate as typeof BITRATE_VALUES[number])) throw new Error(`Bitrate must be one of: ${BITRATE_VALUES.join(", ")}.`);
	if (!CHANNEL_VALUES.includes(options.channel as typeof CHANNEL_VALUES[number])) throw new Error(`Channel must be one of: ${CHANNEL_VALUES.join(", ")}.`);
	if (!AUDIO_FORMAT_VALUES.includes(options.format)) throw new Error(`Format must be one of: ${AUDIO_FORMAT_VALUES.join(", ")}.`);
	if (!OUTPUT_MODE_VALUES.includes(options.output_mode)) throw new Error(`Output mode must be one of: ${OUTPUT_MODE_VALUES.join(", ")}.`);

	return options;
}

export function buildTextToAudioPayload(options: SpeechOptions): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		model: options.model,
		text: options.text,
		voice_setting: {
			voice_id: options.voice_id,
			speed: options.speed,
			vol: options.volume,
			pitch: options.pitch,
			emotion: options.emotion,
		},
		audio_setting: {
			sample_rate: options.sample_rate,
			bitrate: options.bitrate,
			format: options.format,
			channel: options.channel,
		},
		language_boost: options.language_boost,
	};
	if (options.output_mode === "url") {
		payload.output_format = "url";
	}
	return payload;
}

export function getImageMimeType(pathOrUrl: string, contentType?: string | null): string {
	const normalizedContentType = contentType?.toLowerCase() || "";
	if (normalizedContentType.includes("png")) return "image/png";
	if (normalizedContentType.includes("webp")) return "image/webp";
	if (normalizedContentType.includes("jpeg") || normalizedContentType.includes("jpg")) return "image/jpeg";

	const lower = pathOrUrl.toLowerCase();
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	return "image/jpeg";
}

export async function imageSourceToDataUrl(imageSource: string, cwd: string, signal?: AbortSignal): Promise<string> {
	let source = assertNonEmpty(imageSource, "Image source");
	source = source.startsWith("@") ? source.slice(1) : source;
	if (source.startsWith("data:")) return source;

	if (source.startsWith("http://") || source.startsWith("https://")) {
		const response = await fetch(source, { signal });
		if (!response.ok) {
			throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		const mimeType = getImageMimeType(source, response.headers.get("content-type"));
		return `data:${mimeType};base64,${buffer.toString("base64")}`;
	}

	source = resolve(cwd, source);
	const buffer = await readFile(source);
	const mimeType = getImageMimeType(source);
	return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function callMiniMaxJson(
	endpoint: string,
	payload: Record<string, unknown>,
	apiKey: string,
	signal?: AbortSignal,
): Promise<Record<string, unknown>> {
	const response = await fetch(`${getMiniMaxApiHost()}${endpoint}`, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"MM-API-Source": MINIMAX_API_SOURCE,
		},
		body: JSON.stringify(payload),
		signal,
	});

	const text = await response.text();
	let data: Record<string, unknown>;
	try {
		data = text ? JSON.parse(text) as Record<string, unknown> : {};
	} catch {
		throw new Error(`MiniMax API returned malformed JSON: ${text}`);
	}

	if (!response.ok) {
		throw new Error(`MiniMax API error: ${response.status} ${text}`);
	}

	const baseResp = data.base_resp as { status_code?: number; status_msg?: string } | undefined;
	if (baseResp && baseResp.status_code !== undefined && baseResp.status_code !== 0) {
		throw new Error(`MiniMax API error: ${baseResp.status_code} ${baseResp.status_msg || ""}`.trim());
	}

	return data;
}

function createAudioFileName(text: string, format: AudioFormat): string {
	const now = new Date();
	const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
	const hash = createHash("sha1").update(text).digest("hex").slice(0, 6);
	return `minimax-t2a-${stamp}-${hash}.${format}`;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export async function resolveAudioOutputPath(options: Pick<SpeechOptions, "output_path" | "format" | "text">, cwd: string): Promise<string> {
	const base = process.env.MINIMAX_MCP_BASE_PATH || cwd;
	const requested = options.output_path ? resolve(cwd, options.output_path) : resolve(base, createAudioFileName(options.text, options.format));
	if (!options.output_path) return requested;

	if (await pathExists(requested)) {
		const stats = await stat(requested);
		if (stats.isDirectory()) {
			return resolve(requested, createAudioFileName(options.text, options.format));
		}
		return requested;
	}

	const extension = extname(requested).toLowerCase();
	if (extension) return requested;
	return resolve(requested, createAudioFileName(options.text, options.format));
}

export async function writeMiniMaxAudioFile(args: {
	hexAudio: string;
	outputPath?: string;
	cwd: string;
	format: AudioFormat;
	text: string;
	allowOverwrite?: boolean;
}): Promise<string> {
	if (!args.hexAudio) throw new Error("No audio data returned from MiniMax.");
	const outputPath = await resolveAudioOutputPath({ output_path: args.outputPath, format: args.format, text: args.text }, args.cwd);
	if (!args.allowOverwrite && await pathExists(outputPath)) {
		throw new Error(`Refusing to overwrite existing audio file: ${outputPath}`);
	}
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, Buffer.from(args.hexAudio, "hex"));
	return outputPath;
}

export function formatVoiceList(data: Record<string, unknown>): string {
	const systemVoices = Array.isArray(data.system_voice) ? data.system_voice as Array<Record<string, unknown>> : [];
	const clonedVoices = Array.isArray(data.voice_cloning) ? data.voice_cloning as Array<Record<string, unknown>> : [];
	const renderVoice = (voice: Record<string, unknown>) => {
		const name = typeof voice.voice_name === "string" ? voice.voice_name : "Unnamed";
		const id = typeof voice.voice_id === "string" ? voice.voice_id : "unknown";
		return `- ${name}: ${id}`;
	};
	const sections = [
		`System Voices:\n${systemVoices.length ? systemVoices.map(renderVoice).join("\n") : "- None returned"}`,
		`Voice Cloning Voices:\n${clonedVoices.length ? clonedVoices.map(renderVoice).join("\n") : "- None returned"}`,
	];
	return sections.join("\n\n");
}


// =============================================================================
// Extension Entry Point
// =============================================================================

/**
 * Pi extension entry point.
 * Registers the MiniMax provider with all M2 series models.
 */
export type MiniMaxSdkFactory = (options?: SimpleStreamOptions) => Promise<MiniMaxSDK>;

export default function (pi: ExtensionAPI, sdkFactory: MiniMaxSdkFactory = createMiniMaxToolsSdk) {
	const getToolsSdk = async (ctx?: { modelRegistry?: { getApiKeyForProvider(provider: string): Promise<string | undefined> } }) => {
		const provider = getMiniMaxToolRegion() === "cn" ? "minimax-cn" : "minimax";
		const apiKey = await ctx?.modelRegistry?.getApiKeyForProvider(provider);
		return sdkFactory(apiKey ? { apiKey } : undefined);
	};
	pi.registerTool({
		name: "minimax_web_search",
		label: "MiniMax Web Search",
		description: "Search the web using the official MiniMax Token Plan SDK.",
		parameters: Type.Object({ query: Type.String({ description: "Concise search query." }) }),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const data = await (await getToolsSdk(ctx)).search.query(assertNonEmpty(params.query, "Query"));
			return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], details: data };
		},
	});

	pi.registerTool({
		name: "minimax_understand_image",
		label: "MiniMax Understand Image",
		description: "Analyze an image using the official MiniMax Token Plan SDK.",
		parameters: Type.Object({
			prompt: Type.String({ description: "Question or analysis request." }),
			image_source: Type.String({ description: "Image URL, data URL, absolute path, or cwd-relative path." }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const image = await imageSourceToDataUrl(params.image_source, ctx.cwd, signal);
			const data = await (await getToolsSdk(ctx)).vision.describe({ image, prompt: assertNonEmpty(params.prompt, "Prompt") });
			return { content: [{ type: "text", text: data.content }], details: data };
		},
	});

	pi.registerTool({
		name: "minimax_list_voices",
		label: "MiniMax List Voices",
		description: "List MiniMax Token Plan speech voices.",
		parameters: Type.Object({ language: Type.Optional(Type.String({ description: "Optional language filter such as en or zh." })) }),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const voices = await (await getToolsSdk(ctx)).speech.voices(params.language);
			const text = voices.length
				? voices.map((voice) => `- ${voice.voice_name}: ${voice.voice_id}${voice.description?.length ? ` — ${voice.description.join(", ")}` : ""}`).join("\n")
				: "No voices returned.";
			return { content: [{ type: "text", text }], details: { voices } };
		},
	});

	pi.registerTool({
		name: "minimax_text_to_audio",
		label: "MiniMax Text to Audio",
		description: "Generate speech with the official MiniMax Token Plan SDK.",
		parameters: Type.Object({
			text: Type.String(), output_path: Type.Optional(Type.String()), voice_id: Type.Optional(Type.String()), model: Type.Optional(Type.String()),
			speed: Type.Optional(Type.Number({ minimum: 0.5, maximum: 2 })), volume: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
			pitch: Type.Optional(Type.Integer({ minimum: -12, maximum: 12 })), emotion: Type.Optional(SpeechEmotionSchema),
			sample_rate: Type.Optional(SampleRateSchema), bitrate: Type.Optional(BitrateSchema), channel: Type.Optional(ChannelSchema),
			format: Type.Optional(AudioFormatSchema), language_boost: Type.Optional(Type.String()), output_mode: Type.Optional(OutputModeSchema),
			allow_overwrite: Type.Optional(Type.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const options = resolveSpeechOptions(params as unknown as Partial<SpeechOptions> & { text: string });
			const sdk = await getToolsSdk(ctx);
			const data = await sdk.speech.synthesize({
				model: options.model, text: options.text,
				voice_setting: { voice_id: options.voice_id, speed: options.speed, vol: options.volume, pitch: options.pitch },
				audio_setting: { format: options.format, sample_rate: options.sample_rate, bitrate: options.bitrate, channel: options.channel },
				language_boost: options.language_boost, output_format: options.output_mode === "url" ? "url" : "hex",
			});
			const audio = data.data.audio_url || data.data.audio;
			if (!audio) throw new Error("No audio data returned from MiniMax.");
			if (options.output_mode === "url") {
				return { content: [{ type: "text", text: `Success. Audio URL: ${audio}` }], details: { mode: "url", url: audio, ...data.extra_info } };
			}
			const outputPath = await writeMiniMaxAudioFile({ hexAudio: audio, outputPath: options.output_path, cwd: ctx.cwd, format: options.format, text: options.text, allowOverwrite: options.allow_overwrite });
			return { content: [{ type: "text", text: `Success. Audio saved to: ${outputPath}` }], details: { mode: "local", path: outputPath, ...data.extra_info } };
		},
	});

	pi.registerTool({
		name: "minimax_generate_image",
		label: "MiniMax Generate Image",
		description: "Generate images using the official MiniMax Token Plan SDK.",
		parameters: Type.Object({
			prompt: Type.String(), model: Type.Optional(Type.String()), aspect_ratio: Type.Optional(Type.String()),
			n: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 })), seed: Type.Optional(Type.Integer()),
			width: Type.Optional(Type.Integer()), height: Type.Optional(Type.Integer()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const data = await (await getToolsSdk(ctx)).image.generate({ model: params.model, prompt: assertNonEmpty(params.prompt, "Prompt"), aspect_ratio: params.aspect_ratio, n: params.n, seed: params.seed, width: params.width, height: params.height, response_format: "url" });
			const urls = data.data.image_urls || [];
			return { content: [{ type: "text", text: urls.length ? urls.join("\n") : JSON.stringify(data, null, 2) }], details: data };
		},
	});

	pi.registerTool({
		name: "minimax_video",
		label: "MiniMax Video",
		description: "Generate, inspect, or download MiniMax videos with the official Token Plan SDK.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("generate"), Type.Literal("status"), Type.Literal("download")]),
			prompt: Type.Optional(Type.String()), model: Type.Optional(Type.String()), task_id: Type.Optional(Type.String()),
			file_id: Type.Optional(Type.String()), output_path: Type.Optional(Type.String()), wait: Type.Optional(Type.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const sdk = await getToolsSdk(ctx);
			if (params.action === "generate") {
				const prompt = assertNonEmpty(params.prompt, "Prompt");
				const data = params.wait
					? await sdk.video.generate({ model: params.model, prompt })
					: await sdk.video.generate({ model: params.model, prompt, async: true });
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], details: data };
			}
			if (params.action === "status") {
				const data = await sdk.video.getTask({ taskId: assertNonEmpty(params.task_id, "Task ID") });
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], details: data };
			}
			const fileId = assertNonEmpty(params.file_id, "File ID");
			const outputPath = resolve(ctx.cwd, params.output_path || `minimax-video-${fileId}.mp4`);
			if (await pathExists(outputPath)) throw new Error(`Refusing to overwrite existing video file: ${outputPath}`);
			const data = await sdk.video.download({ fileId, outPath: outputPath });
			return { content: [{ type: "text", text: `Video saved to: ${data.save}` }], details: data };
		},
	});

	pi.registerTool({
		name: "minimax_generate_music",
		label: "MiniMax Generate Music",
		description: "Generate music using the official MiniMax Token Plan SDK.",
		parameters: Type.Object({
			prompt: Type.String(), lyrics: Type.Optional(Type.String()), model: Type.Optional(Type.String()), instrumental: Type.Optional(Type.Boolean()),
			output_mode: Type.Optional(OutputModeSchema), output_path: Type.Optional(Type.String()), format: Type.Optional(AudioFormatSchema), allow_overwrite: Type.Optional(Type.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const outputMode = (params.output_mode || "url") as OutputMode;
			const format = (params.format || "mp3") as AudioFormat;
			const data = await (await getToolsSdk(ctx)).music.generate({ model: params.model, prompt: assertNonEmpty(params.prompt, "Prompt"), lyrics: params.lyrics, instrumental: params.instrumental, output_format: outputMode === "url" ? "url" : "hex", audio_setting: { format } });
			const audio = data.data.audio_url || data.data.audio;
			if (!audio) throw new Error("No music audio returned from MiniMax.");
			if (outputMode === "url") return { content: [{ type: "text", text: `Music URL: ${audio}` }], details: data };
			const path = await writeMiniMaxAudioFile({ hexAudio: audio, outputPath: params.output_path, cwd: ctx.cwd, format, text: params.prompt, allowOverwrite: params.allow_overwrite });
			return { content: [{ type: "text", text: `Music saved to: ${path}` }], details: { ...data, path } };
		},
	});

	pi.registerTool({
		name: "minimax_quota",
		label: "MiniMax Quota",
		description: "Show MiniMax Token Plan quota and usage.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const data = await (await getToolsSdk(ctx)).quota.info();
			return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], details: data };
		},
	});

	const api = anthropicMessagesApi();
	const models = () => MODELS.map((m) => {
		// M3 supports adaptive thinking; M2 series are budget-based. The SDK's
		// Anthropic implementation handles both when this compatibility flag is set.
		const compat = m.id === "MiniMax-M3" ? { forceAdaptiveThinking: true } : undefined;
		return {
			id: m.id,
			name: m.name,
			reasoning: m.reasoning,
			input: m.input,
			cost: m.cost,
			contextWindow: m.contextWindow,
			maxTokens: m.maxTokens,
			...(compat ? { compat } : {}),
		};
	});

	// Intentionally replace Pi's built-in catalogs so newly released MiniMax
	// models can be shipped by this extension without waiting for a Pi release.
	pi.registerProvider("minimax", {
		baseUrl: getMiniMaxApiBase(),
		apiKey: "$MINIMAX_API_KEY",
		api: "anthropic-messages",
		streamSimple: api.streamSimple,
		models: models(),
	});

	pi.registerProvider("minimax-cn", {
		name: "MiniMax CN",
		baseUrl: getMiniMaxCnApiBase(),
		apiKey: "$MINIMAX_CN_API_KEY",
		api: "anthropic-messages",
		streamSimple: api.streamSimple,
		models: models(),
	});
}
