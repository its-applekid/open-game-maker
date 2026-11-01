# OGM-087 — Narration pipeline (key-gated): implementation plan

## 1. Problem frame

Rendered narration needs a TTS adapter and a key; neither exists in V1. Everything around it can exist now: the host route over `Narration.render_to_file/3`, the content-hash cache in the blob store, the Opus transcode, and the SDK player with sentence highlighting, all proven with `FakeProvider`'s silent renders. The day a key and the upstream adapter land, the same code produces speech.

Requirements trace: **R21** (two-way voice behind a flag; captions always; nothing requires a paid provider) → captions and the `speechSynthesis` fallback work with no server; rendered narration is key-gated and fully tested with the fake.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/voice_converse/narration.ex` — options (`provider`, `privacy`, `credentials: {mod, id}`, `format`, `voice_id`, `max_chars`, `timeout_ms`), errors (`:unsupported`, `%{field, reason}`, `%Events.Error{}`), `render_to_file/3` result `%{path, format, alignment}`.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/test/voice_converse/narration_test.exs` — how the package tests the render path with `FakeProvider` and `StaticCredentials`; copy the setup.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/voice_converse/testing/fake_provider.ex` `silence/1` — the fixture alignment this plan hard-codes (250 ms per word).
- OGM-085 `lib/ogm_voice/http/{router,briefing}.ex` — the Plug route and header-check shape.
- OGM-080 `services/api/src/build-chat/outbox.ts` — the outbox handler shape for `narration.render`.
- OGM-027 `packages/sdk/src/audio/` — how a buffer is played on a bus (`play`, `voice` bus) and the unlock rule; `SpokenText` uses those exports only.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added; ffmpeg is a host binary); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Host route `/internal/narration`

Goal: wrap `render_to_file/3` behind the internal HTTP.
Files:
- Create `services/voice-host/lib/ogm_voice/http/narration.ex`.
- Modify `lib/ogm_voice/http/router.ex` (one `post` line).
- Test `test/ogm_voice/narration_http_test.exs`.
Approach: parse `{text, voice_id, format}` (format default `pcm_24000`, must be one of the three); `key = sha256(text <> voice_id <> provider_id)` hex for the file name; `path = Path.join(render_dir, key <> ".wav")`; `Narration.render_to_file(text, path, provider: OgmVoice.Config.provider_module(), privacy: config.privacy, credentials: {OgmVoice.Ports.Credentials, OgmVoice.Config.provider_id()}, format: format, voice_id: voice_id, timeout_ms: 60_000)`; map results: `{:ok, %{path, format, alignment}}` → 200 `{wav_path, format, alignment}`; `{:error, :unsupported}` → 501; `{:error, %{field: :text, reason: :too_long}}` → 400; `{:error, %Events.Error{code: :provider_auth}}` → 503; other provider errors → 502 with the code only. `render_dir` from `OGM_VOICE_RENDER_DIR` (created at boot, 0700). `OgmVoice.Ports.Credentials.fetch(:fake, :render)` returns `{:ok, "fake"}` (OGM-085).
Interface sketch: `POST /internal/narration {"text":"hello there little fox","voice_id":"default","format":"pcm_24000"} → 200 {"wav_path":"…/<key>.wav","format":"pcm_24000","alignment":[{"text":"hello","start_ms":0,"end_ms":250},…]}`.
Test scenarios:
- Given the fake provider, then 200 with 4 segments and the WAV exists with a RIFF header and 24 kHz.
- Given 6,000 chars, then 400.
- Given a test provider module without `render_speech/1`, then 501.
- Given the credentials port returning `:missing` for `:render`, then 503.
- Given a wrong internal header, then 401.

### U2. Key, cache and render (API)

Goal: render once per key, transcode, store.
Files:
- Create `services/api/src/narration/{key.ts,cache.ts,render.ts,routes.ts}`.
- Test `__tests__/{key.test.ts,render.test.ts}` with a fake host (Node `http`) and a temp blob root.
Approach: `narrationKey({ text, voice, engine, version: 1, speed, lang })` = sha256 of `JSON.stringify` with sorted keys. `cache.has(key)` = `BlobStore.exists("narration/" + key + ".opus")` (OGM-005; add `exists` if missing). `renderLine(line)`: if cached → `{cached: true}`; else POST the host (`OGM_VOICE_INTERNAL_URL + "/internal/narration"`, header), then `execFile("/usr/bin/ffmpeg", ["-y","-i", wav, "-c:a","libopus","-b:a","48k", opus])`, `BlobStore.put` for `.opus` and `.json` (`NarrationMeta` with `duration_ms` = last `end_ms`), delete the WAV and the temp Opus, return `{ id, key, audio_url: signedGet, alignment_url, cached: false }`; 501 from the host → `{ status: "unsupported" }` (not cached); run with a concurrency limiter of `OGM_NARRATION_CONCURRENCY`. Route `POST /api/v1/games/:gameId/narration/render` → `authorize(actor, "game.edit", …)`, ≤ 25 lines, each ≤ 5,000 chars, returns the array; internal callers (OGM-045's build registration) use the service-token path OGM-010 defines.
Interface sketch:
```ts
export function narrationKey(i: NarrationKeyInput): string;                       // sha256 hex of canonical JSON
export async function renderLine(gameId: string, line: { id: string; text: string; voice?: string; lang?: string }): Promise<
  { id: string; key: string; audio_url: string; alignment_url: string; cached: boolean } | { id: string; status: "unsupported" | "failed"; reason: string }>;
// POST /api/v1/games/:gameId/narration/render { "lines": [{ "id": "intro", "text": "hello there little fox. good luck" }] }
// → 200 [{ "id": "intro", "key": "3f9c…", "audio_url": "https://…/blobs/sha256/…?exp=…&sig=…", "alignment_url": "https://…", "cached": false }]
```
Test scenarios:
- Given two key inputs with different key order, then equal keys; changing `voice` changes it.
- Given a fresh key, then the fake host is called once, ffmpeg runs, two blobs exist; a second call is `cached: true` and the host counter is unchanged.
- Given the host returns 501, then `unsupported` and no blob.
- Given ffmpeg fails (bad WAV), then `failed`, no blob, no leftover file.
Execution note: ffmpeg is at `/usr/bin/ffmpeg` on this host; CI runners have `ffmpeg` via `apt` in the workflow or the transcode test is skipped with a named reason (no silent skip).

### U3. Outbox handler `narration.render`

Goal: let a build request renders from the sandbox.
Files:
- Create `services/api/src/narration/outbox.ts`.
- Test `__tests__/outbox.test.ts`.
Approach: handler `{ type: "narration.render", handle(line, ctx) }` validates `payload.lines` (same shape as the route) and calls `renderLine` for each with the job's game id (from the job row), then posts one `kind: "text"` system row to the chat ("Rendered 3 lines, 1 cached") through `ctx.store`/`ctx.publish` (OGM-080). The writer of the line is T10's `gm narrate` (not this ticket); the payload shape is documented in the handler's doc comment.
Interface sketch:
```ts
// AgentOutboxLine with type "narration.render" (envelope from OGM-080):
// { "v": 1, "id": "<ulid>", "job_id": "j_01", "at": "…", "type": "narration.render",
//   "payload": { "lines": [{ "id": "intro", "text": "hello there little fox. good luck", "voice": "default", "lang": "en" }] } }
export const handler: OutboxHandler = { type: "narration.render", handle };
```
Test scenarios:
- Given a line with two items, then two renders and one system row.
- Given an invalid payload, then it is skipped and logged.

### U4. SDK `SpokenText`

Goal: play a rendered line with sentence highlighting; fall back to `speechSynthesis`.
Files:
- Create `packages/sdk/src/audio/spoken-text.ts`, `packages/sdk/src/audio/sentences.ts`.
- Modify `packages/sdk/src/audio/index.ts` (export).
- Test `packages/sdk/test/spoken-text.test.ts`, `packages/sdk/e2e/spoken-text.spec.ts`; fixtures `fixtures/narration/hello.opus`, `fixtures/narration/hello.alignment.json`.
Approach: `sentences.ts`: `groupSentences(alignment)` → `[{ text, start_ms, end_ms, words }]` splitting after a word ending in `.`, `!`, `?` (abbreviation list shared idea with OGM-083 but implemented here; no cross-package import). `SpokenText.load()` fetches the Opus (`AudioContext.decodeAudioData` via the SDK's context from OGM-027) and the alignment JSON; `play()` plays on the `voice` bus (`audio.playBuffer(buffer, { bus: "voice" })` — if OGM-027 exposes only id-based `play`, add a `playBuffer` export there as the one adjacent change), schedules `onSentence(i, text)` with `setTimeout` against `context.currentTime`, `onEnd` on the source's `ended`; `cancel()` stops the source and clears timers. `fromText(text, lang)` splits sentences with the same function on raw text and uses `speechSynthesis` with one utterance per sentence; `isAvailable()` tells the game whether audio exists so it can choose. Respects the SDK unlock: `play()` before unlock rejects with `audio_locked`.
Interface sketch: as in the ticket's contract block.
Test scenarios:
- Given the fixture alignment "hello there little fox. good luck", then two sentences with boundaries at 1,000 ms.
- Given `play()` with fake timers, then `onSentence(0)` at 0 ms and `onSentence(1)` at 1,000 ms, `onEnd` at 1,500 ms.
- Given `cancel()` at 500 ms, then no second callback.
- Given `fromText` with stubbed synthesis, then two utterances.
- Playwright (`--autoplay-policy=no-user-gesture-required`, GPU flags, software fallback allowed): the Opus plays on the `voice` bus and `onEnd` fires within 2 s.

### U5. Manifest entry and docs

Goal: the loader and build pipeline know the shape.
Files:
- Create `services/api/src/narration/README.md` documenting `NarrationManifestEntry` and the request to OGM-063 to emit it; the SDK README gains the `SpokenText` usage (five lines). Do not touch `packages/contracts/src/assets.ts` (OGM-060/063's file).
Approach: keep the type in `packages/sdk/src/audio/spoken-text.ts` as the SDK's input shape; OGM-063 copies it when it writes manifests.

## 4. Verification

```
mise exec -C services/voice-host -- mix test
pnpm --filter @ogm/api test -- narration
pnpm --filter @gm/sdk test -- spoken-text
pnpm --filter @gm/sdk e2e -- spoken-text      # Playwright; --use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist, GM_VERIFY_SOFTWARE_GL=1 fallback
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: `mix test` summary; the API test showing one host call and `cached: true` on the second; the SDK unit counts and the Playwright `onEnd` timing.

## 5. Deferred to implementation

- Opus bitrate: default 48 kbps mono; MP3 as a second file is not produced (narration is not a sample asset).
- Blob key layout: default `narration/<key>.opus` and `.json`; if OGM-005 enforces `sha256/<hex>` only, store under that and keep an index row `narration_renders(key, opus_sha, json_sha)` with a timestamped migration.
- Where sentence boundaries come from when alignment has no punctuation: default one sentence per 12 words.
- `playBuffer` in OGM-027: default add it if absent (small, additive).

## 6. Scope boundaries

- Live voice and captions: OGM-083/085. Budget: OGM-086.
- `gm narrate` and the dialogue skill: OGM-095 (T10).
- Manifest emission: OGM-063; loader: OGM-026; audio context and unlock: OGM-027.
- The real adapter: upstream aiur.

## 7. Risks

- No adapter implements `render_speech` upstream for a long time → default: the pipeline ships with the fake; games use captions and `fromText()`; nothing blocks V1.
- ffmpeg absent on CI → default: the transcode test is skipped with a printed reason and runs on this host (pasted).
- `decodeAudioData` for Opus on iOS Safari: supported in WebM/Ogg containers since iOS 17; default: produce `.opus` in an Ogg container (`-f ogg`) and, if the e2e on a real iPhone fails later, add an AAC `.m4a` second file (deferred).
- Alignment from a real adapter may be character-based → default: normalise to word segments in the host route before returning.
