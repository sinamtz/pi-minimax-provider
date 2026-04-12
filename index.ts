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
	createAssistantMessageEventStream,
	calculateCost,
	type Api,
	type AssistantMessage,
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
	type StopReason,
	type TextContent,
	type ThinkingContent,
	type ToolCall,
} from "@mariozechner/pi-ai";
import { AuthStorage, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";

// =============================================================================
// Constants
// =============================================================================

const MINIMAX_API_BASE = "https://api.minimax.io/anthropic";

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
	// MiniMax M2.7 Series
	{
		id: "MiniMax-M2.7",
		name: "MiniMax M2.7",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.77, output: 3.08, cacheRead: 0.077, cacheWrite: 0.96 },
		contextWindow: 204800,
		maxTokens: 16384,
		description: "Beginning the journey of recursive self-improvement (~60 tps)",
		speed: "standard",
	},
	{
		id: "MiniMax-M2.7-highspeed",
		name: "MiniMax M2.7 (Highspeed)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.77, output: 3.08, cacheRead: 0.077, cacheWrite: 0.96 },
		contextWindow: 204800,
		maxTokens: 16384,
		description: "M2.7 Highspeed: Same performance, faster (~100 tps)",
		speed: "highspeed",
	},
	// MiniMax M2.5 Series
	{
		id: "MiniMax-M2.5",
		name: "MiniMax M2.5",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.5, output: 2.0, cacheRead: 0.05, cacheWrite: 0.625 },
		contextWindow: 204800,
		maxTokens: 16384,
		description: "Peak Performance. Ultimate Value. Master the Complex (~60 tps)",
		speed: "standard",
	},
	{
		id: "MiniMax-M2.5-highspeed",
		name: "MiniMax M2.5 (Highspeed)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.5, output: 2.0, cacheRead: 0.05, cacheWrite: 0.625 },
		contextWindow: 204800,
		maxTokens: 16384,
		description: "M2.5 Highspeed: Same performance, faster (~100 tps)",
		speed: "highspeed",
	},
	// MiniMax M2.1 Series
	{
		id: "MiniMax-M2.1",
		name: "MiniMax M2.1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.2, output: 0.8, cacheRead: 0.02, cacheWrite: 0.25 },
		contextWindow: 204800,
		maxTokens: 16384,
		description: "Powerful Multi-Language Programming Capabilities (~60 tps)",
		speed: "standard",
	},
	{
		id: "MiniMax-M2.1-highspeed",
		name: "MiniMax M2.1 (Highspeed)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0.2, output: 0.8, cacheRead: 0.02, cacheWrite: 0.25 },
		contextWindow: 204800,
		maxTokens: 16384,
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
		maxTokens: 16384,
		description: "Agentic capabilities, Advanced reasoning",
		speed: "standard",
	},
];

// =============================================================================
// API Key Resolution
// =============================================================================

/**
 * Get the MiniMax API key using SDK's priority chain:
 * 1. Pre-resolved API key from options (SDK AuthStorage)
 * 2. Direct AuthStorage lookup (auth.json)
 * 3. Environment variable fallback
 */
export function cleanApiKey(apiKey: string): string {
	// Strip oauth: prefix if present (SDK stores OAuth tokens as "oauth:sk-...")
	if (apiKey.startsWith("oauth:")) {
		return apiKey.slice(6);
	}
	return apiKey;
}

async function getMiniMaxApiKey(options?: SimpleStreamOptions): Promise<string> {
	let apiKey = "";

	// 1. Use SDK pre-resolved API key if available
	if (options?.apiKey) {
		apiKey = options.apiKey;
	} else {
		// 2. Fall back to AuthStorage reading from auth.json
		// Priority: runtime overrides > auth.json > environment variables
		try {
			const authStorage = AuthStorage.create();
			apiKey = await authStorage.getApiKey("minimax") || "";
		} catch {
			// AuthStorage not available or auth.json not found, continue to env fallback
		}

		// 3. Last resort: environment variable
		if (!apiKey) {
			apiKey = process.env.MINIMAX_API_KEY || "";
		}
	}

	// 4. Clean OAuth prefix from token (e.g., "oauth:sk-..." -> "sk-...")
	return cleanApiKey(apiKey);
}

function mapStopReason(reason: string | undefined): StopReason {
	switch (reason) {
		case "end_turn":
		case "stop_sequence":
			return "stop";
		case "max_tokens":
			return "length";
		case "tool_use":
			return "toolUse";
		default:
			return "stop";
	}
}

/**
 * Stream handler for MiniMax models.
 * Custom implementation with Bearer token authentication.
 */
export function streamMiniMax(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			// Build messages for MiniMax
			const messages: Array<{ role: string; content: string | unknown[] }> = [];

			// Add system prompt
			if (context.systemPrompt) {
				messages.push({
					role: "system",
					content: context.systemPrompt,
				});
			}

			// Convert context messages
			for (const msg of context.messages) {
				if (msg.role === "user") {
					if (typeof msg.content === "string") {
						messages.push({ role: "user", content: msg.content });
					} else {
						const content = msg.content.map((block) => {
							if (block.type === "text") {
								return { type: "text", text: block.text };
							} else if (block.type === "image") {
								return {
									type: "image",
									source: {
										type: "base64",
										media_type: block.mimeType,
										data: block.data,
									},
								};
							}
							return null;
						}).filter(Boolean);
						messages.push({ role: "user", content: content as unknown[] });
					}
				} else if (msg.role === "assistant") {
					const content: unknown[] = [];
					for (const block of msg.content) {
						if (block.type === "text" && block.text.trim()) {
							content.push({ type: "text", text: block.text });
						} else if (block.type === "thinking" && block.thinking.trim()) {
							content.push({
								type: "thinking",
								thinking: block.thinking,
								signature: (block as ThinkingContent).thinkingSignature || "",
							});
						} else if (block.type === "toolCall") {
							content.push({
								type: "tool_use",
								id: block.id,
								name: block.name,
								input: block.arguments,
							});
						}
					}
					if (content.length > 0) {
						messages.push({ role: "assistant", content });
					}
				} else if (msg.role === "toolResult") {
					const content = msg.content.map((block) => {
						if (block.type === "text") {
							return { type: "text", text: block.text };
						} else if (block.type === "image") {
							return {
								type: "image",
								source: {
									type: "base64",
									media_type: block.mimeType,
									data: block.data,
								},
							};
						}
						return null;
					}).filter(Boolean);

					messages.push({
						role: "user",
						content: [{
							type: "tool_result",
							tool_use_id: msg.toolCallId,
							content: content.length > 0 ? content : [{ type: "text", text: "" }],
							is_error: msg.isError,
						}],
					});
				}
			}

			// Build tools
			const tools = context.tools?.map((tool) => ({
				name: tool.name,
				description: tool.description,
				input_schema: {
					type: "object",
					properties: (tool.parameters as Record<string, unknown>)?.properties || {},
					required: (tool.parameters as Record<string, unknown>)?.required || [],
				},
			}));

			// Build request body
			const body: Record<string, unknown> = {
				model: model.id,
				messages,
				max_tokens: options?.maxTokens || Math.floor(model.maxTokens / 2),
				stream: true,
			};

			if (tools && tools.length > 0) {
				body.tools = tools;
			}

			// Handle thinking/reasoning
			if (options?.reasoning && model.reasoning) {
				const defaultBudgets: Record<string, number> = {
					minimal: 1024,
					low: 4096,
					medium: 10240,
					high: 20480,
					xhigh: 32768,
				};
				const reasoning = options.reasoning as string;
				const customBudget = options.thinkingBudgets?.[reasoning as keyof typeof options.thinkingBudgets];
				body.thinking = {
					type: "enabled",
					budget_tokens: customBudget ?? defaultBudgets[reasoning] ?? 10240,
				};
			}

				// Get API key using SDK's priority chain (auth.json checked when env var not set)
			const apiKey = await getMiniMaxApiKey(options);
			const baseUrl = model.baseUrl || MINIMAX_API_BASE;
			const requestUrl = `${baseUrl}/v1/messages`;
			const requestHeaders = {
				"Authorization": `Bearer ${apiKey}`,
				"anthropic-version": "2023-06-01",
				"Content-Type": "application/json",
			};
			const requestBody = JSON.stringify(body);

			const response = await fetch(requestUrl, {
				method: "POST",
				headers: requestHeaders,
				body: requestBody,
				signal: options?.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`MiniMax API error: ${response.status} ${errorText}`);
			}

			if (!response.body) {
				throw new Error("No response body");
			}

			// Stream the response
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let currentEventType = "";

			stream.push({ type: "start", partial: output });

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("event: ")) {
						currentEventType = line.slice(7).trim();
					} else if (line.startsWith("data: ")) {
						const data = line.slice(6);
						if (data === "[DONE]") continue;

						try {
							const event = JSON.parse(data);
							const eventType = currentEventType || event.type;
							currentEventType = "";

							if (eventType === "message_start" || event.type === "message_start") {
								output.usage.input = event.message?.usage?.input_tokens || 0;
							} else if (eventType === "content_block_start") {
								if (event.content_block?.type === "text") {
									output.content.push({ type: "text", text: "" } as TextContent);
									stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });
								} else if (event.content_block?.type === "thinking") {
									output.content.push({ type: "thinking", thinking: "", thinkingSignature: "" } as ThinkingContent);
									stream.push({ type: "thinking_start", contentIndex: output.content.length - 1, partial: output });
								} else if (event.content_block?.type === "tool_use") {
									const toolCall: ToolCall = {
										type: "toolCall",
										id: event.content_block.id,
										name: event.content_block.name,
										arguments: {},
									};
									output.content.push(toolCall);
									stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });
								}
							} else if (eventType === "content_block_delta") {
								const idx = event.index ?? output.content.length - 1;
								const block = output.content[idx];

								if (event.delta?.type === "text_delta" && block?.type === "text") {
									(block as TextContent).text += event.delta.text;
									stream.push({ type: "text_delta", contentIndex: idx, delta: event.delta.text, partial: output });
								} else if (event.delta?.type === "thinking_delta" && block?.type === "thinking") {
									(block as ThinkingContent).thinking += event.delta.thinking;
									stream.push({ type: "thinking_delta", contentIndex: idx, delta: event.delta.thinking, partial: output });
								} else if (event.delta?.type === "input_json_delta" && block?.type === "toolCall") {
									const tcBlock = block as ToolCall & { partialJson?: string };
									tcBlock.partialJson = (tcBlock.partialJson || "") + event.delta.partial_json;
									try {
										tcBlock.arguments = JSON.parse(tcBlock.partialJson);
									} catch {
										// Keep partial JSON until complete
									}
									stream.push({ type: "toolcall_delta", contentIndex: idx, delta: event.delta.partial_json, partial: output });
								}
							} else if (eventType === "content_block_stop") {
								const idx = event.index ?? output.content.length - 1;
								const block = output.content[idx];
								if (block?.type === "toolCall") {
									const tcBlock = block as ToolCall & { partialJson?: string };
									delete tcBlock.partialJson;
								}
							} else if (eventType === "message_delta") {
								if (event.delta?.stop_reason) {
									output.stopReason = mapStopReason(event.delta.stop_reason);
								}
								if (event.usage) {
									output.usage.output = event.usage.output_tokens || 0;
									output.usage.totalTokens =
										output.usage.input + output.usage.output +
										(event.usage.cache_read_input_tokens || 0) + (event.usage.cache_creation_input_tokens || 0);
								}
							} else if (eventType === "message_stop") {
								output.usage.totalTokens = output.usage.input + output.usage.output;
							}
						} catch {
							// Skip malformed JSON
						}
					}
				}
			}

			calculateCost(model, output.usage);
			stream.push({
				type: "done",
				reason: output.stopReason as "stop" | "length" | "toolUse",
				message: output,
			});
			stream.end();
		} catch (error) {
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
}

// =============================================================================
// Extension Entry Point
// =============================================================================

/**
 * Pi extension entry point.
 * Registers the MiniMax provider with all M2 series models.
 */
export default function (pi: ExtensionAPI) {
	pi.registerProvider("minimax", {
		baseUrl: MINIMAX_API_BASE,
		apiKey: "MINIMAX_API_KEY",
		authHeader: true,
		api: "anthropic-messages",
		models: MODELS.map(({ id, name, reasoning, input, cost, contextWindow, maxTokens }) => ({
			id,
			name,
			reasoning,
			input,
			cost,
			contextWindow,
			maxTokens,
		})),
		streamSimple: streamMiniMax,
		oauth: {
			name: "MiniMax",
      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
				const apiKey = await callbacks.onPrompt({
					message: "Enter your MiniMax API key:",
				});
				if (!apiKey || apiKey.trim() === "") {
					throw new Error("API key is required");
				}
				return {
					// Store API key in access field (no refresh token for simple API key auth)
					access: apiKey.trim(),
					refresh: "",
					// Far future expiration (API keys don't expire unless user rotates them)
					expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
				};
			},
      async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
				// API keys don't expire, but this is called by the SDK periodically
				// Return credentials as-is if they're not expired
				if (credentials.expires > Date.now()) {
					return credentials;
				}
				// If expired, return empty to trigger re-login
				return { access: "", refresh: "", expires: 0 };
			},
      getApiKey(credentials: OAuthCredentials): string {
				return credentials.access;
			},
		},
	});
}
