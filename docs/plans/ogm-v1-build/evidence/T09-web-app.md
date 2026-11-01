# T09 web-app: evidence packet

Researched at `9508c1c` (branch `research`), 2026-10-31. Host checks are read-only. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

The React app on Netlify: title, age screen, sign-in, game picker, creation flow and scope chat, the game host (iframe bridge, editor framework, undo/redo, edit-while-building), the build chat dock, versions and releases, multiplayer screens, admin and build analytics, bug report, notifications, phone layout.
It inventories `prototypes/studio-v0` and `prototypes/ui-v0`, says what carries over, and recommends package layout, router, state, build tooling and iframe hosting.
It consumes contracts from T01 (API, auth), T04 (engine–editor messages), T06 (voice client), T07 (room protocol), T08 (design log, branches, releases), T05 (style families), T11 (hostnames).

## 2. Evidence packets

### E09-1: The prototype is a hash-routed single page with four screens, no framework, no build step, no tests
- Claim / current behavior: `app.js` keeps `state.screen` in {title, library, wizard, play}; `show()` toggles `<section class="screen">` elements; `#library` and `#new` hashes skip the title. No router, no component model, no tests, no package.json at the repo root [M].
- Source and exact locus: `prototypes/studio-v0/app.js:15-27, 651-654`; `prototypes/studio-v0/index.html:583-645`; no `.github/`, no root `package.json` [M].
- Why it matters: nothing is importable into a React app as code; the screens, flows and CSS are a design reference only.
- Confidence and freshness: [M] as of 9508c1c.
- Contradiction or open question: none. README says "throwaway" (`prototypes/studio-v0/README.md:1`).
- Suggested requirement/decision impact: the V1 app is a fresh `apps/web` package; port behaviours, not files (see §3).

### E09-2: Line inventory of studio-v0 and ui-v0 (what each file does, keep or discard)
- Claim / current behavior: [M] line counts via `wc -l`:
  - studio-v0: `app.js` 654 (screens, library spotlight with FLIP glides, wizard, scripted VoiceSession, fake build tracker, living background), `index.html` 652 (lines 8–578 CSS, 580–652 markup), `data.js` 133 (example games, STEPS, ART pack previews, scripted talk), `scenes.js` 365 (canvas covers from Kenney sheets), `sound.js` 205 (Web Audio: music loop points, duck, iOS unlock), `icons.js` 81 (Phosphor duotone inline SVG), `title-town.js` 38 (iframe host for the town), `title-3d.js` 425 and `title-c.js` 199 (rejected title directions A/B/C), `sw.js` 21 (two-cache service worker), `tools/build.sh` 104, `tools/deploy.sh` 12, `tools/loadrec.mjs` 16 (phone-profile load recording), `tools/glb2json.py` 17, `tools/gm_logo.py` 54, `tools/previews.py` 13. `art/`, `demo/`, `town/` are gitignored build outputs (`.gitignore`), 44 MB on disk.
  - ui-v0: `site/index.html` 126, `js/main.js` 73 (`?shell` embed protocol), `js/home.js` 192 (paper home), `js/dungeon.js` 865 (editor + play, `window.__ogm.tick`), `js/audio.js` 91, `style.css` 187, `_headers` 7, `site.webmanifest` 12; tools: `e2e.mjs` 67, `bake.mjs` 20, `bake-goblin.html` 102, `copy-assets.sh` 24, `perf.mjs` 13, `weight.mjs` 12, `shot.mjs` 14, `view.html` 33, `package.json` (esbuild 0.25.0, playwright ^1.64.1). `tools/_pf.mjs` is untracked and unrelated (ProFantasy CDP driver).
  - `studio-v0/demo/js/dungeon.js` is byte-identical to `ui-v0/site/js/dungeon.js` [M] (`diff -q`): the studio embeds ui-v0 as its only "game".
- Source and exact locus: paths above.
- Why it matters: decides the carry-over table in §3 and T12's map.
- Confidence and freshness: [M].
- Contradiction or open question: `title-3d.js`/`title-c.js` are kept "for comparison" (`app.js:58-59`); they are discard for V1.
- Suggested requirement/decision impact: keep as behaviour references: `title-town.js`, `sound.js`, `sw.js`, `deploy.sh` head/`_headers`, `index.html` CSS tokens and media rules; everything else is discard.

### E09-3: The live site's title screen is the castle town in an iframe, and it must stay
- Claim / current behavior: the title mounts `town/index.html?cam=menu&scene=all&embed` in an `<iframe>` only while the title is shown; a poster `<picture>` (portrait/landscape webp) paints first and fades out after the town posts `'town-ready'`; the town posts `{sfx:[name,vol,rate]}` and `{loop:[name,gain]}` which the studio plays on its own unlocked audio; the parent posts `{tap:[x,y]}` for the Easter egg [V].
- Source and exact locus: `prototypes/studio-v0/title-town.js:8-33`; `prototypes/title-city/city.js:7-8, 895, 943, 952`; `prototypes/studio-v0/tools/build.sh` (town copy and bundle step).
- Why it matters: Kevin's direction is the busy coastal town with game-homage scenes (memory `title-city-scenes`), seamless poster-to-live reveal with no dim cross-fade and audio at once (memory `kevin-seamless-transitions`). The V1 app must host the same bundle and protocol.
- Confidence and freshness: [V] as of 9508c1c; the town is built by `prototypes/title-city/tools/build.sh` + `bundle.mjs`, outputs are gitignored.
- Contradiction or open question: the town bundle is plain ES modules + three.js r170 vendored; it must not be bundled by Vite (serve from `public/town/`).
- Suggested requirement/decision impact: ticket "Shell" carries the title host as-is; T10/T04 keep the capture hooks.

### E09-4: The game iframe uses `postMessage('*')` and a query-string protocol; V1 needs an origin-checked bridge
- Claim / current behavior: the studio sets `gameFrame.src = demo/index.html?shell&models=json&editor&title=…[&play]` and posts `{ogm:'play'|'edit'}` with target `'*'`; the game posts `{ogm:'start'}` to `parent` with `'*'` [V]. Same origin today.
- Source and exact locus: `prototypes/studio-v0/app.js:12, 247-262`; `prototypes/ui-v0/site/js/main.js:6-11, 51, 69-72`.
- Why it matters: V1 games run on a separate site (games domain, per-game subdomains for the microphone) (release plan "Sandbox"; spec §7.6 "separate-origin sandboxed iframe with validated message-channel capabilities").
- Confidence and freshness: [V].
- Contradiction or open question: the message vocabulary (manifest, design apply, pick, worldToScreen, setSelection, camera, tick) is T04's; the host side (React hooks, origin check, MessageChannel handshake) is this track's.
- Suggested requirement/decision impact: a `useGameBridge(iframe, expectedOrigin)` hook in `apps/web`; `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`, `allow="autoplay; fullscreen; gamepad; microphone"`; never `'*'` in production.

### E09-5: `tick(seconds)` and `window.__ogm` are the only test hooks the prototype offers, and only inside the game
- Claim / current behavior: `dungeon.js` exposes `window.__ogm = { tick, zoom, tileToScreen, map, player, foes, mode }`; `e2e.mjs` drives the loop with it and screenshots steps; it logs, it does not assert [V].
- Source and exact locus: `prototypes/ui-v0/site/js/dungeon.js:861-865`; `prototypes/ui-v0/tools/e2e.mjs:38-66`.
- Why it matters: the app's own e2e (Playwright) needs host-level hooks too: skip title, seed a signed-in session, open a game, read the bridge state.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: `apps/web` exposes `window.__ogmHost` (route, bridge state, job list) behind a `?test` flag; T10 builds `gm-verify` on T04's game hooks, not on these.

### E09-6: The build tracker and voice sessions are fake; the shape is the design reference for the build chat
- Claim / current behavior: builds are timers (300 s new game, 60 s feature) with 10×/60× demo speeds and fixed step strings; the tracker is a FAB → combined bar → per-build list; `VoiceSession` draws a seismograph (you) and a paint orb (builder) and plays scripted turns, with "Type instead" always available [V].
- Source and exact locus: `prototypes/studio-v0/app.js:402-507 (VoiceSession), 561-615 (jobs), index.html:632-643 (tracker markup)`; `data.js:120-133 (BUILD_STEPS)`.
- Why it matters: the decision "Build chat" (decision log 2026-10-31) turns this bar into a per-job chat: text, dictate, two-way voice, screenshots and clips at each visible step. The tracker's collapsed/open/expanded states and the two-sided panel are the UI to keep.
- Confidence and freshness: [V].
- Contradiction or open question: spec v0.4 §5.5 says a tap reveals "a slightly longer explanation of the request, not raw agent messages"; the newer decision shows agent-authored posts (media + captions). Decision log wins; raw logs still stay in aiur (§5.6).
- Suggested requirement/decision impact: define a "build post" shape (§4) that agents produce via T10's design skill and the backend relays; the dock renders it.

### E09-7: Phone and iOS lessons are encoded in the prototype CSS and audio code
- Claim / current behavior: safe-area insets on every fixed element, `svh` sizing for the spotlight, landscape-phone rules at `max-height: 540px`, `prefers-reduced-motion` kill switch, hover-only affordances gated by `(hover: hover) and (pointer: fine)`, 44 px icon/close targets, 56 px option icons on phones; audio unlock on `pointerup`/`touchend`/`keydown`/`click` (capture), `navigator.audioSession.type = 'playback'` to play with the ringer on silent, MP3 only because iPhone Safari cannot decode Ogg (build.sh transcodes), poster preloaded with `fetchpriority="high"`, fonts loaded non-blocking [V].
- Source and exact locus: `prototypes/studio-v0/index.html:56, 144, 169, 177, 277, 316, 335, 397, 411, 434, 459-477, 525-545`; `sound.js:163-171, 187`; `tools/build.sh` comments on MP3; `deploy.sh` viewport `viewport-fit=cover`.
- Why it matters: these are the rules T09 tickets must carry into the design tokens and the audio module.
- Confidence and freshness: [V].
- Contradiction or open question: assumption A12 keeps "64 px touch targets"; the prototype uses 44 px for secondary targets [M]. Recommend 64 px for primary (Start, Play, Edit, New game, Finish) and 44 px for secondary [O].
- Suggested requirement/decision impact: a `tokens.css` in `apps/web` with the safe-area, target-size and reduced-motion rules; `sound.ts` ported from `sound.js`.

### E09-8: The deploy is a hand-assembled folder with a service worker and `_headers`; no SPA fallback exists
- Claim / current behavior: `deploy.sh` wraps `index.html` in a real document head (viewport, noindex, icons, manifest), stamps `__BUILD__` into `sw.js`, writes `_headers` (noindex, `/sw.js` no-cache, `/town/*` no-cache, `/art/*` cacheable) and runs `netlify deploy --prod --no-build --dir`. The studio and ui-v0 `.netlify-site-id` files are identical [M], so one site serves ogm2000.netlify.app. `sw.js` keeps a per-deploy cache plus an `ogm-assets` cache that survives deploys [V].
- Source and exact locus: `prototypes/studio-v0/tools/deploy.sh`; `prototypes/studio-v0/sw.js`; `prototypes/ui-v0/site/_headers`.
- Why it matters: a React SPA needs `_redirects` (`/* /index.html 200`), hashed assets (Vite) and the same two-cache SW scheme for the town; Netlify credits are limited (memory `netlify-deploys-limited`), so deploys stay manual.
- Confidence and freshness: [V]/[M].
- Contradiction or open question: `netlify-cli` 26.0.2 is installed and logged in [M]; no CI exists. Assumption A14 lets the 5:30am deploy use either `build.sh` or the new app.
- Suggested requirement/decision impact: `apps/web/public/{sw.js,_headers,_redirects,site.webmanifest,icons}` + `tools/deploy.sh` that reuses the site id.

### E09-9: The V1 feature list has 41 of 52 entries; 23 need a screen or panel in the web app
- Claim / current behavior: extracted by evaluating the `FEATURES` array [M]: 52 features, 41 `ver: 'V1'`. Web-app-facing V1 entries by area: Creating a game (7: guided creation, style families, point of view, single/multi, map inspiration thumbnails, image upload, direction checkpoints [considering]); Voice and AI help (4: two-way voice, narration/captions, budget-aware voice, bug reports); Editing and playing (8: editor, branching [considering], input, releases, version numbers [considering], saves, achievements/analytics, forks); Multiplayer (3: rooms, invites, watch the editor); Accounts/admin/money (7: sign-in, families/invites, spending limits, admin UI, build analytics, notifications; funding is backend-only); Assets (Drive watch folder settings and lineups/pack thumbnails as admin/creation surfaces).
- Source and exact locus: `docs/architecture/architecture-scope.html:343-436`.
- Why it matters: this is the screen list in §4 and the ticket split in §5.
- Confidence and freshness: [M].
- Contradiction or open question: the doc's "Hosting" entry (Netlify + Railway) is superseded by self-hosting; only the frontend line survives.
- Suggested requirement/decision impact: each V1 entry above maps to one ticket row in §5.

### E09-10: Two looks exist; the studio's dark glass look is the newer one and wins
- Claim / current behavior: C1 §10.3 recommends keeping the paper style for app chrome; studio-v0 (Oct 29–31, Kevin's UX passes) replaced it with "one living background… frosted glass… Gruvbox accents… Single dark look by choice" [V]. The architecture page still embeds the paper demo.
- Source and exact locus: `docs/research/v0.5/C1-ui-prototype-learnings.md:123`; `prototypes/studio-v0/index.html:9-24`; `docs/architecture/architecture-scope.html:170-188`.
- Why it matters: Rule 7: pick one. The studio look is more recent and iterated with Kevin.
- Confidence and freshness: [V].
- Contradiction or open question: games keep their own looks (paper in Goblin Cellar); only app chrome is affected.
- Suggested requirement/decision impact: `apps/web` tokens come from `studio-v0/index.html` `:root`; the C1 paper recommendation is marked superseded.

### E09-11: The app must not call aiur directly; the backend proxies progress and events
- Claim / current behavior: aiur's HTTP API sits behind `client_token_read`/write pipelines and an origin allowlist (`verify_same_origin`); routes include `/api/v1/:issue_identifier/{progress,usage,events,cancel,pause,resume,messages,spend-cap}` and `/api/v1/events` [V]. `@aiur/contracts` exports `TicketProgressChangedEvent`, `TicketUsageChangedEvent`, `TicketSpendCapReachedEvent`, `VoiceConverseFrame` [V].
- Source and exact locus: `/home/orangekid/github/aiur/src/lib/aiur_web/router.ex:120-199`; `/home/orangekid/github/aiur/src/lib/aiur_web/routes/usage.ex`, `api/usage_progress_routes.ex`; `/home/orangekid/github/aiur/packages/aiur-contracts/src/index.ts:1-16`.
- Why it matters: a browser holding an aiur client token would leak it; the trust-zone rule (architecture doc) puts aiur with the backend. The app subscribes to the backend's job stream, which is shaped from these contracts.
- Confidence and freshness: [V] on aiur `0f692a45b`.
- Contradiction or open question: T02 decides the proxy shape; T09 only needs the outbound event union re-exported through `packages/contracts`.
- Suggested requirement/decision impact: `apps/web` depends on `@aiur/contracts` types only (type imports), never on an aiur URL.

### E09-12: No React or component library exists in aiur to reuse; Vite is the shared build tool
- Claim / current behavior: aiur's `website/` is Vite 6 vanilla TypeScript with Playwright visual tests; `docs-app` is VitePress; `packages/aiur-style` is a CSS/token design system (MIT); the dashboard is Phoenix LiveView [V]. No React anywhere in the aiur checkout.
- Source and exact locus: `/home/orangekid/github/aiur/website/package.json`, `vite.config.ts`; `packages/aiur-style/package.json`; `src/lib/aiur_web/`.
- Why it matters: no component reuse target; `aiur-style`'s look is aiur's, not the studio's (E09-10), so it is not adopted.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: Vite + React 19 + TypeScript in `apps/web`; Playwright for e2e (already installed in `prototypes/ui-v0/tools/node_modules` [M]).

### E09-13: Cookies across Netlify and a self-hosted API need a proxy or SameSite=None
- Claim / current behavior: with Railway gone, the API, voice host, rooms and games domain are hostnames on Kevin's machine (T11). The app on `ogm2000.netlify.app` is cross-site to all of them [I].
- Source and exact locus: `docs/plans/ogm-v1-build/README.md` (objective); `questions-or-commands.md` A7/A8.
- Why it matters: Better Auth session cookies default to SameSite=Lax; cross-site XHR would not carry them.
- Confidence and freshness: [I].
- Contradiction or open question: T01 picks the auth config; T11 picks hostnames.
- Suggested requirement/decision impact: default to a Netlify proxy rewrite `/api/* https://<backend-host>/api/:splat 200` so cookies stay first-party; WebSockets (rooms, voice) connect directly to their hosts with a token, not a cookie [O].

### E09-14: Gamepad and focus: the host is the only gamepad reader, Norigin allowed as an exception
- Claim / current behavior: B7 §5.3 recommends one `getGamepads()` poller in the host mapping to `nav.*`, `confirm`, `back`, zone cycling, forwarding raw input to the game in play mode; Norigin Spatial Navigation core (491 stars, MIT) was allowed by Kevin as the exception to the 1k rule [V]. iPad controller behaviour in cross-origin iframes is unverified [U per B7].
- Source and exact locus: `docs/research/v0.4/B7-editor-sdk-input.md:142-147, 177-178, 198`.
- Why it matters: controller navigation of the app's own menus is V1 (release plan "Input").
- Confidence and freshness: [V].
- Contradiction or open question: iframe `allow="gamepad"` and Permissions-Policy are needed for the game side (B7 §5.1).
- Suggested requirement/decision impact: `apps/web/src/lib/input/` owns the poller and focus zones; the bridge forwards in play mode.

### E09-15: Three spec v0.4 statements are superseded and must not leak into web-app tickets
- Claim / current behavior: §4.4 "Sign in with Google for adults and children" → decision log: email mandatory + passkey + Google (A10). §5.7 "parent-only help overlay and parental gate… are V1" → release plan: V3. §5.12 "Multiplayer — architecture V1, implementation V2" → C2 §6: first-class V1 [V].
- Source and exact locus: `docs/spec/game-maker-2000-spec-v0.4.md:349, 466, 539-541`; `docs/spec/game-maker-2000-v0.5-decisions.md:27, 40`; `docs/spec/release-plan.md:28, 56, 80`.
- Why it matters: precedence (decisions > release plan > C > B > A > spec).
- Confidence and freshness: [V].
- Contradiction or open question: §5.7's removal of "agent mirroring editor controls" still holds; "Ask for a change" is a feature request, not a control-driving agent.
- Suggested requirement/decision impact: tickets cite the release plan rows, not spec §4–5 text.

### E09-16: Notifications need the PWA shell the prototype already has; push needs a backend key
- Claim / current behavior: `site.webmanifest` (`display: standalone`), apple meta tags and `sw.js` exist [V]; spec §5.22 accepts the iOS home-screen requirement; Web Push needs a VAPID pair held by the backend (T01) and a `push` listener in the SW [I].
- Source and exact locus: `prototypes/ui-v0/site/site.webmanifest`, `index.html:12-15`; `prototypes/studio-v0/sw.js`; spec §5.22.
- Why it matters: "finished builds, queued changes starting, intake reports" (FEATURES Notifications).
- Confidence and freshness: [V]/[I].
- Contradiction or open question: none; zero cost.
- Suggested requirement/decision impact: in-app status is the baseline; push is an opt-in prompt after the first build.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Title screen host (poster → town iframe, sfx relay, tap relay) | `prototypes/studio-v0/title-town.js` (JS, 38 lines, no tests) | Port to TS as a React component; protocol unchanged | Kevin's title direction; seamless reveal rules |
| Title town bundle | `prototypes/title-city/*` → built `studio-v0/town/` (JS, 2,160 lines + tools) | Keep as a static artifact in `apps/web/public/town/` (not bundled) | Owned by title-city tools (T10/T04 hooks) |
| Studio audio (loop points, duck, iOS unlock) | `studio-v0/sound.js` (JS, 205, no tests) | Port to `apps/web/src/lib/sound.ts` | iOS rules are hard-won (E09-7) |
| Service worker two-cache scheme | `studio-v0/sw.js` (21) | Keep, hand-written in `public/` | Town assets survive deploys |
| Netlify delivery | `studio-v0/tools/deploy.sh`, `ui-v0/site/_headers`, site id | Replace with `apps/web/tools/deploy.sh` + `public/_headers`, `_redirects` | SPA fallback and API proxy needed |
| Design tokens, phone/iOS CSS rules | `studio-v0/index.html:8-578` (CSS) | Port the `:root` tokens and media rules to `tokens.css`; rewrite components | Newer look (E09-10) |
| Library spotlight, tiles, FLIP glides | `app.js:80-241` | Replace (React), keep behaviours as acceptance | Canvas covers from sprite sheets are demo-only |
| Creation steps and "Other" tile | `app.js:264-399`, `data.js` STEPS | Replace; options come from T05 style families and T04 POV list | Data was hand-written |
| Voice session panel (two-sided, type instead) | `app.js:402-541` | Replace with T06 client; keep the layout and seismograph/orb canvases as components | Scripted today |
| Build tracker | `app.js:561-615`, `index.html:632-643` | Replace with the build chat dock; keep three states | Fake timers |
| Game iframe host | `app.js:247-262`, `ui-v0/js/main.js` | Replace with origin-checked bridge (E09-4) | Separate origin in V1 |
| Editor UI (rail, palette, inspector, undo) | `ui-v0/js/dungeon.js` (865, in-game) | Replace: host-owned editor framework over T08 transactions, per B7 §3 | Prototype editor lives inside the game |
| e2e driver | `ui-v0/tools/e2e.mjs` (Playwright, logs only) | Replace with `apps/web/e2e/*.spec.ts` (assertions) | No assertions today |
| Phone load recording | `studio-v0/tools/loadrec.mjs` | Keep as a tool under `apps/web/tools/` | Deploy gate per memory |
| Icons | `studio-v0/icons.js` (Phosphor duotone, MIT) | Keep: move to `apps/web/src/icons.ts` | Already licensed and sized |
| Paper home screen | `ui-v0/js/home.js` | Discard | Superseded look |
| Title directions A/B/C | `title-3d.js`, `title-c.js` | Discard | Rejected by Kevin |

## 4. Interfaces and contracts this track defines or consumes

**Route table (T09 defines).** `/` title · `/age` · `/signin` · `/connect/github` · `/games` · `/new` (steps `?step=`) · `/g/:gameId` (play/edit, `?v=:branchId`, `?mode=play|edit`) · `/g/:gameId/versions` · `/g/:gameId/releases` · `/join/:inviteToken` · `/admin` (`/members`, `/invites`, `/budgets`, `/builds`, `/intake`) · `/settings`. Hashes `#library`, `#new` redirect to `/games`, `/new` (Kevin uses them).

**Game bridge host side (T04 owns the vocabulary; T09 owns the hook).**
```ts
type HostToGame = { t: 'hello'; v: 1; buildId: string; branchId: string; mode: 'play' | 'edit'; playerIndex: number }
  | { t: 'mode'; mode: 'play' | 'edit' } | { t: 'design.apply'; rev: number; patches: JsonPatch[] }
  | { t: 'input'; playerIndex: number; pad: GamepadSnapshot } | { t: 'tick'; seconds: number };
type GameToHost = { t: 'ready'; manifest: EditorManifest } | { t: 'pick'; ids: string[] }
  | { t: 'screen'; id: string; x: number; y: number } | { t: 'state'; text: string } | { t: 'error'; message: string };
// useGameBridge(iframeRef, origin: `https://${gameId}.${GAMES_HOST}`): rejects events whose e.origin !== origin
```

**Design transaction (T08 owns; T09 consumes for undo/redo and the "Saved ✓ / Not saved" indicator).**
```ts
type DesignTxn = { id: string; branchId: string; rev: number; actor: string; kind: 'manual' | 'system'; patches: JsonPatch[]; at: string };
```

**Job stream from the backend (T01/T02 own; T09 consumes as `EventSource('/api/jobs/:id/events')`).**
```json
{ "type": "post", "jobId": "j_…", "at": "2026-11-01T05:10:00Z", "step": "Placing the world",
  "kind": "image", "url": "https://…/shots/abc.webp", "caption": "First room placed", "phase": "implement" }
```
Other `type` values: `phase` (from `TicketProgressChangedEvent`), `usage`, `checkpoint` (`{options:[{id,label,clipUrl}]}`), `question`, `done`, `failed`. T10's design skill produces `post`s; T09 defines `kind: 'text' | 'image' | 'clip' | 'choice'`.

**Voice client (T06 owns).** `VoiceConverseFrame` from `@aiur/contracts` (`packages/aiur-contracts/schemas/voice-converse.v1.schema.json` [V]); the chat panel also accepts plain text and browser dictation.

**Room client (T07 owns).** `joinRoom({ inviteToken })` → `{ role: 'host' | 'player' | 'watcher', branchId, buildId }`; watcher receives `DesignTxn` stream plus presence `{ cursor, selection, camera }`.

**Creation options (T05 owns).** `GET /api/catalog/style-families` → `[{ id, label, packs: [{id, name, thumbnailUrl}], views: PointOfView[], genres }]`.

**Netlify (T09 defines).** `public/_redirects`: `/api/* https://BACKEND_HOST/api/:splat 200` then `/* /index.html 200`. `public/_headers`: noindex until launch, `/sw.js` no-cache, `/town/*` no-cache, `/assets/*` immutable.

**Title town embed (T09 owns as host, exists).** parent→town `{tap:[x,y]}`, `'pause'`, `'resume'`; town→parent `'town-ready'`, `{sfx:[name,vol,rate]}`, `{loop:[name,gain]}` (`city.js:7-8`).

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| W1 | Web app scaffold and Netlify delivery | `apps/web` (Vite 7, React 19, TS, react-router, TanStack Query, Vitest, Playwright) builds, tests, deploys to the existing site with SPA fallback, API proxy, tokens.css from studio-v0, `window.__ogmHost` test flag | `apps/web/{package.json,vite.config.ts,src/app/*,src/tokens.css,public/_redirects,_headers,site.webmanifest,icons},apps/web/tools/deploy.sh`, root workspace files (hot) | 2 | T12 monorepo layout; T11 backend hostname (placeholder env OK) | Any screen content; the backend |
| W2 | Shell: title town, sound, PWA, input, notifications, bug button | Title with poster→town reveal and Easter-egg relay; `sound.ts`; `sw.js` two caches; gamepad poller + focus zones (Norigin); notification permission + push subscribe; global bug report button | `apps/web/src/screens/title/*, src/lib/{sound,input,notify}/*, src/features/bug-report/*, public/{sw.js,town/}` | 3 | W1; T01 push + bug-report routes; title-city build output | Game-side input; the town's own code |
| W3 | Age screen, sign-in, GitHub connect | Neutral 18+ screen before any collection; email + passkey + Google via Better Auth client; GitHub connect at setup with public/private pick | `apps/web/src/screens/{age,signin,connect}/*, src/lib/api/auth.ts` | 2 | T01 auth routes and `packages/contracts` | Policy rules (T01); storing refused ages |
| W4 | Games picker | Tiles + spotlight from real games; versions on the card; Play/Edit; building state from the job stream; keyboard/controller browsing | `apps/web/src/screens/library/*` | 2 | W1, W3; T01 games API; T08 branch list | Cover rendering pipeline (builds supply stills) |
| W5 | Creation flow and scope chat | Steps (genre, vibe, style family, world, players single/multi, point of view) from catalog data; "Other" by type or dictate; scope chat (text, dictate, two-way voice) ending in an admitted job; budget offers rendered as choices; image upload with EXIF strip server-side | `apps/web/src/screens/create/*, src/features/chat/*` | 3 | W1; T05 style families; T04 POV list; T06 client; T01 admission + estimate | Estimation logic; voice transport |
| W6 | Game host and editor framework | Separate-origin iframe with origin-checked bridge; Play/Edit; platform HUD (pause, save slots, achievements, settings); editor framework per B7 §3 (rail with kinds, palette, inspector with scope labels, tools, gizmo overlay, snap prefs) over the design log with undo/redo and Saved indicator; edit while building; draft vs published; update indicator | `apps/web/src/screens/game/*, src/features/editor/*, src/lib/bridge/*` | 4 | W1; T04 bridge vocabulary; T08 transaction API; T11 games host | Game rendering; merge logic; room transport |
| W7 | Build chat dock | Tracker states (FAB, bar, list); per-job chat with posts (text, image, clip, choice), phases, usage in friendly units, checkpoints, queued-at-reset jobs with edit/cancel; works with text + dictation when voice is off | `apps/web/src/features/build-chat/*` | 3 | W1; T01 job stream; T06; T10 post format | Job admission; agent prompts |
| W8 | Versions, releases and merge screens | New version from here, switch, play either, cap of 5; publish from main, semver + changelog, rollback with warning; merge flow with side-by-side previews and voice-guided conflict choices | `apps/web/src/screens/game/{versions,releases,merge}/*` | 3 | W6; T08 branch/merge/release APIs | Three-way merge computation |
| W9 | Multiplayer screens | Invite button (copy/share sheet), `/join/:token` landing through sign-in into the room, age-screen wording, watcher mode (follow camera / free look, "talking to the builder…"), version badge, host-left end state | `apps/web/src/screens/join/*, src/features/room/*` | 3 | W6; T07 room client; T01 invites | Simulation; relay |
| W10 | Admin and build analytics | Members, peer admins, invites, allowance per member + reset, concurrency, oversight list and abuse actions, Drive folder setting, intake reports; build analytics: aiur phase timeline + activity breakdown per build and roll-ups | `apps/web/src/screens/admin/*` | 3 | W3; T01 admin + analytics APIs; T05 intake status | Policy evaluation; analytics storage |

## 6. Risks and unknowns

- **Cross-site auth** (E09-13). Default: Netlify proxy for `/api`; direct WebSocket with short-lived tokens for rooms and voice. Spike if Better Auth's passkey origin binding (RP ID) conflicts with the proxy; T01 decides.
- **Games origin on Kevin's machine.** Per-game subdomains need wildcard DNS + TLS (T11). Default: `*.games.<host>`; dev uses a second localhost port to keep the iframe cross-origin.
- **Controllers in cross-origin iframes on iPad** [U, B7]. Default: host polls gamepads and forwards in play mode; a real-device check before calling input done.
- **Voice with no keys.** Default: text and browser dictation ship first; two-way voice behind a capability flag read from the backend (`voice.conversation` in `KNOWN_CAPABILITY_IDS` [V]). T06 decides the zero-cost path.
- **Target sizes** 64 vs 44 px (E09-7). Default: 64 primary, 44 secondary; Kevin can confirm.
- **Direction checkpoints are "considering".** Default: the `choice` post kind is cheap and built in W7; a dedicated picker screen waits.
- **Town weight on phones.** Default: keep the SW asset cache and the poster; `loadrec.mjs` frame-by-frame check before each deploy (memory).
- **Router choice.** react-router v7 library mode vs TanStack Router: both pass the 1k rule. Default: react-router (smaller surface) [O].
- **State.** Default: TanStack Query for server state, one zustand store for UI/editor session, the design log client from T08 as its own module with undo/redo [O]. No Redux.
- **No tests in the prototypes.** Default: Vitest for units, Playwright e2e per screen with `window.__ogmHost`; W1 ships the harness.
- **Package manager.** pnpm 10.33.0, bun and yarn all present [M]. Default: pnpm workspaces (T12 to confirm).

## 7. Self-hosting notes

- The frontend stays on Netlify; what changes is every origin it talks to: API, voice host, rooms (WebSocket), games domain and bucket URLs now resolve to Kevin's machine's public hostname (T11). The app reads them from `VITE_*` env at build time and the CSP `connect-src`/`frame-src` lists them.
- Netlify proxy rewrites to an external host are a redirects feature with no spend [I]; verify the backend's TLS is valid for Netlify to proxy.
- Local development: Vite dev server on this machine, `server.proxy` for `/api` to the local backend, a second static server for games so the iframe is cross-origin in dev too.
- Deploys stay manual (`netlify deploy --prod --no-build --dir apps/web/dist --site <id>`), gated by the 5:30am checkpoint and Kevin's asks (memory `netlify-deploys-limited`).
- Checked on the host [M]: `node v24.14.0`, `npm 11.9.0`, `pnpm 10.33.0`, `yarn`, `bun` present; `netlify-cli/26.0.2`; `/usr/bin/chromium`; Playwright + esbuild in `prototypes/ui-v0/tools/node_modules`; no `.github/`; no root `package.json`; `.gitignore` already excludes `prototypes/*/site/assets/` and `prototypes/*/.netlify/`. An untracked `.netlify/` at the repo root and `prototypes/ui-v0/tools/.netlify/` exist (git status) and must stay ignored.
