# OGM-023 — three + rapier wrapper and the 3D scaffold: implementation plan

## 1. Problem frame

No 3D runtime exists on the decided stack: the prototypes are r170 with runtime geometry edits (E04-19, E04-8) and no physics. This ticket writes the thin `@gm/sdk/three` layer (renderer with tier DPR caps, Rapier stepped by the SDK clock with snapshots, GLTF decoding with meshopt and lazy KTX2) and the grey-box `templates/game-3d` that proves the hooks end to end in a real browser on the iGPU and under SwiftShader.

**Requirements trace.** R41: "wraps Three.js r186 + Rapier (3D) … behind one `GameModule`/`GameInstance` interface: `applyDesign` deterministic, `serialize`/`restore`/`migrate`, pick and placement validation, per-player multiplayer hooks" — the template implements all of them on the wrapper; pick uses a `Raycaster`, placement validation checks the grey-box bounds.

## 2. Patterns to follow

- `prototypes/title-city/city.js:936-958`: `await renderer.compileAsync(scene, camera)` before `frame(0)` and `__ready`; `__info()` reading `renderer.info.render.calls/triangles`. Copy both.
- `prototypes/title-city/city.js:943-947`: `frame(t)` as a pure function of time; the template's `scene.ts` syncs meshes from state each frame instead of mutating them in handlers.
- `prototypes/ui-v0/site/js/dungeon.js:755-842` and `:861-865`: `updatePlay(dt)` separate from `frame()`, `tick` stepping without render; here `onStep` vs `onFrame`.
- `docs/research/v0.5/C4-mobile-asset-pipeline.md` §3.2 (DPR caps, `?tier=` override, 60-frame downgrade), §5.4 (loader sketch: `fileFor`, deduped `loadFile`, `getObjectByName(manifest.assets[id].mesh)`); the loader itself is OGM-026, this ticket supplies the decode step.
- `docs/research/v0.3/A4-engine-sdk-editor.md` §10.1 repo shape (`src/main.ts ≤ 150 lines`, `src/core`, `src/features/<name>/`) for the template layout.
- `prototypes/title-city/tools/capture.mjs:17-23`: launch flags and the `__ready`/`__frame` protocol the Playwright spec reproduces.
- OGM-024's `templates/game-2d` (if it merges first) for the shared template test shape; keep the two templates' `tests/` file names identical.

## 3. Implementation units

### U1 — `createRenderer`
- **Goal:** one function that builds the `WebGLRenderer` with tier DPR caps, resize and compile, and exposes `renderInfo`.
- **Files:** Create `packages/sdk/src/three/renderer.ts`, `packages/sdk/src/three/index.ts`; Modify `packages/sdk/src/index.ts` (+1 line); Test `packages/sdk/test/three/renderer.test.ts`.
- **Approach:** `DPR_CAP = { desktop: 2, mobile: 1.5, low: 1 }`; `new WebGLRenderer({ canvas, antialias: tier === 'desktop', powerPreference: 'high-performance' })`; `renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP[tier]))`; `resize(w, h, dpr)` → `setSize(w, h, false)` + `setPixelRatio(min(dpr, cap))`; `compile(scene, camera)` → `renderer.compileAsync(scene, camera).catch(() => {})`; `info()` → `{ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: lastFrameMs, textureBytes: renderer.info.memory.textures * 0 /* three has no byte count; report count in `textures` */, backend: renderer.getContext().getParameter(UNMASKED_RENDERER_WEBGL via WEBGL_debug_renderer_info) ?? 'webgl' }`; `lastFrameMs` measured around `render` with `performance.now()` (render timing is allowed; it is not simulation). Listen for `webglcontextlost` and call `opts.onContextLost?.()`.
- **Interface sketch:** as in the ticket.
- **Tests (jsdom with a stubbed `WebGLRenderer` via `vi.mock('three')`):** Given tier `mobile` and `devicePixelRatio = 3`, when created, then `setPixelRatio(1.5)` was called. Given tier `low`, then `1`. Given `resize(800, 600, 2)` on `desktop`, then `setSize(800, 600, false)` and `setPixelRatio(2)`. Given `info()`, then it has the five keys.

### U2 — `createPhysics`
- **Goal:** Rapier world stepped by the SDK clock with snapshot keyframes.
- **Files:** Create `packages/sdk/src/three/physics.ts`; Test `packages/sdk/test/three/physics.test.ts` (Node, real Rapier compat build).
- **Approach:** `import RAPIER from '@dimforge/rapier3d-compat'; await RAPIER.init();` once (module-level promise); `world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })`; `world.timestep = 1 / 60`; `rt.onStep(() => world.step())`; `snapshot = () => world.takeSnapshot()`, `restore = bytes => { world.free?.(); world = RAPIER.World.restoreSnapshot(bytes) }` — note `restoreSnapshot` returns a new world, so `createPhysics` returns a handle whose `.world` getter always points at the live world and the template keeps body handles by looking them up from `userData` ids after restore; register with the runtime's keyframe hook: `rt.keyframes.register({ take: snapshot, restore })` (OGM-022 provides this slot; refresh the name at pickup).
- **Interface sketch:** `createPhysics(rt, { gravity? }): Promise<{ get world(): RAPIER.World; snapshot(): Uint8Array; restore(b: Uint8Array): void }>`.
- **Tests:** Given a dynamic ball at y = 5, when `rt.clock.advance(1000)`, then `world.step` ran 60 times (spy) and the ball is lower. Given `s = snapshot()` at tick 30, when 30 more steps run, `restore(s)`, and 30 steps run again, then the ball's position equals the first run's tick-60 position to 1e-6. Given no steps from `requestAnimationFrame` (none exists in Node), then the position never changes without `advance` (negative control).
- **Execution note:** test-first on the restore equality; it is the invariant `renderAt` depends on.

### U3 — `createGltf` decoding with meshopt and lazy KTX2
- **Goal:** a `GLTFLoader` configured for build-time-compressed files, plugged into OGM-026's loader.
- **Files:** Create `packages/sdk/src/three/gltf.ts`; Test `packages/sdk/test/three/gltf.test.ts`; fixture `packages/sdk/test/fixtures/cube.meshopt.glb` (generate once with `gltfpack -cc` from a 12-triangle cube written by a 20-line script in `packages/sdk/test/fixtures/make-cube.mjs`; commit the ≤ 10 KB output, not the tool).
- **Approach:** `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'; loader.setMeshoptDecoder(MeshoptDecoder)`; `decode(buf, name)` → `loader.parseAsync(buf, '')`; before parsing, if `name.endsWith('.ktx2')` or the manifest `decoders` includes `'ktx2'` (passed by OGM-026), `const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js'); ktx2 = new KTX2Loader().setTranscoderPath(…).detectSupport(renderer); loader.setKTX2Loader(ktx2)` once. Export `threeDecoders(renderer)` matching OGM-026's decoder-plugin signature (refresh at pickup: expected `{ glb: (buf, meta) => Promise<GLTF> }`).
- **Interface sketch:** as in the ticket.
- **Tests (Node):** Given the meshopt cube, when `decode` runs, then the scene has one mesh with 12 triangles. Given a name ending `.glb` and no `ktx2` decoder flag, then the dynamic `KTX2Loader` import was not executed (spy via `vi.mock`). Given `decoders: ['ktx2']`, then it was executed once across two calls.

### U4 — Template: game module and headless sim
- **Goal:** `templates/game-3d` implements `GameModule` with two controls, saves, pick, placement and `net` hooks, testable in Node.
- **Files:** Create `templates/game-3d/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/game.ts`, `src/state.ts`, `src/scene.ts`, `design/level.json`, `assets/manifest.json`, `README.md`; Test `templates/game-3d/tests/sim.test.ts`.
- **Approach:** `state.ts`: `{ players: Map<number, { id; pos: Vec3; vel: Vec3 }>, tick }` and `applyInput(playerIndex, frame)` per `gm-multiplayer-ready` rule 1 (T07 §4.4). `game.ts`: `defineFeature({ id: 'player', schema: z.object({ speed }), controls: [{ id: 'player.speed', widget: slider 1–10, scope: 'global', path: '/globals/player.speed', default: 4 }] })`, `defineFeature({ id: 'level', schema: z.object({ size }), controls: [{ id: 'level.size', widget: count 6–40 }] })`; `applyDesign(next, patches)`: any patch path starting `['globals','level.size']` → `'restart-scene'`, else update speed → `'live'`; `serialize()` → `{ saveSchemaVersion: 1, data: { players: [...], tick } }`; `pick(nx, ny)` → `Raycaster` from the fixed camera against player meshes → `TargetRef[]`; `validatePlacement(prefab, pose)` → inside `±size/2`; `net.spawn(i, id)` places at `design.entities.spawn_*` in index order; `hud(i)` → `{ speed }`. `scene.ts`: floor `PlaneGeometry(size, size)`, four `BoxGeometry` walls, `CapsuleGeometry` per player, all grey `MeshStandardMaterial`, one `DirectionalLight`; `sync(state)` moves capsules. `main.ts` (≤ 150 lines) wires boot, renderer, physics (a kinematic body per player moved by `applyInput`, static colliders for floor and walls), `onFrame`. `vite.config.ts`: `define: { __GM_BUILD__: JSON.stringify(process.env.GM_BUILD ?? 'draft') }`, `server.host: '127.0.0.1'`.
- **Interface sketch:** `export const game: GameModule<LevelDesign, LevelSave>`; `package.json` scripts `dev`, `build`, `test` (`vitest run`), `test:browser` (`playwright test`), `typecheck`, `lint`.
- **Tests (Node, `headless: true`):** Given the module booted through the OGM-022 fixture bridge, when 3,600 steps run with `go` injected every step, then no throw and the player moved. Given `serialize()` → `restore()` on a second instance, then `renderGameToText()` texts are equal. Given `applyDesign` with `player.speed` 8, then `'live'` and the next step moves faster; with `level.size` 20, then `'restart-scene'`. Given two mounts with seed 42 and identical frames, then texts equal after 600 steps. Given `validatePlacement('spawn', {position: [99, 0, 0]})`, then `{ ok: false }`.

### U5 — Template: browser boot on the GPU flags
- **Goal:** the real page proves `__ready`, `advanceTime`, `__frame`, `render_game_to_text` and a non-blank still, on the iGPU and under SwiftShader.
- **Files:** Create `templates/game-3d/tests/boot.spec.ts`, `templates/game-3d/playwright.config.ts`.
- **Approach:** `webServer: { command: 'GM_BUILD=test pnpm build && pnpm preview --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173' }`; `use.launchOptions.args` from `GM_VERIFY_SOFTWARE_GL`; `executablePath` from `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when set (E12-15; the browser cache at `~/.cache/ms-playwright` is present). The page is opened directly (no host), so the template's `main.ts` falls back to a self-hosted hello when `window.parent === window` and `?build=test` (OGM-022 `boot` option `standalone: true` — if absent at pickup, add a 10-line shim in the template that posts the hello to itself). Steps: `waitForFunction(() => window.__ready)`, `evaluate(() => window.advanceTime(1000))`, parse `render_game_to_text()`, expect `tick === 60`, `evaluate(() => window.__frame(0.5))`, `screenshot`, compute variance over a 64×64 sample via `page.evaluate` reading the canvas (`getImageData` on a 2D copy), expect `> 0`; log `renderInfo().backend`.
- **Tests:** Given the GPU flags, then the spec passes and backend contains `ANGLE (Intel`. Given `GM_VERIFY_SOFTWARE_GL=1`, then it passes and backend contains `SwiftShader`. Given `?build=published`, then `window.__gm` is undefined (negative).

## 4. Verification

```sh
pnpm install
pnpm --filter @gm/sdk test
pnpm --filter @gm/template-game-3d test
pnpm --filter @gm/template-game-3d test:browser
GM_VERIFY_SOFTWARE_GL=1 pnpm --filter @gm/template-game-3d test:browser
pnpm -r typecheck
pnpm lint
```

`## Local tests`: policy `full`; head SHA; base `main`; selection `@gm/sdk` + `@gm/template-game-3d`; both renderer strings; test counts (expect ≥ 12 unit + 5 sim + 3 browser), 0 skipped.

Conventions: pnpm workspace (`templates/*` glob added if missing, stated in the PR); scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; preview server binds `127.0.0.1`; no secrets; `three`, `@dimforge/rapier3d-compat`, `@playwright/test` pinned at install (all above 1k stars); PR first line `Closes #<issue>`.

## 5. Deferred to implementation

- Exact OGM-026 decoder-plugin and OGM-022 keyframe-hook names: refresh at pickup; defaults `threeDecoders(renderer)` and `rt.keyframes.register`.
- Standalone hello when no host is present: default `boot({ standalone: true })` if OGM-022 shipped it, else the template shim.
- Character movement: default kinematic body + `KinematicCharacterController`; a dynamic body is acceptable if simpler.
- `textureBytes`: three exposes only a texture count; default report `0` and put the count in `probes()`.
- Fixed camera placement until OGM-025: default an iso-style position `(size, size, size)` looking at origin.

## 6. Scope boundaries

- No rigs, cutaway, follow lerp, pointer lock (OGM-025).
- No `pickTier`, no manifest parsing, no fetch dedupe (OGM-026); no asset packing (OGM-063).
- No audio (OGM-027), fx/nav/proc (OGM-019), net interpolation (OGM-054), conformance (OGM-029), skills and `gm new` (OGM-091).
- No Phaser (OGM-024).

## 7. Risks

- **Rapier 0.21 API drift or `restoreSnapshot` returning a new world** → handle body lookup by ids after restore; pin at install; default taken.
- **GPU contention in CI or with concurrent verifies** (D-VERIFY-GPU caps captures at 2) → the browser spec is one browser, ≤ 30 s; CI uses SwiftShader.
- **`gltfpack` is not installed** (E05-7) → the fixture GLB is generated once in a scratchpad and committed; the generator script is kept for provenance.
- **Vite `define` and the `?build=` query disagree** → `boot` refuses `published` with `build=test` in the URL (OGM-022 trap); the template passes both from one env var.
- **`templates/*` glob collision with OGM-024** → first merger adds it; second re-runs `pnpm install` (accepted lockfile conflict policy).
