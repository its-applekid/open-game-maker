# OGM-083 — Voice client, dictation and read-aloud: implementation plan

## 1. Problem frame

The web app needs voice input and output that cost nothing today and switch to two-way voice the day a key exists (D-VOICE-ZERO). Two-way voice is `voice_converse`'s v1 wire protocol over a WebSocket; the only client is a 242-line JS module with deprecated audio capture and no captions. Dictation and read-aloud are browser APIs. This package ports the client to TypeScript with AudioWorklet capture, adds a caption model, dictation and read-aloud, and proves the wire with the upstream fixture.

Requirements trace: **R21** (text and browser dictation always; two-way voice behind a capability flag when a provider is configured; nothing requires a paid provider) → `Dictation` and `speak()` work with no server; `VoiceClient` is complete and e2e-tested against a fake server so OGM-085 + a key turns it on.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/elixir/voice_converse/priv/static/voice_converse_client.js` — port function by function: `connect`, `send`, `receive`, `enqueueAudio/playNext/stopPlayback`, `renderDraft/updateDraft`, `resamplePcm16`, `bytesToBase64/base64ToBytes`.
- `/home/orangekid/github/aiur/packages/aiur-contracts/scripts/validate-voice-converse-frame.mjs` and `fixtures/voice-converse.v1.json` — the fixture round-trip test.
- `/home/orangekid/github/aiur/packages/aiur-contracts/scripts/generate.mjs` — how the `.generated.ts` is produced (`json-schema-to-typescript`); the sync script copies the output rather than regenerating.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/voice_converse/transport/websock.ex` — `?token=` for browsers, `4401` close, 400,000-byte frame cap, `text` refused: the client mirrors these.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/sound.js` lines 163–187 — iOS unlock on `pointerup`/`touchend` and `navigator.audioSession.type = 'playback'`; reuse for the playback context.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1` (the fake server in e2e does); secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars without naming the exception (`ajv` 14k, `ws` 22k); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Vendored wire contract

Goal: frame types, schema and fixture pinned to aiur `0f692a45b`, with a sync script.
Files:
- Create `packages/voice-client/src/wire.ts`, `packages/voice-client/schemas/voice-converse.v1.schema.json`, `packages/voice-client/fixtures/voice-converse.v1.json`, `packages/voice-client/scripts/sync-aiur-contracts.mjs`.
- Test `packages/voice-client/test/wire.test.ts`.
Approach: the script copies the three files from `$AIUR_CHECKOUT/packages/aiur-contracts/{src/voice-converse.generated.ts,schemas/…,fixtures/…}` and prepends `// vendored from aiur <sha> (git -C $AIUR_CHECKOUT rev-parse HEAD at sync time); do not edit` to `wire.ts`; `--check` re-copies to a temp dir and diffs. `wire.ts` also exports `encode(frame)` (adds `v: 1`, JSON) and `decode(text)` (JSON parse, `v === 1`, `type` is a known string; unknown extra fields kept), plus `ServerFrame`/`ClientFrame` unions narrowed from `VoiceConverseFrame` by `type`.
Interface sketch: `export type VoiceConverseFrame = …generated…; export function decode(text: string): ServerFrame; export function encode(frame: Omit<ClientFrame, "v">): string;`
Test scenarios:
- Given every fixture frame, when `decode(JSON.stringify(f))`, then equal to `f`.
- Given `{v:2,type:"state"}`, then `unsupported_version`.
- Given `{v:1,type:"nope"}`, then `invalid_frame`.
- Given the fixture validated with ajv against the vendored schema, then valid.
- Given `sync --check` after editing `wire.ts`, then exit 1.

### U2. Audio capture (AudioWorklet) and playback

Goal: 16 kHz PCM16 chunks out, PCM playback in, both without ScriptProcessor.
Files:
- Create `src/audio/capture-worklet.ts` (the processor; built as its own entry), `src/audio/capture.ts`, `src/audio/playback.ts`.
- Test `test/resample.test.ts`.
Approach: `capture.ts`: `getUserMedia({ audio: { echoCancellation: true } })`, `AudioContext`, `addModule(workletUrl)`, `AudioWorkletNode("ogm-capture")`; the processor accumulates 128-frame blocks, posts ~100 ms Float32 slices; the main thread resamples with the ported `resamplePcm16(samples, ctx.sampleRate, 16000)`, base64-encodes and hands the string to a sink. `playback.ts`: queue of `{format, data_b64}`; decode `pcm_<rate>` into an `AudioBuffer` at that rate on a shared `AudioContext` (created or resumed inside the same gesture; on iOS set `navigator.audioSession.type = "playback"` when present); `stop()` empties the queue and stops the current source.
Interface sketch: `export async function startCapture(onChunk: (b64: string) => void): Promise<{ stop(): void; context: AudioContext }>`; `export class PcmPlayer { enqueue(f: { format: string; data_b64: string }): void; stop(): void }`.
Test scenarios:
- Given 48 kHz sine samples, when resampled to 16 kHz, then length ≈ n/3 and values within [-32768, 32767].
- Given an unsupported format `opus`, then `enqueue` ignores it.

### U3. `VoiceClient`

Goal: the typed client.
Files:
- Create `src/client.ts`, `src/index.ts`.
- Test `test/client.test.ts` (with a mock `WebSocket`).
Approach: constructor stores `url`, `token`, `target`; `startFromGesture()` → `startCapture` (U2), `new WebSocket(url + "?token=" + encodeURIComponent(token))`, on open send `start{target}`; chunks → `audio{data_b64}`; incoming → `decode` → dispatch by `type` to listeners; `agent_audio` → `PcmPlayer.enqueue`; `interrupted` → `stop()`; `error` → listeners; close code `4401` → emit `error{code:"unauthorized"}`; `end()` sends `end`, stops capture and playback; `sendText()` only when `capabilities.text` was set by the host (default false); `minutes()` from the `start` send time to `ended`/close. Never log frames with `data_b64` or the token.
Interface sketch: as in the ticket's contract block.
Test scenarios:
- Given a mock socket, when `startFromGesture()`, then the URL carries the token and the first frame is `start`.
- Given an incoming `agent_text`, then the listener receives it typed.
- Given close `4401`, then `error.code === "unauthorized"`.
- Given `interrupted`, then `PcmPlayer.stop` was called.

### U4. Captions reducer and sentence splitting

Goal: a renderer-free model for the two-column captions.
Files:
- Create `src/captions.ts`, `src/sentences.ts`.
- Test `test/captions.test.ts`, `test/sentences.test.ts`.
Approach: state `{ you: Line[]; builder: Line[] }`, `Line = { id, text, final, turn_id? }`; `transcript{partial}` replaces the open `you` line, `final` closes it; `agent_text` accumulates per `turn_id` and splits with `splitSentences()` (`.`, `!`, `?`, newline; abbreviations list small and explicit) so the panel can highlight the sentence being spoken; `interrupted` marks the turn's trailing line `cut`. Pure functions.
Test scenarios:
- Given partial "make", partial "make the", final "make the door", then one `you` line "make the door" final.
- Given two `agent_text` chunks forming "Sure. I'll start now", then two builder sentences.
- Given `interrupted`, then the last builder line has `cut: true`.

### U5. Dictation (Web Speech API)

Goal: push-to-talk dictation with review-before-send.
Files:
- Create `src/dictation.ts`.
- Test `test/dictation.test.ts` with a stub `SpeechRecognition`.
Approach: `isSupported()` checks `window.SpeechRecognition ?? window.webkitSpeechRecognition`; `pressStart()` creates a recognizer with `continuous: false`, `interimResults: true`, `lang` from the page; `onresult` emits `transcript{kind:"partial"}` for interim and buffers finals; `pressEnd()` calls `stop()` and on `onend` emits one `transcript{kind:"final", text}` (joined finals) — the UI shows it as an editable draft and sends it to the chat (OGM-080 `POST …/chat`) only on confirm; `onerror` maps `not-allowed` → `mic_denied`, `no-speech` → `final` with empty text; `vendorNote` constant for the settings notice (E06-11).
Test scenarios:
- Given interim results "mak", "make the", then two `partial` events.
- Given a final result and `pressEnd()`, then exactly one `final`.
- Given `pressEnd()` without results, then `final` with `""`.
- Given `not-allowed`, then `error{code:"mic_denied"}`.

### U6. Read-aloud

Goal: `speak()` with sentence highlighting.
Files:
- Create `src/speak.ts`.
- Test `test/speak.test.ts` with a stub `speechSynthesis`.
Approach: split with U4's `splitSentences()`; one `SpeechSynthesisUtterance` per sentence, chained on `onend`; `onSentence(i, text)` before each; `cancel()` calls `speechSynthesis.cancel()` and stops the chain; `lang`/`rate` passthrough; voice selection left to the browser default (no voice picker). Boundary events are not used (unreliable on iPad, B2 §3.4).
Test scenarios:
- Given three sentences, then `onSentence` is called with 0, 1, 2 in order and `onEnd` once.
- Given `cancel()` after the first, then no further `onSentence`.

### U7. Playwright e2e with a fake voice server

Goal: prove the client end to end in a real browser without the Elixir host.
Files:
- Create `e2e/fake-voice-server.mjs` (Node `ws` on `127.0.0.1`, random port; accepts `?token=good`, closes `4401` otherwise; replies to `start` with `state{listening}`, after 1 s sends `agent_text` and one `agent_audio` (silence, `pcm_24000`), then a `draft`), `e2e/page.html`, `e2e/client.spec.ts`, `playwright.config.ts` with the GPU flags and fake media flags.
Approach: the page loads the built package, binds a button that calls `startFromGesture()`; the spec clicks it, asserts ≥ 5 `audio` frames arrived at the server with base64 length consistent with 16 kHz PCM16 (~3,200 bytes per 100 ms), asserts `AudioContext.currentTime` advanced after `agent_audio`, clicks Confirm and asserts `confirm_draft`; a second test with `?token=bad` asserts `error.code === "unauthorized"`.
Test scenarios:
- as above (happy, bad token).
Execution note: run with `GM_VERIFY_SOFTWARE_GL=1` if ANGLE/EGL is unavailable on the runner; audio does not need the GPU.

## 4. Verification

```
pnpm --filter @ogm/voice-client sync-contracts -- --check
pnpm --filter @ogm/voice-client test
pnpm --filter @ogm/voice-client e2e        # Playwright: --use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: unit counts, the e2e summary (frames received, bytes per frame), and the `sync --check` result with the pinned sha.

## 5. Deferred to implementation

- Worklet packaging: default a second Vite entry emitting `capture-worklet.js` beside the package output; `new URL(…, import.meta.url)` at runtime.
- Chunk size: default ~100 ms (1,600 samples at 16 kHz).
- Sentence splitter abbreviations: default a short fixed list (`e.g.`, `i.e.`, `Mr.`, `Dr.`); no NLP dependency.
- `text` frame support: default disabled until a host advertises it (`capabilities.text`).

## 6. Scope boundaries

- Token route, wss URL, host service, ports: OGM-085.
- React rendering of captions, drafts, push-to-talk, "Type instead": OGM-076 and OGM-074.
- Budget rules and role text: OGM-086.
- Narration audio and the SDK player: OGM-087.
- Settings notice text placement: OGM-079/071.

## 7. Risks

- AudioWorklet on iOS Safari inside the app page: supported since iOS 14.5; default: fall back to `ScriptProcessor` behind a feature check only if `audioWorklet` is undefined, with a console warning (keeps the reference behaviour).
- `webkitSpeechRecognition` on iPhone needs a real-device check (named human evidence); default: `isSupported()` gates the button.
- Upstream wire changes after `0f692a45b`: the sync script's `--check` in CI is skipped when `$AIUR_CHECKOUT` is absent (GitHub runners); default: run it locally and paste the result; the vendored sha is in the header.
- Vite library build for a worklet entry can be fiddly; default: plain `tsc` output plus one `esbuild` call for the worklet (esbuild 38k stars).
