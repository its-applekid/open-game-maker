# Sourcing agent skills for Open Game Maker 2000: pipeline, verification, design

**Date:** 2026-10-24. **Method:** shallow clones (sparse for the two big repos) under
`scratchpad/skills-src/`, plus `gh api` for metadata and for files that were deleted upstream. Nothing was
installed or executed. Labels: **[V]** = verified by reading the file or the API response; **[U]** =
unverified (inference, or something I did not open).
Token estimates use bytes/4.

> **Version scope (2026-10-25):** V1 skills; gm-multiplayer-ready is V1 rules only, with gameplay in V2; see `docs/spec/release-plan.md`.

## 0. Bottom line

1. **No single repo gives us a verification loop we can drop in.** The best pieces are:
   - openai `develop-web-game`, which OpenAI deleted on 2026-04-23. We can recover it from git history.
     It has the right *contract*: `render_game_to_text`, `advanceTime`, and action bursts.
   - godogen's three.js capture notes. They name the right *traps*: GPU fallback, ready flag,
     stepped capture, and `preserveDrawingBuffer`.
   - godogen's old visual-qa prompts, which give us a defect taxonomy.

   Build `gm-verify` ourselves from these three. Fork none of them as-is. [V]
2. **gamedev-skills/awesome-gamedev-agent-skills is the best design-knowledge source.** It is Apache-2.0,
   has 35 relevant skills, and was refreshed 2026-10-24 against **Phaser 4.2 and three r186, our exact pins**.
   Its "engine-agnostic" disciplines are written in GDScript and C#, and the genre skills use Python
   pseudocode. So the approach is **adapt**: keep the prose, tables and pitfalls, and rewrite the code in TS. [V]
3. **godogen today is a thin docs-only runtime.** As of 2026-07-02 it has 1 skill (`asset-gen`) and a
   33-line three.js guide. Its asset pipeline relies on
   `htdt/godogen_assets` (**no license, 0 stars**; it needs an NVIDIA GPU) and on paid Gemini/xAI/Tripo calls.
   It does not fit headless sandboxes. **Borrow ideas only.** [V]
4. **anthropics/skills:** `webapp-testing`, `frontend-design`, `skill-creator`, `algorithmic-art`,
   `canvas-design` and `theme-factory` are **Apache-2.0**. `docx`, `pdf`, `pptx` and `xlsx` are **proprietary**
   ("governed by your agreement with Anthropic", with extra restrictions). `doc-coauthoring` has **no LICENSE.txt**.
   Only `skill-creator`, as an eval harness, and `frontend-design`, for creator-facing UI, are worth adapting. [V]
5. **openai/skills is deprecated.** The README says "This repository is deprecated", pointing to openai/plugins, and
   the last commit was 2026-06-23. The game skill is gone from HEAD. [V]
6. **CCGS (prior A1 research):** nothing has changed upstream since A1. HEAD is still `05ad7c8` (v1.2.0, 2026-10-19).
   Stars have gone from 27,065 to 27,443. [V]

---

## 1. htdt/godogen

| Field | Value |
|---|---|
| License | MIT, "Copyright 2026 Alex Ermolov" (`LICENSE.md`) [V] |
| HEAD | `40542b6` 2026-10-16 "Local assets by default; audio; GDScript and three.js (#54)" [V] |
| Stars | 7,205 (gh api) [V] |
| Size | 31 files, about 2.7k lines in total [V] |

### 1.1 What it is now [V]
godogen is a source repo. `publish.sh` renders three files into a fresh game repo: `prompts/runtime.md`
(11 lines, ~280 tok), one `engines/<engine>.md`, and the `asset-gen` skill. The CHANGELOG entry for 2026-07-02
says it "Replaced the multi-stage skill pipeline with a thin runtime" and "Dropped the
planner/decomposer/architecture/scene/scaffold/quirks/capture skill docs … and all hooks". Its stated
philosophy (`AGENTS.md`) is "Don't give obvious guidance … keep the guides to what the model can't infer."
**This matches our token budget goals and is worth copying as a writing rule.**

### 1.2 Verification / QA loop
- **Current state [V].** `runtime.md` reads: "Judge progress from the running game, never from a clean build". It
  finishes with a "15–20s video … watch it back before you call the work done." There is no script; the agent
  writes its own capture tooling from the engine guide.
- **`engines/threejs.md` capture rules (33 lines, ~1k tok) [V].** This is the most useful godogen content for us:
  - Headless Chrome silently falls back to SwiftShader/llvmpipe. Read the WebGL `RENDERER` string and warn.
  - Gate screenshots on a ready flag set by the game.
  - Add a capture mode that stops `setAnimationLoop` and exposes a fixed 1/30 s step hook.
  - `toDataURL()` returns blank unless it is called right after `render()` or `preserveDrawingBuffer: true` is set.
  - three.js traps: color space, physical lights with inverse-square decay, shadow-camera bounds,
    `SkeletonUtils.clone`, and WebGPU→WebGL2 fallback (`renderer.backend.isWebGPUBackend`).
  - Fit for our r186 pin: good. It tells the agent to read `node_modules/three/src` instead of trusting memory.
- **Old `visual-qa` skill, removed 2026-04-26 [V].** Recovered from commit `144dba5` into
  `skills-src/godogen-history-144dba5/`. It had three modes: static (reference + screenshot), dynamic (frames 0.5 s
  apart) and question. Its defect checklist covers:
  - z-fighting, missing textures, clipping, floating objects, UI overlap or truncation;
  - placeholder primitives, debug gizmos;
  - motion faults: stuck entities, teleporting, ice-skating, animation/speed mismatch.

  The output format puts the verdict first (pass/fail/warning), followed by typed, severity-ranked issues. An
  aggregated `--both` mode fails if either judge fails.

  It defaulted to **paid Gemini** (`gemini-3-flash-preview` via `google-genai`). The CHANGELOG explains why it was
  dropped: "Opus 4.7 / GPT 5.5 self-verify from captured frames; external pass added no signal" (author's claim,
  **[U]** as evidence). The prompts are Godot-flavoured ("Default Godot materials") and about 1.3–1.4k tok each.
- **`visual-target.md`, removed 2026-07-02 [V].** It generates one "in-game screenshot" reference image that lists
  every game object and HUD element. That image then serves as both the asset requirement list and the QA
  target. This is a good idea for `gm-assets` and `gm-verify`, but it needs a paid image API.
- **Old Babylon `capture.mjs` (237 lines, Playwright) [V].** It provided `still`, `frames` and `video` modes, and
  detected a software renderer with a regex
  (`swiftshader|llvmpipe|lavapipe|software|softpipe|mesa offscreen`).
- **Old Stop hook [V].** `shared/hooks/stop_post_task_gate.py` pushed the proof video to **Telegram** through `tg-push`
  when `TG_BOT_TOKEN` was set. It is gone now, but it shows the author ships exfil-capable hooks. **Never vendor
  hooks from this repo.**

### 1.3 Asset pipeline [V]
- **`asset-gen/SKILL.md`** (72 lines, ~1.5k tok). It is a summary of a table of local GPU tools from `godogen_assets`:
  Qwen-Image, TRELLIS.2 `gen3d`, `mia-rig`, Kimodo moves, lipsync, Stable Audio, Qwen3-TTS.
- **`api.md`** (173 lines, ~3.4k tok) covers the paid services: Gemini/Grok images at 5–15¢, Grok sprite video at
  14¢/s, the Tripo CLI (`npm install -g tripo-cli`), Gemini TTS and Lyria music.
- **`motion.md`** (~4k tok) is Kimodo-specific.
- Good, portable rules:
  - an asset manifest in README with an **in-game Size column** ("without it, coders consistently scale assets
    wrong");
  - "never prompt for a transparent background" (prompt a solid colour, then matte it);
  - choose the matte colour close to the in-game environment;
  - style families come from editing one hero image;
  - small sprites: design at ≥128px or slice a kit grid;
  - "generators get left/right wrong; flip at runtime";
  - render GLBs and view audio as a spectrogram, because the agent can't see or hear them;
  - script Blender headless for exact or articulated models.
- `loop_audio.py` (bar-aligned crossfade loop cutter, 84 lines) and `grid_slice.py` (55 lines) are small and MIT.
  They could be ported to TS or Node if we need them.
- **Dependencies and risks:**
  - `requirements.txt` pulls in `xai-sdk`, `google-genai`, `onnxruntime-gpu[cuda,cudnn]`, `rembg` and `pymatting`.
  - `rembg` downloads BiRefNet weights at runtime **[U]**.
  - `htdt/godogen_assets`: `gh api` reports **license null**, 0 stars, last push 2026-10-01. That means all rights
    reserved by default, so **do not depend on it**.
  - The underlying models (TRELLIS.2, Kimodo, Qwen) carry their own licenses, some possibly non-commercial **[U]**.
  - The asset-gen frontmatter sets `allow_implicit_invocation: true`, and the skill reaches paid APIs. Its only
    guard is the instruction "confirm with the user before the first paid call". A headless agent has no user to
    ask, so **this guard must be enforced by our service (budget and API-key scoping), not by the prompt.**

### 1.4 three.js / Babylon targets [V]
- Both use Vite + TS on Node 22+, with the dev server bound to `0.0.0.0:5173` so a human can watch.
- The Babylon guide covers the side-effect-import trap and Havok wasm from `public/`.
- The three.js guide recommends Rapier (`@dimforge/rapier3d-compat`) and HTML UI over the canvas.
- There is **no Phaser target and no 2D guidance**: "web engines are 3D-first and draw 2D as sprites".

### 1.5 Fit for headless sandbox agents
- **Prose: good.** It is short and targets real traps.
- **Tooling: poor.** It assumes an NVIDIA GPU, hardware Vulkan, `xvfb`, ffmpeg, ImageMagick, Blender, paid keys and
  a human watching a LAN URL.
- **Verdict: borrow ideas.** Take the three.js capture rules and traps, the visual-qa taxonomy, the visual-target
  idea, and the asset-manifest Size column and prompt rules.

---

## 2. openai/skills

| Field | Value |
|---|---|
| Status | **Deprecated** (README banner; commit #496 "Deprecate skills repository", 2026-06-22) [V] |
| HEAD | `49f948f` 2026-06-23 [V] |
| Stars | 28,290 [V] |
| License | Apache-2.0 per folder `LICENSE.txt`. All folders I checked are Apache-2.0 [V] |

### 2.1 `develop-web-game`: removed, recovered [V]
- Deleted in commit `11c64381` (2026-04-23), "Remove curated frontend and web game skills (#370)". It was
  recovered from parent `30444ae` into `skills-src/openai-develop-web-game/`.
- **License:** Apache-2.0 (`LICENSE.txt`, 201 lines).
- **Size:** SKILL.md is 149 lines (~2.3k tok), plus `web_game_playwright_client.js` (356 lines) and
  `action_payloads.json`.
- **What it does:**
  - The loop is "implement → act → pause → observe → adjust".
  - It requires the game to expose `window.render_game_to_text()`, a concise JSON of player-relevant state with a
    coordinate-system note, and `window.advanceTime(ms)` for deterministic stepping.
  - It keeps a `progress.md` file with "Original prompt:" for agent hand-off.
  - It requires exhaustive multi-step interaction checks ("collecting a key should unlock a door").
  - Its rule for screenshots: "Treat the screenshots as the source of truth".
  - It says to fix the first new console error before anything else.
- **Client script facts (read, not run):**
  - Uses `import { chromium } from "playwright"` and launches with `--use-gl=angle --use-angle=swiftshader`
    (forced software GL). That works on GPU-less sandboxes but is slow.
  - The init-script shim wraps `setTimeout`/`setInterval`/`requestAnimationFrame` only to *count* pending tasks.
  - Its fallback `advanceTime` waits **real** rAF frames, so time is not truly virtual unless the game defines its
    own hook.
  - Screenshots capture the **largest canvas only**, so DOM HUD overlays are missed.
  - Only 8 keys are mapped (arrows, enter, space, a, b), so WASD/Shift/Esc can't be sent without edits.
  - Writes `shot-N.png`, `state-N.json` and `errors-N.json`. No network calls besides the target URL.
- **Quality:** concrete and right-sized; the interface contract is excellent. There is one wrong instruction: if
  `npx` is missing, `npm install -g @playwright/mcp@latest` installs the MCP server, not the `playwright` library
  the client imports. It also contains Codex-specific paths (`$CODEX_HOME`).
- **Fit:** high, once adapted. **This is the seed for `gm-verify`.** Keep:
  - the `render_game_to_text` + `advanceTime` contract, which our SDK should implement for Phaser and Three so the
    agent doesn't hand-write it;
  - action bursts and per-burst artifacts.

  Change:
  - capture the full page (canvas + DOM HUD), with phone and desktop viewports;
  - use a real virtual clock;
  - full key map, pinned Playwright version, no global installs.

### 2.2 Other openai skills relevant to games [V]

| Skill | Lines | License | Notes | Fit |
|---|---|---|---|---|
| `playwright` | 147 | Apache-2.0 | `scripts/playwright_cli.sh` runs `npx --yes --package @playwright/cli`: an **unpinned runtime download** (supply-chain risk; fails offline) | Borrow ideas only |
| `playwright-interactive` | 693 | Apache-2.0 (+NOTICE) | Needs Codex `js_repl` and says "run this workflow with sandboxing disabled: `--sandbox danger-full-access`"; launches `headless: false` | **Reject** for sandboxes |
| `imagegen` (.system) | 279 | Apache-2.0 | Built-in `image_gen` tool, or a CLI fallback needing `OPENAI_API_KEY` (paid) | Borrow prompt-structure ideas for gm-sprites-2d |
| `speech` | 144 | Apache-2.0 | OpenAI TTS (`gpt-4o-mini-tts-2025-12-15`), paid; requires telling end users the voice is AI | Borrow ideas for gm-dialogue-narration (the disclosure rule is a good one) |
| `screenshot` | 267 | Apache-2.0 | OS desktop screenshots (macOS Swift/PowerShell) | Not relevant |

---

## 3. anthropics/skills

| Field | Value |
|---|---|
| HEAD | `dbd4588` 2026-10-09 [V] |
| Stars | 183,535 [V] |
| README | "Many skills in this repo are open source (Apache 2.0) … docx, pdf, pptx, xlsx … are source-available, not open source." [V] |

Per-folder `LICENSE.txt` [V]:
- **Apache-2.0:** academy-guide, algorithmic-art, brand-guidelines, canvas-design, claude-api, discernment-nudge,
  frontend-design, internal-comms, mcp-builder, skill-creator, slack-gif-creator, theme-factory,
  web-artifacts-builder, webapp-testing.
- **Proprietary** ("© 2025 Anthropic, PBC. All rights reserved … governed by your agreement with Anthropic …
  ADDITIONAL RESTRICTIONS"): **docx, pdf, pptx, xlsx**.
- **No LICENSE.txt:** `doc-coauthoring`. Treat it as unlicensed and don't copy it.
- The per-folder last commit is not available from a shallow clone. Repo HEAD is 2026-10-09.

| Skill | Size | What / quality | Deps / risks | Fit → verdict |
|---|---|---|---|---|
| **webapp-testing** | 95 L, ~1k tok, 3 example .py + `with_server.py` | Python Playwright with a "reconnaissance-then-action" decision tree: wait for `networkidle`, screenshot, find selectors. DOM-centric, with nothing for canvas, WebGL or game state | Python + `playwright` pip. Says "DO NOT read the source until you try running the script first", which goes against our read-before-run rule for vendored scripts. `networkidle` may never settle with Vite HMR / streaming assets **[U]** | Borrow `with_server.py` server-lifecycle idea for gm-verify. **Borrow ideas only** |
| **frontend-design** | 71 L, ~2.3k tok | Strong, concrete anti-"AI default" design guidance. It covers a plan → review against the brief → build → critique pass, a list of generated-design tells, copywriting rules, and a quality floor (responsive, focus, reduced motion) | None | Creator-facing editor/menus and game title/menu screens → **adapt** (trim the web-page "hero" framing; add game-menu specifics) for gm-ui-hud |
| **skill-creator** | 485 L, ~8.3k tok, 18 files | Draft → with-skill vs baseline runs → assertions → grader/comparator/analyzer agents → viewer → iterate; description-trigger optimization | Scripts shell out to `claude -p`, so they are Claude Code–specific and spend tokens | **Adopt as an internal dev tool** (not loaded into game agents) to eval our gm-* skills; matches A1's "executed evals" ask |
| **algorithmic-art** | 404 L, ~4.9k tok | p5.js "algorithmic philosophy" manifesto → seeded generative sketch + viewer. Wordy ("Emphasize craftsmanship REPEATEDLY") | `viewer.html` loads p5 from cdnjs and Google Fonts (network) | Borrow the seeded-randomness and parameter-exploration ideas for gm-vfx / gm-props-procedural. **Borrow ideas only** |
| **canvas-design** | 129 L, ~3k tok, 82 OFL fonts | Static poster art via a "design philosophy". Fonts are OFL | Python/PIL output | Low fit; the OFL fonts could be reused for title cards. **Borrow ideas only** |
| **slack-gif-creator** | 254 L, ~2k tok | PIL frame builder + `easing.py` + validators | Python/PIL | `easing.py` is a handy reference for gm-vfx tweens. **Borrow ideas only** |
| **theme-factory** | 59 L, ~0.8k tok | Preset palette/font themes | — | Possible gm-ui-hud palette presets. **Borrow ideas only** |
| docx/pdf/pptx/xlsx | — | — | **Proprietary** | Do not vendor |

---

## 4. gamedev-skills/awesome-gamedev-agent-skills

| Field | Value |
|---|---|
| License | Apache-2.0 (`LICENSE`). The `NOTICE` says "All skills … are original works … no text or code was copied from them" [V] |
| HEAD | `184b72b` 2026-10-24, "refresh/2026-10" [V] |
| Stars | 4,011 [V] |
| Created | 2026-06-24 [V] |
| Size | 242 files [V] |

- **Version pins match ours [V].** `docs/VERSION-SUPPORT.md` was checked 2026-10-24: Phaser 4.2 (4.2.1) and
  three.js r186 (0.186.1).
- **Format [V].** Each skill is ~120–250 lines, about 6–10 KB, or **~1.7–2.7k tok per SKILL.md**. On-demand
  `references/*.md` files are ~4–8 KB each. Every skill follows the same sections: When to use / When *not* to
  use / Core workflow / Patterns / Pitfalls / Related.
- **Tooling and risks [V].** CI validator scripts are in `scripts/validate-skills.py` with tests. My grep found no
  telemetry, injection-like phrasing or network calls in the skills I scanned.

### 4.1 Router (`router/SKILL.md`, 250 L, ~4.3k tok) [V]
- It detects one engine from a project fingerprint, then classifies the task as disciplines + at most one genre +
  workflows. It loads the **minimal** set using progressive disclosure, in order: engine → discipline → genre →
  workflow.
- Ownership rules: the engine skill owns the API, the discipline owns the concept, the genre owns the glue.
- Fallback: it "defaults to Godot" when the engine is unknown, which is wrong for us.
- **Fit:** the dispatch pattern is solid, but 70% of the text is about Godot/Unity/Unreal/Roblox/Defold. Our stack
  is fixed (Phaser or Three), so routing is mostly deterministic. **Adapt into a ~60-line `gm-core` routing
  section, or do it in service code** (see A1 `gm-specialist-router`).

### 4.2 Engine-agnostic skills reviewed

The code samples are mostly in GDScript or C#, and the genre skills use Python pseudocode. Every row needs a TS
rewrite. [V]

| Skill | L / ~tok | Code langs | Highlights | Verdict → our skill |
|---|---|---|---|---|
| game-feel | 174 / 2.4k (+ recipes 6.2KB) | gdscript×4, csharp | Trauma²-decay shake on the camera, never the body; hit-stop with real-time restore and overlap guard; squash/stretch with BACK ease; importance tiers; a "reduce shake/flash" option; WCAG 2.3.1 cited in refs | **Adapt** → gm-vfx (juice section); fills A1's S06 gap |
| create-game-assets | 137 / 2k, 2 Python QA scripts | bash | Lock the technical frame → visual system → manifest JSON (with license/provenance) → approve one hero target → families via edit → deterministic normalize → in-context check. Structured prompt blocks; `asset_report.py --require-alpha` catches fake checkerboards | **Adapt** → gm-assets (best general asset-process skill found); scripts need Pillow, so port to Node/sharp or keep Python |
| level-design | 169 / 2.2k | gdscript×3 | Metrics-first, blockout, critical/golden path, sawtooth difficulty, teach-then-test, gating graph | **Adapt** → genre skills and gm-scope-options |
| game-ui-ux | 167 / 2.5k | gdscript×4 | Anchors/containers, reference-resolution scaling, safe-area insets, gamepad focus, event-driven HUD | **Adapt** → gm-ui-hud (add DOM-over-canvas + Phaser UI) |
| input-systems | 211 / 2.7k | gdscript×4 | Actions over keys, edge vs held, deadzones, buffering + coyote, rebinding with conflict detection | **Adapt** → gm-input (add touch/virtual stick, which is missing) |
| save-systems | 191 / 2.3k | gdscript×3, python | Plain-data state, `version` int, atomic temp+rename, migrate → validate → instantiate, backup of the last good save, throttled autosave to a separate slot | **Adapt** → gm-saves-achievements (for localStorage/IndexedDB, atomic write becomes a write-then-swap key) |
| audio-design | 190 / 2.4k | gdscript×4 | Buses, slider-to-dB mapping, sidechain ducking, SFX variation, beat-quantized events; adaptive-music ref | **Adapt** → gm-audio (+ music ref → gm-music-compose) |
| dialogue-systems | 182 / 2k | gdscript, ink, yarn, json | Engine-neutral dialogue graph as data, a runner state machine, Ink/Yarn 3 notes | **Adapt** → gm-dialogue-narration |
| procedural-gen | 173 / 2.2k | python×4 | Seeded RNG first, fBm noise, weighted loot, rooms-and-corridors; dungeon/noise refs | **Adapt** → gm-props-procedural |
| camera-systems | 163 / 2.3k | gdscript×5 | Deadzone, look-ahead, bounds clamp, shake input | **Adapt** → genre/gm-core |
| physics-tuning | 164 / 2.2k | gdscript×4 | Fixed timestep, CCD/tunnelling, jitter | **Adapt** → gm-core / gm-repair pitfalls |
| performance-optimization | 170 / 2.5k | mixed | "Profile first", pooling, draw calls, GC | **Borrow ideas** → gm-verify perf budget |
| shader-programming | 170 / 2.1k | glsl×4 | Dissolve/outline basics | **Borrow ideas** → gm-vfx (r186 TSL not covered **[U]**) |
| game-ai, ai-behavior-trees-utility-ai | 179 / 177 | gdscript, csharp | Steering, BT, utility AI | **Borrow ideas** → genre-rpg/topdown |
| genres: platformer | 146 / 1.9k | python×2 | Excellent knob table (apex 0.30–0.40 s, coyote 0.08–0.12 s, buffer 0.10–0.15 s, fall-gravity 1.5–2×, corner correction); derive gravity from height + time; Phaser one-way platform line | **Adapt** → gm-genre-platformer |
| genres: puzzle / rpg | 143 / 132 | python×3 | Grid logic + level teaching / stats, inventory, quests | **Adapt** → gm-genre-puzzle / gm-genre-rpg |
| genres: roguelike, tower-defense, card, VN, survival, fps | 123–153 | python | — | **Borrow** for topdown (roguelike/TD) and future genres |
| **No racer genre** | — | — | — | Write gm-genre-racer from scratch |
| workflows: prototype-fast | 119 / 1.5k | text | One question, throwaway vs keep, timebox, observable keep/kill criteria | **Adapt** → gm-scope-options (offer 2–3 variants framed as questions) |
| workflows: game-jam | 156 / 2.2k | text | Scope cutting under a deadline | **Borrow ideas** → gm-scope-options |
| web-engines: phaser-core, phaser-arcade-physics, threejs-scene-setup/-gltf-loading/-materials-lighting, pixijs | 178–225 | ts/js | Target Phaser 4.2 / r186; `THREE.Timer` (Clock deprecated r183), `HDRLoader`, r185 DRACO/KTX2 defaults. **But** `threejs-scene-setup` uses a jsDelivr import map, which needs network; we bundle with Vite | **Adapt** → gm-core engine notes (rewrite the import section for Vite, offline) |

- **There is no dedicated "playtesting" or "game design" skill.** Playtesting appears only as steps inside
  prototype-fast, game-jam and level-design. A1's CCGS `playtest-report` four-bucket triage is still the best
  source for that. [V]
- **Fit for headless sandboxes:** the prose is high quality. Each skill's "Verify" step assumes a human plays
  ("Watch real players"). We must translate that into gm-verify probes. [V]

---

## 5. CCGS (prior A1 research)
HEAD is still `05ad7c8a` (v1.2.0, 2026-10-19), with no commits since. Stars: 27,443. The A1 reuse map stands
unchanged. [V]

---

## 6. Mapping onto planned gm-* skills

| Planned skill | Best sources | Verdict |
|---|---|---|
| **gm-core** | godogen `engines/threejs.md` traps + "only what the model can't infer" rule; gamedev `phaser-core`, `threejs-*`, `physics-tuning`, `camera-systems`; router composition rules; develop-web-game `progress.md` hand-off | **Adapt** (fork + trim; write TS; Vite/offline imports) |
| **gm-assets** | gamedev `create-game-assets` (manifest + provenance + hero target + gates); godogen asset-manifest **Size column**, solid-bg-then-matte, flip-at-runtime, visual-target prompt | **Adapt** create-game-assets; **borrow** godogen rules |
| **gm-kitbash-3d** | godogen Blender-headless guidance, Tripo face-limit/`auto_size` notes; gamedev `three-d-pipeline.md` ref, `threejs-gltf-loading` | **Borrow ideas**, write new |
| **gm-sprites-2d** | gamedev `raster-pipeline.md`; godogen ≥128px / kit-slice / sprite-video recipe; openai imagegen prompt structure | **Borrow ideas**; port `grid_slice` logic |
| **gm-vfx** | gamedev `game-feel` (+ recipes), `shader-programming`; anthropic `slack-gif-creator/core/easing.py`, `algorithmic-art` seeded params | **Adapt** game-feel; borrow the rest |
| **gm-props-procedural** | gamedev `procedural-gen` (+ dungeon/noise refs); anthropic algorithmic-art seeding | **Adapt** |
| **gm-audio** | gamedev `audio-design`; godogen "read audio as a spectrogram" | **Adapt** |
| **gm-music-compose** | gamedev `adaptive-music.md`; godogen Lyria prompt shape + `loop_audio.py` bar-cut idea | **Borrow ideas** (Lyria is paid, no free tier) |
| **gm-dialogue-narration** | gamedev `dialogue-systems` (+ runner, ink/yarn refs); godogen TTS direction rules (style vs inline tags; "child voices refused" by Gemini); openai speech AI-voice disclosure | **Adapt** dialogue-systems; borrow TTS rules |
| **gm-genre-platformer** | gamedev `platformer` + `feel-tuning.md` | **Adapt** (near-direct; TS rewrite) |
| **gm-genre-racer** | none found | **Write new** |
| **gm-genre-topdown** | gamedev roguelike / tower-defense / game-ai / camera | **Borrow ideas** |
| **gm-genre-rpg** | gamedev `rpg` + dialogue + save | **Adapt** |
| **gm-genre-puzzle** | gamedev `puzzle` + level-design | **Adapt** |
| **gm-ui-hud** | gamedev `game-ui-ux`; anthropic `frontend-design` (menus/creator UI); theme-factory palettes | **Adapt** both |
| **gm-input** | gamedev `input-systems` (+ buffering/accessibility ref) | **Adapt** (add touch) |
| **gm-saves-achievements** | gamedev `save-systems` (+ migration ref) | **Adapt** (no achievements source found; write that part) |
| **gm-editor-tuning** | gamedev platformer knob table ("tune by outcome, not raw numbers"); CCGS tunables-as-data (A1 #12) | **Borrow ideas**, write new |
| **gm-verify** | openai `develop-web-game` (contract + client); godogen three.js capture rules + old visual-qa taxonomy/verdict format + old `capture.mjs` renderer detection; anthropic `webapp-testing` server lifecycle | **Adapt** develop-web-game as the spine; **borrow** the rest. Make the SDK expose `render_game_to_text`/`advanceTime` |
| **gm-repair** | godogen silent-failure trap lists; develop-web-game "fix the first new console error"; gamedev Pitfalls sections | **Borrow ideas**, write new |
| **gm-multiplayer-ready** (V1 rules; gameplay V2) | gamedev has only `godot-multiplayer` / `roblox-networking` (engine-specific, skipped) | **Write new** |
| **gm-scope-options** | gamedev `prototype-fast` (one question, keep/kill), `game-jam` (scope cuts), `level-design`; CCGS game-brief (A1 #5) | **Adapt** prototype-fast + borrow |
| *(internal)* skill evals | anthropic `skill-creator` | **Adopt as-is** as a dev tool (not shipped to game agents) |

## 7. Cross-cutting risks
- **Paid APIs:** godogen `asset-gen` (implicit invocation, paid fallbacks), openai imagegen/speech, and the old
  godogen visual-qa (Gemini). Enforce spend in the service (keys absent by default, budget per run). Never rely on
  "confirm with the user". [V]
- **Network at runtime:**
  - openai `playwright_cli.sh` (`npx --yes`, unpinned);
  - develop-web-game's global-install advice;
  - anthropic `algorithmic-art` CDN;
  - gamedev `threejs-scene-setup` jsDelivr import map;
  - rembg weight download **[U]**.

  Pin everything inside the sandbox image. [V]
- **Exfil-capable hooks:** godogen's past Telegram Stop hook. Vendor no hooks from any of these repos. [V]
- **Prompt-injection-like text:** none found by grep across the four repos. Anthropic `webapp-testing` says "DO NOT
  read the source" of its scripts, which conflicts with our policy. [V]
- **Licensing:**
  - Apache-2.0 (gamedev, anthropic open folders, openai): keep `LICENSE` + `NOTICE`, mark modified files.
  - MIT (godogen): keep the copyright notice.
  - Avoid the anthropic proprietary folders, the unlicensed `doc-coauthoring`, and the unlicensed `godogen_assets`.
    [V]

## 8. Local evidence paths (scratchpad/skills-src/)
- `godogen/` (HEAD), `godogen-history-144dba5/` (visual-qa), `godogen-history-51954f9/` (capture.mjs, visual-target,
  Telegram hook)
- `openai-develop-web-game/` (recovered from `30444ae`), `openai-skills/` (sparse)
- `anthropics-skills/`, `awesome-gamedev-agent-skills/`

## 9. Limitations
- Shallow clones mean per-folder last-commit dates were not available for the anthropic or gamedev skills; repo
  HEAD dates are given instead.
- I read the gamedev router, game-feel, create-game-assets, platformer, prototype-fast, and the workflow sections
  of save-systems and level-design in full. The others I surveyed through headings, code-language counts and
  sizes.
- No scripts were executed, so behaviour is inferred from source.
- I did not check: `godogen_assets` content, the licenses of the underlying generator models, and whether
  `networkidle` works with Vite HMR.
