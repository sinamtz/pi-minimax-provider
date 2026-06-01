# Pi Provider - MiniMax

[![npm version](https://img.shields.io/npm/v/@sinamtz/pi-minimax-provider)](https://www.npmjs.com/package/@sinamtz/pi-minimax-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Note:** This is an unofficial, community-built provider. It is not affiliated with, endorsed by, or connected to MiniMax.

A [Pi coding agent](https://github.com/badlogic/pi-mono) provider extension for MiniMax AI's M2 and M3 series models, plus native Pi tools for MiniMax web search, image understanding, voice listing, and text-to-speech.

## Features

- **Anthropic API Compatible**: Uses MiniMax's Anthropic-compatible endpoint for seamless integration
- **Full Model Support**: `MiniMax-M3` (1M context, multimodal) and all M2 series models including highspeed variants
- **Extended Context**: Up to 1,000,000 token context window on M3, 204,800 on M2 series
- **Thinking Support**: Built-in reasoning/thinking capabilities (`adaptive` for M3, budget-based for M2 series)
- **Cost Tracking**: Accurate token pricing for all models
- **Native MiniMax Tools**: Pi-native tools for MiniMax web search, image understanding, voice listing, and text-to-speech. No MCP server setup required.

## Supported Models

| Model | Context | Output | Input | Description |
|-------|---------|--------|-------|-------------|
| MiniMax-M3 | 1,000,000 | up to 524,288 | text, image | Frontier multimodal coding model with 1M context and adaptive thinking |
| MiniMax-M2.7 | 204,800 | up to 65,536 | text | Latest flagship with recursive self-improvement (~60 tps) |
| MiniMax-M2.7-highspeed | 204,800 | up to 65,536 | text | Same as M2.7 with higher output speed (~100 tps) |
| MiniMax-M2.5 | 204,800 | up to 65,536 | text | Peak performance, ultimate value (~60 tps) |
| MiniMax-M2.5-highspeed | 204,800 | up to 65,536 | text | Same as M2.5 with higher output speed (~100 tps) |
| MiniMax-M2.1 | 204,800 | up to 65,536 | text | Powerful multi-language programming (~60 tps) |
| MiniMax-M2.1-highspeed | 204,800 | up to 65,536 | text | Same as M2.1 with higher output speed (~100 tps) |
| MiniMax-M2 | 204,800 | up to 65,536 | text | Agentic capabilities, advanced reasoning (~60 tps) |

Notes:
- M3 supports image and video input directly. Only `text` and `image` are exposed to Pi today.
- M2 series do not accept image or video input; the provider only declares `text`.
- M2 series `max_tokens` field is configured to MiniMax's recommended cap (65,536). The hard API maximum is 204,800; the provider can pass that through if requested via Pi's per-request `maxTokens` option.

## Installation

### Option 1: Using pi install (npm)

```bash
pi install npm:@sinamtz/pi-minimax-provider
```

### Option 2: Using pi install (git)

```bash
pi install git:https://github.com/sinamtz/pi-minimax-provider
```

### Option 3: Install globally via npm

```bash
npm install -g @sinamtz/pi-minimax-provider
```

### Option 4: Clone locally

```bash
git clone https://github.com/sinamtz/pi-minimax-provider.git
cd pi-minimax-provider
```

## Usage

### Set your API key

Get your API key from the [MiniMax Platform](https://platform.minimax.io/user-center/basic-information/interface-key).

There are three ways to set your API key (in order of priority):

#### Option 1: Using `/login` (Recommended)

The easiest way is to use pi's built-in login command:

```bash
pi -e ./pi-minimax-provider
/login
```

This will prompt you to enter your API key, which is then securely stored in `~/.pi/agent/auth.json`.

#### Option 2: Edit auth.json manually

Add your API key directly to the auth file:

```json
{
  "providers": {
    "minimax": {
      "access": "your-api-key-here",
      "expires": 1935753600000
    }
  }
}
```

#### Option 3: Environment variable

```bash
export MINIMAX_API_KEY=your-api-key-here
pi -e ./pi-minimax-provider
```

### Select a region (optional)

The provider defaults to the international MiniMax endpoint. For Mainland China accounts, set:

```bash
export MINIMAX_API_HOST=https://api.minimaxi.com
```

The same variable is also used by the native tools.

### Run pi with the extension

```bash
# Using local path
pi -e ./pi-provider-minimax

# Using a global install
pi -e $(npm root -g)/pi-provider-minimax
```

`pi install npm:@sinamtz/pi-minimax-provider` is the recommended way to install; Pi then loads the extension automatically.

### Select a model

In pi's interactive mode:

```
/model MiniMax-M3
```

Or use the model selector UI. The provider registers the model id exactly as shown in [Supported Models](#supported-models).

## Native MiniMax Tools

Pi does not consume MCP servers directly, so this extension exposes MiniMax capabilities as native Pi tools that call MiniMax HTTP APIs. You do **not** need to configure `minimax-mcp`, `minimax-coding-plan-mcp`, Python, or `uvx` to use these tools in Pi.

| Tool | Purpose |
|------|---------|
| `minimax_web_search` | Performs MiniMax web search and returns organic results plus related searches. |
| `minimax_understand_image` | Analyzes JPEG, PNG, or WebP images from HTTP/HTTPS URLs, data URLs, or local file paths. |
| `minimax_list_voices` | Lists available MiniMax system and cloned voices for the configured account. |
| `minimax_text_to_audio` | Generates speech audio from text using MiniMax voices. Supports local `mp3`, `wav`, `flac`, and `pcm` output. |

These tools use the same MiniMax API key as the provider. They call `MINIMAX_API_HOST` if set, otherwise `https://api.minimax.io`.

### Tool examples

Ask Pi for current information:

```text
Use MiniMax web search to find recent MiniMax speech API documentation.
```

Analyze an image:

```text
Use MiniMax image understanding to describe ./screenshot.png. Focus on visible UI text.
```

List voices:

```text
Use MiniMax to list available system voices.
```

Generate speech:

```text
Use MiniMax text to speech to create an mp3 saying: Hello from Pi and MiniMax.
```

### Output handling

`minimax_text_to_audio` defaults to local file output and refuses to overwrite existing files unless replacement is explicitly requested. Set `output_mode: "url"` when link output is preferred and MiniMax supports it.

### Cost

Speech generation may incur MiniMax usage costs. Voice cloning and async long-form TTS are intentionally out of scope for this first native tool set.

## Prompt Caching

MiniMax supports automatic prompt caching for repeated prefixes such as tool lists, system prompts, and conversation history. The provider does not need to add MCP or explicit cache setup for this: MiniMax applies passive caching on supported models when requests have enough repeated input. The extension tracks cache read/write usage returned by the Anthropic-compatible stream so Pi cost accounting can reflect cache-hit tokens.

Explicit Anthropic `cache_control` is not enabled by default because MiniMax documents it for M2.x models, while M3 uses passive caching. This avoids adding model-specific cache markers that could be ignored or rejected.

## Limitations

- M3 input above 512k tokens is in limited quantity and may require contacting MiniMax sales for access. The provider passes this through unchanged.
- M2 series do not support image or video input; the provider declares only `text` in the model schema.
- M2 series cache writes use a separate per-million-token rate ($0.375). M3 passive cache writes are not listed as a separate charge.

## Pricing

Pricing is approximate and in USD per million tokens for pay-as-you-go standard tier:

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| M3 ≤512k input tokens | $0.60 | $2.40 | $0.12 | Not listed / no passive-cache write charge |
| M3 >512k input tokens | $1.20 | $4.80 | $0.24 | Not listed / no passive-cache write charge |
| M2.7 | $0.30 | $1.20 | $0.06 | $0.375 |
| M2.7-highspeed | $0.60 | $2.40 | $0.06 | $0.375 |
| M2.5 | $0.30 | $1.20 | $0.03 | $0.375 |
| M2.5-highspeed | $0.60 | $2.40 | $0.03 | $0.375 |
| M2.1 | $0.30 | $1.20 | $0.03 | $0.375 |
| M2.1-highspeed | $0.60 | $2.40 | $0.03 | $0.375 |
| M2 | $0.30 | $1.20 | $0.03 | $0.375 |

MiniMax may run temporary discounts or priority-tier pricing that differs from these baseline values. For the most current pricing, see the [MiniMax pay-as-you-go pricing page](https://platform.minimax.io/docs/guides/pricing-paygo).

## API Details

- **Base URL**: `https://api.minimax.io/anthropic`
- **Tool endpoints**: `/v1/coding_plan/search`, `/v1/coding_plan/vlm`, `/v1/get_voice`, `/v1/t2a_v2`
- **Protocol**: Anthropic Messages API compatible
- **Authentication**: Bearer token
  - Priority: `options.apiKey` > `auth.json` (via `/login`) > environment variable `MINIMAX_API_KEY`
- **Streaming**: Full streaming support; usage events include input/output, cache read, and cache write token counts

## Development

The package uses TypeScript and Vitest.

```bash
npm install
npm run check   # tsc --noEmit
npm run lint    # eslint
npm test        # vitest (watch mode)
npm run build   # tsc -p tsconfig.build.json -> dist/
```

Tests run against the published MiniMax HTTP shapes (mocked), so no live API calls are required and no costs are incurred. Do not commit real API keys.

## Troubleshooting

### "Model not found" error
- Ensure you've set up authentication (see [Set your API key](#set-your-api-key))
- Verify the extension path is correct when using `-e`
- Confirm the model id matches one of the [Supported Models](#supported-models) (case-sensitive)

### Authentication errors
- Check your MiniMax API key is valid
- Ensure you have credits/quota available in your MiniMax account
- If using `/login`, re-authenticate: `/logout -> minimax` then `/login -> minimax`

### Wrong region
- If requests time out or return auth errors, set `MINIMAX_API_HOST` to the correct regional endpoint (e.g. `https://api.minimaxi.com` for Mainland China)

## Changelog

### v1.1.1
- Documentation: clarify supported models, output caps, region selection, prompt caching behavior, and add a development/test section

### v1.1.0
- Add MiniMax-M3 model support with 1M context, image input, adaptive thinking, and documented 512K max output cap
- Add native Pi tools for MiniMax web search, image understanding, voice listing, and text-to-speech
- Track prompt-cache read/write usage returned by MiniMax
- Refresh model pricing, output limits, and README documentation from current MiniMax docs

### v1.0.8
- **Fix**: Strip `oauth:` prefix from API keys to prevent 401 authentication errors
- Add vitest unit tests for API key cleaning

### v1.0.7
- Add ESLint with TypeScript support
- Add lint script to npm run commands

### v1.0.6
- Add auth.json support via `/login minimax` command

### v1.0.3
- Initial release

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.
