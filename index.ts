/**
 * Pi MiniMax Provider Extension
 *
 * Provides access to MiniMax AI models through their Anthropic-compatible API.
 * Uses the built-in Anthropic streaming implementation for compatibility.
 *
 * Usage:
 *   pi -e ./pi-provider-minimax
 *   # Then set MINIMAX_API_KEY=your-api-key
 *
 * Or with environment variable:
 *   MINIMAX_API_KEY=your-api-key pi -e ./pi-provider-minimax
 */

import {
	type Api,
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
	streamSimpleAnthropic,
} from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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

const MODEL_MAP = new Map(MODELS.map((m) => [m.id, m]));

// =============================================================================
// Stream Function
// =============================================================================

export function streamMiniMax(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	// Use the Anthropic-compatible streaming implementation
	const modelWithBaseUrl = {
		...model,
		baseUrl: MINIMAX_API_BASE,
	};

	return streamSimpleAnthropic(modelWithBaseUrl as Model<"anthropic-messages">, context, {
		...options,
		apiKey: "MINIMAX_API_KEY",
	});
}

// =============================================================================
// Extension Entry Point
// =============================================================================

export default function (pi: ExtensionAPI) {
	pi.registerProvider("minimax", {
		baseUrl: MINIMAX_API_BASE,
		apiKey: "MINIMAX_API_KEY",
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
	});
}
