# OGM-027 plan — Audio module

## 1. Problem frame

Every game plays sound from inside a cross-origin iframe. The prototypes proved the mixer (buses, pitch variation, crossfades, loop points) and the iOS rules (unlock on `pointerup`/`touchend`, `audioSession: playback`, background-tab suspend) but as untested JavaScript in two files. The SDK needs one owned `AudioContext` so Tone.js, samples and ZzFX share buses, an offline render for loudness checks, and a relay path for the case iOS refuses audio inside the iframe.

Requirements trace:
- R46 → SDK-owned context with buses, unlock on first pointerup, `audioSession` playback, ZzFX, optional Tone.js `song.json`, MP3 samples, offline `renderCue`, `audio.relay` fallback.
- D-HOOKS → `renderCue` is reachable through the test surface so `gm test` can call it over the bridge.

## 2. Patterns to follow

- `prototypes/ui-v0/site/js/audio.js:3-6` (context, master, three buses), `:38-44` (`play` with pitch variation), `:48-57` (music crossfade with `setTargetAtTime`): port line by line into `buses.ts`, `samples.ts`, `music.ts`.
- `prototypes/studio-v0/sound.js:72-73` (`ramp`, `end`), `:76-91` (loop points, intro-once set), `:163-174` (`unlock`), `:186-187` (statechange replay and capture listeners), `:200-205` (visibility): port into `unlock.ts` and `music.ts`.
- `prototypes/studio-v0/title-town.js:30-33`: the parent-side consumer of relayed cues; the shape to emit.
- `docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §3.6: `renderCue` returns peak and RMS; LUFS is out of scope.
- `/home/orangekid/github/aiur/packages/aiur-contracts/fixtures/`: fixture-per-schema layout to copy for `song.json` examples.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (audio specs add `--autoplay-policy=no-user-gesture-required` and need no GPU); services bind `127.0.0.1` (the fixture server too); secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars without naming the exception (`zzfx` 806 stars: exception already recorded in the decision log); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Context, buses, unlock

Goal: one context, four buses, iOS-correct unlock, settings applied to master.

Files:
- Create: `packages/sdk/src/audio/context.ts`, `buses.ts`, `unlock.ts`, `index.ts`, `test/fake-audio.ts`, `context.test.ts`, `unlock.test.ts`.

Approach: `createAudio(opts: { rng: () => number; bridge?: GameBridge; win?: Window; AudioContextCtor?: typeof AudioContext })`. `context.ts` builds `ctx = new (AudioContextCtor ?? win.AudioContext ?? win.webkitAudioContext)()`, `master` gain, and `buses = { music: .45, sfx: .8, amb: .6, voice: 1 }` each a gain into `master` (`audio.js:6` values; `voice` new for OGM-087). `unlock.ts`: `unlock()` sets `navigator.audioSession.type = 'playback'` in try/catch, returns if running or `document.hidden`, calls `ctx.resume()` then plays a 1-sample silent buffer (`sound.js:172-173`); registers `pointerup`, `touchend`, `keydown`, `click` with `{capture: true}` on `win`; `statechange` notifies listeners and replays `want` (`music`, `scape`) when running; `visibilitychange` suspends when hidden and resumes if it was running. `status()` returns `'off'` when muted, `'on'` when running, else `'tap'`. `applySettings({mute, volume})` ramps master (`setTargetAtTime`, 0.05 s).

Interface sketch:
```ts
export interface GmAudio {
  readonly context: AudioContext; readonly buses: Record<'music'|'sfx'|'amb'|'voice', GainNode>;
  unlock(): void; status(): 'tap' | 'on' | 'off'; onStatus(cb: (s: string) => void): () => void;
  applySettings(s: { mute: boolean; volume: number }): void; dispose(): void;
}
```

Test scenarios (fake context records node graph and gain automation):
- Given a fresh audio when created then four bus gains connect to master and master to destination.
- Given `state: 'suspended'` when a `pointerup` is dispatched on `win` then `resume` was called once and a 1-frame buffer source started.
- Given `state: 'interrupted'` when `unlock()` runs then `resume` is called (iOS case).
- Given `applySettings({mute:true, volume:.5})` when applied then master's target is 0; with `mute:false` it is 0.5.
- Given `document.hidden` when `unlock()` runs then nothing is called.

Execution note: write `fake-audio.ts` first (createGain, createBufferSource, createBuffer, decodeAudioData, resume, state, listeners) and keep it under 80 lines; it is reused by every unit here.

### U2. Samples and music

Goal: `play`, `playOneOf`, `music` with crossfade and loop points, loader-backed decoding.

Files:
- Create: `packages/sdk/src/audio/samples.ts`, `music.ts`, `samples.test.ts`, `music.test.ts`.

Approach: `samples.ts` keeps `Map<id, Promise<AudioBuffer | null>>`; `load(id)` uses `opts.loader?.audio(id)` (OGM-026) when present else `fetch(opts.resolveUrl(id))` + `ctx.decodeAudioData`; failures warn once and resolve `null`. `play(id, {vol=1, pitch=.06, rate=1, bus='sfx', at})`: refuse unless `ctx.state === 'running'` (or relay on, U4); `playbackRate = rate * (1 + (rng()*2-1) * pitch)`; gain → bus; returns a handle with `stop()`. `playOneOf(ids, opts)` picks with `rng`. `music.ts`: one track at a time; `music(id, {fade=1.2, vol=1, loop?})`: fade the old gain to 0 with `setTargetAtTime(0, t, fade/4)` and stop it after `fade*2` s; the new source loops with `loopStart/loopEnd` when `loop` is given, starting at `loop[0]` when the intro already played (`introDone` set, `sound.js:77-90`); `music(null)` stops. `want` state is replayed on `statechange`.

Interface sketch:
```ts
play(id: string, o?: { vol?: number; pitch?: number; rate?: number; bus?: BusName; at?: number }): { stop(): void } | null;
playOneOf(ids: string[], o?): ReturnType<typeof play>;
music(id: string | null, o?: { fade?: number; vol?: number; loop?: [number, number] }): void;
```

Test scenarios:
- Given seed 1 when `play('a', {pitch:.1})` runs twice then the two playback rates equal the values the seeded RNG dictates (snapshot), proving no `Math.random`.
- Given a running track when `music('b')` runs then the old gain targets 0 and the new source starts at 0 with gain rising to `vol`.
- Given `loop:[55.9, 133.9]` played twice when the second `music` starts then `start(0, 55.9)` was used.
- Given `state: 'suspended'` when `play` runs then no source is created and `null` returns.

### U3. ZzFX, song.json and renderCue

Goal: synthesized effects, data-driven music behind a lazy import, offline measurement.

Files:
- Create: `packages/sdk/src/audio/zzfx.ts`, `song.ts`, `song.schema.ts`, `render.ts`, `fixture/song.example.json`, `song.test.ts`, `render.ts` tests in `browser.spec.ts` (U5).

Approach: `zzfx.ts` imports `zzfxG` (buffer generator) from `zzfx`, renders the parameter array to a buffer with `ctx.createBuffer`, caches by `JSON.stringify(params)`, plays through `play`-style routing on the chosen bus (`zzfxP` is not used so the SDK context stays the only one). `song.schema.ts` (Zod 4): `{ version: 1, bpm: number (40–240), loopBars: number, tracks: Array<{ id, instrument: 'synth' | 'fm' | 'membrane' | 'pluck' | 'sampler', sampler?: Record<note, assetId>, volumeDb?: number, pattern: Array<{ t: string /* bars:beats:sixteenths */, n: string, d: string, v?: number }> }> }` with max 16 tracks and 2048 notes. `song(json)`: parse first (reject before any import), then `const Tone = await import('tone')`, `Tone.setContext(ctx)`, build instruments into `buses.music`, schedule with `new Tone.Part(...)` on `Tone.getTransport()` (never the deprecated global), `loop = true`, `loopEnd = loopBars + 'm'`, start; `stop()` disposes parts and instruments. `render.ts`: `renderCue(id, {seconds?})`: decode the sample (or regenerate zzfx) into an `OfflineAudioContext(1, sr*len, sr)`, play it through a copy of the bus gain, `startRendering()`, compute `peak = max|x|`, `rms = sqrt(mean x²)`, return `{ peakDb: 20log10(peak), rmsDb: 20log10(rms) }` (−Infinity for silence).

Interface sketch:
```ts
zzfx(params: number[], o?: { vol?: number; bus?: BusName }): void;
song(json: unknown): Promise<{ stop(): void }>;         // validated, then Tone.js loaded
renderCue(id: string, o?: { seconds?: number }): Promise<{ peakDb: number; rmsDb: number }>;
```

Test scenarios:
- Given `fixture/song.example.json` when parsed then it validates; given 17 tracks then it fails naming `tracks`.
- Given an invalid song when `song()` runs then the dynamic import spy did not fire.
- Given the same zzfx params twice when played then the buffer was generated once.

### U4. Relay

Goal: cues cross to the host when the iframe cannot play.

Files:
- Create: `packages/sdk/src/audio/relay.ts`, `relay.test.ts`.

Approach: `relay(on: boolean)`; when on, `play` and `music` post `audio.relay` through `opts.bridge.send` (`{cue: id, vol, rate}` for one-shots, `{loop: id, gain}` for music; `gain 0` stops) and do not create local sources; `zzfx` has no relay (synthesised buffers cannot cross; documented). The host (OGM-028) turns the relay on through the `hello` capability list (`capabilities` includes `'audio.relay'`) or at runtime by a `settings`-adjacent host message if OGM-020 adds one; default: capability at hello.

Test scenarios:
- Given relay on when `play('hit', {vol:.6, rate:1.2})` runs then one `audio.relay` `{cue:'hit', vol:.6, rate:1.2}` is sent and no source is created.
- Given relay on when `music('theme')` then `music(null)` runs then `{loop:'theme', gain:1}` then `{loop:'theme', gain:0}` are sent.
- Given relay off when `play` runs then nothing is sent.

### U5. Browser spec and fixture

Goal: prove unlock, offline render and lazy Tone in a real Chromium.

Files:
- Create: `packages/sdk/src/audio/fixture/index.html`, `fixture/sine.mp3`, `browser.spec.ts`; `packages/sdk/playwright.config.ts` if OGM-022 did not add one.

Approach: a Vite-built fixture page imports `createAudio` and exposes it on `window.__audio`. Spec launches Chromium (`--autoplay-policy=no-user-gesture-required`), serves `fixture/` on `127.0.0.1`, calls `unlock()` after `page.mouse.click`, asserts `status() === 'on'`; calls `renderCue('sine')` and checks `peakDb ≈ -3 ± 1`, `rmsDb ≈ peakDb - 3.01 ± 0.3`; reads `page.on('request')` to assert no `tone` chunk before `song()` and one after.

Test scenarios:
- Given the fixture when a click happens then status is `on` within 1 s.
- Given `renderCue('sine')` when awaited then the numbers match the generated fixture.
- Given `song(example)` when awaited then a request for the Tone chunk appears only after the call.

## 4. Verification

```
pnpm --filter @gm/sdk test -- audio
pnpm --filter @gm/sdk test:browser -- audio
pnpm --filter @gm/sdk typecheck && pnpm -r lint
```
Paste the Vitest summary, the Playwright summary with the three spec names, and one line showing a unit failing with the relay branch removed.

## 5. Deferred to implementation

- Bus default gains: default `audio.js:6` values plus `voice: 1`.
- Whether `playOneOf` avoids immediate repeats: default no (the RNG decides; skills can pass two-element lists).
- Fixture generation at test time versus checked-in MP3: default check in the 8 KB file.
- `renderCue` default length: default the buffer length, capped at 10 s.

## 6. Scope boundaries

- Host playback of relayed cues: OGM-028 (forwarding) and OGM-071 (`sound.ts`).
- Loudness verdicts and budgets: OGM-093.
- MP3 conversion and audio cards: OGM-065, OGM-063.
- Narration and spoken text: OGM-087.
- Hook plumbing for `test.*`: OGM-022 (this module only exposes `renderCue`).

## 7. Risks

- iOS cross-origin autoplay unverified (E04-6): default ship the relay and the real-iPhone check named in the ticket.
- Tone.js 15 API drift (`Transport` deprecated): default `getTransport()`, pinned `tone@15.x`.
- `zzfx` star rule: default use the recorded exception; the generator is 1 file, so vendoring is the fallback if the package is withdrawn.
- A fake `AudioContext` can hide graph mistakes: default keep the Playwright spec as the truth for routing (`renderCue` numbers only come out right if the graph is right).
