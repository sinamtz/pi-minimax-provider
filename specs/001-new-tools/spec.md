# Feature Specification: Native MiniMax Tools

**Feature Branch**: `001-new-tools`  
**Created**: 2026-04-25  
**Status**: Draft  
**Input**: User description: "these new tools"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search current information with MiniMax (Priority: P1)

A Pi user can ask the agent to search the web using MiniMax-provided search capability so the agent can answer questions that depend on current or external information without leaving the Pi session.

**Why this priority**: Search is the smallest useful slice of the new tool set and directly addresses real-time information needs during coding and research workflows.

**Independent Test**: Can be fully tested by asking the agent to use MiniMax search for a current topic and verifying that the agent receives a structured set of search results with titles, links, snippets, and related searches.

**Acceptance Scenarios**:

1. **Given** a configured MiniMax account, **When** the user asks the agent to search for a current topic using MiniMax, **Then** the agent receives relevant search results that include source links and short result summaries.
2. **Given** a configured MiniMax account, **When** an initial search query returns poor or empty results, **Then** the agent can retry with a revised query and present the best available results.
3. **Given** MiniMax credentials are missing or invalid, **When** the agent attempts a MiniMax search, **Then** the user receives a clear authentication or configuration error.

---

### User Story 2 - Understand images with MiniMax (Priority: P2)

A Pi user can provide an image location and ask the agent to analyze, describe, or extract information from that image using MiniMax vision capability.

**Why this priority**: Image understanding complements the current text-only model provider and enables workflows such as UI screenshot inspection, diagram review, and visual debugging.

**Independent Test**: Can be fully tested by giving the agent a supported image and a specific analysis prompt, then verifying that the agent returns a useful natural-language description or extraction result.

**Acceptance Scenarios**:

1. **Given** a supported image and a configured MiniMax account, **When** the user asks the agent to inspect the image, **Then** the agent returns an analysis aligned with the user's prompt.
2. **Given** an image path with a leading attachment-style marker, **When** the agent uses the image understanding capability, **Then** the path is handled as the intended local image rather than failing due to the marker.
3. **Given** an unsupported or unreadable image, **When** the agent attempts image understanding, **Then** the user receives a clear error explaining that the image could not be processed.

---

### User Story 3 - Generate speech audio from text (Priority: P3)

A Pi user can ask the agent to turn text into speech with a selected MiniMax voice and receive either a locally saved audio file or a retrievable audio link.

**Why this priority**: Speech generation expands MiniMax support beyond coding text and vision, but it is more cost-sensitive and file-output oriented than search or image understanding.

**Independent Test**: Can be fully tested by asking the agent to generate speech for a short phrase and verifying that the result identifies the voice used and provides accessible audio output.

**Acceptance Scenarios**:

1. **Given** a configured MiniMax account, **When** the user asks for text-to-speech output with default settings, **Then** the agent generates accessible audio and reports where it can be found.
2. **Given** the user specifies voice, emotion, speed, or audio format preferences, **When** the agent generates speech, **Then** those preferences are reflected in the request or a clear validation error is shown.
3. **Given** generated audio would overwrite an existing local file, **When** the agent saves the result, **Then** it avoids accidental overwrite unless the user explicitly requested replacement.

---

### User Story 4 - Discover available voices (Priority: P3)

A Pi user can ask which MiniMax voices are available before generating speech, including system voices and account-specific cloned voices.

**Why this priority**: Voice discovery improves the speech generation experience but is secondary to creating speech output.

**Independent Test**: Can be fully tested by asking the agent to list available voices and verifying that the response separates voice categories and includes usable voice identifiers.

**Acceptance Scenarios**:

1. **Given** a configured MiniMax account, **When** the user asks for available voices, **Then** the agent returns a readable list of voices with identifiers suitable for speech generation.
2. **Given** the user asks only for system voices or only cloned voices, **When** the agent lists voices, **Then** the response is limited to the requested category.

---

### Edge Cases

- Missing, expired, malformed, or region-mismatched MiniMax credentials must produce a clear user-facing error that identifies authentication or host configuration as the likely issue.
- Missing or invalid search queries, image prompts, image sources, speech text, voice types, or speech settings must be rejected with actionable validation feedback.
- Local image and audio paths may be absolute, relative to the current working directory, or prefixed with an attachment-style marker; paths must resolve predictably and safely.
- Remote image downloads may fail, timeout, or return non-image content; the user must receive a clear processing error.
- Speech text may exceed the supported synchronous generation size; the user must be told to shorten the text or use a future long-form workflow.
- MiniMax may return a successful response without the expected result content; the user must receive a clear error rather than a silent or empty success.
- Media generation may incur costs; the agent should only generate speech when the user explicitly asks for audio output.
- Voice cloning is intentionally out of scope for this feature and should not be exposed as part of the first native tool set.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a MiniMax web search capability that accepts a user-supplied query and returns readable search results with source links and related suggestions when available.
- **FR-002**: The system MUST expose a MiniMax image understanding capability that accepts an analysis prompt and an image source, then returns a natural-language analysis result.
- **FR-003**: The system MUST accept image sources from remote locations, local filesystem paths, and already-encoded image references, limited to commonly supported still-image formats.
- **FR-004**: The system MUST expose a MiniMax voice listing capability that can return all voices, system voices only, or cloned voices only.
- **FR-005**: The system MUST expose a MiniMax text-to-speech capability that accepts text and optional speech preferences, then returns accessible generated audio.
- **FR-006**: The system MUST support default speech settings so users can generate audio with only text input.
- **FR-007**: The system MUST support user-specified speech settings for voice, model quality/speed preference, speed, volume, pitch, emotion, sample rate, bitrate, channel count, audio format, language preference, and output mode where supported by MiniMax.
- **FR-008**: The system MUST save generated audio locally by default and report the final file location to the user.
- **FR-009**: The system MUST support link-based generated audio output when the user requests link output and MiniMax provides it.
- **FR-010**: The system MUST prevent accidental local audio overwrites unless replacement is explicitly requested by the user.
- **FR-011**: The system MUST use the same MiniMax credential source as the existing MiniMax provider, with environment-based host selection available for regional accounts.
- **FR-012**: The system MUST provide clear, actionable errors for missing credentials, invalid inputs, unsupported media, unreachable remote resources, MiniMax service failures, and missing result content.
- **FR-013**: The system MUST include user-facing guidance that speech generation can incur MiniMax costs and should be performed only when explicitly requested.
- **FR-014**: The system MUST document the new capabilities, required credentials, regional host setting, expected outputs, and known limitations.
- **FR-015**: The system MUST keep voice cloning out of scope for this feature while leaving room for a future explicit-consent voice cloning feature.

### Key Entities

- **MiniMax Tool Request**: A user-initiated request to use one MiniMax capability; includes requested capability, user-provided inputs, optional preferences, and validation state.
- **Search Result Set**: The collection of search results returned for a query; includes organic results, source links, snippets, dates when available, and related suggestions.
- **Image Analysis Request**: An image understanding request; includes prompt, image source, resolved image representation, and processing status.
- **Voice Catalog**: The list of voices available to the user's MiniMax account; includes system voices and cloned voices when present.
- **Speech Generation Request**: A text-to-speech request; includes text, voice preference, speech controls, audio output preferences, and cost-sensitive status.
- **Generated Audio Artifact**: The resulting audio from speech generation; includes local file location or retrievable link, format, voice used, and metadata when available.

### Assumptions

- The existing MiniMax login and environment variable credential flow remains the preferred authentication experience.
- Global MiniMax accounts use the default host, while regional accounts can configure an alternate host through environment settings.
- Default speech generation uses a current high-quality MiniMax speech model, a default system voice, neutral emotion, and a common compressed audio format.
- Local media output defaults to the current project/session working directory unless the user or environment provides a dedicated output location.
- Long-form asynchronous speech generation and voice cloning are future enhancements, not part of this initial feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete a MiniMax web search from within Pi and receive at least one readable source result for a known current query in under 30 seconds under normal service conditions.
- **SC-002**: A user can analyze a supported local or remote image from within Pi and receive a prompt-relevant answer in under 60 seconds under normal service conditions.
- **SC-003**: A user can generate speech for a short text sample of 500 characters or fewer and receive accessible audio output in under 60 seconds under normal service conditions.
- **SC-004**: A user can list available voices and identify at least one usable voice identifier without reading external MiniMax documentation.
- **SC-005**: 100% of missing credential and invalid input cases covered by validation tests produce actionable error messages rather than silent failures.
- **SC-006**: Generated local audio never overwrites an existing file in normal use unless the user explicitly requests replacement.
- **SC-007**: Documentation enables a new user with a valid MiniMax key to discover and use search, image understanding, voice listing, and text-to-speech capabilities without consulting MCP setup instructions.
