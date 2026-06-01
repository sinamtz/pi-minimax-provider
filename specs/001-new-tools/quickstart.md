# Quickstart: Native MiniMax Tools

This quickstart verifies the native Pi tools for MiniMax search, image understanding, voice listing, and text-to-speech.

## Prerequisites

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure MiniMax credentials using one of the supported approaches:

   ```bash
   export MINIMAX_API_KEY=your-minimax-key
   ```

   Or use Pi's `/login` flow for the `minimax` provider.

3. For Mainland accounts, set the regional host:

   ```bash
   export MINIMAX_API_HOST=https://api.minimaxi.com
   ```

   Global accounts can omit this and use the default host.

## Local validation commands

Run deterministic project checks before trying live MiniMax calls:

```bash
npm run check
npm run lint
npm test -- --run
```

## Manual Pi validation

Start Pi with the local extension:

```bash
pi -e .
```

### 1. Validate web search

Ask:

```text
Use MiniMax web search to find recent MiniMax speech API documentation.
```

Expected result:
- The agent calls `minimax_web_search`.
- The result includes readable titles, links, snippets, and/or related searches.
- Missing credentials produce a clear authentication/configuration error.

### 2. Validate image understanding

Use a local JPEG/PNG/WebP file or remote image URL and ask:

```text
Use MiniMax image understanding to describe ./path/to/image.png. Focus on UI layout and visible text.
```

Expected result:
- The agent calls `minimax_understand_image`.
- The result answers the prompt using image content.
- Invalid paths or unsupported files produce clear processing errors.

### 3. Validate voice listing

Ask:

```text
Use MiniMax to list available system voices.
```

Expected result:
- The agent calls `minimax_list_voices`.
- The result includes voice identifiers suitable for text-to-speech.

### 4. Validate text-to-speech

Ask:

```text
Use MiniMax text to speech to create an mp3 saying: Hello from Pi and MiniMax.
```

Expected result:
- The agent calls `minimax_text_to_audio` only after the user explicitly requests audio generation.
- The result reports either a local file path or a URL, depending on requested output mode.
- Local output does not overwrite an existing file unless explicitly allowed.

## Expected limitations

- Voice cloning is not part of this feature.
- Long-form asynchronous speech generation is not part of this feature.
- Live MiniMax calls require valid credentials and may incur usage costs.
- Automated tests should not depend on live MiniMax network calls.

## Live Validation (2026-05-03)

All four native tools were validated against live MiniMax API with a valid global Token/Coding Plan API key:

- `minimax_web_search`: ✅ 10 organic results returned for "MiniMax M2.7 release 2026" query.
- `minimax_understand_image`: ✅ Successfully analyzed a 1×1 PNG test image — responded "The image consists of a solid green square."
- `minimax_list_voices`: ✅ Returned a comprehensive catalog of system voices across English, Chinese, Japanese, Korean, Spanish, Portuguese, French, Indonesian, German, Russian, Italian, Dutch, Vietnamese, Arabic, Turkish, Ukrainian, Thai, Polish, Romanian, Greek, Czech, Finnish, and Hindi, plus an empty Voice Cloning list.
- `minimax_text_to_audio` URL mode: ✅ Generated a MiniMax-hosted MP3 URL for short text "Hi" using `speech-2.8-hd` model.

No deviations from expected behavior were observed. Voice cloning and async long-form TTS remain out of scope.
