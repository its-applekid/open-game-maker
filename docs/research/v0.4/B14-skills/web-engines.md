# Web-engine agent skills: evaluation for Open Game Maker 2000

Date: 2026-10-24. Target stack: TypeScript, Three.js r186 (+ Rapier, postprocessing), Phaser 4.2.

> **Version scope (2026-10-25):** V1 skills; gm-multiplayer-ready is V1 rules only, with gameplay in V2; see `docs/spec/release-plan.md`.

Evidence labels: **[V]** verified by reading files / running read-only checks on the clones; **[U]** unverified (inferred or from memory).

Clones (shallow, read-only, no scripts run) live under
`/tmp/claude-1000/-home-everdred-github-everdred-uncle-kevins-game-maker-2000/8570a016-3424-47d2-9901-c5e8a320401a/scratchpad/skills-src/`:
`cloudai-threejs`, `majid-threejs`, `phaser` (sparse: `skills/` + `src/`), `phaser-game-agent`, `pixijs`, `awesome-gamedev`, plus `three-r186` (sparse `src/` + `examples/jsm` at tag r186, used only as ground truth for API checks).

## API accuracy check method

I wrote a small read-only checker (it lives in `scratchpad/tools/`, outside the clones). It pulls every `new X(...)`, every `import {..} from 'three...'`, and every `.method(` name out of the skills' code blocks. Then it checks that each name exists somewhere in the real library source: three.js r186 for the three.js skills, Phaser master (4.2.1) for the Phaser skills.

| Skill set | Names checked | Missing from library source |
|---|---|---|
| CloudAI-X threejs-skills | 189 classes, 279 methods | **0** [V] |
| awesome-gamedev three.js (3 skills) | 22 classes, 47 methods | **0** [V] |
| majid threejs-game-skills | 50 classes, 153 methods | 0 three.js names. All misses are the skills' own scaffold classes, Playwright matchers, or Web Audio [V] |
| Phaser official (28 skills) | 650 methods | 12, all benign: Web Canvas/Audio APIs, placeholder user functions, and `setPipeline`/`BitmapMask`, which appear only as v3 examples in the migration skill [V] |
| awesome-gamedev Phaser (2 skills) | 51 methods | 0, apart from one user-defined callback [V] |

This check proves that names exist. It does not prove that signatures or semantics are correct. I also spot-checked several claims by hand against source: three's `Clock` is `@deprecated since r183`; `RenderPipeline` exists and `PostProcessing extends RenderPipeline`; Phaser `FilterList.addGlow(...)`, `Phaser.TintModes.FILL` and `MULTIPLY_TWO`, and `Camera#getPaddingWrapper` all exist [V].

---

## 1. CloudAI-X/threejs-skills

- **License:** MIT, single root LICENSE ("Copyright (c) 2026 CloudAI-X"). No per-folder licenses [V].
- **Stars:** 3,713. **Last push:** 2026-10-19 [V via gh api].
- **Important:** the commit log shows the whole set was rewritten for r186 on 2026-10-18/19, five days ago. Three skills (performance, R3F, asset-pipeline) were added that day. The stars were earned by the earlier version, so the current content is unproven in the wild [V].
- **Version pins:** "targets three.js r186 (`three@0.186`), React Three Fiber 9.8, drei 10.7, gltf-transform 4.5" (README). Every SKILL.md has a "WebGPU and TSL" section and a "Common Mistakes: old pattern → r186 fix" list [V]. **This matches r186.**
- **Format:** markdown only, with no scripts and no references/ directories. Every file has the same layout: Quick Start, topic sections, WebGPU/TSL, Common Mistakes, See Also [V].
- **Size:** 13 skills, 239–500 lines each (most are hard-capped at exactly 500), about 4–7k tokens each, about 78k tokens in total [V]. Lines are long and dense, but each skill loads on its own.

| Skill | One line |
|---|---|
| threejs-fundamentals | Scene, cameras, renderer, tone mapping, `setAnimationLoop`, transforms, disposal |
| threejs-geometry | Built-in shapes, BufferGeometry, merging, InstancedMesh, BatchedMesh, points, lines (Line2) |
| threejs-materials | Unlit/PBR/toon materials, blending, stencil, recompiles, node materials |
| threejs-lighting | Physical light units, shadow maps, HDR env, light probes, perf |
| threejs-textures | Color spaces, UV channels, canvas/HDR/KTX2 textures, render targets, memory |
| threejs-animation | AnimationMixer, skeletal, morph, blending, procedural motion |
| threejs-loaders | glTF + Draco/meshopt/KTX2, HDRLoader, progress, caching, cloning, disposal |
| threejs-shaders | ShaderMaterial/Raw, chunks, onBeforeCompile, TSL equivalents |
| threejs-postprocessing | EffectComposer pass chains (selective bloom, DoF, AO, outline), WebGPU `RenderPipeline` |
| threejs-interaction | Raycasting, OrbitControls etc., TransformControls, drag, box select |
| threejs-performance | renderer.info, draw-call reduction, LOD, fill rate, compile stalls |
| threejs-react-three-fiber | R3F 9 + drei (not needed for us unless we use React for 3D) |
| threejs-asset-pipeline | gltf-transform CLI: inspect, optimize, Draco/meshopt/KTX2/WebP |

- **Quality:** this is the best three.js API reference of the set. It is current, its names were all verified against r186, its examples are concrete, and it states the WebGL vs WebGPU split explicitly [V]. The only cost is bulk.
- **Gaps for our stack:** **no Rapier** (zero matches) and **no pmndrs `postprocessing` library**. "Postprocessing" here means three's own `EffectComposer` and `RenderPipeline` [V]. The examples are JS-flavoured snippets, not strict TS [V].
- **Risk:** none found. There are no scripts, no network calls, and no injection-like text [V].

## 2. majidmanzarpour/threejs-game-skills

- **License:** MIT, root LICENSE ("Copyright (c) 2026 Majid Manzarpour") [V].
- **Stars:** 2,580. **Last push:** 2026-09-28 ("Tune skills for Claude Opus 5.5, cut QA token cost, add music gen") [V].
- **Version pins:** the scaffold `package.json` pins `three ^0.184.0`, `@types/three ^0.184.1`, `vite ^8`, `typescript ^6`, `@playwright/test ^1.60`, `lil-gui`. `shader-cookbook.md` says "Targets three.js ^0.184" [V]. **Two releases behind r186, so re-verify the shader recipes.** The lockfile references `@dimforge/rapier3d-compat ~0.12.0`, but the scaffold `package.json` does not list it [V]. The Rapier reference uses the `rapier3d-compat` API [V]; whether 0.12 is current is [U].
- **Format:** these are workflow and opinion skills, not API references. The SKILL.md files are short (26–120 lines) and point to references (1,868 lines in total). The repo also carries Python/Node scripts, a full Vite+TS game scaffold, a Playwright canvas inspector, a bot-playtest template, and `agents/openai.yaml` files for Codex [V]. It is **strict TypeScript** throughout [V].

| Skill | One line | Lines (SKILL / refs) |
|---|---|---|
| threejs-game-director | Router/orchestrator: scope rules, phase→skill table, premium bar, evidence ownership | 85 / 122 |
| threejs-gameplay-systems | Scaffold + design brief, core-loop contract, level plan, build order; refs: game-feel (315, TS juice recipes), genre-design (48), physics-engine-selection (106, Rapier default) | 64 / 469 |
| threejs-aaa-graphics-builder | "Forms → materials → lighting → effects" pass, 10-category visual scorecard with anchor images, authoring recipes, technical-art budgets, shader cookbook | 45 / 595 |
| threejs-game-ui-designer | HUD/menu states, hierarchy, safe areas, touch, text-fit checks | 34 / 55 |
| threejs-qa-release | Build, console, non-blank canvas pixels, viewports, bot playtest, evidence manifest, release checks | 53 / 148 |
| threejs-debug-profiler | Triage order (multiple loops, DPR mismatch, delta units), profiling sequence, diagnostics global | 26 / 71 |
| threejs-3d-generator | Tripo API text/image-to-3D, rig, animate, GLB | 120 / 290 |
| threejs-image-generator | Gemini image API (`gemini-3-pro-image-preview`) for concepts, textures, icons | 79 / 0 |
| threejs-audio-generator | ElevenLabs SFX/music/ambience/voice + Web Audio manager pattern | 79 / 118 |

- **Quality:** strong on *process*: design-first contracts, playable increments, seeded RNG plus test hooks, evidence-based QA, and scope discipline ("small arcade game is not a request for the premium pipeline") [V]. `game-feel.md` is good copy-paste TS: trauma screenshake, hitstop, squash/stretch, FOV punch, a tuning table [V]. The API surface is thin, so it has to sit alongside CloudAI.
- **Risks [V]:**
  - `threejs-game-director/scripts/probe_asset_credentials.sh` runs `zsh -lc` / `bash -lc`. That **sources the user's `~/.zprofile`/`~/.zshrc`** (arbitrary user code) to detect `TRIPO_API_KEY`, `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`. It prints only SET/MISSING, but it should not be run inside our executor.
  - The generator scripts call **paid APIs**: `api.tripo3d.ai/v2/openapi`, `api.elevenlabs.io/v1`, and Google GenAI. The skills tell the agent to use generated assets for "premium hero surfaces" whenever keys exist, which means spending money without asking.
  - The director contains **strong autonomy directives**: "don't end a turn with a summary… take the next step instead"; "read all five production skills before implementing" for complete games, plus delegation instructions (lead plus two workers). These are not malicious, but they would override our orchestrator's turn and approval policy and cost about 20k+ tokens up front.
  - I found no telemetry and no hidden instructions.

## 3. Phaser official skills: `phaserjs/phaser` → `skills/` (exists, in-tree)

- **Location:** `https://github.com/phaserjs/phaser/tree/master/skills`. These are inside the main engine repo, not a separate repo [V]. Phaser's version on master is `4.2.1` [V].
- **License:** MIT, covered by the repo-root `LICENSE.md` ("Copyright (c) 2026 Richard Davey, Phaser Studio Inc."). The skills folder has no separate license [V].
- **Stars:** 40,556 (engine repo). **Last push:** 2026-08-21. The latest commit touching `skills/` is 2026-06-03 ("Add secondary tint color and tint mode MULTIPLY_TWO"). The skills are edited **in the same commits as engine features**, which is the best possible maintenance signal [V].
- **Version:** everything is written for Phaser 4. There are dedicated `v3-to-v4-migration` and `v4-new-features` skills. Pages are not pinned to "4.2" explicitly, but they track master [V].
- **Format:** markdown only. Layout per skill: Quick Start, Core Concepts, Common Patterns, Configuration/API Quick Reference, Gotchas, "Source File Map" (paths into `src/`). Code is **all JS** (401 js blocks, 0 ts blocks) [V].
- **Size:** 28 skills, 343–500 lines each (about 3–5k tokens), 12,579 lines in total, plus 1,048 reference lines [V].

| Skill | One line |
|---|---|
| game-setup-and-config | GameConfig, renderer choice, canvas, pixelArt, FPS, boot |
| scenes | Lifecycle, transitions, parallel scenes, sleep/pause, communication |
| loading-assets | Loader, images/atlases/audio/JSON/tilemaps/fonts, progress |
| sprites-and-images | Factories, frames, transform, tint, flip, origin, depth |
| animations | Spritesheet/atlas anims, AnimationState, chains, callbacks |
| game-object-components | Transform/Alpha/Tint/Depth/Mask/Lighting mixins |
| groups-and-containers | Pooling, batch ops, nested transforms |
| graphics-and-shapes | Graphics object, primitives, gradients |
| text-and-bitmaptext | Text, BitmapText, web fonts, wrapping |
| input-keyboard-mouse-touch | Keys, pointers, drag/drop, hit areas (+372-line ref) |
| physics-arcade | Bodies, velocity, collide/overlap, groups, static |
| physics-matter | Matter bodies, constraints, sensors, filtering |
| tilemaps | Tiled JSON, layers, tile collision, dynamic tiles |
| cameras | Follow, bounds, effects (shake/fade/flash/pan/zoom), multi-camera |
| particles | Emitters, zones, gravity wells |
| filters-and-postfx | v4 Filters (internal/external), bloom/blur/glow, custom shaders |
| render-textures | RenderTexture/DynamicTexture, snapshots, stamps |
| tweens | Tweens, chains, easing, stagger, number tweens |
| time-and-timers | TimerEvent, delayedCall, Clock, time scale |
| events-system | EventEmitter, scene/game events |
| data-manager | setData/getData, registry, change events |
| scale-and-responsive | ScaleManager modes, autoCenter, fullscreen, orientation |
| audio-and-sound | SoundManager, music, volume, spatial, Web Audio |
| curves-and-paths | Splines, beziers, PathFollower |
| geometry-and-math | Vectors, shapes, RNG, angles, interpolation |
| actions-and-utilities | Align, GridAlign, batch actions |
| v3-to-v4-migration | Renderer, FX→Filters, removed APIs |
| v4-new-features | Filters, RenderNodes, CaptureFrame, Gradient, etc. |

- **Quality:** authoritative, and API names were cross-checked against engine source with no real misses [V]. It is a reference, not a game workflow, and it has no router/index skill (unlike PixiJS).
- **Risk:** none. Markdown only [V].

**Distinct, and not to be confused with:** `phaserjs/phaser-game-agent` (MIT, 8 stars, 2026-07-01). This is a 43-line SKILL.md plus an `npx @phaserjs/game-agent` installer that wires your CLI to a **paid Phaser cloud MCP** (`mcp.phaser.io`), with "credits" and "stops billing" wording [V]. **Exclude it.** It is a hosted service, not reusable skill content.

## 4. pixijs/pixijs-skills (quality reference only)

- MIT ("Copyright (c) 2026 PixiJS"), 358 stars, pushed 2026-10-01 [V]. Targets PixiJS v8 [V].
- 26 skills: 7,366 SKILL lines plus 7,058 reference lines. They are packaged as Claude and Cursor plugins (`.claude-plugin/`, `.cursor-plugin/`) [V].
- **Patterns worth copying:**
  - A **root router skill** (`pixijs`, 66 lines) with tables of "Load when…" rows per sub-skill.
  - A canonical-docs fallback (`WebFetch https://pixijs.download/release/docs/llms.txt`) for anything not covered.
  - Small SKILL.md files with large topic `references/` loaded on demand.
  - `license:` in the frontmatter.
  - Consistent Quick Start / Variants / When-to-use-what / Common Mistakes / API Reference sections [V].
- These are the template to follow for our own `gm-*` packaging.

## 5. gamedev-skills/awesome-gamedev-agent-skills (web-engines only)

- **License:** Apache-2.0 (root LICENSE plus NOTICE). NOTICE says all skills are original works authored from primary docs, with nothing copied from other skill collections [V]. If we fork, we must carry the NOTICE and change notes.
- **Stars:** 4,010. **Last push:** 2026-10-24 (today) [V].
- **Web-engine skills:** 6 in total, 4 relevant to us. Each is 178–225 lines plus a reference of about 115–167 lines, roughly 2k + 1k tokens [V]. They are the most concise of all the sets.

| Skill | One line | Pins |
|---|---|---|
| phaser-core | Game config, Scene lifecycle, loader, cameras, registry/events, transitions. The Pitfalls list includes v3→v4 renames (`preFX/postFX`→filters, `setTintFill`→`setTintMode(FILL)`, `Math.TAU`, `roundPixels` default, `Geom.Point` gone) | "Targets **Phaser 4.2**", detect installed major first [V] |
| phaser-arcade-physics | Bodies, top-down & platformer controllers, collider vs overlap, pooling, tunneling, category masks | Phaser 4.2 [V] |
| threejs-scene-setup | Import map, trio, `setAnimationLoop`, `Timer` (Clock deprecated r183), resize, OrbitControls, WebGPU opt-in | "Patterns target **r186**", `three@0.186.1` CDN [V] |
| threejs-materials-lighting | PBR, lights, shadows, HDRLoader env | r186 [V] |
| threejs-gltf-loading | GLTFLoader, Draco/KTX2, AnimationMixer | r186 [V] |
| pixijs-rendering | (not needed) | — |

- **Quality:** accurate (all names verified, see the table above), with a clear When/When-not section, a workflow, patterns and pitfalls, and explicit "run and observe" steps [V]. Code is JS, not TS [V]. It has no Rapier and no postprocessing content [V].
- **Risk:** none in `web-engines/`, which is markdown only [V]. The repo-level `scripts/` was not reviewed. It is outside this scope.

---

## Mapping onto the planned gm-* skills

There are two layers:

- **Engine reference layer:** vendored third-party skills, loaded on demand.
- **gm-* workflow layer:** ours, short, and pointing down into the reference layer.

### Engine reference layer: adopt mostly as-is

| Source | Action | Why |
|---|---|---|
| **Phaser official `skills/` (28)** | **Adopt as-is** (vendor at a pinned Phaser commit; maybe drop curves/actions). Add our own small router like PixiJS's. Optionally add a TS note. | Official, MIT, edited with engine commits, names verified against source [V]. JS snippets work in TS with types [U]. |
| **CloudAI-X threejs-skills (13)** | **Adopt as-is, minus R3F** (we don't use React for 3D) and maybe minus asset-pipeline (needs the gltf-transform CLI). Pin to the 2026-10-19 commit and re-review after it beds in. | r186-current, WebGPU/TSL aware, 0 unknown API names [V]. It is a 5-day-old rewrite, so pin it and watch [V]. |
| awesome-gamedev `phaser-core` + `threejs-scene-setup` | **Adapt (fork + trim) as the compact "first load"** for gm-core's engine bootstrap, or skip if we vendor the two above. Apache-2.0 means keeping NOTICE. | Smallest token cost (about 3k), explicit 4.2/r186 pins, good v3→v4 pitfalls list [V]. It overlaps heavily with the official and CloudAI sets. |
| **Gap: Rapier, pmndrs postprocessing** | **Write our own** short references (majid's `physics-engine-selection.md` Rapier section is a starting point; check the Rapier version [U]). | No evaluated repo covers pmndrs `postprocessing`. Only majid covers Rapier [V]. |

### gm-* workflow layer

| gm skill | Recommendation | Source material |
|---|---|---|
| **gm-core** | Write our own. **Borrow ideas** from majid director "Scope" + gameplay-systems "Design first / Build" (core-loop contract, playable increments, ownership folders `core/game/entities/systems/ui/tests`, seeded RNG) [V]. Route to Phaser official / CloudAI for APIs. | majid (MIT) |
| **gm-assets** | Our own. Borrow majid `asset-recovery.md` failure classification and the "procedural for repeats, generated for heroes" split. API facts from CloudAI `threejs-loaders`/`asset-pipeline` and Phaser `loading-assets`. **Do not adopt** the Tripo/Gemini generator scripts (paid APIs; our executor owns providers) [V]. | majid, CloudAI, Phaser |
| **gm-kitbash-3d** | **Adapt** majid `aaa-graphics-builder` → `authoring-recipes.md` + `technical-art.md` (render budgets, instancing/LOD). Drop the "AAA scorecard" framing. CloudAI `threejs-geometry` for merge/instancing APIs. | majid, CloudAI |
| **gm-props-procedural** | Same as kitbash. Majid's procedural model factories / prop kit recipes plus CloudAI geometry/textures. | majid, CloudAI |
| **gm-sprites-2d** | Phaser `sprites-and-images` + `animations` + `render-textures` as-is underneath. Our own skill for sprite sourcing and atlas conventions. | Phaser |
| **gm-vfx** | 2D: Phaser `particles` + `filters-and-postfx` as-is. 3D: CloudAI `postprocessing`/`shaders`. **Adapt** majid `shader-cookbook.md` (written for ^0.184, so re-verify on r186) and `game-feel.md` (TS juice recipes: screenshake, hitstop, impact flash) [V]. | Phaser, CloudAI, majid |
| **gm-audio** | Phaser `audio-and-sound` for 2D. **Borrow** majid `audio-workflows.md` "audio matrix from actual game events" plus the Web Audio manager shape (gesture unlock, volume groups, pause cleanup). Skip the ElevenLabs script [V]. | Phaser, majid |
| **gm-music-compose** | Nothing adoptable. Majid only wraps ElevenLabs music generation (ideas only: intensity layers, stingers) [V]. | — |
| **gm-dialogue-narration** | Nothing adoptable in scope. Majid's audio skill lists announcer/voice lines only as a generation category [V]. | — |
| **gm-genre-platformer / topdown** | **Adapt** awesome-gamedev `phaser-arcade-physics` (it already has top-down and platformer controller patterns plus tunneling pitfalls) [V], plus Phaser `physics-arcade`/`tilemaps`/`cameras`. Borrow majid `genre-design.md` (48 lines) for level pacing [V]. | awesome-gamedev, Phaser, majid |
| **gm-genre-racer** | Borrow majid `physics-engine-selection.md` (vehicles, CCD, sensors with Rapier) + `genre-design.md` track notes. Otherwise write our own. | majid |
| **gm-genre-rpg / puzzle** | Nothing web-specific here. awesome-gamedev has genre skills outside `web-engines/` (not evaluated in this report). Phaser `tilemaps`/`data-manager` for plumbing. | — |
| **gm-ui-hud** | **Adapt** majid `game-ui-designer` + `ui-patterns.md` (state inventory, hierarchy, safe areas, text-fit checks; 89 lines in total) [V]. Phaser `text-and-bitmaptext` + `scale-and-responsive` for APIs. | majid, Phaser |
| **gm-input** | Phaser `input-keyboard-mouse-touch` as-is. CloudAI `threejs-interaction` for picking. Borrow majid's "input intents" layer (scaffold `InputController.ts`, touch controls must emit intents) [V]. | Phaser, CloudAI, majid |
| **gm-saves-achievements** | Nothing adoptable beyond Phaser `data-manager` (registry). Write our own. | Phaser |
| **gm-editor-tuning** | Borrow majid's `lil-gui` "live-tuned constants" + `DebugTools.ts` idea, plus the game-feel tuning table [V]. | majid |
| **gm-verify** | **Adapt (strongest borrow).** Majid `qa-release`: non-blank and varied canvas pixel check, console/page/network error capture, declared viewport×state evidence manifest with a run ID, deterministic test hooks (`__THREE_GAME_TEST_HOOKS__`), bot-playtest template, motion captures [V]. Generalize the Playwright inspector to Phaser canvases. Rewrite it ourselves rather than run their script. | majid |
| **gm-repair** | **Adapt** majid `debug-profiler` + `debug-playbook.md` (triage order) [V]. Add CloudAI's "Common Mistakes" lists and the Phaser `v3-to-v4-migration` skill as the canonical "model wrote Phaser 3 / old three" fixer [V]. | majid, CloudAI, Phaser |
| **gm-multiplayer-ready** | Nothing found. Majid's deterministic update order plus seeded RNG are useful prerequisites [V]. | — |
| **gm-scope-options** | **Borrow** majid director "Scope" paragraph (user words set the bar; narrow edit stays narrow; ask only when a choice materially changes the result) [V]. | majid |

### Packaging lessons

- Follow PixiJS's shape: one router skill, small SKILL.md files, on-demand `references/`, and `license:` in the frontmatter [V].
- Majid's director is the counter-example. Its "read all five skills first" rule is token-heavy [V].
- Pin vendored sets by commit SHA. CloudAI was just rewritten, and the Phaser skills move with engine master.

### Excluded or quarantined

- `phaserjs/phaser-game-agent`: a paid cloud MCP plus `npx` installer [V].
- majid `probe_asset_credentials.sh` (sources the user's shell profiles) and all three generator scripts (paid Tripo/Gemini/ElevenLabs calls) [V].
- majid director's turn-ending and delegation directives, if majid content is vendored [V].
