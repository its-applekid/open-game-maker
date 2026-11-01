# OGM-071 plan — Shell: title town, sound, PWA, input, notifications, bug button

## 1. Problem frame

The live site's title is the castle town in an iframe with a poster-to-live reveal, an sfx relay onto the host's unlocked audio and a tap relay for the Easter egg; its sound module encodes the iOS rules that took days to find. None of it is React and none has tests. This ticket ports those behaviours into `apps/web` as modules the other screens use (sound, gamepad and focus, notifications, bug button) and makes the town a built asset served from `public/town/`.

Requirements trace: **R111** → `TitleTown` keeps the poster → live reveal with no cut, serves the bundle from `public/town/`, relays sound and taps as today. **R112** → the title screen is the first entry in the screen list; the bug button and notification feed are app-wide chrome. **R113** → iOS audio unlock rules, 64 px Start, 44 px secondary targets, reduced-motion handling, and the deploy sheet shows the poster first.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (this ticket names one: `@noriginmedia/norigin-spatial-navigation`, 491 stars, MIT, approved by Kevin per B7 §5.3 / E09-14); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/title-town.js`: the whole file is the behaviour spec; `load()`, `sync()`, the pointerdown relay and the message handler map one-to-one onto `TitleTown.tsx` effects.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/sound.js`: lines 1–9 (`MUSIC`), 71 (`titleReady`), 78–96 (`playMusic` with loop points and crossfade), 154–161 (`set`, `cue`), 163–205 (`unlock`, `ext*`, visibility, mute, volume); drop `SCAPES` (demo-only soundscapes).
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/build.sh` lines 30–38 and 85–103: the music transcode and the town copy/bundle steps become `tools/town.sh`.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/icons.js`: copy to `src/icons.ts` as `export const ICONS: Record<string, string>` plus an `<Icon name>` component that injects the SVG.
- `/home/orangekid/github/aiur/website/tests/brand.spec.ts`: `addInitScript` + `page.route` style for stubbing the town iframe in e2e.
- OGM-070's `src/app/store.ts` `registerSlice` and `src/app/testHook.ts` `registerTestApi` for the screen's hooks.

## 3. Implementation units

### U1 — Town build script and public assets

Goal: `public/town/` and `public/art/music/` exist on the operator's machine from one script; both are gitignored.
Files: Create `apps/web/tools/town.sh`; Modify `apps/web/.gitignore` (already lists `public/town/`, `public/art/`; verify).
Approach: `set -euo pipefail`; `ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"` (no `cd` elsewhere); require `prototypes/title-city/models/bake/` to exist (else print the three title-city commands to run first: `tools/build.sh`, `node tools/bake.mjs`, `node tools/poster.mjs`, and exit 2); replicate studio `build.sh` lines 85–103 with `$HERE/town` → `apps/web/public/town` (index.html, `vendor/`, `fx-variants/`, `models/{castle,minidungeon,monsters,fx,sounds,sprites,variants,bake}`, the Python manifest filter, `node prototypes/title-city/tools/bundle.mjs apps/web/public/town`, the `sed` swap to `city.bundle.js`, the cleanup `rm`/`find`). Music: lines 30–38 into `apps/web/public/art/music/` but skip the Sidetrax lines when `--public` is passed (the public deploy falls back to the Kenney track, `MUSIC.title.fallback`). `deploy.sh` (OGM-070) already strips `art/packs/synty-*`; this script never copies Synty.
Interface sketch: `bash apps/web/tools/town.sh [--public]`.
Test scenarios: Given a built title-city, when the script runs, then `public/town/index.html` references `city.bundle.js` and `public/town/models/bake/poster-portrait.webp` exists. Given no bake dir, then exit 2 with the instructions. (Operator-run; not in CI.)

### U2 — Sound module

Goal: `src/lib/sound` reproduces `sound.js` behaviour in typed modules with the iOS rules intact.
Files: Create `src/lib/sound/{context.ts,music.ts,ext.ts,index.ts}`, Test `src/lib/sound/sound.test.ts`.
Approach: `context.ts` creates the `AudioContext` lazily on first import, `master → musicBus/sfxBus` gains, `ramp(node, v, s)`, the `unlock()` function verbatim (audioSession, `resume()`, the 1-sample buffer trick), the capture listeners on `pointerup`/`touchend`/`keydown`/`click`, `visibilitychange` suspend/resume, `status()`, `onChange`. `music.ts`: `MUSIC`, `load(kind, name)` with a `Map` cache fetching `/art/music/<name>.mp3` and `decodeAudioData`, fallback on 404, `playMusic(def, fade)` setting `loopStart/loopEnd`, `set(track, fade)` with duck, `titleReady = load('music', MUSIC.title.file)`. `ext.ts`: `ext`, `extLoop`, `extSilence` with the `extBufs`/`extLoops` maps. Mute/volume persist to `localStorage` keys `ogm.sound` and `ogm.volume`.
Interface sketch: as in the ticket's "Sound" contract.
Test scenarios (jsdom with a minimal `AudioContext` mock in `src/test/audio-mock.ts`): Given a suspended context, when `unlock()` runs, then `resume` is called and `navigator.audioSession.type === 'playback'`. Given `document.hidden`, when `unlock()` runs, then `resume` is not called. Given a running context, when `ext(url, .5, 1)` is called, then a buffer source starts on the sfx bus; given a suspended one, nothing is fetched. Given two loops, when `extSilence()` runs, then both gains are 0. Given `setVolume(0.4)` while muted, then it unmutes.
Execution note: characterization-first: write the tests from `sound.js` behaviour before porting.

### U3 — Title screen and `TitleTown`

Goal: the title route renders the poster first, hosts the town iframe while active, and relays messages exactly as the prototype.
Files: Create `src/routes/title/{route.tsx,TitleScreen.tsx,TitleTown.tsx,title.css}`, Test `src/routes/title/TitleTown.test.tsx`, `e2e/title.spec.ts`, `e2e/fixtures/town-stub/index.html`.
Approach: `route.tsx` exports `{ path: '/', element: <TitleScreen/>, chrome: 'bare', auth: 'none' }`. `TitleScreen` shows the logo, a Start button (`.tap-primary`, navigates to `/games` when a session exists, else `/age`; OGM-072 owns both targets, the stub session from OGM-070 returns `null`), the sound toggle (`status()` → `aria-label` "Sound off/on/tap to start"), and `<TitleTown active />`. `TitleTown` props `{ active: boolean; src?: string }` (`src` defaults to `/town/index.html?cam=menu&scene=all&embed`; e2e passes the stub). Effects: on `active` true create the poster `<picture>` (portrait/landscape webp by `matchMedia('(orientation: portrait)')`) if not already in the DOM, create the iframe with the prototype's attributes, `Promise.race([titleReady, timeout(2500)])` then set `src`; on `active` false or unmount remove the iframe and poster, `extSilence()`. A `message` listener filters `e.source === iframe.contentWindow`; `'town-ready'` adds `live` and removes the poster after 1200 ms (0 ms under reduced motion); `{sfx}` → `ext('/town/models/sounds/<name>.mp3', vol, rate)`; `{loop}` → `extLoop`. A `pointerdown` listener on the screen posts `{tap:[nx, ny]}` to `location.origin` unless the target is a button/link/input. `visibilitychange` posts `'pause'`/`'resume'`. Registers `registerTestApi('title', { live: () => el.classList.contains('live') })`.
Interface sketch: `export function TitleTown({ active, src }: { active: boolean; src?: string }): JSX.Element`.
Test scenarios: Given `active`, when mounted, then one iframe with `aria-hidden` and `pointer-events: none` exists and its `src` is set after `titleReady` resolves. Given a `'town-ready'` message whose `source` is the iframe window, then the container has `live` and the poster is gone after the timer. Given the same message from `window`, then nothing changes. Given `active` false, then the iframe is removed and `extSilence` called. Given a pointerdown on the backdrop at the iframe's centre, then `postMessage({tap:[0.5,0.5]}, location.origin)` is called; on the Start button, nothing is posted. e2e: poster `<img>` visible at `domcontentloaded`; `live` within 3 s with the stub; the stub echoes the tap to a `window.__tapSeen` the spec reads.

### U4 — Gamepad poller and focus zones

Goal: one gamepad reader that drives menu focus; OGM-075 can forward raw frames in play mode.
Files: Create `src/lib/input/{gamepad.ts,focus.tsx,index.ts}`, Test `src/lib/input/gamepad.test.ts`; Modify `apps/web/package.json` (add `@noriginmedia/norigin-spatial-navigation`, pinned 2.x).
Approach: `gamepad.ts`: `startGamepadPoller()` loops with `requestAnimationFrame`, reads `navigator.getGamepads()`, keeps the previous button state per pad, emits `GamepadSnapshot` to `onFrame` subscribers every frame, and when `!playMode` dispatches `new KeyboardEvent('keydown', { key, bubbles: true })` on `document.activeElement ?? document.body` for rising edges: d-pad/left stick (dead zone 0.5, repeat after 400 ms then every 120 ms) → arrows, A → `Enter`, B → `Escape`, LB/RB → `zone.prev`/`zone.next` custom events. `focus.tsx`: `init({ debug: false, visualDebug: false })` from Norigin once; `FocusZone({ id, children })` wraps a `useFocusable({ focusKey, trackChildren: true })` container; `useFocusable` re-exported; a `zone.next` listener cycles zones in DOM order. Norigin already maps arrow keys to spatial focus, so synthetic `keydown` is enough.
Interface sketch: `startGamepadPoller(): () => void; onFrame(cb): () => void; setPlayMode(on: boolean): void; type GamepadSnapshot = {...}` as in the ticket.
Test scenarios (fake `navigator.getGamepads` and a manual rAF): Given button 0 goes pressed, when one frame runs, then one `keydown` `Enter` is dispatched on the focused element. Given it stays pressed for ten frames, then no further `keydown`. Given `setPlayMode(true)`, then `onFrame` receives snapshots and no `keydown` fires. Given axis 0 at −0.9, then `ArrowLeft` fires once, then repeats after 400 ms.

### U5 — Notifications: permission, push subscribe, SSE feed

Goal: the app can register a push subscription and show in-app toasts for the three triggers.
Files: Create `src/lib/notify/{push.ts,feed.ts,Toasts.tsx,index.ts}`, Test `src/lib/notify/push.test.ts`.
Approach: `push.ts`: `requestPushPermission()` calls `Notification.requestPermission()` (must be invoked from a click handler; the store slice `notify` records `denied`); `fetchVapidPublicKey()` → `api<{ publicKey: string }>('/push/vapid')` (name confirmed against OGM-016 at pickup); `subscribePush()` → `navigator.serviceWorker.ready` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })` → `api('/push/subscriptions', { json: sub.toJSON() })`. `feed.ts`: `useNotificationFeed()` opens `sse('/notifications/stream')` once per app (ref-counted), listens to `build.done`, `job.started`, `intake.report`, pushes to the `notify` slice; reconnects with backoff; a 404 closes it quietly (OGM-016 not merged). `Toasts.tsx` renders the slice's queue in the app chrome slot (one line each, auto-dismiss 6 s, `role="status"`).
Interface sketch: `requestPushPermission(): Promise<NotificationPermission>; subscribePush(): Promise<void>; useNotificationFeed(): void`.
Test scenarios: Given permission `granted` and a mocked `pushManager`, when `subscribePush()` runs, then `POST /api/v1/push/subscriptions` receives `{ endpoint, keys }`. Given the key route 404s, then `subscribePush()` rejects with `ApiError 404` and nothing is posted. Given an SSE `build.done` event, then the slice holds one toast with the event's text.

### U6 — Bug-report button

Goal: a global button files a report with the current screen's context and never loses a report.
Files: Create `src/features/bug-report/{BugButton.tsx,BugSheet.tsx,slice.ts,send.ts,index.ts}`, Test `src/features/bug-report/send.test.ts`.
Approach: `slice.ts` registers `bugReport: { context: { gameId?, releaseId?, buildHash? }, setBugContext }`. `BugButton` (44 px round glass button, `aria-label="Report a problem"`, Phosphor `bug` icon from `icons.ts`) opens `BugSheet`: one textarea, Send. `send.ts`: `sendReport({ text, context, error? })` → `api('/reports', { json })`; on `ApiError`/network failure push to `localStorage['ogm.reports.queue']` and resolve `{ queued: true }`; `flushQueue()` runs on app start. The last `window.onerror`/`unhandledrejection` (type, message, top 5 frames) is kept in memory and attached as `error`. The FAB mounts in OGM-070's app chrome slot (`chrome: 'app'` screens only).
Interface sketch: `sendReport(input): Promise<{ reportId: string } | { queued: true }>`.
Test scenarios: Given a 201, when `sendReport` runs, then the queue is empty and the id is returned. Given `fetch` rejects, then the queue holds one entry and the function resolves `{ queued: true }`. Given a queued entry and a 201 on start, when `flushQueue()` runs, then the queue is empty. Given a text containing a line starting with `Authorization:`, then it is sent unchanged (no secret stripping is promised; the report is private) but the test documents that only user text travels.

### U7 — Icons

Goal: the Phosphor set is importable by every screen.
Files: Create `src/icons.ts`, `src/components/Icon.tsx`.
Approach: copy `ICONS` from `icons.js`; `<Icon name className>` renders the SVG with `dangerouslySetInnerHTML` from the constant table only (no user input).
Test scenarios: Given `ICONS`, then every value starts with `<svg viewBox="0 0 256 256"` (one test).

### Worked fixtures

`e2e/fixtures/town-stub/index.html` (served by the Playwright `webServer` under `/town-stub/`; the spec passes `src="/town-stub/index.html?embed"`):
```html
<!doctype html><meta charset="utf-8"><body style="margin:0;background:#2a4">
<script>
  setTimeout(() => parent.postMessage('town-ready', location.origin), 100);
  addEventListener('message', e => {
    if (e.data?.tap) { parent.postMessage({ sfx: ['tick', 1, 1] }, location.origin); parent.__tapSeen = e.data.tap; }
    if (e.data === 'pause') parent.__paused = true;
  });
</script>
```
`src/test/audio-mock.ts` (installed in `vitest.setup.ts` for the sound and title tests):
```ts
export class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended'; currentTime = 0; destination = {};
  resume = vi.fn(async () => { this.state = 'running'; this.dispatchEvent(new Event('statechange')); });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  createGain = () => ({ gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() });
  createBufferSource = () => ({ buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  createBuffer = () => ({}); decodeAudioData = async () => ({ duration: 1 });
  private t = new EventTarget(); addEventListener = this.t.addEventListener.bind(this.t); dispatchEvent = this.t.dispatchEvent.bind(this.t);
}
// vitest.setup.ts: (globalThis as any).AudioContext = FakeAudioContext; (navigator as any).audioSession = { type: 'auto' };
```
Expected `sound.test.ts` assertion for the iOS rule: `unlock(); expect(navigator.audioSession.type).toBe('playback'); expect(ctx.resume).toHaveBeenCalledOnce()`.

## 4. Verification

```
bash apps/web/tools/town.sh --public            # operator, once; needs assets-local and the title-city bake
pnpm --filter @ogm/web test
pnpm --filter @ogm/web e2e -g "title|input"      # stub town; GM_VERIFY_SOFTWARE_GL=1 fallback
pnpm -r typecheck && pnpm -r lint
bash apps/web/tools/deploy.sh --dry-run          # sheet: poster in frame 1, town-ready time printed
```
Paste into `## Local tests`: Vitest summary; Playwright summary for both projects; the `town-ready` time from the dry run (real town, this machine); a note on whether the iPhone check was done.

## 5. Deferred to implementation

- VAPID public key route name: default `GET /api/v1/push/vapid` until OGM-016's ticket names it; one function to change.
- Start button target when signed out: default `/age` (OGM-072's flow); OGM-072 may change the screen's `navigate` target.
- Norigin version: default latest 2.x; if its React 19 peer range fails, name the override in the PR.
- Gamepad repeat timings: default 400 ms / 120 ms.
- Poster format: default `.webp` (as `title-town.js`); if the bake only produced `.jpg`, use it and update OGM-070's preload lines.

## 6. Scope boundaries

- No touch overlay, no frames into the game iframe: OGM-075 / OGM-028.
- No chat FAB or dock: OGM-076.
- No reports classifier, bundle upload or `bundleKey`: OGM-015 (the button sends none).
- No push sending, VAPID generation or notification rows: OGM-016.
- No changes to the town's code or tools; no move of `prototypes/title-city`: OGM-101.

## 7. Risks

- **Town weight on phones** (T09 §6). Default: keep the SW asset cache and the poster; the deploy sheet is the gate.
- **Controllers in Safari/iPad** for the host menus are unverified (B7 [U]). Default: ship keyboard parity first; a real-device check before calling input done.
- **Norigin + React 19** peer mismatch. Default: install with the override named in the PR; the poller works without Norigin (arrow keys still move native focus).
- **Push on iOS requires home-screen install.** Default: the prompt appears only in standalone display mode (`matchMedia('(display-mode: standalone)')`) on iOS.
- **Audio unlock inside the town iframe**: not needed; all sound is the host's (kept from the prototype).
