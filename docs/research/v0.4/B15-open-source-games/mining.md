# B15: Mining open-source games for libraries, assets, docs and schemas

- **Question:** what from the games in `bobeff/open-source-games` (and the well-known free asset sets) is worth taking for Open Game Maker 2000?
- **Builds on:** B11 §4.6 (tier 2 sources, mirror vs live adapters, "drop assets without a machine-readable license"), B14 (skill sourcing: link and paraphrase, vendor only permissive skills).
- **Method:** `gh api` reads of READMEs, LICENSE/COPYING files, credits files and repo trees, plus three wiki pages fetched on the web. No repo was cloned, built or run. Date: 2026-10-24.
- **Evidence labels:** **[V]** checked in a primary source (the repo's own license file, credits file or tree, or the project's own wiki page). **[S]** secondary, from memory or another site, or not checked file by file.
- **Not legal advice.** These are engineering rules for keeping risk low. A lawyer should review them before launch, especially the share-alike rules.

## 1. Summary

1. **Very few of the listed games contain reusable code for us.** Most are C++, Rust, Java or C#, under GPL or AGPL. Four are TypeScript or JavaScript and use a permissive license:
   - Athena Crisis (MIT code; the art is not licensed);
   - IsoCity (MIT);
   - Server Survival (MIT);
   - Whatajong (MIT, small).

   Ancient Beast is the one Phaser 4.2 game on the list. It is AGPL, so it is for reading only.
2. **The reusable libraries we need already exist on npm with permissive licenses.** They come from the wider ecosystem, not from these games: rot.js, recast-navigation-js, wavefunctioncollapse, inkjs, yarn-bound, PathFinding.js and easystarjs, plus the LDtk and Tiled JSON formats. Nothing from these games beats them.
3. **Four clean tier 2 asset sets.** Each is git-reachable with no click-through download, and each has a per-file or whole-set license that a machine can read:
   - **DCSS tiles** (`crawl/tiles`): CC0. About 4.4k 32×32 roguelike PNGs [V].
   - **OpenSFX:** 73 WAVs. You can pick each sound's own license, and many are CC0 or CC-BY 3.0. The license list is one parseable line per file [V].
   - **Lost Garden sprites inside OpenHV:** CC-BY 3.0 US. These are Daniel Cook's Hard Vacuum, Tyrian and Iron Plague sets [V].
   - **Freedoom:** BSD-3-Clause for the whole set. Retro FPS sprites, SFX and MIDI [V].
4. **The famous sets are mostly a trap for closed games:**
   - Wesnoth, Mindustry, OpenGFX, OpenMSX and Veloren are GPL art [V].
   - Hedgewars is GFDL 1.2 [V].
   - SuperTux, SS14, Endless Sky, Ancient Beast and DDNet are mainly CC-BY-SA [V].
   - BAR, Frogatto, Fish Folk and some SS14, SuperTux and Veloren files are non-commercial or no-derivatives [V].

   Treat these as "public games only" or skip them.
5. **The biggest payoff is design docs and data formats, not files.** The best skill and schema sources are:
   - Cataclysm DDA's `doc/JSON` and `design-balance-lore` (inheritance with `copy-from`, flags, balance scaling tables);
   - Unciv's 27 JSON Schemas and its "uniques" effect grammar;
   - SS14's YAML prototypes and per-sprite `meta.json` license field;
   - Athena Crisis's Action → ActionResponse model;
   - Endless Sky's data-format wiki;
   - Wesnoth's WML reference;
   - DCSS vault-design guidelines.

   Most of these docs are GPL, CC-BY-SA or GFDL, so we **paraphrase and link**. We never paste them into our skills.

## 2. Candidates

Use key:
- **T2:** tier 2 mirror source.
- **Skill:** source for an agent skill (paraphrase and link).
- **Schema:** idea for our game-design schemas.
- **Code:** we may copy code (with its notice).
- **Ref:** read-only reference.
- **Skip:** do not use.

### 2.1 Asset sets

| What | Code license | Asset license | Reach | Use for us |
|---|---|---|---|---|
| **DCSS tiles** (`crawl/tiles`, release `Nov-2015`, ~4,357 PNG) | n/a | **CC0** for tiles by artists who signed off. `TILES_UNDER_UNKNOWN_LICENSE.md` lists the exclusions [V] | git, pinned commit. Last push 2020 [V] | **T2, yes.** Drop every file listed in the exclusion file. Matches roguelike and top-down RPG games |
| **Freedoom** (`freedoom/freedoom`) | BSD-3 | **BSD-3-Clause** for the whole project, art included [V]. About 2,984 PNG (Doom palette with sprite offsets), 110 WAV, 112 MIDI [V] | git | **T2, yes.** One copyright line in CREDITS. Retro FPS look only. Do not use the word "Doom" in a game's name |
| **OpenSFX** (`OpenTTD/OpenSFX`, 73 WAV) | GPL-2+/CDDL for scripts | Whole set CC-BY-SA 3.0, but each sound may be used under its own license. In `src/opensfx.psfo`: 21 CC0, about 51 CC-BY 3.0, 1 CC-BY-SA [V] | git | **T2, yes.** Parse the `.psfo` lines. Take only the CC0 and CC-BY sounds. Mostly vehicle, train and industry sounds |
| **Lost Garden sets inside OpenHV** (`sources/sprites/{Hard Vacuum,Tyrian,Iron Plague}`) | GPL-3 (OpenHV) | **CC-BY 3.0 US** (Daniel Cook) [V via the OpenHV READMEs]. OpenHV's own art is CC-BY-SA 4.0, trivial pieces are CC0, and the license is set per file in metadata [V] | git | **T2, yes, for the Lost Garden originals.** Shmup and RTS pixel art. Also OpenHV's `bits/audio/{cc0,cc-by-30,cc-by-40,pd}` folders [V] |
| **Endless Sky images** | GPL-3+ | Most `images/*` are CC-BY-SA 4.0. The DEP-5 `copyright` file also lists 82 CC0 and 59 public-domain stanzas (photos), plus some CC-BY [V] | git | **T2, CC0 and PD subset only.** The DEP-5 file is machine-readable. The BY-SA ships suit public games only |
| **Wesnoth art and music** | GPL-2+ | Mostly GPL-2+. Contributions since 2017-07-30 default to CC-BY-SA 4.0 [V wiki]. `copyrights.csv` covers 396 files: 343 GPL-2+, 48 CC-BY-SA 4.0, 5 CC0 [V]. Files not in the CSV fall back to GPL [V README] | git | **Skip** for closed games. The 5 CC0 files are not worth an adapter |
| **SuperTux data** | GPL-3 | Mixed per file in `data/AUTHORS`: mostly CC-BY-SA, some GPL-2+ and BY-SA dual-licensed, some CC0 and CC-BY 3.0, and **one CC BY-NC 4.0 set** (`conveyor_belt`) [V]. Plain prose, not machine-readable | git | **Skip** (share-alike, an NC trap, no clean license data) |
| **Hedgewars** (`hedgewars/hw`, a GitHub mirror of their Mercurial repo [S]) | GPL-2 | Images and sounds under **GFDL 1.2** [V] | git | **Skip.** GFDL makes you ship the full license text and has awkward rules for media |
| **OpenGFX / OpenGFX2 / OpenMSX** | GPL-2 | GPL-2 for the art and music too [V] | git | **Skip** (GPL art, OpenTTD's 8-bit palette) |
| **Mindustry** | GPL-3 | No separate asset license. The repo LICENSE (GPL-3) covers everything [V: no other license file in the tree] | git | **Skip** |
| **Veloren** (primary on GitLab, GitHub mirror) | GPL-3 | Assets are "assumed to be GPL3" unless `assets/credits.ron` says otherwise. It has 11 CC-BY-NC-SA entries [V] | git | **Skip** for assets. Its `credits.ron` format is a **schema idea** |
| **Space Station 14** | MIT | Mostly CC-BY-SA 3.0, with some CC-BY-NC-SA. Each sprite's `meta.json` has a `license` and a `copyright` field [V] | git | **Public games only, filtered by `meta.json`.** The per-asset license field is a **schema idea** |
| **Ancient Beast** | AGPL-3 | Art and audio CC-BY-SA 4.0. The name and logo are trademarks [V] | git | **Ref** (Phaser 4.2.1 game, read only). Assets for public games only |
| **Taisei** | MIT | Soundtrack and portraits CC-BY 4.0 [V]. A Touhou fan game, so the characters belong to ZUN [V] | git | **Music maybe.** Skip the portraits (character IP) |
| **Unciv media** | MPL-2.0 | A mix of CC-BY-SA 4.0, CC-BY, CC0 and PD, listed in `docs/Credits.md` prose [V] | git | **Skip** for assets (not machine-readable). The docs are valuable, see §2.3 |
| **DDNet** | zlib-style (Teeworlds) [S] | `data/` is CC-BY-SA 3.0, except files with their own licenses [V] | git | **Skip** |
| **Beyond All Reason** | GPL-2 | Most models and all animations are **CC-BY-NC-ND 4.0**. Music is NC-ND. Sounds made since 2019 are all rights reserved [V] | git | **Skip** |
| **Frogatto** | zlib (engine) | CC-BY 3.0 in general, but levels, characters, tiles, sounds and music are **CC-BY-NC-SA** [V] | git | **Skip** |
| **Fish Folk Jumpy / Punchy** | MIT or Apache-2 | Media **CC BY-NC 4.0** [V] | git | **Skip** for assets |
| **Athena Crisis art** | MIT (code) | Art, sound, content and branding are **not licensed**; contact the owner for a fee [V] | git | **Skip** for assets |
| **VVVVVV** | Custom, personal use | Assets proprietary and not in the repo [V] | git | **Skip** |
| **SuperTuxKart assets** | GPL-3 | `licenses.txt` in each folder, mostly CC-BY-SA [S] | **SVN** at sf.net, not git [V INSTALL.md] | **Skip** (not git, share-alike, `.spm` model format) |
| Engine re-implementations (OpenRA, OpenRCT2, devilutionX, fheroes2, VCMI and others) | GPL | Need the original commercial game data | n/a | **Skip** for assets |

### 2.2 Reusable libraries and subcomponents

| What | License | Reach | Use for us |
|---|---|---|---|
| **Athena Crisis** packages: `athena` (immutable `MapData`), `apollo` (Action → ActionResponse, encoded actions for replays and network), `dionysus` (AI), map editor, `docs` | MIT for code and docs [V]. The unit and tile tables in `athena/info/*` are probably "game content", so treat them as unlicensed [V license wording; I] | git (pnpm monorepo, not on npm) | **Code and schema.** The best TS reference for a turn-based game: actions as data, deterministic replay, server-checkable moves. Copy patterns, or small files with the MIT notice. Do not copy unit stats |
| **IsoCity / IsoCoaster** (`amilich/isometric-city`) | MIT [V] | git | **Code and Ref.** Canvas isometric depth sorting, a traffic and pedestrian sim, saves with `lz-string`. Built with Cursor, so it shows what an agent-made game can reach |
| **Server Survival** (`pshenok/server-survival`) | MIT [V] | git | **Skill and Ref.** Achievements and campaign levels as JS data, `docs/GAME_BALANCE_ANALYSIS.md`, and agent-written specs in `docs/superpowers/` [V tree]. Three.js r128, so check every API against r186 |
| **Ancient Beast** | AGPL-3 [V] | git | **Ref only.** A real Phaser 4.2.1 code base, useful for checking API use. Never copy |
| **micropolisJS** | GPL-3 plus extra terms and the Micropolis name license [V] | git | **Skip** for code. City-sim ideas only |
| **rot.js** | BSD-3 [V] | npm `rot-js` 2.2.1 | **Use.** FOV, dungeon generators, A*/Dijkstra, scheduler, RNG. Covers the roguelike features found in DCSS, Brogue and NetHack |
| **recast-navigation-js** | MIT [V] | npm `recast-navigation` 0.43.1, TS | **Use** for 3D navmesh with Three.js |
| **PathFinding.js** / **easystarjs** | MIT [V] | npm `pathfinding` (last release 2022), `easystarjs` | **Use** for 2D grids. Both are stale but small |
| **Wave Function Collapse** (mxgmn) and its JS port | MIT [V] | npm `wavefunctioncollapse` 2.1.0 | **Use** for tile procgen. Hedgewars' `wfc_templates.toml` (edge labels plus allowed rotations) shows a neat template format [V]. Idea only, because the file is GPL |
| **inkjs** (ink) / **yarn-bound** (Yarn Spinner) | MIT / ISC [V] | npm | **Use** for dialogue. None of the listed games ships a better web dialogue system |
| **LDtk JSON format** | MIT [V] | `deepnight/ldtk/docs/JSON_SCHEMA.json` [V] | **Schema** for level files, if we want an external editor |
| **Tiled TMJ format** | Editor GPL; `libtiled` BSD-2 [V] | Format docs on mapeditor.org [S] | **Schema.** Phaser 4 loads Tiled JSON natively [S]. Use the format, not the code |
| **simplex-noise** | MIT [V] | npm | **Use** for terrain and noise |
| Mindustry `Arc` | Apache-2 [V] | Java | **Skip** (no JS port) |
| OpenTTD NML, YAPF; Wesnoth AI; Veloren netcode | GPL [V] | — | **Skip** for code. Ideas only |

### 2.3 Design docs and data formats

| What | License of the docs | Reach | Use for us |
|---|---|---|---|
| **Cataclysm DDA** `doc/JSON/*` (JSON_INFO, JSON_INHERITANCE, ITEM, MONSTERS, MAPGEN, EFFECT_ON_CONDITION, NPCs, MISSIONS…) and `doc/design-balance-lore/*` (GAME_BALANCE scaling tables, design-doc, design-gameplay) | CC-BY-SA 3.0 (the repo LICENSE covers everything) [V] | git | **Skill and Schema.** `copy-from` inheritance with `extend`/`delete`, flags lists, effect-on-condition triggers, mapgen palettes. GAME_BALANCE.md gives monster stat scaling tables for `gm-genre-rpg` and tuning. Paraphrase only |
| **Unciv** `docs/Modders/schemas/*.schema.json` (27 schemas: Units, Techs, Buildings, Terrains, Nations…) and `uniques.md` | MPL-2.0 [V] | git, raw URLs | **Schema, the best one.** Real JSON Schemas with titles, descriptions and examples. "Uniques" are templated strings such as `"[3] free [Musketman] units appear"` with typed parameters and conditionals [V]. Strong inspiration for a modifier grammar agents can write. MPL is file-level: copying a schema file means keeping it MPL, so it is better to write our own |
| **Space Station 14** `Resources/Prototypes/*.yml` and docs.spacestation14.com | Code MIT [V]. Docs site license not checked [S] | git | **Schema.** Entity prototypes with `parent` inheritance and component lists. Per-asset `meta.json` with `license` and `copyright` fields [V] |
| **Endless Sky** wiki (`endless-sky/endless-sky-wiki`: DataFormat, CreatingShips, CreatingMissions, CreatingEvents…) | GPL-3 [V] | git | **Skill and Schema.** Indented token-tree data format, mission and event conditions. Paraphrase only |
| **Wesnoth** WML reference (wiki) and `data/schema/*.cfg` | Wiki **GFDL** [V wiki]. Code and data GPL-2+ [V] | Wiki on the web; schema on git | **Skill and Schema.** Event, filter and action tag model for scenario scripting. Link only |
| **OpenTTD** wiki (`OpenTTD/wiki-data`) | **GFDL 1.3** [V] | git (MediaWiki text) | **Skill, light.** Economy and transport mechanics. Link only |
| **Mindustry** wiki modding guide (`MindustryGame/wiki`) | **No license file** [V], so treat it as all rights reserved | git | **Ref.** HJSON content mods and the spriting guide (palette, shading). Link, do not copy |
| **DCSS** `crawl-ref/docs/develop/levels/{guidelines.md,syntax.txt,…}` | GPL-2+ [V] | git | **Skill.** Vault and level-design guidelines for roguelike maps. Paraphrase |
| **OpenRA** `mods/*/rules/*.yaml` (traits on actors) | GPL-3 [V] | git | **Schema.** Composing actors from traits in YAML. Idea only |
| **OpenXcom** `bin/standard/xcom1/*.rul` (YAML rulesets) | GPL-3 [V] | git | **Schema.** Missions, alien deployments, item levels. Idea only |
| **Hedgewars** `map_templates.yaml`, `wfc_templates.toml` | GPL-2 [V] | git | **Schema.** Procgen template formats |
| **BAR** `units/*.lua` unitdefs | GPL-2 [V] | git | **Schema, light.** RTS unit fields. Idea only |
| **Athena Crisis** docs (`docs/content/pages/core-concepts/{actions,map-data,ai}.mdx`) | MIT [V] | git | **Skill.** We may quote it with the notice. Good material for a turn-based skill |

## 3. Schema ideas to take (all re-expressed in our own words)

1. **Inheritance:** `copyFrom` plus `extend`/`delete` (CDDA) or `parent` (SS14). Agents write small deltas instead of copying whole entries.
2. **One JSON Schema per content type,** with `description` and `examples` (Unciv). Agents validate before they run, and an editor can build forms from the schemas.
3. **A typed modifier grammar** (Unciv "uniques"): readable strings with `[param]` slots, checked against a list of templates. This is easier for agents and players than nested JSON.
4. **Composition by traits or components** (OpenRA, SS14): a unit is a list of behaviours, not a class.
5. **Actions as data** (Athena Crisis): each player move becomes an `Action`, and the engine answers with an `ActionResponse`. It gives replays, undo, netcode and AI on one path. It also fits B14's `advanceTime` and `render_game_to_text` hooks.
6. **A license on every asset:** SS14 `meta.json`, Veloren `credits.ron`, Wesnoth `copyrights.csv` (with MD5), Endless Sky DEP-5. These confirm B11's `assets.lock.json` design. Add `copyright`, `sourceLink`, `modifications` and `hash` fields.
7. **Edge-labelled tile templates** (Hedgewars WFC TOML) for procgen tile sets.

## 4. License rules (not legal advice)

**Background.** A browser game sends its JS and assets to every player. Publishing it counts as distributing it. A private repo that is never played by others distributes nothing. Ideas, algorithms, mechanics and file formats are generally not copyrightable. The exact text, code, art and sometimes data tables are.

### Engine repo (open source, license not chosen)

- **Do** use only MIT, BSD, ISC, Apache-2.0, zlib or CC0 code in the engine. This keeps every license choice open.
- **Do** add npm libraries as dependencies (rot-js, recast-navigation, inkjs and others) instead of vendoring them. Keep their notices.
- **Do** copy Athena Crisis, IsoCity or Server Survival code only with the MIT notice kept in the file.
- **Don't** paste GPL, AGPL or LGPL code from any listed game into the engine. That includes "small helpers", shaders and Lua or WML snippets.
- **Don't** ship any game's data tables (unit stats, item lists) in engine templates. Even from MIT repos, Athena Crisis's content is excluded.
- **Don't** check asset files into the engine repo at all (B11 rule). Ship adapters that fetch from the pinned git source.

### Skills (shipped in the engine repo)

- **Do** write skills fresh, in our own words, and cite the doc as "see also" with a link.
- **Do** quote MIT or Apache docs (Athena Crisis) with attribution if a quote really helps.
- **Don't** paste text from CC-BY-SA (CDDA), GPL (Endless Sky wiki, DCSS docs), GFDL (Wesnoth and OpenTTD wikis) or unlicensed (Mindustry wiki) docs. A pasted paragraph would bind the skill file to that license.
- **Don't** let an agent read GPL source and then write "similar" code into the engine. Point agents at docs and formats, not at GPL source files.

### User games (public or private repos)

- **Do** use CC0, PD, BSD and MIT assets freely. BSD (Freedoom) needs one copyright line in CREDITS.
- **Do** use CC-BY assets (Lost Garden, OpenSFX CC-BY sounds, Taisei music) with a credit line. The lockfile generates the credits.
- **CC-BY-SA assets:**
  - Closed games block them by default.
  - A public game may opt in. The creator then accepts that each SA asset, and any change to it, must be shared under the same license, credited and kept extractable.
  - Most readings say SA does not cover the game's code. Some do not agree, so we stay conservative [S].
- **Don't** use GPL art or music (Wesnoth's older files, Mindustry, OpenGFX/OpenMSX, Veloren, SuperTux GPL files) in any game unless the game is GPL itself. Whether GPL art makes the whole game GPL is unsettled.
- **Don't** use GFDL media (Hedgewars).
- **Never** use NC or ND assets (BAR, Frogatto, Fish Folk, some SS14, SuperTux and Veloren files). The `use` call should reject `*-NC-*` and `*-ND-*` SPDX ids outright, because a user game may be sold or monetized later.
- **Don't** use GPL or AGPL game code in user games, closed or public. AGPL (Ancient Beast, Brogue CE, Hypersomnia) also triggers on network play.
- **Don't** use trademarked names, characters or logos: Doom, Touhou characters, SimCity or Micropolis, Command & Conquer, Civilization, Athena Crisis, Ancient Beast.

### Adapter rules (B11 additions)

- An adapter maps each file to an SPDX id from the source's own per-file data: `.psfo` lines, DEP-5 stanzas, `copyrights.csv`, `meta.json` or exclusion lists. If it can't, it drops the file (the B11 rule holds).
- Store the source commit SHA and the source file hash in the lockfile.
- Re-check the license on every re-sync. Projects relicense over time (Wesnoth did in 2017).

## 5. Sources

All read on 2026-10-24 through `gh api repos/<owner>/<repo>/contents/<path>` unless a URL is given.

- List: `bobeff/open-source-games` README (local clone).
- Freedoom: `freedoom/freedoom` `COPYING.adoc`, `README.adoc`, tree [V].
- OpenTTD sets:
  - `OpenTTD/OpenSFX` `LICENSE`, `README.md`, `src/opensfx.psfo` [V];
  - `OpenTTD/OpenGFX` and `OpenTTD/OpenMSX` `README.md` §5 [V];
  - `OpenTTD/wiki-data` `LICENSE.mediawiki` [V].
- Wesnoth: `wesnoth/wesnoth` `README.md`, `copyright`, `copyrights.csv` [V]; https://wiki.wesnoth.org/Wesnoth:Copyrights [V]; https://wiki.wesnoth.org/ReferenceWML [V].
- SuperTux: `SuperTux/supertux` `README.md`, `data/AUTHORS` [V].
- Hedgewars: `hedgewars/hw` `README.md`, `COPYING`, `share/hedgewars/Data/wfc_templates.toml` [V].
- Mindustry: `Anuken/Mindustry` `LICENSE`, tree; `MindustryGame/wiki` `docs/modding/1-modding.md` [V].
- Veloren: `veloren/veloren` `README.md`, `assets/credits.ron` [V].
- SS14: `space-wizards/space-station-14` `README.md`, `Resources/Textures/Objects/Tools/crowbar.rsi/meta.json`, `Resources/Prototypes` [V].
- Endless Sky: `endless-sky/endless-sky` `copyright`; `endless-sky/endless-sky-wiki` `license.txt`, `wiki/DataFormat.md` [V].
- DCSS: `crawl/crawl` `LICENSE`, `crawl-ref/docs/develop/levels/`; `crawl/tiles` `README.md`, tree [V].
- OpenHV: `OpenHV/OpenHV` `README.md`, `mods/hv/bits/sprites/README.md`, `sources/sprites/*/README.md` [V].
- Cataclysm DDA: `CleverRaven/Cataclysm-DDA` `LICENSE.txt`, `doc/JSON/`, `doc/design-balance-lore/` [V].
- Unciv: `yairm210/Unciv` `README.md`, `docs/Credits.md`, `docs/Modders/schemas/Units.schema.json`, `docs/Modders/uniques.md` [V].
- Athena Crisis: `nkzw-tech/athena-crisis` `LICENSE.md`, `README.md`, `docs/content/pages/core-concepts/*.mdx`, tree [V].
- Ancient Beast: `FreezingMoon/AncientBeast` `LICENSE.md`, `README.md`, `package.json` (`phaser ^4.2.1`) [V].
- Others:
  - Taisei `COPYING.txt`;
  - DDNet `license.txt`;
  - BAR `LICENSE.md` and `license_*.txt`;
  - Frogatto `LICENSE`;
  - Fish Folk Jumpy `LICENSE`;
  - VVVVVV `LICENSE.md`;
  - micropolisJS `LICENSE` and `README.md`;
  - IsoCity `README.md` and `package.json`;
  - Server Survival `README.md` and tree;
  - SuperTuxKart `README.md` and `INSTALL.md`;
  - Tiled `COPYING`;
  - WaveFunctionCollapse `LICENSE`;
  - LDtk `docs/`;
  - OpenRA `mods/ra/rules`;
  - OpenXcom `bin/standard/xcom1` [V].
- npm metadata (`npm view`): rot-js, pathfinding, easystarjs, inkjs, recast-navigation, wavefunctioncollapse, yarn-bound, simplex-noise [V].
- Repo license fields, stars and push dates: `gh api repos/<r>` [V].
- Secondary: Phaser's native Tiled loader; STK asset licenses; the reading that CC-BY-SA does not cover game code; the SS14 docs site license [S].

Not checked: each Endless Sky CC0 stanza against the actual ship art; every SS14 `meta.json` (we would need a full scan to count the NC files); and the Lost Garden license page itself (seen only through OpenHV).
