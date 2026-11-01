# OGM-028 plan — Host game frame (@gm/host)

## 1. Problem frame

The app must run untrusted game builds from a separate origin and still edit, test and control them. The prototypes embedded same-origin iframes with `postMessage('*')`, read the touch stick inside the game and never read gamepads at all. V1 moves every host concern to one package: the iframe and its attributes, the validated bridge with a role gate, the single gamepad reader, the touch overlay, viewport and settings, and the games-origin cache worker. It is a hot surface (OGM-029, OGM-053, OGM-075, OGM-090 all consume it), so the API is small and typed.

Requirements trace:
- R40 → separate-origin sandboxed iframe, validated envelope over the OGM-021 bridge with origin check, size cap, rate limit; role check before `design.apply`.
- R44 → the host is the only gamepad reader and owns the touch overlay (declared actions, 64 px primary targets); frames carry `playerIndex`.
- R113 (consumed) → safe areas, 64 px / 44 px targets, iOS touch fixes.

## 2. Patterns to follow

- `prototypes/ui-v0/site/js/dungeon.js:616-657`: stick with pointer capture, 50 px radius clamp, `touchstart` preventDefault on controls, `gesturestart` cancel, tap-versus-drag (10 px, 400 ms). Port into `overlay.ts`.
- `prototypes/studio-v0/title-town.js:14-34`: iframe creation with `title`, `aria-hidden`, `pointer-events`, and the `e.source` check; keep the attributes idea, replace the check with the origin-checked bridge.
- `prototypes/studio-v0/sw.js`: install/activate with `skipWaiting`/`clients.claim`, a per-build cache and a long-lived assets cache, network-first navigations. Port to `sw/game-cache.ts`.
- `prototypes/title-city/tools/loadtime.mjs:11-18`: GPU flags, iPhone 13 profile, counting `fromServiceWorker()` responses. Copy into the cache spec.
- `docs/research/v0.3/A4-engine-sdk-editor.md` §4 (lines 63–91): the trust boundary and rules 1–6; §12: overlay rules (thumb zones, hidden when a keyboard or pad is in use).
- `docs/research/v0.4/B7-editor-sdk-input.md` §5.3: one gamepad reader, editor claims one device, raw keys forwarded by the SDK in play mode.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (`--use-gl=angle --use-angle=swiftshader`); every test server binds `127.0.0.1`; secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Package, frame and options

Goal: `createGameFrame` builds the iframe with the exact attributes and URL and owns lifecycle.

Files:
- Create: `packages/host/package.json` (`@gm/host`, exports `.` and `./sw`), `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/frame.ts`, `src/frame.test.ts`.

Approach: `createGameFrame(opts)`; validate `opts.gamesOrigin` with `new URL()` and throw `HostError('same-origin')` when its `origin` equals `opts.appOrigin ?? location.origin`. Build `src = ${gamesOrigin}/g/${gameId}/${buildId}/index.html?build=${build}&protocol=1` (D-GAMES-ORIGIN). Create `<iframe title="Game" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="autoplay; fullscreen; gamepad" referrerpolicy="no-referrer">` with `style="border:0;width:100%;height:100%;display:block"`, append inside a `position: relative` wrapper the overlay (U4) shares. Compose `HostBridge` (U2), `GamepadPoller` (U3), `TouchOverlay` (U4), `ViewportTracker` (U5). `dispose()` stops the poller, removes listeners, closes the port, removes the iframe. `setMode('play'|'edit')` sends `mode.set` through the role gate and tells the overlay and poller which side owns input (edit: the editor claims one device, overlay hidden).

Interface sketch:
```ts
export interface GameFrameOptions {
  container: HTMLElement; gamesOrigin: string; appOrigin?: string; gameId: string; buildId: string;
  build: 'draft' | 'test' | 'published'; mode: 'play' | 'edit' | 'test'; playerIndex: number; tier?: Tier; capabilities: string[];
  role: () => 'owner' | 'editor' | 'player' | 'watcher';
  onReady?(m: GameManifest, marks: [string, number][]): void; onSaveWrite?(p: { saveSchemaVersion: number; data: unknown }): void;
  onEvent?(kind: 'achievement' | 'analytics' | 'checkpoint', payload: unknown): void; onAudioRelay?(p: AudioRelayPayload): void;
  onRawKey?(code: string, down: boolean): void; onError?(e: { code: string; message: string }): void; readyTimeoutMs?: number }
export interface GameFrame {
  iframe: HTMLIFrameElement; bridge: HostBridge; gamepads: GamepadPoller; overlay: TouchOverlay; viewport: ViewportTracker;
  send<T extends HostToGame['t']>(t: T, payload: Extract<HostToGame, { t: T }>['payload']): void;
  request<T extends `test.${string}`>(t: T, payload: unknown): Promise<unknown>;
  on<T extends GameToHost['t']>(t: T, cb: (p: Extract<GameToHost, { t: T }>['payload']) => void): () => void;
  setMode(m: 'play' | 'edit'): void; setSettings(s: Settings): void; dispose(): void }
```

Test scenarios:
- Given valid options when created then `sandbox`, `allow` and `src` equal the exact strings.
- Given `gamesOrigin === appOrigin` when created then `HostError('same-origin')` is thrown and no iframe is appended.
- Given a frame when `dispose()` runs then the iframe is gone and the bridge `close` spy fired.

### U2. HostBridge: validation and role gate

Goal: typed, validated messaging over OGM-021 with the role checked before commands.

Files:
- Create: `src/bridge.ts`, `src/bridge.test.ts`.

Approach: `new HostBridge({ iframe, origin, hello, role, limits: { maxBytes: 262144, perSecond: 120 } })`. Wrap OGM-021's host API (`createHostPort(iframe, origin, limits)` or whatever name merged; adapt at pickup) and send `hello` once the iframe `load` event fires; the port is transferred by OGM-021. Inbound: `GameToHostSchema.safeParse(data)` (OGM-020 Zod union); failures increment `dropped` and are not dispatched; `ready` resolves `whenReady` and records `protocol` (reject with `protocol-mismatch` when the major differs from `SDK_PROTOCOL`); `test.result` resolves the pending request by `replyTo`. Outbound: `send(t, payload)` queues until `ready` (except `hello`); for `t` in `COMMANDS = ['design.apply', 'mode.set', 'editor.*', 'save.restore']` call `canApply(role(), t)` first and drop with `onError({code:'forbidden'})` when false (`owner` and `editor` may apply; `player` and `watcher` may not). `request(t, payload)` sends with a fresh `id` and returns a promise rejected after `timeoutMs` (default 10 s).

Interface sketch:
```ts
export function canApply(role: Role, t: HostToGame['t']): boolean;
export class HostBridge { whenReady: Promise<ReadyPayload>; dropped: number; send(...); request(...); on(...); close(): void }
```

Test scenarios (fake `iframe-bridge` port in jsdom):
- Given role `watcher` when `send('design.apply', …)` runs then nothing is written and `onError` got `forbidden`.
- Given role `owner` when the same runs then the message is written with `v: 1` and an `id`.
- Given an inbound `{v:1,id:'x',t:'nope',payload:{}}` when received then `dropped` is 1 and no handler ran.
- Given an inbound `ready` with `protocol: 2` when `SDK_PROTOCOL` is 1 then `onError('protocol-mismatch')`.
- Given `request('test.renderInfo', {})` when a `test.result` with `replyTo` arrives then the promise resolves with its `value`.

Execution note: test-first on `canApply` and the drop path; these are the security seams.

### U3. GamepadPoller

Goal: the only `getGamepads()` reader; device claims; mapped frames with keepalive.

Files:
- Create: `src/gamepad.ts`, `src/gamepad.test.ts`.

Approach: `new GamepadPoller({ getGamepads: () => navigator.getGamepads(), raf, now })` injected for tests. Loop: read pads; a pad with any button pressed and no claim takes the lowest free local `playerIndex` (0..3); `mapping` comes from `manifest.inputs.gamepad` (`{ actionId: 'leftStick' | 'rightStick' | 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'dpad' | 'start' | 'select' }`) applied to the standard mapping indices; axes get a 0.15 dead zone; build `ActionFrame { playerIndex, tick, source: 'gamepad', actions }`; emit through `onFrame` when `actions` differ from the last frame for that index or 250 ms passed. In edit mode the claimed device for index 0 is reported to `onPadSnapshot` (raw buttons/axes, for OGM-071 menus) and not forwarded as a game frame. `lastInputAt` is public so the overlay can hide.

Interface sketch:
```ts
export class GamepadPoller { constructor(o: { getGamepads(): (Gamepad | null)[]; raf?: typeof requestAnimationFrame; now?: () => number });
  setMapping(m: GamepadMapping): void; setMode(m: 'play' | 'edit'): void; onFrame(cb: (f: ActionFrame) => void): () => void;
  onPadSnapshot(cb: (s: PadSnapshot) => void): () => void; lastInputAt: number; start(): void; stop(): void }
```

Test scenarios:
- Given one fake pad with A pressed when polled then a frame with `playerIndex 0` and `jump: true` is emitted.
- Given a second pad pressing B later when polled then it claims `playerIndex 1`.
- Given a left stick at (0.1, 0.1) when polled then `move` is `{x:0,y:0}` (dead zone) and no frame is emitted; at (0.5, 0) a frame is.
- Given no changes for 300 ms when polled then one keepalive frame was emitted.
- Given edit mode when A is pressed then `onPadSnapshot` fired and `onFrame` did not.

### U4. TouchOverlay

Goal: declared-action controls in a pass-through layer with iOS fixes.

Files:
- Create: `src/overlay.ts`, `src/overlay.css.ts` (constructable stylesheet string), `src/overlay.test.ts`.

Approach: `new TouchOverlay({ layer, manifestInputs, playerIndex, onFrame })`. The `layer` is `position:absolute; inset:0; pointer-events:none`; each control `pointer-events:auto`. Build from `manifestInputs.touch`: `'stick'` one stick bottom-left; `'two-stick'` adds a right stick for the action flagged `look` or `aim`; `'tap'` none. Buttons: actions of kind `button`, the one flagged `primary` at 64 px bottom-right, others 44 px in an arc above it (max 4; more is a design failure per A4 §12, log a warning). Stick mechanics from `dungeon.js:617-621`: pointer capture, radius 50, vector normalised into `{x, y}`; `touchstart` preventDefault on every control, `document` `gesturestart` preventDefault (`:624-625`). Frames: `{ playerIndex, tick, source: 'touch', actions }` on every change and 250 ms keepalive, merged by the frame into one send per tick with the gamepad frame when both exist (last writer per action wins; gamepad wins on tie). Hide with the `hidden` attribute when `now - max(poller.lastInputAt, lastKeyAt) < 2000` (keys: a `keydown` listener on the app window; the iframe's keys do not reach us, so also hide when the bridge sees `input.rawKey`). Only `matchMedia('(pointer: coarse)')` devices show the overlay at all. Each control gets `aria-label` = action id, `role="button"`.

Test scenarios (jsdom):
- Given the fixture manifest when built then one stick, one 64 px button, one 44 px button exist with `aria-label`s and the layer has `pointer-events: none`.
- Given a `pointerdown` then `pointermove` 30 px right on the stick when fired then a frame with `move ≈ {x: .6, y: 0}` is emitted; `pointerup` emits `{x:0,y:0}`.
- Given a `keydown` on window when fired then the layer is hidden; 2.1 s later (fake timers) it shows again.
- Given `touch: 'tap'` when built then no controls exist.

### U5. ViewportTracker and settings

Goal: the iframe fits the container; safe insets and orientation are sent; settings resend after `ready`.

Files:
- Create: `src/viewport.ts`, `src/settings.ts`, `src/viewport.test.ts`.

Approach: a hidden probe `div` with `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)` read through `getComputedStyle`; `ResizeObserver` on the container and `visualViewport` `resize`/`scroll`; `orientation = w >= h ? 'landscape' : 'portrait'`; send `viewport { w, h, dpr: devicePixelRatio, orientation, safe }` debounced to one per frame; resend on `ready`. `settings.ts`: `setSettings(s)` stores and sends `settings`; the frame resends it on every `ready` (a reload keeps mute).

Test scenarios:
- Given a container 800×600 and probe insets 44/0/34/0 when observed then one `viewport` message with those values is sent.
- Given a `ready` after `setSettings({mute:true,…})` when received then `settings` is sent again.

### U6. Games-origin cache worker

Goal: content-hashed assets survive builds; `index.html` stays fresh.

Files:
- Create: `src/sw/game-cache.ts`, `src/sw/register.ts`, `src/sw/game-cache.test.ts`; `package.json` script `build:sw` (esbuild or `tsc` to `dist/game-cache.js`, IIFE, no imports).

Approach: `BUILD` is not stamped (the games origin serves many builds); caches: `gm-assets` (long-lived) and `gm-pages`. `fetch`: non-GET or other origin → pass; `/g/<game>/<build>/index.html` or navigations → network-first with `cache: 'no-cache'`, fallback cache (`sw.js:13-15`); `/g/*/assets/*` → cache-first in `gm-assets` keyed by URL (names are content-hashed, so a hit is always right), put on miss; everything else under `/g/` → stale-while-revalidate in `gm-pages`. `activate`: `clients.claim()`, drop caches not in the set. `register.ts`: `registerGameCache(url = '/sw.js')` with `scope: '/g/'`, no-op when `serviceWorker` is absent. Unit-test the routing function (`classify(url, request)`) in Vitest; the worker body is thin.

Test scenarios:
- Given `/g/a/b/assets/x.3f9a.glb` when classified then `cache-first:gm-assets`; given `/g/a/b/index.html` then `network-first`; given `https://other/x` then `pass`.
- Playwright (U7): second load serves `assets/x.glb` from the worker.

### U7. Browser specs: cross-origin handshake, touch, relay, cache

Goal: the real boundary works end to end.

Files:
- Create: `test/stub-game/index.html`, `test/stub-game/main.ts` (uses OGM-021's game-side port and OGM-020 fixtures to answer `hello` with `ready`, echoes `input.frame` into `window.__frames`, sends `audio.relay` on a button, registers the cache worker, fetches `assets/x.glb`), `test/app/index.html` (mounts `createGameFrame` with `window.__host`), `test/serve.ts` (two static servers on `127.0.0.1:4173` and `:4174`), `src/browser/frame.spec.ts`, `src/browser/cache.spec.ts`, `playwright.config.ts`.

Approach: `chromium.launch({ args: process.env.GM_VERIFY_SOFTWARE_GL ? SW_FLAGS : GPU_FLAGS })`; specs: handshake (`ready` manifest equals the fixture, `marks` non-empty); forged message (a third page opened at `:4174` posts `ready` to the app window → `bridge.dropped` increments, `onReady` not called twice); touch (`devices['iPhone 13']`, `page.touchscreen` drag on `[aria-label="move"]` → stub's `__frames` has `source: 'touch'`); relay (`page.frame` click → `onAudioRelay` captured on the app); cache (reload, count `fromServiceWorker()` responses for `/assets/` ≥ 1).

Test scenarios:
- Given both servers when the app loads then `onReady` fires within 5 s with the fixture manifest.
- Given a forged `ready` from another window when posted then it is dropped.
- Given an iPhone profile when the stick is dragged then the stub received a touch frame with `playerIndex 0`.
- Given a reload when assets are fetched then at least one came from the service worker.

## 4. Verification

```
pnpm --filter @gm/host test
pnpm --filter @gm/host test:browser
GM_VERIFY_SOFTWARE_GL=1 pnpm --filter @gm/host test:browser   # once, to prove the fallback path
pnpm --filter @gm/host typecheck && pnpm -r lint
```
Paste the Vitest and Playwright summaries, the renderer string the spec logs (`ANGLE (Intel, Mesa Intel(R) UHD Graphics …)` expected on this host, E10-4), and one line showing `canApply` tests fail with the gate removed.

## 5. Deferred to implementation

- Frame send cadence: default rAF-on-change plus 250 ms keepalive; the SDK merge (OGM-025) tolerates any cadence.
- Dead zone and stick radius: default 0.15 and 50 px.
- Where the overlay's styles live: default a constructable stylesheet adopted on the app document (no global CSS file).
- `readyTimeoutMs`: default 30 000.
- Whether `request()` is allowed before `ready`: default no (reject `not-ready`).

## 6. Scope boundaries

- Editor framework, HUD, undo, lease: OGM-075 and OGM-041.
- Spatial navigation of app menus: OGM-071 (consumes `onPadSnapshot`).
- Room relaying (`mp.*`, `design.tx`): OGM-053.
- Playing relayed audio: OGM-071; save identity: OGM-046.
- Serving the games origin, headers, `Service-Worker-Allowed`: OGM-007.
- In-iframe input merge and keyboard: OGM-025; test hooks: OGM-022.

## 7. Risks

- iPadOS gamepad and pointer lock inside the sandboxed iframe (A4 §4 rule 6): default host-only pad reading (already decided) and the real-iPad check in the ticket; `fps` stays desktop-gated in OGM-025.
- OGM-021's exact API may differ from the sketch: default adapt `bridge.ts` only; nothing else imports it directly.
- Same-site cookies on a different port: default rely on OGM-007 setting none and document the reason `allow-same-origin` is kept; revisit when a bought domain gives per-game subdomains.
- Overlay steals the canvas: default `pointer-events: none` on the layer and a Playwright assertion that a tap outside the controls reaches the stub (`__taps`).
- One iGPU shared with other verify jobs: default one browser per spec run; OGM-090's semaphore is adopted when it lands.
