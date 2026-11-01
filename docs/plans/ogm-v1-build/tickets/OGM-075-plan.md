# OGM-075 — Game host and editor framework: implementation plan

## 1. Problem frame

The creator opens a game and either plays it or tunes it. V1 games run on another origin inside an iframe; the editor is host-owned and knows only what the game's manifest declares; every edit is a transaction on the branch's append-only log, applied at once through the bridge and persisted with lease fencing. This ticket builds that screen in `apps/web` on top of three merged contracts (bridge, `@gm/host`, design log API). Nothing from the prototypes is reusable as code.

Requirements trace:
- R30 → the rail, palette, inspector with scope labels, tools, gizmo overlay and snap prefs are rendered from `GameManifest` (U3, U4).
- R34 → per-session undo/redo over transactions with stroke and drag coalescing (U2).
- R112 → the game host screen: play/edit, platform HUD, draft vs published, update indicator (U1, U5, U6).

## 2. Patterns to follow

- `/home/orangekid/github/aiur/website/playwright.config.ts`: `testDir`, `baseURL` on `127.0.0.1`, executable override by env; copy for the e2e config if OGM-070 did not already.
- `/home/orangekid/github/aiur/website/tests/visual.spec.ts`: the viewport matrix (`desktop 1280×800`, `mobile 390×844`, `mobile-landscape 844×390`) as `test.use` blocks; reuse the same three in `game-editor.spec.ts`.
- `/home/orangekid/github/aiur/packages/aiur-contracts/src/index.ts`: type-only imports from a contracts barrel; `apps/web` imports `@ogm/contracts` the same way.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/app.js:247-262`: the mode toggle semantics (`aria-pressed` on the active mode, `about:blank` on leave) to keep as behaviour.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/site/js/dungeon.js:70-79`: the undo stack to replace; its `commit(fn)` shape becomes `session.transact(label, commands)`.
- OGM-070's screen module convention: `apps/web/src/routes/<screen>/route.tsx` exporting `{ path, element }` (auto-collected); copy the shape of `apps/web/src/routes/games/route.tsx` (OGM-073) at pickup.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (this ticket adds none beyond OGM-070's `zustand`, `@tanstack/react-query`, `react-router`); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Route, GameFrame and Play/Edit bar

Goal: `/g/:gameId?v=&mode=` mounts the latest tested build of the branch in a cross-origin iframe through `@gm/host` and switches modes.
Files: Create `apps/web/src/routes/game/{route.tsx,GameScreen.tsx,PlayEditBar.tsx,extras.ts}`, `apps/web/src/features/editor/frame.ts`; Test `apps/web/src/features/editor/frame.test.ts`.
Approach: `frame.ts` exports `useGameFrame({ gameId, branchId, buildId, mode, build })` wrapping OGM-028's `createGameFrame(container, { src, origin, sandbox: 'allow-scripts allow-same-origin allow-pointer-lock', allow: 'autoplay; fullscreen; gamepad' })` and `HostBridge`; `src` = `${VITE_GAMES_ORIGIN}/g/${gameId}/${buildId}/index.html?build=${build}&protocol=1`. The hook resolves `buildId` from `GET /api/games/:g/branches/:b` (latest tested build; OGM-043 adds the branch row, OGM-041 exposes head; use `branch.latestBuildId`) and sends `hello` on `ready`. `GameScreen` lays out `PlayEditBar` (top), the frame (fills `100svh` minus bars), `PlatformHud` (U5) and, in edit mode, the editor panels (U3). `extras.ts` exports `gameExtras: GameExtra[] = []` and `GameScreen` renders each by placement.
Interface sketch:
```ts
export type GameExtra = { id: string; placement: 'topbar' | 'hud' | 'overlay'; Component: React.FC<{ gameId: string; branchId: string; mode: 'play' | 'edit' }> };
export function useGameFrame(opts: { gameId: string; branchId: string; mode: 'play' | 'edit' }): { bridge: HostBridge | null; state: 'loading' | 'ready' | 'error'; manifest?: GameManifest; send: (m: HostToGame) => void };
```
Test scenarios:
- Given a ready bridge, when mode changes to `edit`, then one `mode.set` envelope is sent.
- Given a message from `https://evil.test`, when received, then it is dropped and `dropped` increments.
- Given no `ready` within 10 s, when the timer fires, then state is `error` and a retry re-creates the frame.
- Given `?v=` absent, when the route loads, then `branchId` is `main`.

### U2 — Editor session store, transactions, lease and stream

Goal: one store that holds the effective doc, posts transactions with fencing, keeps undo/redo per session, and follows the branch stream.
Files: Create `apps/web/src/features/editor/{session.ts,transactions.ts,api.ts,lease.ts,stream.ts}`; Test `session.test.ts`, `transactions.test.ts`, `lease.test.ts`.
Approach: `transactions.ts`: `buildTransaction(doc, commands, manifest) → { next, patches, inverse }` using `packages/design-log` `apply` (immer `produceWithPatches`); `coalesce(open, more)` merges a stroke's patches by last-write-per-path. `api.ts`: `postTransaction(g, b, body)` → `{ rev } | 409 { headRev } | 423 { lease }`; `getSnapshot(g, b, rev?)`; `getTransactionsSince(g, b, rev)`. `lease.ts`: `acquire`, `heartbeat` every 15 s, `release`; on 423 anywhere → `readOnly: true`, undo stack cleared (B7 §6). `stream.ts`: `EventSource('/api/games/:g/branches/:b/transactions?after=')`, reconnect from `headRev`; a transaction from another session applies `patches` to the doc and sends `design.apply` to the frame; own transactions are recognised by `id` and ignored. `session.ts` (zustand): `transact(label, commands)` → optimistic apply + `design.apply` + POST; on 409 → refetch snapshot, replay the pending transaction, retry once; `undo()` posts `{ kind: 'manual', label: 'Undo ' + label, patches: inverse, inverse: patches }`; `beginStroke/endStroke` for coalescing. Saved status: `saved` when every posted transaction has a `rev`; `saving` while one is in flight; `retrying` after a network failure (exponential backoff, max 30 s).
Interface sketch:
```ts
type SavedState = 'saved' | 'saving' | 'retrying' | 'readOnly';
interface EditorSession { doc: DesignDoc; headRev: number; lease: { token: number; expiresAt: string } | null; saved: SavedState;
  selection: string[]; tool: ToolId; prefs: EditorPrefs; undo: Transaction[]; redo: Transaction[];
  transact(label: string, commands: EditorCommand[]): Promise<void>; beginStroke(label: string): void; endStroke(): void; undo(): void; redo(): void; }
```
Test scenarios:
- Given 40 brush steps between `beginStroke` and `endStroke`, when ended, then exactly one POST with coalesced patches and one undo entry whose `inverse` restores the doc byte-equal.
- Given a 409 with `headRev` 45, when retried, then the second POST carries `baseRev: 45`.
- Given a 423, when received, then `saved === 'readOnly'`, undo is empty and no further POSTs happen.
- Given a stream transaction with an unknown `id`, when it arrives, then the doc updates and `design.apply` is sent; given one with an own `id`, nothing is sent.
- Given a failed fetch, when retried, then status is `retrying` and the transaction is re-sent unchanged.
Execution note: test-first; these tests encode the fencing contract and are the regression guard for the whole ticket.

### U3 — Rail, palette, inspector, tools, hint strip, snap prefs

Goal: the host-owned editor panels rendered from the manifest.
Files: Create `apps/web/src/features/editor/{Rail.tsx,Palette.tsx,Inspector.tsx,Tools.tsx,HintStrip.tsx,SnapPrefs.ts,focus.ts}`; Test `Inspector.test.tsx`, `Palette.test.tsx`, `SnapPrefs.test.ts`.
Approach: `Rail` lists `manifest.palette.categories[]`, switching by `kind`: `items` → `Palette`; `tools` → `Tools`; `panel` → `Inspector` in global mode. `Palette` renders `items[] {prefab, label, thumbnail, hint}` as 64 px tiles; tap-then-tap-world or drag to place (U4). `Inspector` renders the selection's controls from `manifest.controls` filtered by `scope` and prefab; the header label is `This <prefab label>` for `instance`, `All <plural>` for `prefab`, the group title for `global`; widgets: slider (track tap, stepper), choice (segmented ≤ 4, select otherwise), count with `semantics: 'param' | 'instances'` (instances → `+` places through `validatePlacement`, `−` removes the last placed), toggle, colour; `pinned: true` global groups stay visible. Commands: `duplicate`, `delete`. `HintStrip` text comes from the active tool and `items[].hint`. `SnapPrefs` stores `{ snap: boolean; grid: number }` in `localStorage['ogm.editorPrefs.<gameId>']`, never in the doc. `focus.ts` registers five zones with OGM-071's module (`registerZone(id, el)`), shoulder buttons cycle, canvas zone pauses spatial nav while it captures directions.
Interface sketch:
```ts
export type ToolId = 'select' | 'place' | 'brush' | 'sculpt' | 'erase' | 'path';
export type EditorPrefs = { snap: boolean; grid: number };
export function scopeLabel(control: ControlDecl, selection: TargetRef[], manifest: GameManifest): string;
```
Test scenarios:
- Given a control with `scope: 'prefab'` and a selected skeleton, when rendered, then the header reads "All skeletons" and `set` targets `prefab:skeleton`.
- Given a `choice` with 5 options, when rendered, then it is a select, not segmented.
- Given snap toggled, when the doc is inspected, then it is unchanged and `localStorage` holds the pref.
- Given a `count` with `semantics: 'instances'`, when `+` is pressed and `validatePlacement` answers `ok: false`, then no transaction is posted and the reason is shown.

### U4 — Canvas interaction: pick, place, gizmos, strokes

Goal: pointer, touch and controller interaction over the frame with a ghost, gizmo overlay and one transaction per intent.
Files: Create `apps/web/src/features/editor/{GizmoOverlay.tsx,canvas.ts}`; Test `canvas.test.ts`.
Approach: `canvas.ts` owns an overlay `<div>` above the iframe with `pointer-events: none` except on handles. Tap → `editor.pick {x, y}` normalised → `editor.picked` → `selection`; `editor.select` echoes it so the game draws depth-correct outlines. Place: drag from the palette (or tap-tap) → ghost positioned by pointer, snapped when `prefs.snap`, validated by `editor.validatePlacement` at ≤ 15 Hz, coloured by the answer; drop → `transact('Placed skeleton', [{ op: 'invoke', command: 'place', args: { prefab, pose } }])`. Gizmos: per-prefab `gizmos[]` (`translate`, `rotateYaw`, `elevate`, `splinePoints`) rendered at `editor.screen` positions; a drag is one stroke (`beginStroke` … `endStroke`) mapping to `set` commands by step and limits; controller: d-pad moves the reticle one grid cell, A places, X rotates, Y opens context actions (B7 §5.3). Brush/sculpt strokes coalesce by chunk key (E08-10).
Interface sketch:
```ts
export function useCanvas(session: EditorSession, bridge: HostBridge): { onPointerDown(e): void; onPointerMove(e): void; onPointerUp(e): void; ghost: { prefab: string; pose: Pose; ok: boolean; reason?: string } | null };
```
Test scenarios:
- Given a pointer drag of a translate gizmo, when released, then one transaction with `label` "Moved skeleton" exists.
- Given snap on with grid 1, when the ghost is at 2.4, then its pose is 2.
- Given the reticle at the edge, when d-pad right is pressed, then the reticle clamps and no transaction is posted.

### U5 — Platform HUD: pause, saves, achievements, settings

Goal: the platform-owned play HUD.
Files: Create `apps/web/src/routes/game/PlatformHud.tsx`, `apps/web/src/features/editor/hud/{saves.ts,achievements.ts,settings.ts}`; Test `settings.test.ts`, `saves.test.ts`.
Approach: Pause button (64 px) sends `lifecycle.pause`; the overlay offers Resume, Save, Settings, Leave. Saves: slots `auto | 1 | 2 | 3` from `packages/contracts/saves.ts`; Save sends nothing new, the game emits `save.write` and the host fills identity and slot then `PUT /api/saves/:g/:slot` with `If-Match` (route owned by OGM-046; on 404 hide the slot buttons); Load sends `save.restore`. Achievements: the manifest's `achievements.json` list; a `GameToHost event {kind: 'achievement'}` shows a toast suffixed "(test)" when `build === 'draft'`. Settings: `{ mute, volume, textScale, reduceMotion }` in `localStorage['ogm.settings']`, sent as `settings` on `ready` and on change; `reduceMotion` defaults from `prefers-reduced-motion`.
Interface sketch: `type Settings = { mute: boolean; volume: number; textScale: number; reduceMotion: boolean }`.
Test scenarios:
- Given a draft build, when an achievement event arrives, then the toast ends with "(test)" and no API call is made.
- Given the saves route answers 404, when the HUD renders, then no slot button exists.
- Given `prefers-reduced-motion`, when settings load first time, then `reduceMotion` is true.

### U6 — Edit while building, re-apply card, draft/published, update indicator

Goal: the screen keeps working while a job runs and handles a new build honestly.
Files: Create `apps/web/src/features/editor/ReapplyCard.tsx`, `apps/web/src/routes/game/UpdateIndicator.tsx`, `apps/web/src/features/editor/builds.ts`; Test `ReapplyCard.test.tsx`, `builds.test.ts`.
Approach: `builds.ts` subscribes to the job stream for this game (the SSE OGM-076 also reads; OGM-016's notifications stream carries `build.done`) and to `GET /api/games/:g/branches/:b` polling every 30 s while a job is active; a new `latestBuildId` with `status: 'tested'` → `GET /api/games/:g/branches/:b/reapply/:buildId` (OGM-042; 404 → switch directly) → `ReapplyCard` with five counts and a per-entry list for `needsChoice` (choose allowed value) and `conflicts` (keep mine / use builder's); confirming posts the choices as `kind: 'system'` transactions (the route is OGM-042's) and remounts the frame on the new build. Badge: `draft` unless `publishedReleaseId` points at this build. `UpdateIndicator`: `GET /api/games/:g/published` with `If-None-Match`, every 60 s and on `visibilitychange`; a changed ETag shows a 44 px indicator that reloads the frame on tap.
Test scenarios:
- Given the AE2 fixture report, when rendered, then it reads 20 carried, 1 renamed, 2 dropped and one choice row.
- Given the reapply route 404s, when a tested build arrives, then the frame remounts without a card.
- Given the same ETag, when polled, then no re-render.
- Given `visibilitychange` to visible, when fired, then one poll happens at once.

### U7 — Fixture game and Playwright e2e

Goal: a browser test over a real cross-origin frame.
Files: Create `apps/web/e2e/fixtures/bridge-game/index.html`, `apps/web/e2e/game-editor.spec.ts`, `apps/web/e2e/support/mock-api.ts`.
Approach: the fixture is a plain ES module that performs the OGM-020 handshake (`hello` → `ready` with a manifest of one category, two prefabs, two controls, one gizmo), answers `editor.pick` with a fixed target, `editor.validatePlacement` with `ok` unless `pose.x < 0`, and `design.apply` with `design.applied`. Serve it with `npx serve`-free code: a 20-line Node `http` static server on `127.0.0.1:10001` started from `globalSetup`. The API is mocked with `page.route('**/api/**')` returning fixtures from `packages/contracts/fixtures/` and an in-memory rev counter so 409/423 can be scripted. Spec steps mirror the agent gate list in the ticket.
Test scenarios:
- Given the fixture game, when the screen opens, then `__ogmHost.game.bridgeState === 'ready'` within 5 s.
- Given a palette drop, when the mock returns `{rev: 2}`, then `__ogmHost.game.saved === 'saved'` and `headRev === 2`.
- Given the mock scripted to 423, when the next edit is attempted, then the inspector is disabled and the indicator reads read-only.
- Given the phone viewport, when measured, then Play, Edit and Back are ≥ 64 px tall.

## 4. Verification

```
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/web test -- features/editor routes/game
pnpm --filter @ogm/web e2e -- game-editor            # GPU flags from the shared Playwright config; GM_VERIFY_SOFTWARE_GL=1 fallback
pnpm --filter @ogm/web build
```
Paste into the PR's `## Local tests`: the Vitest summary line (counts), the Playwright summary with the three viewports, the renderer string Playwright logged, and the head SHA tested against `main`.

## 5. Deferred to implementation

- Gamepad ownership while a frame is mounted: default, `@gm/host`'s poller runs and emits app-level nav actions to OGM-071's focus zones through a callback; OGM-071's own poller pauses while `GameScreen` is mounted (one reader, E04-13).
- Snapshot fetch on 409: default, fetch `GET .../design?rev=` (OGM-041) rather than replaying the stream.
- Where the branch's `latestBuildId` comes from before OGM-043 lands: default, `GET /api/games/:g` (OGM-012) with `mainBuildId`; switch to the branch route when present.
- Thumbnail source for palette items: default, the manifest's `thumbnail` URL relative to the build; no host rendering.
- Heartbeat while backgrounded: default, keep the 15 s timer; rely on fencing, not the lease UI (B7 §6 WordPress precedent).

## 6. Scope boundaries

- No camera rigs, no in-frame rendering, no `applyDesign` (OGM-022–025).
- No bridge transport changes; additive bridge messages are requested from OGM-020's owner, not added here.
- No transaction storage, lease fencing or SSE server (OGM-041); no re-apply computation (OGM-042); no merge (OGM-044); no publish (OGM-045); no save storage (OGM-046).
- No versions/releases/merge screens (OGM-077); no room UI (OGM-078); no build chat panel (OGM-076).

## 7. Risks

- A host-rendered overlay steals pointer events from the game canvas (E04-13): default, `pointer-events: none` on the overlay with handles only; verified by the e2e tap-to-pick step.
- Cross-origin dev setup: default, the fixture server on a second port; `VITE_GAMES_ORIGIN` from env, never derived.
- Lease UI vs reality: default, fencing is the guarantee; the indicator only reports.
- Manifest vocabulary drift between OGM-020 and B7 §3: default, render only what the merged `GameManifest` type declares; unknown fields are ignored (A4 §15).
- Large strokes (heightfield) exceed the 256 KB payload cap: default, chunked patches per chunk key (E08-10); over-cap transactions are refused client-side with a visible reason.
