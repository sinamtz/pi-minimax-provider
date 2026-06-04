# Data Model: Native MiniMax Tools

## MiniMax Tool Request

Represents a user-initiated request to one MiniMax native capability.

**Fields**:
- `tool`: one of `minimax_web_search`, `minimax_understand_image`, `minimax_list_voices`, `minimax_text_to_audio`
- `input`: tool-specific parameter object
- `apiKeyState`: present, missing, or invalid after request failure
- `host`: selected MiniMax host
- `status`: pending, succeeded, failed
- `errorMessage`: user-facing error text when failed

**Validation rules**:
- A resolved API key is required before remote MiniMax calls.
- Host must be a valid MiniMax API host URL with no trailing slash in internal use.
- Failures must produce actionable messages.

**Relationships**:
- One MiniMax Tool Request may produce one Search Result Set, Image Analysis Result, Voice Catalog, or Generated Audio Artifact.

## Search Result Set

Represents MiniMax search results returned for a query.

**Fields**:
- `query`: original search query
- `organicResults`: list of search results
- `relatedSearches`: optional list of related query suggestions
- `rawResponse`: raw MiniMax response for details/rendering

**Search Result fields**:
- `title`: result title
- `link`: source URL
- `snippet`: result summary
- `date`: optional result date

**Validation rules**:
- Query must be a non-empty string.
- Empty result sets are valid but should be reported clearly.

## Image Analysis Request

Represents an image understanding request.

**Fields**:
- `prompt`: user analysis question/instruction
- `imageSource`: original local path, remote URL, or data URL
- `resolvedImage`: encoded image reference sent to MiniMax
- `content`: natural-language result when successful
- `rawResponse`: raw MiniMax response for details/rendering

**Validation rules**:
- Prompt must be non-empty.
- Image source must be non-empty.
- Leading attachment marker (`@`) is removed from local paths.
- Supported image formats are JPEG, PNG, and WebP.
- Remote images must be downloadable; local images must be readable.

**State transitions**:
- unresolved → resolved → submitted → succeeded
- unresolved/resolved/submitted → failed

## Voice Catalog

Represents voices available to the MiniMax account.

**Fields**:
- `voiceType`: requested category: all, system, or voice_cloning
- `systemVoices`: list of voice summaries
- `clonedVoices`: list of voice summaries
- `rawResponse`: raw MiniMax response for details/rendering

**Voice Summary fields**:
- `name`: display name when available
- `id`: voice identifier used for speech generation
- `category`: system or voice_cloning

**Validation rules**:
- Requested voice type must be all, system, or voice_cloning.
- Voice identifiers should be displayed exactly as returned so users can reuse them.

## Speech Generation Request

Represents a text-to-speech generation request.

**Fields**:
- `text`: text to synthesize
- `voiceId`: selected voice identifier
- `model`: selected speech model
- `speed`: speech speed
- `volume`: speech volume
- `pitch`: pitch adjustment
- `emotion`: selected emotion
- `sampleRate`: audio sample rate
- `bitrate`: audio bitrate
- `channel`: channel count
- `format`: output format
- `languageBoost`: language hint
- `outputMode`: local or url
- `outputPath`: optional user-specified path or directory
- `allowOverwrite`: whether replacement was explicitly requested

**Validation rules**:
- Text must be non-empty and within synchronous generation limits.
- Speed should be within MiniMax-supported range.
- Volume should be within MiniMax-supported range.
- Pitch should be within MiniMax-supported range.
- Format must be one of the supported audio formats.
- Output mode must be local or url.
- Local output must not overwrite an existing file unless `allowOverwrite` is true.

**State transitions**:
- validated → submitted → audio_received → saved_or_linked → succeeded
- validated/submitted/audio_received → failed

## Generated Audio Artifact

Represents the result of speech generation.

**Fields**:
- `mode`: local or url
- `path`: absolute local file path when mode is local
- `url`: generated audio URL when mode is url
- `format`: audio format
- `voiceId`: voice used
- `model`: model used
- `extraInfo`: optional metadata returned by MiniMax

**Validation rules**:
- Local artifacts must have a file extension matching the selected format.
- URL artifacts must include a non-empty retrievable link.
- Success result must include either `path` or `url`.
