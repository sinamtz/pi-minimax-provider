# Pi Provider - MiniMax

[![npm version](https://img.shields.io/npm/v/@sinamtz/pi-minimax-provider)](https://www.npmjs.com/package/@sinamtz/pi-minimax-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Note:** This is an unofficial, community-built provider. It is not affiliated with, endorsed by, or connected to MiniMax.

A [Pi coding agent](https://github.com/badlogic/pi-mono) provider extension for MiniMax AI's M2 series models.

## Features

- **Anthropic API Compatible**: Uses MiniMax's Anthropic-compatible endpoint for seamless integration
- **Full Model Support**: All MiniMax M2 series models including highspeed variants
- **Extended Context**: Up to 204,800 token context window
- **Thinking Support**: Built-in reasoning/thinking capabilities
- **Cost Tracking**: Accurate token pricing for all models
- **Native MiniMax Tools**: Pi-native tools for MiniMax web search, image understanding, voice listing, and text-to-speech. No MCP server setup required.

## Supported Models

| Model | Context | Speed | Description |
|-------|---------|-------|-------------|
| MiniMax-M3 | 1,000,000 | standard | Frontier multimodal coding model with 1M context window |
| MiniMax-M2.7 | 204,800 | ~60 tps | Latest flagship with recursive self-improvement |
| MiniMax-M2.7-highspeed | 204,800 | ~100 tps | Same as M2.7 but faster output |
| MiniMax-M2.5 | 204,800 | ~60 tps | Peak performance, ultimate value |
| MiniMax-M2.5-highspeed | 204,800 | ~100 tps | Same as M2.5 but faster output |
| MiniMax-M2.1 | 204,800 | ~60 tps | Powerful multi-language programming |
| MiniMax-M2.1-highspeed | 204,800 | ~100 tps | Same as M2.1 but faster output |
| MiniMax-M2 | 204,800 | ~60 tps | Agentic capabilities, advanced reasoning |

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

### Run pi with the extension

```bash
# Using local path
pi -e ./path/to/pi-provider-minimax

# Using global install
pi -e $(npm root -g)/pi-provider-minimax
```

### Select a model

In pi's interactive mode:

```
/model MiniMax-M2.7
```

Or use the model selector UI.

## Native MiniMax Tools

Pi does not consume MCP servers directly, so this extension exposes MiniMax capabilities as native Pi tools that call MiniMax HTTP APIs. You do **not** need to configure `minimax-mcp`, `minimax-coding-plan-mcp`, Python, or `uvx` to use these tools in Pi.

| Tool | Purpose |
|------|---------|
| `minimax_web_search` | Performs MiniMax web search and returns organic results plus related searches. |
| `minimax_understand_image` | Analyzes JPEG, PNG, or WebP images from HTTP/HTTPS URLs, data URLs, or local file paths. |
| `minimax_list_voices` | Lists available MiniMax system and cloned voices for the configured account. |
| `minimax_text_to_audio` | Generates speech audio from text using MiniMax voices. Supports local `mp3`, `wav`, `flac`, and `pcm` output. |

These tools use the same MiniMax API key as the provider. They call `MINIMAX_API_HOST` if set, otherwise `https://api.minimax.io`. For Mainland China accounts, set:

```bash
export MINIMAX_API_HOST=https://api.minimaxi.com
```

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

`minimax_text_to_audio` defaults to local file output and refuses to overwrite existing files unless replacement is explicitly requested. Set `output_mode: "url"` when link output is preferred and MiniMax provides it.

Speech generation may incur MiniMax usage costs. Voice cloning and async long-form TTS are intentionally out of scope for this first native tool set.

## Prompt Caching

MiniMax supports automatic prompt caching for repeated prefixes such as tool lists, system prompts, and conversation history. The provider does not need to add MCP or explicit cache setup for this: MiniMax applies passive caching on supported models when requests have enough repeated input. The extension now tracks cache read/write usage returned by the Anthropic-compatible stream so Pi cost accounting can reflect cache-hit tokens.

Explicit Anthropic `cache_control` is not enabled by default because MiniMax documents it for M2.x models, while M3 uses passive caching. This avoids adding model-specific cache markers that could be ignored or rejected.

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
  - Priority: auth.json (via `/login`) > environment variable `MINIMAX_API_KEY`
- **Streaming**: Full streaming support

## Troubleshooting

### "Model not found" error
- Ensure you've set up authentication (see [Set your API key](#set-your-api-key))
- Verify the extension path is correct when using `-e`

### Authentication errors
- Check your MiniMax API key is valid
- Ensure you have credits/quota available in your MiniMax account
- If using `/login`, try re-authenticating: `/logout -> MiniMax` then `/login -> MiniMax`

## Changelog

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
