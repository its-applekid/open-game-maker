# B15: Other open-source game collections (web and TypeScript focus)

Date: 2026-10-24. Stack: Three.js r186 + Rapier, Phaser 4.2, Tone.js, ZzFX, TypeScript.

Evidence labels: **[V]** means checked in a primary source (GitHub API, the repo, or the site's own API). **[S]** means secondary (search summary, blog, or a third party).

## Summary

- The general lists are mostly native C/C++ games. Web is about 10% of Trilarion and osgameclones. It is about a third of michelpereira and leereilly. It is almost none of bobeff, libregamewiki and Wikipedia. [V]
- Only two sources are machine-readable. **osgameclones** uses YAML with a schema: langs, frameworks, licenses, platforms, status, multiplayer. **Trilarion OSGL** uses structured Markdown with a Lark grammar: language, license, platform, keywords, stars. Both can be filtered to "Web + JS/TS + permissive". osgameclones yields 350 Web entries, 44 TypeScript, 22 Phaser and 11 three.js. [V]
- **js13kGames** is the largest pure-web corpus. It has about 2,800 entry repos in the `js13kGames` GitHub org and about 200 new entries a year. The source must be public on GitHub, but no license is required. Most entry repos have no LICENSE file. Treat js13k as "read for patterns", not "copy code". [V counts, S rule wording]
- For our exact stack, the **official examples** are worth more than any list: three.js examples (617 pages, including `games_fps` and 5 `physics_rapier_*` demos), Phaser 4 examples (2,541 files plus `examples.json`), and the Phaser templates (now on Phaser 4.0.0). All are MIT. [V]
- Few open-source three.js + Rapier games are both complete and permissively licensed. The best are brunosimon/folio-2025 (three 0.183 + Rapier 0.17, MIT) and iErcann/NotBlox (three 0.183 + Rapier, multiplayer, MIT). [V]
- PlayCanvas and Babylon.js have few open-source *games* on GitHub. Their games are mostly hosted projects or tutorial demos, often with no license. [V]
- Game jams (Ludum Dare, Game Off) are large but noisy. They are jam-sized, mixed-engine (Game Off is Godot-heavy) and have unclear licenses. They are not machine-readable beyond GitHub topics. [V/S]

## Collections comparison

"Web share" means the share of entries that run in a browser or are written in JS/TS. Counts were taken from the data on 2026-10-24.

| Source | Stars | Last activity | Size | Web share | License pattern | Curation | Complete or jam | Machine-readable | Ev. |
|---|---|---|---|---|---|---|---|---|---|
| bobeff/open-source-games (baseline) | 17,025 | 2026-02-25 | ~205 entries | ~1% | List CC0. Entries mostly GPL. | Curated | Complete, many source ports | No (Markdown) | V |
| radek-sprta/awesome-game-remakes | 1,555 | 2026-10-24 | ~464 entries | <5% (16 web mentions) | List CC-BY-SA-4.0. Entries GPL-heavy. Most need original game assets. | Curated ("actively maintained") | Complete remakes | No (Markdown/mkdocs) | V |
| michelpereira/awesome-open-source-games | 3,318 | 2026-10-21 | ~459 entries | ~32% (148 in "Browser-Based") | List CC0. Entries mixed. | Light curation (PRs) | Mixed | No (Markdown, by genre) | V |
| leereilly/games | 24,985 | **Archived**, last push 2025-09-13 | ~431 entries | ~35% (151 in "Browser-Based") | No list license. Entries mixed. | Anything goes, now frozen | Mixed, many toys | No | V |
| libregamewiki.org | n/a (wiki) | Edits 2026-10-25 | 713 game pages | Very low ("Browser games" category has 1 page) | Free licenses only. 492 pages in "GPL games". | Curated wiki, free-software rule | Complete | Partly. MediaWiki API with license categories. | V |
| Trilarion/opensourcegames (OSGL) | 1,100 | 2026-10-10 | 2,034 entries | JS/TS 205 (10%), Web 226 (11%), TS 40 | CC0 data. Entries GPL-2 624, GPL-3 570, MIT 398. | Curated, grammar-checked | Complete | **Yes.** Structured `entries/*.md`: Code language, Code license, Platform, Keyword, State, @stars. | V |
| opengaming/osgameclones | 3,160 | 2026-10-24 | 3,289 entries | Web 350 (11%), JS 185, TS 44 | Field per entry | Curated, schema CI on PRs | Clones and remakes. Has `status` (playable…) and `development` fields. | **Yes.** `games/*.yaml` plus `schema/games.yaml`. Frameworks field: Phaser 22, three.js 11, PixiJS 5, Babylon 1. | V |
| Wikipedia "List of open-source video games" | n/a | Edited 2026-10-17 | ~192 rows | ~2% (4 JS mentions) | Mixed | Notable games only | Complete | Partly (wikitext tables) | V |
| proyecto26/awesome-jsgames | 983 | 2026-10-25 | ~220 entries | ~100% | List CC0. Entries vary. | Curated, by genre | Mixed. Links to js13k and Game Off winners from 2012 to 2026. | No | V |
| js13kGames (org `js13kGames`) | Org has 2,822 repos. `resources` has 254 stars. | 2026-09 (2026 edition) | ~200 per year (197 in 2025) | 100% | Public readable source on GitHub is required. **No license is required.** Only ~32 org repos show MIT. | Judged competition | Jam-sized (13 KB zip) | Partly. Repo descriptions follow "X — a js13kGames YEAR game by @author". `js13kGames/games` holds 1,000+ minified builds with no metadata. | V counts, S rules |
| GitHub Game Off (itch.io) | Old `github/game-off-2012` 256, `2016` 248 | 2026 edition opens 2026-11-01 | 1,057 joined (2026) | Low to mid (Godot-heavy) | Public GitHub repo is required. No license is required. | Jam ranking | Jam-sized (1 month) | No. GitHub `topic:game-off` has only 24 repos. | V |
| Ludum Dare | n/a | Ongoing | `topic:ludum-dare` has 858 repos | Mixed | Source said to be required for Compo and optional for Jam. Licenses vary. | Anything goes | Jam-sized (48 to 72 hours) | No | V topic, S rules |
| phaserjs/examples | 1,667 | 2026-08-24 | 2,541 example files | 100% | MIT (stated in README; no LICENSE file, so GitHub shows none) | Official | Snippets, now **Phaser 4** | **Yes.** `public/examples.json`, `documentIndex.json`. | V |
| Phaser templates (`template-vite-ts` 196, `-react-ts` 202, `-webpack` 1,175, `create-game` 73) | see left | 2026-04 | ~15 templates | 100% | MIT | Official | Scaffolds. TS templates pin `phaser` 4.0.0. | No | V |
| three.js examples (in mrdoob/three.js) | 116,888 | 2026-10-24 | 617 example pages | 100% | MIT | Official | Feature demos. `games_fps`, `physics_rapier_{basic,character_controller,instancing,joints,terrain,vehicle_controller}`. | **Yes.** `examples/files.json`, `examples/tags.json`. | V |
| godotengine/godot-demo-projects | 9,705 | 2026-10-08 | 139 projects | 0% (GDScript; can export to web) | MIT | Official | Small demos | No (only `project.godot` files) | V |
| GDevelopApp/GDevelop-examples | 179 | 2026-10-24 | 307 examples | Runs in the web, but games are GDevelop JSON event sheets, not TS | "MIT unless specified" | Reviewed submissions | Small complete games and demos | Partly (`TAGS.md` + JSON project per example) | V |
| Mozilla BrowserQuest legacy | mozilla 9,373 (**archived**). Kaetram-Open 749. phaserquest 390. | Mozilla 2023 (archived). Kaetram 2026-10-13. | 1 game plus forks | 100% | Code MPL-2.0. Content CC-BY-SA-3.0. Kaetram MPL-2.0. phaserquest MIT. | n/a | Complete MMO | No | V |
| PlayCanvas (`engine` 17,132, `awesome-playcanvas` 497) | see left | 2026-10-23 / 2026-10-19 | ~244 list entries. Only ~20 link to GitHub. | 100% | Engine MIT. Games are mostly hosted on playcanvas.com, not on GitHub. | Curated list | Mixed | No | V |
| Babylon.js (26,222) | see left | 2026-10-23 | Official games: SummerFestival 137, SpacePirates 158 | 100% | Engine Apache-2.0. SummerFestival has no license. SpacePirates is NOASSERTION. | Official demos | Tutorial and demo games | No | V |
| Excalibur (2,359) | see left | 2026-10-24 | ~10 `sample-*` repos (each ≤17 stars) | 100%, TS | BSD-2-Clause, mostly | Official | Small samples (platformer, tactics, grid) | No | V |
| Kaplay (1,816) | see left | 2026-10-22 | 135 files in `examples/`, plus kaplayground (51) | 100%, TS | MIT | Official | Snippets | No | V |

Also noted. ellisonleao/magictools (17,572) lists tools, not games. verekia/webgamedev (186) is a web game dev guide. js13kGames/js13kBreakouts (30) builds the same Breakout in Goodluck, Kontra, Litecanvas and LittleJS, but has no license. [V]

## How to use the machine-readable sources

- osgameclones: filter `platforms: [Web]`, `langs ∋ TypeScript|JavaScript`, `licenses ∋ MIT|Apache|BSD|Zlib`, and `status: playable`. Then read `frameworks` to pick Phaser or three.js. [V schema]
- Trilarion: grep `- Platform: Web`, `- Code language: TypeScript` and `- Code license: MIT`. The `@stars` field in `Code repository` gives a cheap popularity sort. [V]
- three.js `tags.json` and Phaser `examples.json` let an agent find the closest official demo by keyword. [V files exist]

## Shortlist: best web/TS references for our stack

The "License use" column says whether code can be copied (MIT, BSD, Unlicense) or only read for patterns (no license, or copyleft).

| # | Repo | Stars | License (use) | Engine/stack | Genre | Why it is a good reference |
|---|---|---|---|---|---|---|
| 1 | mrdoob/three.js `examples/` (`games_fps`, `physics_rapier_*`) | 116,888 | MIT (copy) | three.js + Rapier | FPS, physics demos | Official and current. Shows Rapier character and vehicle controllers in three.js. This is the exact stack. |
| 2 | brunosimon/folio-2025 | 1,979 | MIT (copy) | three 0.183, @dimforge/rapier3d 0.17, Howler, Vite | Driving sandbox | Best real, polished three.js + Rapier project. Recent three version. |
| 3 | iErcann/NotBlox | 185 | MIT (copy) | three 0.183, rapier3d-compat, uWS, TS | Multiplayer physics sandbox, cars | Authoritative-server multiplayer with Rapier on the server and three.js on the client. Uses a shared TS package. |
| 4 | pmndrs/ecctrl | 810 | MIT (copy) | React Three Fiber + Rapier, TS | Character controller kit | Clean third-person and first-person controller patterns on Rapier. Can be ported off React. |
| 5 | pmndrs/racing-game | 2,224 | MIT (copy) | R3F + cannon, TS | Racing | Complete game with good state and UI split (zustand). Old three (r139) and cannon, so use it for structure only. |
| 6 | phaserjs/examples | 1,667 | MIT (copy) | Phaser 4 | 2,541 snippets | Official Phaser 4 API usage. `examples.json` makes it searchable. |
| 7 | phaserjs/template-vite-ts | 196 | MIT (copy) | Phaser 4.0.0 + Vite + TS | Scaffold | Official project layout: boot, preloader and scenes. A natural base template. |
| 8 | digitsensitive/phaser3-typescript | 1,034 | MIT (copy) | Phaser 3, TS | 15 classic small games (Snake, Breakout, Tank…) | Many small complete games in TS. Most patterns carry over to Phaser 4. |
| 9 | Kaetram/Kaetram-Open | 749 | MPL-2.0 (patterns, file-level copyleft) | TS, custom 2D, Node server | 2D MMORPG | The active TS descendant of BrowserQuest. A large multiplayer architecture reference. |
| 10 | mozilla/BrowserQuest | 9,373 | MPL-2.0 code, CC-BY-SA content (patterns) | JS, Canvas, WebSocket | 2D MMO | The classic HTML5 multiplayer design. Archived. Read it for history. |
| 11 | colyseus/colyseus + colyseus/tutorial-phaser | 7,468 / 77 | MIT / none (patterns for tutorial) | Colyseus + Phaser, TS | Multiplayer tutorial | Room and state-sync patterns for Phaser multiplayer. |
| 12 | danprince/norman-the-necromancer | 200 | Unlicense (copy) | Plain TS, Canvas | js13k 2022 action roguelite | A complete small TS game with a tidy structure and no engine. |
| 13 | KilledByAPixel/LittleJS | 4,348 | MIT (copy) | LittleJS, includes ZzFX | Engine + example games | Small readable engine with example games. Shows ZzFX sound use in practice. |
| 14 | KilledByAPixel/ZzFX | 806 | MIT (copy) | ZzFX | Sound FX | Our SFX library. Its sound designer and its params are the reference. |
| 15 | Tonejs/Tone.js (examples) | 14,788 | MIT (copy) | Tone.js, TS | Music | Our music library. Its examples cover transport, synths and scheduling for game music. |
| 16 | kaplayjs/kaplay `examples/` | 1,816 | MIT (copy) | Kaplay, TS | 135 snippets | Short, kid-readable game snippets. Good prompt-style examples for 2D mechanics. |
| 17 | excaliburjs/sample-jelly-jumper, sample-tactics | 17 / 8 | BSD-2-Clause (copy) | Excalibur, TS | Platformer, tactics | Well-commented, fully typed TS game samples. Good for platformer feel and grid tactics. |
| 18 | BabylonJS/SummerFestival | 137 | None (patterns only) | Babylon.js, TS | 3D tutorial platformer | Shows a full game state machine (start, cutscene, game, lose) in TS 3D. Has a step-by-step tutorial. |
| 19 | gabrielecirulli/2048 | 13,450 | MIT (copy) | Plain JS | Puzzle | A tiny complete game with clean input, grid and animation code. A good "small finished game" exemplar. |

Skipped on purpose. HexGL (1,744, MIT) is a complete three.js racer, but it uses a very old three.js. Hextris has no clear license (NOASSERTION). js13kBreakouts and most js13k entries have no license.

## Sources

- GitHub REST API (`gh api repos/<owner>/<repo>`, search, contents, git trees) for all stars, dates, sizes, licenses and counts. Queried 2026-10-24. [V]
- osgameclones `schema/games.yaml` and `games/*.yaml`: https://github.com/opengaming/osgameclones [V]
- Trilarion OSGL `entries/*.md` and `code/grammar_entries.lark`: https://github.com/Trilarion/opensourcegames [V]
- libregamewiki MediaWiki API: https://libregamewiki.org/api.php [V]
- Wikipedia API, "List of open-source video games": https://en.wikipedia.org/wiki/List_of_open-source_video_games [V]
- Game Off 2026 rules: https://itch.io/jam/game-off-2026 [V]
- js13kGames org: https://github.com/js13kGames, plus repos `games`, `resources` and `js13kBreakouts` [V]
- js13k source-on-GitHub rule. The rules page is a JS app, so it was not read directly: https://js13kgames.com/rules. Covered in https://jscrambler.com/blog/js13kgames-a-javascript-coding-competition and https://github.blog/news-insights/the-library/build-a-game-in-13kb-or-less-with-js13kgames [S]
- js13k 2025 results (197 entries, CLAWSTRIKE first): https://dev.to/js13kgames/js13kgames-2025-winners-announced-20nl [S]
- Ludum Dare source rules: https://ludumdare.com/resources/archive/rules-2017/ (marked outdated) and https://en.wikipedia.org/wiki/Ludum_Dare [S]
- Phaser examples README (Phaser 4, MIT, `examples.json`): https://github.com/phaserjs/examples [V]
- three.js examples (`files.json`, `tags.json`): https://github.com/mrdoob/three.js/tree/dev/examples [V]
- BrowserQuest README license (MPL-2.0 code, CC-BY-SA-3.0 content): https://github.com/mozilla/BrowserQuest [V]
- GDevelop examples README ("MIT licensed, unless specified otherwise"): https://github.com/GDevelopApp/GDevelop-examples [V]
