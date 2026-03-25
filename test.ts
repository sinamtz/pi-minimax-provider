/**
 * Test script for MiniMax provider
 * 
 * Run with: npx tsx test.ts
 * Requires: MINIMAX_API_KEY environment variable
 */

import { MODELS, streamMiniMax } from "./index.js";

async function testStream() {
	const apiKey = process.env.MINIMAX_API_KEY;
	if (!apiKey) {
		console.error("Error: MINIMAX_API_KEY environment variable not set");
		process.exit(1);
	}

	console.log("Testing MiniMax Provider\n");
	console.log(`Found ${MODELS.length} models:\n`);

	for (const model of MODELS) {
		console.log(`- ${model.name} (${model.id})`);
		console.log(`  Context: ${model.contextWindow.toLocaleString()} tokens`);
		console.log(`  Speed: ${model.speed === "highspeed" ? "~100 tps" : "~60 tps"}`);
		console.log(`  Pricing: $${model.cost.input}/M input, $${model.cost.output}/M output\n`);
	}

	console.log("Testing streaming with MiniMax-M2.1...\n");

	const testModel = MODELS.find((m) => m.id === "MiniMax-M2.1");
	if (!testModel) {
		console.error("Test model not found");
		process.exit(1);
	}

	const model = {
		id: testModel.id,
		name: testModel.name,
		provider: "minimax",
		api: "anthropic-messages" as const,
		baseUrl: "https://api.minimax.io/anthropic",
		reasoning: testModel.reasoning,
		input: testModel.input,
		cost: testModel.cost,
		contextWindow: testModel.contextWindow,
		maxTokens: testModel.maxTokens,
	};

	const context = {
		messages: [
			{ role: "user" as const, content: [{ type: "text" as const, text: "Say 'Hello from MiniMax!' in exactly those words." }] },
		],
		systemPrompt: "You are a helpful assistant.",
	};

	const stream = streamMiniMax(model, context, { apiKey });

	for await (const event of stream) {
		if (event.type === "content_block_start") {
			if (event.content_block.type === "text") {
				process.stdout.write("\nAssistant: ");
			}
		} else if (event.type === "content_block_delta") {
			if (event.delta.type === "text_delta") {
				process.stdout.write(event.delta.text);
			}
		} else if (event.type === "done") {
			console.log("\n\nStream complete!");
			console.log(`Stop reason: ${event.reason}`);
			console.log(`Total tokens: ${event.message.usage.totalTokens}`);
			console.log(`Cost: $${event.message.usage.cost.total.toFixed(6)}`);
		} else if (event.type === "error") {
			console.error("\n\nStream error:", event.error.errorMessage);
			process.exit(1);
		}
	}

	console.log("\n✓ Test passed!");
}

testStream().catch((err) => {
	console.error("Test failed:", err);
	process.exit(1);
});
