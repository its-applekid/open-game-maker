# OGM-025 plan — Camera rigs and input merge

## 1. Problem frame

The creation flow records a point of view; the engine must make it real. C2 §4 fixes seven rigs, each carrying its own input meaning and occlusion rule, with the editor's camera kept separate. The prototype proved one rig (iso with cutaway and follow lerp) in r170 JavaScript. Input arrives from three places (host frames over the bridge, the game's own keyboard and pointer, canvas touches) and must become exactly one `ActionFrame` per player per fixed tick so the simulation stays deterministic and `inject()` can replay it.

Requirements trace:
- R43 → seven `CameraRig`s with input mappings and occlusion; one instance per local player; editor camera plus "view as player".
- R44 → the SDK merges host frames and in-iframe keys into one `ActionFrame` per player (the host side of R44 is OGM-028).
- D-HOOKS → `inject(frame)` feeds the same merge queue so hooks and real input are indistinguishable to the sim.

## 2. Patterns to follow

- `prototypes/ui-v0/site/js/dungeon.js:149-161`: `fitCamera` / `applyCamera` (ortho extents from zoom and aspect, position = target + ISO·30, `lookAt` down the ISO vector). Port into `camera/three/iso.ts`.
- `dungeon.js:192-193`: cutaway walls scaled to 0.28 with shadows off; generalise to tagged occluders in `camera/occlusion.ts`.
- `dungeon.js:841`, `:595`: follow lerp `min(1, dt*5)` and play zoom `min(fitZoom, 2.5)`.
- `dungeon.js:425, 471, 476`: right-button pan and wheel zoom clamp for `camera/editor.ts`.
- `dungeon.js:611-614`, `:646-655`: key set with preventDefault list; ground-plane mouse aim. Port into `input/keyboard.ts`, `input/pointer.ts`.
- `docs/research/v0.5/C2-v1-scope-additions.md` §4: the rig table (fits and requires) as the doc comment of each rig.
- `docs/research/v0.4/B7-editor-sdk-input.md` §5.3 and §9: raw keys forwarded in play mode; frames carry `playerIndex`; camera is presence.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; test servers bind `127.0.0.1`; secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Rig factory, RigSet, mapping defaults

Goal: `createRig(view, dimension, deps)` returns a `CameraRig`; `RigSet` holds one per local player.

Files:
- Create: `packages/sdk/src/camera/index.ts`, `camera/rig-set.ts`, `camera/mappings.ts`, `camera/rig-set.test.ts`.

Approach: `createRig(view, dimension, deps)` where `deps` is `{ three?: { scene, renderer, viewport() }, phaser?: { scene } }` supplied by the mount (OGM-023/024). `mappings.ts` exports the default `inputMapping` per view: keyboard `{ KeyW: 'move.up', … , Space: 'jump'|'attack', KeyE: 'use', Escape: 'host.pause' }` merged with `manifest.inputs.keyboard` overrides; `touch` per view (`iso`/`topdown`/`side`/`fixed`: `stick`; `follow`/`fps`/`orbit`: `two-stick`); gamepad names; `pointerLock: view === 'fps'`. `RigSet`: `Map<playerIndex, CameraRig>`; `for(index)` creates lazily; `update(dt, frames)` routes each frame to its player's rig; `active` is the rig rendered (local player's, or the editor camera in edit mode); `viewAsPlayer(index)` switches `active` without touching rigs. `reduceMotion` flag from settings snaps lerps.

Interface sketch:
```ts
export function createRig(view: ViewId, dimension: '2d' | '3d', deps: RigDeps, opts?: { manifestInputs?: ManifestInputs; reduceMotion?: boolean }): CameraRig;
export class RigSet { for(playerIndex: number): CameraRig; update(dt: number, frames: ActionFrame[]): void; active: CameraRig | EditorCamera; viewAsPlayer(i: number | null): void }
```

Test scenarios:
- Given `createRig('fps','3d')` when inspected then `inputMapping.pointerLock` is true and `touch` is `two-stick`; `iso` gives false and `stick`.
- Given frames for players 0 and 1 when `update` runs then each rig's `update` was called once with its own frame.
- Given `viewAsPlayer(1)` when set then `active` is player 1's rig; `viewAsPlayer(null)` in edit mode restores the editor camera.

### U2. Three rigs and occlusion

Goal: seven 3D rigs as pure updates; three occlusion strategies.

Files:
- Create: `camera/three/{iso,topdown,side,follow,fps,orbit,fixed}.ts`, `camera/occlusion.ts`, `camera/three/*.test.ts`, `camera/occlusion.test.ts`.

Approach: every rig keeps `camera` (Orthographic for `iso`, `topdown`, `side`, `fixed`; Perspective for `follow`, `fps`, `orbit`), `target`, `playerIndex`; `update(dt, frame)` is deterministic. `iso`: ISO vector `(1, 1.1, 1).normalize()`, extents from `zoom` and aspect (`applyCamera`), target lerp `min(1, dt*5)` (snap when `reduceMotion`), play zoom tighter than edit; `move` vector rotated by the camera yaw so "up" is away from the camera. `topdown`: ortho straight down, yaw 0, move in world axes. `side`: ortho locked to the XY plane at z-distance, follow x only with a dead band. `follow`: perspective behind the target (distance 6, height 2.5), yaw from `look.x`, pitch clamped, lerp; occlusion `fade` by default or `collide` by option. `fps`: camera at target + eye height, yaw/pitch from `look` (pointer-lock deltas on desktop, right stick / touch look otherwise), `move` relative to yaw. `orbit`: spherical around target, `look` orbits, `zoom` axis, pan with a modifier. `fixed`: a declared pose. `occlusion.ts`: `cutaway(scene, camera, target)` — for each object with `userData.occluder`, test whether its XZ position lies in the band between target and camera projected along the ISO vector (distance along ISO greater than the target's, within the frustum slice around the target), lerp `scale.y` to 0.28 and `castShadow=false`, restore otherwise; `fade(scene, camera, target)` — `Raycaster` from target to camera, set `material.transparent=true; opacity=0.25` on hits, restore previous; `collide` — shorten the camera distance to `hit.distance - 0.2`. `worldToScreen(p)`: `p.project(camera)` to `{x, y}` in 0..1 or `null` when behind.

Interface sketch:
```ts
export function isoRig(deps: ThreeDeps, o: { zoomEdit: number; zoomPlay: number; reduceMotion: boolean }): CameraRig;  // one factory per view
export function applyOcclusion(kind: 'none'|'cutaway'|'fade'|'collide', scene: Scene, camera: Camera, target: Vector3, dt: number): void;
```

Test scenarios (three in Node, no renderer):
- Given target (5,0,5) and `dt` 1 when `iso.update` runs then the camera sits at target + ISO·30 and looks down ISO (snapshot of position and quaternion).
- Given the fixture room when `cutaway` runs with the target in the north-west room then only the walls south and east of it (between target and the `+x,+z` camera) are scaled to 0.28; moving the target restores them.
- Given a box between target and camera when `fade` runs then its material opacity is 0.25 and other materials are untouched; next frame with no hit restores 1.
- Given `follow` with `look {x: .5}` for 1 s when updated then yaw increased by the configured rate; with `reduceMotion` the position snaps in one update.
- Given `worldToScreen` of a point behind the camera when called then `null`.

### U3. Phaser presets

Goal: 2D rigs as Phaser camera configuration implementing `CameraRig`.

Files:
- Create: `camera/phaser/{iso,topdown,side,fixed}.ts`, `camera/phaser/presets.test.ts`.

Approach: each preset wraps `scene.cameras.main`: `topdown` and `iso` → `startFollow(target, true, 0.1, 0.1)` with `setBounds` from the manifest's world size and `setZoom` from the tier (`low` zoom 1, others DPR-aware); `side` → follow with `setDeadzone(w*0.3, h*0.6)` and a bottom bound; `fixed` → `setZoom`, no follow, `centerOn`. `update(dt, frame)` only applies `look`/`zoom` actions where the view allows (`orbit` has no 2D form). `worldToScreen(p)` through `camera.getWorldPoint` inverse (`worldView` and `zoom`). `attach` keeps a target adapter `{ x, y }` from `position()`.

Test scenarios (Phaser camera stubbed):
- Given `side` when attached then `startFollow`, `setDeadzone` and `setBounds` were called with the preset values.
- Given `fixed` when attached then `startFollow` was not called and `centerOn` was.

### U4. InputMerger

Goal: one `ActionFrame` per player per tick from all sources; `inject` and raw-key forwarding.

Files:
- Create: `packages/sdk/src/input/{index,merger,keyboard,pointer,touch,mapping}.ts`, `input/*.test.ts`.

Approach: `new InputMerger({ localPlayerIndex, mapping, canvas, bridge, hotkeys })`. Sources push partial frames into `pending: Map<playerIndex, Map<source, Record<action, value>>>`: `bridge.on('input.frame')` keeps the host's `playerIndex` (drop if ≥ `maxLocalPlayers`, count); `keyboard.ts` listens on the canvas (`tabindex=0`) with the preventDefault list from `dungeon.js:613`, translates `code` through `mapping.keyboard` to actions (`move.*` pairs fold into one `{x,y}` vector), and sends `input.rawKey` for codes in `hotkeys` (Escape and `manifest.inputs.hostHotkeys`) without mapping them; `pointer.ts` handles `look` deltas (`movementX/Y` under pointer lock, else drag) and ground-plane aim (`Raycaster` against `y=0`); `touch.ts` handles canvas taps and drags outside the overlay (`tap`, `aim`); `inject(frame)` pushes into pending for its `playerIndex` with `source` kept. `sample(tick)`: for each player, merge sources in the order `network < touch < keyboard < pointer < gamepad` (later overrides earlier per action key), stamp `tick`, return one frame per player (an empty actions map when idle); held values persist until a source clears them. `inject`ed frames are consumed on the next `sample` only.

Interface sketch:
```ts
export class InputMerger {
  constructor(o: { localPlayerIndex: number; maxLocalPlayers?: number; mapping: InputMapping; canvas: HTMLCanvasElement; bridge: GameBridge; hotkeys?: string[] });
  sample(tick: number): ActionFrame[]; inject(frame: ActionFrame): void; setPointerLock(on: boolean): void; dropped: number; dispose(): void }
```

Test scenarios (jsdom):
- Given a host gamepad frame `{jump:true}` and a keyboard `KeyW` down for player 0 when sampled at tick 7 then one frame `{playerIndex:0, tick:7, actions:{jump:true, move:{x:0,y:1}}}`.
- Given gamepad `move {x:.5,y:0}` and keyboard `KeyA` when sampled then `move` is the gamepad's (tie goes to gamepad).
- Given a host frame for `playerIndex 1` when sampled then a second frame exists with index 1 and player 0's is unchanged.
- Given `inject({playerIndex:0, actions:{use:true}})` when sampled twice then `use` is present on the first and absent on the second.
- Given `Escape` keydown when pressed then `input.rawKey {code:'Escape', down:true}` was sent and no action changed.
- Given a host frame with `playerIndex 9` when received then `dropped` is 1 and `sample` has no frame for 9.
- Given `pointerLock` on when `mousemove` with `movementX 10` fires then `look.x` is 10·sensitivity.

Execution note: test-first on `sample` ordering; it defines determinism for every game.

### U5. Editor camera and view-as-player

Goal: an edit-time camera independent of the play rig.

Files:
- Create: `camera/editor.ts`, `camera/editor.test.ts`.

Approach: `EditorCamera(deps, { view: 'iso' | 'topdown' })` with the dungeon pan/zoom: right or middle button drag pans along camera right/forward (`dungeon.js:476`), wheel zooms clamped to `[fit*.35, fit*1.4]` (`:471`), two-finger touch pans and pinch-zooms; `fit(bounds)` recentres (`fitCamera`). Never serialized. `RigSet.viewAsPlayer(i)` renders player i's rig while the editor stays mounted; `viewAsPlayer(null)` returns.

Test scenarios:
- Given a wheel delta when applied then zoom changes by 10 % and stays within the clamp.
- Given a right-drag of (40, 0) px when applied then the target moved along the camera's right vector by `40·k`.

### U6. Wiring and browser spec

Goal: the templates use the rigs and merger; the fixture proves all seven views on GPU.

Files:
- Modify (one line each, if no option hook exists): the mount in `packages/sdk/src/three/` and `packages/sdk/src/phaser/` to construct `RigSet` + `InputMerger` and call `merger.sample(tick)` inside the fixed step and `rigs.update(dt, frames)` before render.
- Create: `camera/fixture/index.html`, `camera/fixture/main.ts` (a 12×8 walled room with `userData.occluder` walls, a player box, `?view=` switch, GmTestHooks from OGM-022), `camera/browser.spec.ts`.

Approach: the spec launches Chromium with the GPU flags (SwiftShader when `GM_VERIFY_SOFTWARE_GL=1`), serves the fixture on `127.0.0.1`, and for each view: waits `ready`, `inject`s a `move` frame, `advanceTime(500)`, asserts `renderInfo().calls > 0`, `hitTest` at the player's `worldToScreen` is true, and `renderAt(1000)` twice yields byte-equal `renderGameToText()`; for `iso` also asserts the cutaway: a wall between camera and player reports `scale.y ≈ 0.28` through a fixture-exposed probe.

Test scenarios:
- Given each of seven views when booted then the three assertions above hold.
- Given `iso` when the player stands by the south wall then that wall is cut and the north wall is not.

## 4. Verification

```
pnpm --filter @gm/sdk test -- camera input
pnpm --filter @gm/sdk test:browser -- camera
pnpm --filter @gm/sdk typecheck && pnpm -r lint
```
Paste the Vitest summary (rig snapshots, occlusion, merger), the Playwright summary listing the seven views with the renderer string, and one line showing the merger order test failing with the priority reversed.

## 5. Deferred to implementation

- ISO vector and distances: default `(1, 1.1, 1)` and 30 (dungeon.js); follow distance 6, height 2.5; fps eye height 1.6.
- Look sensitivity: default 0.002 rad/px for pointer lock, 2.5 rad/s full-stick.
- Cutaway band width: default one tile (1 world unit) either side of the target line.
- Whether `side` locks z or x: default locks z (XY plane).
- `maxLocalPlayers`: default 4 (A5 room size); OGM-054 may raise it.

## 6. Scope boundaries

- Host gamepad reading and overlay: OGM-028.
- Clock, hooks, RNG: OGM-022. Renderer, physics, scaffold: OGM-023. Phaser scale/lifecycle: OGM-024.
- Network frames and remote player binding: OGM-054. HUD: OGM-054.
- Camera preference UI: OGM-075. Lockfile `pov`: OGM-062.

## 7. Risks

- OGM-023/024 mount shape unknown until merged: default adapt the single wiring line; everything else is self-contained.
- Pointer lock on iPadOS in a sandboxed iframe (E04-12): default desktop-only `pointerLock`, drag-look elsewhere.
- Cutaway over arbitrary geometry (not tiles): default tag-based (`userData.occluder`) set by templates and the platformer skill; untagged scenes get no cutaway rather than wrong cuts.
- Determinism of rigs under `renderAt`: default rigs hold no hidden time (no `performance.now`), lerps use the passed `dt`; the byte-equal spec guards it.
