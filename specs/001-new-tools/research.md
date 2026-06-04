# Research: Native MiniMax Tools

## Decision: Implement direct Pi-native tools, not MCP bridging

**Rationale**: Pi exposes native tool registration through its extension API. Calling MiniMax HTTP endpoints directly avoids requiring users to install `uv`, run Python MCP servers, manage MCP process lifecycle, or configure a separate MCP client. It also lets the extension reuse existing MiniMax authentication and render clear Pi tool results.

**Alternatives considered**:
- Spawn `uvx minimax-coding-plan-mcp` or `uvx minimax-mcp` from Pi: rejected due to external runtime requirements, process lifecycle complexity, duplicated config, and indirect error handling.
- Do not add tools and only document MCP setup: rejected because Pi does not consume MCP servers directly.

## Decision: Reuse existing MiniMax authentication and add host override

**Rationale**: The provider already resolves API keys from Pi auth storage and `MINIMAX_API_KEY`. Tools should behave consistently with model usage. `MINIMAX_API_HOST` is needed because MiniMax global and Mainland accounts use different hosts.

**Alternatives considered**:
- Separate tool-specific credentials: rejected because it increases setup friction and diverges from provider behavior.
- Hard-code only the global host: rejected because regional MiniMax accounts need a different host.

## Decision: Support four first-class native tools

**Rationale**: The feature spec identifies four user-facing capabilities that are useful and bounded: web search, image understanding, voice listing, and text-to-speech. Together they cover MiniMax's new Token/Coding Plan tools plus the speech/voice workflow without introducing voice cloning risk.

**Alternatives considered**:
- Only search and image understanding: useful MVP but incomplete given the explicit speech/voice requirement.
- Add voice cloning immediately: rejected for this feature because it handles sensitive voice data and has stronger consent/cost implications.

## Decision: Use MiniMax JSON endpoints for search, vision, voice list, and TTS

**Rationale**: The official MiniMax MCP implementations reveal the same underlying HTTP endpoints and payload shapes. Native tools can wrap those endpoints directly:

- Web search: `POST /v1/coding_plan/search` with query payload.
- Image understanding: `POST /v1/coding_plan/vlm` with prompt and image reference.
- Voice list: `POST /v1/get_voice` with voice type.
- Text-to-speech: `POST /v1/t2a_v2` with model, text, voice settings, and audio settings.

**Alternatives considered**:
- Use Anthropic-compatible messages endpoint for all modalities: rejected because search, image understanding, and speech are separate MiniMax capabilities with dedicated endpoints.
- Use WebSocket TTS: rejected for first implementation because the synchronous HTTP endpoint is simpler and sufficient for short text generation.

## Decision: Convert local and remote image sources to data URLs for vision requests

**Rationale**: The official Coding Plan MCP normalizes local files and remote image URLs to base64 data URLs. Doing the same provides consistent behavior for local paths, HTTP URLs, and already-encoded inputs.

**Alternatives considered**:
- Pass URLs and paths through unchanged: rejected because local files cannot be accessed by MiniMax remotely and remote behavior may differ.
- Require users to pre-encode images: rejected because it harms usability.

## Decision: Save generated speech locally by default with safe filenames

**Rationale**: Pi users need an artifact they can inspect after tool execution. Local output is reliable even when remote URLs expire. Safe generated filenames avoid accidental overwrites and make results discoverable.

**Alternatives considered**:
- URL output by default: rejected because generated URLs may expire and are less useful for local workflows.
- Require an output path every time: rejected because default speech generation should work with only text input.
- Overwrite requested output paths by default: rejected to satisfy the no accidental overwrite requirement.

## Decision: Keep long-form async TTS out of scope

**Rationale**: The synchronous TTS endpoint covers short audio generation and aligns with the feature's first-pass scope. Long-form async TTS introduces task creation, polling, expiry handling, and additional user flows better handled as a later feature.

**Alternatives considered**:
- Add async long-form TTS now: rejected due to expanded scope and additional state transitions.

## Decision: Tests should emphasize validation and helper behavior over live MiniMax calls

**Rationale**: Automated tests should be deterministic and not depend on credentials, network, or billable MiniMax usage. Unit tests can cover credential cleanup, payload construction, image path handling, output path generation, no-overwrite behavior, and response/error parsing. Manual quickstart can cover live API verification.

**Alternatives considered**:
- Live API tests in CI: rejected because they require secrets, network, quota, and may incur costs.
