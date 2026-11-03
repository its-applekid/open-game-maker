# Open Game Maker 2000: build scope and the engine-layer question (voice briefing, 2026-11-02)

This is a briefing for a voice conversation with Kevin. It covers what the build has delivered, how the asset work is
growing into the middle engine layer, and the questions only Kevin can answer. The voice agent should walk through
sections 1–4 briefly, then spend most of the time on section 5 (questions), and send Kevin's answers back as a short
list: question id, his decision in his words, and any new asks.

## 1. Where the build stands

**Numbers (evening of 2026-11-02):** 154 tickets closed, 51 open (most of those parked on purpose), 169 PRs merged. The
fleet is a set of Codex agents run by aiur on Kevin's NUC; Claude is now only the coordinator and conversation partner.

**What exists and works (merged to main):**
- **Platform:** API, database, sign-in (magic link and passkey), age gate, GitHub App connect, commit service with
  safety checks, games host, multiplayer rooms, voice host (built, not switched on), notifications, analytics, admin
  screens, backups, setup site (splash, /setup page, SETUP.md).
- **Creation flow:** title town, games list, new-game steps (genre, vibe, style, world, players, point of view), scope
  chat, prompt attachments (images and text files).
- **Build loop:** jobs to aiur, per-game build daemons, builds and releases, publish and rollback, finished builds
  registered and playable, edit-by-chat starts a rebuild, repair loop, saves that work end to end.
- **Engine:** `@gm/sdk` (game loop, input, audio, saves, test hooks), 2D (Phaser) and 3D (three + Rapier) templates,
  SDK conformance check, game skills (platformer, input, HUD, audio, multiplayer-ready, scope options).
- **Asset library:** ~490 packs on the NUC (Kenney, KayKit, SmallScaleInt, LimeZu, Synty, audio libraries), a catalog
  and cards, three pack adapters, the SmallScaleInt showcase pipeline and skill.

**What is still in flight:**
- **The end-to-end proof (#98):** create a game, edit it, play it, on this machine. Every blocker it had is merged; it
  is the next thing the fleet finishes, then Kevin's QA pass.
- **Client caching (#335–#339):** shared asset cache, loading screen with real progress, fast second loads.
- **Showcase v4 (#371) and the style picker layout (#372):** the dioramas Kevin reviewed today, made to look like real
  gameplay.
- **Downloads running on the NUC:** all Sonniss GDC sound bundles (2016–2024, ~200 GB) and Pixabay curated playlists
  (~1,000 tracks), both untagged until Kevin says go.

**Parked until Kevin says go (his rule):** the asset-searchability research (#364) and the full re-preprocessing of
every pack (#353 2D, #354 3D, #355 audio, #356 maps), the audio style picker (#357) and agent-only maps (#358).

## 2. The three engine layers (recap of the 2026-11-01 research)

| Layer | What it is | Where it lives | Example |
|---|---|---|---|
| **L1 core** | Things every game needs, no asset knowledge | `@gm/sdk`, `@ogm/contracts` | game loop, input, saves, audio buses, pathfinding |
| **L2 pack adapter** | How one asset set works, with no gameplay | `packages/pack-adapters/<set>/` (`@gm/pack-<set>`) | SmallScaleInt's 8-direction sheet order, tile grid, sprite actor |
| **L3 game** | This game's rules, story and tuning | the game's own repo | "the knight loses a life when hit" |

**The rule that keeps L2 honest:** an adapter holds tables and bindings (conventions, vocabulary, map format, palette,
an actor that plays the pack's sprites). No gameplay, no numbers a designer would tune, no theme words in its exports.
Something moves down a layer only when two games need it unchanged (the "rule of two").

**What is built in L2 today:**
- `@gm/pack-smallscaleint`: conventions (measured direction order E, SE, S, SW, W, NW, N, NE; 15 frames per action at
  12 fps), vocabulary, isometric map, palette, sprite actor.
- `@gm/pack-kaykit`: rigged characters with clip retargeting, kit placer for modular pieces, map, palette, vocabulary.
- `@gm/pack-limezu-modern`: top-down map with autotiling, layered sprites (the farmer compositor), conventions.

## 3. Kevin's insight: the showcase work is building L2

Kevin's observation is right. To make the living dioramas, the showcase pipeline (`scripts/assets/showcase/`) had to
solve problems that any game made from that set will have:

| Showcase capability | Engine-layer equivalent | Lives today in |
|---|---|---|
| Isometric projection, depth sorting, occlusion | renderer and map layer (L2, with parts of L1) | `project.mjs`, `canvas.mjs`, `render.mjs` |
| Reading sheets by direction, frame and action | sprite actor (L2) | `assets.mjs` (`directions`, `loadAssetLibrary`) |
| A walking hero on a path | locomotion (L1 movement + L2 animation) | `render.mjs`, `model.mjs` |
| Fights that connect, hit reactions, deaths | combat feedback (L1 events + L2 animation choice) | `story.mjs` (`builtInReactions`, `storyState`) |
| Coherent ground, walls, interiors, wall cutaway | map building rules (L2) | v4 ticket (#371) |
| Weather and particles | effects (L1) | v4 ticket (#371) |
| "Which sprites belong together in a scene" | the set's vocabulary and compatibility (L2 data) | `sequence.json`, the catalog |

**The gap:** the showcase code is plain Node scripts that draw frames for a video. The adapters are browser
TypeScript packages that run inside a game. Today they share ideas, not code, so the same knowledge (direction order,
anchors, depth sorting) is written twice and can drift.

## 4. Brainstorm: how to make the showcase code count toward the engine

Three approaches, recommendation last.

**A. Keep them separate (status quo).** The showcase stays a video tool; adapters are written for games.
Cheap now, but every rule is written twice, and the dioramas stop being proof that the adapter works.

**B. Showcase renders through the adapter.** The showcase becomes a tiny "game" built on the same L2 adapter and L1
pieces, played headless and recorded to video. Every diorama is then a working demo of the adapter: if the knight
walks and fights in the showcase, a game can do the same with the same code. The cost: the adapter must grow a
deterministic, scriptable mode (fixed timestep, seeded randomness, a "story" driver), and rendering moves into the
browser (Playwright) instead of plain Node canvas.

**C. Shared core module, two front ends.** Pull the pure logic (projection, depth sort, direction tables, story
timeline, hit-reaction rules) into a small isomorphic package (for example `@gm/pack-smallscaleint/core`) that both the
Node showcase and the browser adapter import. Less change than B, and most of the drift goes away, but the showcase
still doesn't prove the in-game renderer.

**Recommendation: C now, B as the target.** Move the shared logic into the adapter package as pure functions during
the v4 work and the 2D re-preprocessing (#353), so nothing is written twice. Then, once the end-to-end loop is QA'd,
switch the showcase renderer to drive the real adapter in a headless browser, so every set's diorama doubles as the
adapter's living test and its "starter scenes".

**What "scenes as a product" could mean:** the v4 regions (market, street, interior, graveyard…) could ship as
**starter scenes** an agent can drop into a new game ("start from the zombie-city street"), written as data (map plus
actors plus a story script), not code. That is the step from "asset preview" to "asset-pack engine".

**Plan if Kevin agrees (tickets the Executor files):**
1. Shared core: move projection, depth sort, direction tables, anchors and hit-reaction rules into
   `@gm/pack-smallscaleint` as pure functions; the showcase imports them (complexity 3).
2. Scene format: define a scene file (map, actors, behaviours as data, story beats) in `@ogm/contracts`; the v4
   regions are its first instances (complexity 3).
3. Headless adapter renderer: render the showcase through the adapter in a browser at a fixed timestep; byte-identical
   frames per seed (complexity 4, after the QA loop).
4. Starter scenes: `gm new --scene <set>/<region>` seeds a game from a showcase scene (complexity 3).
5. Skill update: `gm-set-showcase` and `gm-pack-adapter` say the showcase and the adapter share one core; the rule of
   two decides what moves to L1 (complexity 1).

## 5. Questions for Kevin (the voice agent should ask these)

**Engine and scope**
- **E1. Showcase and engine:** should the diorama code become the start of each set's engine (approach C now, B
  later), or stay a preview tool for now? Recommendation: C now, B after the QA loop.
- **E2. Starter scenes:** do you want the showcase regions to be usable as starting scenes for new games? If yes, which
  set first (SmallScaleInt is furthest along)?
- **E3. How much gameplay in L2:** the dioramas include fights and hit reactions. Should a pack adapter ship generic
  behaviours (walk, attack, take hit, die) for its sprites, or stay animation-only with behaviours in the game layer?
  (This is open question Q3 from the layering research.)
- **E4. One adapter per set or per style family:** "Isometric 2D" could be backed by SmallScaleInt and Kenney
  isometric. Per set is simpler; per family means one choice in the picker covers both. (Q5.)
- **E5. Adapters as packages or copied into each game:** packages mean fixes reach every game; copies mean games
  never change underneath you. Recommendation: packages, with an eject command. (Q1.)
- **E6. Map editing:** agents write maps as data now; do you want a map painter in the editor later? It is new UI, so
  it needs your sign-off. (Q2.)

**Assets**
- **A1. When to start the big asset pass:** the searchability research (#364) and re-preprocessing (#353–#357) wait
  for your go. Are there more packs you want to add first? Which ones?
- **A2. Outlines:** dioramas stay outline-free with one sheet of outline options. Should creators be able to pick an
  outline for their game (a style option), or is it the agent's choice?
- **A3. Music:** Pixabay curated playlists download overnight. Do you want a second source, and should the audio
  style picker show mood only, or mood plus a few example tracks?
- **A4. Spotify:** confirm it stays out of game audio (its policy forbids syncing music to games), with at most an
  optional "listen while building" player in the studio.
- **A5. Voice:** ElevenLabs works. Which comes first: two-way voice chat with the build agent, or character dialogue
  with voice options (three voices per character, pick one, "new voice costs more")?

**Product and QA**
- **P1. QA scope:** for your first end-to-end QA, which genre and style should the test game be? (Platformer with
  SmallScaleInt or KayKit is what the build is best at.)
- **P2. Who uses it next:** is the first audience still just your family, or should anything change for friends
  (sign-in, sharing, the public splash site)?
- **P3. What "done for V1" means to you now:** the original V1 plan had no V2/V3. With today's asset and engine ideas,
  should the engine-layer work count as V1 or come after?

## 6. Blockers Kevin holds (do these when convenient)

| Blocker | Why it matters | What to do |
|---|---|---|
| **Funnel go-ahead** | The prod deploy of the new style step is built and waiting; the web app needs the NUC's API reachable from Netlify | Say "funnel" to Claude |
| **GitHub App + bot accounts** | Real game creation needs them; without them the loop stops at "Creating your game…" | Create the OGM GitHub App and the two machine users (on your reminders list) |
| **Codex gamebuilder login** | The per-game build daemons sign in with it | `aiur-main login codex gamebuilder` |
| **Go for the asset pass** | #364 and #353–#357 are parked on your word | Tell Claude when your final packs are in |
| **Engine decisions E1–E6** | Shape the next tickets | Answer in this conversation |
| **Device proof (#340)** | Proves second loads are fast on your iPad and Android | Needs you and the devices, after the caching work lands |

## 7. What to send back

A short list: each question id (E1…P3) with Kevin's answer in his own words, any blocker he cleared, and anything new
he asked for. Claude turns it into tickets and decisions.
