# Contract: Native MiniMax Pi Tools

This contract documents the Pi tool surface exposed by the feature. Tool names are prefixed with `minimax_` to avoid collisions.

## Shared behavior

All tools:
- Use the existing MiniMax credential resolution chain.
- Use `MINIMAX_API_HOST` when set; otherwise use the global MiniMax host.
- Throw tool errors for missing credentials, invalid inputs, HTTP failures, non-success MiniMax status payloads, and missing expected result content.
- Return user-readable text content and structured `details` where useful.

## Tool: `minimax_web_search`

Searches current web information through MiniMax.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query. Prefer concise 3-5 keyword queries."
    }
  },
  "required": ["query"]
}
```

### Output contract

Text content is formatted JSON containing MiniMax search results. Details contain the raw parsed response.

Expected result shape:

```json
{
  "organic": [
    {
      "title": "Result title",
      "link": "https://example.com",
      "snippet": "Short result summary",
      "date": "Optional date"
    }
  ],
  "related_searches": [
    { "query": "related query" }
  ],
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

## Tool: `minimax_understand_image`

Analyzes a supported image with a task-specific prompt.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Question or analysis request for the image."
    },
    "image_source": {
      "type": "string",
      "description": "HTTP/HTTPS URL, data URL, absolute path, or path relative to the current working directory. JPEG, PNG, and WebP are supported."
    }
  },
  "required": ["prompt", "image_source"]
}
```

### Output contract

Text content is the MiniMax image analysis result. Details contain the raw parsed response.

Expected result shape:

```json
{
  "content": "Natural-language image analysis result",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

If MiniMax returns no `content`, the tool fails with an actionable error.

## Tool: `minimax_list_voices`

Lists voices available to the MiniMax account.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "voice_type": {
      "type": "string",
      "enum": ["all", "system", "voice_cloning"],
      "description": "Which voices to list."
    }
  },
  "required": []
}
```

Default: `voice_type = "all"`.

### Output contract

Text content is a concise readable list of voices grouped by category. Details contain the raw parsed response.

Expected result shape:

```json
{
  "system_voice": [
    {
      "voice_name": "Display name",
      "voice_id": "voice-id"
    }
  ],
  "voice_cloning": [
    {
      "voice_name": "Display name",
      "voice_id": "voice-id"
    }
  ],
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

## Tool: `minimax_text_to_audio`

Generates speech from text using MiniMax voices.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "description": "Text to synthesize."
    },
    "output_path": {
      "type": "string",
      "description": "Optional local output file or directory."
    },
    "voice_id": {
      "type": "string",
      "description": "MiniMax voice identifier."
    },
    "model": {
      "type": "string",
      "description": "MiniMax speech model."
    },
    "speed": {
      "type": "number",
      "minimum": 0.5,
      "maximum": 2
    },
    "volume": {
      "type": "number",
      "minimum": 0,
      "maximum": 10
    },
    "pitch": {
      "type": "integer",
      "minimum": -12,
      "maximum": 12
    },
    "emotion": {
      "type": "string",
      "enum": ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]
    },
    "sample_rate": {
      "type": "integer",
      "enum": [8000, 16000, 22050, 24000, 32000, 44100]
    },
    "bitrate": {
      "type": "integer",
      "enum": [32000, 64000, 128000, 256000]
    },
    "channel": {
      "type": "integer",
      "enum": [1, 2]
    },
    "format": {
      "type": "string",
      "enum": ["mp3", "pcm", "flac"]
    },
    "language_boost": {
      "type": "string"
    },
    "output_mode": {
      "type": "string",
      "enum": ["local", "url"]
    },
    "allow_overwrite": {
      "type": "boolean",
      "description": "Whether an existing local output file may be replaced. Defaults to false."
    }
  },
  "required": ["text"]
}
```

### Defaults

```json
{
  "voice_id": "female-shaonv",
  "model": "speech-2.8-hd",
  "speed": 1.0,
  "volume": 1.0,
  "pitch": 0,
  "emotion": "neutral",
  "sample_rate": 32000,
  "bitrate": 128000,
  "channel": 1,
  "format": "mp3",
  "language_boost": "auto",
  "output_mode": "local",
  "allow_overwrite": false
}
```

### Output contract

Local mode text content:

```text
Success. Audio saved to: /absolute/path/minimax-t2a-20260425-232000-a1b2c3.mp3
Voice used: female-shaonv
Model: speech-2.8-hd
```

URL mode text content:

```text
Success. Audio URL: https://...
Voice used: female-shaonv
Model: speech-2.8-hd
```

Details shape:

```json
{
  "mode": "local",
  "path": "/absolute/path/file.mp3",
  "url": null,
  "voice_id": "female-shaonv",
  "model": "speech-2.8-hd",
  "format": "mp3",
  "extra_info": {}
}
```

If local mode receives no audio data or URL mode receives no URL, the tool fails with an actionable error.
