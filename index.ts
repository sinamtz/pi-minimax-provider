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
	StringEnum,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/compat";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, resolve } from "node:path";

// =============================================================================
// Constants
// =============================================================================

const MINIMAX_API_HOST = "https://api.minimax.io";
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
		cost: { input: 0.60, output: 2.40, cacheRead: 0.12, cacheWrite: 0 },
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

/**
 * Get the MiniMax API key for native tools.  Priority:
 * 1. `options.apiKey` — SDK pre-resolved key (covers runtime overrides, login,
 *    and provider-scoped env)
 * 2. `process.env.MINIMAX_API_KEY` — ambient env fallback
 */
export async function getRequiredMiniMaxApiKey(options?: SimpleStreamOptions): Promise<string> {
	const apiKey = options?.apiKey ?? process.env.MINIMAX_API_KEY ?? "";
	if (!apiKey) {
		throw new Error("MiniMax API key is required. Use /login for the minimax provider or set MINIMAX_API_KEY.");
	}
	return apiKey;
}

export const VOICE_TYPE_VALUES = ["all", "system", "voice_cloning"] as const;
export const SPEECH_EMOTION_VALUES = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"] as const;
export const AUDIO_FORMAT_VALUES = ["mp3", "pcm", "flac", "wav"] as const;
export const OUTPUT_MODE_VALUES = ["local", "url"] as const;
export const SAMPLE_RATE_VALUES = [8000, 16000, 22050, 24000, 32000, 44100] as const;
export const BITRATE_VALUES = [32000, 64000, 128000, 256000] as const;
export const CHANNEL_VALUES = [1, 2] as const;

const VoiceTypeSchema = StringEnum(VOICE_TYPE_VALUES);
const SpeechEmotionSchema = StringEnum(SPEECH_EMOTION_VALUES);
const AudioFormatSchema = StringEnum(AUDIO_FORMAT_VALUES);
const OutputModeSchema = StringEnum(OUTPUT_MODE_VALUES);
const SampleRateSchema = Type.Union(SAMPLE_RATE_VALUES.map((value) => Type.Literal(value)));
const BitrateSchema = Type.Union(BITRATE_VALUES.map((value) => Type.Literal(value)));
const ChannelSchema = Type.Union(CHANNEL_VALUES.map((value) => Type.Literal(value)));

type VoiceType = typeof VOICE_TYPE_VALUES[number];
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
export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "minimax_web_search",
		label: "MiniMax Web Search",
		description: "Search the web using MiniMax's Token/Coding Plan web search endpoint.",
		promptSnippet: "Search the web via MiniMax Token/Coding Plan when current external information is needed",
		promptGuidelines: [
			"Use minimax_web_search when the user specifically asks to use MiniMax search or when MiniMax Token/Coding Plan search is preferred for current external information.",
			"For minimax_web_search, use concise 3-5 keyword queries and include dates for time-sensitive topics.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query. Aim for 3-5 keywords for best results." }),
		}),
		async execute(_toolCallId, params, signal) {
			const query = assertNonEmpty(params.query, "Query");
			const data = await callMiniMaxJson(
				"/v1/coding_plan/search",
				{ q: query },
				await getRequiredMiniMaxApiKey(),
				signal,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
				details: data,
			};
		},
	});

	pi.registerTool({
		name: "minimax_understand_image",
		label: "MiniMax Understand Image",
		description: "Analyze a JPEG, PNG, or WebP image using MiniMax's Token/Coding Plan image understanding endpoint.",
		promptSnippet: "Analyze images via MiniMax Token/Coding Plan from a URL or local file path",
		promptGuidelines: [
			"Use minimax_understand_image when the user specifically asks to use MiniMax vision or when MiniMax image understanding is preferred.",
			"For minimax_understand_image, strip a leading @ from local image paths and provide a task-specific prompt describing what to inspect or extract.",
		],
		parameters: Type.Object({
			prompt: Type.String({ description: "Question or analysis request for the image." }),
			image_source: Type.String({ description: "HTTP/HTTPS URL, data URL, absolute path, or path relative to the current working directory. JPEG, PNG, and WebP are supported." }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const prompt = assertNonEmpty(params.prompt, "Prompt");
			const imageUrl = await imageSourceToDataUrl(params.image_source, ctx.cwd, signal);
			const data = await callMiniMaxJson(
				"/v1/coding_plan/vlm",
				{ prompt, image_url: imageUrl },
				await getRequiredMiniMaxApiKey(),
				signal,
			);
			if (typeof data.content !== "string" || !data.content) {
				throw new Error("No image analysis content returned from MiniMax.");
			}
			return {
				content: [{ type: "text", text: data.content }],
				details: data,
			};
		},
	});

	pi.registerTool({
		name: "minimax_list_voices",
		label: "MiniMax List Voices",
		description: "List MiniMax system and cloned voices available to the configured account.",
		promptSnippet: "List MiniMax speech voices before text-to-speech when voice choice matters",
		promptGuidelines: [
			"Use minimax_list_voices before minimax_text_to_audio if the user asks what voices are available or voice choice matters.",
			"Do not call minimax_list_voices repeatedly unless the user asks to refresh available voices.",
		],
		parameters: Type.Object({
			voice_type: Type.Optional(VoiceTypeSchema),
		}),
		async execute(_toolCallId, params, signal) {
			const voiceType = (params.voice_type || "all") as VoiceType;
			if (!VOICE_TYPE_VALUES.includes(voiceType)) {
				throw new Error(`Voice type must be one of: ${VOICE_TYPE_VALUES.join(", ")}.`);
			}
			const data = await callMiniMaxJson(
				"/v1/get_voice",
				{ voice_type: voiceType },
				await getRequiredMiniMaxApiKey(),
				signal,
			);
			return {
				content: [{ type: "text", text: formatVoiceList(data) }],
				details: data,
			};
		},
	});

	pi.registerTool({
		name: "minimax_text_to_audio",
		label: "MiniMax Text to Audio",
		description: "Generate speech audio from text using MiniMax voices. This may incur MiniMax usage costs.",
		promptSnippet: "Generate MiniMax speech audio from text only when the user explicitly requests audio output",
		promptGuidelines: [
			"Use minimax_text_to_audio only when the user explicitly requests speech or audio generation; this tool may incur MiniMax costs.",
			"Use minimax_list_voices first if the user needs to choose a voice before generating speech.",
			"For minimax_text_to_audio local output, do not overwrite existing files unless the user explicitly requests replacement.",
		],
		parameters: Type.Object({
			text: Type.String({ description: "Text to synthesize." }),
			output_path: Type.Optional(Type.String({ description: "Optional local output file or directory." })),
			voice_id: Type.Optional(Type.String({ description: "MiniMax voice identifier." })),
			model: Type.Optional(Type.String({ description: "MiniMax speech model." })),
			speed: Type.Optional(Type.Number({ minimum: 0.5, maximum: 2 })),
			volume: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
			pitch: Type.Optional(Type.Integer({ minimum: -12, maximum: 12 })),
			emotion: Type.Optional(SpeechEmotionSchema),
			sample_rate: Type.Optional(SampleRateSchema),
			bitrate: Type.Optional(BitrateSchema),
			channel: Type.Optional(ChannelSchema),
			format: Type.Optional(AudioFormatSchema),
			language_boost: Type.Optional(Type.String()),
			output_mode: Type.Optional(OutputModeSchema),
			allow_overwrite: Type.Optional(Type.Boolean({ description: "Whether an existing local output file may be replaced. Defaults to false." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const options = resolveSpeechOptions(params as Partial<SpeechOptions> & { text: string });
			const data = await callMiniMaxJson(
				"/v1/t2a_v2",
				buildTextToAudioPayload(options),
				await getRequiredMiniMaxApiKey(),
				signal,
			);
			const audio = (data.data as { audio?: unknown } | undefined)?.audio;
			if (typeof audio !== "string" || !audio) {
				throw new Error("No audio data returned from MiniMax.");
			}

			if (options.output_mode === "url") {
				return {
					content: [{ type: "text", text: `Success. Audio URL: ${audio}\nVoice used: ${options.voice_id}\nModel: ${options.model}` }],
					details: { mode: "url", path: null, url: audio, voice_id: options.voice_id, model: options.model, format: options.format, extra_info: data.extra_info || {} },
				};
			}

			const outputPath = await writeMiniMaxAudioFile({
				hexAudio: audio,
				outputPath: options.output_path,
				cwd: ctx.cwd,
				format: options.format,
				text: options.text,
				allowOverwrite: options.allow_overwrite,
			});
			return {
				content: [{ type: "text", text: `Success. Audio saved to: ${outputPath}\nVoice used: ${options.voice_id}\nModel: ${options.model}\nFormat: ${options.format}` }],
				details: { mode: "local", path: outputPath, url: null, voice_id: options.voice_id, model: options.model, format: options.format, extra_info: data.extra_info || {} },
			};
		},
	});

	pi.registerProvider("minimax", {
		baseUrl: getMiniMaxApiBase(),
		// Use the SDK's standard env-interpolation syntax.  Without "$", the SDK
		// would treat the string as a literal API key and send "MINIMAX_API_KEY"
		// as the Bearer token.
		apiKey: "$MINIMAX_API_KEY",
		api: "anthropic-messages",
		streamSimple: anthropicMessagesApi().streamSimple,
		models: MODELS.map((m) => {
			// M3 supports adaptive thinking; M2 series are budget-based.  The
			// SDK's anthropicMessagesApi handles both modes transparently when
			// compat.forceAdaptiveThinking is set on the model.
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
		}),
	});
}
