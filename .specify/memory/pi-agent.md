# Pi MiniMax Provider Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-25

## Active Technologies

- TypeScript targeting ES2022
- Node.js >=18 with global `fetch`
- Pi extension APIs from `@mariozechner/pi-coding-agent`
- Pi model/tool types from `@mariozechner/pi-ai`
- TypeBox schemas via `@sinclair/typebox`
- Vitest for tests
- ESLint and TypeScript compiler checks
- MiniMax Anthropic-compatible model endpoint for provider streaming
- MiniMax direct HTTP endpoints for native tools: coding-plan search, coding-plan image understanding, voice listing, and synchronous text-to-speech

## Project Structure

```text
index.ts                  # Pi extension entry point, provider registration, native tool registration/helpers
index.test.ts             # Unit tests
README.md                 # User setup and usage documentation
package.json              # Package metadata, scripts, dependencies
specs/001-new-tools/      # Specification, plan, research, contracts, quickstart
```

## Commands

```bash
npm run check
npm run lint
npm test -- --run
npm run build
```

## Code Style

- Keep the existing flat TypeScript package structure unless a feature grows enough to justify root-level helper modules.
- Reuse the provider's MiniMax credential resolution for all tools.
- Prefer deterministic unit tests over live MiniMax API tests.
- Throw tool errors for invalid inputs and MiniMax failures instead of returning silent empty success.
- Generated media files must avoid accidental overwrites by default.
- Do not require MCP, Python, or `uvx` for Pi-native MiniMax capabilities.

## Recent Changes

- 001-new-tools: Planned Pi-native MiniMax tools for web search, image understanding, voice listing, and text-to-speech. Voice cloning and long-form async TTS are deferred.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
