# Implementation Plan: Native MiniMax Tools

**Branch**: `001-new-tools` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-new-tools/spec.md`

## Summary

Add Pi-native MiniMax tools to the existing MiniMax provider extension so Pi users can access MiniMax web search, image understanding, voice listing, and text-to-speech without configuring an MCP server. The implementation will reuse the existing MiniMax authentication flow, add shared MiniMax HTTP/media helpers, register four native Pi tools, save generated audio safely by default, and document regional host and cost-sensitive usage.

## Technical Context

**Language/Version**: TypeScript targeting ES2022; Node.js >=18  
**Primary Dependencies**: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@sinclair/typebox`, Node built-ins, global `fetch`  
**Storage**: Local filesystem only for generated audio artifacts; existing Pi auth storage for credentials  
**Testing**: Vitest unit tests, TypeScript `tsc --noEmit`, ESLint  
**Target Platform**: Pi extension runtime on Node.js >=18 for macOS/Linux/Windows-compatible local paths  
**Project Type**: Single-package Pi extension/provider library  
**Performance Goals**: Search returns under 30s, image analysis under 60s, short speech generation under 60s under normal MiniMax service conditions  
**Constraints**: No MCP runtime dependency; direct MiniMax HTTP calls; no package publish during this feature; no accidental audio overwrite; voice cloning out of scope; generated files must remain user-discoverable  
**Scale/Scope**: Four native tools plus shared helpers and documentation within the existing provider package

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file currently contains only the scaffold template and no project-specific governing principles. Therefore there are no active constitutional gates to enforce for this plan.

Pre-design gate result: PASS

Post-design gate result: PASS — Phase 1 design preserves the same scope and introduces no constitutional conflicts.

## Project Structure

### Documentation (this feature)

```text
specs/001-new-tools/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── native-tools.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output from /spec tasks, not created by /spec plan
```

### Source Code (repository root)

```text
index.ts                  # Existing provider entry point; register tools and shared helpers here or delegate to new helper modules
index.test.ts             # Existing tests; add helper validation and media output tests
README.md                 # Document native tools, credentials, regional host, examples, and limitations
package.json              # Runtime dependency declarations and scripts
package-lock.json         # Lockfile updates
```

**Structure Decision**: Keep the feature in the existing single-package extension structure. The current repository has a flat TypeScript layout with `index.ts` as the Pi extension entry point and no `src/` directory. For this feature, adding native tools to `index.ts` is acceptable if helpers remain small; if implementation grows, split into root-level `minimax-tools.ts` and `minimax-http.ts` while preserving the package's existing flat compile configuration.

## Phase 0 Research Summary

Research resolved the following decisions:

- Use Pi-native tools instead of spawning or configuring MiniMax MCP servers.
- Reuse MiniMax provider credentials and support `MINIMAX_API_HOST` for regional accounts.
- Wrap MiniMax Token/Coding Plan endpoints for search and image understanding.
- Wrap MiniMax speech endpoints for voice listing and synchronous text-to-speech.
- Save generated speech locally by default, with optional URL output when MiniMax provides it.
- Defer voice cloning to a future explicit-consent feature.

Details are recorded in [research.md](./research.md).

## Phase 1 Design Summary

- Data model: [data-model.md](./data-model.md)
- Tool contracts: [contracts/native-tools.md](./contracts/native-tools.md)
- User/developer validation guide: [quickstart.md](./quickstart.md)
- Pi agent context updated: `.specify/memory/pi-agent.md`

## Complexity Tracking

No constitutional violations or exceptional complexity require justification.
