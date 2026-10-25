# B15: Open-source games as reference material

- **Source requirement:** Kevin, 2026-10-25: a research spike on https://github.com/bobeff/open-source-games. Is anything there of value? Should agents use these as reference builds, and would that make generic games? Which tools, libraries and subcomponents help? How good are these games? What other collections exist?
- **Builds on:** B11 (asset tiers, `gm` CLI), B12 (licensing), B14 (skill sourcing and evals).
- **Detailed reports** (2026-10-24/25), in `B15-open-source-games/`:
  - `catalog-and-quality.md`: every entry, with stats, kind, maturity and sampled reviews.
  - `mining.md`: reusable code, asset sets, design docs and data formats, plus license rules.
  - `other-collections.md`: 22 other collections compared, and a 19-entry web/TS shortlist.
  - `reference-builds-and-homogenization.md`: evidence on anchoring and sameness, options, eval metrics.
- **Evidence labels:** [V] checked in a primary source; [S] secondary. No third-party code was run. Not legal advice.

> **Version scope (2026-10-25):** everything here is V1 engineering, except the multiplayer references (V2) and the deterministic-replay ideas for gameplay rewind (V2). See `../../spec/release-plan.md`.

## 1. Answers

| Question | Answer |
|---|---|
| Is the list worth anything? | Yes, but not as code. 17k stars, CC0, about 166 entries [V]. Mostly real games: 19 shipped with store reviews (Steam scores 76–96% positive) and 58 long-lived community projects [V/S]. It is not slop and mostly not hackathon work. |
| Are they fully featured? | Many are. Mindustry, Wesnoth, Endless Sky, Shattered Pixel Dungeon, Unciv and Cataclysm DDA are complete and much played. Stars mislead, though. OpenAge, Open Diablo II and Citybound never shipped a whole game. |
| Can we reuse their code? | Mostly no. 7 of 145 repos are JS/TS, 65 are GPL or AGPL, and 58 have no license GitHub can read [V]. Over half are remakes, ports or decompilations that need the original game's paid assets. |
| Good reference builds for agents? | **No, not whole games in the agent's context.** Evidence shows examples anchor LLM output and make results more alike (CHI 2024; Doshi & Hauser; "Artificial Hivemind") [V]. Short, relevant retrieval does help correctness (DocPrompting, RepoCoder) [V]. So use small mechanic-level material, not whole games. |
| Would agents make the same generic games? | Yes, that risk is real with whole-game references. Without guidance, models already drift toward a generic default, and a reference gives them a concrete one to copy. Mitigations are in §2. |
| Useful tools, libraries, subcomponents? | The libraries we'd want already exist on npm under permissive licenses: rot.js, recast-navigation-js, inkjs. Athena Crisis (MIT, TS) is the best architecture reference: actions stored as data, deterministic replay, AI and a map editor. Its art and content are not licensed. |
| Better collections? | For our stack, the official **three.js examples** (617, MIT, indexed by `files.json` and `tags.json`) and **Phaser examples** (2,541 for Phaser 4, MIT, indexed by `examples.json`) [V]. osgameclones (YAML, 3,289 entries) and Trilarion (2,034) are the only machine-filterable catalogs [V]. js13k is large and all-web, but most entries have no license, so they are for reading only. |

## 2. Recommendations

1. **No whole games in build context.** Open-source games feed us in three ways only:
   - as source material when we write skills;
   - as genre benchmarks;
   - as eval baselines.

   The build agent never loads one.
2. **Pattern cards.** Each card covers one mechanic and has no theme. It is TypeScript, about 300–800 tokens, with tuning knobs and a "when not to use" note. Examples: jump buffer plus coyote time, deadzone camera, inventory grid, wave spawner.
   - Cards live in each `gm-genre-*`, `gm-input` and `gm-vfx` skill's `references/`.
   - Agents fetch them per request with `gm docs pattern <topic>`. This is an existing command, not a new namespace.
   - We write the cards ourselves, from MIT sources (three.js and Phaser examples, LittleJS, folio-2025, ecctrl) and from GPL games read for ideas only.
3. **Scaffold-only templates.** `gm new` sets up the engine with no theme, characters or HUD content.
   - The 2D base is `phaserjs/template-vite-ts` (MIT, Phaser 4).
   - The 3D base is a small three.js r186 + Rapier Vite scaffold of our own, informed by the three.js Rapier examples.
4. **Anti-sameness rules in `gm-core`:**
   - The WHAT (theme, art, names, mechanics) comes only from the brief.
   - Before coding, the agent lists its defaults and checks them against the brief.
   - No mechanics nobody asked for.
5. **Three takes at scope time.** For a vague brief, `gm-scope-options` offers three clearly different directions.
6. **Homogenization eval.** 10 briefs × 2 configurations per skill change, with cheap metrics: code similarity to references, diversity across games, screenshot embedding distance, and mechanics copied unasked. These plug into the skill-creator benchmark (B14 §5). A skill change ships only if it passes.
7. **Tier 2 candidates** (they need Kevin's tier 2 license allowlist):

   | Set | License |
   |---|---|
   | DCSS tiles, about 4.4k PNG | CC0 |
   | OpenSFX | Per-sound CC0 or CC-BY, listed in a machine-readable file |
   | Lost Garden sprites, via OpenHV | CC-BY 3.0 |
   | Freedoom | BSD-3 |

   All four are reachable by git with no click-through download [V].
8. **License rules to add to the asset policy (B11 §4.4):**
   - Reject non-commercial and no-derivatives licenses outright.
   - Share-alike assets are opt-in, and only for public games.
   - No GPL, AGPL or GFDL material in user games.
   - Only permissive code goes in the engine.
   - Keep trademarked names out.
9. **Schema ideas for game data:**
   - Unciv's "uniques" effect grammar and its 27 JSON Schemas.
   - Cataclysm DDA's JSON content and balance docs.
   - SS14's YAML prototypes, with a license field on each sprite. This matches our per-asset lockfile.

   These are GPL or share-alike, so paraphrase and link; never paste.
10. **Determinism (V2 rewind).** Athena Crisis shows actions stored as data with deterministic replay. That fits `advanceTime` in V1 testing and is the model for V2 rewind.
11. **Genre knowledge (later).** osgameclones' YAML could let scoping answer "make it like Mindustry" with that game's genre features. Optional; not V1.

## 3. Not pursued

- **Ancient Beast** (Phaser 4.2.1, TS): AGPL, a problem for a hosted service. Patterns only.
- **HexGL**: very old three.js.
- **Hextris and most js13k entries**: no license.
- **BrowserQuest and Kaetram-Open** (MPL-2.0): multiplayer architecture reading for V2 only.

## 4. Open items

- No study tests a coding agent given a whole reference game. Run the 10-brief comparison (whole game vs pattern cards) once `gm-verify` exists.
- Check the Lost Garden license page directly; it has been seen only through OpenHV.
- Check each Endless Sky CC0 entry against the actual art.
- Pull the js13k and Game Off winner lists if we want jam-sized eval briefs.
