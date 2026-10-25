# B14: Sourcing agent skills from existing game-dev skill libraries

- **Source requirement:** Kevin, 2026-10-25: "building skills feel the highest leverage". Source from high-quality existing skills instead of writing them all ourselves.
- **Builds on:** B11 §4.8 (the planned `gm-*` skills list), v0.3 A1 (mining Claude Code Game Studios).
- **Detailed reports** (one per research pass, 2026-10-24/25):
  - `B14-skills/web-engines.md`: Phaser official, CloudAI-X threejs-skills, majid threejs-game-skills, PixiJS skills, awesome-gamedev web-engines. Includes an API-name check against the three.js r186 and Phaser 4.2.1 source.
  - `B14-skills/pipeline-and-design.md`: godogen, openai/skills (`develop-web-game`), anthropics/skills, awesome-gamedev engine-agnostic skills, CCGS.
  - `B14-skills/gaps.md`: openai/plugins game-studio, webgpu-claude-skill, Blender MCP and scripting, Rapier, Tone.js, multiplayer, and the skill directories.
- **Evidence labels:** **[V]** the file was read, or the check was run on a clone; **[U]** listing only. No third-party script was run.

> **Version scope (2026-10-25):** the skills here are V1, for adult creators. `gm-multiplayer-ready` in V1 covers only the architecture rules; multiplayer gameplay (Colyseus) is V2. Paid-API generator scripts stay out (paid generators are V2 at the earliest). Child-account skills are V3. See `docs/spec/release-plan.md`.

## 1. Bottom line

1. **Two layers.**
   - **Engine reference layer:** vendored third-party API skills, pinned by commit and loaded only when needed.
   - **`gm-*` workflow layer:** ours. Short, TypeScript, aware of our `gm` CLI, and pointing down into the reference layer.
2. **Adopt two reference sets as-is:**
   - **Phaser's official skills.** 28 of them, MIT, in `phaserjs/phaser/skills`, edited in the same commits as engine features. Of 650 API names checked, none was a real miss [V].
   - **CloudAI-X threejs-skills, minus the React Three Fiber skill.** 13 of them, MIT, 3.7k stars, targeting r186. All 189 classes and 279 methods exist in r186 [V]. The whole set was rewritten on 2026-10-18/19, so pin the commit and re-review [V].
3. **Main source for design and genre skills: gamedev-skills/awesome-gamedev-agent-skills.** It is Apache-2.0 with a NOTICE file, has 4.0k stars, was refreshed 2026-10-24, and targets our exact versions (Phaser 4.2, r186), at about 2k tokens a skill [V]. The engine-agnostic examples are GDScript, C# or Python pseudocode, so they need a TypeScript rewrite [V].
4. **`gm-verify` has no ready-made loop.** Build it on OpenAI's deleted `develop-web-game` skill (Apache-2.0, recovered from the repo's history) [V]. Its game contract is:
   - `render_game_to_text()` returns the game state as JSON;
   - `advanceTime(ms)` steps time deterministically;
   - input arrives in short bursts;
   - screenshots are the ground truth.

   Add to it:
   - from majid's `qa-release`: canvas pixel checks, an evidence manifest and a bot-playtest template [V];
   - godogen's 33-line three.js headless-capture guide and its visual-defect checklist [V];
   - openai/plugins game-studio's playtest checklist [V].

   **The engine SDK should expose these hooks** so `gm run` and `gm-verify` work for every game.
5. **We write these ourselves; nothing usable exists:**
   - Rapier in vanilla TS with a character controller and fixed timestep. `dimforge/rapier.js` is archived; the code moved to `dimforge/rapier/typescript` [V].
   - Postprocessing with the pmndrs `postprocessing` library, and toon/pixel looks on r186.
   - Tone.js 15 music. Both existing Tone.js skills use the deprecated `Tone.Transport` [V].
   - ZzFX/jsfxr SFX.
   - A headless Blender → GLB → gltf-transform pipeline.
   - Racer genre, multiplayer-ready rules, achievements, and web-game accessibility.

## 2. Mapping onto the planned skills

| Skill | Verdict | Main sources |
|---|---|---|
| `gm-core` (router) | Write, borrowing heavily | PixiJS router pattern, majid director's "Scope" rules (without its turn-ending and delegation directives), godogen "only what the model can't infer", the `develop-web-game` hand-off note |
| `gm-assets` | Adapt | awesome-gamedev `create-game-assets` (manifest, provenance, gates); godogen's in-game size column in the asset manifest; majid asset-failure classification. Our three-tier rules (B11) on top |
| `gm-kitbash-3d` | Borrow, write | majid authoring recipes and technical-art budgets; CloudAI `threejs-geometry` (instancing, merging); Blender MCP's CC0 source list |
| `gm-props-procedural` | Adapt | awesome-gamedev `procedural-gen`; majid procedural recipes; anthropic `algorithmic-art` seeded parameters |
| `gm-sprites-2d` | Borrow, write | Phaser `sprites-and-images`, `animations`, `render-textures`; awesome-gamedev `raster-pipeline` |
| `gm-vfx` | Adapt | awesome-gamedev `game-feel`; majid `game-feel.md` (TS screen shake, hitstop, squash); Phaser `particles` and `filters-and-postfx`; CloudAI postprocessing and shaders; webgpu-claude-skill (link and paraphrase only: no license) |
| `gm-audio` | Adapt, plus write the ZzFX part | awesome-gamedev `audio-design`; majid Web Audio manager pattern; ui-sound-design-skill's plain-words-to-settings mapping (MIT, 43 stars) |
| `gm-music-compose` | Write | Ideas only: awesome-gamedev `adaptive-music` |
| `gm-dialogue-narration` | Adapt | awesome-gamedev `dialogue-systems` (ink and Yarn references) |
| `gm-genre-platformer` | Adapt (close to direct) | awesome-gamedev `platformer` plus its feel-tuning table; `phaser-arcade-physics` |
| `gm-genre-topdown` | Borrow | awesome-gamedev `phaser-arcade-physics` (top-down controller), camera and AI skills |
| `gm-genre-rpg` | Adapt | awesome-gamedev `rpg`, dialogue and save skills |
| `gm-genre-puzzle` | Adapt | awesome-gamedev `puzzle` and `level-design` |
| `gm-genre-racer` | Write | majid Rapier vehicle notes (ideas only) |
| `gm-ui-hud` | Adapt | awesome-gamedev `game-ui-ux`; anthropic `frontend-design` (Apache-2.0); game-studio HUD budgets (at most 20–25% of the screen covered, center kept clear); majid HUD state checks |
| `gm-input` | Adapt, plus touch and gamepad | awesome-gamedev `input-systems`; Phaser input skill; game-studio's single action map; majid "input intents" |
| `gm-saves-achievements` | Adapt saves, write achievements | awesome-gamedev `save-systems` (with migrations) |
| `gm-editor-tuning` | Borrow, write | majid lil-gui live tuning; awesome-gamedev "tune by outcome" knob tables; CCGS tunables-as-data |
| `gm-verify` | Adapt (spine) | See §1.4 |
| `gm-repair` | Borrow, write | majid debug playbook; CloudAI "Common Mistakes" lists; Phaser `v3-to-v4-migration` as the fixer for models that write Phaser 3 code; godogen silent-failure lists |
| `gm-multiplayer-ready` (V1 rules; gameplay V2) | Write | game-creator rules (single-player still works offline, the server is authoritative): ideas only, no license |
| `gm-scope-options` | Adapt | awesome-gamedev `prototype-fast` and `game-jam`; majid scope discipline |
| `gm-pack-import` (admin) | Adapt | TerminalSkills `blender-scripting` CLI section (Apache-2.0, 179 stars, accurate for Blender 5.x, including `--python-exit-code 1`); game-studio's Blender → GLB → glTF Transform outline; CloudAI `threejs-asset-pipeline` |
| Skill evaluations (internal) | Adopt | anthropic `skill-creator` (Apache-2.0), a dev tool and not shipped to game agents |

## 3. Licensing for reuse

| Source | License | What we may do |
|---|---|---|
| Phaser official skills | MIT (repo root) [V] | Vendor, keeping the copyright notice |
| CloudAI-X threejs-skills | MIT [V] | Vendor |
| majid threejs-game-skills | MIT [V] | Fork parts, keeping the notice |
| awesome-gamedev-agent-skills | Apache-2.0 plus NOTICE [V] | Fork; carry NOTICE and a note of our changes |
| openai `develop-web-game` | Apache-2.0 [V] (deleted upstream; recovered from history) | Fork with notice |
| openai/plugins game-studio | MIT declared in `plugin.json`, but no repo LICENSE file [V] | **Confirm before copying**; borrow ideas meanwhile |
| anthropics/skills | Varies by folder. Apache-2.0: frontend-design, skill-creator, algorithmic-art, webapp-testing and others. Proprietary: docx, pdf, pptx, xlsx [V] | Use only the Apache folders |
| webgpu-claude-skill, r3f-skills, game-creator, godogen assets repo | **No license** [V] | Link to them and write our own wording; don't copy |

Every vendored or forked skill carries `license:` and `source:` (repo plus commit) in its front matter, the way the PixiJS skills do.

## 4. Things to exclude or strip

- **`phaserjs/phaser-game-agent`.** It isn't the official skills: it wires the CLI to Phaser's paid cloud service, which runs on credits [V].
- **Majid's scripts.**
  - `probe_asset_credentials.sh` sources the user's shell profiles to look for API keys [V].
  - The Tripo, Gemini and ElevenLabs generator scripts call paid APIs whenever keys are present [V].
  - The director skill tells the agent not to end turns with a summary, and to read all five production skills first (about 20k tokens) [V].
- **Anything that calls paid APIs or depends on keys** (godogen asset generation, OpenAI `imagegen`/`speech`): all provider access goes through our backend (`gm narrate`, tier 2 adapters) with spending limits.
- **godogen's hooks.** One used to push proof videos to Telegram [V]. Vendor no hooks.
- **Anything that disables the sandbox** (openai `playwright-interactive`) [V], or that tells the agent to run scripts without reading them (anthropic `webapp-testing`) [V].
- **CDN imports.** Skills that load libraries from a CDN (awesome-gamedev `threejs-scene-setup`, `algorithmic-art`) are rewritten for Vite bundling with no network access.
- **Blender MCP** (32k stars, MIT) is a dev-only tool. It needs the Blender GUI, runs arbitrary Python over a local socket with no authentication, and its opted-in telemetry may be used for AI training [V]. Never use it in sandboxes.

## 5. Packaging rules (from the PixiJS skills)

- One router (`gm-core`) with "load when…" rows, small SKILL.md files, and long material in `references/` loaded only when needed [V].
- Pin vendored sets by commit SHA in one `skills.lock` file. A refresh is a reviewed PR that re-runs the API-name checker against the pinned library versions. The checker was written during this research and kept outside the clones; it should move into the engine repo's tooling.
- Use `skill-creator` evaluations to measure whether each `gm-*` skill helps, by comparing a run with the skill against one without.

## 6. Suggested build order (research view, not a ticket plan)

1. **SDK test hooks** (`render_game_to_text`, `advanceTime`, a ready flag) plus `gm-verify` and `gm run`. Every other skill is judged through these.
2. **`gm-core` router**, plus vendoring Phaser official and CloudAI three.js at pinned commits.
3. **`gm-assets`** (B11 tiers), **`gm-genre-platformer`** (closest to a direct adapt), **`gm-ui-hud`**, **`gm-input`**.
4. **What we write from scratch:** Rapier character controller, Tone.js 15 music, ZzFX SFX, the Blender → GLB pipeline, then the remaining genres.

## 7. Open items

- Confirm openai/plugins game-studio's license (MIT declared, no LICENSE file).
- Re-check CloudAI threejs-skills after its 2026-10-19 rewrite beds in.
- Check webgpu-claude-skill's r183 claims against r184–r186 if we write our own TSL/postprocessing skill.
- Not reviewed: awesome-gamedev's repo-level `scripts/`, openai's sprite Python scripts, and Colyseus community skills.
