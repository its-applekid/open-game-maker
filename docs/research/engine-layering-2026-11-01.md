# Engine layering: core, pack adapters, games (2026-11-01)

Kevin's ask: implementation agents should build so that the next game on the same asset pack is easier for the
next agent, sharing as much code as possible across games without making every game on one pack the same, and
without over-engineering. Three layers: engine code that survives engines and packs; code true for any game on a
given pack; code for one game. This document decides how those layers map onto the V1 monorepo
(`docs/plans/ogm-v1-build/architecture.md` §2), what goes in each, how code moves between them, and which skills
agents need. Grounded in the packs we own (`assets-local/packs`, 471 packs; SmallScaleInt, KayKit, LimeZu, Kenney,
Synty, tinyrpg, ansimuz, chiptune) and written so the same rules hold for any 2D, isometric, 3D or audio pack.

## 1. Recommendation

1. **Three layers with these names and homes.**
   - **L1 Engine core** = `@gm/sdk` + `@ogm/contracts` (`packages/sdk`, `packages/contracts`): what every game
     needs regardless of pack. Already exists and is already the right shape (core clock/rng/registry/events, test
     hooks, `assets` loader and tiers, `audio`, `fx`, `nav`, `proc`, `net`, camera rigs and input merge, and the
     two engine wrappers `three` and `phaser`). Nothing in this document changes it; it gains a few small helpers
     only when two adapters prove they need the same one (§3.3).
   - **L2 Pack adapter** = one workspace package per **set** (the visual-compatibility group from
     `packages/asset-cards/data/style-families.json`, e.g. `smallscaleint`, `kaykit`, `limezu-modern`), at
     `packages/pack-adapters/<set>/` published as `@gm/pack-<set>`. It depends on `@gm/sdk` (one engine area) and on
     the card types from `@ogm/asset-cards`; never on `services/*`, never on `assets-local/`. It holds the pack's
     **facts as data** (direction order, action vocabulary, frame sizes, rig id, grid size, tile categories), the
     **bindings** that turn a card into a running thing (an 8-direction sprite actor, an isometric tilemap with
     depth sort and wall collision, a rigged character with retargeted clips, an autotiled top-down map), the
     **map format and loader** for that set, and the **editor palette** (prefab list) derived from cards. New.
   - **L3 Game** = the creator's game repo (`gm new` scaffold + `src/features/<name>/` feature modules per A4
     §10.1). Gameplay loop, feel, tuning, story, inventory, HUD content, which pack actions mean what in this game.
     Exists in plan (OGM-023/024 templates, OGM-091 `gm new`).
2. **The layer test an agent applies to a piece of code** (in order; the first "yes" decides):
   1. Is it a fact about the pack (sheet layout, direction order, clip names, rig id, grid, tile size, pivot)?
      **Card** if the card schema has a field for it; otherwise **L2 data**. Never L3: a pack fact copied into a
      game is the bug that makes the next game harder.
   2. Would a second game on this set, with a different gameplay loop, need it **unchanged**? **L2.** If it would
      need it with different numbers, it is a pattern card with ranges, not code (B15 §4 rule 4).
   3. Would a game on a different set, or in the other dimension, need it unchanged? **L1.**
   4. Otherwise **L3**. When in doubt, L3: a game is cheap to fix, a shared package is not.
3. **Promotion rule ("rule of two").** Code is written in L3 first. It moves L3 → L2 when the **second** game on the
   set would copy it unchanged, or at once when it encodes a pack fact (test 1). It moves L2 → L1 when a **second
   adapter** (another set, preferably the other dimension) needs the same code. Promotion is a platform PR
   (`packages/*`), proposed by the build agent as a note in the PR's `## Promote` section and filed by the Executor
   as a platform ticket; reviewed with the normal `ce-code-review` plus the **layer checklist** (§3.4): themeless,
   no filled tunables, no gameplay decision, a fixture test that does not need pack bytes. Nothing is promoted
   speculatively, and nothing is promoted that a 300–800-token pattern card expresses as well.
4. **Pack knowledge reaches agents two ways, both small:** the asset cards (facts the CLI can print:
   `gm assets info`) and one **per-set skill** `skills/gm-set-<set>/SKILL.md` (≤ 60 lines) that names the adapter's
   exports, its map format, the conventions that are not on cards (row order, loop vs one-shot clips, contact
   frames) and the pattern cards under its `references/cards/` in OGM-094's format. `gm new --set <id>` installs the
   adapter dependency and only that set's skill, so a sandbox never carries 26 packs' worth of context. One
   cross-cutting skill `skills/gm-pack-adapter/SKILL.md` (≤ 60 lines) carries the layer test, the promotion rule and
   how to extend an adapter; `gm-core` gets one router row and a six-line "layers" paragraph.
5. **What L2 must never decide:** the gameplay loop, feel numbers, what a button does, HUD content, story, names,
   palette beyond the pack's own, which character is the player, difficulty. Adapters expose capability
   ("this actor can play `attack.melee.1`, 15 frames, contact frame 8") and the game chooses. Variety comes from the
   scope and the design loop (`gm-scope-options`, checkpoints, B15's three `gm-core` rules), not from the adapter,
   and the sameness eval (#96) gets one more metric: adapter calls per game must not predict the game's
   `renderGameToText()` shape.
6. **Map format:** adapters read **Tiled JSON** (`orientation: isometric | orthogonal`, finite layers, tile ids
   bound to asset ids through the lock) stored at `design/maps/<id>.json`; the agent authors maps as data and the
   editor paints them later. No bespoke map maker in V1 (§4.2 explains; open question Q2).
7. **Three adapters first, in this order:** `@gm/pack-smallscaleint` (isometric 2D, Phaser), `@gm/pack-kaykit`
   (3D, three + Rapier), `@gm/pack-limezu-modern` (top-down 2D, Phaser). Kenney families get adapters only when a
   game on them lands (rule of two applies to adapters as well). Audio sets get **no adapter**: their facts fit the
   card (`loop`, `bpm`, mood) and `gm-audio` already consumes them. Tickets in §8.

## 2. What exists and what the layers map onto

Verified on `main` at `4aadafb` (worktree of `origin/main`) and in the plan docs:

| Layer | Exists today | Owner tickets |
|---|---|---|
| L1 | `packages/sdk/src/{core,test,assets,audio,fx,nav,proc}`; `@gm/sdk` exports `.`, `./test`, `./assets`, `./audio`, `./fx`, `./nav`, `./proc`; `packages/contracts/src/{bridge,game,input,assets}.ts` with `GameModule`, `GameInstance`, `GmTestHooks`, `ActionFrame`, `CameraRig`, `AssetManifest` | #24 contracts (done), #49 core (done), #36 loader (done), #63 fx/nav/proc (done), #64 three (in progress), #65 phaser (in progress), #81 rigs + input, #92 net, #82 conformance |
| L2 | Nothing in code. The knowledge exists as cards (`sprite.animations[].sheets[]` with `frame_w/h`, `cols`, `rows`, `directions`; `sprite.facings`; `sprite.tile.layer`; `rig.rig_id`, `clips`; `kit.grid_m`) and in two ticket records (#155 SmallScaleInt cards, `asset-qa/kaykit.md`) | none |
| L3 | `templates/game-{2d,3d}` (not merged yet; #64/#65), `gm new` + skill pack (#46 done), `packages/game-repo-template` (#36-era provisioning), `skills/gm-core`, `skills/gm-build` | #46, #90 pattern cards, #95 wave 2, #80 verify |

The plan already fixes the rules that make L2 possible: engine objects are views rebuilt from plain state (A4
§10.1, OGM-023/024 invariants), the loader never derives file names (`assets/manifest.json` is the only source,
D-TIERS), one style family per game (D-FAMILIES), skills ship in the game repo (D-SKILLS-IN-REPO), and the sandbox
installs from a seeded offline store (D-SBX, #27). An adapter package is therefore just another pinned workspace
package that the store must carry; no new mechanism.

## 3. The layers in detail

### 3.1 L1 Engine core (`@gm/sdk`, `@ogm/contracts`)

Boundary: code any game wants unchanged whatever the pack and engine, plus the two engine wrappers. Test: "would a
Phaser top-down game on Kenney pixel art and a three.js KayKit dungeon both call this without a wrapper?" What is
there (fixed clock, seeded RNG, feature registry, hooks, tiers, loader, buses, grid A*, noise, net, rigs) passes.
Candidates this research found that L1 lacks and two adapters will need (promote when the second lands, §3.3):

- **Directional sprite math**: facing from a velocity vector into N compass directions (4 for LimeZu/RPG Maker
  sheets, 8 for SmallScaleInt), hysteresis so a diagonal walk does not flicker. Engine-free, ~40 lines.
- **Layered sprite compositor**: draw ordered part layers (body, eyes, hair, tool) into one texture per frame.
  SmallScaleInt `character-creator-modern` (`layer-order.json`, 1,834 files) and LimeZu `Farmer_Generator_Pieces`
  (Eyes, Hairstyles, Tools at 16/32/48) both need it; it is Canvas 2D, not Phaser.
- **Depth sort key**: `(y + footprintOffset, layer)` for 2D, already implied by Phaser `depth`; shared between the
  isometric and the top-down adapters.
- **Clip retarget by rig id**: three.js `AnimationClip` reuse across skinned meshes whose skeletons share
  `rig.rig_id` (KayKit's 99-of-100 shared humanoid). Any 3D set with a shared rig (Synty, Kenney animated
  characters) uses it; it belongs in `@gm/sdk/three` once KayKit proves it.

Versioning: `@gm/sdk` semver (today `package.json` in `packages/sdk`), pinned exactly in the game repo's
`package.json` and lockfile, present in the offline store. Upgrades are explicit platform jobs; `gm skills sync`
never touches dependencies. Nothing changes here.

### 3.2 L2 Pack adapter (`packages/pack-adapters/<set>/`, `@gm/pack-<set>`)

**Granularity: one adapter per set, not per pack and not per family.** Kevin's rule that a set is one seamless pack
(`asset-sets-one-seamless-pack`, `smallscaleint-house-isometric-style`) means the 26 SmallScaleInt packs share one
layout convention and one grid; one adapter. Families are too wide: `isometric-2d` also holds 23 Kenney isometric
packs with different tile sizes and no 8-direction characters, so one adapter per family would be two adapters in
one package behind flags. Per pack is too narrow (26 near-identical packages).

**Package shape (every adapter):**

```text
packages/pack-adapters/<set>/
  package.json          @gm/pack-<set>; deps: @gm/sdk (one engine area), @ogm/asset-cards (types only), zod
  src/conventions.ts    the pack facts as exported data, each with a `verified:` note (how it was measured)
  src/vocabulary.ts     canonical action/clip vocabulary → the set's names (and back)
  src/<binding>.ts      bindings: card + manifest entry → engine object(s) driven by plain state
  src/map.ts            Tiled JSON loader for this set's orientation; collision/occlusion layers from tile categories
  src/palette.ts        editor palette: prefab ids derived from cards (what the editor may place)
  src/index.ts          exports; nothing else is public
  test/fixtures/        synthetic sheets/GLBs generated in the test, never pack bytes
  README.md             ≤ 30 lines: what it binds, what it leaves to the game, how it was verified
```

Rules for every adapter (checked by the layer checklist, §3.4, and a format test in the adapter's own suite):

- **Data, not decisions.** An adapter tells a game what an asset *can* do and plays what the game asks for. It
  never maps an input action to an animation, never picks speeds, never adds a mechanic. Every number that is a
  choice is a parameter with no default, documented as a range in a pattern card.
- **Views from state.** Bindings are `sync(state)` functions over plain data (A4 §10.1); they hold no gameplay
  state and are rebuilt from `renderGameToText()` state. Simulation code in a game must compile without the adapter
  (the adapter is render- and collision-side only, except pure helpers such as `isoToWorld`).
- **Manifest in, never files.** Adapters resolve ids through `@gm/sdk/assets` `AssetLoader` and read layout from
  the manifest's card metadata (ticket T2, §8); they never see `assets-local/` and ship no asset bytes, so a
  private-licence set (SmallScaleInt, Synty) can have a public adapter.
- **One engine area.** A 2D adapter imports `@gm/sdk/phaser`; a 3D adapter imports `@gm/sdk/three`. An adapter
  never reaches into `core/` or `test/`. Engine-free helpers it needs from L1 are requested, not vendored.
- **Themeless API.** Exports use role names (`SpriteActor`, `IsoMap`, `RiggedCharacter`), never fiction
  (`Knight`, `Zombie`); the set's own names appear only inside `conventions.ts` and `vocabulary.ts`.
- **Size guard.** An adapter is small (first versions: hundreds of lines, not thousands). Anything a game would
  rather read than call is a pattern card in `skills/gm-set-<set>/references/cards/`.

Versioning and consumption: semver, pinned in the game repo like `@gm/sdk`; peer range on `@gm/sdk` minor;
installed by `gm new --set <id>` (ticket T4) which also records `set` in `gm.lock.json` next to `family` and `pov`
(OGM-091 already writes `{ v, template, family, pov, createdAt, gmVersion }`). The offline store (#27) must carry
each published adapter; the store is reseeded per adapter release the same way as for any dependency. A game may
**eject**: copy the adapter's `src/` into `src/pack/` and drop the dependency when it must diverge (Unity's
"import samples" and Godot's `addons/` folder both work this way); the skill says when that is right (rarely, and
only after the divergence is real).

### 3.3 Promotion and the over-engineering guard

| Move | When | Who | Reviewed how |
|---|---|---|---|
| L3 → card | A pack fact the card schema has a field for (`sheets`, `directions`, `rig_id`, `clips`, `grid_m`, `tile.layer`) | Intake / preprocessing (`gm packs import`, taggers); a build agent that finds a missing fact reports it in its PR under `## Promote` | Card schema validation; `gm packs index` |
| L3 → L2 | Second game on the set needs it unchanged, **or** it is a pack fact with no card field (row order, loop set, contact frames, footprint) | Build agent proposes (`## Promote` note); Executor files a platform ticket; a platform agent implements | `ce-code-review` + layer checklist; adapter test with synthetic fixtures; `gm-sdk check` on both templates unchanged |
| L2 → L1 | Second adapter needs the same code; or the code has no set-specific symbol left | Adapter author proposes in the adapter PR | Same, plus the L1 rule: no `Math.random`/`Date.now`, Node-testable, no engine import unless it is the wrapper area |
| L2 → L3 (demote/eject) | A game needs the binding to behave differently and the difference is gameplay, not a bug | Build agent, by copying `src/` into the game | Game PR; the adapter is unchanged |

**Not promoted (the guard):** code used by one game; anything whose correctness depends on a tunable value (that is
a card with a range); anything that decides feel, loop or content; code under ~30 lines that is cheaper to re-type
from a card than to version; a behaviour (an animal that wanders, a zombie that chases) until two games have used
the same card text unchanged, and even then it ships as a `behaviours/` module whose every tunable is required.
Kevin's example "how in-game animals work" therefore splits: *how to play the animal's clips correctly* (loop set,
speeds derived from the sheet, `TakeDamage` as one-shot-and-hold per `gm-design-loop`) is L2 now; *what the animal
does* is a pattern card (`wander-flee.md`, with ranges) until the rule of two fires.

### 3.4 Layer checklist (added to the PR template for `packages/pack-adapters/*` and to `gm-pack-adapter`)

1. No theme word in any export or type name (reuse OGM-094's blocklist test).
2. No filled tunable: every speed, duration, radius, count is a required argument or a card range.
3. No input action, HUD string, entity list or level in the package.
4. A test per binding using generated fixtures (`test/fixtures/make-sheet.ts` draws a numbered grid); no pack file
   read, no `assets-local` path anywhere (grep test).
5. `conventions.ts` entries each carry `verified: { how, date }` (a still, a measurement, a card id).
6. `README.md` has the two lists: "binds" and "leaves to the game".
7. Both scaffold templates still pass `gm-sdk check` (the adapter is additive; it changes no SDK behaviour).

## 4. L2 made concrete for three sets

Facts below were measured in `assets-local/packs` on 2026-11-01 (file names, PNG headers, cards, `asset-qa/kaykit.md`).

### 4.1 `@gm/pack-smallscaleint` (isometric 2D, Phaser; set `smallscaleint`, family `isometric-2d`)

**What the set ships** (26 packs; #155 carded them):

- Characters: `<Pack>/<Character>/<Action>/<Dir>/<Action>_<angle>_<frame>.png` per-frame folders **and**
  `Spritesheets/{Shadowless,With shadow}/<Character>/<Action>[_Shadowless].png` strips. HD packs: 128×128 frames,
  sheet 1920×1024 = 15 columns × 8 rows; 16-bit packs: 64×64 frames, 960×512. Every action has exactly 15 frames
  (Idle, Die, Melee, Run all 15). 29 actions per humanoid: `180Turn CastSpell CrouchIdle CrouchRun Die FrontFlip
  Idle Idle2 Kick Melee Melee2 MeleeRun MeleeSpin Pummel Rolling Run RunBackwards ShieldBlockMid ShieldBlockStart
  Slide SlideEnd SlideStart Special1 Special2 StrafeLeft StrafeRight TakeDamage UnSheathSword Walk`. Animals
  (`2d-animals-mega-pack-1`, 40+ species) have 10: `Attack1 Attack2 Attack3 Die Idle Idle2 Run TakeDamage Taunt
  Walk`. Cards already carry `sprite.animations[].sheets[]` (`frame_w 128, cols 15, rows 8`, `variant: shadow |
  shadowless`) and `directions: [E N NE NW S SE SW W]` (alphabetical: the card does not say which row is which).
- **Direction convention (measured):** frame names carry the compass angle in degrees, mathematical, counter-
  clockwise from east: `E=0, NE=45, N=90, NW=135, W=180, SW=225, S=270, SE=315` (`Walk_0_001.png` under `E/`,
  `Walk_135_…` under `NW/`, `Walk_270_…` under `S/`). The **sheet row order is written nowhere in the pack**; it must
  be measured once by rendering a sheet with row labels (`gm-verify`) and recorded in `conventions.ts` with a
  `verified` still. This is exactly the kind of fact that must live in one place.
- Tilesets (`fantasy-tileset-2d-isometric`, `2d-desert-fantasy-tileset`, `2d-hd-zombie-rural-tileset`,
  `2d-hd-zombie-interior-tiles`): `Environment/<Category> <Id>_<E|N|S|W>.png` pieces at 256×256 with four facings
  (1,876 files in the fantasy set: Ground 452, Wall 416, Misc 396, Roof 228, Stone 88, Tree 72, WallFlora 56,
  Flora 52, Door 32, Chest 24); `Animations/{Animated Tiles, Destructible tiles, Effects, Props}` per-frame folders
  (128×128) with Unity `.anim`/`.controller` files carrying frame timing (14 `.anim`, 8 `.controller` in the fantasy
  set); `Characters/{Player, Enemy 1-3, NPC1-3}` sheets at 1920×1024 with a different action list (`Attack1-5,
  AttackRun, CrouchIdle, …`). The family record says `perspective: isometric 2:1`, `tile_grid: 64/128/256 px`.
- Character creator (`character-creator-modern`, a `.unitypackage`): layered body parts, `layer-order.json` with
  per-layer `order` taken from the filename, `world: modern-zombie`.

**What the adapter contains:**

- `conventions.ts`: frame sizes per pack tier (64 / 128), 15 frames per action, the angle→direction table above,
  sheet row order (after measurement), variants (`shadow`, `shadowless`), tile piece size 256 with the diamond
  footprint (256 × 128 at 2:1; the piece's height above the footprint is drawn upward), facing suffix table,
  category → default layer (`Ground → floor`, `Wall|Door → wall`, `Roof → roof`, others → `decor`), Unity
  `.anim` frame-time reader (or the preprocessed `fps` from the card once the tagger writes it).
- `vocabulary.ts`: canonical roles → set names: `idle: [Idle, Idle2]`, `walk: Walk`, `run: Run`,
  `attack.melee.1..3: Melee, Melee2, MeleeSpin`, `attack.run: MeleeRun`, `cast: CastSpell`, `hit: TakeDamage`,
  `die: Die`, `block.start|hold: ShieldBlockStart|ShieldBlockMid`, `dodge: Rolling`, `crouch.idle|run`,
  `strafe.left|right`, `special.1..2`, `turn: 180Turn`, `sheathe: UnSheathSword`; animals map to the same roles
  with `taunt` extra. Loop set: `idle*, walk, run, crouch*, strafe*, block.hold`; one-shot-and-hold: everything
  else (per `gm-design-loop`: an 0.8 s punch over 2 s reads as three punches). The game decides which role a
  button plays.
- `SpriteActor` binding: `(loader, assetId, variant)` → Phaser texture + per-action, per-direction animation keys
  generated from the card's sheet geometry; `sync({x, y, facing, action, t})` sets frame and depth
  (`y + footprintOffset`), never reads input. Facing comes from L1's 8-direction helper once promoted; until then
  it is `facing8(vx, vy)` here.
- `IsoMap` binding: Tiled JSON (`orientation: isometric`, `tilewidth 256`, `tileheight 128`, layers `floor`,
  `wall`, `decor`, `roof`, object layer `spawns`) → Phaser `Tilemap` with `Orientation.ISOMETRIC` for `floor`,
  depth-sorted sprites for `wall`/`decor`/`roof` (pieces taller than the footprint cannot be tilemap tiles),
  `isoToWorld`/`worldToIso`, a **collision grid** derived from the `wall` layer and from `Door` state (the game
  toggles doors), and a **roof-hide** list for the `iso` rig's cutaway (OGM-025 occlusion hook). Facing variant
  (`_E/_N/_S/_W`) chosen from the tile's `rotation` property so one asset id serves four orientations.
- `palette.ts`: prefabs the editor may place = `Chest*`, `Door*`, `Tree*`, `Flora*`, `Stone*`, animated props,
  spawn; grouped by category from cards, with footprint and `validatePlacement` (must sit on `floor`, walls only on
  grid edges).
- `LayeredSprite` (creator kit): composite the `layer-order.json` layers into a `SpriteActor`-compatible sheet;
  moves to L1 when LimeZu's farmer generator lands (§3.1).

**What it deliberately leaves to the game:** which sheet is the player; movement model and speeds (the scaffold
has none; the platformer cards have ranges; an isometric movement card belongs to `gm-set-smallscaleint`); combat
(hit boxes, damage, timing beyond the contact frame the card names); doors/chests behaviour; inventory; dialogue;
HUD; which `world` (fantasy, desert, modern-zombie) and the mix of packs; story.

### 4.2 `@gm/pack-kaykit` (3D, three + Rapier; set `kaykit`, family `chunky-low-poly`)

**What the set ships** (`asset-qa/kaykit.md`, #148/#166/#177): 23 packs, 4,383 canonical `.gltf` props at a
median 456 triangles with a shared flat colormap per pack; 100 rigged characters as `.glb`, **99 on one 23-joint
humanoid rig** (`rig:89200673d97d`; `Mannequin_Medium` alone on another); clip libraries `Rig_Medium_*` (139 clips
in 8 files) and `Rig_Large_*` (34), the full set only in `kaykit-character-animations`, other packs re-shipping
`General` + `MovementBasic`. Clip names are a vocabulary already: `Idle_A/B`, `Walking_A/B/C`, `Running_A/B`,
`Jump_Start/Idle/Land/Full_Long/Full_Short`, `Melee_1H_Attack_Chop|Slice_Diagonal|Stab`, `Melee_2H_*`,
`Melee_Block|Blocking|Block_Hit`, `Ranged_Bow_Draw|Release`, `Ranged_Magic_Spellcasting`, `Hit_A/B`,
`Death_A/B(_Pose)`, `Spawn_Air|Ground`, `Interact`, `PickUp`, `Use_Item`, `Throw`, `Dodge_*`, `Crouching`,
`Sneaking`, the `Tools` library (`Chop/Chopping`, `Dig/Digging`, `Fishing_*`, `Hammer`, `Pickaxe`, `Saw`,
`Lockpick`), `Simulation` (`Sit_*`, `Lie_*`, `Cheering`, `Waving`) and `Skeletons_*` specials. Kits
(`dungeon-pack`, `city-builder-bits`, `space-base-bits`, `medieval-hexagon-pack`) are modular pieces on a grid the
kit card records as `kit.grid_m`.

**What the adapter contains:**

- `conventions.ts`: rig ids and joint count, the `Medium`/`Large` body split (which characters use which library),
  which clips loop (`*_Idle*`, `Walking_*`, `Running_*`, `Blocking`, `Aiming`, `Sneaking`, `Crouching`, `Fishing_Idle`,
  `Sit_*_Idle`, `Lie_Idle`) versus one-shot (`CLIP_WORDS`/`LOOP_CLIPS` already exist in
  `scripts/assets/preprocess_kaykit.py`; port the table, do not re-derive), colormap-per-pack, forward axis and
  scale (measured by the pipeline, `normalized: false` today), `grid_m` per kit from the cards.
- `vocabulary.ts`: the same canonical roles as 4.1 → KayKit names (`attack.melee.1: Melee_1H_Attack_Chop`, …,
  `hit: Hit_A`, `die: Death_A` with `Death_A_Pose` as the hold), so a game written against roles can swap
  SmallScaleInt for KayKit at the lineup stage without touching gameplay code.
- `RiggedCharacter` binding: load the character GLB through `@gm/sdk/assets` + `createGltf`, load the clip library
  GLBs once, **retarget by rig id** (same joint names → `AnimationClip` reuse on the character's `SkinnedMesh`),
  `sync({pos, yaw, action, t})` with cross-fade ~0.3 s and one-shot-and-hold; `contactFrame(role)` from a per-clip
  table that starts empty and is filled by looking (`verified` stills).
- `KitPlacer` binding: snap a piece to `grid_m`, rotate in 90° steps, `footprint` from `geometry.bounds_m`, and a
  Rapier collider recipe per piece category (`wall → cuboid from bounds`, `floor → none / trimesh`, `prop → none
  unless the game asks`); the game owns the physics world (`createPhysics`), the adapter only returns collider
  descriptions.
- `map.ts`: Tiled JSON `orientation: orthogonal` with `tilewidth = tileheight = grid_m × pixelsPerMetre` as the
  authoring grid for kits (Tiled is a fine editor for grid-placed 3D kits; the `z`/`rotation` properties carry
  stacking), plus an object layer for props and spawns; `palette.ts` from kit cards.

**Leaves to the game:** everything from 4.1's list, plus camera rig choice (`follow`, `iso`, `orbit` from OGM-025),
gravity and character controller (Rapier capsule in the 3D scaffold), what `Interact` does.

### 4.3 `@gm/pack-limezu-modern` (top-down 2D, Phaser; set `limezu-modern`, family `pixel-art`)

**What the set ships** (`limezu-modern-farm` 1.3, 8,695 files; siblings `modern-interiors`, `modern-exteriors`,
`modern-user-interface`, `fantasy-battlers`, `fungus-cave`): three hand-drawn scales `16x16/`, `32x32/`, `48x48/`
(not upscales; the Icons note says so explicitly) each with `Autotiles_<engine>_<px>.png` in **GameMaker and Godot
layouts**, `Animated_*`, `Characters_*`, `Animals_*` (Cats, Chickens_and_Roosters, Cows, Dogs, Donkeys, Ducks,
Goats, Pigs; cats are named individuals), `Crops_Growth_*`, `Vehicles_*`, `Single_Files_*`; `Icons/{16,24,32}`;
`Farmer_Generator_Pieces/{Character Pieces/{Eyes,Hairstyles,…}, Tools/{16,32,48}}`; `RPG_Maker_MV/` sheets
(3 × 4 frames, four directions down/left/right/up, the RPG Maker convention). Family traits: `pixel_size: 16 px
base`, `tile_grid: 16x16`, `perspective: topdown`.

**What the adapter contains:**

- `conventions.ts`: the three scales and the rule **one scale per game** (recorded in `gm.lock.json`; mixing reads
  as a mistake), RPG Maker MV sheet geometry (3 cols × 4 rows, row order down/left/right/up), the Godot 3×3-minimal
  and GameMaker 47-tile autotile layouts (a bitmask → tile index table each), animated tile frame counts, crop
  growth stage order, icon sizes.
- `vocabulary.ts`: `idle|walk` × 4 directions for characters (the set has no attack clips; a game that needs combat
  picks `fantasy-battlers`, which the adapter also covers with its battler sheet geometry), animal `idle|walk|
  sleep|eat` as the sheets provide, crop `stage[n]`.
- `TopdownMap` binding: Tiled JSON `orthogonal`, `tilewidth = tileheight = scale`, layers `ground`, `ground-
  detail`, `walls`, `above`, object layer; **autotile** painting from a boolean mask through the bitmask table so a
  map can store "grass here, path there" and the adapter picks the 47 edge pieces; collision from `walls` and from
  `Single_Files` objects flagged solid in their card; depth = `y + h`.
- `SpriteActor4` binding: 4-direction sheet actor (`facing4(vx, vy)`; shares the L1 facing helper with 4.1 once
  promoted).
- `LayeredSprite` for the farmer generator (shared with 4.1; the promotion case for §3.1).
- `palette.ts`: props, animals, crops, vehicles grouped from cards.

**Leaves to the game:** farming rules, day cycle, economy, which animals exist and what they do (cards: `wander`,
`follow`, `graze` with ranges), dialogue, inventory, the UI pack's use (`gm-ui-hud` decides HUD).

### 4.4 What this shows about the general rule

Across the three: an adapter is ~80% **tables** (sizes, orders, names, loop sets, layouts), ~20% **binding** (card
→ engine object, Tiled layer → collision/depth/occlusion), and 0% gameplay. The tables differ completely per set
(angle order vs. RPG Maker rows vs. rig ids) and that is why they must be per set; the binding shapes rhyme
(`SpriteActor`/`RiggedCharacter`, `IsoMap`/`TopdownMap`/`KitPlacer`) and that is where L1 helpers will come from
after two adapters exist. Audio sets (`drive-barbarian-chiptune`, Sidetrax, Kenney audio) have tables but no
binding beyond what `@gm/sdk/audio` already does, so they get card fields and `gm-audio`, not an adapter.

## 5. How agents find and use L2

1. **Cards carry the measurable facts** (already: sheet geometry, directions, facings, tile layer, rig id, clips,
   kit grid, bounds). Two gaps found: no `fps`/frame timing for SmallScaleInt sequences (the Unity `.anim` has it;
   tagger work under #77/#155), and the card index does not reach the game repo. Ticket T2 closes the second gap:
   `gm assets use` writes the resolved card's `sprite`/`rig`/`kit`/`geometry` blocks into `assets.lock.json`, and
   `gm build assets` copies them into `public/assets/manifest.json` under `assets[id].meta` (a marked tail in
   `packages/contracts/src/assets.ts`, additive, schema minor bump). Adapters read `meta`, never files.
2. **Per-set skill** `skills/gm-set-<set>/SKILL.md` (≤ 60 lines): when to load (the lock's `set`), the adapter's
   exports in one table, conventions not on cards (row order, loop set, contact frames, "one scale per game"), the
   `gm` commands for the set (`gm assets search --set smallscaleint --kind sprite/character`, `gm assets sheet`),
   pitfalls (per-frame folders vs sheets; shadow variants must not mix; iso pieces taller than a tile are sprites not
   tiles), and the card index. Pattern cards under `references/cards/` in OGM-094's format with a `set:` front
   matter key: `iso-depth-sort.md`, `eight-direction-facing.md`, `wall-collision-from-tiles.md`,
   `one-shot-and-hold.md`, `iso-movement.md` (ranges), `wander-flee.md` (ranges); KayKit: `clip-retarget.md`,
   `kit-snap.md`, `contact-frame.md`; LimeZu: `autotile-mask.md`, `four-direction-sheet.md`, `crop-stages.md`.
   `gm docs pattern <topic>` already prints cards from every installed skill's `references/cards/` (OGM-094), so no
   new command.
3. **Cross-cutting skill** `skills/gm-pack-adapter/SKILL.md` (≤ 60 lines): the layer test (§1.2), the promotion
   rule and guard (§3.3), the checklist (§3.4), how to propose a promotion (`## Promote` in the PR), how to eject,
   and the adapter package shape. Loaded when an agent touches `packages/pack-adapters/*` or writes `## Promote`.
4. **`gm-core`** gains one router row (`Using a set's adapter → gm-set-<set>`; `Changing shared pack code →
   gm-pack-adapter`) and a six-line paragraph: "Pack facts go on cards or in the adapter, never in the game. Call
   the adapter for rendering, collision and maps; write gameplay in `src/features/`. Note anything the next game on
   this set would copy under `## Promote`."
5. **`gm new --set <id>`** (T4) installs `@gm/pack-<set>` and copies only `skills/gm-set-<id>` into the game repo;
   `gm skills sync` keeps it in step; `AGENTS.md` lists it. Without `--set` (family only, e.g. Kenney) nothing is
   installed and the agent builds against `@gm/sdk` alone, as today.

## 6. Keeping games different

What keeps games apart is already decided (B15 §6, `gm-core`): the WHAT comes from scope; templates are scaffolds
with no entities; cards give ranges, never values; three distinct takes at scope time; the sameness eval. Adapters
add one risk and one safeguard:

- **Risk:** a rich adapter becomes the game ("every SmallScaleInt game is an iso dungeon with doors and chests").
  Safeguards: the adapter has no entities, no actions, no behaviours and no numbers (§3.2 rules; checklist 2–3);
  behaviours live in cards with ranges; `vocabulary.ts` maps roles, it does not bind buttons; the palette is what
  *may* be placed, not what *is*. The sameness eval (#96) gets metric **M6**: across the eval's games on one set,
  the set of adapter calls and the `renderGameToText()` key set must differ (two games with identical key sets fail
  as M1 does for code).
- **Safeguard the adapter gives:** because the pack's facts are correct and in one place, the agent spends its
  tokens on the game, not on re-deriving a sheet layout, and the scope's distinct take is what the player sees.
  Variety is a scope-time and design-loop property (`gm-scope-options`, checkpoints ≤ 3 per creation build), not an
  engine property.

## 7. Prior art, only what transfers

| Ecosystem | What they do | What we take |
|---|---|---|
| Godot addons / Asset Library | A plugin is a folder under `addons/` vendored into the project with `plugin.cfg`; upgrades are copy-overs | The **eject** path (an adapter can be copied into `src/pack/` when a game must diverge); the folder-with-manifest shape |
| Unity packages (UPM) + Input System | Semver packages resolved from a registry, immutable in `Library/`; "Import samples" copies editable code into `Assets/`; Input System's action maps are data the game binds | Pinned semver adapters, immutable in `node_modules`; copyable samples = pattern cards; **actions as data** already in `GameManifest.inputs` — adapters never bind them |
| Phaser plugins (scene/global, rexUI) | Registered at `Game` config, small, one capability each; Tiled JSON loader with isometric orientation built in | Adapters are thin and additive; **reuse Phaser's Tiled loader and isometric orientation** instead of a bespoke map runtime |
| Bevy crates (`bevy_ecs_tilemap`, `bevy_ecs_ldtk`, `bevy_asset_loader`) | Format and asset-source adapters as separate crates with a peer range on `bevy`; the game adds plugins | The closest analogue: **one crate per format/source**, peer-ranged on the engine, no gameplay inside |
| Love2D libraries (STI, anim8, bump) | Single-file libraries copied into the game; sprite-sheet grids described as data (`anim8.newGrid(w, h, imgW, imgH)`) | Sheet geometry as data (our cards already do this); the "200-line lib" culture is our pattern cards |
| PICO-8 carts | No libraries; every cart is self-contained; snippets travel by copy | Why L3 stays the default and why shared snippets must be themeless (the demoscene sameness problem) |
| RPG Maker tilesets and plugins | Hard format conventions (A1–A5 autotiles, 3×4 character sheets, 48 px) that every asset vendor follows (LimeZu ships `RPG_Maker_MV/` sheets); JS plugins extend a fixed loop | **Format conventions are worth encoding once** (our `conventions.ts`); the warning: RPG Maker games look alike because the *engine* fixes the loop, so L2 must not |
| Tiled / LDtk | Editor-neutral map JSON with layers, tilesets, orientation (orthogonal, isometric, staggered, hexagonal), object layers | **Tiled JSON as the map format** for all three adapters; the editor's tile painting (later) writes the same file |

## 8. Tickets

Filed 2026-11-01 (plain titles; the Executor queues them; labels from the existing `feature:*` / `build-lane:*` sets
because no `area:*` labels exist):

- **T1 — #183** `@gm/pack-smallscaleint`: adapter package, 8-direction sprite actor and vocabulary. Touches
  `packages/pack-adapters/smallscaleint/`, `pnpm-workspace.yaml` (one glob). Depends on #65, T2.
- **T1b — #184** `@gm/pack-smallscaleint`: isometric Tiled map, depth sort, wall collision, editor palette. Same
  package; depends on T1, #81 (occlusion hook).
- **T2 — #182** Asset lock and build manifest carry card metadata (`sprite`, `rig`, `kit`, `geometry`) as
  `assets[id].meta`. Touches `packages/contracts/src/assets.ts` (marked tail), `packages/gm-cli/src/commands/assets/use`,
  `packages/gm-cli/src/commands/build/assets`. Depends on #76 (comment posted there).
- **T3 — #185** `@gm/pack-kaykit`: rig-id clip retarget, canonical vocabulary, kit snapping and collider recipes.
  Touches `packages/pack-adapters/kaykit/`. Depends on #64, #177, T2.
- **T3b — #186** `@gm/pack-limezu-modern`: top-down Tiled map with autotile bitmask, 4-direction sheets, farmer
  compositor. Touches `packages/pack-adapters/limezu-modern/`. Depends on #65, T2.
- **T4 — #187** Layer rules: `gm-pack-adapter` skill, `gm-set-<set>` skills with cards, `gm-core` paragraph,
  `gm new --set` and the layer checklist. Touches `skills/gm-pack-adapter`, `skills/gm-set-*`, `skills/gm-core`,
  `packages/gm-cli/src/commands/new`, `packages/gm-cli/src/commands/skills`. Depends on #46 (done), #90 (card format).
- Comments (no new tickets): #76 (manifest `meta`, T2), #90 (`set:` front-matter key and the blocklist test reused
  by adapters), #95 (`gm-editor-tuning`: tunables an adapter exposes are declared by the game, not the adapter),
  #64 / #65 (wrapper hooks adapters need: Phaser `Tilemap` isometric orientation and `AnimationMixer` retarget are
  not in scope there; nothing to add, noted so the authors keep the areas open), #96 (metric M6).

## 9. Risks

- **Adapters grow into frameworks.** Guard: size rule, checklist 2–3, rule of two, and the eval metric. The first
  three adapters are deliberately table-heavy and binding-light.
- **Sandbox store size and churn.** Each adapter release is a reseed (#27). Keep adapters dependency-free beyond
  `@gm/sdk` and `zod`.
- **Pack facts still unmeasured.** SmallScaleInt sheet row order; KayKit clip contact frames; iso footprint of
  pieces taller than 128 px; `.anim` frame timing not yet on cards (#77/#155); KayKit `.glb` characters not carded
  until #177. Each adapter PR must include the `verified` stills for the facts it encodes.
- **Engine coupling.** Phaser's isometric tilemap handles `floor` well but walls and roofs taller than a tile must
  be sprites; if Phaser 4.2's isometric orientation misbehaves at 2:1 with 256 px pieces, `IsoMap` falls back to
  sprites for every layer (still Tiled JSON in; the game does not notice).
- **Private-licence sets.** Adapters contain code and tables only; tests use generated fixtures; `README.md` names
  the set without shipping bytes. `processing: local-only` is unaffected.
- **Two agents, one adapter.** Promotion PRs land in the platform repo while games build in their own repos; a game
  that needs the promoted code now ejects (copies) and swaps back to the package later. Stated in `gm-pack-adapter`.

## 10. Open questions for Kevin

- **Q1 Package vs copy.** Adapters as pinned workspace packages (recommended: one fix reaches every new game; old
  games upgrade explicitly) or copied into each game repo by `gm new` (simpler sandbox, no reseed, but fixes never
  propagate). Recommendation: package, with eject.
- **Q2 Map format.** Tiled JSON in `design/maps/` authored as data by the agent now, painted in the editor later
  (recommended), or a bespoke OGM map format and map-maker screen in V1 (keeps the prototype design rule, D-PROTOTYPE-DESIGN,
  since the editor UI is fixed; a map painter is new UI and would need your sign-off anyway).
- **Q3 Behaviours.** Keep "what an animal does" as pattern cards with ranges until two games use one unchanged
  (recommended), or ship a `behaviours/` module in the first SmallScaleInt adapter.
- **Q4 First adapter order.** SmallScaleInt first (your de facto isometric style) then KayKit then LimeZu, or KayKit
  first because the 3D scaffold (#64) is ahead of the 2D one (#65) in the build.
- **Q5 Set vs family granularity.** One adapter per set (recommended) means Kenney isometric packs wait for a
  game; if you want "isometric 2D" to be one creation choice backed by both Kenney and SmallScaleInt, the family
  needs a second adapter later, not a shared one.
