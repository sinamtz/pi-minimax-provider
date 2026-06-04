# Tasks: Native MiniMax Tools

**Input**: Design documents from `/specs/001-new-tools/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/native-tools.md, quickstart.md

**Tests**: Test tasks are included because the feature specification requires validation coverage for missing credentials, invalid inputs, safe file output, and deterministic helper behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Each task includes an exact repository file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align package dependencies and existing implementation with the native tools plan.

- [x] T001 Verify `@sinclair/typebox` is declared as a runtime dependency in package.json and package-lock.json
- [x] T002 [P] Review existing partial native tool implementation in index.ts against specs/001-new-tools/contracts/native-tools.md
- [x] T003 [P] Review README.md current MiniMax tool documentation against specs/001-new-tools/quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared helpers and schemas required before any MiniMax native tool can be completed.

**⚠️ CRITICAL**: No user story work should begin until these shared helpers are complete.

- [x] T004 Export or define shared MiniMax host resolution helper `getMiniMaxApiHost` in index.ts using `MINIMAX_API_HOST` with global default
- [x] T005 Replace narrow Coding Plan HTTP helper with shared JSON helper `callMiniMaxJson` in index.ts for all MiniMax tool endpoints
- [x] T006 Add MiniMax API response validation in index.ts that throws on non-OK HTTP responses, non-zero MiniMax status payloads, and malformed non-JSON responses
- [x] T007 Add shared tool API-key guard in index.ts that reuses existing MiniMax credential resolution and reports `/login` or `MINIMAX_API_KEY` guidance
- [x] T008 [P] Add reusable TypeBox enum schemas/constants in index.ts for voice type, speech emotion, audio format, output mode, sample rate, bitrate, and channel
- [x] T009 [P] Add deterministic tests for MiniMax host resolution, JSON response success parsing, and JSON response error parsing in index.test.ts

**Checkpoint**: Shared auth, host, schema, and JSON request behavior are ready for story implementation.

---

## Phase 3: User Story 1 - Search current information with MiniMax (Priority: P1) 🎯 MVP

**Goal**: A Pi user can search current/external information with MiniMax from within a Pi session.

**Independent Test**: Ask the agent to use MiniMax search for a current topic and verify the tool returns structured results with titles, links, snippets, and related searches, or a clear credential/configuration error.

### Tests for User Story 1

- [x] T010 [P] [US1] Add unit tests for `minimax_web_search` query validation and payload shape in index.test.ts
- [x] T011 [P] [US1] Add unit tests for `minimax_web_search` missing credential and MiniMax error handling in index.test.ts

### Implementation for User Story 1

- [x] T012 [US1] Register or update `minimax_web_search` in index.ts with contract-compliant name, label, description, promptSnippet, promptGuidelines, and TypeBox parameters
- [x] T013 [US1] Implement `minimax_web_search` execution in index.ts using `callMiniMaxJson` with the search endpoint and `{ q: query }` payload
- [x] T014 [US1] Ensure `minimax_web_search` returns formatted JSON text content and raw parsed response details in index.ts
- [x] T015 [US1] Document `minimax_web_search` usage and expected output in README.md

**Checkpoint**: User Story 1 is fully functional and testable independently as the MVP.

---

## Phase 4: User Story 2 - Understand images with MiniMax (Priority: P2)

**Goal**: A Pi user can analyze supported local, remote, or encoded images with MiniMax image understanding.

**Independent Test**: Provide a JPEG, PNG, or WebP image and a specific prompt, then verify the tool returns prompt-relevant image analysis or a clear image processing error.

### Tests for User Story 2

- [x] T016 [P] [US2] Add unit tests for image MIME detection and data URL passthrough in index.test.ts
- [x] T017 [P] [US2] Add unit tests for local image source normalization including leading `@` handling in index.test.ts
- [x] T018 [P] [US2] Add unit tests for `minimax_understand_image` missing content and invalid input errors in index.test.ts

### Implementation for User Story 2

- [x] T019 [US2] Register or update `minimax_understand_image` in index.ts with contract-compliant name, label, description, promptSnippet, promptGuidelines, and TypeBox parameters
- [x] T020 [US2] Implement image source normalization in index.ts for data URLs, HTTP/HTTPS URLs, absolute paths, cwd-relative paths, and leading `@` paths
- [x] T021 [US2] Implement `minimax_understand_image` execution in index.ts using `callMiniMaxJson` with the VLM endpoint and `{ prompt, image_url }` payload
- [x] T022 [US2] Ensure `minimax_understand_image` returns MiniMax `content` as text and throws when content is missing in index.ts
- [x] T023 [US2] Document `minimax_understand_image` supported inputs, formats, and examples in README.md

**Checkpoint**: User Story 2 works independently and does not depend on search beyond shared foundations.

---

## Phase 5: User Story 4 - Discover available voices (Priority: P3)

**Goal**: A Pi user can list available MiniMax voices and reuse voice identifiers for speech generation.

**Independent Test**: Ask the agent to list all, system, or cloned voices and verify the response is grouped/readable and includes voice identifiers.

### Tests for User Story 4

- [x] T024 [P] [US4] Add unit tests for `minimax_list_voices` default voice type and enum validation in index.test.ts
- [x] T025 [P] [US4] Add unit tests for formatting system and cloned voice results in index.test.ts

### Implementation for User Story 4

- [x] T026 [US4] Register `minimax_list_voices` in index.ts with contract-compliant name, label, description, promptSnippet, promptGuidelines, and optional `voice_type` parameter
- [x] T027 [US4] Implement `minimax_list_voices` execution in index.ts using `callMiniMaxJson` with the voice listing endpoint and default `voice_type: all`
- [x] T028 [US4] Format `minimax_list_voices` text output in index.ts as grouped system and cloned voice lists while preserving raw details
- [x] T029 [US4] Document `minimax_list_voices` usage and relationship to text-to-speech voice selection in README.md

**Checkpoint**: User Story 4 is independently usable for voice discovery.

---

## Phase 6: User Story 3 - Generate speech audio from text (Priority: P3)

**Goal**: A Pi user can generate accessible speech audio from text with default or customized MiniMax speech settings.

**Independent Test**: Ask the agent to generate an MP3 saying a short phrase and verify the result reports a local audio file or URL, selected voice, selected model, and no accidental overwrite.

### Tests for User Story 3

- [x] T030 [P] [US3] Add unit tests for text-to-speech default option resolution and payload construction in index.test.ts
- [x] T031 [P] [US3] Add unit tests for text-to-speech parameter validation ranges and enums in index.test.ts
- [x] T032 [P] [US3] Add unit tests for generated audio filename creation and local no-overwrite behavior in index.test.ts
- [x] T033 [P] [US3] Add unit tests for hex audio decoding, missing audio errors, and URL-mode response handling in index.test.ts

### Implementation for User Story 3

- [x] T034 [US3] Add speech defaults and speech request helper types/constants in index.ts matching specs/001-new-tools/contracts/native-tools.md
- [x] T035 [US3] Add output path resolution helper in index.ts that supports explicit file path, explicit directory, `MINIMAX_MCP_BASE_PATH`, and current working directory
- [x] T036 [US3] Add generated audio write helper in index.ts that decodes MiniMax hex audio, creates parent directories, and refuses overwrites unless `allow_overwrite` is true
- [x] T037 [US3] Register `minimax_text_to_audio` in index.ts with contract-compliant name, label, description, cost-aware promptGuidelines, and TypeBox parameters
- [x] T038 [US3] Implement `minimax_text_to_audio` local-mode execution in index.ts using `callMiniMaxJson` with text, voice settings, audio settings, and language boost
- [x] T039 [US3] Implement `minimax_text_to_audio` URL-mode execution in index.ts by requesting URL output and returning the generated URL details
- [x] T040 [US3] Ensure `minimax_text_to_audio` result text includes output location, voice ID, model, and format in index.ts
- [x] T041 [US3] Document `minimax_text_to_audio` defaults, options, output modes, cost warning, and examples in README.md

**Checkpoint**: User Story 3 can generate speech audio independently, with voice listing available as an optional companion story.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate, document, and clean up the complete native tools feature.

- [x] T042 [P] Update README.md to clearly state Pi uses native MiniMax tools and does not require MCP setup
- [x] T043 [P] Add README.md note that voice cloning and async long-form TTS are intentionally out of scope
- [x] T044 Run `npm run check` and fix TypeScript errors in index.ts and index.test.ts
- [x] T045 Run `npm run lint` and fix lint errors in index.ts and index.test.ts
- [x] T046 Run `npm test -- --run` and fix failing tests in index.test.ts
- [x] T047 Run `npm run build` and verify dist output builds without publishing
- [x] T048 Manually follow specs/001-new-tools/quickstart.md with valid MiniMax credentials if available and record any deviations in README.md or specs/001-new-tools/quickstart.md
- [x] T049 Review package.json version and leave unchanged unless the user explicitly requests release preparation
- [x] T050 Confirm no npm publish or package release command was run for this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user story work.
- **US1 Search (Phase 3)**: Depends on Foundational; MVP scope.
- **US2 Image Understanding (Phase 4)**: Depends on Foundational; independent of US1 except shared helpers.
- **US4 Voice Listing (Phase 5)**: Depends on Foundational; can be implemented before US3 to support voice selection.
- **US3 Text-to-Speech (Phase 6)**: Depends on Foundational; can be implemented independently, but benefits from US4 for discovery.
- **Polish (Phase 7)**: Depends on selected user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories after Foundational.
- **US2 (P2)**: No dependency on other user stories after Foundational.
- **US4 (P3)**: No dependency on other user stories after Foundational.
- **US3 (P3)**: No hard dependency on US4, but recommended after US4 so users can discover voices before generating speech.

### Within Each User Story

- Tests should be written or updated before implementation tasks where practical.
- Tool registration should precede execution behavior validation.
- Execution behavior should precede README examples.
- Story checkpoint should be validated before moving to polish.

## Parallel Opportunities

- T002 and T003 can run in parallel during setup.
- T008 and T009 can run in parallel after foundational helper signatures are decided.
- Test tasks within each story marked `[P]` can run in parallel with each other.
- US1, US2, and US4 can be implemented in parallel after Phase 2 if developers coordinate edits to index.ts.
- Documentation tasks in README.md should not run in parallel with each other unless changes are coordinated.

## Parallel Example: User Story 1

```text
Task: "T010 [P] [US1] Add unit tests for minimax_web_search query validation and payload shape in index.test.ts"
Task: "T011 [P] [US1] Add unit tests for minimax_web_search missing credential and MiniMax error handling in index.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "T016 [P] [US2] Add unit tests for image MIME detection and data URL passthrough in index.test.ts"
Task: "T017 [P] [US2] Add unit tests for local image source normalization including leading @ handling in index.test.ts"
Task: "T018 [P] [US2] Add unit tests for minimax_understand_image missing content and invalid input errors in index.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T030 [P] [US3] Add unit tests for text-to-speech default option resolution and payload construction in index.test.ts"
Task: "T031 [P] [US3] Add unit tests for text-to-speech parameter validation ranges and enums in index.test.ts"
Task: "T032 [P] [US3] Add unit tests for generated audio filename creation and local no-overwrite behavior in index.test.ts"
Task: "T033 [P] [US3] Add unit tests for hex audio decoding, missing audio errors, and URL-mode response handling in index.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational helpers.
3. Complete Phase 3 MiniMax web search.
4. Stop and validate web search independently.
5. Demo MVP before adding image or speech tools.

### Incremental Delivery

1. Setup + Foundational helpers.
2. US1 search → validate → demo.
3. US2 image understanding → validate → demo.
4. US4 voice listing → validate → demo.
5. US3 text-to-speech → validate → demo.
6. Polish checks and documentation.

### Parallel Team Strategy

With multiple implementers:

1. One implementer completes shared helper contracts in Phase 2.
2. Separate implementers can prepare tests for US1, US2, US4, and US3.
3. Coordinate final edits to index.ts to avoid merge conflicts.
4. Run shared validation commands after integration.

## Notes

- `[P]` tasks target different concerns and can run in parallel if file conflicts are coordinated.
- Story labels map to user stories in specs/001-new-tools/spec.md.
- Tests should avoid live MiniMax calls; use deterministic stubs/mocks for helper behavior.
- Live MiniMax validation belongs in quickstart/manual verification, not automated tests.
- Do not publish the npm package as part of these tasks.
