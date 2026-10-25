# Agent skills for the gap areas: report

Date: 2026-10-24. Scope: skills outside the repos other researchers already cover (CloudAI-X, majidmanzarpour, Phaser official, pixijs, gamedev-skills/awesome-gamedev-agent-skills, godogen, openai/skills, anthropics/skills).

Evidence labels: **[V]** means I read the actual file from a shallow clone or via `gh api contents`. **[U]** means the information comes only from a search result or a directory listing.

The star, license and push data all came from `gh api repos/...` on 2026-10-24.

Clones (untrusted data; no scripts were run): `/tmp/claude-1000/-home-everdred-github-everdred-uncle-kevins-game-maker-2000/8570a016-3424-47d2-9901-c5e8a320401a/scratchpad/skills-src/gaps/`

Current versions checked with `npm view`: tone 15.1.22, @dimforge/rapier3d-compat 0.21.0, @gltf-transform/cli 4.5.1, zzfx 1.4.0, colyseus 0.18.10.

Note: `dimforge/rapier.js` is **archived**. The JS bindings moved to `dimforge/rapier/typescript` (5,909 stars, Apache-2.0). Any skill should point there.

---

## Summary table (best first)

| # | Candidate | Stars | License | Last push | Feeds | Verdict |
|---|---|---|---|---|---|---|
| 1 | openai/plugins: `plugins/game-studio` | 7,571 | MIT (in plugin.json; no repo LICENSE) | 2026-10-08 | gm-verify, gm-ui-hud, gm-input, gm-pack-import, gm-genre-* | **Adopt patterns.** Best fit for our stack. |
| 2 | dgreenheck/webgpu-claude-skill | 1,258 | **none** | 2026-04-10 | gm-vfx | **Reference** (no license, so we cannot copy it). Accurate through r183. |
| 3 | ahujasid/blender-mcp (now `mcp-for-blender`) | 32,266 | MIT | 2026-10-24 | gm-pack-import, gm-kitbash-3d | **Optional dev tool**, not the pipeline core. |
| 4 | TerminalSkills/skills: `blender-scripting` | 179 | Apache-2.0 | 2026-10-24 | gm-pack-import, gm-props-procedural | Sub-1k but accurate for Blender 5.x. **Fork the bits we need.** |
| 5 | EnzeD/r3f-skills: `r3f-physics`, `r3f-postprocessing` | 130 | **none** | 2026-08-31 | gm-genre-* (physics), gm-vfx | Sub-1k but excellent Rapier pitfall list. Reference only. |
| 6 | PlayableIntelligence/game-creator | 346 | none at repo level (frontmatter says MIT) | 2026-05-25 | gm-audio, gm-multiplayer-ready, gm-verify, gm-vfx | Sub-1k. Mine ideas from it, do not adopt. |
| 7 | Donchitos/Claude-Code-Game-Studios | 27,443 | MIT | 2026-10-19 | gm-verify (playtest), accessibility, gm-ui-hud | Mine the checklists. The framework itself is too heavy and engine-specific. |
| 8 | dannyjpwilliams/ui-sound-design-skill | 43 | MIT | 2026-04-08 | gm-audio | Sub-1k. Its "vocabulary bridge" idea is worth stealing for voice-driven SFX. |
| 9 | MiniMax-AI/skills: `shader-dev` | 13,728 | MIT | 2026-04-18 | gm-vfx | ShaderToy-style GLSL library. Optional reference. |
| 10 | github/awesome-copilot: `game-engine` | 40,375 | MIT | 2026-10-23 | gm-input | Has a gamepad/touch reference, but its Phaser code is outdated (Phaser 2/CE era). |
| 11 | rawwerks/VibeCAD: `gltf-transform` | 123 | MIT | 2025-12-17 | gm-pack-import | Thin. Easy to write a better one ourselves. |
| 12 | plyght/tonejs-skill, Bbeierle12/Skill-MCP-Claude | 4 / 8 | none / MIT | 2026-01 / 2026-10 | gm-music-compose | **Reject.** They use deprecated `Tone.Transport` and give a wrong version. |
| 13 | sickn33/agentic-awesome-skills, vudovn/ag-kit, davila7 templates: `game-development/*` | 48k / 8.2k / 32.9k | MIT | recent | gm-multiplayer-ready (concepts) | Generic decision tables. Low value. |
| 14 | a5c-ai/babysitter: `game-development/skills/*` (138 skills) | 1,868 | MIT | 2026-09-16 | — | **Reject.** The skills are empty stubs. |

---

## Candidate details

### 1. openai/plugins: `plugins/game-studio` [V]
- **Repo:** github.com/openai/plugins. This is a separate repo from openai/skills. 7,571 stars. The repo has no LICENSE file, but `.codex-plugin/plugin.json` declares `"license": "MIT"` with author OpenAI. Version 0.1.2. Last commit 2026-10-08.
- **Contents:** 9 short skills (76–124 lines each), 16 short reference files and 3 Python sprite scripts (not read or run).
  - Skills: `web-game-foundations`, `game-playtest`, `game-ui-frontend`, `web-3d-asset-pipeline`, `three-webgl-game`, `react-three-fiber-game`, `phaser-2d-game`, `sprite-pipeline`, `game-studio` (router).
  - Reference files include `rapier-integration-starter.md`, `three-hud-layout-patterns.md`, `playtest-checklist.md` and `webgl-debugging-and-performance.md`.
- **Quality:** Concise and opinionated, and it matches our stack: TS + Vite, three, Rapier, GLB, glTF Transform, DOM HUD over canvas.
  - `game-ui-frontend` has concrete HUD budgets, for example "no more than roughly 20-25% of the viewport covered by persistent HUD" and "keep the center … and lower-middle playfield clear". It also has explicit rules for pointer-lock and camera-input gating under modals. Strong material for gm-ui-hud.
  - `game-playtest` has a 2D/3D check list: context loss, GLB streaming stalls, collision-proxy mismatch, reduced motion, safe areas. Good material for gm-verify.
  - `web-game-foundations` defines an input action map (`move/confirm/cancel/ability-1/pause`, mapped in one place) and keeps simulation separate from rendering. That is a good seed for gm-input.
  - `web-3d-asset-pipeline`: Blender → GLB → glTF Transform → validate names, pivots, scale and collision proxies; "Draco or Meshopt deliberately, not both"; KTX2 when supported.
- **Weaknesses:** Mostly principles with little code. The Rapier starter is about 10 lines and has no character controller, fixed timestep or interpolation. It does not cover Phaser 4 specifics, audio or multiplayer.
- **Risks:** License ambiguity at repo level, though MIT is declared in the plugin. It may overlap with openai/skills `develop-web-game`, which other researchers cover.
- **Feeds:** gm-ui-hud, gm-verify, gm-input, gm-pack-import, gm-genre-* (architecture).

### 2. dgreenheck/webgpu-claude-skill [V]
- 1,258 stars. **No LICENSE file**, so all rights are reserved by default. Last push 2026-04-10.
- **Contents:** one skill, `webgpu-threejs-tsl`. The SKILL.md is 93 lines and indexes:
  - 7 docs, about 2,760 lines in total: core concepts, materials, compute, post-processing, WGSL, device loss, limits;
  - 5 examples, 2 templates and a REFERENCE.md cheatsheet;
  - Cursor `.mdc` rules that mirror the docs.
- **Quality:** Good progressive disclosure and current API notes.
  - It notes that `PostProcessing` was renamed to `RenderPipeline` in r183, that DOF was reimplemented in r181, that `computeAsync` is deprecated in r181, and the r180 gaussian `resolutionScale` change.
  - It covers `MeshToonNodeMaterial`, the TSL outline node, and r183 retro/CRT and god-ray effects, all of which help with toon and pixel looks.
  - It is aligned to "r183+". We are on r186, so we need to re-check for r184–r186 changes.
- **Risks:** No license, so we can only link to it or rewrite in our own words. Its examples are JS, not TS. It is WebGPU-first, so we need a WebGL2 fallback story.
- **Feeds:** gm-vfx (TSL post-processing, toon, compute particles).

### 3. ahujasid/blender-mcp, now "MCP for Blender" (`mcp-for-blender`) [V] (README only)
- 32,266 stars. MIT. Pushed 2026-10-24, so very active.
- **What it is:** an MCP server plus a Blender add-on. It is not a SKILL.md. It exposes 9 tools:
  - `execute_blender_code`;
  - `look` (viewport, camera, multi-angle sheet, frame strip; solid, material, rendered or x-ray modes);
  - `get_scene_info`;
  - `generate_3d` (Tripo, Hunyuan3D, Rodin, Meshy);
  - `search_assets` / `import_asset` (Poly Haven CC0, Sketchfab, Poly Pizza);
  - status and telemetry tools.
- **Risks:**
  - It needs **GUI Blender**: you click "Connect" in the N-panel. That does not fit headless CI.
  - The add-on's socket on port 9876 has **no auth** (the README says so).
  - `execute_blender_code` runs arbitrary Python.
  - "Premium" generation is paid.
  - Telemetry is "opt-in", but if enabled the data "may be used … to train AI models". Set `DISABLE_TELEMETRY=true`.
- **Ideas worth taking:**
  - The `look` multi-angle "angles" sheet is a good idea for gm-verify on assets: render a turnaround with headless Blender and have a model check it.
  - Poly Haven and Poly Pizza (CC0) as asset sources for gm-kitbash-3d.
- **Feeds:** gm-pack-import (an optional interactive path), gm-kitbash-3d (asset sourcing). Companion skills for it (vladmdgolam/agent-skills at 9 stars, NousResearch hermes-agent `blender-mcp`) are [U] and small.

### 4. TerminalSkills/skills: `blender-scripting` [V]
- 179 stars. Apache-2.0. Last commit to this skill 2026-10-24. Sub-1k: **only if clearly excellent**, and this one is accurate.
- **Contents (271 lines):** background runs with `--factory-startup --python-exit-code 1`, plus `--` argument parsing.
  - It explains why the exit code matters: without it, CI never sees a failure.
  - It covers bmesh, modifiers, curves, and glTF import/export.
  - It has 4.x/5.x deltas: `wm.obj_import`; and in 5.0, materials already have Principled nodes and `use_nodes` is deprecated.
  - It says to find nodes by type, not by translated name. It has batch examples.
  - It was "checked on 5.0.1". It mentions the `pip install bpy` route.
- **Weakness:** It is not game-specific. It does not cover glTF export flags (Y-up, apply modifiers, draco off, animation baking), origin and pivot conventions, collision-proxy naming, or LOD.
- **Neighbors:** `blender-render-automation` exists in the same repo but I did not read it [U].
- **Feeds:** gm-pack-import, gm-props-procedural. Fork the CLI and version-pitfall sections.

### 5. EnzeD/r3f-skills: `r3f-physics` (and 10 sibling skills) [V]
- 130 stars. **No license.** Pushed 2026-08-31. One directory listing claimed "1.2k stars"; that is false.
- **Quality:** Dense, current pitfall list (84 lines plus `references/controllers.md`). It ships with `evals/` and `validation/`. Points:
  - cuboid colliders take half-extents;
  - an impulse is not a force, and forces accumulate;
  - step-aligned input;
  - kinematic movement is different from `setTranslation` teleporting;
  - fixed timestep, plus "multiplying by delta isn't deterministic";
  - avoid duplicate auto and manual colliders;
  - CCD;
  - collision groups need masks on both sides;
  - "use the Rapier character-controller API and test stairs/slopes/grounding".
- **Risks:** It targets R3F (`@react-three/rapier`), not vanilla three. No license. Sub-1k.
- **Feeds:** the Rapier sections of gm-genre-* (platformer, racer, physics toy). Port the rules, not the code.

### 6. PlayableIntelligence/game-creator (also "opusgamelabs") [V]
- 346 stars. No repo LICENSE; the skill frontmatter says `license: MIT`. Pushed 2026-05-25. The clone is 372 MB.
- **Contents:** 29 skills.
  - Skills I read: `game-audio`, `add-multiplayer`, `design-game`, `game-qa`, `threejs-perf`, `game-3d-assets` and `game-designer`.
  - Others: monetization, `viral-game`, and paid generators (`meshyai`, `worldlabs`, `retrodiffusion`).
- **What is useful:**
  - `game-audio` gives zero-dependency Web Audio patterns: an AudioManager with a master gain, a look-ahead scheduler, an EventBus→audio bridge and a mute toggle. It flags Strudel as AGPL.
  - `add-multiplayer` (PartyKit / Durable Objects) sets good rules: single-player must work offline, edits are additive only, the EventBus is the only seam, the server is authoritative, and a backend-agnostic `MultiplayerClient` makes swapping in Colyseus local.
  - `threejs-perf` reports measured instancing numbers.
  - `game-qa` uses the `render_game_to_text()` / `advanceTime()` testability hooks (the same pattern as openai develop-web-game).
- **Risks:**
  - It targets Phaser **3**, not 4, and three 0.183.
  - It is opinionated around its own scaffold (EventBus/GameState/Constants).
  - It leans on viral and monetization goals, and on paid APIs (Meshy, Sketchfab tokens).
  - There is no top-level license.
- **Feeds:** gm-multiplayer-ready (its principles are the best I found), gm-audio (scaffolding pattern), gm-verify, gm-vfx (juice list).

### 7. Donchitos/Claude-Code-Game-Studios [V]
- 27,443 stars. MIT. Pushed 2026-10-19.
- **Contents:** 49 agents and about 72 skills, wired with hooks, YAML config and "director gates".
- **Fit:** It is centered on Godot, Unity and Unreal, and runs a studio process (sprints, GDDs, approval prompts before every write).
- **Worth mining:**
  - The `accessibility-specialist` agent has a concrete checklist: 18px text at 1080p scaling to 200%, 4.5:1 and 3:1 contrast, never color alone, separate volume buses, mono audio, full remapping, no forced simultaneous presses, toggle instead of hold, adjustable game speed, adaptive controllers.
  - The `playtest-report` template: first-5-minutes questions, pain, confusion and delight points, a bug table.
  - `ux-review`, `team-level`, `balance-check`.
- **Risks:** Skills shell out to `hooks/yaml-helper.sh` and reference `.claude/docs/...`, so they are not portable as-is. The collaboration protocol (ask before writing) conflicts with an autonomous executor.
- **Feeds:** a gm-a11y section inside gm-ui-hud and gm-input, the gm-verify playtest rubric, and level-design notes for gm-genre-*.

### 8. dannyjpwilliams/ui-sound-design-skill [V]
- 43 stars. MIT. Pushed 2026-04-08.
- **Workflow:** describe → generate → listen → refine. It produces an HTML preview with WAV download. References: `sound-recipes.md`, `web-audio-api.md`, `tone-js.md`, `audio-rules.md`, plus an `analyze-sound.mjs` reference-WAV analyzer (not run).
- **Best idea:** a "vocabulary bridge" that maps plain-English adjectives ("snappier", "warmer") to synthesis parameters. That is exactly what voice-driven SFX edits need.
- **Risk:** It is about UI sounds, not game SFX. Sub-1k.
- **Feeds:** gm-audio, as a design pattern on top of ZzFX parameters.

### 9. MiniMax-AI/skills: `shader-dev` [V] (SKILL.md head and file list)
- 13,728 stars. MIT. Pushed 2026-04-18.
- **Contents:** a 299-line router to 36 ShaderToy-style GLSL technique files: SDFs, ray marching, noise/FBM, toon lighting in `lighting-model`, post-processing, cellular automata, palettes.
- **Fit:** Good for procedural backgrounds and VFX. It is not TSL and not three-specific.
- **Feeds:** gm-vfx (optional reference).

### 10. github/awesome-copilot: `game-engine` [V] (structure and grep)
- 40,375 stars. MIT.
- **Contents:** a 139-line SKILL.md plus about 6,200 lines of references. The material appears to be adapted from MDN game-dev docs; MDN content is CC-BY-SA, so check attribution.
- **Problem:** `game-control-mechanisms.md` covers touch, keyboard and mouse, the Gamepad API (`gamepadconnected`) and TV remotes, but its Phaser code is the Phaser 2/CE API (`this.game.input.pointer1`, `onDragStart(sprite, pointer)`). Wrong for Phaser 4.
- **Feeds:** gm-input (raw Gamepad API concepts only).

### 11. rawwerks/VibeCAD: `gltf-transform` [V]
- 123 stars. MIT. Last push 2025-12-17.
- **Contents:** 117 lines covering `inspect`, `optimize --compress draco --texture-compress webp`, meshopt, quantize, weld+simplify, merge. Uses `bunx`.
- **Gaps:** It is CAD-oriented. It has no KTX2/UASTC/ETC1S, no `validate`, no meshopt-vs-draco decoder setup in three, and no texture budgets.
- **Verdict:** Write our own gm-pack-import section. The gltf-transform CLI (1,991 stars, MIT, v4.5.1) is the real dependency.
- anthemflynn/ccmp `asset-pipeline-3d` [U] returned 404 from `gh`; the listing mentions meshopt, Draco, KTX2, resize, flatten and prune.

### 12. Tone.js skills: plyght/tonejs-skill (4 stars), Bbeierle12/Skill-MCP-Claude `audio-playback` (8 stars) [V]
- Both use `Tone.Transport.start()` etc. throughout. Tone v15 deprecates these in favor of `Tone.getTransport()`.
- plyght's frontmatter claims `version: "15.4.0"` (npm latest is 15.1.22) and lists `author: Yotam Mann`, the Tone.js author, not the skill author. That is a misattribution.
- Bbeierle12's postfx skills are R3F-only.
- **Reject both.** We write gm-music-compose ourselves.

### 13. Generic "game-development" packs (vudovn/ag-kit 8.2k, mirrored in sickn33/agentic-awesome-skills 48k and davila7/claude-code-templates 32.9k) [V]
- Decision trees and tables for multiplayer, audio and web games. Correct but shallow: no code, no versions.
- `multiplayer/SKILL.md` gives a reasonable glossary (authoritative vs P2P; prediction, interpolation, reconciliation, lag compensation).
- **Feeds:** at most a concepts paragraph in gm-multiplayer-ready.

### 14. a5c-ai/babysitter `library/specializations/game-development/skills/*` [V]
- 1,868 stars, but the 138 game skills I sampled (`accessibility-games`, `character-physics`, `blender-integration`) are stubs. Each is a few bullet "capabilities" and nothing more. Its high star count does not reflect skill quality. **Reject.**

### 15. HKUDS/CLI-Anything: `cli-anything-blender` [V] (head)
- 56,863 stars. Apache-2.0. It is a pip-installed stateful REPL over a JSON scene format that generates bpy. My grep of the SKILL.md found no glTF/GLB references. It adds an abstraction layer we do not need. **Reject** for gm-pack-import.

---

## Directories and marketplaces checked
- **VoltAgent/awesome-agent-skills** (36,302 stars) [V, README grep]: the only game entry is `openai/develop-web-game`. Also lists `MiniMax-AI/shader-dev` and GSAP skills. It links officialskills.sh.
- **ComposioHQ/awesome-claude-skills** (77,848 stars) and **travisvn/awesome-claude-skills** (15,544 stars) [V, README grep]: no game, three, audio or Blender entries.
- **vercel-labs/skills** (`npx skills`, 36,416 stars) and skills.sh: used for discovery. Install counts there are small (hundreds) for every gap-area skill [U].
- Third-party mirrors (claudskills.com, tessl.io, playbooks.com, skillselion, typingmind, mcpmarket) disagree on stars and often get them wrong (r3f-skills "1.2k" against a real 130). Do not trust their numbers.
- **Colyseus** (7,466 stars): the repo ships only a 6-line contributor `AGENTS.md` [V]. I found no official skill and no llms.txt [U]. Community Colyseus skills exist on claudskills.com and tessl (`pantheon-ai/colyseus-multiplayer`) [U, unverified, unknown stars].

---

## Gaps: nothing good exists, so we write these ourselves
1. **Rapier (vanilla TS, `@dimforge/rapier3d-compat` 0.21) + KinematicCharacterController.** Only fragments exist (the r3f-physics rules, a 10-line openai starter). Ours should cover:
   - fixed-step accumulator plus render interpolation;
   - character controller (slopes, steps, snap-to-ground, grounded state);
   - collision groups, sensors and events, CCD;
   - the WASM init/compat build, and the moved repo location.
   - Physics in **Phaser 4** (Arcade/Matter) is separate and is covered by the Phaser skills.
2. **gm-music-compose (Tone.js 15).** The existing skills use the deprecated Transport API. Ours needs `getTransport()`, scheduling with `time`, `Part`/`Sequence`, dispose discipline, adaptive layers and stems, the autoplay gesture, and offline render to WAV for verification.
3. **gm-audio (ZzFX / jsfxr).** No skill exists anywhere. Ours needs a parameter-array schema, presets (jump, coin, hit, explosion, power-up), seedable variation, the "vocabulary bridge" from #8, and mixing buses and ducking (bus list from the CCGS accessibility checklist).
4. **gm-input.** Nothing current exists for one action map spanning keyboard, mouse, Gamepad API (standard mapping, deadzones, polling in the loop, hot-plug), touch (virtual stick, `touch-action: none`, multitouch) and Phaser 4 input. Ours should also cover remapping and toggle-instead-of-hold accessibility. Seeds: openai `web-game-foundations` (action map) and CCGS (accessibility).
5. **gm-multiplayer-ready (Colyseus 0.18).** There is no trustworthy Colyseus skill. Base it on game-creator's rules (offline-first, a single seam, server authority, backend-agnostic client) and target Colyseus rooms, schema, and reconnection.
6. **gm-pack-import (headless Blender → glTF → gltf-transform).** No end-to-end skill exists. Combine:
   - TerminalSkills CLI hygiene;
   - export flags;
   - pivot, scale and naming conventions plus `COL_`/`LOD` naming;
   - `gltf-transform validate/inspect/optimize` with meshopt + KTX2;
   - a three loader setup (Meshopt/KTX2 decoders);
   - a turnaround render for visual verification (the idea from blender-mcp's `look`).
7. **gm-kitbash-3d / gm-props-procedural.** Nothing exists for assembling CC0 kits (Kenney, Quaternius, Poly Haven, Poly Pizza) into props, or for procedural prop generation in bpy or three. We write these.
8. **gm-vfx toon/pixel look on r186.** Partial coverage only: the webgpu skill has `MeshToonNodeMaterial`, outline and retro/CRT. Nothing covers a pixelation pass with a low-res render target and nearest-neighbor upscale, palette quantization or dithering, inverted-hull outlines, or WebGL2 fallback.
9. **Game feel and level design for web genres.** game-creator's juice list (hit-freeze, combo text, trails, shake) and CCGS `team-level` are only starting points. We need a genre-specific gm-genre-* with level pacing and tuning numbers.
10. **Accessibility as a web-game skill.** Only the CCGS checklist (engine-agnostic) exists. We need a DOM/ARIA HUD, `prefers-reduced-motion`, colorblind-safe palettes, caption hooks for SFX, and remapping UI.

## Recommendations
- **Adopt (copy or adapt with attribution):** openai/plugins game-studio (MIT) patterns for gm-ui-hud, gm-verify and gm-input; TerminalSkills `blender-scripting` (Apache-2.0) for gm-pack-import.
- **Reference only (no license):** webgpu-claude-skill and r3f-skills. Paraphrase their rules and link to them.
- **Optional dev tool:** MCP for Blender, for interactive authoring only, with telemetry off and the socket kept on localhost. Keep the pipeline headless.
- **Write ourselves:** Rapier/character controller, Tone.js, ZzFX, input, Colyseus, Blender→glTF pipeline, kitbash/procedural props, toon/pixel post-processing, web-game accessibility.
