# OGM-019 — fx, nav and proc helpers: implementation plan

## 1. Problem frame

Games need effects, paths and noise from the first template, and agents must author them as data with no binary tools (E04-10). The repo already holds a reviewed, pinned 2D effects library (`third_party/pixelfx`) and a proven 3D particle pattern (`prototypes/title-city/fx.js`); pathfinding and noise are small, well-known algorithms with permissive npm ports. This ticket adds three independent `@gm/sdk` areas, each deterministic for a seed and testable in Node.

**Requirements trace.** R48: `fx` (pixelfx adapter, data-driven 3D sprites), `nav` (grid A*, recast lazily behind a capability), `proc` (seeded FastNoise Lite); "Jolt and Effekseer are out of V1" is honoured by touching neither.

## 2. Patterns to follow

- `prototypes/title-city/fx.js:25-104`: the `FX` class (plan at add time, draw from time alone, one `InstancedMesh` per texture, zero matrix for dead particles, `reseed`). Port method by method; replace the module-level LCG (`fx.js:22-23`) with the injected `Rng`.
- `prototypes/title-city/earthbound.js:13-30`: how pixelfx effects are imported and re-simulated "from their start for any moment"; the adapter keeps that property.
- `third_party/pixelfx/src/core/index.js` (the only import surface): `createFx`, `createFrame`, `clearFrame`, `composite`, `painterFor`, `resolveOptions`.
- `docs/plans/2026-10-30-001-feat-pixelfx-agent-cli-plan.md` "Vendor it, pinned": no edits to the vendored tree, `PIN` is the record, updates are an operator script.
- `prototypes/title-city/city.js:27-36`: `fbm` (5 octaves, lacunarity 2.03, gain 0.5) and `ridge` (6 octaves, 2.1, 0.55 start amplitude) constants to preserve as defaults.
- `docs/research/v0.4/B15-open-source-games/mining.md:90-91,135`: recast-navigation 0.43.1 "Use" for 3D, easystarjs/PathFinding.js for 2D grids (both stale; a 60-line A* in the SDK is preferred, E04-9); "add npm libraries as dependencies instead of vendoring them; keep their notices".
- OGM-022's `packages/sdk/test/fixtures/counter-game.ts` and `no-random.test.ts`: reuse the grep test pattern for the three new areas.

## 3. Implementation units

### U1 — pixelfx alias and the 2D adapter
- **Goal:** render any vendored effect to frames with a seed; turn frames into a Phaser sprite sheet.
- **Files:** Create `packages/sdk/src/fx/pixel.ts`, `packages/sdk/src/fx/effects.ts` (generated list), `packages/sdk/src/fx/index.ts`, `packages/sdk/THIRD_PARTY.md`; Modify `packages/sdk/tsconfig.json` (paths alias), the SDK build config (alias + `allowJs` for the alias path), `packages/sdk/src/index.ts` (+1 line); Test `packages/sdk/test/fx/pixel.test.ts`.
- **Approach:** `effects.ts`: a small script `packages/sdk/scripts/list-pixelfx.mjs` walks `third_party/pixelfx/src/fx/**/*.js` and writes `export const EFFECTS = ['fire/torch', …] as const` plus a `loadEffect(name)` with `import(`pixelfx/fx/${name}.js`)` (Vite glob import `import.meta.glob('pixelfx/fx/**/*.js')` in the browser build); the generated file is committed and `--check`ed in CI. `renderEffect(effect, { palette, seed, frames })`: `const opts = resolveOptions(effect, { palette, seed }); const fx = createFx(effect, opts); const frame = createFrame(fx.w, fx.h); for i < frames: clearFrame(frame); fx.step?(i / fps) or fx.render(frame, t); composite(frame) → ImageData` (refresh the exact pixelfx call names against `src/core/fx.js` at pickup; `earthbound.js` shows the four-call sequence). In Node tests, `ImageData` and a 2D context come from the `canvas` package only if pixelfx needs a real context; otherwise pixelfx writes into typed arrays and the test compares `Uint8ClampedArray`s directly. `toPhaserTexture(scene, key, r)`: draw all frames onto one `HTMLCanvasElement` in a row, `scene.textures.addSpriteSheet(key, canvas, { frameWidth: r.w, frameHeight: r.h })`, return `key`.
- **Interface sketch:** as in the ticket.
- **Tests:** Given `fire/torch`, seed 3, 8 frames, when rendered twice, then every frame's bytes are equal; given seed 4, then at least one frame differs. Given `EFFECTS`, then length ≥ 200 and includes `'fire/torch'` and `'explosions/dirt-explosion'` (both imported by `earthbound.js`). Given a mocked `scene.textures`, when `toPhaserTexture` runs, then `addSpriteSheet` was called with `frameWidth === r.w`. Given an effect module whose render throws, then `renderEffect` rejects with the effect name in the message.
- **Execution note:** generate `effects.ts` first and run the `--check` in CI so a pixelfx update cannot silently change the list.

### U2 — `Fx3d`: port of `fx.js`
- **Goal:** data-driven 3D sprite particles, pure in time, textures by id, seeded by the SDK RNG.
- **Files:** Create `packages/sdk/src/fx/sprites3d.ts`; Test `packages/sdk/test/fx/sprites3d.test.ts`.
- **Approach:** copy `fx.js` structure: `TEX` becomes a constructor argument `textures: Record<FxKind, THREE.Texture[]>` (callers resolve ids through OGM-026's `AssetLoader.texture`); `ADDITIVE`/`FLAT` sets, the two shaders (`V`, `F`) and `uniforms` (`lum`, `night`, `fogC`, `fogN`, `fogF`) unchanged; `rnd`/`rr` read from the injected `Rng` (`rng.next()`); `add`, `reserve`, `burst`, `dust`, `flash`, `debris`, `splash`, `ring`, `decal`, `fire`, `build`, `update` ported line for line with types (`Particle` interface: `born, life, p, v, g?, drag?, size, grow?, rot, spin?, color, alpha, fade?, wobble?, tag?, tex, kind, s0?`); `reseed(s)` → `rng.setSeed(s)`. Keep `update(lt)`'s zero-matrix rule for dead or `dead(tag)` particles. Three is a peer dependency; tests mock `three` (`InstancedMesh.setMatrixAt` spy, `Object3D`, `Matrix4` real math from a tiny stub or the real `three` in Node, which works without WebGL).
- **Interface sketch:** as in the ticket.
- **Tests (real `three` in Node, mocked `scene.add`):** Given one `flash` at `t = 1`, when `build()` and `update(1.1)`, then instance 0's matrix scale > 0; when `update(2)`, then zero matrix. Given `update(9)` then `update(5)`, then matrices equal a fresh instance's `update(5)` (purity). Given `reseed(7)`, when `dust(0, [0,0,0])` on two instances, then their particle lists deep-equal. Given a `tag` marked dead, then its particles get the zero matrix.

### U3 — Grid A* and the lazy navmesh facade
- **Goal:** a dependency-free A* and a capability-gated recast loader.
- **Files:** Create `packages/sdk/src/nav/grid.ts`, `packages/sdk/src/nav/navmesh.ts`, `packages/sdk/src/nav/index.ts`; Modify `packages/sdk/src/index.ts` (+1 line), `packages/sdk/package.json` (optional peer); Test `packages/sdk/test/nav/{grid,navmesh}.test.ts`.
- **Approach:** `grid.ts`: binary min-heap keyed by `f`; `g` in integers (10 straight, 14 diagonal) to stay deterministic; heuristic Manhattan (4-way) or octile (8-way); `cutCorners: false` forbids diagonal moves past a blocked orthogonal neighbour; path reconstruction via a `Int32Array` parent map; cells `0` walkable, non-zero blocked; returns `null` when the open set empties. `navmesh.ts`: `class NavUnavailable extends Error`; `loadNavmesh(caps)`: `if (!caps.has('nav.navmesh')) throw new NavUnavailable('declare capability nav.navmesh and install recast-navigation (star-rule exception pending)')`; `const recast = await import('recast-navigation'); await recast.init()`; facade `build(positions: Float32Array, indices: Uint32Array, cfg?)` → `generateSoloNavMesh`, `findPath(a, b)` → `NavMeshQuery.computePath` mapped to `Vec3[]`. The dynamic import is the only reference to the package.
- **Interface sketch:** as in the ticket.
- **Tests:** Given the worked 10×10 grid, then a 27-cell path through `[5, 9]`. Given a fully walled target, then `null`. Given `diagonal: true` on an open 10×10, corner to corner, then 10 cells. Given `cutCorners: false` and a blocked orthogonal neighbour, then the path does not cut the corner. Given a seeded 200×200 grid with 30 % walls, then a result (or `null`) in under 50 ms (`performance.now` in the test only). `loadNavmesh(new Set())` rejects `NavUnavailable` and the mocked module factory ran zero times; with `'nav.navmesh'`, a two-triangle floor yields a two-point path.

### U4 — Seeded noise
- **Goal:** FastNoise Lite behind a seeded factory with the town's `fbm`/`ridge`.
- **Files:** Create `packages/sdk/src/proc/noise.ts`, `packages/sdk/src/proc/index.ts`; Modify `packages/sdk/src/index.ts` (+1 line), `packages/sdk/package.json` (dependency); Test `packages/sdk/test/proc/noise.test.ts`, goldens `packages/sdk/test/proc/goldens.json`.
- **Approach:** `import FastNoiseLite from 'fastnoise-lite'; const n = new FastNoiseLite(seed); n.SetNoiseType(FastNoiseLite.NoiseType[type]); n.SetFrequency(frequency); at2 = (x, y) => n.GetNoise(x, y); at3 = (x, y, z) => n.GetNoise(x, y, z)` (API names per the port's README; refresh at install). `fbm(n, x, y, { octaves = 5, lacunarity = 2.03, gain = .5 })`: `s += a * (0.5 + 0.5 * n.at2(x*f, y*f)); f *= lacunarity; a *= gain` (map `[-1,1]` to `[0,1]` like `vnoise`); `ridge`: `s += a * (1 - |n.at2(x*f, y*f)|) ** 2` with `a` starting `.55`, `f *= 2.1`, six octaves (`city.js:35`). Goldens generated once at implementation and committed with the `fastnoise-lite` version noted in the file.
- **Interface sketch:** as in the ticket.
- **Tests:** Given seed 7, `at2(1.5, 2.5)` equals the golden to 1e-9; `fbm` and `ridge` goldens likewise; seed 8 differs; `fbm` output stays within `[0, 1)` over 10,000 samples; `ridge` within `[0, 1.1)` (sum of the amplitude series).

### U5 — Area barrel lines and the no-random guard
- **Goal:** the three areas are exported and covered by the lint-equivalent grep.
- **Files:** Modify `packages/sdk/src/index.ts` (+3 lines total across U1/U3/U4), `packages/sdk/test/no-random.test.ts` (extend the globbed directories).
- **Tests:** Given the grep test, when any of `fx`, `nav`, `proc` contains `Math.random` or `Date.now`, then it fails (verified once by inserting and removing a line).

## 4. Verification

```sh
pnpm install
node packages/sdk/scripts/list-pixelfx.mjs --check
pnpm --filter @gm/sdk test
pnpm --filter @gm/sdk build && ls packages/sdk/dist
pnpm -r typecheck
pnpm lint
```

`## Local tests`: policy `full`; head SHA; base `main`; selection `@gm/sdk` (fx, nav, proc); counts (expect ≥ 22 tests), 0 skipped; the `fastnoise-lite` and `recast-navigation` versions pinned; the `dist` listing showing no eager recast chunk.

Conventions: pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest in Node (real `three` for matrix math, mocked `phaser`); no Playwright needed; no service; no secrets; dependencies: `fastnoise-lite` (the C++ FastNoise Lite project is far above 1k stars; the npm port is its official JS port, E04-11, no exception needed), `recast-navigation` optional (below 1k stars, exception recorded for Kevin, default not approved); pixelfx vendored (MIT, reviewed); PR first line `Closes #<issue>`.

## 5. Deferred to implementation

- Exact pixelfx render call sequence and whether it needs a 2D context in Node: default typed-array frames; add the `canvas` devDependency only if required.
- `EFFECTS` list generation vs runtime glob: default both (committed list for Node and tooling, `import.meta.glob` for the browser).
- A* tie-breaking order: default row-major neighbour order so paths are reproducible.
- Noise type default: `OpenSimplex2`; `Value` is available for a closer match to `city.js` terrain.
- Whether `Fx3d` accepts texture ids and an `AssetLoader` directly: default textures map now; an id-based constructor overload when OGM-063 fixes effect asset ids.

## 6. Scope boundaries

- No `gm fx` CLI, no effect cards or previews (the 2026-10-30 pixelfx plan, OGM-060/061).
- No edits to `third_party/pixelfx`; no update script.
- No scene or physics setup (OGM-023), no Phaser game setup (OGM-024), no audio (OGM-027), no asset packing (OGM-063).
- No Jolt, no Effekseer, no decision on the recast exception.

## 7. Risks

- **pixelfx needs a real canvas 2D context in Node** → `canvas` devDependency, Node-only; default typed arrays first.
- **Path alias to `third_party/` breaks the published `@gm/sdk` package** → bundle pixelfx into `dist/fx` (alias resolved at build); verified by the `dist` listing.
- **recast chunk eagerly bundled** → only a dynamic import references it; checked in `dist`.
- **`fastnoise-lite` API names differ from memory** → refresh at install; goldens are generated after the API is confirmed.
- **`three` in Node for `Fx3d` tests pulls WebGL** → import only `Object3D`, `Matrix4`, `Euler`, `Color`, `InstancedMesh`, `PlaneGeometry`, `ShaderMaterial` (none touch WebGL); `scene.add` mocked.
