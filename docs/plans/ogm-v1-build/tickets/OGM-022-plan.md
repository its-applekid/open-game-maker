# OGM-022 — SDK core and test hooks: implementation plan

## 1. Problem frame

Every game runs the same loop: handshake with the host, mount the module from the effective design, step a fixed clock with a seeded RNG, apply design patches live, serialize and restore saves, and expose test hooks that verify tooling and conformance drive. The prototype had all of this as untyped globals in one 865-line file (`dungeon.js`). This ticket is the engine-agnostic core of `@gm/sdk` with a pure fixture game so the whole suite runs in Node.

**Requirements trace.** R41: `GameModule`/`GameInstance` runtime, deterministic `applyDesign` dispatch, `serialize`/`restore`/`migrate` plumbing (`core/boot.ts`); pick and placement validation are routed to the instance's optional methods; per-player hooks are forwarded to `net`. R42: all `GmTestHooks` members over `test.*` and as gated globals (`test/*`).

## 2. Patterns to follow

- `prototypes/ui-v0/site/js/dungeon.js:861-865`: `tick(sec)` loops `Math.round(sec * 60)` fixed steps calling `updatePlay(1/60)` and mixers, then one render. Copy the "no render until the last step" rule; replace rounding with an accumulator.
- `prototypes/ui-v0/site/js/dungeon.js:847-860`: `frame(now)` clamps `dt` to 50 ms and renders; keep the clamp for the live loop.
- `prototypes/title-city/city.js:877-880,943-958`: `window.__marks` as `[name, ms][]`, `frame(t)` as a pure function of time, `window.__ready = true` last. Copy the marks vocabulary (`start`, …, `frame0`).
- `prototypes/title-city/city.js:22` and `fx.js:22-23`: the LCG seed pattern; the SDK uses mulberry32 but the same "one seed, reseed, no `Math.random`" rule.
- `docs/research/v0.3/A4-engine-sdk-editor.md` §10.1 "Feature modules register with a tiny registry": `defineFeature({id, schema, controls, system, save})` composing manifest, design schema and save schema.
- `prototypes/ui-v0/tools/e2e.mjs:37-55`: how verify drives the hook (`tick` between key presses); the `__gm.tick(seconds)` alias keeps this script shape valid.
- OGM-021's `test/e2e.test.ts` helper for two jsdom windows: reuse it for the handshake tests.

## 3. Implementation units

### U1 — Package and the pure fixture game
- **Goal:** `@gm/sdk` exists; a `GameModule` with no engine exercises every seam.
- **Files:** Create `packages/sdk/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `test/fixtures/counter-game.ts`.
- **Approach:** deps `@ogm/contracts`, `@ogm/iframe-bridge` (`workspace:*`), `zod` (same pin as contracts); devDeps `jsdom`. Fixture: `designSchema = z.object({ speed: z.number().min(1).max(10), entities: z.record(z.object({x, y})) })`, controls `player.speed` (slider) and `entity.place` (place), `mount` returns an instance whose state is `{ entities, counter, players: Map }`, `applyDesign` returns `'live'` for `/speed` patches and `'restart-scene'` otherwise, `serialize` returns `{saveSchemaVersion: 1, data}`, `net` hooks spawn/despawn into `players`, `hud` returns `{ counter }`. The fixture's `system` increments `counter` once per step when action `go` is true.
- **Interface sketch:** `export const counterGame: GameModule<CounterDesign, CounterSave>`.
- **Tests:** Given the fixture, when `designSchema.parse(defaults)` runs, then it passes (fixture sanity).

### U2 — Clock and RNG
- **Goal:** deterministic stepping with an accumulator; seeded RNG with `seed()`/`setSeed()`.
- **Files:** Create `src/core/clock.ts`, `src/core/rng.ts`; Test `test/clock.test.ts`, `test/rng.test.ts`.
- **Approach:** `STEP_MS = 1000 / 60`. `Clock.advance(ms)`: if paused return 0; `acc += ms`; run steps while `acc >= STEP_MS - 1e-9`; each step increments `tick`, drains the injected-frame queue into `frames`, calls `onStep` listeners with `(1/60, frames)`; returns steps run. `live(nowMs)` for the browser loop: `dt = min(50, now - last)`, `advance(dt)`, then `onFrame`. `Rng` = mulberry32: `setSeed(s)` stores `s >>> 0 || 1`; `next()` returns `[0,1)`; `int(n)`; `seed()` returns the current seed value, not the internal state (so `renderGameToText` can report it).
- **Interface sketch:** as in the ticket's `Clock` and `Rng`.
- **Tests:** Given a fresh clock, when `advance(16)` runs three times, then 2 steps ran and `tick === 2`. Given `advance(1000)`, then 60 steps. Given `pause()`, when `advance(1000)`, then 0 steps. Given seed 7, when 1,000 `next()` values are taken twice from two instances, then the sequences are equal and all in `[0,1)`.

### U3 — Boot and host API
- **Goal:** handshake, mount, lifecycle and design/save dispatch over the bridge.
- **Files:** Create `src/core/boot.ts`, `src/core/host-api.ts`, `src/core/events.ts`, `src/core/registry.ts`, `src/core/index.ts`; Test `test/boot.test.ts`.
- **Approach:** `boot(module, opts)`: `marks.push(['start', now()])`; `bridge = openGameBridge({ hostOrigin, validate: hostToGameSchema.safeParse→data|null, onMessage: dispatch, helloPayload: { protocol: SDK_PROTOCOL, manifest: module.manifest } })`; on the host's `hello`: check `protocol === SDK_PROTOCOL` else `error {code:'protocol_mismatch'}`; store `mode`, `build`, `playerIndex`, `tier`, `capabilities`; build `HostApi` (`input.on` fed from `input.frame` envelopes and `inject`; `viewport.onChange`; `events.emit` → `event` envelope, no-op when the capability is absent; `settings.onChange`; `test.register`); `instance = await module.mount(host, designFromHello ?? module.defaults, save?)`; wire `onStep` → `instance` systems (via registry); `marks.push(['frame0'])`; send `ready {protocol, manifest, marks}`; set `hooks.ready = true`. Dispatch table: `lifecycle.pause|resume` → clock + instance; `lifecycle.dispose` → `instance.dispose()`, `bridge.close()`; `mode.set`; `design.apply {rev, doc, patches}` → `module.designSchema.safeParse(doc)` → on success `instance.applyDesign(doc, patches)` → `design.applied {rev, result}`, on failure `error {code:'apply_failed'}`; `save.restore` → `migrate` when versions differ → `restore`; `save.write` is game-initiated (`host.saves.write()` helper → envelope); `editor.*` → optional instance methods or `error {code:'unsupported'}`; `net.*` and `phase` → `netHandler` set by OGM-054 (default: ignore and count); `test.*` → U5 dispatch. `events.ts`: ring buffer of 1,024 `{t, type, data}` fed by `host.events.emit` and internal lifecycle events. `registry.ts`: `defineFeature` + `composeModule(features)` producing `designSchema`, `controls`, a merged save slice; the fixture uses it so the composition is tested.
- **Interface sketch:** `boot(module, { hostOrigin?: string /* default: origin of document.referrer; never '*' */; build?: 'draft' | 'test' | 'published' /* default: __GM_BUILD__ ?? 'draft' */; headless?: boolean /* default false */ }): Promise<Runtime>`.
- **Tests:** Given two jsdom windows and the fixture, when the host sends `hello {protocol: 1, mode:'edit', build:'draft', playerIndex: 0}`, then a `ready` envelope arrives with `manifest.id === 'counter'` and `marks[0][0] === 'start'`, `marks.at(-1)[0] === 'frame0'`. Given `hello {protocol: 2}`, then `error protocol_mismatch` and no `ready`. Given `design.apply {rev: 5, doc, patches: [{op:'replace', path:['speed'], value: 9}]}`, then `applyDesign` is called once and `design.applied {rev: 5, result: 'live'}` returns; with an invalid doc (`speed: 99`), then `error apply_failed` and the instance's design is unchanged. Given `save.restore {saveSchemaVersion: 0, data}` and a fixture `migrate`, then `restore` receives the migrated save. Given `lifecycle.pause`, when `advanceTime(1000)` is requested, then `test.result` reports `steps: 0`.

### U4 — Test hooks
- **Goal:** every `GmTestHooks` member implemented over the clock, the instance and the engine wrapper slots.
- **Files:** Create `src/test/hooks.ts`, `src/test/index.ts`; Test `test/hooks.test.ts`, `test/determinism.test.ts`.
- **Approach:** `createHooks(rt)`: `advanceTime(ms)` → `clock.advance(ms)` then one `onFrame` if not headless; `renderAt(ms)` → find the keyframe with `tickMs ≤ ms` (keyframes stored every 60 steps as `{tickMs, save: instance.serialize(), rngState}`), `instance.restore(save)`, restore RNG, set `clock.tick`, `advance(ms - tickMs)`, one frame; `renderGameToText()` → `{ coords: module.manifest.coords ?? 'see manifest', tick, mode, state: instance.serialize(), players: [...players] }`, JSON-size check → if `> 65_536` chars replace `state.data` with `{ truncated: true, keys: Object.keys(...) }` and set `truncated: true`; `renderInfo()` → `rt.renderInfoProvider?.() ?? { calls: 0, triangles: 0, frameMs: 0, textureBytes: 0, backend: 'headless' }`; `hitTest(nx, ny)` → `(instance.pick?.(nx, ny) ?? []).length > 0`; `setSeed`/`seed` → rng; `inject(frame)` → push onto the next step's queue; `probes()` → `instance.probes?.() ?? {}` merged with `{ tick, paused }`; `events(since)` → ring buffer filter; `marks` → the boot array; `ready` → flag.
- **Interface sketch:** `createHooks(rt: Runtime): GmTestHooks` plus `rt.setRenderInfoProvider(fn)` and `rt.setRenderer(render: () => void)` for OGM-023/OGM-024.
- **Tests:** Given a booted fixture, when `advanceTime(1000)`, then `renderGameToText().tick === 60` and `onFrame` fired once. Given `advanceTime(4000)` then `renderAt(2500)`, then `tick === 150` and `restore` was called with the 2 s keyframe. Given `inject({playerIndex:0, tick:0, source:'network', actions:{go:true}})` then `advanceTime(17)`, then `counter === 1` and a second `advanceTime(17)` leaves it at 1. Given a state padded to 70 KB, when `renderGameToText()`, then `truncated === true` and the JSON is under 66 KB. Determinism: two runtimes, seed 42, the same 600 injected frames, then `JSON.stringify(renderGameToText())` is equal.
- **Execution note:** write the determinism test first; it catches any `Date.now`/`Math.random` leak immediately.

### U5 — Bridge dispatch and window globals
- **Goal:** `test.*` envelopes call hooks and reply `test.result`; globals installed only for draft/test builds.
- **Files:** Create `src/test/dispatch.ts`, `src/test/globals.ts`; Test `test/globals.test.ts`, `test/no-random.test.ts`.
- **Approach:** `dispatchTest(env, hooks, bridge)`: map `test.advanceTime {ms}` → `hooks.advanceTime`, `test.renderAt`, `test.renderGameToText` (value = object), `test.renderInfo`, `test.hitTest {nx, ny}`; wrap in try/catch → `test.result {ok:false, error: String(e)}`; reply always carries `replyTo: env.id`. `installGlobals(hooks, build)`: if `build === 'published'` return; `window.__gm = Object.assign(hooks, { tick: (s: number) => hooks.advanceTime(s * 1000) })`; `window.render_game_to_text = () => JSON.stringify(hooks.renderGameToText())`; `window.advanceTime = hooks.advanceTime`; `window.__frame = hooks.renderAt` (seconds → ms conversion kept: `__frame(t)` takes seconds like city.js, so `window.__frame = t => hooks.renderAt(t * 1000)`); `Object.defineProperty(window, '__ready', { get: () => hooks.ready })`; `window.__marks = hooks.marks`. `no-random.test.ts`: reads every file under `src/core` and `src/test` and fails on `/Math\.random|Date\.now/`.
- **Interface sketch:** `installGlobals(hooks: GmTestHooks, build: 'draft'|'test'|'published'): void`.
- **Tests:** Given `build: 'draft'`, when booted in jsdom, then `window.__gm.tick`, `window.render_game_to_text`, `window.advanceTime`, `window.__frame`, `window.__marks` exist and `window.__ready === true` after `ready`. Given `build: 'published'`, then none of them exist. Given a `test.hitTest` envelope with `replyTo` expectations, then `test.result {ok:true, value:false}` arrives with `replyTo` equal to the request id. Given a hook that throws, then `test.result {ok:false}`.

## 4. Verification

```sh
pnpm install
pnpm --filter @gm/sdk test
pnpm --filter @gm/sdk build
pnpm -r typecheck
pnpm lint
```

`## Local tests`: policy `full`; head SHA; base `main`; selection `@gm/sdk`; the commands above; expected ≥ 30 tests, 0 skipped; paste the determinism test's two text hashes.

Conventions: pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest with jsdom for the bridge tests and `node` for the rest; Playwright not needed (templates prove the browser path); no service, no secrets; `zod` and `jsdom` pinned at install; PR first line `Closes #<issue>`.

## 5. Deferred to implementation

- Build-kind source: default a Vite `define` constant `__GM_BUILD__` set by the template build (`'draft' | 'test' | 'published'`), with `boot({build})` overriding for tests.
- Keyframe cadence: default every 60 steps plus on `ready`; configurable in `boot` opts.
- `coords` text: default from `manifest.coords` if present (additive manifest field proposed to OGM-020 as a follow-up), else `'see manifest'`.
- Whether `renderAt` beyond the last keyframe forwards from the current state when `ms ≥ now`: default yes (no restore).
- `hostOrigin` default in the browser: default `new URL(document.referrer).origin` when present, else require the option.

## 6. Scope boundaries

- No renderer, scene, physics or Phaser objects (OGM-023, OGM-024); `renderInfo` zeros until a wrapper registers a provider.
- No camera or input merging beyond queuing `input.frame`/`inject` (OGM-025).
- No asset loading (OGM-026), audio (OGM-027), snapshot interpolation (OGM-054), save outbox (OGM-046), achievements (OGM-047).
- No conformance checks (OGM-029) and no `gm test` gate (OGM-093); this ticket only makes them possible.

## 7. Risks

- **Rapier/engine state is not covered by `serialize`, so `renderAt` restores diverge** → wrappers register `keyframe.extra` (Rapier `takeSnapshot`) in OGM-023; the core calls `rt.keyframeHooks` if present; default taken.
- **Globals leak into published bundles through tree-shaking failure** → `installGlobals` is a separate module imported behind `if (build !== 'published')` with the build constant, and OGM-029 check 8 greps the bundle.
- **Accumulator float drift** → `1e-9` epsilon and integer `tick`; test with 10,000 × 16.67 ms.
- **jsdom bridge tests are slow or flaky** → reuse OGM-021's helper that dispatches events synchronously; keep handshake tests to five.
