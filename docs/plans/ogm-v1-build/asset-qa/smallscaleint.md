# SmallScaleInt asset QA

Run on the asset-library host, 2026-11-01, with `smallscaleint-layout@0.1` / `build_collection_cards@0.2` from PR #173 (ticket #155, main @ 0ae2ee2), under `nice -n 15`, one process at a time (the agent fleet owned the box: load 40–65 on 12 cores, so each step ran at 3–5% of a CPU). Source: `assets-local/packs/smallscaleint-*` (26 packs, 353,038 PNG, ~12 GB) and the two character-creator `.unitypackage` files in the quarantine drop. Nothing under `assets-local` is committed; this file is the record.

**Status: complete for the 26 packs; fantasy creator not extracted.** All 26 collections built with 0 builder and 0 validator errors (27 collection cards counting the modern creator pack, 3,082 item cards, 165 character cards); contact sheets written (`assets-local/sets/smallscaleint/sheets/`: 165 character pages, 11 tileset-category pages, 3 world lineups); modern character creator extracted (1,834 layers); fantasy character creator refused by the extractor's member cap. The cards are **not fit for use in a game yet**: the sheet row order on every sheet-backed character card is wrong for 6 of 8 directions, and six layout conventions in the real packs are not recognised (details under *Findings*).

## Operator fixes needed before the pipeline would run

- **Licence id.** Intake wrote `"license": "unknown-itch-owned"` into all 26 `pack.json`; that string is not in `packages/asset-cards/data/licenses.json`, so the first run failed 26/26 with `licence 'unknown-itch-owned' is not in packages/asset-cards/data/licenses.json`. Each pack's `usage_rights` block (in-game/placeholder/style-reference/vision-input, private, in-build, local-only, confirmed by Kevin 2026-11-01) is exactly the `LicenseRef-smallscaleint-itch` ceiling, so the 26 `pack.json` files were repointed to `LicenseRef-smallscaleint-itch` (only that line changed; originals backed up in the session scratchpad, `packjson-backup/`). Intake (`gm-asset-intake` / `install_itch_pack.py`) should write the table id or the table should alias `unknown-itch-owned`.
- **`python3 -I scripts/assets/smallscaleint.py`** fails with `ModuleNotFoundError: No module named 'smallscaleint_unity'`: PR #173 made `build_collection_cards.py` isolated-mode safe (it inserts its own directory on `sys.path`) but not the extractor's own CLI. Workaround used: `python3 -I -c "import sys; sys.path.insert(0, '<wt>/scripts/assets'); import smallscaleint; sys.exit(smallscaleint.main([...]))"`.

## Counts

- Packs: 26 (+ `smallscaleint-character-creator-modern`, extracted this run; not in `smallscaleint.PACKS`, so collection card only, no world). Collection cards: 27, all `draft` (no `collection_tags.jsonl` rows), licence `LicenseRef-smallscaleint-itch`, `processing: local-only`, `set: smallscaleint`, `style_family: isometric-2d`.
- Item cards: 3,082 (characters 165, facing tiles 2,045, sequences 872 of which 327 are bogus sheet-folder cards). Source files on cards: 90,244 of 353,038 PNG (sheet-backed characters list only their sheets; the per-frame PNGs behind a sheet are not on any card).
- Characters by world: fantasy 52 lineup entries (43 distinct titles: the 64 px and HD casts share names), modern-zombie 58, creatures 55. Lineups: 3 (`worlds/{fantasy,modern-zombie,creatures}.html`), no broken image links, no omissions against the character cards (165 cards, 165 character pages, 165 lineup entries).
- Builder exceptions (`odd sheet geometry`, `shadow variants disagree`, `duplicate semantic card id`): none raised.

| pack | world | characters | actions | shadowless_split | sheets | dir_file_actions | fps | tiles | seq_tile | seq_prop | seq_fx | seq_item | sheet_folder_seq | cards | files |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2d-animals-mega-pack-1 | creatures | 55 | 557 | 557 | 1114 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 108 | 163 | 1546 |
| 2d-character-knight | fantasy | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 87 |
| 2d-character-pack-1 | fantasy | 9 | 267 | 267 | 534 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 27 | 648 |
| 2d-character-pack-2 | fantasy | 9 | 267 | 267 | 534 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 27 | 648 |
| 2d-demons-topdown-assetpack | fantasy | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 34 | 102 | 0 | 0 | 136 | 1564 |
| 2d-desert-fantasy-tileset | fantasy | 0 | 0 | 0 | 0 | 0 | 5 | 620 | 50 | 0 | 14 | 11 | 0 | 695 | 3568 |
| 2d-hd-barbarian-pack-1 | fantasy | 9 | 278 | 278 | 556 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 27 | 682 |
| 2d-hd-character-knight | fantasy | 1 | 29 | 0 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 34 |
| 2d-hd-character-pack-1 | fantasy | 9 | 267 | 267 | 534 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 27 | 648 |
| 2d-hd-enemy-pack-1 | modern-zombie | 13 | 144 | 144 | 288 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 26 | 39 | 418 |
| 2d-hd-undead-pack-1 | fantasy | 9 | 279 | 279 | 558 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 27 | 684 |
| 2d-hd-zombie-individual-sprites | modern-zombie | 36 | 540 | 0 | 0 | 540 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 46 | 64950 |
| 2d-hd-zombie-interior-tiles | modern-zombie | 0 | 0 | 0 | 0 | 0 | 0 | 501 | 7 | 0 | 5 | 0 | 0 | 513 | 2118 |
| 2d-hd-zombie-pack-1 | modern-zombie | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 76 | 0 | 0 | 0 | 76 | 524 |
| 2d-hd-zombie-rural-tileset | modern-zombie | 7 | 90 | 89 | 178 | 1 | 0 | 457 | 14 | 0 | 5 | 0 | 0 | 483 | 2301 |
| 2d-orcs-and-goblins-topdown | fantasy | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 31 | 87 | 0 | 0 | 118 | 1138 |
| 2d-projectiles-character-pack-1 | fantasy | 1 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 307 |
| 2d-projectiles-character-pack-2 | fantasy | 1 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 459 |
| 2d-topdown-archer-character | fantasy | 1 | 241 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 3742 |
| 2d-zombie-pack-2-top-down | modern-zombie | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 126 | 0 | 0 | 0 | 126 | 924 |
| character-creator-modern | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fantasy-tileset-2d-isometric | fantasy | 0 | 0 | 0 | 0 | 0 | 0 | 467 | 51 | 0 | 14 | 0 | 0 | 532 | 2838 |
| free-character-16-bit-thug-outlined | modern-zombie | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 21 |
| free-character-hd-survivor-w-bike | modern-zombie | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 23 |
| knight-demo-character | fantasy | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 72 |
| projectiles-2d-hd-character-pack-1 | fantasy | 1 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 150 |
| projectiles-barbarian-pack-hd | fantasy | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 10 | 150 |
| **total** | | **165** | **3029** | **2148** | **4325** | **541** | **5** | **2045** | **122** | **277** | **125** | **21** | **327** | **3082** | **90244** |

Character titles in more than one pack (9; the 64 px cast of `2d-character-pack-1` vs the 128 px cast of `2d-hd-character-pack-1`, plus `4Berserker` in `2d-hd-barbarian-pack-1` and `2d-hd-undead-pack-1`): `1Knight`, `2Archer`, `3Wizard`, `4Paladin`, `5CamoArcher`, `6Mage`, `7DeathKnight`, `8DarkLord`, `4Berserker`. (`9Samurai` exists in both character packs too but pack-2's cast differs beyond it.) Separate cards by design (scale, frame count and shadow treatment differ).

Card samples:

- `t1:smallscaleint-2d-hd-character-pack-1/characters/1knight@2026-11-01`: `sprite.animations` 58 (29 actions x `{walk, walk-shadowless}`), each `sheets: [{path, variant, frame_w: 128, frame_h: 128, cols: 15, rows: 8}]`, `frames: 0..14`, `directions: E,N,NE,NW,S,SE,SW,W`, no `fps`; `image` 1920x1024 (the sheet, not the frame).
- `t1:smallscaleint-2d-hd-zombie-individual-sprites/characters/zombiecop1@2026-11-01` (and the other 35): no sheets in the pack, so each action carries `direction_files` with 8 direction lists of 15 PNG paths; 64,950 files on 36 cards.
- `t1:smallscaleint-fantasy-tileset-2d-isometric/tiles/environment-sprites/wall-f7@2026-11-01`: `subkind: tile`, `facings: {E,N,S,W}`, 256x256 each, `tile: {layer: decor, autotile: none}` (all 467 tiles in the pack have exactly four facings).
- `t1:smallscaleint-2d-desert-fantasy-tileset/sequences/animations-effects-buff1@2026-11-01`: `subkind: fx`, 1 animation, `fps: 12` (one of the 5 cards whose `.anim` file is named like its folder).
- `t1:smallscaleint-2d-hd-enemy-pack-1/sequences/spritesheets-shadowless-10caster@2026-11-01`: `subkind: prop`, "frames" = the character's 11 action sheets (bogus, see *Findings*).

Contact sheets (all paths below `/home/orangekid/games/open-game-maker-2000/assets-local/sets/smallscaleint/sheets/`):

- World lineup: `worlds/fantasy.html` (52 cells), `worlds/modern-zombie.html` (58), `worlds/creatures.html` (55). Each cell is the first `S` frame of the character's first action (`<Char>/<Action>/S/<Action>_270_001.png`), or, for the 7 fantasy cards without per-frame folders (`2D Character Knight`, `With shadows`, the two projectile "characters", the archer, the demo knight, `Projectiles - 2D HD Character pack 1`), a whole 960x512 / 1920x1024 sheet.
- Character sheets: `characters/smallscaleint-2d-hd-character-pack-1-1knight.html` (58 cells, one per animation, 29 of them the `-shadowless` twins showing the same `S` frame), `characters/smallscaleint-2d-character-pack-1-1knight.html`, `characters/smallscaleint-2d-animals-mega-pack-1-alpacha.html`.
- Tileset-category sheets (11): `tiles/smallscaleint-fantasy-tileset-2d-isometric-{animations,characters,environment,other}.html`, `tiles/smallscaleint-2d-desert-fantasy-tileset-{animations,characters,environment}.html`, `tiles/smallscaleint-2d-hd-zombie-interior-tiles-{characters,tiles}.html`, `tiles/smallscaleint-2d-hd-zombie-rural-tileset-{animations,isometric-tiles}.html`. The `-characters` pages exist only because the tileset characters were carded as `tile` sequences.

Column meaning: `characters` = character cards; `actions` = distinct actions on them (a `*-shadowless` twin of an action is counted under `shadowless_split`, see *Findings*); `sheets` = action sheets with recorded geometry; `dir_file_actions` = actions carried only as per-direction frame lists; `fps` = animations with a frame rate (always 0, see *Findings*); `tiles` = facing tiles (`_E/_N/_S/_W`); `seq_*` = numbered-frame sequences by subkind; `sheet_folder_seq` = the bogus sequence cards made from `Spritesheets/*` folders; `files` = source files listed on the cards.

## Slicing verifications (three characters)

Method: slice each action sheet by the geometry recorded on its card (`sprite.animations[].sheets[]`: `frame_w`, `frame_h`, `cols`, `rows`) with Pillow/numpy from the Sprite Forge venv (`~/.local/share/ogm/forge-venv/bin/python -I`, system Python has neither PIL nor ImageMagick), and compare every cell with the numbered PNGs of the per-frame direction folders (`<Character>/<Action>/<Dir>/<Action>_<angle>_<nnn>.png`). Script: `slice_check.py` in the session scratchpad.

1. **64 px: `2d-character-pack-1` / `1Knight` / `Walk`.** Card records `Spritesheets/With shadow/1Knight/Walk.png` 960x512 → 15 cols x 8 rows of 64x64, `frames` 0..14, `directions` `E,N,NE,NW,S,SE,SW,W`. Pixel result: the recorded S row (row 4) is **not** S; it is W (max diff 255 in every cell). Row 2 holds S, frame for frame, in the right order, for 15 of the 17 per-frame files: `Walk_270_031.png` and `Walk_270_033.png` (the last two) are not on the sheet. Same for all eight directions (every direction folder has 17 frames; the sheet has 15 columns).
2. **HD 128 px: `2d-hd-character-pack-1` / `1Knight` / `Walk`.** Card records 1920x1024 → 15 cols x 8 rows of 128x128. All 8 direction folders (15 frames each) match a sheet row exactly, frame for frame, order preserved; but the row order is **`E, SE, S, SW, W, NW, N, NE`** (clockwise from east, i.e. file angles 0, 315, 270, 225, 180, 135, 90, 45), not the alphabetical order the card writes. The recorded S row (4) is W; S is row 2. The `walk-shadowless` twin action (`Spritesheets/Shadowless/1Knight/Walk_Shadowless.png`) has the same geometry and the same row order.
3. **Tileset character: `fantasy-tileset-2d-isometric` / `Characters/Player` / `Walk.png`.** No card records this sheet (see *Findings*: the `Characters/*` folders of the tileset packs are not recognised as characters), and the pack ships sheets only, so there is no per-frame source to compare against. Structural check only: 1920x1024 splits into 15 cols x 8 rows of 128x128 with every cell drawn; it is the same geometry as the HD characters but not the same pixels as the HD knight or the desert `player1` (all three differ). Pixel comparison for a tileset character is impossible with the shipped files.

Mapping of every direction folder to its sheet row (both knights, `Walk`):

| folder (angle) | E (0) | SE (315) | S (270) | SW (225) | W (180) | NW (135) | N (90) | NE (45) |
|---|---|---|---|---|---|---|---|---|
| sheet row | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| card label for that row | E | N | NE | NW | S | SE | SW | W |

Six of eight row labels on every sheet-backed character card are wrong; only E (row 0) is right by construction and nothing else coincides.

## Findings

- **Direction order.** `smallscaleint.DIRECTIONS = ("E","N","NE","NW","S","SE","SW","W")` is the alphabetical folder order, and the reader writes it as the sheet row order whenever a sheet has 8 rows. The vendor's sheets are laid out clockwise from east: `E, SE, S, SW, W, NW, N, NE`. Every `sheets[]` consumer (the `S` preview pick in the contact sheets takes the per-frame folder instead, so the sheets *look* right) will draw the wrong facing. Fix: a row-order constant for sheets, separate from the folder list, verified by the per-frame match above.
- **Shadowless sheets are separate actions.** The real packs name them `Spritesheets/Shadowless/<Char>/<Action>_Shadowless.png` (the fixture in `test_smallscaleint.py` uses `Shadowless/<Char>/<Action>.png`). `sheet_entries` keys on the file stem, so `Walk_Shadowless` becomes action `walk-shadowless` with one `shadowless` sheet, next to `walk` with one `shadow` sheet. Every sheet-backed character carries 2x actions (e.g. HD enemy `10Caster`: 22 animations for 11 actions; pack-1 `1Knight`: 58 for 29), and the "shadow variants must agree" check never runs. Strip a `_Shadowless` suffix from the stem.
- **Sheet folders become bogus sequence cards.** `character_cards` adds direction frames to `consumed` but not the sheet PNGs it mapped, so `sequence_cards` re-emits each `Spritesheets/<Variant>/<Char>/` folder as a `prop` card whose "frames" are the character's action sheets (`sequences/spritesheets-with-shadow-1knight`, …). The numbered actions (`Attack1`, `Idle2`, …) make them pass the "two numbered PNGs" test. Counted as `sheet_folder_seq` in the table. Add the sheet paths to `consumed`.
- **64 px sheets drop frames.** For `2d-character-pack-1` `Walk`, every direction folder has 17 frames and the sheet 15 columns; the last two (`_031`, `_033`) are missing from the sheet. The card takes `frames` from the sheet (15) and drops `direction_files` when a sheet exists, so the two frames are unreachable from the card. Whether this holds for other actions/characters was not checked frame by frame; the per-frame counts (17 in pack-1 vs 15 in hd-pack-1 for `Walk`) suggest the 64 px pack was re-exported with a different frame step.
- **fps on 5 cards of 3,082.** 78 `.anim` files exist (desert tileset 64, fantasy tileset 14), all `m_SampleRate: 12`. `animation_rates` keys by the file stem and `sequence_cards` looks up the folder slug; the stems are clip names (`Wall D Explosion Stone_Destroy`, `Clay explosion small_Idle`, `Generic wood explosion Small_Idle`) that equal the folder name only for desert `Buff1`–`Buff4` and `PortalIdle`, so those 5 sequence cards carry `fps: 12` and the other 73 clips reach no card; the fantasy tileset has 0. The character packs ship no `.anim` at all. Since every rate in the corpus is 12, a per-pack default of 12 fps for the two tileset packs would be correct; the character packs stay "fps absent".
- **Top-down packs have no characters.** `2d-demons-topdown-assetpack`, `2d-orcs-and-goblins-topdown`, `2d-zombie-pack-2-top-down` and `2d-hd-zombie-pack-1` ship one horizontal strip per action (`Combined/<Name>/Attack 1.png`, `Zombies with shadow/<Name>/Walk.png`, `With shadow/<Name>/Attack1.png`), no direction folders and no `Spritesheets/<Char>/` tree. The numbered action names make each character folder a numbered "sequence", so every character is one `prop` card whose frames are its action strips (demons 34, orcs 31, zombie-pack-2 126 incl. the `Shadows` subfolders titled just `Shadows`, hd-zombie-pack-1 76 = 38 zombies x 2 variants), and the `Shadows`/`Effects` subfolders of the demons/orcs packs become `fx` cards (102 and 87). 0 characters from four packs; the modern-zombie lineup shows only the HD enemy, individual-sprites and rural casts.
- **The two `projectiles-character-pack` packs and the archer are single bogus characters.** The flat fallback triggers on the word `character` in the pack id, so `2d-projectiles-character-pack-1/2` (projectile sequences only) each become one `character` card with 23/29 "actions" (one per projectile folder), while `projectiles-barbarian-pack-hd`, whose id lacks the word, correctly yields 10 `item` sequences. `2d-topdown-archer-character` lays its actions out at the root (`<Action>/<Dir>/<frames>`, no character folder); `frame_groups` wants three path levels, finds two, and the fallback makes one character with 241 "animations" named `default`, `e`, `n`, … (one per `<Action>/<Dir>` folder) instead of 30 actions x 8 directions.
- **`With shadows` (plural) is not a variant.** `2d-hd-character-knight` ships `Spritesheets/With shadows/<Action>.png`; `sheet_entries` knows `with-shadow`, `withshadow`, `shadow`, so `With shadows` is taken as the character name and its card is titled "With shadows" (29 actions, geometry correct). The fantasy lineup shows it under that caption.
- **Tileset-pack characters are not characters.** `fantasy-tileset-2d-isometric/Characters/{Player,Enemy 1..3,NPC1..3}` and the desert tileset's `Characters/*` (and `hd-zombie-interior-tiles/Characters/{Survivor 3,Thug1..5}`) hold one 1920x1024 sheet per action, not under a `Spritesheets` folder and with no direction folders, so `sheet_entries`/`frame_groups` ignore them and `sequence_cards` turns each folder into one sequence card (`sequences/characters-player`, subkind `tile` because the collection id contains "tile") whose "frames" are 24 different action sheets. No tileset pack has a character card; the fantasy/modern-zombie world lineups miss them.
- **Flat fallback mislabels the small packs.** `knight-demo-character` (72 sheets in three version folders) becomes one character with three "animations" (`knight-character-16-bit-version`, `…-hd-flat-version`, `…-hd-version`) of 24 "frames" each, where each frame is a different action sheet. `free-character-16-bit-thug-outlined` (21 PNG) and `free-character-hd-survivor-w-bike` (23 PNG) ship loose sheets at the root and get the same treatment (`default` animation). These need the sheet reader, not the frame reader: the files are 8-row action sheets.
- **Sheets-only packs.** `2d-character-knight` (87 PNG: `Spritesheets/{Shadowless,With Shadow}/<Action>.png` plus `1Knight/<Action>_Shadowless.png`) has the character name only in the pack title; `sheet_entries` wants `<Char>/<Action>.png` below the variant folder, finds one level too few, and the flat fallback makes one character with three "animations" (`1knight`, `shadowless`, `with-shadow`) of 29 sheets each. `2d-hd-character-knight` (29 PNG) is the `With shadows` case above.
- **Character image size.** Sheet-backed character cards record `image.width_px/height_px` of the first sheet (960x512 or 1920x1024), not the frame size; the frame size is only inside `sheets[]`.
- **Odd sheet geometry / disagreeing variants.** The run raised neither `odd sheet geometry` nor `shadow variants disagree` for any pack (but see the shadowless split: the variant check never had a pair to compare).
- **Duplicate characters across packs.** See the list after the table. `1Knight`…`9Samurai` exist at 64 px (`2d-character-pack-1`) and 128 px (`2d-hd-character-pack-1`), and the knight again in `2d-character-knight`, `2d-hd-character-knight` and `knight-demo-character`; the projectile packs pair with them by name. They stay separate cards (different scale, frame counts, shadow treatment), as the PR intended.
- **Collection cards are `draft`.** `scripts/assets/data/collection_tags.jsonl` has no SmallScaleInt rows, so all 26 collection cards have `describe.description = "<title> (Smallscaleint)"` only, status `draft`, plus the code-set `style_family: isometric-2d`, `set: smallscaleint`, `world`. `gm assets search` matches collection text, so pack-level searches (`desert chest`) depend on the item titles.

## Character creators (Unity packages)

Quarantine source: `assets-local/inbox/quarantine/20261101-180443-new-asset-packs-1BiGbkP7/files/new asset packs/`. Neither app build was run; the extractor only streams the `.unitypackage` tar.

- **Modern** (`Character+Creator+-+Modern+2D_6000.3.0f1.unitypackage`, 215 MB) → `assets-local/packs/smallscaleint-character-creator-modern/` in 9m20 wall (45 s CPU): 1,834 PNG layers, 239 MB, `pack.json` with `LicenseRef-smallscaleint-itch`, `layer-order.json` `order_source`: `path` 1,170, `filename` 664, `unity` 0. The content is a body-part layering kit: `Spritesheets/<Part>/<Action>.png` with 87 part folders (Bag1–4, Chest1–14, Head1–16, Legs1–9, Shoes1–3, NakedBody, Shadow, Shield1–3, Melee1–10, Pistol1–4, Shotgun1–2, Sniper1–2, MachineGun1–6, GunFire1–4, Mount1–6, Special1–2) x 19 actions = 1,653 sheets of 1920x1024 (the HD character geometry), plus `Example Scene/` (139 PNG: Effects, Environment, UI) and `Created Spritesheets/` (42 PNG: two example composites). No `.meta` carries `m_SortingOrder` (sorting order lives in prefab/scene YAML, not texture metadata), so the manifest's order is the fallback: `filename` for stems with a digit (`Attack1.png` → 1, `0001.png` → 1, mixing effects frames with attack sheets) and `path` for the rest. **The manifest does not express a draw order**; composing a character needs a hand-written part order (Shadow → NakedBody → Legs → Shoes → Chest → Head → Bag → weapon → GunFire), which is what the PR's "`order_source: path` requires visual confirmation" amounts to here for every layer.
- **Fantasy** (`CharacterCreatorFantasy-2026-v.1.3.unitypackage`, 456 MB, 1.2 GB tar) → **failed** after 17m25: `ValueError: Unity package exceeds safe extraction limits`. The archive has 157,266 members (39,374 GUID folders: 39,374 `pathname`, 39,374 `asset.meta`, 35,205 `asset`, 3,939 `preview.png`), 1.57x `MAX_UNITY_MEMBERS = 100_000` in `smallscaleint_unity.py`. Total bytes are well under the 4 GiB cap. The staging folder was removed on failure; nothing was written to `assets-local/packs/smallscaleint-character-creator-fantasy/`. Raising the member cap to 250,000 (or counting only `asset` members) would let it through; the memory profile is unchanged because members stream to disk.

## Search check

`python3 -I scripts/assets/build_catalog.py --root assets-local` → `471 packs, 1 inspiration collections, 9854 asset cards`. `node packages/asset-cards/scripts/build-index.mjs assets-local` → `10319 cards, 0 errors`.

`OGM_ASSETS_ROOT=assets-local gm assets search knight attack` (no lock): **no hits**. Animation names are not searchable text and the character titles are the vendor's folder names (`1Knight`), so the word `knight` does not match them; `attack` matches nothing. Same result with the game lock.

`gm assets search zombie` (no lock; 10 hits, all SmallScaleInt):

```
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-decay-01@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Decay 01
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-decay-04@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Decay 04
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-with-shadow-zombie-decay-01@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Decay 01
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-with-shadow-zombie-decay-04@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Decay 04
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-cop-01@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Cop 01
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-cop-03@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Cop 03
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-cop-04@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Cop 04
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-soldier-01@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Soldier 01
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-soldier-02@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Soldier 02
t1:smallscaleint-2d-zombie-pack-2-top-down/sequences/zombies-shadowless-zombie-soldier-04@2026-11-01  sprite/prop  measured  isometric-2d  Zombie Soldier 04
```

These are the top-down strip "props" (see *Findings*), not character cards; the 36 HD zombie character cards (`ZombieCop1`, `ZombieFemale1`, …) rank below them and the HD enemy and rural casts do not contain the word. Shadowless and with-shadow twins appear as separate hits.

`gm assets search desert chest` (no lock; 6 hits):

```
t1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-a1@2026-11-01  sprite/tile  measured  isometric-2d  Chest A1
t1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-a2@2026-11-01  sprite/tile  measured  isometric-2d  Chest A2
t1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-a3@2026-11-01  sprite/tile  measured  isometric-2d  Chest A3
t1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-a4@2026-11-01  sprite/tile  measured  isometric-2d  Chest A4
t1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-b1@2026-11-01  sprite/tile  measured  isometric-2d  Chest B1
t1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-b2@2026-11-01  sprite/tile  measured  isometric-2d  Chest B2
```

`desert` matches through the collection title (the collection card is `draft` with the title as its only description), `chest` through the tile titles: semantic facing-tile cards, 4 facings each.

**With a game lock** (`assets.lock.json`: `family: isometric-2d`, one asset from `smallscaleint-2d-hd-character-pack-1`, so `gameSets = [smallscaleint]`): all three queries return exactly the same rows as unlocked. The zombie and chest hits come from sibling packs of the locked one (`2d-zombie-pack-2-top-down`, `2d-desert-fantasy-tileset`), which the set lock admits; nothing outside the set matched these words in the first place, so the lock's exclusion path was not exercised by these three probes. `gm assets facets --family isometric-2d`: `sprite/tile 2167, sprite/prop 502, sprite/fx 227, sprite/character 165, sprite/item 21`, `style_family isometric-2d 3134`, `pov_fit iso 26`, `status measured 3082 / draft 26 / tagged 26`; no SmallScaleInt card carries `previews.thumb` (no thumbnails are generated for this set).

Follow-up probes for the knight. `gm assets search knight` (no lock, 10 hits): the only SmallScaleInt hit is `t1:smallscaleint-knight-demo-character/characters/knight-demo-character@2026-11-01  sprite/character  measured  isometric-2d  Knight Demo character` (the flat-fallback card); the other nine are KayKit board-game pieces (`playercard_knight_*`, `tile_knight_*`, `chess_black_knight`, family `chunky-low-poly`), which a game lock on `isometric-2d` would drop. The `--json` hit carries `source.files` (72 sheets with sha256) and `describe.set = smallscaleint` but no `previews`. `gm assets search 1knight` (7 hits) finds the two real knight character cards (`2d-character-pack-1`, `2d-hd-character-pack-1`), the sheets-only `2D Character Knight`, and the four bogus `spritesheets-*-1knight` prop cards. So the knight is reachable only by the vendor's numbered folder name; character titles need the leading number stripped (and the actions indexed) before `knight attack` can work.

## Run log

| step | rc | wall | cpu | result |
|---|---|---|---|---|
| `build_collection_cards.py --only smallscaleint-knight-demo-character` (first real run) | 0 | 1m20 | 2.6 s | 1 collection card, 1 item card |
| `--only smallscaleint-2d-hd-enemy-pack-1` (throughput sample: 17,568 PNG, 681 MB) | 0 | 6m23 | 17 s | 39 item cards |
| `--only smallscaleint-2d-character-pack-1` (32,846 PNG) | 0 | 6m04 | 26 s | 27 item cards |
| `--only smallscaleint-2d-hd-character-pack-1` (33,302 PNG) | 0 | 6m35 | 32 s | 27 item cards |
| `--only smallscaleint-fantasy-tileset-2d-isometric` (2,948 PNG) | 0 | 0m31 | – | 532 item cards |
| `--only 'smallscaleint-*'` (all 26 + creator pack, writes the contact sheets) | 0 | 25m26 | 6m30 | 22 written + 5 unchanged collection cards, 27 draft, 3,082 item cards, 0 failed; 179 sheet pages |
| `extract-unity` modern creator (215 MB) | 0 | 9m20 | 45 s | 1,834 layers |
| `extract-unity` fantasy creator (456 MB) | 1 | 17m25 | 63 s | `Unity package exceeds safe extraction limits` (157,266 members > 100,000) |
| `build_catalog.py --root assets-local` | 0 | 0m17 | | `471 packs, 1 inspiration collections, 9854 asset cards` |
| `build-index.mjs assets-local` | 0 | 1m39 | | `10319 cards, 0 errors -> assets-local/index/cards.index.json` |

The earlier estimate from the enemy-pack sample was ~2 h for the full pass; the fleet's load fell from ~60 to ~40 while it ran, hence 25 min. Memory was not measured (`/usr/bin/time` is not installed); the builder holds every card in memory until validation, the enemy-pack run sat under 100 MB RSS when sampled.

## Commands

All paths absolute, no `cd`. `<wt>` = `/tmp/claude-1001/-home-orangekid-games-open-game-maker-2000/40d2abe5-45a7-495a-93b5-3fd7c6705d68/scratchpad/wt-ssi` (worktree of `main` @ 0ae2ee2, PR #173 merged), `<repo>` = `/home/orangekid/games/open-game-maker-2000`, `<sp>` = that scratchpad, `<q>` = `<repo>/assets-local/inbox/quarantine/20261101-180443-new-asset-packs-1BiGbkP7/files/new asset packs`.

```sh
git -C <repo> -c credential.helper='!gh auth git-credential' fetch https://github.com/its-everdred/open-game-maker-2000.git main:refs/remotes/origin/main-check
git -C <repo> worktree add -B exec/ssi-run <wt> refs/remotes/origin/main-check
nice -n 15 pnpm --dir <wt> install --frozen-lockfile --store-dir /home/orangekid/.aiur-npm-cache/pnpm-store
nice -n 15 pnpm --dir <wt> --filter @ogm/contracts --filter @ogm/config --filter @ogm/asset-cards --filter @ogm/blob-store --filter @ogm/gm-verify --filter @ogm/gm-cli build

# licence repoint (26 pack.json, "unknown-itch-owned" -> "LicenseRef-smallscaleint-itch"), backups in <sp>/packjson-backup/
# cards: three packs alone first (slicing needs their cards), then all 26 in one run (contact sheets need all 26 in one run)
nice -n 15 python3 -I <wt>/scripts/assets/build_collection_cards.py --root <repo>/assets-local --only smallscaleint-2d-character-pack-1 --report
nice -n 15 python3 -I <wt>/scripts/assets/build_collection_cards.py --root <repo>/assets-local --only smallscaleint-2d-hd-character-pack-1 --report
nice -n 15 python3 -I <wt>/scripts/assets/build_collection_cards.py --root <repo>/assets-local --only smallscaleint-fantasy-tileset-2d-isometric --report
nice -n 15 python3 -I <wt>/scripts/assets/build_collection_cards.py --root <repo>/assets-local --only 'smallscaleint-*' --report

# slicing (venv has Pillow/numpy; system python3 has neither)
nice -n 15 ~/.local/share/ogm/forge-venv/bin/python -I <sp>/slice_check.py <repo>/assets-local smallscaleint-2d-character-pack-1 1knight walk --frames-dir 1Knight/Walk/S
nice -n 15 ~/.local/share/ogm/forge-venv/bin/python -I <sp>/slice_check.py <repo>/assets-local smallscaleint-2d-hd-character-pack-1 1knight walk --frames-dir 1Knight/Walk/S
nice -n 15 ~/.local/share/ogm/forge-venv/bin/python -I <sp>/slice_check.py <repo>/assets-local smallscaleint-fantasy-tileset-2d-isometric player walk --sheet "Characters/Player/Walk.png"

# character creators (never the app builds)
nice -n 15 python3 -I -c "import sys; sys.path.insert(0, '<wt>/scripts/assets'); import smallscaleint; sys.exit(smallscaleint.main(['extract-unity', '<q>/CharacterCreatorFantasy-2026-v.1.3.unitypackage', '<repo>/assets-local/packs/smallscaleint-character-creator-fantasy', '--world', 'fantasy']))"
nice -n 15 python3 -I -c "import sys; sys.path.insert(0, '<wt>/scripts/assets'); import smallscaleint; sys.exit(smallscaleint.main(['extract-unity', '<q>/Character+Creator+-+Modern+2D_6000.3.0f1.unitypackage', '<repo>/assets-local/packs/smallscaleint-character-creator-modern', '--world', 'modern-zombie']))"

# catalog, index, searches
nice -n 15 python3 -I <wt>/scripts/assets/build_catalog.py --root <repo>/assets-local
nice -n 15 node <wt>/packages/asset-cards/scripts/build-index.mjs <repo>/assets-local
OGM_ASSETS_ROOT=<repo>/assets-local nice -n 15 node <wt>/packages/gm-cli/dist/index.js assets search knight attack
OGM_ASSETS_ROOT=<repo>/assets-local nice -n 15 node <wt>/packages/gm-cli/dist/index.js assets search zombie
OGM_ASSETS_ROOT=<repo>/assets-local nice -n 15 node <wt>/packages/gm-cli/dist/index.js assets search desert chest
# locked: the CLI has no --set flag; it reads ./assets.lock.json from its cwd, so the same three ran in a subshell
# `(cd <sp>/lockgame && OGM_ASSETS_ROOT=<repo>/assets-local nice -n 15 node <wt>/packages/gm-cli/dist/index.js assets search ...)`
# where <sp>/lockgame/assets.lock.json has family isometric-2d, pov iso and one asset, t1:smallscaleint-2d-hd-character-pack-1/characters/1knight@2026-11-01
OGM_ASSETS_ROOT=<repo>/assets-local nice -n 15 node <wt>/packages/gm-cli/dist/index.js assets search knight attack --json | head -c 4000
OGM_ASSETS_ROOT=<repo>/assets-local nice -n 15 node <wt>/packages/gm-cli/dist/index.js assets facets --family isometric-2d

# counts table
python3 -I <sp>/ssi_counts.py <repo>/assets-local --md
```

## What remains

- **Reader fixes (blocking for use in a game):** sheet row order (`E,SE,S,SW,W,NW,N,NE`), `_Shadowless` stem suffix → variant and `With shadows` as a variant folder, sheet paths into `consumed`, `Characters/<Name>/<Action>.png` and `<Variant>/<Name>/<Action>.png` recognised as a sheet character (tileset packs, interior tiles, the three small packs, the sheets-only knight pack, the four top-down strip packs), actions-at-root layout (archer), the `character` word test in the flat fallback (projectile packs), fps lookup by clip name or a 12 fps default for the tileset packs, extractor `-I` import and member cap. Each is a few lines in `scripts/assets/smallscaleint.py` / `smallscaleint_unity.py`; the real-corpus facts above are the test fixtures that were missing.
- **Illustration tiers (#143).** Tier A (hero lineup renders: a fixed S-facing idle frame per character, composed on a ground tile) is not built; the world lineups here are raw `S` first frames (or the first sheet where no frames exist) in an HTML grid. Tier B (per-character contact sheets, one cell per action) exists as the `sheets/characters/*.html` pages. Tier C (thumbnails on the cards, `previews.thumb`) does not exist for any SmallScaleInt card; `gm assets search --json` shows no preview for them. Thumbnails need the fixed row/frame pick (S row = row 2) and a 64/128 px crop.
- **Compatibility judgment.** `style-families.json` records the set `smallscaleint` (26 packs, family `isometric-2d`, perspective "isometric 2:1") with no `compatible_with`. Inside the set the 64 px, 128 px/HD and 256 px tile scales mix by design (characters at 128 px stand on 256 px tiles); the two tileset packs and the HD characters share one sheet geometry and the same outline-and-shadow treatment, so the "one seamless pack" rule holds by eye on the lineups built here. The cross-vendor comparison with LimeZu and Kenney top-down was not done (their top-down perspective conflicts with the 2:1 isometric trait; no positive link recorded, as the PR left it).
- **Creators.** Re-run the fantasy extraction after the member cap is raised; write a part draw order for both creators (the manifest cannot carry it) before any composition; decide whether creator parts get cards at all (1,653 sheets x 2 creators would double the character card count if treated as characters).
- **Catalog tagging.** Add `collection_tags.jsonl` rows for the 26 (+2 creator) packs so the collection cards leave `draft`; until then pack-level searches lean on item titles like `Wall F7` and `Misc B44`.
