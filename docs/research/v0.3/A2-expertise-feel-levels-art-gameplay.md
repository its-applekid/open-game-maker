# A2 — Expertise spike: gameplay design (S04), game feel (S06), level design & balancing (S07), art direction (S08)

**Spec requirements:** v0.3 §11.2 (S04, S06, S07, S08 priority), §5.3 (art options and difficulty calibration), §5.6 (agent-defined editor and tunables manifest), §7.1 (dynamic specialists), §7.2 (delivery contract), §7.3 (playtest/QA).
**Access date for all sources:** 2026-10-21. **Out of scope:** Donchitos/Claude-Code-Game-Studios, which another agent is mining.
**Status labels:** *Verified* means checked this session through `gh api`, a clone, or a fetch. *Recalled* means taken from well-known canonical material that I did not re-fetch. *Proposal* means my recommendation.

> **Version scope (2026-10-25):** The S04/S06/S07/S08 skills, tunables manifest, rubrics and art calibration are **V1**. Editable voxel worlds and any paid asset tiers are later (V2 at the earliest). Children in evaluations and play sessions are **V3**, tagged inline.
> The kid-first framing is superseded: V1 is for adult creators (18+). The `kid` knob tier and "kid" presets are renamed `basic`/"beginner"; a kid-friendly presentation is a V3 parental-controls setting (B10).
> Superseded in part: skill sourcing by **B14** (awesome-gamedev adapted, Phaser official and CloudAI three.js adopted); art and asset sources and licensing (incl. §6–§7) by **B5**, **B11** and **B12**; the knob/editor contract by **B7**.
> Canonical scope: `docs/spec/release-plan.md`.

---

## 1. Bottom line

1. **Only one established skill pack covers these four areas: `gamedev-skills/awesome-gamedev-agent-skills`.** It is Apache-2.0, has 2,600★, was last pushed 2026-10-09, and was read at commit `0a70cfc`. Its `game-feel`, `level-design`, `platformer`, `puzzle`, and `create-game-assets` skills are good-quality, engine-neutral craft writing. The code examples are Godot/Unity, and the skills say nothing about children, touch input, or an editor contract. **Recommendation: adapt, don't install.** Fork the ideas into our own skills (with Apache NOTICE attribution), rewrite the examples for TypeScript, Phaser 4, and Three.js, and bind them to the Engine SDK.
2. **No ≥1k★ skill exists for gameplay design, level design, pixel art, or PS1/toon styling as its own topic.** GitHub search found only repos with 0–5★ (for example, Schell-lens repos and `ronniebasak/game-feel-skill` at 1★). These are rule exceptions, so treat them as **reading material at most**.
3. **The biggest gains come from building, not finding.** We need four custom skills:
   - `gm-feel` (tunables plus juice bound to SDK events),
   - `gm-level` (metrics, beats, and a reachability/soft-lock validator contract),
   - `gm-art-style` (one style-preset card per art option and an asset-family lock),
   - `gm-design-brief` (core loop, verbs, and a beginner-fit design checklist).
   Each should be 1.5–3k tokens and loaded per job, never all together.
4. **Most feel and balance quality can be enforced deterministically in the SDK, not through prompts.** Jump knobs in designer units (tiles, seconds) feed Pittman-derived physics. A reachability check re-runs whenever a knob moves. Juice tiers fire from standard events, with one platform-wide "reduce motion" multiplier. This follows §3.2 (deterministic work before agent work).
5. **Art-difficulty calibration (§5.3):** most labels hold. Three changes:
   - Split **32-bit** into two cards: a 2D GBA-style option, which is basically "16-bit+", and **PS1 3D**, which is Medium. The cost of PS1 is 3D camera and controls, not the shader.
   - **Voxel** should be Medium for a voxel look and Hard for a Minecraft-like editable world.
   - **Clay** stays Hard. Present it as "clay-ish".
6. **Correction to the prior catalog:** it says Quaternius is CC0. Quaternius pack pages state CC0, but `quaternius.com/license.html` currently shows a **custom royalty-free license** that forbids standalone redistribution. Licensing therefore has to be checked per pack (see §7).

---

## 2. Established skills reviewed (content read, not just counted)

| Repo (verified 2026-10-21) | ★ / last push / license / commit | What I read | Quality judgment | Recommendation |
|---|---|---|---|---|
| `gamedev-skills/awesome-gamedev-agent-skills` | 2,600 / 2026-10-09 / Apache-2.0 / `0a70cfc`; 109 commits, mostly one author | `router`, `disciplines/game-feel` (+`feedback-recipes.md`), `level-design` (+`pacing-and-flow.md`), `create-game-assets` (+`art-direction.md`, brief, manifest), `genres/platformer`, `genres/puzzle`; checked `phaser-core` targets **Phaser 4.2**, three.js skills target **r186** | **Good.** Correct and specific: trauma² shake on a camera offset, hit-stop that uses real-time timers, importance tiers, metric-driven gap sizing (`SAFE_GAP = 0.7×max`), beat-intensity tables, and a key/ability flood fill for soft-locks. The art skill's "describe a system, not a mood word" and "evaluate at three distances" ideas are excellent. **Gaps:** examples are GDScript/C#; nothing on children, touch, or low reading; no evals (`tests/` only validates skill structure); genre coverage is missing adventure, "battle", and strategy beyond tower defense; the router falls back to **Godot**, which is wrong for us. The jump math uses height + time-to-apex only, not Pittman's height + horizontal distance form, which suits tile levels better. | **Adapt** the 5 skills above into `gm-*` skills; keep `phaser-*` and `threejs-*` for S01/engine work. Don't load the router. |
| `CloudAI-X/threejs-skills` | 3,671 / 2026-10-19 / MIT / `0e18186` | grepped all 13 skills | Strong API currency (r186; verified latest three.js release is `r186`). Covers `MeshToonMaterial` + gradientMap with NearestFilter, `OutlinePass`, `RenderPixelatedPass`. **No PS1 vertex-snap/affine material** and no voxel meshing. About 38k words total (≈51k tokens), so it's far too big to load whole. | **Reuse selectively:** `threejs-materials` and `threejs-postprocessing` sections for cel and pixel styles. |
| `anthropics/skills` | 182,793 / 2026-10-09 / per-skill Apache-2.0 (`LICENSE.txt` in each) / `dbd4588` | `frontend-design` head, file sizes for `canvas-design`, `algorithmic-art`, `theme-factory` | `frontend-design` has excellent anti-generic-taste guidance, but for web UI, so it belongs to S02, not game art. `algorithmic-art` (p5.js) is about generative art, not game asset families. | Not an S08 source. Hand off to the S02 agent. |
| `freshtechbro/claudedesignskills` | 1,109 / **2025-11-20 (stale)** / MIT / `1da73fe` | listed skills | Marketing and web-motion content (GSAP, Locomotive, Barba, Spline). Nothing on game feel or game art. | **Reject** for these areas. |
| `dgreenheck/webgpu-claude-skill` | 1,255 / 2026-04-10 / **no license file detected by API** | metadata only | TSL/WebGPU. Possibly useful later for toon water and outlines. | Defer. License is unclear, so don't vendor it. |
| Low-star exceptions (`ronniebasak/game-feel-skill` 1★, `EthanM2025/game-design-lenses` 5★, `threeaus/schell-game-design` 3★) | — | not read | Below the ≥1k bar. Schell-lens repos may reproduce copyrighted lens text. | Do not adopt. |
| Tooling adjacent to S08 | `aseprite/aseprite` 40k★ (EULA, source-available); `diivi/aseprite-mcp` 728★ MIT; `lferreira457/threejs-psx-shader` 66★ MIT | metadata only | aseprite-mcp is below the bar and Aseprite is a paid desktop app. The PSX shader is tiny and low-star. | Don't depend on these. Write our own ~100-line PS1 preset (§6). |

**Takeaway:** popularity and quality line up for awesome-gamedev-agent-skills, but its popularity says nothing about *our* audience. We should judge its value with the A/B protocol in §8 before claiming it improves output.

---

## 3. Transferable expertise from canonical sources

| Source | Status | What transfers into our skills |
|---|---|---|
| **Celeste `Source/Player/Player.cs`** (NoelFB/Celeste, MIT code, 3,999★, commit `1b0ce45`) | Verified constants | Units are px at 320×180, 8-px tiles. `MaxRun 90`, `RunAccel 1000`, `RunReduce 400`, `AirMult 0.65`, `Gravity 900`, `MaxFall 160` (fast-fall 240), `HalfGravThreshold 40` (half gravity near the apex), `JumpSpeed -105`, `JumpHBoost 40`, `VarJumpTime 0.2` (vertical speed is held while the button is held), `JumpGraceTime 0.1` (coyote time), `DashSpeed 240`, `DashTime 0.15`, `WallJumpForceTime 0.16`. The buffer duration is in `Input.cs`, which isn't published, so it's unverified. **Use: an "expert precise" preset**, translated to tiles/second. The MIT license covers the code only; Celeste's art, names, and levels are off-limits. |
| **Kyle Pittman, "Math for Game Programmers: Building a Better Jump", GDC 2016** (gdcvault.com/play/1023148) | Verified listing; formulas recalled | Derive physics from design inputs: `g = 2h·vx²/xh²`, `v0 = 2h·vx/xh` (h = peak height, xh = horizontal distance to the peak, vx = run speed). Use a separate, heavier falling gravity, and handle variable height by raising gravity when the button is released. **This is the core of the tunables manifest:** knobs in tiles, physics derived by the SDK. |
| **Jan Willem Nijman, "The Art of Screenshake"** (INDIGO 2013) | Recalled | A list of cheap feedback layers: bigger and faster projectiles, muzzle flash, hit flash, enemy knockback, player recoil, **sleep/hit-stop**, screen shake, permanence (debris and corpses stay), camera lerp and look-ahead, more enemies with fewer HP, sound layers. It maps onto the juice-tier presets. |
| **Steve Swink, *Game Feel* (2008)** | Recalled | Defines feel as real-time control + simulated space + polish. Metrics: response latency (felt as instant below ~100 ms), input→response mappings, and context (the space gives the movement meaning). **Use: the S06 rubric axes** and "test feel in a context room, not empty space". |
| **Hayashida / Nintendo, kishōtenketsu (Super Mario 3D Land)** | Secondary coverage verified; the original Gamasutra text was not retrieved | One gimmick per level: **introduce safely → develop → twist → final test**, then retire it. This is the template for `gm-level` beats, and short levels suit it well. |
| **MDA** (Hunicke, LeBlanc, Zubek 2004) and **Koster, *Theory of Fun*** | Recalled | MDA chain: design mechanics → dynamics → target aesthetics (the 8 kinds of fun). Koster: fun = mastering patterns, so boredom means the pattern was solved or never seen. **Use:** in the design brief, name the target aesthetic first, then the mechanics. |
| **Schell, *The Art of Game Design* lenses** | Recalled; **copyrighted** | Paraphrase the *question style* only (for example: "what does the player do every 10 seconds?"). Don't copy the lens text or the deck into skills. |
| **GMTK (Mark Brown)** | Recalled | Episode-level heuristics: "teach without text", "how to make a good boss", coyote time, and similar. Useful as agent reading suggestions. Video transcripts are copyrighted, so cite them rather than embed them. |
| **Lospec palettes** | Verified: e.g. `/palette-list/nintendo-entertainment-system.json` returns `{name, author, colors[55]}`; no license statement on the palette or API | Palette lock per game. Ship a vendored, curated set of ~20 palettes with hand-checked provenance rather than calling Lospec at runtime (ToS unverified). |

---

## 4. What must become custom skills (Proposal)

These skills are short and load per job. Each one tells the agent to *emit SDK declarations*, not prose.

| Skill | Loaded for | Contents | Est. tokens |
|---|---|---|---|
| `gm-design-brief` (S04) | Narrowing (§5.4) and the new-game mechanics specialist | Brief schema: target aesthetic (MDA) → ≤3 core verbs → 10-second loop / 1-minute loop / session loop → success and fail signals visible without reading → challenge source → progression/rewards → "what you like about [reference]" → mechanic translation (no IP). A beginner-fit checklist: cheap failure, generous checkpoints, sessions under 5 minutes, one new idea at a time, no reading needed to understand state. A 1-page **genre card** for each of RPG, platformer, adventure, craft, puzzle, battle, strategy, roguelike (core loop, must-have systems, 3 canonical references, 3 classic failure modes), adapted from awesome-gamedev genre skills and expanded for the missing genres. | ~2.0k base + ~0.4k per genre card loaded |
| `gm-feel` (S06) | Any feature touching movement, combat, pickups, or camera | SDK `feel` presets (beginner / standard / expert-Celeste) per controller type; Pittman derivation (SDK-owned, so the agent only picks design units); juice tiers (small/medium/large) bound to SDK events `onLand/onHit/onPickup/onDeath`; rules from the adapted game-feel skill (shake the camera not the body, real-time hit-stop, ease everything, return to rest); touch-specific rules (bigger buffers, auto-run options, on-screen control sizing handed to S09); the manifest entries the agent must declare. | ~2.5k |
| `gm-level` (S07) | New level, level edit, difficulty change, balance review | Metrics come from the feel manifest (no hand-typed gap sizes); kishōtenketsu beat table; tension/rest sawtooth; key/ability gating graph; required SDK validators (`reachability`, `softlock`, `solvable` for puzzles); balance knobs and a "difficulty" macro; beginner defaults (no blind jumps, telegraphed one-way drops, death → respawn in under 2 s). | ~2.5k |
| `gm-art-style` (S08) | Art-direction specialist; any asset add/replace | A one-page **style card** per §5.3 option: palette lock, resolution/filtering, renderer preset ID, approved asset families, forbidden mixes, animation timing (e.g., clay animates on twos at 12 fps), outline rules, silhouette checks. Workflow adapted from `create-game-assets`: lock the frame → approve a hero target → produce families → normalize deterministically → validate at three distances → record provenance. | ~1.2k base + ~0.5k per style card |
| `gm-editor-api` (shared with S11/S01) | Every implementing agent | The manifest contract below. Owned by the S11/S01 agent; this report only defines the feel/balance entries. | — |

### 4.1 Tunables manifest: which feel and balance params become knobs

Principles:
- Knobs use **designer units** (tiles, seconds, "×").
- **Derived physics is computed by the SDK.**
- Every knob declares the **invariants it can break**, so the SDK re-runs validators after an edit.
- Each knob gets an **audience tier**: `basic` (visible by default) or `advanced` (behind "more"), per §5.6 "not every internal variable".

```ts
// Proposal — shape only; final schema belongs to the editor-contract owner.
{ id: "player.jump.height", label: "Jump height", icon: "arrow-up", type: "slider",
  unit: "tiles", min: 1, max: 8, step: 0.5, default: 3.5, tier: "basic", group: "feel",
  derives: ["physics.gravityUp", "physics.jumpVelocity"],   // SDK applies Pittman
  invalidates: ["level.reachability"] }                      // SDK re-validates; editor warns/blocks
```

| Genre/system | `basic` knobs | `advanced` knobs |
|---|---|---|
| Platformer | Jump height (tiles), Run speed, "Floaty ↔ Snappy" (time-to-apex + fall multiplier), Extra jumps (0–2), "Forgiving ↔ Tricky" (macro: coyote 0.06–0.2 s, buffer 0.08–0.2 s, checkpoint spacing) | Jump distance-to-peak, fall gravity ×, max fall speed, ground/air accel time, air control ×, variable-jump cut, apex half-gravity, dash speed/time, corner-correction px |
| Top-down / adventure | Walk speed, "Slippery" (accel/decel time), Dash on/off | Diagonal normalization, knockback distance, i-frames |
| Camera | "Camera follow" (lag), Zoom | Deadzone, look-ahead, bounds clamp, shake max |
| Juice | Shake (0–1), "Bounciness" (squash amount), Particles (few/lots) | Per-tier hit-stop ms, flash duration, easing choice |
| Balance | Hearts/lives, Enemy count, Enemy speed ×, Difficulty (macro), Time limit on/off, Item frequency | Damage table, spawn rates per beat, enemy HP, score values, drop tables |
| Level | Placement tool (tiles/objects), Checkpoint placement | Beat-intensity table, gate/key graph |

**Platform-level, not per game:** "Reduce motion/flashing", which multiplies shake, flash, and hit-stop. It belongs to S09 accessibility and the SDK owns it.
**Beginner preset starting values (Proposal, to be playtested):** jump 3 tiles, coyote 0.15 s, buffer 0.15 s, run speed about 60% of Celeste's, hurtbox 70% of the sprite, pickup radius 130%.

---

## 5. Quality rubrics (0–2 per item; a gate needs every "must" item at 2)

**S04 Gameplay design**
- (must) Core verbs ≤3 and understandable within 30 s without text.
- (must) Success and failure visible on screen.
- At least one meaningful choice per minute (route, risk, resource, timing).
- Challenge escalates by combining verbs, not only by speed or HP.
- Reward loop fires within 30 s and then at least every 2 minutes.
- The reference takeaway is visibly implemented and no IP is copied.
- Session completes in under 5 min with a "one more go" hook.
- Genre card must-have systems are present.

**S06 Game feel**
- (must) Input→visible response in ≤2 frames at 60 fps (measured through the debug adapter).
- (must) Coyote time and buffer are present and set to preset values.
- (must) No juice blocks input, and all juice returns to rest.
- Juice tiers are proportional (a footstep is not a boss death).
- Fall gravity is greater than rise gravity unless the design says otherwise.
- The camera never hides the next hazard.
- Reduce-motion is honored.
- Feel holds on the touch profile.

**S07 Level/balancing**
- (must) The critical path is reachable under the current knobs.
- (must) No soft-lock, and puzzles are solvable.
- (must) Every hazard is introduced safely before it's tested.
- Beat curve is a sawtooth (no flat-high stretch longer than 2 beats).
- Landmarks or lighting guide the path.
- Death→retry takes ≤2 s.
- Difficulty macro is monotonic across its range.
- A scripted bot completes on "beginner".

**S08 Art direction**
- (must) Single palette and asset family, or approved mixes only.
- (must) Player, hazards, and pickups are distinguishable in grayscale at native scale.
- (must) Provenance recorded for every asset.
- Consistent outline, pixel density, and texel density.
- Silhouettes read at thumbnail size.
- Animation timing matches the style card.
- UI is consistent with the style but readable (S02 owns this).
- Within the performance budget on the phone profile.

**Automated vs human checks:**
- *Automated:* reachability/soft-lock/solvability validators; bot completion through `step/input`; frame-latency probe; palette conformance (quantize the screenshot, measure out-of-palette pixel %); grayscale-contrast check between the player's and the hazards' sprite regions; texel-density/pixel-scale check (fractional scaling detection); juice-event coverage (each gameplay event has a bound tier).
- *Model critique:* rubric scoring from screenshots + short capture + metrics.
- *Human:* "fun", "feels good", and style appeal. Short Kevin/adult-tester sessions (kid sessions: V3), comparing two builds side by side (§7.3).

---

## 6. §5.3 art-option calibration (evidence-based)

| Option | Rendering in our stack | Assets available (license) | Main real cost | Original → **calibrated** |
|---|---|---|---|---|
| 8-bit | Phaser 4 `pixelArt:true`, integer scale; Lospec NES palette (55 entries; verified) | Kenney pixel packs (CC0, verified site-wide) | Generated sprites drift off grid and palette, so they need a quantize/grid-snap step | Easy → **Easy** (library) / **Medium** (custom characters) |
| 16-bit | Same, plus parallax layers (trivial in Phaser) | Fewer cohesive CC0 16-bit families; Kenney skews simpler | Keeping consistency across richer generated sprites | Easy → **Easy–Medium** |
| 32-bit, GBA-style 2D | Same pipeline at 240×160 native, 15-bit color | Same as 16-bit | Hard for players to tell apart from 16-bit | Open → **Easy–Medium** ("16-bit+") |
| 32-bit, PS1 3D | Three.js r186: low-res render target + NearestFilter, vertex-snap shader, optional dither/affine approximation (~100 lines; no ≥1k web library found, so build it as an SDK style preset) | Quaternius/KayKit low-poly glTF fit well (licenses checked per pack) | **3D camera and controls**, 3D platforming feel, and depth readability for beginners. The shader is cheap. | Open → **Medium**. Not recommended as the *default* "32-bit" for beginners. |
| 64-voxel | Static scenery: InstancedMesh/merged geometry (easy). Editable world: chunking, greedy meshing, block raycast (hard). MagicaVoxel `.vox` loader in three.js examples (*recalled, unverified*). | Kenney voxel packs (CC0) | Editing and terrain systems, not visuals | Medium → **Medium** (look) / **Hard** (Minecraft-like building) |
| Cartoon | Standard/Toon materials | Kenney, KayKit, Quaternius are natively cartoon | Mixing packs breaks cohesion; lock one family per game | Easy → **Easy** |
| Paper | 2D sprites as billboards/planes in 3D, paper-grain texture, drop-shadow edge, flip/fold tweens | No dedicated CC0 paper library found (*unverified*); restyle 2D packs | Restyling and cutout animation | Medium → **Medium** |
| Clay | Noise normal maps and fingerprint detail, soft key light, animating on twos (12 fps), slight per-frame jitter | No CC0 clay library found (*unverified*); true clay needs sculpted or scanned assets | Asset authoring; the "real claymation" expectation | Hard → **Hard** (present as "clay-ish") |
| Cel-shaded | `MeshToonMaterial` + gradientMap (core); outlines through inverted hull (cheap) or `OutlinePass` (post, costly on phones) | KayKit/Quaternius fit | Mobile postprocessing cost | Easy–Medium → **Easy–Medium** (inverted hull by default) |

Every style becomes an **SDK style preset** (renderer config + palette + filter + shader) plus a `gm-art-style` card. That makes the look a deterministic, reusable platform capability, not code each agent rewrites.

---

## 7. Licensing and data questions

- **Kenney:** CC0, verified at kenney.nl/support. Attribution is optional and the Kenney logo is forbidden.
- **KayKit:** the free tiers are CC0 (verified on the Platformer pack page), with a "don't resell unmodified" request. "Extra" ($9.99+) and "Source" tiers add assets. Buying them is Kevin's call; the purchase rule applies.
- **Quaternius:** **conflict.** Pack pages (e.g., Ultimate Platformer) say CC0, while `/license.html` shows a custom royalty-free license that bars standalone redistribution and repackaging. This matters if games or forks expose raw asset files publicly (§5.13 forks, source visibility). Record the license per pack in provenance and ask Quaternius, or treat the stricter terms as binding.
- **Lospec:** no palette or API license is stated. Palettes are mostly factual color lists, but vendor a curated set with author credit and don't call the API at runtime.
- **Celeste:** MIT code only. Use the numbers and structure as reference and don't copy the file into games.
- **Skill reuse:** Apache-2.0 adaptations (awesome-gamedev, anthropics) need NOTICE and a statement of changes. MIT (threejs-skills) needs the copyright notice.
- **Copyrighted books and talks** (Schell, Swink, GMTK, Nijman): paraphrase and cite only.
- **Children's data:** none of these skills or tools sends data anywhere. Image-generation vendors for S08 are a separate eligibility review and aren't covered here.

---

## 8. Evaluation: a bounded A/B protocol (proposed; not run)

**Unit of test: micro-tasks on frozen fixture games, not whole games.** Whole games are too costly and too noisy.

1. **Fixtures:** 3 small TypeScript games on the SDK: a Phaser platformer, a Phaser top-down puzzle/adventure, and a Three.js cel-shaded arena. Each comes with a debug adapter (`seed/step/input/state`) and validators.
2. **Tasks (8):**
   - "Make jumping feel good"
   - "Add a dash"
   - "Add hit feedback to enemies"
   - "Build level 2 introducing moving platforms"
   - "Make it easier for a 5-year-old"
   - "Design a new game brief from: *dragon who bakes cakes*, likes Mario's exploring"
   - "Restyle as 8-bit"
   - "Add 3 new enemies matching the art style"
3. **Arms:**
   - A: no skill (base prompt + SDK docs)
   - B: adapted third-party skill text
   - C: our `gm-*` skill
   Same model and effort, fixed token cap per run, **3 seeds** per task × arm, so 72 runs. Each run is a bounded change of roughly 30–80k tokens. Run it on Kevin's existing subscription quota under an explicit pre-agreed cap, or first try a 2-task pilot (18 runs).
4. **Scoring:**
   - (a) Deterministic: validator pass rate, frame-latency probe, palette conformance, juice-event coverage, manifest completeness (knobs declared with tiers and invariants).
   - (b) Blind pairwise model judge on screenshot strips + 10 s capture + metrics, against the §5 rubric, with randomized order and both orderings judged.
   - (c) Human: Kevin (plus the kids: V3) plays 2 tasks blind, A vs C, and picks a favorite.
5. **Decision rule:** adopt a skill if C beats A on ≥65% of non-tie pairwise judgments, has no regression in deterministic pass rate, and adds ≤15% median tokens per *successful* task (retries included, per §8.1). If B ≈ C, keep the cheaper or shorter one.
6. **Pre-registration:** this fits Kevin's existing `aiur-experiment` workflow for hypotheses and metrics.

---

## 9. Token footprint and selective loading

Estimates use words × 1.35, measured on the cloned files.

| Source | Approx. tokens | Loading rule |
|---|---|---|
| awesome-gamedev `game-feel` / `level-design` / `platformer` / `create-game-assets` | ~1.7k / 1.4k / 1.4k / 1.4k (+ ~1–1.5k per reference file) | Not loaded directly. Adapted into `gm-*`. |
| awesome-gamedev `router` | ~2.7k | Never (wrong default engine; aiur does routing). |
| threejs-skills (all 13) | ~51k | Only the relevant section of one skill (e.g., toon/outline) for 3D style work. |
| Proposed `gm-design-brief` + 1–3 genre cards | ~2.4–3.2k | Narrowing and the mechanics specialist only. |
| `gm-feel` | ~2.5k | Movement, combat, pickups, camera features. |
| `gm-level` | ~2.5k | Level/difficulty jobs and balance review. |
| `gm-art-style` + 1 style card | ~1.7k | Art specialist and asset jobs. |

**Routing (deterministic, in aiur job config, not LLM-chosen):**
- New game: brief + feel + level + art (~9–10k tokens of skills, split across parallel specialists, so each specialist sees about 2.5k).
- "Make enemies blue": no skill and no coding agent (manifest command).
- "Add a dash": feel only.
- "New level": level only, plus the existing feel manifest values as data.
- Restyle: art only.

Skill text belongs in the cacheable prompt prefix. Caching behavior per provider still needs to be checked (§8.1).

---

## 10. Stack integration notes

- **SDK modules:** `feel` (controller presets, Pittman solver, juice tier bus, reduce-motion), `validate` (grid reachability from the jump arc, gate-graph flood fill, puzzle BFS), `style` (renderer presets: `pixel8`, `pixel16`, `gba`, `ps1`, `voxel`, `toon`, `paper`, `clay`, `cel`), and a debug adapter for bots.
- **Phaser 4:** the current release is v4.2.1 (verified). Its Arcade physics fits the platformer solver.
- **Three.js r186** for 3D presets.
- Validators run on every knob change in edit mode, which is cheap and needs no model. On failure, the editor shows "this jump can't reach the flag" instead of letting a broken level exist (§5.7).

---

## 11. Next steps

1. Draft `gm-feel` and `gm-level` first, adapting from awesome-gamedev `0a70cfc` with NOTICE. They give the most leverage and can be checked deterministically.
2. Specify the SDK `feel` solver and `validate` reachability as code-owned contracts, coordinating with the S11/S01 editor-contract owner.
3. Build the platformer fixture and run the **2-task pilot** A/B under a cap Kevin sets.
4. Prototype the `ps1` and `cel` style presets on one KayKit pack, and measure phone FPS.
5. Resolve the Quaternius license conflict per pack, and curate ~20 Lospec palettes with provenance.
6. Write the missing genre cards (adventure, battle, strategy) and add beginner-fit rules.

## 12. Decisions that belong to Kevin

1. **32-bit card:** split it into "Pocket 2D (GBA-ish)" and "PS1 3D", pick one default, or relabel all options without bit numbers (e.g., "Classic pixels", "Chunky 3D")?
2. **Clay and voxel expectations:** offer "clay-ish" with a visible "experimental" badge? Should voxel mean *look* only in MVP, with editable building later?
3. **Default-visible knob set:** is the `basic`/`advanced` split right? Should forgiveness knobs (coyote/buffer) be hidden behind "Forgiving ↔ Tricky"?
4. **Pilot evaluation budget:** the token/quota cap for the 18-run pilot, (whether the kids take part in blind side-by-side play is V3).
5. **Paid asset tiers:** may we buy KayKit "Extra" packs, or stay strictly with free CC0?
6. **Asset redistribution posture:** if forks or source views expose raw asset files, adopt the stricter Quaternius terms by default?
