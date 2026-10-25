# B15: bobeff/open-source-games — catalog and quality

Date: 2026-10-24. Data: list README (CC0), `gh api` GraphQL and REST, Steam store pages, itch.io pages, Wikipedia API, web search.

Labels: **[V]** I checked it in a primary source (GitHub API, Steam page, itch.io page, Wikipedia API, repo file). **[S]** It comes from a secondary source (press, aggregators, search summaries).

## Summary

- The list is real games, not slop. Most entries are old, well-known open-source projects. Many have 10 or more years of history and hundreds of contributors.
- It has 166 playable items once nested sub-entries are split out. 145 have GitHub source. The others are on Codeberg, GitLab, SourceForge, Bitbucket, SVN or a website.
- Only 64 of 166 (39%) are original games. The rest are remakes and engine reimplementations (54), source ports (20), official code drops (15) and decompilations (13). Most of the non-originals need the original game's paid assets to play.
- At least 19 are shipped products with store reviews. Steam scores run from "Mostly Positive" to "Overwhelmingly Positive". Mindustry has 9,863 English Steam reviews at 94% positive.
- Maturity: 19 shipped, 58 long-lived community projects, 49 playable but small or rough, 25 inactive, 15 frozen code archives.
- The list contains almost no hackathon projects. A few recent web entries are young and hype-starred: IsoCity, Server Survival and Whatajong, all from 2025.
- Stars do not equal a finished game. OpenAge (14.5k stars), Citybound (8.2k) and Open Diablo II (11.1k) are engines or prototypes that never shipped a complete game.
- Web or JS/TS: 7 of 145 GitHub entries. Only 2 are close to our stack. **Ancient Beast** uses Phaser 4.2 and is TypeScript. **Server Survival** is vanilla JS on Three.js r128. Athena Crisis is TypeScript, but only its code is open (MIT). Its art and music are not.
- C++ (64) and C (33) dominate. GPL-family licenses dominate too: GPL-2.0, GPL-3.0 and AGPL cover 65 of 145. 58 repos have no license that GitHub can detect (36 NOASSERTION, 22 none).

## Method

1. I parsed the README with a script and split nested items, such as the Doom ports and the Stratagus games, into their own rows. I dropped group headers that have no source, and GemRB's supported-game children. The result is 166 rows.
2. I made 2 fixes to the list. "Dust Racing 2D" links to the Yorg repo, so I used `juzzlin/DustRacing2D`. GemRB links to Wikipedia, so I used `gemrb/gemrb`. Both are marked `*` in the table.
3. GitHub data comes from GraphQL in batches of 25: stars, pushedAt, createdAt, isArchived, primaryLanguage, licenseInfo and releases. Contributor counts come from the last page of REST `/contributors?per_page=1&anon=1`. They include anonymous committers, so they are approximate. For Codeberg and GitLab I used their APIs to get last activity.
4. Kind codes:
   - O: original game;
   - R: remake, clone or engine reimplementation;
   - P: source port of released code;
   - D: decompilation or reverse-engineered code;
   - S: official source release, frozen.
5. Maturity rules:
   - **Shipped**: on Steam, or on a major mobile store, with a user-review score.
   - **Archive**: an official code drop that is frozen on purpose.
   - **Inactive**: no push since 2024-10-24, or archived. This class includes a few *finished* projects, such as the SM64 decomp and Anarch.
   - **Community**: active in the last 2 years, repo at least 5 years old, and at least 40 contributors.
   - **Small/rough**: active, but young or with a small team. This class mixes complete solo ports (Zelda 3, Fallout CE) with true WIP.
   - I set a few non-GitHub entries by hand.
6. Steam data: store search API, then the store page's review-summary tooltip. itch.io data: JSON-LD `aggregateRating` on the page.

## Counts

### Kind

| Kind | Count |
|---|---:|
| Original (O) | 64 |
| Remake / clone / reimplementation (R) | 54 |
| Source port (P) | 20 |
| Official source release (S) | 15 |
| Decompilation / RE (D) | 13 |
| **Total** | **166** |

### Maturity

| Class | Count | Share |
|---|---:|---:|
| Shipped and polished (store + reviews) | 19 | 11% |
| Long-lived community project | 58 | 35% |
| Playable, small team or rough | 49 | 30% |
| Inactive (abandoned, a few finished) | 25 | 15% |
| Frozen code archive (id, EA, 3D Realms) | 15 | 9% |

Shipped (19): Hypersomnia, Endless Sky, OpenTTD, Red Eclipse, DDraceNetwork, Frogatto & Friends, VVVVVV, Mindustry, Warzone 2100, Zero-K, Cataclysm: DDA, Shattered Pixel Dungeon, Kandria, Naev, Lugaru, Overgrowth, Athena Crisis, Battle for Wesnoth, Unciv (mobile). Only Unciv is a remake. 17 of the 19 are originals.

Inactive (25): Dead Ascend, Citybound, Anarch, Liblast, AvP Forever, avpmp, BuildGDX, NuBuildGDX, Wolf4SDL, Punchy, Super Mario 64 (decomp complete), BlockOut II, ManiaDrive, TORCS, Trigger Rally, Yorg, Meritous, OpenNefia, OpenNox, Abyss Engine, Freeablo, Open Diablo II, Open Golf, RE3 (post-takedown mirror), OpenPanzer.

### GitHub activity (145 repos)

- Median stars: 1,539. 83 repos have at least 1k stars, 27 have at least 5k, and 14 have under 100.
- 101 of 145 were pushed in the last 12 months.
- 9 are archived: 5 EA C&C drops, Duke3D mirror, NuBuildGDX, OpenNox, Open Diablo II.
- 56 have zero GitHub releases. Many ship through their own sites or Steam instead.
- The largest contributor counts are Cataclysm: DDA (~3,071), Space Station 14 (~1,630), Mindustry (~1,077), ScummVM (~979) and OpenRCT2 (~762).

### Language (GitHub primary language, 145 repos)

| Lang | n | Lang | n |
|---|---:|---|---:|
| C++ | 64 | Python | 4 |
| C | 33 | JavaScript | 3 |
| Java | 7 | Kotlin | 2 |
| C# | 7 | GDScript, QML, Ruby, Common Lisp, ActionScript, Obj-C, Go, Perl | 1 each |
| Lua | 6 | none detected | 1 |
| Rust | 6 | | |
| TypeScript | 4 | | |

### License (GitHub SPDX, 145 repos)

| License | n |
|---|---:|
| NOASSERTION (custom or multi-file) | 36 |
| GPL-3.0 | 31 |
| GPL-2.0 | 26 |
| none detected | 22 |
| MIT | 13 |
| AGPL-3.0 | 8 |
| CC0-1.0, BSD-2-Clause, Apache-2.0 | 2 each |
| ISC, LGPL-3.0, MPL-2.0 | 1 each |

"NOASSERTION" and "none" do not mean the code is unlicensed. Many repos split code and asset licenses (CDDA, OpenTTD, DevilutionX), and decompilations often carry no license at all (Zelda 3, RE3, id Quake drops). Asset licenses are often non-free or need the original game. **Plan to treat this list as reference, not a source of code or assets to copy.**

## Web / JS / TS entries (reusable in our stack?)

| Entry | Lang / stack | License | Status | Fit |
|---|---|---|---|---|
| Ancient Beast | TypeScript, **Phaser ^4.2.1** [V package.json] | AGPL-3.0 code; CC-BY-SA-4.0 or AGPL for assets [V] | Since 2011, ~222 contributors, active [V]. No Steam page found. | Closest match: same engine. AGPL is viral for a hosted service. |
| Server Survival | Vanilla JS, **Three.js r128** from cdnjs, no build [V index.html] | MIT [V] | Repo 2025-11, 6.5k stars, educational toy [V] | Small, readable Three.js sim. Old Three version. |
| Athena Crisis | TypeScript monorepo, React UI [V] | MIT for code only; art, music and content not open [V LICENSE.md, S press] | Shipped on Steam; 76% of 127 reviews [V] | Good reference for tactics game architecture. You cannot reuse its assets. |
| IsoCity | TypeScript, Next.js, React, Canvas [V] | MIT [V] | Repo 2025-11, 2.3k stars, 14 contributors [V]; press in FlowingData and ixbt [S] | Young. Canvas 2D, not Phaser. |
| Whatajong | TypeScript, SolidJS, Howler [V] | none detected | 15 stars, 1 contributor, last push 2025-06 [V] | Small Mahjong game. Commercial site. |
| micropolisJS | JavaScript | GPL-3.0 + Micropolis name license [V] | Last push 2025-07 [V] | Port of the SimCity Classic code. Its age shows. |
| OpenPanzer | JavaScript/HTML5 | none detected | Last push 2021 [V] | Inactive. |

Several C/C++ games also have WASM or web builds, such as OpenLara, wipEout-rewrite and Anarch [S]. They run in a browser, but their source is not reusable in a TS/Phaser/Three codebase.

## Sampled quality evidence (33 entries)

Steam numbers are from the store page on 2026-10-24. "Eng" means English-language reviews; "all" means all reviews on Steam's page.

| # | Entry (cat) | Evidence | Label |
|---|---|---|---|
| 1 | Mindustry (RTS) | Steam "Very Positive", 94% of 9,863 Eng; recent "Overwhelmingly Positive". itch.io 4.8/5 from 2,603 ratings. Wikipedia article exists. 205 GH releases since 2017. | [V] |
| 2 | Endless Sky (Adv) | Steam "Very Positive", 93% of 6,452 Eng. Repo since 2015, ~396 contributors, 55 releases. | [V] |
| 3 | Overgrowth (TPS) | Steam "Very Positive", 85% of 5,035 Eng. Commercial Wolfire game, open-sourced in 2022 under Apache-2.0. Wikipedia article exists. | [V] |
| 4 | VVVVVV (Plat) | Steam "Overwhelmingly Positive", 96% of 4,560 Eng. Commercial 2010 game, source published. Wikipedia article exists. | [V] |
| 5 | Battle for Wesnoth (TBS) | Steam "Very Positive", 94% of 3,238 Eng. ~445 contributors. Wikipedia article exists. | [V] |
| 6 | Zero-K (RTS) | Steam "Very Positive", 93% of 3,228 Eng. Wikipedia article exists. | [V] |
| 7 | DDraceNetwork (Plat) | Steam "Very Positive", 89% of 2,972 Eng; 529 reviews in the last 30 days. ~362 contributors. | [V] |
| 8 | Warzone 2100 (RTS) | Steam "Very Positive", 89% of 1,635. Commercial 1999 game, community-maintained since 2004. Wikipedia article exists. | [V] |
| 9 | Shattered Pixel Dungeon (Rogue) | Steam "Very Positive", 92% of 868 Eng. Wikipedia article exists. Google Play about 4.78 from about 160k ratings, 5M+ installs (AppBrain). | [V] / [S] |
| 10 | Red Eclipse (FPS) | Steam "Very Positive", 86% of 865. | [V] |
| 11 | Cataclysm: DDA (Rogue) | Steam "Very Positive", 85% of 542; paid Steam release on 2023-03-31 (GamingOnLinux). ~3,071 contributors, the most on the list. Wikipedia article exists. | [V] / [S] |
| 12 | Lugaru (TPS) | Steam (Lugaru HD) "Very Positive", 83% of 359. Wikipedia article exists. | [V] |
| 13 | Naev (RPG) | Steam "Very Positive", 81% of 237. itch.io 4.8 from 10 ratings. No own Wikipedia article. | [V] |
| 14 | Hypersomnia (Action) | Steam "Very Positive", 94% of 146. Repo since 2013. Wikipedia article exists. | [V] |
| 15 | Athena Crisis (TBS) | Steam "Mostly Positive", 76% of 127. OpenCritic critic scores about 72-90; reviewers note "rough edges". 1.0 in Sep 2024. | [V] / [S] |
| 16 | Kandria (RPG) | Steam "Very Positive", 91% of 74. Press reviews mixed-positive, e.g. 7/10. No own Wikipedia article. | [V] / [S] |
| 17 | OpenTTD (Tycoon) | Steam "Positive", 90% of 31 counted reviews; the count seems low for a free app. Wikipedia article exists. Repo since 2018 (project since 2004), ~271 contributors, 62 releases. | [V] |
| 18 | Frogatto & Friends (Plat) | Steam "Positive", 94% of 19. Wikipedia article exists. | [V] |
| 19 | Unciv (TBS) | Google Play about 4.59 from about 51k ratings, 1M+ installs (AppBrain). No Steam app found. No own Wikipedia article. 989 GH releases. | [S] / [V] |
| 20 | Space Station 14 (RPG) | Steam page says "Coming soon"; only a Playtest exists. Wikipedia article exists. ~1,630 contributors. | [V] |
| 21 | 0 A.D. (RTS) | Alpha 27 in Jan 2025 was the last "alpha"; Release 28 dropped the label. Wikipedia article exists. Development has run since about 2009. | [S] / [V] |
| 22 | SuperTuxKart (Race) | 1.5 shipped Oct 2025 after about 3 years of work; v2 "Evolution" planned (OMG! Ubuntu, It's FOSS). Wikipedia article exists. Not on Steam. | [S] / [V] |
| 23 | Veloren (RPG) | 0.17 released Dec 2024, covered by GamingOnLinux. Still pre-1.0. No own Wikipedia article. ~569 contributors. | [S] / [V] |
| 24 | Beyond All Reason (RTS) | Signed with publisher Hooded Horse in 2026 for a Steam release; multiplayer stays free (GamingOnLinux). Wikipedia article exists. ~349 contributors, 0 GH releases. | [S] / [V] |
| 25 | Zelda 3 (Adv, D) | Covered by Engadget, PCGamesN and TechSpot in 2023. Needs your own ROM. Legal footing called "shaky". | [S] |
| 26 | IsoCity (City) | FlowingData (Jan 2026) and ixbt.games (Dec 2025) wrote it up as a fun, smaller SimCity throwback. Repo created 2025-11. | [S] / [V] |
| 27 | Server Survival (TD) | Only aggregator and listing coverage found. Repo created 2025-11; 6.5k stars in under a year. | [S] / [V] |
| 28 | Citybound (City) | 8.2k stars. Last push 2023-01, 0 releases. Still pre-alpha in early press. | [V] / [S] |
| 29 | Open Diablo II (RPG) | 11.1k stars. Archived; last push 2021. | [V] |
| 30 | Liblast (FPS) | Codeberg: 11 stars, last update 2025-05. Forum posts mention a full rewrite. | [V] / [S] |
| 31 | Akhenaten (City) | itch.io 5.0 from 3 ratings. Steam page "Akhenaten: Rule as Pharaoh" shows no reviews yet. Needs Pharaoh assets. | [V] |
| 32 | Hurry Curry! (Tycoon) | Codeberg: 147 stars, active Jul 2026. Only Linux-listing coverage found. | [V] / [S] |
| 33 | Yorg (Race) | itch.io 4.4 from 10 ratings. Last push 2024-09. | [V] |

Wikipedia check [V]. These have their own article: 0 A.D., AssaultCube, Brogue, BAR, Cataclysm: DDA, Cube 2, DCSS, FreeCol, Freeciv, Frogatto, Hypersomnia, Mindustry, NetHack, OpenMW, OpenRCT2, OpenTTD, Overgrowth, Rigs of Rods, ScummVM, Shattered PD, SRB2, Space Station 14, Speed Dreams, SuperTuxKart, TORCS, The Dark Mod, Warzone 2100, Wesnoth, VVVVVV, Widelands, Xonotic, Zero-K. These do not: Unciv, Veloren, Athena Crisis, Naev, Kandria, DDNet, DevilutionX, Taisei, Citybound, OpenXcom, VCMI, Egregoria, Cytopia, Hurry Curry, Ancient Beast. OpenRA, CorsixTH, Daggerfall Unity and FreeOrion only redirect to the original game's article.

## Full stats table

Kind codes: O original, R remake/clone/reimpl, P source port, D decompilation, S official source release. Contrib is approximate (REST, with anonymous committers). Rel is the GitHub releases count. Blank cells mean the source is not on GitHub. `*` marks a source URL I corrected (see Method).

| # | Name | Cat | Kind | Source | Stars | Contrib | Created | Last push | Lang | License | Rel | Maturity |
|---|---|---|---|---|---:|---:|---|---|---|---|---:|---|
| 1 | Hypersomnia | Action | O | TeamHypersomnia/Hypersomnia | 1701 | 17 | 2013 | 2026-10-24 | C++ | AGPL-3.0 | 0 | Shipped |
| 2 | Dead Ascend | Adv | O | larpon/DeadAscend | 67 | 6 | 2017 | 2024-08-21 | QML | MIT | 0 | Inactive |
| 3 | Endless Sky | Adv | O | endless-sky/endless-sky | 7657 | 396 | 2015 | 2026-10-24 | C++ | GPL-3.0 | 55 | Shipped |
| 4 | Pioneer | Adv | O | pioneerspacesim/pioneer | 1925 | 189 | 2011 | 2026-10-23 | C++ |  | 15 | Community |
| 5 | ScummVM | Adv | R | scummvm/scummvm | 2865 | 979 | 2011 | 2026-10-25 | C++ | GPL-3.0 | 15 | Community |
| 6 | The Legend of Zelda: Twilight Princess | Adv | D | zeldaret/tp | 2110 | 68 | 2020 | 2026-06-23 | C++ | CC0-1.0 | 0 | Community |
| 7 | Zelda 3 | Adv | D | snesrev/zelda3 | 4906 | 26 | 2022 | 2026-10-02 | C | NOASSERTION | 1 | Small/rough |
| 8 | CorsixTH | Tycoon | R | CorsixTH/CorsixTH | 4617 | 148 | 2013 | 2026-10-24 | Lua | NOASSERTION | 56 | Community |
| 9 | Hurry Curry! | Tycoon | O | codeberg.org |  |  |  |  |  |  |  | Small/rough |
| 10 | OpenLoco | Tycoon | R | OpenLoco/OpenLoco | 1953 | 92 | 2018 | 2026-10-14 | C++ | MIT | 83 | Community |
| 11 | OpenRCT2 | Tycoon | R | OpenRCT2/OpenRCT2 | 16498 | 762 | 2014 | 2026-10-23 | C++ | GPL-3.0 | 67 | Community |
| 12 | OpenTTD | Tycoon | R | OpenTTD/OpenTTD | 8421 | 271 | 2018 | 2026-10-24 | C++ | NOASSERTION | 62 | Shipped |
| 13 | Akhenaten | City | R | dalerank/Akhenaten | 520 | 73 | 2023 | 2026-10-12 | C++ | AGPL-3.0 | 9 | Small/rough |
| 14 | Citybound | City | O | citybound/citybound | 8172 | 22 | 2016 | 2023-01-07 | Rust | AGPL-3.0 | 0 | Inactive |
| 15 | Cytopia | City | O | CytopiaTeam/Cytopia | 2176 | 63 | 2018 | 2026-10-09 | C++ | GPL-3.0 | 5 | Community |
| 16 | Egregoria | City | O | Uriopass/Egregoria | 1658 | 10 | 2019 | 2025-06-02 | Rust | GPL-3.0 | 8 | Small/rough |
| 17 | IsoCity | City | O | amilich/isometric-city | 2333 | 14 | 2025 | 2026-10-16 | TypeScript | MIT | 0 | Small/rough |
| 18 | Julius | City | R | bvschaik/julius | 3416 | 59 | 2017 | 2026-09-12 | C | AGPL-3.0 | 12 | Community |
| 19 | micropolisJS | City | P | graememcc/micropolisJS | 734 | 6 | 2013 | 2025-07-13 | JavaScript | NOASSERTION | 0 | Small/rough |
| 20 | Unknown Horizons | City | O | unknown-horizons/unknown-horizons | 1555 | 382 | 2010 | 2026-10-22 | Python |  | 25 | Community |
| 21 | Unknown Horizons (Godot port) | City | O | unknown-horizons/godot-port | 912 | 30 | 2019 | 2026-09-14 | GDScript | GPL-2.0 | 0 | Small/rough |
| 22 | .kkrieger | FPS | S | farbrausch/fr_public | 3822 | 11 | 2012 | 2019-07-28 | C++ |  | 0 | Archive |
| 23 | Anarch | FPS | O | gitlab.com |  |  |  |  |  |  |  | Inactive |
| 24 | AssaultCube | FPS | O | assaultcube/AC | 1084 | 45 | 2013 | 2026-02-20 | C |  | 24 | Community |
| 25 | Cube 2: Sauerbraten | FPS | O | sourceforge.net |  |  |  |  |  |  |  | Community |
| 26 | Descent 3 | FPS | P | kevinbentley/Descent3 | 3020 | 42 | 2024 | 2026-10-23 | C++ | GPL-3.0 | 1 | Small/rough |
| 27 | Liblast | FPS | O | codeberg.org |  |  |  |  |  |  |  | Inactive |
| 28 | Red Eclipse | FPS | O | redeclipse/base | 542 | 58 | 2015 | 2026-10-24 | C++ |  | 9 | Shipped |
| 29 | Surreal Engine | FPS | R | dpjudas/SurrealEngine | 1126 | 20 | 2020 | 2026-10-24 | C++ | NOASSERTION | 1 | Small/rough |
| 30 | The Dark Mod | FPS | O | svn.thedarkmod.com |  |  |  |  |  |  |  | Community |
| 31 | Xonotic | FPS | O | gitlab.com |  |  |  |  |  |  |  | Community |
| 32 | AvP Forever | FPS | P | dreamer/avp-forever | 15 | 2 | 2019 | 2020-04-23 | C | NOASSERTION | 0 | Inactive |
| 33 | avpmp | FPS | P | mbait/avpmp | 20 | 3 | 2011 | 2011-01-03 | C | NOASSERTION | 0 | Inactive |
| 34 | NakedAVP | FPS | P | atsb/NakedAVP | 90 | 6 | 2022 | 2026-10-16 | C | NOASSERTION | 10 | Small/rough |
| 35 | Duke Nukem 3D | FPS | S | videogamepreservation/dukenukem3d | 330 | 1 | 2013 | 2013-08-18 | C++ |  | 0 | Archive (archived) |
| 36 | Shadow Warrior | FPS | S | Azarien/shadow-warrior | 20 | 1 | 2016 | 2014-08-18 | C |  | 0 | Archive |
| 37 | BuildGDX | FPS | P | vogonsorg/BuildGDX | 2 | 2 | 2021 | 2021-11-10 | Java |  | 0 | Inactive |
| 38 | EDuke32 | FPS | P | none listed |  |  |  |  |  |  |  | Community |
| 39 | JFDuke3D | FPS | P | jonof/jfduke3d | 142 | 5 | 2010 | 2026-01-25 | C |  | 0 | Small/rough |
| 40 | JFShadowWarrior | FPS | P | none listed |  |  |  |  |  |  |  | Small/rough |
| 41 | NBlood | FPS | D | NBlood/NBlood | 816 | 62 | 2019 | 2026-10-02 | C++ |  | 222 | Community |
| 42 | NuBuildGDX | FPS | P | atsb/NuBuildGDX | 22 | 2 | 2023 | 2025-01-25 | Java | GPL-3.0 | 6 | Inactive (archived) |
| 43 | Raze | FPS | P | ZDoom/Raze | 891 | 57 | 2019 | 2025-11-19 | C++ |  | 44 | Community |
| 44 | Doom (id release) | FPS | S | id-Software/DOOM | 19786 | 2 | 2012 | 2024-05-24 | C++ | GPL-2.0 | 0 | Archive |
| 45 | DOOM64-RE | FPS | D | Erick194/DOOM64-RE | 237 | 5 | 2020 | 2025-05-30 | C | GPL-3.0 | 0 | Small/rough |
| 46 | Doom 3 BFG Edition | FPS | S | id-Software/DOOM-3-BFG | 5390 | 3 | 2012 | 2024-08-21 | C++ | GPL-3.0 | 0 | Archive |
| 47 | Quake (id release) | FPS | S | id-Software/Quake | 6095 | 1 | 2012 | 2024-06-15 | C |  | 0 | Archive |
| 48 | Quake II | FPS | S | id-Software/Quake-2 | 3359 | 1 | 2012 | 2023-12-05 | C |  | 0 | Archive |
| 49 | Quake III Arena | FPS | S | id-Software/Quake-III-Arena | 8280 | 1 | 2012 | 2024-08-02 | C | GPL-2.0 | 0 | Archive |
| 50 | Wolfenstein 3D | FPS | S | id-Software/wolf3d | 2558 | 2 | 2012 | 2012-02-06 |  |  | 0 | Archive |
| 51 | CatacombGL | FPS | P | ArnoAnsems/CatacombGL | 196 | 10 | 2018 | 2026-10-23 | C++ | GPL-3.0 | 16 | Small/rough |
| 52 | Chocolate Doom | FPS | P | chocolate-doom/chocolate-doom | 2445 | 97 | 2009 | 2026-10-25 | C | GPL-2.0 | 8 | Community |
| 53 | ZDoom | FPS | P | UZDoom/UZDoom | 2304 | 297 | 2025 | 2026-10-24 | C++ | NOASSERTION | 7 | Community |
| 54 | Chocolate Quake | FPS | P | Henrique194/chocolate-quake | 228 | 4 | 2025 | 2026-09-07 | C | GPL-3.0 | 10 | Small/rough |
| 55 | FTEQW | FPS | P | fte-team/fteqw | 356 | 46 | 2021 | 2026-06-04 | C | GPL-2.0 | 1 | Community |
| 56 | ECWolf | FPS | P | bitbucket.org |  |  |  |  |  |  |  | Community |
| 57 | Wolf4SDL | FPS | P | lazd/wolf4sdl | 12 | 2 | 2018 | 2018-10-21 | C++ | GPL-2.0 | 0 | Inactive |
| 58 | Commander-Genius | Plat | R | gitlab.com |  |  |  |  |  |  |  | Community |
| 59 | Commander Keen in Keen Dreams | Plat | S | keendreams/keen | 1972 | 1 | 2014 | 2014-11-12 | C | GPL-2.0 | 0 | Archive |
| 60 | Omnispeak | Plat | R | sulix/omnispeak | 318 | 15 | 2012 | 2026-07-12 | C | GPL-2.0 | 3 | Small/rough |
| 61 | DDraceNetwork | Plat | O | ddnet/ddnet | 852 | 362 | 2014 | 2026-10-23 | C++ | NOASSERTION | 0 | Shipped |
| 62 | Jumpy | Plat | O | fishfolk/jumpy | 1887 | 49 | 2021 | 2026-01-30 | Rust | NOASSERTION | 25 | Community |
| 63 | Punchy | Plat | O | fishfolk/punchy | 314 | 12 | 2022 | 2024-06-06 | Rust | NOASSERTION | 8 | Inactive |
| 64 | Frogatto & Friends | Plat | O | frogatto/frogatto | 709 | 67 | 2011 | 2026-09-19 | Ruby | NOASSERTION | 1 | Shipped |
| 65 | OpenGOAL | Plat | D | water111/jak-project | 3612 | 75 | 2020 | 2026-10-24 | Common Lisp | ISC | 90 | Community |
| 66 | Rigel Engine | Plat | R | lethal-guitar/RigelEngine | 1013 | 19 | 2016 | 2026-09-28 | C++ | GPL-2.0 | 25 | Small/rough |
| 67 | Sonic Robo Blast 2 | Plat | O | git.do.srb2.org |  |  |  |  |  |  |  | Community |
| 68 | Super Mario 64 | Plat | D | n64decomp/sm64 | 8928 | 6 | 2019 | 2024-02-04 | C | CC0-1.0 | 2 | Inactive |
| 69 | VVVVVV | Plat | O | TerryCavanagh/VVVVVV | 8042 | 54 | 2015 | 2026-10-23 | ActionScript | NOASSERTION | 13 | Shipped |
| 70 | BlockOut II | Puzzle | R | sourceforge.net |  |  |  |  |  |  |  | Inactive |
| 71 | Portal64 | Puzzle | R | mwpenny/portal64-still-alive | 632 | 36 | 2023 | 2026-10-21 | C | MIT | 4 | Small/rough |
| 72 | Whatajong | Puzzle | O | masylum/whatajong | 15 | 1 | 2025 | 2025-06-15 | TypeScript | MIT | 0 | Small/rough |
| 73 | Dust Racing 2D * | Race | O | juzzlin/DustRacing2D | 338 | 17 | 2015 | 2026-10-11 | C++ | GPL-3.0 | 12 | Small/rough |
| 74 | ManiaDrive | Race | R | maniadrive.raydium.org |  |  |  |  |  |  |  | Inactive |
| 75 | Rigs of Rods | Race | O | RigsOfRods/rigs-of-rods | 1276 | 128 | 2014 | 2026-10-25 | C++ | GPL-3.0 | 10 | Community |
| 76 | RVGL | Race | P | gitlab.com |  |  |  |  |  |  |  | Community |
| 77 | Speed Dreams | Race | O | forge.a-lec.org |  |  |  |  |  |  |  | Community |
| 78 | Stunt Rally | Race | O | stuntrally/stuntrally3 | 222 | 15 | 2022 | 2026-04-18 | C++ | GPL-3.0 | 9 | Small/rough |
| 79 | SuperTuxKart | Race | O | supertuxkart/stk-code | 5449 | 280 | 2014 | 2026-10-24 | C++ | NOASSERTION | 14 | Community |
| 80 | TORCS - The Open Racing Car Simulator | Race | O | sourceforge.net |  |  |  |  |  |  |  | Inactive |
| 81 | Trigger Rally | Race | O | sourceforge.net |  |  |  |  |  |  |  | Inactive |
| 82 | VDrift | Race | O | VDrift/vdrift | 415 | 39 | 2010 | 2026-04-07 | C++ | GPL-3.0 | 0 | Small/rough |
| 83 | Yorg | Race | O | cflavio/yorg | 189 | 10 | 2016 | 2024-09-06 | Python | NOASSERTION | 1 | Inactive |
| 84 | wipEout | Race | D | phoboslab/wipeout-rewrite | 2992 | 25 | 2023 | 2026-09-27 | C |  | 0 | Small/rough |
| 85 | 0 A.D. | RTS | O | gitea.wildfiregames.com |  |  |  |  |  |  |  | Community |
| 86 | BAR | RTS | O | beyond-all-reason/Beyond-All-Reason | 4326 | 349 | 2019 | 2026-10-24 | Lua | NOASSERTION | 0 | Community |
| 87 | Dune II The Maker | RTS | R | stefanhendriks/Dune-II---The-Maker | 372 | 15 | 2012 | 2026-10-24 | C++ | NOASSERTION | 26 | Small/rough |
| 88 | Freeserf.net | RTS | R | Pyrdacor/freeserf.net | 177 | 13 | 2018 | 2026-10-24 | C# | GPL-3.0 | 53 | Small/rough |
| 89 | Keeper FX | RTS | R | dkfans/keeperfx | 1028 | 60 | 2015 | 2026-10-24 | C | GPL-2.0 | 11 | Community |
| 90 | Mindustry | RTS | O | Anuken/Mindustry | 29459 | 1077 | 2017 | 2026-10-22 | Java | GPL-3.0 | 205 | Shipped |
| 91 | OpenAge | RTS | R | SFTtech/openage | 14548 | 228 | 2013 | 2026-10-20 | Python | NOASSERTION | 8 | Community |
| 92 | OpenHV | RTS | O | OpenHV/OpenHV | 1087 | 23 | 2019 | 2026-10-20 | C# | GPL-3.0 | 48 | Small/rough |
| 93 | OpenRA | RTS | R | OpenRA/OpenRA | 17643 | 455 | 2010 | 2026-10-24 | C# | GPL-3.0 | 106 | Community |
| 94 | Permafrost Engine | RTS | O | eduard-permyakov/permafrost-engine | 2768 | 3 | 2017 | 2026-10-06 | C | GPL-3.0 | 0 | Small/rough |
| 95 | Standard Of Iron | RTS | O | djeada/Standard-of-Iron | 62 | 8 | 2025 | 2026-10-24 | C++ | MIT | 3 | Small/rough |
| 96 | Warzone 2100 | RTS | O | Warzone2100/warzone2100 | 4011 | 183 | 2010 | 2026-10-25 | C++ | GPL-2.0 | 54 | Shipped |
| 97 | Widelands | RTS | R | widelands/widelands | 3113 | 179 | 2019 | 2026-10-22 | C++ | GPL-2.0 | 18 | Community |
| 98 | Zero-K | RTS | O | ZeroK-RTS/Zero-K | 876 | 155 | 2013 | 2026-10-25 | Lua | GPL-2.0 | 0 | Shipped |
| 99 | OpenBW | RTS | R | OpenBW/openbw | 261 | 3 | 2016 | 2026-08-13 | C++ |  | 0 | Small/rough |
| 100 | Strategus | RTS | R | Wargus/stratagus | 743 | 52 | 2015 | 2026-10-18 | C++ | GPL-2.0 | 14 | Community |
| 101 | War1gus | RTS | R | Wargus/war1gus | 136 | 10 | 2015 | 2026-06-22 | Lua | GPL-2.0 | 12 | Small/rough |
| 102 | Wargus | RTS | R | Wargus/wargus | 445 | 65 | 2015 | 2026-10-10 | C | GPL-2.0 | 12 | Community |
| 103 | Wyrmsun | RTS | O | Andrettin/Wyrmsun | 334 | 11 | 2014 | 2025-04-17 | Lua | GPL-2.0 | 124 | Small/rough |
| 104 | Stargus | RTS | R | Wargus/stargus | 158 | 12 | 2015 | 2026-10-06 | C++ | GPL-2.0 | 2 | Small/rough |
| 105 | Warsmash Mod Engine | RTS | R | Retera/WarsmashModEngine | 585 | 14 | 2021 | 2026-10-05 | Java | AGPL-3.0 | 0 | Small/rough |
| 106 | Command & Conquer Remastered Collection | RTS | S | electronicarts/CnC_Remastered_Collection | 21384 | 4 | 2020 | 2025-01-16 | C++ | NOASSERTION | 0 | Archive (archived) |
| 107 | Generals | RTS | S | electronicarts/CnC_Generals_Zero_Hour | 4739 | 1 | 2024 | 2025-02-27 | C++ | NOASSERTION | 0 | Archive (archived) |
| 108 | Red Alert | RTS | S | electronicarts/CnC_Red_Alert | 6702 | 1 | 2024 | 2025-02-27 | C++ | NOASSERTION | 0 | Archive (archived) |
| 109 | Tiberian Dawn | RTS | S | electronicarts/CnC_Tiberian_Dawn | 1808 | 1 | 2024 | 2025-02-27 | C++ | NOASSERTION | 0 | Archive (archived) |
| 110 | Brogue CE | Rogue | O | tmewett/BrogueCE | 1505 | 57 | 2019 | 2026-10-20 | C | AGPL-3.0 | 20 | Community |
| 111 | Cataclysm: Dark Days Ahead | Rogue | O | CleverRaven/Cataclysm-DDA | 13406 | 3071 | 2012 | 2026-10-25 | C++ | NOASSERTION | 1000 | Shipped |
| 112 | Dungeon Crawl Stone Soup | Rogue | O | crawl/crawl | 3049 | 582 | 2014 | 2026-10-24 | C++ | NOASSERTION | 28 | Community |
| 113 | NetHack | Rogue | O | NetHack/NetHack | 3961 | 111 | 2015 | 2026-10-23 | C |  | 8 | Community |
| 114 | Meritous | Rogue | O | Patashu/Meritous | 1 | 2 | 2018 | 2018-07-21 | C |  | 0 | Inactive |
| 115 | OpenNefia | Rogue | R | OpenNefia/OpenNefia | 160 | 4 | 2021 | 2024-06-27 | C# | MIT | 1 | Inactive |
| 116 | Shattered Pixel Dungeon | Rogue | O | 00-Evan/shattered-pixel-dungeon | 6712 | 3 | 2014 | 2026-10-07 | Java | GPL-3.0 | 55 | Shipped |
| 117 | Ambermoon.net | RPG | R | Pyrdacor/Ambermoon.net | 543 | 11 | 2020 | 2026-10-22 | C# | GPL-3.0 | 129 | Small/rough |
| 118 | Daggerfall Unity | RPG | R | Interkarma/daggerfall-unity | 3545 | 99 | 2015 | 2026-10-21 | C# | MIT | 33 | Community |
| 119 | Exult | RPG | R | exult/exult | 695 | 51 | 2016 | 2026-10-24 | C++ | GPL-2.0 | 645 | Community |
| 120 | Fallout Community Edition | RPG | D | alexbatalov/fallout1-ce | 2953 | 7 | 2023 | 2025-01-15 | C++ | NOASSERTION | 2 | Small/rough |
| 121 | Fallout 2 Community Edition | RPG | D | alexbatalov/fallout2-ce | 2476 | 25 | 2022 | 2025-02-17 | C++ | NOASSERTION | 7 | Small/rough |
| 122 | GemRB * | RPG | R | gemrb/gemrb | 1264 | 123 | 2012 | 2026-10-24 | C++ | GPL-2.0 | 12 | Community |
| 123 | Kandria | RPG | O | codeberg.org |  |  |  |  |  |  |  | Shipped |
| 124 | Naev | RPG | O | codeberg.org |  |  |  |  |  |  |  | Shipped |
| 125 | Oolite | RPG | R | OoliteProject/oolite | 674 | 50 | 2013 | 2026-10-25 | Objective-C | NOASSERTION | 52 | Community |
| 126 | OpenEnroth | RPG | R | OpenEnroth/OpenEnroth | 875 | 45 | 2016 | 2026-10-22 | C++ | LGPL-3.0 | 1 | Community |
| 127 | OpenMW | RPG | R | OpenMW/openmw | 6678 | 513 | 2009 | 2026-10-23 | C++ | GPL-3.0 | 40 | Community |
| 128 | OpenNox | RPG | D | noxworld-dev/opennox | 23 | 17 | 2024 | 2024-11-23 | C | GPL-3.0 | 0 | Inactive (archived) |
| 129 | reone | RPG | R | seedhartha/reone | 320 | 8 | 2020 | 2025-04-06 | C++ | GPL-3.0 | 0 | Small/rough |
| 130 | Severed Chains | RPG | D | Legend-of-Dragoon-Modding/Severed-Chains | 569 | 29 | 2021 | 2026-10-24 | Java |  | 7 | Small/rough |
| 131 | Space Station 14 | RPG | R | space-wizards/space-station-14 | 3883 | 1630 | 2017 | 2026-10-25 | C# | MIT | 1 | Community |
| 132 | Ultima VII: Revisited | RPG | R | ViridianGames/U7Revisited | 527 | 15 | 2023 | 2026-10-22 | Lua | BSD-2-Clause | 0 | Small/rough |
| 133 | Veloren | RPG | O | veloren/veloren | 7643 | 569 | 2018 | 2026-10-24 | Rust | GPL-3.0 | 2 | Community |
| 134 | Abyss Engine | RPG | R | AbyssEngine/AbyssEngine | 320 | 1 | 2024 | 2024-04-21 | C | MIT | 0 | Inactive |
| 135 | DevilutionX | RPG | D | diasurgical/devilutionX | 9937 | 292 | 2018 | 2026-10-24 | C++ | NOASSERTION | 22 | Community |
| 136 | Freeablo | RPG | R | wheybags/freeablo | 2170 | 32 | 2013 | 2023-04-13 | C++ | GPL-3.0 | 4 | Inactive |
| 137 | Open Diablo II | RPG | R | OpenDiablo2/OpenDiablo2 | 11104 | 77 | 2018 | 2021-10-21 | Go | GPL-3.0 | 1 | Inactive (archived) |
| 138 | OpenKO | RPG | R | Open-KO/KnightOnline | 374 | 28 | 2016 | 2026-08-07 | C++ | MIT | 0 | Small/rough |
| 139 | OpenKore | RPG | R | OpenKore/openkore | 1539 | 155 | 2016 | 2026-10-20 | Perl | NOASSERTION | 0 | Community |
| 140 | Minosoft | Sandbox | R | bixilon/minosoft | 1317 | 8 | 2021 | 2026-08-31 | Kotlin | GPL-3.0 | 0 | Small/rough |
| 141 | SDL Sopwith | Shmup | P | fragglet/sdl-sopwith | 120 | 10 | 2020 | 2026-09-28 | C | GPL-2.0 | 29 | Small/rough |
| 142 | Taisei Project | Shmup | O | taisei-project/taisei | 1659 | 28 | 2010 | 2026-10-23 | C | NOASSERTION | 15 | Small/rough |
| 143 | Open Golf | Sport | O | mgerdes/Open-Golf | 1942 | 4 | 2020 | 2024-03-18 | C | MIT | 0 | Inactive |
| 144 | Pooltool | Sport | O | ekiefl/pooltool | 427 | 16 | 2020 | 2026-10-11 | Python | Apache-2.0 | 14 | Small/rough |
| 145 | Command & Conquer Renegade | TPS | S | electronicarts/CnC_Renegade | 1630 | 1 | 2024 | 2025-03-03 | C++ | NOASSERTION | 0 | Archive (archived) |
| 146 | CroftEngine | TPS | R | stohrendorf/CroftEngine | 311 | 29 | 2015 | 2026-10-04 | C++ | NOASSERTION | 72 | Small/rough |
| 147 | Lugaru: The Rabbit's Foot | TPS | O | WolfireGames/lugaru | 44 | 24 | 2022 | 2022-04-19 | C++ | NOASSERTION | 0 | Shipped |
| 148 | OpenLara | TPS | R | XProger/OpenLara | 5136 | 57 | 2016 | 2026-07-26 | C | BSD-2-Clause | 11 | Community |
| 149 | OpenRW | TPS | R | rwengine/openrw | 2253 | 51 | 2015 | 2025-06-18 | C++ | GPL-3.0 | 0 | Community |
| 150 | Overgrowth | TPS | O | WolfireGames/overgrowth | 2931 | 14 | 2022 | 2026-09-24 | C++ | Apache-2.0 | 0 | Shipped |
| 151 | RE3 | TPS | D | VideogameSources/gta3-decomp-alt | 152 | 2 | 2021 | 2021-02-20 | C++ |  | 0 | Inactive |
| 152 | Tomb Engine | TPS | R | TombEngine/TombEngine | 347 | 39 | 2018 | 2026-10-23 | C++ | NOASSERTION | 0 | Small/rough |
| 153 | Server Survival | TD | O | pshenok/server-survival | 6470 | 30 | 2025 | 2026-10-21 | JavaScript | MIT | 1 | Small/rough |
| 154 | Ancient Beast | TBS | O | FreezingMoon/AncientBeast | 1884 | 222 | 2011 | 2026-10-25 | TypeScript | AGPL-3.0 | 4 | Community |
| 155 | Athena Crisis | TBS | O | nkzw-tech/athena-crisis | 1988 | 14 | 2024 | 2026-09-06 | TypeScript | NOASSERTION | 0 | Shipped |
| 156 | C-evo | TBS | O | c-evo.org |  |  |  |  |  |  |  | Small/rough |
| 157 | fheroes2 | TBS | R | ihhub/fheroes2 | 3516 | 194 | 2019 | 2026-10-23 | C++ | GPL-2.0 | 75 | Community |
| 158 | FreeCol | TBS | R | FreeCol/freecol | 718 | 86 | 2017 | 2026-10-22 | Java | GPL-2.0 | 57 | Community |
| 159 | Freeciv | TBS | R | freeciv/freeciv | 1617 | 173 | 2017 | 2026-10-25 | C | GPL-2.0 | 0 | Community |
| 160 | FreeOrion | TBS | O | freeorion/freeorion | 1052 | 133 | 2015 | 2026-10-23 | C++ |  | 14 | Community |
| 161 | Hnefatafl | TBS | O | dcampbell24/hnefatafl | 8 | 5 | 2025 | 2026-10-24 | Rust | AGPL-3.0 | 8 | Small/rough |
| 162 | OpenPanzer | TBS | R | nicupavel/openpanzer | 188 | 6 | 2012 | 2021-02-27 | JavaScript |  | 0 | Inactive |
| 163 | OpenXcom | TBS | R | OpenXcom/OpenXcom | 2241 | 181 | 2011 | 2026-09-28 | C++ | GPL-3.0 | 0 | Community |
| 164 | The Battle for Wesnoth | TBS | O | wesnoth/wesnoth | 6953 | 445 | 2013 | 2026-10-24 | C++ | GPL-2.0 | 0 | Shipped |
| 165 | Unciv | TBS | R | yairm210/Unciv | 11486 | 304 | 2017 | 2026-10-24 | Kotlin | MPL-2.0 | 989 | Shipped |
| 166 | VCMI Project | TBS | R | vcmi/vcmi | 5982 | 249 | 2014 | 2026-10-25 | C++ | GPL-2.0 | 41 | Community |

## Verdict

- **Good games, not slop.** About 46% of the list is shipped or long-lived community work (77 of 166). The shipped originals have thousands of Steam reviews at 85-96% positive. The list curator favors established projects. Recent viral web toys are the exception, not the rule.
- **"Fully featured" mostly means remakes of 1990s commercial games.** Most of those are excellent: OpenRCT2, OpenTTD, DevilutionX, OpenMW, fheroes2, VCMI. But players need the original paid assets. They are references for engine and game-logic design, not content we can ship.
- **Truly finished, self-contained originals are a small set**, about 20-30. Mindustry, Shattered PD, Endless Sky, Wesnoth, Zero-K, Cataclysm: DDA, SuperTuxKart, 0 A.D., Xonotic, BAR, Naev, Hypersomnia, Red Eclipse, DDNet, Unciv and Taisei are the strongest.
- **Reviews exist** for the Steam-shipped set and a few mobile titles. Most others have only forum, press or Linux-news coverage.
- **For our TS + Phaser/Three stack, direct reuse is near zero.** Only Ancient Beast (Phaser 4.2, AGPL) and Server Survival (Three r128, MIT) are close. Athena Crisis (MIT code, closed assets) is the best-quality TS reference. Expect to mine this list for design patterns and genre benchmarks, not for code.
- **License caution.** Most entries are GPL or AGPL, or have unclear or no license. Assets are often non-free. Do not copy code into agent-built games without a license review.

## Sources

- List: https://github.com/bobeff/open-source-games (README, CC0)
- GitHub GraphQL/REST API via `gh api` (repo metadata, contributors, package.json, LICENSE files of AncientBeast, athena-crisis, isometric-city, whatajong, micropolisJS, server-survival)
- Codeberg API: https://codeberg.org/api/v1/repos/{liblast/liblast, hurrycurry/hurrycurry, shirakumo/kandria, naev/naev}
- GitLab API: https://gitlab.com/api/v4/projects/{drummyfish/anarch, xonotic/xonotic, Dringgstein/Commander-Genius}
- Steam store pages (store.steampowered.com/app/<id>): Mindustry 1127400, Endless Sky 404410, Overgrowth 25000, VVVVVV 70300, Wesnoth 599390, Zero-K 334920, DDNet 412220, Warzone 2100 1241950, Shattered PD 1769170, Red Eclipse 967460, Cataclysm DDA 2330750, Lugaru HD 25010, Naev 598530, Hypersomnia 2660970, Athena Crisis 2456430, Kandria 1261430, OpenTTD 1536610, Frogatto 865030, Space Station 14 1255460, Akhenaten 719160
- itch.io: https://anuke.itch.io/mindustry, https://naev.itch.io/naev, https://dalerank.itch.io/akhenaten, https://ya2.itch.io/yorg
- Wikipedia API: https://en.wikipedia.org/w/api.php (action=query, title existence)
- Athena Crisis: https://opencritic.com/game/17358/-/reviews ; https://gamingonlinux.com/2024/09/advance-wars-fans-should-check-out-athena-crisis-with-the-1-0-release-out-now ; https://cpojer.net/posts/athena-crisis-open-source.md
- Kandria: https://echoboomer.pt/kandria-pc/ ; https://www.taptap.io/ru/post/4190797
- Shattered PD: https://www.appbrain.com/dev/Shattered+Pixel/ ; https://gamingonlinux.com/2022/03/shattered-pixel-dungeon-arrives-on-steam-eight-years-later
- Unciv: https://www.appbrain.com/dev/Yair+Morgenstern/
- Cataclysm DDA: https://gamingonlinux.com/2023/04/popular-survival-roguelike-cataclysm-dark-days-ahead-gets-a-steam-release
- 0 A.D.: https://play0ad.com/new-release-0-a-d-alpha-27-agni/
- SuperTuxKart: https://www.omgubuntu.co.uk/2025/10/supertuxkart-1-5-released ; https://itsfoss.com/news/supertuxkart-1-5/
- Veloren: https://www.gamingonlinux.com/search-articles/appid/17745
- BAR: https://www.gamingonlinux.com/2026/07/open-source-rts-game-beyond-all-reason-signs-publishing-deal-with-hooded-horse/
- Space Station 14: https://spacestation14.com/post/21-02-12-progress-report-25/
- Zelda 3: https://www.engadget.com/someone-reverse-engineered-the-legend-of-zelda-a-link-to-the-past-for-pc-115542772.html ; https://www.pcgamesn.com/legend-of-zelda-pc-port
- IsoCity: https://flowingdata.com/2026/01/28/isocity-an-open-source-city-building-game/ ; https://ixbt.games/en/news/2025/12/25/entuziast-vypustil-besplatnyi-analog-simcity-v-kotoryi-mozno-poigrat-v-brauzere.html
- Server Survival: https://hellogithub.com/en/repository/pshenok/server-survival
- Citybound: https://www.gameskinny.com/dloen/from-the-ashes-of-simcity-an-interview-with-citybound-creator-anselm-eickhoff
- Liblast: https://godotforums.org/d/32089-liblast-a-foss-multiplayer-fps-game-made-with-100-open-source-software/57
- Hurry Curry: https://www.linuxlinks.com/hurry-curry-multiplayer-co-op-cooking-game/

Raw data (scratchpad, not committed): /tmp/claude-1000/-home-everdred-github-everdred-uncle-kevins-game-maker-2000/8570a016-3424-47d2-9901-c5e8a320401a/scratchpad/osgwork/rows.json
