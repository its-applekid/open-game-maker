# C2: V1 scope additions from the prototype review (2026-10-26)

> **Version scope:** items 1–3 are **V1** (Kevin, 2026-10-26: "Include all of these in our scoping as part of V1"). Item 4, point of view, was asked for later the same day. It is placed in V1 on the assumption that it sits with the other creation-time choices. Item 5, budget-aware voice, is also placed in V1, because voice and spending limits are both V1. Item 6, multiplayer, is **V1 by Kevin's direction** (2026-10-26: "a very robust first class feature from day one, or from V1"). It supersedes the release plan's earlier "V1 reserves interfaces only, gameplay in V2". Item 7, the Drive watch folder, is **V1 by Kevin's direction** (2026-10-26). This note exists so they become tickets when tickets are made. It is not a ticket list or a build order.

Evidence tags: [M] measured in this repo, [V] verified in source, [I] inferred, [O] opinion.

## Summary

| # | Addition | Kevin's direction | Recommendation |
|---|---|---|---|
| 1 | **Build analytics for admins** | Surface aiur's built-in analytics in Game Maker, with fine-grained detail. Add the game-making context aiur lacks, such as time spent on animation versus playtesting versus level building | Record game-context events from day one through the `gm` CLI and SDK, joined to aiur's run ids. Ask aiur upstream for per-event tags. Admin view: a per-build timeline plus time by activity |
| 2 | **Style families map to packs** | The style picked at game creation (low poly, other fidelity levels, 2D styles) maps to specific resource packs | A curated `style family → packs` table in the pack library. `gm-core` enforces one family per game. Start with the families below, from packs we already have |
| 3 | **Device-tiered assets** | Pre-process high-resolution textures and assets into mobile-friendly versions that load only on mobile | `gm packs import` writes a desktop and a mobile variant of every asset. The SDK loader picks one tier at startup and downloads only that tier. `gm-verify` checks a mobile budget |
| 4 | **Point of view** | Point of view is a choice when creating a game: isometric (as in the prototype), first person, third person, and anything else that suits the chosen style and other choices | One camera-rig module per point of view in the SDK. The scope chat offers only the points of view the chosen style family and genre support. The lockfile records the choice. The editor keeps its own top or isometric camera, plus a "view as player" preview |
| 5 | **Budget-aware voice agent** | The two-way voice agent knows the creator's remaining resources. When a request is too big for what's left, it says so and offers to queue it for tomorrow or to cut it down to fit today | Give the voice agent read-only budget and estimate tools. Before agreeing to a change, it compares the estimate with what's left and offers four choices: do it now, trim it to fit, split it (part now, the rest queued), or queue it for the reset. Only Game Maker's admission step reserves money |
| 6 | **Multiplayer, first-class in V1** | Single player or multiplayer is chosen at creation, and a single-player game can become multiplayer later. Inviting friends is easy: they sign in and land straight in the game. Players without editor access watch the editor's changes exactly as they happen, and join gameplay the moment Play is pressed. Over the network, each player has their own controller and their own character's point of view | Build A7 R12's room design (a generic Colyseus room, with the simulation hosted in the owner's sandboxed browser) in V1. Stream B7's design transactions to watchers so their view matches the editor exactly. Every game follows `gm-multiplayer-ready` rules from day one, so converting to multiplayer is an ordinary edit job |
| 7 | **Drive watch folder for new assets** | Kevin drops new asset files into a Google Drive folder. A listener notices right away and, after a debounce for uploads in progress, an agent organizes them and makes them available: as a new creation choice, or just as material agents can use. Assets aren't forced into "packs": a drop may be a full pack, a set of sound effects or a few models | A Drive changes listener scoped to one folder, with a quiet-period debounce, feeds a `gm-asset-intake` skill. Its unit is the **collection** (any size). It identifies, checks the license, normalizes (B11 plus the C2 §3 variants), tags and indexes each collection for `gm assets search`. A collection becomes a creation choice only if curation says it completes a style family |

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

**Proof in the prototype (2026-10-26):** swapping the Synty goblins for Mini Dungeon's orc took one small code change, because the orc shares the hero's rig and animations, including a real `die`. That removed the bake step, 12.6 MB of models and the license problem all at once. The three strengths now differ only by tint, size and a spear. A family whose characters share one rig makes variants cheap. `gm-pack-curate` should record which characters share a rig.

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

## 4. Point of view

The prototype used a fixed isometric camera. It also needed cutaway walls, so walls stop hiding the player, and a closer zoom in play mode (C1) [M]. Each point of view brings its own requirements like these, so the choice has to be made at creation and drive the rest.

**Options:**

| Point of view | Dimension | Fits | Requires |
|---|---|---|---|
| Isometric / fixed three-quarter | 2D or 3D | Dungeon crawlers, tactics, builders, cozy games | Cutaway or fading walls (3D); isometric packs (2D) |
| Top-down | 2D or 3D | Action RPGs, twin-stick shooters, racing, puzzles | Overhead-readable art (2D packs like Tiny Dungeon and Topdown Shooter) |
| Side view | 2D or 2.5D | Platformers, brawlers | Side-view packs (Pixel Platformer, Platformer Pack); in 3D, a locked camera plane |
| Third person (follow) | 3D | Adventure, action, exploration | A character with a full animation set; camera collision; touch camera control |
| First person | 3D | Exploration, shooters, horror, walking sims | Hands or weapon models, ceilings and enclosed spaces, pointer lock on desktop, two-stick touch controls |
| Free orbit | 3D | Sandbox, strategy, toy-like builders | Orbit, pan and zoom on mouse, touch and controller |
| Fixed screen | 2D | Single-screen puzzles, arcade games, board and card games | Nothing extra |

**How it narrows by style family:**
- **2D families come with their point of view built in.** The art is drawn for one view. Pixel splits into top-down packs (Tiny Dungeon, Roguelike) and side-view packs (Pixel Platformer). Isometric 2D allows only isometric. The family record carries `views: [...]`, and the scope chat filters on it.
- **3D families allow any 3D view in principle, but the pieces limit it** [I]:
  - Kenney Mini Dungeon is built for viewing from above. It has short walls and no ceilings [M], so first person would look wrong.
  - Kenney Modular Dungeon Kit has rooms and corridors with `wall-top` pieces but no named ceilings [M]. It would need checking before being offered for first person.
  - Synty POLYGON sets are built for first and third person [I].
  - Curation (`gm-pack-curate`) records which views each family supports.
- **Genre narrows it further.** A platformer offers side view or third person, a shooter first person, third person or top-down. Only valid combinations are offered, and a recommended default is preselected.

**Mechanism:**
1. **SDK camera rigs**, one module per point of view (`iso`, `topdown`, `side`, `follow`, `fps`, `orbit`, `fixed`). Each comes with its input mapping: what the joystick means relative to the camera, pointer lock, touch look, and controller right stick. This fills B7's open gap, where there is no camera contract in A4.
2. **Wall and occlusion handling per rig:** cutaway for isometric (proved in the prototype), fade or camera collision for follow, and nothing for top-down.
3. **The editor camera is separate.** Editing stays top-down or isometric whatever the play view, so placing things is always easy. A "view as player" button previews the game's own camera. B7 already says camera state is not design state.
4. **Recorded in the lockfile and changeable later, with a warning.** Swapping the rig is cheap in 3D. Level geometry and assets may not suit the new view, so the change runs `gm-verify` and may suggest a different family.
5. **`gm-verify`** runs the play loop in the chosen rig, on phone and desktop, using the `tick()` hook.

## 5. Budget-aware voice agent

**What exists:**
- Admins set spending limits (decision log).
- B8 §5 has Game Maker reserve money per job, using a p80 estimate by kind and complexity from its own history.
- B8 also has rolling-window caps per family, the creation and edit slots, a queue, and a pause-and-ask-the-admin step at 1× the reservation.

All of that happens after a request is agreed. The voice agent that agrees the request knows none of it, so today a creator could talk through a big change and then hit a refusal or a pause.

**Kevin's direction:**
- The voice agent has context about the creator's remaining resources.
- For a very large change that won't fit the allocation, it talks it over: "this is pretty big".
- It offers to queue the change for tomorrow, or to reduce the scope so it fits as the day's remaining change.

**Mechanism:**
1. **Budget context tools for the voice agent** (`voice_converse` tools, served by the Game Maker backend, all read-only):
   - `budget_status()`: what's left in the creator's allocation today, as a friendly unit and a percent; when it resets; free slots; and jobs already queued.
   - `estimate_change(summary, game_id)`: a size class (small, medium, large, huge), the p80 cost range in the same unit, and a confidence. It comes from the job history and C2 §1's per-activity analytics: past animation work, level edits and new systems on similar games.
   - `queue_change(plan, start: "now" | "at_reset")`: hands the agreed plan to Game Maker's normal admission step. The voice agent never reserves money itself. Admission re-checks, so a stale estimate can't overspend.
2. **Conversation rules** (a gm skill or voice prompt section):
   - **Don't talk about budget when it isn't relevant.** Small changes that fit go ahead without mentioning cost.
   - **Bring it up only when the estimate is over what's left, or uses most of it.** Then offer, in plain words:
     - **(a) Trim it to fit:** the agent proposes a concrete smaller version, such as "one new enemy now instead of three".
     - **(b) Split it:** build the core part today and queue the rest for the reset.
     - **(c) Queue the whole change** for when the allocation resets.
     - **(d) Ask an admin for more,** where the family allows it.
   - **Be honest about uncertainty.** A low-confidence estimate is described as a range. The agent never promises a change will fit.
   - **Mid-build overruns use the same voice.** When B8's 1× reservation pause fires, the agent explains it and offers to finish tomorrow, scale back or ask an admin. It doesn't fail silently.
3. **Queued changes:**
   - A queued change is a stored plan with `start: at_reset`.
   - It starts automatically when the allocation resets, sends a browser notification when it begins and ends, and can be edited or cancelled before then.
   - The admin sees it in the build list.
4. **Units and visibility.** Creators see a friendly unit, such as "build energy" with a daily bar, not dollars. Admins see dollars, as in B8 and A6. The voice agent uses the friendly unit unless an admin asks.

**Open questions for Kevin:**
1. **Whose allocation:** a daily allocation per member set by an admin (as described here), or the family's shared pool with per-member limits? Admins already set spending limits; this picks how that's split.
2. **Reset period:** daily at local midnight, or a rolling 24 hours? "Tomorrow" suggests a daily reset.
3. **Unit name and display:** what creators see.

**Risks:**
- **Estimates start out poor.** There is no history at launch, so the first estimates are coarse size classes. Accuracy improves as C2 §1's analytics collect data, so keep the ranges wide until then.
- **A creator can talk the agent into calling a huge change "small".** Admission's own check is the backstop.

## 6. Multiplayer, first-class in V1

**Kevin's direction (2026-10-26):**
- Single player or multiplayer is picked at creation, and a single-player game can be made multiplayer later.
- Multiplayer is "a very robust first class feature" from V1.
- Inviting friends is easy and intuitive. Friends just sign in and are dropped straight into the game.
- Players without editor access still see when the main player is editing, "one-to-one exactly" what is being changed. They get gameplay immediately when Play is pressed.
- Over the network, each player has their own controller, never sees other players' controllers, and sees from their own character's point of view.

**What the research already designed** (now V1 inputs, not V2):
- **A7 R12** is a room design on Colyseus 0.18 [V]:
  - **A generic room owned by the platform**, with no game code in it. It handles membership, roles, pause, version pinning, the editor stream and relaying inputs and state.
  - **The game simulation runs in the owner's sandboxed browser,** the host. The other players send inputs and get snapshots back, which the SDK interpolates.
  - **Rooms are pinned to a version.** Players reconnect within a time window, and private panels are filtered out of what other players see.
  - A7 recommends this "host-authoritative" model because running agent-written game code on the multiplayer server would break the sandbox rule (R05).
- **B7 §9** has hooks that already fit:
  - design changes go out as a stream that can be broadcast (`{actor, rev, patches}`);
  - an edit lease gives one person editing authority;
  - presence (cursor, selection) is kept separate from design state;
  - input carries `playerIndex`;
  - entity IDs are minted by the host;
  - applying a design is deterministic.

**How each part of Kevin's direction maps onto that:**

| Direction | Design |
|---|---|
| Choose at creation, convert later | Every game follows `gm-multiplayer-ready` from day one, not only multiplayer games: input separate from simulation, per-player state keyed by player id, host-minted ids, spawn points, a HUD per player. A multiplayer game starts from a template that already has the networking. Converting a single-player game is an ordinary edit job (B8 admission, budget-aware voice): it adds join and spawn, networked entities and per-player HUDs, then runs a two-client `gm-verify` |
| Easy invites | The owner taps Invite and shares a link (copy, text message, or the phone's share sheet). The friend opens it, signs in (passkey, Google or email), and lands in the room with no other screens. The link carries a room-scoped grant that can expire and be revoked. It replaces A7's anonymous guest codes, because Kevin wants friends signed in |
| Watch the editor one-to-one | Watchers receive the same design transaction stream the editor saves, so their copy of the level changes exactly as the editor's does: tiles, placed objects, inspector values. Presence adds the editor's cursor, selection and camera. Watchers follow the editor's camera by default and can look around on their own. Agent builds (code-level changes) show as "building…" with progress, then the owner loads the draft into the room (A7's draft preview) |
| Play the moment Play is pressed | Pressing Play ends the edit pause. Every client already has the design and the build, so they are in gameplay on the same frame. Late joiners load the pinned build and spawn at once |
| Own controller and own view | Each client reads only its own devices and keeps its own camera rig (C2 §4), following its own character. The HUD is per player. Other players' input is never shown, only its results. The SDK's camera and input contracts are built per player from the start |

**Constraints this creates:**
1. **The lawyer review moves earlier.** The decision log has the lawyer review "before any outside family joins". Friends are outside the family, so if V1 lets people invite friends, that review is a V1 launch prerequisite. Recommendation: limit invites to the family until the review is done, then open them to friends.
2. **Every friend must pass the 18+ age screen in V1.** A friend under 18 cannot join until teen and child accounts arrive (V2 and V3). The invite flow must say this kindly.
3. **When the host drops, the game stops.** With the simulation in the owner's browser, the room pauses if the owner leaves (A7). Kevin still needs to pick between ending the session with progress saved, or migrating the host to another player. Recommendation for V1: end the session with progress saved.
4. **Fairness.** Host-authoritative play is fine for co-op and casual competition among invited players. It is not cheat-proof. Competitive or physics-heavy genres would need A7 option B (game logic in a sandbox per room, about $50 per vCPU-month while live). That stays later.
5. **Infrastructure:** one `mp` Colyseus service on Railway with a single replica (no sticky sessions; WebSockets reconnect). A7's evaluation plan (relay latency at p50/p95 with 4 clients, pause and resume, killing the owner's tab, swapping the release mid-room, checking on the wire that private fields never reach watchers) needs a small Railway Hobby spend. **No spending is approved yet,** so that waits for Kevin.
6. **Privacy in the room.** Watchers never see prompts, the voice conversation with the build agent, budgets or admin panels. They see "Kevin is talking to the builder…" (A7 I3). Whether friends may hear or join the voice conversation is open (below).

**Testing:** the `tick()` hook from C1 extends to several clients. `gm-verify` runs two Playwright browser contexts (host and friend) and checks:
- invite → sign in → join;
- the friend's view of the level matches the editor's, design revision for revision;
- Play starts both clients;
- each client has its own camera;
- reconnecting works.

**Moves from V2 to V1:**
- online play;
- watching the editor;
- pausing the room for edits;
- invited playtesting of drafts.

**Stays later:**
- same-device multiplayer (split screen);
- more than one person editing at once;
- server-authoritative rooms for competitive play;
- public matchmaking.

**Open questions for Kevin:**
1. **Friends in V1:** family only until the lawyer review, then friends? (Recommended.) Or friends from V1 launch, which makes the lawyer review a launch blocker?
2. **When the host drops:** end the session with progress saved (recommended for V1), or hand hosting to another player?
3. **Can friends hear or talk to the build agent** while the owner edits by voice? Default: no, they see "talking to the builder…".
4. **Same-device split screen:** later (assumed), or also V1?
5. **Room size:** Colyseus can handle more, but co-op tuning and testing usually cap a room at 4–8 players. Default 4?

## 7. Drive watch folder for new assets

**Kevin's direction (2026-10-26):**
- Kevin sets up a Google Drive folder, and a listener watches just that folder.
- When he adds new asset files, the system knows immediately and starts organizing them so players' games can use them.
- A debounce handles uploads that are still in progress.
- Once a new drop is confirmed, it becomes available automatically, either as a new option for players or as something agents can use at their discretion.
- Drops are **not forced into "resource packs" tied to player choices.** A drop might be a full pack, just a collection of sound effects, or a few models that don't make up a whole pack.
- An agent skill handles the listener's output and organizes drops so coding agents can use them sensibly.

**What exists:**
- B11 defines `gm packs import` (normalize to GLB, PNG/WebP and OGG/Opus, meshopt and KTX2), the bucket library and the license policy. It also names the `gm-pack-import` and `gm-pack-curate` skills.
- This repo has a working local version: the `assets-local/` layout, `scripts/assets/import_synty.py`, `import_kenney_bundle.py` and `build_catalog.py`, plus 277 packs imported (C1).
- C1 recorded the intake lessons:
  - one `.unitypackage` extraction hung for 10 minutes until it was rewritten to extract in a single pass;
  - nested zips needed a second pass;
  - Synty characters arrived as part lists that needed a bake step.

**Mechanism:**
1. **Listener (a small service, no AI):**
   - **Access:** a Google service account. Kevin shares only the watch folder with its email address, so it can read that folder and nothing else in his Drive. Recommended over user OAuth, which would need Drive's restricted read scope for files Kevin uploads himself.
   - **Detecting changes:** poll the Drive `changes.list` API with a saved page token every 30–60 s, filtered to the folder and its subfolders. Polling works from the maker PC or Railway with no public endpoint. Drive push notifications (`changes.watch`) need a public HTTPS webhook and still need polling as a fallback, so they can be added later for speed.
   - **Debounce:** a drop is ready when its top-level item (a file, or a subfolder of related files) has had no new or changed files for a quiet period (default 3 minutes). Every file also has to give the same size and checksum on two polls in a row. Archives must pass an integrity test before intake starts.
   - **Output:** one intake job per settled drop, containing the Drive ids, names, sizes and checksums. Drive files are downloaded into a fresh, empty quarantine directory.
2. **Collections, not packs.** The library's unit becomes a **collection** of any size:
   - a vendor pack;
   - a set of sound effects;
   - a handful of models;
   - one texture set.

   Each collection has an id, a source (a Drive file id, or a vendor and version), a license, item counts by kind, and tags. A vendor pack is just a large collection. `assets-local/packs/` keeps working, generalized to `collections/`.
3. **The `gm-asset-intake` skill**, for the agent that receives intake jobs:
   1. **Identify** what arrived. A vendor pack, from its folder layout and license files (we already know the Synty `SourceFiles` and Kenney layouts)? Loose models, audio, sprites or textures? Engine-only files to drop: Unity and Unreal projects, `.meta`, `.mat`, previews?
   2. **License first.** Read the license files and any vendor marker. Kenney means CC0. Synty means personal, so private repos only (B11). **If the license is unknown, the collection stays in quarantine,** and Kevin gets a note asking what it is. Nothing is exposed until the license is known.
   3. **Normalize** with B11's pipeline (GLB, PNG/WebP, audio formats every browser decodes) and generate the mobile and desktop variants (C2 §3). Bake step if needed (Sidekick-style part lists).
   4. **Tag** each item: kind (model, character, prop, tile, SFX, music, UI, texture), style, point of view, rig and animations, scale, and polygon or file size. Thumbnails and audio previews are generated for each item.
   5. **Index** into the catalog, so `gm assets search` and `facets` find it right away. Agents then use it at their discretion, within the game's style family (C2 §2) and the license policy.
   6. **Suggest, don't force.** If curation (`gm-pack-curate`) finds that a collection completes or extends a style family (characters, environment, props, UI, SFX), it proposes adding it as a creation choice. Otherwise it stays as agent material. A loose SFX set never turns into a style option.
   7. **Report** to Kevin with one line per drop: what arrived, its license, how many items, where it's usable, and anything stuck in quarantine.
4. **Safety:**
   - Downloads are untrusted data. Unpack them in a fresh directory, with zip-slip and size checks, and never run anything from them (unitypackage scripts, installers).
   - Run the converters isolated from the agent's credentials.
   - There is a size cap per drop.
5. **Where it runs:** the listener and intake can run on the maker PC for Kevin's instance (the bucket sync already exists in B11) or as a Railway worker for hosted instances. It's the same code either way. Configuring the folder is an admin setting.

**Kevin's setup (free):**
- create the folder;
- share it with the service account's email (provided when the service account is created).

No spending needed.

**Open questions for Kevin:**
1. **Should finished files stay in the Drive folder?** Options: (a) leave them, and track what has been processed by Drive id and checksum (recommended, never deletes his files), or (b) move them to a "processed" subfolder.
2. **Notifications:** a browser notification from Game Maker's admin UI, or a phone push like this session's?

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
- **Point of view:**
  - a camera-rig contract in the SDK, plus one rig per view with its input mappings for mouse and keyboard, touch and controller;
  - occlusion handling per rig;
  - `views` in the style-family record, and curation of which views each family supports;
  - filtering by view, family and genre in the scope chat, with a recommended default;
  - recording the view in the lockfile, and a flow for changing it later;
  - the editor's own camera plus a "view as player" preview;
  - `gm-verify` runs in each rig.
- **Budget-aware voice:**
  - `budget_status`, `estimate_change` and `queue_change` voice tools backed by Game Maker admission;
  - an estimate model by size class, seeded with coarse values and refined from analytics history;
  - conversation rules in the voice prompt or a skill: trim, split, queue, ask an admin; quiet when it fits;
  - voice explanation of mid-build overruns;
  - queued-at-reset jobs, with notifications and edit or cancel;
  - per-member allocation and reset settings in the admin UI;
  - a friendly unit for creators and dollars for admins.
- **Multiplayer (V1):**
  - a single-player or multiplayer choice at creation;
  - `gm-multiplayer-ready` rules applied to every game;
  - a multiplayer game template;
  - a single → multiplayer conversion edit job with two-client verification;
  - the `mp` Colyseus service on Railway with a generic room (membership, roles, pause, version pin, relay);
  - host-authoritative simulation, with SDK snapshot interpolation;
  - invite links with room-scoped grants, and sign-in → straight into the room;
  - age-screen messaging for friends;
  - the design transaction stream and presence (cursor, selection, camera) sent to watchers, matching the editor exactly;
  - a "follow the editor" camera with free look;
  - draft preview loaded into the room for agent builds;
  - Play from the edit pause, and late joining;
  - per-player input, camera and HUD in the SDK;
  - reconnection, plus the host-drop behaviour Kevin picks;
  - private-field filtering checked on the wire;
  - two-client tests in `gm-verify`;
  - the A7 evaluation run (needs a spending OK);
  - the lawyer review timing for outside-family invites.
- **Drive watch folder (V1):**
  - the service account, plus admin settings for the watch folder;
  - a `changes.list` polling listener with a saved page token and folder filter;
  - the quiet-period debounce with checksum stability and archive integrity tests;
  - intake jobs, with download into quarantine;
  - generalize packs to **collections** in the library, catalog and lockfile;
  - the `gm-asset-intake` skill: identify, license first (quarantine if unknown), normalize and generate variants, tag, index, suggest for curation, report;
  - unpacking safety (zip-slip, size caps, nothing executed);
  - processed-file tracking by Drive id and checksum;
  - notifications to Kevin;
  - optional `changes.watch` push later.
