# OGM-024 — phaser wrapper and the 2D scaffold: implementation plan

## 1. Problem frame

There is no Phaser code in the repository; the 2D runtime is greenfield on Phaser 4.2 (A4 §2). The SDK core (OGM-022) owns the clock and the hooks, so Phaser must behave as a view layer: present the logical size, draw state, and in test mode render exactly once when told. This ticket writes `@gm/sdk/phaser` and the grey-box 2D scaffold that proves the hooks in a real browser.

**Requirements trace.** R41: "Phaser 4.2 (2D) behind one `GameModule`/`GameInstance` interface: `applyDesign` deterministic, `serialize`/`restore`/`migrate`, pick and placement validation, per-player multiplayer hooks" — the template implements all of them; `pick` uses `scene.input.manager.hitTest` over the view rectangles, placement validation checks level bounds and overlap with platforms.

## 2. Patterns to follow

- `docs/research/v0.3/A4-engine-sdk-editor.md` §2 (Scale Manager modes verified in 4.2.1) and §12 row "Viewport and aspect" (`fixed` → `Scale.FIT` or `EXPAND` with letterboxing).
- `docs/research/v0.3/A4-engine-sdk-editor.md` §10.1 "Engine objects (Phaser sprites…) are views rebuilt from state. Phaser `DataManager` … must not be the source of truth."
- `docs/research/v0.4/B15-open-source-games.md:39`: the 2D base is `phaserjs/template-vite-ts`; copy its layout names only.
- `prototypes/ui-v0/site/js/dungeon.js:861-865` and `prototypes/title-city/city.js:943-958`: step-without-render, then one render; `__ready` last.
- `prototypes/ui-v0/site/js/dungeon.js:607-620` (`bindTouch` iOS fixes): not reused in the game (the host owns touch, E04-13); cite only to explain why the template has no stick.
- OGM-023's `templates/game-3d/tests/{sim.test.ts,boot.spec.ts}` (if merged first): keep file names and assertions parallel so OGM-029 runs both templates with one runner.

## 3. Implementation units

### U1 — `createPhaserGame` and presentation
- **Goal:** build the `Phaser.Game` from the manifest's `presentation` with the right Scale mode; expose `renderOnce` and `info`.
- **Files:** Create `packages/sdk/src/phaser/game.ts`, `packages/sdk/src/phaser/index.ts`; Modify `packages/sdk/src/index.ts` (+1 line); Test `packages/sdk/test/phaser/game.test.ts`.
- **Approach:** `const mode = presentation.fit === 'fixed' ? Phaser.Scale.FIT : Phaser.Scale.EXPAND; const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: presentation.minLogical.w, height: presentation.minLogical.h, scale: { mode, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: scenes, resolution/dpr: capped by tier from rt.host.tier (DPR caps 2/1.5/1 as in OGM-023) })`; await `game.events.once('ready')`; if `opts.test` → `game.loop.sleep()`; `renderOnce = () => game.loop.step(performance.now())` (if `TimeStep.step` is not public in 4.2.1, use `game.loop.wake(); await once('postrender'); game.loop.sleep()` — spike in U1, default the former); `info = () => ({ calls: game.renderer.drawCount ?? 0, triangles: 0, frameMs: lastFrameMs, textureBytes: 0, backend: game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas' })`. Host `viewport` messages → `game.scale.resize(w, h)` when `responsive`.
- **Interface sketch:** as in the ticket.
- **Tests (jsdom, `vi.mock('phaser')` capturing the config):** Given `fit: 'fixed'`, then `scale.mode === FIT`; given `'responsive'`, then `EXPAND`; given `test: true`, then `loop.sleep` was called after `ready`; given `renderOnce()`, then `loop.step` was called once.

### U2 — Lifecycle binding
- **Goal:** `GameInstance.pause/resume/dispose` and `'restart-scene'` map to Phaser calls, idempotent and guarded.
- **Files:** Create `packages/sdk/src/phaser/lifecycle.ts`; Test `packages/sdk/test/phaser/lifecycle.test.ts`.
- **Approach:** `bindLifecycle(rt, game, levelKey)`: `pause()` → `game.loop.sleep(); game.scene.pause(levelKey); rt.clock.pause()`; `resume()` → reverse unless in test mode (loop stays asleep); `dispose()` → `disposed = true; game.destroy(true)`; `restartScene(data)` → `if (!disposed) game.scene.getScene(levelKey).scene.restart(data)`. Subscribe to `rt` lifecycle so `lifecycle.pause` envelopes reach it automatically (OGM-022 exposes `rt.onLifecycle`).
- **Interface sketch:** as in the ticket.
- **Tests:** Given `pause()`, then `loop.sleep` and `scene.pause` called and `rt.clock.paused === true`. Given `dispose()` then `restartScene()`, then `restart` not called. Given `resume()` in test mode, then `loop.wake` not called.

### U3 — 2D camera presets
- **Goal:** `topdown`, `side`, `fixed` as `CameraRig` implementations over `Phaser.Cameras.Scene2D.Camera`.
- **Files:** Create `packages/sdk/src/phaser/camera-presets.ts`; Test `packages/sdk/test/phaser/camera-presets.test.ts`.
- **Approach:** each preset returns `{ id, dimension: '2d', occlusion: 'none', inputMapping, attach(target, playerIndex), update(dt, frame), worldToScreen(p) }`. `topdown`: `cam.startFollow(proxy, true, 0.1, 0.1)`, `cam.setZoom(zoom)`, `inputMapping: { keyboard: { w:'move.up', a:'move.left', s:'move.down', d:'move.right' }, touch: 'stick', gamepad: { leftStick: 'move' }, pointerLock: false }`; `side`: `startFollow` with `setDeadzone(w/4, h/3)` and `setBounds` from the level; `fixed`: no follow, `setBounds(0, 0, w, h)`, `touch: 'tap'`. `attach` creates a `Phaser.Math.Vector2` proxy updated in `update` from `target.position()` so the rig never holds a game object. `worldToScreen(p)` → `{ x: (p[0] - cam.worldView.x) * cam.zoom, y: (p[1] - cam.worldView.y) * cam.zoom }` or `null` when outside `worldView`.
- **Interface sketch:** `cameraPresets.side(scene, cam): CameraRig`.
- **Tests (mocked camera):** Given `side`, then `setDeadzone` called with `(w/4, h/3)`; given `fixed`, then `startFollow` not called; given a world point outside `worldView`, then `worldToScreen` returns `null`; given `update` after the target moved, then the proxy equals the new position.

### U4 — Template: sim, module, scenes
- **Goal:** `templates/game-2d` with a plain-data platformer sim, a `GameModule`, and Phaser scenes as views.
- **Files:** Create `templates/game-2d/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/game.ts`, `src/state.ts`, `src/scenes/Boot.ts`, `src/scenes/Level.ts`, `design/level.json`, `assets/manifest.json`, `README.md`; Test `templates/game-2d/tests/sim.test.ts`.
- **Approach:** `state.ts`: `{ players: Map<number, { id; x; y; vx; vy; onGround }>, platforms: { x; y; w }[], tick }`; `step(state, design, frames)` applies gravity 900 px/s², `move` axis × `player.speed`, `jump` when `onGround` (velocity −420), AABB against ground (`y = 440`) and platforms; `applyInput(playerIndex, frame)` per T07 §4.4 rule 1. `game.ts`: features `player` (`player.speed` slider 60–400, default 160) and `level` (`level.width` count 640–4096, default 1280); `applyDesign` → `'restart-scene'` for `level.width`, `'live'` otherwise; `serialize` → `{ saveSchemaVersion: 1, data: { players: [...], tick } }`; `pick(nx, ny)` → rectangles under the point; `validatePlacement('platform', pose)` → inside level and no overlap; `net.spawn` at `spawn_a`/`spawn_b`. `Level.ts`: `create()` draws `Rectangle`s for ground, platforms, players; `update(time)` → if not test mode `rt.clock.live(time)`; then `syncViews(state)`. `main.ts` ≤ 150 lines. `vite.config.ts` defines `__GM_BUILD__`, `server.host: '127.0.0.1'`.
- **Interface sketch:** `export const game: GameModule<PlatformDesign, PlatformSave>`; scripts `dev`, `build`, `test`, `test:browser`, `typecheck`, `lint`.
- **Tests (Node, no Phaser import):** Given 3,600 steps with `move: 1` injected, then `x` increased and no throw. Given `jump` at tick 10 on the ground, then `y` decreases for several steps and `onGround` is true again by tick 120. Given `serialize` → `restore`, then texts equal. Given `applyDesign` `player.speed` 300, then `'live'` and faster movement; `level.width` 2000, then `'restart-scene'`. Given two mounts with seed 42 and the same frames, then equal texts after 600 steps. Given `validatePlacement('platform', { position: [400, 320, 0] })` on `plat_1`, then `{ ok: false, reason: 'overlap' }`.

### U5 — Template: browser boot
- **Goal:** the real page proves the hooks and the slept loop on the GPU flags and under SwiftShader.
- **Files:** Create `templates/game-2d/tests/boot.spec.ts`, `templates/game-2d/playwright.config.ts`.
- **Approach:** identical to OGM-023 U5 (web server on `127.0.0.1:4174`, flags from `GM_VERIFY_SOFTWARE_GL`, `executablePath` from env, standalone hello when `window.parent === window` and `?build=test`), plus: read `renderInfo().calls` before and after `__frame(0.5)` and expect `+1`; call `advanceTime(0)` twice and expect `tick` unchanged; log `backend`.
- **Tests:** Given the GPU flags, then pass with `backend === 'webgl'`. Given `GM_VERIFY_SOFTWARE_GL=1`, then pass. Given `?build=published`, then `window.__gm` is undefined.

## 4. Verification

```sh
pnpm install
pnpm --filter @gm/sdk test
pnpm --filter @gm/template-game-2d test
pnpm --filter @gm/template-game-2d test:browser
GM_VERIFY_SOFTWARE_GL=1 pnpm --filter @gm/template-game-2d test:browser
pnpm -r typecheck
pnpm lint
```

`## Local tests`: policy `full`; head SHA; base `main`; selection `@gm/sdk` + `@gm/template-game-2d`; both backend strings; counts (expect ≥ 12 unit + 6 sim + 3 browser), 0 skipped; note whether `TimeStep.step` was public (U1 spike result).

Conventions: pnpm workspace (`templates/*` glob if missing, stated in the PR); scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright on the GPU flags with the `GM_VERIFY_SOFTWARE_GL=1` fallback; preview binds `127.0.0.1`; no secrets; `phaser`, `@playwright/test` pinned at install (above 1k stars); PR first line `Closes #<issue>`.

## 5. Deferred to implementation

- `renderOnce` mechanism: default `game.loop.step(now)`; fallback wake/once('postrender')/sleep.
- Phaser `type`: default `Phaser.AUTO` (WebGL with canvas fallback) so headless runs never hard-fail.
- Whether the sim uses Phaser Arcade physics: default no (plain AABB in `state.ts`) so Node tests need no Phaser; Arcade is a pattern-card topic for OGM-094.
- Draw-call source for `renderInfo.calls`: default `game.renderer.drawCount` if present, else count `postrender` events.
- Standalone hello shim: same default as OGM-023.

## 6. Scope boundaries

- No 3D rigs, input merge, editor camera (OGM-025); the presets are registered by OGM-025, defined here.
- No pixelfx (OGM-019), audio (OGM-027), atlases (OGM-063), loader use (OGM-026), net (OGM-054), conformance (OGM-029), pattern cards (OGM-094), `gm new` (OGM-091).
- No Three.js (OGM-023).

## 7. Risks

- **Phaser 4.2 `TimeStep` cannot be single-stepped** → wake/postrender/sleep fallback; measured in U1 and recorded in the PR.
- **Phaser in jsdom for unit tests is unreliable** → mock `phaser` in `@gm/sdk` tests; real Phaser only in Playwright; the sim never imports Phaser.
- **DPR handling differs from three** → same `DPR_CAP` table copied from OGM-023 (or imported from `@gm/sdk/core` if OGM-023 placed it there; refresh at pickup).
- **`templates/*` glob race with OGM-023** → first merger adds it; second re-runs `pnpm install`.
- **Template drifts from `template-vite-ts` upstream** → the layout is copied by name only and documented in `README.md`; no sync obligation.
