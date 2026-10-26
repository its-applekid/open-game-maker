# C2: V1 scope additions from the prototype review (2026-10-26)

> **Version scope:** all three items are **V1** (Kevin, 2026-10-26: "Include all of these in our scoping as part of V1"). This note exists so they become tickets when tickets are made. It is not a ticket list or a build order.

Evidence tags: [M] measured in this repo, [V] verified in source, [I] inferred, [O] opinion.

## Summary

| # | Addition | Kevin's direction | Recommendation |
|---|---|---|---|
| 1 | **Build analytics for admins** | Surface aiur's built-in analytics in Game Maker, with fine-grained detail. Add the game-making context aiur lacks, such as time spent on animation versus playtesting versus level building | Record game-context events from day one through the `gm` CLI and SDK, joined to aiur's run ids. Ask aiur upstream for per-event tags. Admin view: a per-build timeline plus time by activity |
| 2 | **Style families map to packs** | The style picked at game creation (low poly, other fidelity levels, 2D styles) maps to specific resource packs | A curated `style family → packs` table in the pack library. `gm-core` enforces one family per game. Start with the families below, from packs we already have |
| 3 | **Device-tiered assets** | Pre-process high-resolution textures and assets into mobile-friendly versions that load only on mobile | `gm packs import` writes a desktop and a mobile variant of every asset. The SDK loader picks one tier at startup and downloads only that tier. `gm-verify` checks a mobile budget |

## 1. Build analytics for admins

### What aiur already records [V]

From the aiur source (`main`, `src/lib/aiur/run_telemetry.ex` and `run_telemetry/`):

- **Storage:** an append-only `telemetry.ndjson` per daemon (schema v3). A Python reducer (`analytics/lib/analytics/reduce.py`) turns it into per-run, per-ticket and repo-timeline JSON under `~/.aiur/repo/<owner>/<name>/analytics/`. There is no database table.
- **Granularity:** per phase, per ticket attempt. The fixed lifecycle events (`run_telemetry/lifecycle.ex:15-41`) are `dispatch`, `workspace_setup`, `agent_spinup`, `implement`, `build_test`, `pr_opened`, `pr_ready`, `review_pause`, `comment_received`, `rework_start`, `ci_result` and `pr_merged`, with start, end and point markers.
- **Agent work is one block.** `implement` covers everything the agent does. There is no separate planning or writing-tests phase. The only finer split is `build_test`: shell commands that match a known build or test command, classed as `:build` or `:test` (`lifecycle/backend_operations.ex:224-265`).
- **Cost:** one `ticket_usage` point per ticket with input, output and cached tokens plus cost (`usage_capture.ex:59-68`). PR facts (reviews, approval times, size) come from GitHub.
- **Privacy:** prompts and command text are deliberately not stored (`lifecycle.ex:1-8`).
- **Surfaces:** the `/analytics` and `/experiments` web pages, `aiur analytics --json`, `mix aiur.telemetry.dashboard`, report scripts, and `GET /api/v1/:issue/usage` and `GET /api/v1/usage`.
- **Custom context is ticket-level only.** Issue labels with the prefixes `experiment:`, `cohort:` or `feature:` are copied into the dispatch event's tags (at most 20, each up to 64 characters). Up to 20 fixed tags can be set in the daemon config. `work_kind` is limited to `feature`, `test_ci`, `tooling` or `other`. **There is no way to send custom events:** `Lifecycle.record` silently drops any event name not on the fixed list (`lifecycle.ex:125-133`).

So aiur answers the general engineering questions well: how long from dispatch to first test, to PR, to merge, how much rework, and what it cost. It cannot say what kind of game work the time went into.

### Worked example: this prototype session [M]

Kevin asked for the screens at 00:34 and the wrap-up went out at 01:54 (UTC−7): **80 minutes**. The goal was set at 00:50. The breakdown below came from classifying the transcript's 116 tool calls by the file each one touched or the command it ran. Each call gets the time spent writing it plus the time it ran. Background waits are capped at 5 minutes. The script is a throwaway in the session scratchpad.

| Activity | Minutes | Share |
|---|---|---|
| Playtesting and screenshots (e2e runs, screenshot review, perf checks) | ~34 | 41% |
| UI shell and layout (HTML, CSS, page flow) | ~9 | 11% |
| Play mode and combat | ~8 | 9% |
| Deploy (Netlify) | ~7.5 | 9% |
| Asset pipeline (goblin bake, copying assets) | ~5.5 | 7% |
| Reading skills | ~5.5 | 7% |
| Level editor | ~5 | 6% |
| Research write-up | ~2.5 | 3% |
| Home screen animation | ~1.5 | 2% |
| Audio | ~1 | 1% |
| Other | ~4 | 5% |

**How far to trust it:**
- Playtesting dominating matches C1: headless WebGL ran at 1–2 fps until the `tick()` hook existed.
- The small numbers for home animation and audio are probably wrong. Those files were written in one go in large writes, and later fixes were shell patches that also ran a check, so some building time landed under testing.
- Getting this far took three rounds of fixing the classifier.

**That is the finding:** guessing the activity after the fact from raw tool logs is unreliable. Game Maker should record the activity when the work happens.

Seen through aiur, this session would show one ~80-minute `implement` block and token cost. `build_test` would appear only if the custom `node e2e.mjs` commands matched aiur's list of known test commands, which is unlikely [I].

### What Game Maker adds (V1)

1. **A game-activity taxonomy**, owned by `gm-core`:
   - asset pipeline;
   - level and map building;
   - gameplay code;
   - animation and VFX;
   - audio;
   - UI and HUD;
   - playtesting and verification;
   - deploy and release;
   - writing.

   It should stay small and fixed, so admin views compare across games.
2. **Record activity at the source, not after the fact:**
   - **`gm` CLI commands** emit events, because each command already names its activity. For example, `gm assets add` → asset pipeline, `gm verify` and SDK `tick()` playtests → playtesting, `gm release` → deploy.
   - **The game manifest maps source paths to systems** (`systems/combat/*` → gameplay, `levels/*` → level), so file edits can be attributed without guessing.
   - **gm-* skills** wrap long steps with a start and end marker.
   - **Human editor actions** (painting tiles, placing objects) go on the same timeline, marked as human rather than agent.
3. **Join to aiur by run id.** V1 works around aiur's fixed event list:
   - Game Maker keeps its own event stream, keyed by aiur's issue and run ids.
   - It also sets a `cohort:`/`feature:` label per job, so aiur's own reports can be filtered by game.
   - Per the decision log ("aiur gaps: work around for V1, then file upstream"), file an upstream request for per-event tags or a custom-event API on `Lifecycle.record`.
4. **Admin view:** per build, show:
   - aiur's phase timeline (dispatch → implement → test → PR → merge);
   - Game Maker's activity breakdown inside `implement`;
   - cost, retries and repair attempts;
   - verification results.

   Also roll these up per game and per member over time.
5. **Privacy:** follow aiur and record categories, timings and counts, never prompt text or source. Which admins can see whose builds follows the admin oversight scope in the release plan.

**Why V1:** history cannot be backfilled. The per-command events are also needed by `gm-verify` and the repair loop.

## 2. Style families map to packs

C1 found that the Synty goblins next to the Kenney hero "look like two different games" [O]. B11 already says each game locks one or two packs as its art direction. Kevin's direction makes the style picked at creation choose the pack set.

**Mechanism:**
- The pack library keeps a curated `style-families.json`. Each family lists a dimension (2D or 3D), its fidelity, its packs (a primary set plus compatible extras), and a license note.
- The scope chat (`gm-scope-options`) offers families, not packs, each with a preview sheet.
- The game's lockfile records the family. `gm-core` enforces it: `gm assets search` is limited to the family's packs by default, and anything from outside the family needs an explicit, logged exception.
- Tier 2 and tier 3 assets (online and agent-made) must be restyled to the family or rejected.

**Starter families from the library we already have** (`assets-local/catalog.json`, 277 packs [M]):

| Family | Dimension | Packs (examples) | License |
|---|---|---|---|
| Chunky low poly | 3D | Kenney 3D kits (54 packs): Mini Dungeon, Mini Characters, Mini Forest, Castle Kit, Nature Kit, Fantasy Town Kit, Animated Characters | CC0 |
| Detailed low poly | 3D | Synty POLYGON (Generic, Viking Realm, Nature Biomes, Shops, Particle FX), SIDEKICK Goblin Fighters, Synty animations | Synty personal: Kevin's instance and private repos only (B11) |
| Simple low poly | 3D | Synty SIMPLE (Buildings, Props, Items & Icons) | Synty personal |
| Pixel art | 2D | Tiny Dungeon, Tiny Town, Tiny Farm, Pixel Platformer and its expansions, Micro Roguelike, Roguelike packs, 1-Bit Pack, Pico-8, Pixel Shmup | CC0 |
| Flat cartoon (vector) | 2D | Platformer Pack Remastered, Platformer Assets, Toon Characters, Space Shooter Remastered, Topdown Shooter, Tower Defense, RPG Tiles Vector | CC0 |
| Isometric 2D | 2D | Isometric Miniature (Dungeon, Farm, Overworld, Library), Isometric Tiles, Isometric Medieval Town | CC0 |
| Sketch / hand-drawn | 2D | Sketch Town, Sketch Desert, Scribble Dungeons, Scribble Platformer | CC0 |

Kenney has 156 2D packs in all, so 2D games are already well covered [M].

**Notes:**
- In 2D, camera perspective (side view, top-down, isometric) splits families as much as art style does. The family record should carry it.
- The sketch family fits the app's paper look and may suit a "make it look like my drawing" path.
- A family needs characters, environment, props, UI and SFX before it is offered. Curating that is `gm-pack-curate` work, and the families above have not been checked for completeness yet.
- Synty rows have no `category` in the catalog yet [M]. Style labels are missing for every pack. Tagging them is a prerequisite ticket.

## 3. Device-tiered assets (mobile and desktop)

**What we know:**
- The prototype page weighs ~18 MB. Models are 13.1 MB, of which the three goblins are 12.6 MB (54k vertices each, uncompressed). Images are 3.9 MB, from two 1672 px PNGs [M] (C1).
- Kevin played it on a phone with no visible performance problems [O]. This is a tiny scene, though. More goblins, more lights or a bigger map would push download size, GPU memory and frame time on phones [I].
- B11 already plans meshopt and KTX2 compression at import. What is new is serving a different variant per device.

**Mechanism:**
1. **At import** (`gm packs import`, the bucket stores both variants, content-addressed):

   | Variant | Textures | Meshes | Audio |
   |---|---|---|---|
   | Desktop | KTX2 (UASTC) at source size, up to 2048 px | meshopt-compressed | OGG/Opus at normal bitrate |
   | Mobile | KTX2 (ETC1S), capped at 1024 px (512 px for props) | simplified (`gltf-transform simplify`) to roughly half the triangles where it doesn't hurt the silhouette, then meshopt | lower-bitrate Opus |

   The variant sizes are [I] starting points, to measure.
2. **One logical id per asset.** Game code refers to `models/goblin` and never to a file. The manifest in B6 already uses logical ids, and it maps each id to its variants. Agents never choose a variant.
3. **The SDK loader picks a tier once, at startup.**
   - It uses capability signals rather than the user agent: `navigator.deviceMemory`, `hardwareConcurrency`, WebGL `MAX_TEXTURE_SIZE` and KTX2 format support, screen size, plus a short frame-time probe.
   - It downloads only that tier.
   - There is a player override in settings.
   - It optionally drops to the mobile tier if frame time stays high.
4. **Budgets checked by `gm-verify`.** Each tier has limits for:
   - download size;
   - texture memory;
   - draw calls;
   - triangles on screen.

   Verify runs the mobile tier under phone emulation and fails when a game goes over.
5. **Audio formats per browser.** Kevin heard no sound on his iPhone (2026-10-26). The prototype shipped Kenney's Ogg Vorbis files, played through Web Audio. The fix shipped MP3 plus `navigator.audioSession.type = 'playback'`, so the ringer switch doesn't mute the game, plus starting audio on `touchend`/`pointerup`. Which of the three was the cause is unconfirmed [I]. Import should write a format every target browser decodes (AAC or MP3, with Opus where supported), and `gm-verify` should check sound on a real iPhone.
6. **Game-generated assets** (tier 3, uploads) go through the same variant step when they are registered.

**Caveats:**
- Headless SwiftShader cannot measure real phone performance (C1). Budgets catch download size and memory, but frame-rate claims need a real-device check.
- Paid device clouds would need Kevin's approval, so V1 relies on Kevin's own phones.
- The tier detection rules need a short spike on real devices.

## For ticketing

When tickets are made, each line below should appear in at least one ticket:

- **Analytics:**
  - define the `gm-core` activity taxonomy;
  - event emission from `gm` CLI commands and gm-* skills;
  - manifest path → system mapping;
  - human editor actions on the same timeline;
  - a Game Maker event store joined to aiur run and issue ids, plus a job label;
  - an upstream aiur request for per-event tags or custom events;
  - the admin build-analytics view, per build and rolled up;
  - privacy rules, matching aiur (no prompt or source text).
- **Style families:**
  - add style and perspective labels to every pack;
  - write `style-families.json`;
  - check each family is complete;
  - family selection in the scope chat;
  - lock the family in the lockfile;
  - `gm-core` enforcement and a logged exception path;
  - restyle or reject tier 2 and 3 assets.
- **Device tiers:**
  - generate mobile and desktop variants at import;
  - map each logical id to its variants in the manifest;
  - SDK tier detection, override and downgrade;
  - per-tier budgets in `gm-verify`;
  - run the variant step for tier 3 and uploaded assets;
  - a real-device spike to set tiers and budgets.
  - audio formats every target browser decodes, an iOS audio-session and unlock helper in the SDK, and a real-iPhone sound check.
