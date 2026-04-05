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

## Supported Models

| Model | Context | Speed | Description |
|-------|---------|-------|-------------|
| MiniMax-M2.7 | 204,800 | ~60 tps | Latest flagship with recursive self-improvement |
| MiniMax-M2.7-highspeed | 204,800 | ~100 tps | Same as M2.7 but faster output |
| MiniMax-M2.5 | 204,800 | ~60 tps | Peak performance, ultimate value |
| MiniMax-M2.5-highspeed | 204,800 | ~100 tps | Same as M2.5 but faster output |
| MiniMax-M2.1 | 204,800 | ~60 tps | Powerful multi-language programming |
| MiniMax-M2.1-highspeed | 204,800 | ~100 tps | Same as M2.1 but faster output |
| MiniMax-M2 | 204,800 | ~60 tps | Agentic capabilities, advanced reasoning |

## Installation

### Option 1: Clone and use locally

```bash
git clone https://github.com/sinamtz/pi-minimax-provider.git
cd pi-minimax-provider
```

### Option 2: Install globally

```bash
npm install -g pi-provider-minimax
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

## Pricing

Pricing is approximate and in USD per million tokens:

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| M2.7 | $0.77 | $3.08 | $0.077 | $0.96 |
| M2.5 | $0.50 | $2.00 | $0.05 | $0.625 |
| M2.1 | $0.20 | $0.80 | $0.02 | $0.25 |
| M2 | $0.30 | $1.20 | $0.03 | $0.375 |

Note: Highspeed variants have the same pricing as their standard counterparts.

For the most current pricing, see the [MiniMax pricing page](https://platform.minimax.io/docs/pricing/overview).

## API Details

- **Base URL**: `https://api.minimax.io/anthropic`
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
