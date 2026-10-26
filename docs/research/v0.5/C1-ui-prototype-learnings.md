# C1: Prototyping the home screen and dungeon editor from scratch

- **Source requirement:** Kevin, 2026-10-26. Build throwaway prototypes of (1) an animated home screen in the app's paper style and (2) a dungeon editor with a basic play loop, using our downloaded packs and the skills chosen in B14. Then report what was easy, hard, slow and could be optimized. **The write-up is the deliverable, not the code.**
- **Live prototype:** https://ogm-proto-b068a4ea.netlify.app (unlisted, `noindex`). Code: `prototypes/ui-v0/` (assets gitignored).
- **Readable version (artifact):** https://claude.ai/artifact/ErRVsiBGNLY2ikLjuzpjUi
- **Builds on:** B11 (pack library, `gm` CLI), B12 (asset sources and licensing), B14 (agent skills), B15 (pattern cards, sameness), the local library layout in `docs/reference/local-asset-library.md`.
- **Evidence labels:** **[M]** measured in this session; **[O]** observed while building; **[I]** inferred.
- **Not legal advice.**

> **Version scope (2026-10-26):** everything here informs V1 (adult creators). Nothing in the prototype is V1 code; it was built to learn where the agent loop, the asset pipeline and the SDK will hurt.

## 1. TL;DR

- **A single agent session built both scenes in about 70 minutes of wall-clock time [M]:** the home screen, the editor, play mode, phone layout, Netlify deploy and live verification. That was on top of about 35 minutes of asset intake, which was a one-time cost. Code size was small: about 1,260 lines across 4 JS files plus CSS, with no build step [M].
- **The asset pipeline was the hardest part, not the game code.** Synty's modular Sidekick goblins arrive as about 33 FBX parts each, at centimetre scale, with extra bones that aren't in the shared skeleton and no death or hit animations. Making them usable needed a bake step: headless Chromium plus three.js, merging them into one 4 MB GLB per goblin [M]. That bake is exactly what B11's `gm packs import` has to do automatically.
- **Testing was the slowest part.** Headless WebGL renders with a software renderer (SwiftShader) at about 1–2 fps on this machine [M]. Every real-time test step took 10–30 s, and screenshots timed out during heavy transitions. The fix was a **deterministic `tick(seconds)` hook** that steps the game without rendering. After that, the full loop test passed on desktop and phone emulation with zero errors [M]. **Recommendation: make `tick()` part of the SDK contract and build `gm-verify` on it.**
- **Kenney assets were almost free to use.** Mini Dungeon models are 1 unit per tile, already GLB, share one texture, and include ready-made animations: the chest's `open`, and the hero's `attack-melee-right` and `die` [M]. Everything Kenney dropped in without any conversion.
- **Mixing packs shows.** The Synty goblins (realistic proportions) next to the chunky Kenney hero look like two different games [O]. **Recommendation: one style family per game.** `gm-core` should enforce it, and `gm assets search` should facet by style (B11 §4.7 already has `--style`).
- **The skills from B14 paid off where they were specific.**
  - threejs-skills prevented two classic bugs (cloning skinned models, PointLight units and shadow cost).
  - awesome-gamedev `game-feel` gave the hit-feedback recipe used as-is.
  - design-to-motion gave the intro timings.
  - Generic UI skills added little.
- **Licensing flag:** the live URL serves Synty-derived GLBs (the three goblins) to anyone who has the link. B11's own policy refuses personal-license assets in public places. **Recommendation: treat this deploy as a short-lived review link, and take it down or put it behind a password after Kevin has looked.** Public demos should use CC0 only.

## 2. What was built

| Scene | What works |
|---|---|
| **Home** | Five stacked paper-cut SVG layers: sun, clouds, mountains, pine hills, round-tree hills, grass and flowers. Wind gusts travel left to right through trees, grass and flowers. Leaves blow off during gusts, clouds drift, and the layers have mouse parallax. The intro starts from an empty page (layers rise and come into focus); then the logo bobs, the stars glint, and the Start button pulses with a sheen. Kenney "Farm Frolics" music starts on the first tap. Start drops the layers away, wipes a paper sheet up, and lands in the editor on the same page. |
| **Editor** | Layout follows Kevin's mockup: top bar (title, undo, redo, sound, Try it!), category rail (Walls, Monsters, Treasure, Decor), 3D view, inspector, and an item tray with thumbnails rendered from the 3D models at load. You can paint walls, floor or holes; place, drag-move, turn, copy and remove objects; set goblin strength (Easy/Medium/Tough), chest coins and flame colour; undo and redo; and reset. Edits persist in `localStorage`. Torches flicker with embers; the fire crackle is synthesized and water drips play in the background. A selected chest opens and a selected goblin taunts. |
| **Play** | Try it! hides the editor panels. You control the Kenney hero, sword in hand, with WASD/arrows or an on-screen joystick and sword button on touch. Goblins chase and swing: a short red tint warns before each hit, and damage is applied mid-swing. Sword hits give white flash, knockback, hit-stop, screen shake, "-1"/"Bonk!" numbers and pitch-varied impact sounds. Goblins topple and drop coins. Coins and potions can be picked up; E or a tap opens the chest. Hearts, goblins-left and coins show on the HUD. "Dungeon cleared!" or "You got bonked!" offers Play again or Back to editing. Stop returns to the editor with every edit intact, since play never writes to the map. |
| **Phone** | A single-column layout: the rail becomes a tab row, the inspector becomes a bottom sheet, and play shows touch controls. Verified in iPhone 13 emulation against the live URL [M]. |

## 3. Timeline (wall-clock, one agent session)

| Phase | Time | What happened |
|---|---|---|
| Asset intake (one-time) | ~35 min | 12 Synty packs and Kenney All-in-1 (265 packs) organized into `assets-local/`. **10 min lost** because unpacking a `.unitypackage` by seeking around inside its gzip stream never finished; extracting it in one pass took 28 s for all packs [M]. Nested zips in Kenney's Archive folder needed a second pass. |
| Survey + goblin bake | ~11 min | Found that Sidekick characters are part lists (`.sk` YAML plus about 33 FBX parts). Wrote the bake page: 10 MB of FBX became one 4 MB GLB in about 5 s per goblin [M]. Blender isn't installed, so the bake ran in headless Chromium. |
| Home screen | ~14 min | Built in one pass. A CSS specificity bug kept every layer invisible; finding it cost one round trip. |
| Dungeon module, first draft | ~3 min | About 780 lines in one write. The editor rendered correctly on the first run. |
| Debug + loop test | ~24 min | Most of this was waiting on 1–2 fps headless WebGL. Real fixes: walls hid the action (cutaway walls), the play camera was too far out, and the sword attachment took **4 iterations** (hidden in the arm → pointing at the camera → behind the stairs → right). |
| Phone + deploy + live check | ~17 min | Phone layout fixes (title, rail overflow, hint wrapping). The Netlify deploy itself took 15 s [M]. Then the full loop test ran against the live URL. |

Scope changed four times while the work was in progress: add a URL; make the home screen 2D paper layers with music; implement a real play loop; use the research skills. That cost little because nothing had been built in the old direction yet [O].

## 4. What was easy

- **Kenney anything** [M]. GLB format, 1 unit per tile, one shared `colormap.png`, consistent naming, built-in animations. Placing a full room took only data (a 12×9 string grid).
- **The 2D paper look** [O]. Each shape is drawn twice: a darker copy offset a few pixels down reads as cut-paper shadow. One static noise tile multiplied over the page gives paper grain. No image assets were needed beyond Kevin's logo and background. The page held about 45 fps even in software rendering [M].
- **Wind** [O]. One clock: base sway plus a gust curve that moves across x. Applied to about 60 tree and grass groups, it is cheap and reads clearly.
- **Game feel from the skill** [O]. Copying the `game-feel` tiers (trauma shake that decays, short hit-stop, flash, knockback, number pop, varied pitch) made combat read well on the first try.
- **Netlify** [M]. CLI already logged in; one command to create the site, 15 s to deploy, headers set with `_headers`.
- **Single-page structure** [O]. Keeping the home screen and editor in one document made the Start transition and the music hand-off trivial.

## 5. What was hard

| Problem | Why it was hard | What fixed it | Lesson for the platform |
|---|---|---|---|
| **Synty Sidekick goblins** | No complete character files: about 33 FBX parts per goblin; centimetre scale (2 m tall against a 1-unit tile); hair, ear and accessory parts carry extra bones that aren't in the shared skeleton; the colour comes from a separate 32×32 palette texture | A bake page that rebinds every part to one skeleton by bone name, attaches extra bones to their nearest parent, merges into one mesh, and exports a GLB with five clips | `gm packs import` needs a **Sidekick (modular rig) adapter**. Without it, agents can't use these packs at all |
| **Missing animations** | The locomotion pack has idle, walk and run but no attack, hit or death | Reused a "swipe" idle fidget as the attack (played at 2.2×). Death is a scripted topple and fade | The catalog must list clips per rig, and agents need a "no death clip" fallback pattern card |
| **Attachment points** | Nothing says where a hand is. The arm bone points along its own −x axis, which only shows up by measuring skin weights | Measured it, then 4 visual iterations | The importer should **compute and store sockets** (hand_r, hand_l, head, back) per rig, and `gm assets info` should return them |
| **Iso camera vs tall walls** | Kenney walls are 1.1 units tall and hide everything behind them | Cutaway: walls between the camera and the floor are scaled to 28% height | Make this a **pattern card**: iso camera + cutaway walls |
| **Light count** | Changing the number of lights in three.js recompiles every material. A light per torch would stutter whenever a torch is placed | A fixed pool of 6 point lights borrowed by the nearest torches; no point-light shadows (each one renders 6 times over) | Pattern card: torch light pool. threejs-skills documents both pitfalls |
| **Flat logo** | The logo's three rows touch at their outlines, so it can't be cut into separately animated words | It animates as one piece, with sparkle overlays on the stars | Ask for **layered or SVG source art** for anything that will move |

## 6. What was slow

| Time sink | Cost | Fix |
|---|---|---|
| Headless WebGL at 1–2 fps (SwiftShader) | Each e2e step took 10–30 s; a full run was 3–6 min; screenshots during transitions time out | A `tick(sec)` hook that steps the game deterministically and renders once. Real-time waits only for UI transitions |
| `.unitypackage` extraction by seeking inside gzip | 10 min stall | Extract the tar in one pass, then rebuild paths. The importer needs this |
| Phone emulation load | Editor ready about 90–180 s after Start under SwiftShader | Mostly software rendering; on a real phone it's network plus parse. Still, cut the download (§7) |
| Sword attachment by eye | 4 render round trips | Socket metadata from the importer |
| Rejected push (another machine updated `research`) | 1 round trip | `git pull --rebase` before pushing in multi-machine work |

## 7. What could be optimized

**Page weight (live site)** [M]: about 18 MB on first load.

| Group | Size | Optimization |
|---|---|---|
| Models (41 files) | 13.1 MB, of which the three goblins are 12.6 MB (54k vertices each, uncompressed) | gltf-transform: meshopt or Draco plus quantization (likely 4–6× smaller [I]); decimate the goblins (they show at under 80 px tall); load goblins only when one is placed |
| Images (logo + paper background) | 3.9 MB as two 1672 px PNGs | WebP or AVIF at about 300 KB [I]; serve the logo as SVG once the source exists |
| Audio (27 files) | 0.9 MB | Fine. Load the music loops after first paint |
| three.js from CDN | 0.29 MB | Fine for a prototype; vendor and tree-shake in the engine |
| Code | 27 KB | — |

**Agent loop:**
- `gm-verify` should get the e2e pattern for free. The SDK exposes `__game.tick(sec)`, `__game.state` and a world-to-screen helper; the harness clicks through editor → play → result → editor and screenshots each step.
- The importer should normalize units (metres or tiles), clip names (`idle`, `walk`, `run`, `attack`, `hit`, `die`), sockets and a style tag. Then the agent writes game code, not asset glue.
- Thumbnails: render them in the importer. Rendering them in the browser at load cost about 1 s here [O]; at catalog scale that has to be precomputed (B11 §4.2 step 5).

## 8. How the B14 skills performed

| Skill | Used for | Verdict |
|---|---|---|
| **threejs-skills** (CloudAI-X @ `0e18186`) | `SkeletonUtils.clone` per goblin; PointLight units in candela; PointLight shadow cost; `uncacheRoot` | **High value.** Its "Common Mistakes" lists matched real traps. Adopt as planned |
| **awesome-gamedev `game-feel`** (@ `184b72b`) | Trauma shake, hit-stop, feedback tiers | **High value.** Examples are GDScript but the ideas carried over directly |
| **awesome-gamedev `audio-design`** | Buses, pitch variation, crossfades | **Medium.** Right ideas; the Web Audio translation was ours |
| **awesome-gamedev `game-ui-ux`** | Safe area, event-driven HUD | **Low.** Generic; nothing specific to web or touch |
| **design-to-motion** (elayadesign @ `a2735a3`) | Intro choreography, start from empty, durations and easing curves | **Medium.** Good motion values. Its Figma, PSNR and MP4/GIF export parts don't apply to a live app |
| **landing-page-design** | Not used | Its description claims "ANY web UI", which would steer game UI towards landing-page rules. **Keep it out of the agent's skill set.** |

## 9. Recommendations for the `gm` CLI and `gm-*` skills

| # | Recommendation | Where |
|---|---|---|
| 1 | Make `tick(sec)` plus a state snapshot part of the SDK; build `gm-verify` e2e on it | SDK, `gm-verify` |
| 2 | Add a modular-rig adapter (Synty Sidekick) to `gm packs import`: assemble the part list → one GLB, attach extra bones, use the palette texture | `gm-pack-import` |
| 3 | The importer normalizes scale, clip names, sockets and style tags, and records missing clips | `gm-pack-import`, catalog schema |
| 4 | One style family per game; `--style` facet; a sameness rule in `gm-core` | `gm-core`, `gm assets` |
| 5 | Pattern cards: iso camera + cutaway walls; torch light pool; hit-feedback tiers; editor/play snapshot (play never mutates the map); no-death-clip fallback | B15 pattern cards |
| 6 | Compress at import time (meshopt/Draco, KTX2/WebP); load lazily | `gm-pack-import`, SDK loader |
| 7 | Web Audio module in the SDK: unlock on first gesture, buses, pitch-varied one-shots, procedural crackle and noise beds for sounds packs lack | SDK, `gm-audio` |
| 8 | Ask creators for layered or SVG art when they want it animated | `gm-scope-options` |

## 10. Decisions for Kevin (recommendation first)

1. **Synty files on the public preview URL.** Recommended: keep the link for your review, then take the site down or put it behind a password. Alternative: swap the goblins for Kenney's CC0 `character-orc` and keep the link up.
2. **One style family per game.** Recommended: yes, as a `gm-core` rule (the Synty-plus-Kenney mix looks off). Alternative: allow mixing, with a warning.
3. **Paper style for app chrome.** Recommended: keep it. It was cheap to build, fast, and matches your logo.
4. **`tick()` in the SDK contract.** Recommended: yes. Without it, automated verification of 3D games in headless browsers is too slow to be useful.

## Appendix: measurements

- Goblin bake: 31–33 parts, 10.2–10.9 MB FBX → 4.0–4.5 MB GLB, 54k vertices, about 5 s each in headless Chromium [M].
- Home screen: 602 SVG nodes, about 45 fps in software rendering at 1440×900 [M].
- e2e (desktop, live URL): place goblin, paint and undo a wall, select chest, play, kill 3 goblins (hero took 2 damage), "Dungeon cleared!", back to editor with 3 goblins in the map. 0 page errors [M].
- Code: `audio.js` 86, `home.js` 177, `main.js` 49, `dungeon.js` 781 lines; `style.css` 166 lines [M].
