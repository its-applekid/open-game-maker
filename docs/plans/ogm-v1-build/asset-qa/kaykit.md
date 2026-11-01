# KayKit Complete v7 asset QA

Run on the asset-library host, 2026-11-01, with `preprocess-kaykit@0.1` from PR #166 (main @ abe38fb), one pack per invocation so a dead session loses at most one pack. Source: `assets-local/packs/kaykit-*` (bundle `kaykit-complete@7`). Nothing under `assets-local` is committed; this file is the record.

**Status: in progress.** The per-pack driver (`/tmp/claude-1001/-home-orangekid-games-open-game-maker-2000/40d2abe5-45a7-495a-93b5-3fd7c6705d68/scratchpad/qa2/driver.sh`, started 14:29) is still running; this file is a snapshot taken while it ran and must be regenerated (`python3 -I /tmp/claude-1001/-home-orangekid-games-open-game-maker-2000/40d2abe5-45a7-495a-93b5-3fd7c6705d68/scratchpad/qa2/finish_qa.py`) once `driver.log` ends with `ALL DONE`. Done: 16 packs, 1115 models, 2.3 s/model. In progress: `kaykit-restaurant-bits`. Pending: 3268 models in `kaykit-board-game-bits` (243), `kaykit-dungeon-pack` (283), `kaykit-forest-nature-pack` (1588), `kaykit-medieval-hexagon-pack` (404), `kaykit-platformer-pack` (525); about 2.0 h at the current pace. `forest-nature-pack` (1588 models) is the one PR #166 flagged for lineup size and memory; watch its `rc` in the run log.

## Counts

- Packs: 23 (collection cards: 23; lineups: 16; packs with canonical `.gltf`: 22).
- Canonical `.gltf` models: 4383; item cards written: 1115; thumbnails: 1254; load failures: 0.
- `.glb` files the pipeline does not card (see *Rigged characters*): 109.
- Rigged item cards: 0. Triangles per model: median 456, max 13236; over 300k (flag `oversized-for-mobile`): 0.

| pack | .gltf | cards | thumbs | lineup | .glb skipped | tris median | tris max |
|---|---|---|---|---|---|---|---|
| adventurers | 58 | 58 | 58 | yes | 13 | 284 | 1696 |
| block-bits | 58 | 58 | 58 | yes | 0 | 848 | 2076 |
| board-game-bits | 243 | 0 | 120 | no | 0 | 0 | 0 |
| character-animations | 0 | 0 | 0 | no | 16 | 0 | 0 |
| city-builder-bits | 73 | 73 | 73 | yes | 0 | 368 | 1885 |
| dungeon-pack | 283 | 0 | 0 | no | 0 | 0 | 0 |
| fantasy-weapons-bits | 48 | 48 | 48 | yes | 0 | 664 | 2368 |
| forest-nature-pack | 1588 | 0 | 0 | no | 0 | 0 | 0 |
| furniture-bits | 74 | 74 | 74 | yes | 0 | 240 | 2278 |
| halloween-bits | 102 | 102 | 102 | yes | 0 | 260 | 5382 |
| holiday-bits | 138 | 138 | 138 | yes | 0 | 678 | 13236 |
| medieval-hexagon-pack | 404 | 0 | 0 | no | 0 | 0 | 0 |
| mixed-bag | 59 | 59 | 59 | yes | 0 | 873 | 3457 |
| mystery-monthly-series-4 | 49 | 49 | 49 | yes | 31 | 610 | 7950 |
| mystery-monthly-series-5 | 46 | 46 | 46 | yes | 18 | 652 | 5206 |
| mystery-monthly-series-6 | 36 | 36 | 36 | yes | 18 | 950 | 9042 |
| platformer-pack | 525 | 0 | 0 | no | 0 | 0 | 0 |
| prototype-bits | 85 | 85 | 85 | yes | 3 | 98 | 3996 |
| resource-bits | 132 | 132 | 132 | yes | 0 | 640 | 5370 |
| restaurant-bits | 225 | 0 | 19 | no | 0 | 0 | 0 |
| rpg-tools-bits | 69 | 69 | 69 | yes | 0 | 381 | 3605 |
| skeletons | 19 | 19 | 19 | yes | 10 | 534 | 1519 |
| space-base-bits | 69 | 69 | 69 | yes | 0 | 486 | 1841 |

## Load failures

- None.

## Rigged characters and animation clips (not carded)

`discover_models` in `scripts/assets/preprocess_kaykit.py` takes `.gltf` only. Every KayKit rigged character (Adventurers, Skeletons, the Mystery Monthly characters, the Character Animations mannequins, prototype `Dummy`) and every `Rig_Medium_*` / `Rig_Large_*` clip library ships only as `.glb`, so none of them has an item card, thumbnail, rig block or clip list, and `kaykit-character-animations` has no cards at all (no `.gltf`; `--expected-packs 23` refuses to run, 22 is the count with meshes the pipeline sees). Ticket step 3 (clips per rig, which characters share the rig) is unmet in the cards until the discovery accepts `.glb`. The facts below come from a direct `render-gltf.mjs` probe of those files (`glb-jobs.json`, output PNGs under `assets-local/derived/kaykit-glb-probe/`): 109 of 109 loaded, 0 failures.

**Rigs.** 99 of the 100 rigged files share one humanoid rig (`rig:89200673d97d`, 23 joints: same bone names and parents, so any `Rig_*` clip retargets onto any of them). Exceptions: `rig:a83c5e75e523`: `Mannequin_Medium.glb`.

**Clip libraries** (139 clips on `Rig_Medium`, 34 on `Rig_Large`; the full set is only in `kaykit-character-animations`, the other packs re-ship `General` and `MovementBasic`). Loop/canonical mapping is `CLIP_WORDS`/`LOOP_CLIPS` in `preprocess_kaykit.py`.

| library | clips | packs | clip names |
|---|---|---|---|
| `Rig_Large_CombatMelee.glb` | 16 | character-animations | Melee_1H_Slash, Melee_1H_Stab, Melee_2H_Attack, Melee_2H_Idle, Melee_2H_Slam, Melee_Block, Melee_Block_Attack, Melee_Block_Hit, Melee_Blocking, Melee_Dualwield_Slash, Melee_Dualwield_SlashCombo, Melee_Unarmed_Idle, Melee_Unarmed_Kick, Melee_Unarmed_Punch, Melee_Unarmed_Smash, T-Pose |
| `Rig_Large_General.glb` | 6 | adventurers, character-animations, mystery-monthly-series-4, mystery-monthly-series-5, mystery-monthly-series-6, skeletons | Death_A, Death_A_Pose, Hit_A, Idle_A, Idle_B, T-Pose |
| `Rig_Large_MovementAdvanced.glb` | 5 | character-animations | Dodge_Backwards, Dodge_Forward, Dodge_Left, Dodge_Right, T-Pose |
| `Rig_Large_MovementBasic.glb` | 3 | adventurers, character-animations, mystery-monthly-series-4, mystery-monthly-series-5, mystery-monthly-series-6, skeletons | Running_A, T-Pose, Walking_A |
| `Rig_Large_Simulation.glb` | 2 | character-animations | Flexing, T-Pose |
| `Rig_Large_Special.glb` | 2 | character-animations | EXPERIMENTAL_Large_Transform, T-Pose |
| `Rig_Medium_CombatMelee.glb` | 22 | character-animations | Melee_1H_Attack_Chop, Melee_1H_Attack_Jump_Chop, Melee_1H_Attack_Slice_Diagonal, Melee_1H_Attack_Slice_Horizontal, Melee_1H_Attack_Stab, Melee_2H_Attack_Chop, Melee_2H_Attack_Slice, Melee_2H_Attack_Spin, Melee_2H_Attack_Spinning, Melee_2H_Attack_Stab, Melee_2H_Idle, Melee_Block, Melee_Block_Attack, Melee_Block_Hit, Melee_Blocking, Melee_Dualwield_Attack_Chop, Melee_Dualwield_Attack_Slice, Melee_Dualwield_Attack_Stab, Melee_Unarmed_Attack_Kick, Melee_Unarmed_Attack_Punch_A, Melee_Unarmed_Idle, T-Pose |
| `Rig_Medium_CombatRanged.glb` | 20 | character-animations | Ranged_1H_Aiming, Ranged_1H_Reload, Ranged_1H_Shoot, Ranged_1H_Shooting, Ranged_2H_Aiming, Ranged_2H_Reload, Ranged_2H_Shoot, Ranged_2H_Shooting, Ranged_Bow_Aiming_Idle, Ranged_Bow_Draw, Ranged_Bow_Draw_Up, Ranged_Bow_Idle, Ranged_Bow_Release, Ranged_Bow_Release_Up, Ranged_Magic_Raise, Ranged_Magic_Shoot, Ranged_Magic_Spellcasting, Ranged_Magic_Spellcasting_Long, Ranged_Magic_Summon, T-Pose |
| `Rig_Medium_General.glb` | 15 | adventurers, character-animations, mystery-monthly-series-4, mystery-monthly-series-5, mystery-monthly-series-6, prototype-bits, skeletons | Death_A, Death_A_Pose, Death_B, Death_B_Pose, Hit_A, Hit_B, Idle_A, Idle_B, Interact, PickUp, Spawn_Air, Spawn_Ground, T-Pose, Throw, Use_Item |
| `Rig_Medium_MovementAdvanced.glb` | 13 | character-animations | Crawling, Crouching, Dodge_Backward, Dodge_Forward, Dodge_Left, Dodge_Right, Running_HoldingBow, Running_HoldingRifle, Running_Strafe_Left, Running_Strafe_Right, Sneaking, T-Pose, Walking_Backwards |
| `Rig_Medium_MovementBasic.glb` | 11 | adventurers, character-animations, mystery-monthly-series-4, mystery-monthly-series-5, mystery-monthly-series-6, prototype-bits, skeletons | Jump_Full_Long, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start, Running_A, Running_B, T-Pose, Walking_A, Walking_B, Walking_C |
| `Rig_Medium_Simulation.glb` | 14 | character-animations | Cheering, Lie_Down, Lie_Idle, Lie_StandUp, Push_Ups, Sit_Chair_Down, Sit_Chair_Idle, Sit_Chair_StandUp, Sit_Floor_Down, Sit_Floor_Idle, Sit_Floor_StandUp, Sit_Ups, T-Pose, Waving |
| `Rig_Medium_Special.glb` | 15 | character-animations | EXPERIMENTAL_Medium_Transform, Skeletons_Awaken_Floor, Skeletons_Awaken_Floor_Long, Skeletons_Awaken_Standing, Skeletons_Death, Skeletons_Death_Pose, Skeletons_Death_Resurrect, Skeletons_Idle, Skeletons_Inactive_Floor_Pose, Skeletons_Inactive_Standing_Pose, Skeletons_Spawn_Ground, Skeletons_Taunt, Skeletons_Taunt_Longer, Skeletons_Walking, T-Pose |
| `Rig_Medium_Tools.glb` | 29 | character-animations | Chop, Chopping, Dig, Digging, Fishing_Bite, Fishing_Cast, Fishing_Catch, Fishing_Idle, Fishing_Reeling, Fishing_Struggling, Fishing_Tug, Hammer, Hammering, Holding_A, Holding_B, Holding_C, Lockpick, Lockpicking, Pickaxe, Pickaxing, Saw, Sawing, T-Pose, Work_A, Work_B, Work_C, Working_A, Working_B, Working_C |

**Rigged characters without clips of their own** (64; triangles in brackets; all on the shared rig unless listed above):

- adventurers: `Barbarian` (7123), `Barbarian_Large` (11677), `Druid` (7784), `Engineer` (7500), `Knight` (5800), `Mage` (6668), `Ranger` (8900), `Rogue` (7562), `Rogue_Hooded` (7185)
- character-animations: `Mannequin_Large` (9148), `Mannequin_Medium` (6916)
- mystery-monthly-series-4: `ActionFigure` (5416), `Animatronic_Creepy` (4574), `Animatronic_Normal` (3834), `Clown` (5190), `Driver` (3568), `Monster` (3776), `MonsterCostume` (4245), `Ninja` (5403), `OrcRaider` (5849), `Paladin` (5152), `Paladin_with_Helmet` (5658), `Robot_One` (5718), `Robot_Two` (5282), `SpaceRanger` (4292), `SpaceRanger_FlightMode` (6554), `Survivalist` (5106), `Werewolf_Man` (3408), `Werewolf_Wolf` (3684)
- mystery-monthly-series-5: `BlackKnight` (8696), `Caveman` (4414), `Clanker` (17050), `CombatMech` (7688), `FrostGolem` (9214), `Helper_A` (5396), `Helper_B` (5174), `Hiker` (10407), `Protagonist_A` (8750), `Protagonist_B` (7842), `Superhero` (4538), `Tiefling` (9040), `Vampire` (6004), `Witch` (6210)
- mystery-monthly-series-6: `4GTN` (15476), `4GTN_Forgotten` (19488), `AvianSwordsman` (6394), `Cleric` (8217), `Farmer_A` (5758), `Farmer_B` (6874), `Hoarder` (20450), `Lorekeeper` (10738), `MagicalGirl` (8548), `Marksman` (7655), `Monstrosity` (10898), `OrcBrute` (12314), `PlantWarrior` (6138), `ToySoldier` (7850)
- prototype-bits: `Dummy` (3760)
- skeletons: `Necromancer` (6032), `Skeleton_Golem` (5822), `Skeleton_Mage` (4588), `Skeleton_Minion` (5288), `Skeleton_Rogue` (5278), `Skeleton_Warrior` (5934)

**Unrigged `.glb` props** (9, Mystery Monthly accessories shipped only as `.glb`, so also uncarded):

- `mystery-monthly-series-4/Orc_Axe.gltf.glb` (348 tris)
- `mystery-monthly-series-4/Orc_Backpack.gltf.glb` (1230 tris)
- `mystery-monthly-series-4/Orc_Club.gltf.glb` (366 tris)
- `mystery-monthly-series-4/Orc_DrinkingHorn.gltf.glb` (210 tris)
- `mystery-monthly-series-4/Orc_Wardrum.gltf.glb` (1672 tris)
- `mystery-monthly-series-4/Orc_WardrumStick.gltf.glb` (108 tris)
- `mystery-monthly-series-4/car.glb` (4737 tris)
- `mystery-monthly-series-4/cone.glb` (128 tris)
- `mystery-monthly-series-4/roofrack_empty.glb` (424 tris)

## Suspect pivots

Pivot `other` = origin neither at the base centre, the bounds centre nor a base corner (5% tolerance). 387 of the carded models, in four kinds:

- **Origin inside the model (283)**: hand-held items (weapons, tools, tomes, shields, potions, mugs) with the origin at the grip. Correct for attaching to a hand bone; treat as attachments, not placeable props. Per pack: rpg-tools-bits 43, adventurers 39, fantasy-weapons-bits 33, mystery-monthly-series-4 31, halloween-bits 21, mystery-monthly-series-5 19, holiday-bits 19, mystery-monthly-series-6 19, skeletons 13, furniture-bits 9, prototype-bits 8, mixed-bag 8, space-base-bits 7, block-bits 6, city-builder-bits 5, resource-bits 3.
- **Base at y=0, off-centre in XZ (90)**: stands on the ground but the footprint is not centred on the origin (vehicles, leaning trees, street furniture, modular pieces that snap on an edge); placing by origin puts them off their tile.
  - `kaykit-adventurers/assets/bow`
  - `kaykit-adventurers/assets/bow_withstring`
  - `kaykit-city-builder-bits/assets/streetlight`
  - `kaykit-city-builder-bits/assets/trafficlight_b`
  - `kaykit-city-builder-bits/assets/trafficlight_c`
  - `kaykit-city-builder-bits/assets/tree_b`
  - `kaykit-city-builder-bits/assets/tree_c`
  - `kaykit-city-builder-bits/assets/tree_e`
  - `kaykit-fantasy-weapons-bits/assets/bow_a`
  - `kaykit-fantasy-weapons-bits/assets/bow_a_withstring`
  - `kaykit-fantasy-weapons-bits/assets/bow_c`
  - `kaykit-fantasy-weapons-bits/assets/bow_c_withstring`
  - `kaykit-fantasy-weapons-bits/assets/fistweapon_a`
  - `kaykit-fantasy-weapons-bits/assets/fistweapon_b`
  - `kaykit-fantasy-weapons-bits/assets/fistweapon_b_stacked`
  - `kaykit-furniture-bits/assets/chair_c`
  - `kaykit-furniture-bits/assets/chair_desk_a`
  - `kaykit-furniture-bits/assets/chair_desk_b`
  - `kaykit-furniture-bits/assets/lamp_desk`
  - `kaykit-furniture-bits/assets/lamp_desk_headphones`
  - `kaykit-furniture-bits/assets/mug_a`
  - `kaykit-furniture-bits/assets/mug_b`
  - `kaykit-furniture-bits/assets/shelf_b_large`
  - `kaykit-furniture-bits/assets/shelf_b_large_decorated`
  - `kaykit-halloween-bits/assets/candle_triple`
  - `kaykit-halloween-bits/assets/gravemarker_b`
  - `kaykit-halloween-bits/assets/post`
  - `kaykit-halloween-bits/assets/post_lantern`
  - `kaykit-halloween-bits/assets/post_skull`
  - `kaykit-halloween-bits/assets/sign_left`
  - `kaykit-halloween-bits/assets/sign_right`
  - `kaykit-halloween-bits/assets/wagon`
  - `kaykit-halloween-bits/assets/wagon_hay`
  - `kaykit-holiday-bits/assets/candycane_large`
  - `kaykit-holiday-bits/assets/chair_large_blue`
  - `kaykit-holiday-bits/assets/chair_large_brown`
  - `kaykit-holiday-bits/assets/chair_large_green`
  - `kaykit-holiday-bits/assets/chair_large_red`
  - `kaykit-holiday-bits/assets/door_gingerbread`
  - `kaykit-holiday-bits/assets/hot_chocolate`
  - `kaykit-holiday-bits/assets/hot_chocolate_decorated`
  - `kaykit-holiday-bits/assets/mistletoe_b`
  - `kaykit-holiday-bits/assets/snowball_pile`
  - `kaykit-holiday-bits/assets/tracks_split_left`
  - `kaykit-mixed-bag/assets/arcademachine_a`
  - `kaykit-mixed-bag/assets/arcademachine_b`
  - `kaykit-mixed-bag/assets/flax_flower_a`
  - `kaykit-mixed-bag/assets/flax_flower_b`
  - `kaykit-mixed-bag/assets/sandcastle`
  - `kaykit-mixed-bag/assets/slushy_machine_blue`
  - `kaykit-mixed-bag/assets/slushy_machine_pink`
  - `kaykit-mixed-bag/assets/slushy_machine_yellow`
  - `kaykit-mixed-bag/assets/toolcart`
  - `kaykit-mixed-bag/assets/toolcart_tall`
  - `kaykit-mystery-monthly-series-4/11---may-2024---clown/assets/balloon_dog_blue`
  - `kaykit-mystery-monthly-series-4/11---may-2024---clown/assets/balloon_dog_green`
  - `kaykit-mystery-monthly-series-4/11---may-2024---clown/assets/balloon_dog_red`
  - `kaykit-mystery-monthly-series-4/11---may-2024---clown/assets/balloon_dog_yellow`
  - `kaykit-mystery-monthly-series-4/12---june-2024---robot/assets/robot_chargingstation`
  - `kaykit-mystery-monthly-series-5/6---december-2024---helpers/assets/drawers`
  - `kaykit-mystery-monthly-series-5/6---december-2024---helpers/assets/lamp_workbench`
  - `kaykit-mystery-monthly-series-5/6---december-2024---helpers/assets/toy_workbench`
  - `kaykit-mystery-monthly-series-5/6---december-2024---helpers/assets/toy_workbench_decorated`
  - `kaykit-mystery-monthly-series-6/1---july-2025---lorekeeper/assets/lorekeeper_tome`
  - `kaykit-prototype-bits/assets/door_a`
  - `kaykit-prototype-bits/assets/door_a_decorated`
  - `kaykit-prototype-bits/assets/door_b`
  - `kaykit-prototype-bits/assets/primitive_stairs_half`
  - `kaykit-prototype-bits/assets/target_pieces_f`
  - `kaykit-prototype-bits/assets/target_small`
  - `kaykit-prototype-bits/assets/target_stand_a`
  - `kaykit-prototype-bits/assets/target_stand_a_decorated`
  - `kaykit-prototype-bits/assets/target_stand_b`
  - `kaykit-prototype-bits/assets/wall_decorated`
  - `kaykit-prototype-bits/assets/wall_half`
  - `kaykit-prototype-bits/assets/wall_target`
  - `kaykit-prototype-bits/assets/weaponrack`
  - `kaykit-prototype-bits/assets/weaponrack_decorated`
  - `kaykit-resource-bits/assets/copper_nuggets`
  - `kaykit-resource-bits/assets/food_pile_small`
  - `kaykit-resource-bits/assets/gems_chest_empty`
  - `kaykit-resource-bits/assets/gold_nuggets`
  - `kaykit-resource-bits/assets/iron_nuggets`
  - `kaykit-resource-bits/assets/money_pile_small`
  - `kaykit-resource-bits/assets/silver_nuggets`
  - `kaykit-resource-bits/assets/stone_chunks_small`
  - `kaykit-rpg-tools-bits/assets/anvil`
  - `kaykit-rpg-tools-bits/assets/grindstone`
  - `kaykit-skeletons/assets/skeleton_arrow_broken_half`
  - `kaykit-space-base-bits/assets/rocks_a`
- **Floating above the origin (8)**: the mesh starts above y=0 (tunnel pieces whose origin is the floor they sit on); needs a y offset or a floor under it.
  - `kaykit-city-builder-bits/assets/building_a_withoutbase`
  - `kaykit-city-builder-bits/assets/building_b_withoutbase`
  - `kaykit-space-base-bits/assets/tunnel_diagonal_long_a`
  - `kaykit-space-base-bits/assets/tunnel_diagonal_long_b`
  - `kaykit-space-base-bits/assets/tunnel_diagonal_short_a`
  - `kaykit-space-base-bits/assets/tunnel_diagonal_short_b`
  - `kaykit-space-base-bits/assets/tunnel_straight_a`
  - `kaykit-space-base-bits/assets/tunnel_straight_b`
- **Entirely below the origin (6)**: hangs or sits below y=0 (terrain slabs, hanging chains, scattered target pieces); the origin is the attach point at the top.
  - `kaykit-mixed-bag/assets/chain_hanging_a`
  - `kaykit-mixed-bag/assets/chain_hanging_b`
  - `kaykit-prototype-bits/assets/target_pieces_c`
  - `kaykit-prototype-bits/assets/target_pieces_d`
  - `kaykit-space-base-bits/assets/terrain_low`
  - `kaykit-space-base-bits/assets/terrain_low_curved`

## Scale outliers

Largest bound over 100 m, under 1 cm, or more than 10x / less than 0.1x the pack median.

- `kaykit-city-builder-bits/assets/box_b`: largest bound 0.169632 (pack median 2)
- `kaykit-city-builder-bits/assets/trash_a`: largest bound 0.133296 (pack median 2)
- `kaykit-city-builder-bits/assets/trash_b`: largest bound 0.070842 (pack median 2)
- `kaykit-prototype-bits/assets/bullet`: largest bound 0.225 (pack median 2.8)

## Oversized for mobile

- None.

## Missing source variants

Canonical glTF without an FBX and/or OBJ companion of the same name.

- `kaykit-mystery-monthly-series-4/3---september-2023---monster-costume/character/building_c_broken`: missing .obj companion
- `kaykit-mystery-monthly-series-6/9---march-2026---avian-swordsman/assets/trainingdummy_base`: missing .obj companion

## Missing previews

- None.

## Duplicate model names across packs

61 model names appear in more than one pack (131 files). Each has its own card and thumbnail (card ids are pack-scoped); search by bare name returns all of them. Not deduplicated: same-name models differ in detail between packs (compare thumbnails before merging).

- `anvil`: block-bits, rpg-tools-bits
- `axe`: mystery-monthly-series-4, rpg-tools-bits
- `barrel`: block-bits, medieval-hexagon-pack
- `bench`: city-builder-bits, dungeon-pack, halloween-bits
- `bow`: adventurers, medieval-hexagon-pack
- `box_a`: city-builder-bits, prototype-bits
- `box_b`: city-builder-bits, prototype-bits
- `candle`: dungeon-pack, halloween-bits
- `candle_melted`: dungeon-pack, halloween-bits
- `candle_thin`: dungeon-pack, halloween-bits
- `candle_triple`: dungeon-pack, halloween-bits
- `chair_a`: furniture-bits, restaurant-bits
- `chair_b`: furniture-bits, restaurant-bits
- `chair_stool`: furniture-bits, restaurant-bits
- `chest`: block-bits, dungeon-pack
- `crate`: block-bits, restaurant-bits
- `cup`: furniture-bits, mixed-bag
- `door_a`: prototype-bits, restaurant-bits
- `door_b`: prototype-bits, restaurant-bits
- `firehydrant`: city-builder-bits, mystery-monthly-series-4
- `flag_a_blue`: board-game-bits, platformer-pack
- `flag_a_green`: board-game-bits, platformer-pack
- `flag_a_red`: board-game-bits, platformer-pack
- `flag_a_yellow`: board-game-bits, platformer-pack
- `flag_b_blue`: board-game-bits, platformer-pack
- `flag_b_green`: board-game-bits, platformer-pack
- `flag_b_red`: board-game-bits, platformer-pack
- `flag_b_yellow`: board-game-bits, platformer-pack
- `floor_dirt`: halloween-bits, prototype-bits
- `gem_large`: mystery-monthly-series-5, resource-bits
- `gem_medium`: mystery-monthly-series-5, resource-bits
- `gem_small`: mystery-monthly-series-5, resource-bits
- `hammer`: medieval-hexagon-pack, mystery-monthly-series-5, rpg-tools-bits
- `haybale`: halloween-bits, medieval-hexagon-pack
- `knife`: restaurant-bits, rpg-tools-bits
- `lantern`: holiday-bits, rpg-tools-bits
- `pickaxe`: dungeon-pack, rpg-tools-bits
- `pillar`: dungeon-pack, halloween-bits
- `pillar_a`: prototype-bits, restaurant-bits
- `pillar_b`: prototype-bits, restaurant-bits
- `pitchfork`: halloween-bits, mystery-monthly-series-6
- `plate`: dungeon-pack, restaurant-bits
- `plate_small`: dungeon-pack, restaurant-bits
- `post`: dungeon-pack, halloween-bits
- `shotgun`: adventurers, mystery-monthly-series-4
- `shovel`: medieval-hexagon-pack, rpg-tools-bits
- `stool`: dungeon-pack, holiday-bits
- `table_medium`: dungeon-pack, furniture-bits, prototype-bits
- `table_medium_long`: furniture-bits, prototype-bits
- `table_small`: dungeon-pack, furniture-bits, mystery-monthly-series-5
- `target`: medieval-hexagon-pack, prototype-bits
- `tent`: medieval-hexagon-pack, mystery-monthly-series-5
- `torch`: dungeon-pack, rpg-tools-bits
- `wall`: dungeon-pack, prototype-bits, restaurant-bits
- `wall_decorated`: prototype-bits, restaurant-bits
- `wall_doorway`: dungeon-pack, prototype-bits, restaurant-bits
- `wall_half`: dungeon-pack, prototype-bits, restaurant-bits
- `wall_window_closed`: dungeon-pack, prototype-bits, restaurant-bits
- `wall_window_open`: dungeon-pack, prototype-bits, restaurant-bits
- `weaponrack`: medieval-hexagon-pack, prototype-bits
- `wheelbarrow`: medieval-hexagon-pack, mystery-monthly-series-6

## Duplicate model names inside a pack

- `kaykit-medieval-hexagon-pack`: `projectile_catapult` at `Assets/gltf/units/neutral/projectile_catapult.gltf`, `Assets/gltf/buildings/neutral/projectile_catapult.gltf`

## Search check

`python3 -I scripts/assets/build_catalog.py` -> `470 packs, 1 inspiration collections, 6021 asset cards`.

`OGM_ASSETS_ROOT=assets-local gm assets search skeleton` (10 hits, first five):

```
t1:kaykit-skeletons/assets/skeleton_arrow_broken_half@1.1  model/prop  measured  chunky-low-poly  Skeleton Arrow Broken Half
t1:kaykit-skeletons/assets/skeleton_arrow_broken@1.1  model/prop  measured  chunky-low-poly  Skeleton Arrow Broken
t1:kaykit-skeletons/assets/skeleton_arrow_half@1.1  model/prop  measured  chunky-low-poly  Skeleton Arrow Half
t1:kaykit-skeletons/assets/skeleton_arrow@1.1  model/prop  measured  chunky-low-poly  Skeleton Arrow
t1:kaykit-skeletons/assets/skeleton_axe@1.1  model/weapon  measured  chunky-low-poly  Skeleton Axe
```

`gm assets search barrel --family chunky-low-poly` (10 hits):

```
t1:kaykit-block-bits/assets/barrel@1.0  model/prop  measured  chunky-low-poly  Barrel
t1:kaykit-prototype-bits/assets/barrel_a@1.1  model/prop  measured  chunky-low-poly  Barrel A
t1:kaykit-prototype-bits/assets/barrel_b@1.1  model/prop  measured  chunky-low-poly  Barrel B
t1:kaykit-prototype-bits/assets/barrel_c@1.1  model/prop  measured  chunky-low-poly  Barrel C
t1:kaykit-resource-bits/assets/food_barrel_empty@1.0  model/food  measured  chunky-low-poly  Food Barrel Empty
t1:kaykit-resource-bits/assets/food_barrel_fish@1.0  model/food  measured  chunky-low-poly  Food Barrel Fish
t1:kaykit-resource-bits/assets/fuel_a_barrel_dirty@1.0  model/prop  measured  chunky-low-poly  Fuel A Barrel Dirty
t1:kaykit-resource-bits/assets/fuel_a_barrel@1.0  model/prop  measured  chunky-low-poly  Fuel A Barrel
t1:kaykit-resource-bits/assets/fuel_a_barrels@1.0  model/prop  measured  chunky-low-poly  Fuel A Barrels
t1:kaykit-resource-bits/assets/fuel_b_barrel_dirty@1.0  model/prop  measured  chunky-low-poly  Fuel B Barrel Dirty
```

`--json` first hit carries `previews.thumb` = `packs/kaykit-skeletons/thumbnails/assets/skeleton_arrow_broken_half.png`, `resolved.style_family` = `chunky-low-poly`, `resolved.set` = `kaykit`, licence `CC0-1.0` (the PR #166 post-deploy check). The rigged characters are absent from every search (no cards, see above).

## Run log

| pack | rc | seconds | result |
|---|---|---|---|
| mystery-monthly-series-6 | 0 | 38 | 1 packs, 36 glTF models, 36 cards, 0 failures |
| mystery-monthly-series-5 | 0 | 36 | 1 packs, 46 glTF models, 46 cards, 0 failures |
| fantasy-weapons-bits | 0 | 32 | 1 packs, 48 glTF models, 48 cards, 0 failures |
| mystery-monthly-series-4 | 0 | 47 | 1 packs, 49 glTF models, 49 cards, 0 failures |
| adventurers | 0 | 48 | 1 packs, 58 glTF models, 58 cards, 0 failures |
| block-bits | 0 | 406 | 1 packs, 58 glTF models, 58 cards, 0 failures |
| mixed-bag | 0 | 182 | 1 packs, 59 glTF models, 59 cards, 0 failures |
| rpg-tools-bits | 0 | 189 | 1 packs, 69 glTF models, 69 cards, 0 failures |
| space-base-bits | 0 | 276 | 1 packs, 69 glTF models, 69 cards, 0 failures |
| city-builder-bits | 0 | 233 | 1 packs, 73 glTF models, 73 cards, 0 failures |
| furniture-bits | 0 | 169 | 1 packs, 74 glTF models, 74 cards, 0 failures |
| prototype-bits | 0 | 283 | 1 packs, 85 glTF models, 85 cards, 0 failures |
| halloween-bits | 0 | 164 | 1 packs, 102 glTF models, 102 cards, 0 failures |
| resource-bits | 0 | 88 | 1 packs, 132 glTF models, 132 cards, 0 failures |
| holiday-bits | 0 | 245 | 1 packs, 138 glTF models, 138 cards, 0 failures |

## Commands

All paths absolute, no `cd`. `<wt>` = `/tmp/claude-1001/-home-orangekid-games-open-game-maker-2000/40d2abe5-45a7-495a-93b5-3fd7c6705d68/scratchpad/wt-main` (worktree of `main` @ abe38fb, PR #166 merged), `<repo>` = `/home/orangekid/games/open-game-maker-2000`, `<qa>` = `/tmp/claude-1001/-home-orangekid-games-open-game-maker-2000/40d2abe5-45a7-495a-93b5-3fd7c6705d68/scratchpad/qa2`.

```sh
# per-pack driver, smallest pack first, resumable (skips packs with lineup.png + cards/ + a QA file)
nohup bash <qa>/driver.sh > <qa>/driver.out 2>&1 &
# each pack: nice -n 15 python3 -I <wt>/scripts/assets/preprocess_kaykit.py --root <repo>/assets-local --only kaykit-<pack> --qa <qa>/<pack>.md
# (which itself runs build_collection_cards.py --only, render-gltf.mjs, validate-cards.mjs, build_catalog.py and pnpm --filter @ogm/asset-cards index:build)

# probe of the 109 .glb files the discovery skips (rigs, clips, triangles)
node <wt>/apps/web/tools/render-gltf.mjs --root <repo>/assets-local --jobs <qa>/glb-jobs.json > <qa>/glb-probe.jsonl 2> <qa>/glb-probe.err

# catalog and search check
python3 -I <repo>/scripts/assets/build_catalog.py
OGM_ASSETS_ROOT=<repo>/assets-local node <wt>/packages/gm-cli/dist/index.js assets search skeleton
OGM_ASSETS_ROOT=<repo>/assets-local node <wt>/packages/gm-cli/dist/index.js assets search barrel --family chunky-low-poly
OGM_ASSETS_ROOT=<repo>/assets-local node <wt>/packages/gm-cli/dist/index.js assets search skeleton --json | head -1

# this file
python3 -I <qa>/finish_qa.py   # runs <qa>/merge_qa.py <qa> <repo>/assets-local <this file>, then rewrites the judgment sections
```

## What remains

- **Finish the driver run** (see Status) and regenerate this file; then the per-pack table, run log and duplicate lists cover all 22 mesh packs.
- **`.glb` discovery.** Extend `discover_models` to accept `.glb` (dedupe against a same-named `.gltf`), so the 64 rigged characters (two of them mannequins) and 9 `.glb`-only props get cards, thumbnails, a `rig` block and `rig.clips` from the libraries that share their `rig_id`; then `gm assets search knight` works and ticket step 3 is met. Set `--expected-packs` to the count with meshes (22) or make it count `.glb` packs too (23).
- **Thumbnail scene.** These thumbnails are the fixed three-quarter, neutral-light per-model renders from `render-gltf.mjs`; #143 (SmallScaleInt illustration tiers and the thumbnail-scene spec) is still open, so the pack lineups are grids of those, not dioramas. Re-render when #143 settles the scene, same script, same output paths.
- **Compatibility pass judgment.** `style-families.json` already records the set `kaykit` (all 23 packs, family `chunky-low-poly`) with advisory `compatible_with` candidates (`kenney-animated-characters-bundle`, `synty-polygon-viking-realm`, `kenney-prototype-kit`, `synty-polygon-prototype`, `quaternius-ultimate-monsters`). The by-eye comparison against the Synty POLYGON set, the Kenney 3D kits and Quaternius has not been done; do it from the lineups (`assets-local/packs/kaykit-*/lineup.png`) next to the Kenney/Synty lineups and record the verdict per candidate here and in the registry (visual compatibility decides, author is only a hint).
- **Pivot follow-up.** The 104 non-grip `other` pivots (off-centre footprints, floating tunnels, below-origin slabs) are the ones that misplace when dropped by origin; decide whether the scene tools snap by bounds instead of origin before normalising any model (`geometry.normalized` is `false` on every card).
- **Duplicates.** Same-name models across packs are kept as separate cards. The one in-pack duplicate (`medieval-hexagon-pack/projectile_catapult` under `Assets/gltf/units/neutral` and `Assets/gltf/buildings/neutral`) gets two canonical keys (the folder is part of the key), so two cards for one mesh; hide one when curating.
- **Stale leftovers.** The first attempt (13:10, all packs in one invocation) was abandoned after it had rendered adventurers, block-bits and 120 of 243 board-game-bits thumbnails; the per-pack driver re-renders those paths, so the partial folders (`kaykit-board-game-bits`) disappear as their pack runs. Nothing to clean by hand.

