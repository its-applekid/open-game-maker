# C3: Asset metadata standard (metadata cards and tagging) (2026-10-26)

> **Version scope:** V1 asset pipeline (C2 §10, decision log row "Asset tagging"). This is a research design with draft schemas, not built code. It expands C2 §10 (cards and usage rights), §9 (map inspiration and layout specs), §7 (Drive intake and collections), §2 (style families), §3 (device variants) and §4 (point of view) into one standard.
>
> **Files:** `schemas/asset-card.schema.json` (the card), `schemas/map-layout-spec.schema.json` (inspiration map layouts), `schemas/examples/*.json` (14 example cards plus 1 layout spec; all validate, see §15).

Evidence tags: [M] measured in this repo, [V] verified in source, [I] inferred, [O] opinion.

## Recommendation

1. **One JSON card per logical asset and one per collection**, with the same envelope. Agents search and read cards. They never open model, image or audio files to choose.
2. **A small shared core plus one block per asset type.** The core covers identity, rights, previews, `describe`, provenance and status. The type blocks are `geometry`, `rig`, `anim`, `kit`, `image`, `sprite`, `texture`, `audio`, `font`, `vfx` and `map`. The schema requires the right blocks for each `kind` once a card is measured.
3. **Fixed vocabularies are enums in the schema.** Taggers that need a new tag put it in `proposed_tags`, and curation accepts or rejects it. The one open field is `objects` (nouns): code normalizes it, and it is not an enum.
4. **Three writers, kept apart:**
   - **code** measures facts: geometry, rig, clips, audio stats, image size, hashes, graph metrics;
   - **a vision model** writes judgment fields under `describe`, plus a short allowlist (kit edges, VFX blend);
   - **humans** can edit anything, and their edits are locked.

   Every field has provenance, and every model-written field has a confidence.
5. **Usage rights are on every collection card and may be overridden per asset.** The effective rights are computed from `basis` entries: the confirmed license (or the strict default) intersected with every admin decision. A decision can only narrow. Models never write rights, and code refuses any card where the stored rights don't match the computed ones.
6. **Keep B11's ids and taxonomy.** Ids are `t1:<collection>/<path>@<version>`, with B11's `kind/subkind` and a few additions (§4). Content hashes are sha256 of the originals. The tag cache key is (content hash, schema major, vocab, tagger version), so re-imports cost nothing.
7. **Inspiration maps are ordinary cards** with `kind: inspiration`, rights such as `derive-layout` + `vision-input` only, and a link to a **layout spec**. The spec holds no pixels, and games build from it.
8. **Migrate from today's `pack.json` and `catalog.json` by script.** Each pack becomes a collection card. `synty-personal` becomes the SPDX-style `LicenseRef-synty-personal`, and `category` maps to `counts`.
9. **Search** defaults to rights `in-game`, the game's style family, and status `tagged` or `reviewed`. It has facets on the enum fields, full text, and embeddings over `description` + `objects`.
10. **Before tagging the 277-pack library,** run a sample of about 200 assets to measure accuracy and cost. Tagging the whole library needs a spending OK.

## 1. The card at a glance

```
card
├─ schema, vocab, id, card_type (asset | collection), status, title, kind, subkind, collection
├─ license (SPDX), rights {uses, audience, redistribution, attribution, basis[]}
├─ source {files[{path, sha256, bytes, format, role}], content_hash}
├─ variants[{tier desktop|mobile, key, sha256, bytes, ...}]       (C2 §3)
├─ related[{rel, id}]                                              colour/damaged variants, LODs, sets
├─ previews {thumb, sheet, waveform, clip}                         content-addressed bucket keys
├─ describe {description, objects, environments, settings, roles, moods,
│            materials, condition, style_family, pov_fit, keywords}   judgment fields
├─ look {palette_hex, mean_luminance}                              measured
├─ <type blocks>  geometry | rig | anim | kit | image | sprite | texture | audio | font | vfx | map
├─ collection_info {...}                                           collection cards only
├─ proposed_tags[{field, tag, nearest, reason}]
├─ provenance {"<field path>": {by, tool, model, at, confidence, locked, input}}
└─ flags[], updated
```

**Status lifecycle:**
- `quarantined`: license unknown. Strict rights, invisible to game search.
- `draft`: identified, with filename tags only.
- `measured`: code facts filled in.
- `tagged`: model fields filled in and validated.
- `reviewed`: a human checked it.
- `rejected`: kept only so its hash still blocks the file from game repos.

The schema requires more fields as the status rises (§11).

## 2. Shared core

| Field | Meaning | Written by |
|---|---|---|
| `schema` | `ogm.asset-card/1.0` | code |
| `vocab` | Date of the vocabulary release the tags were checked against | code |
| `id` | B11 id (§7) | code |
| `card_type` | `asset` or `collection` | code |
| `status` | Lifecycle above | code; `reviewed` by a human |
| `title` | Human name, from the file or pack name | code, editable |
| `kind`, `subkind` | Taxonomy (§4) | code from extension and folders; model may correct the subkind (with confidence) |
| `collection` | Owning collection; fields left out inherit from it | code |
| `license` | SPDX expression; `LicenseRef-…` for vendor licenses; `NOASSERTION` when unknown | intake code, confirmed by the admin |
| `rights` | §5 | intake code plus the admin, **never a model** |
| `source` | Original files with sha256, size and role (primary, texture, companion, metadata) | code |
| `variants` | Desktop and mobile files (C2 §3), each with its own hash | importer |
| `related` | `color-variant`, `damaged-variant`, `lod`, `same-set`, `pairs-with`, `requires`, `derived-from`, `replaces` | code from names; model can suggest |
| `previews` | Thumbnail, contact sheet, waveform, audio clip, as bucket keys | renderer |
| `describe` | Judgment fields (§4) | model, or filename at draft; humans may edit |
| `look` | Palette and luminance | code |
| `proposed_tags` | Tags the model wanted but the vocabulary lacks | model |
| `provenance` | Per-field writer, time, confidence, lock | every writer |
| `flags` | `low-confidence`, `conflicts-with-measured`, `needs-review`, `license-unknown`, `image-only`, `near-duplicate`, `oversized-for-mobile`, `missing-preview` | code |

**Why flat values plus a provenance map, rather than wrapping each value as `{value, confidence}`:** flat cards stay small, are easy to facet and filter, and read naturally for agents. Provenance is keyed by field path (`describe.moods`), by block (`rig`), or `*` as the default. A block key covers every field inside it.

## 3. Per-type extensions

| Asset type | kind / subkind | Required blocks once measured | Key fields |
|---|---|---|---|
| Static prop | `model/prop`, `building`, `nature`, `weapon`, `food`, `vehicle` | `geometry` | bounds in metres, footprint in cells, pivot, triangles, materials, shared textures, collision mesh, LODs |
| Modular kit piece | `model/kit` | `geometry`, `kit` | `piece` (wall, wall-corner, floor, gate…), `grid_m`, `height_m`, `open_edges`, `connects_to` |
| Rigged character | `model/character`, `creature` | `geometry`, `rig` | `rig_type`, **`rig_id`**, joint count, `attach_points` (hand-right…), `clips[]` with `canonical` name, duration, loop |
| Animation file | `anim/humanoid`, … | `anim` | `target_rig_id`, `clips[]` |
| 2D sprite / tile | `sprite/*` | `image`, `sprite` | size, alpha, pixel art; `drawn_view`, `tile_px`, sheet grid, `sheet_index`, animations, tile layer, autotile, walkable |
| UI | `ui/icon`, `panel`, `button`, `cursor`, `hud`, `input-prompt` | `image` | `sprite.nine_slice` for panels |
| Font | `ui/font` | `font` | family, style, weight, `glyph_ranges`, monospace, pixel size, formats |
| Texture | `texture/material`, `hdri`, `skybox`, `decal`, `palette` | `image`, `texture` | `maps` (albedo, normal…), `tileable` (code seam test), real size, colour space, pattern |
| VFX | `vfx/particle`, `flipbook`, `trail` | `image`, `vfx` | `blend`, `background`, `tintable`, frames and grid, loop, SDK `emitter_preset` |
| Audio | `audio/sfx/*`, `ambience`, `music/*`, `voice` | `audio` | duration, rate, channels, `loudness_lufs`, LRA, `peak_dbfs`, `spectral_centroid_hz` (brightness), tempo, `loopable`, optional `ucs_cat_id`. **Music (2026-10-27):** `key`, `mode`, `key_strength`, `tempo_alternatives`, `meter`, `energy`, `loop_points`, `cuts[]`, `analysis` (sidecar path). All code-measured; see "Music cards" below |
| Inspiration map | `inspiration/map` | `image`, `map` | `map_type`, publication, detected grid, levels, `site`, **`layout_spec` {id, status, confidence}**; `is_map` + `sheet_kind` (standee, tokens, symbol-sheet, handout, texture, papercraft), `usable` (yes, reference-only, no) + `usable_reason`, `view` (topdown, side, perspective), `scale` (battlemap, building, settlement, region, world), all from folder and file names plus ink coverage (2026-10-29) |
| Collection | (card_type `collection`) | `collection_info` | vendor, version, origin, bundle, requires, `counts`, `family_coverage`, `creation_choice`, `pack_manifest` |

Notes:
- **`rig_id` is a hash of the skin's joint names and their parent links, counting only parents that are themselves joints.** "Shares a rig with" is then an index query, not a stored list that can go stale. I measured this [M]: Kenney Mini Dungeon's orc and human both get `rig:2ca4677e40f4`. A first version of the hash also included the joints' parent node outside the skin (`character-orc` vs `character-human`), and that made two identical rigs look different. C2 §2 wants exactly this rig sharing for cheap variants.
- **`retarget_rig_id` names a library rig whose clips play on a skeleton with its own `rig_id`:** set when no clip library targets the skeleton's rig and every joint it has sits under the same parent in that library's rig. KayKit's medium mannequin lacks the two hand-slot joints of the shared 23-joint rig, so it keeps `rig:a83c5e75e523` and retargets to `rig:89200673d97d`; `--rig-id` and `--same-rig-as` match either id.
- **Canonical clip names** (`idle`, `walk`, `attack-melee`, `die`…) come from a code synonym table. Agents can then ask for "die" whatever the vendor called it.
- **Short SFX have no integrated loudness.** EBU R128 gating needs 0.4 s of audio, so ffmpeg reports −70 LUFS for Kenney's 0.15 s `bookOpen.ogg` [M]. The card stores `loudness_lufs: null` and relies on `peak_dbfs` instead.
- **Synty packs ship a `MaterialList_*.txt`** that names every prefab's meshes, material slots and textures [M]. Intake should parse it (`by: vendor-metadata`). Kenney's `Tilesheet.txt` gives tile size and spacing the same way [M].
- **Engine-only VFX** (Synty Particle FX are Unity prefabs) get cards for their textures only. Emitters are rebuilt as SDK presets and referenced by `emitter_preset`.

### Music cards (added 2026-10-27, Sidetrax library; plan `docs/plans/2026-10-27-001-feat-music-library-preprocessing-plan.md`)

Music uses the same three depths as inspiration maps:

| Depth | Where | What |
|---|---|---|
| 1. Facets | the card | code facts in `audio.*`; model judgments in `describe.*` |
| 2. Detail | the analysis sidecar (`audio.analysis`) | beat and downbeat times, loudness and energy curves at 1 Hz, sections with start, end and energy, the model's raw output |
| 3. Listening | the file | what neither captures: timbre, performance, how it feels in the scene |

Rules:
- **Writers stay split by block.**
  - `audio.*` is code only. The validator refuses a model provenance entry on any `audio.*` field except `ucs_cat_id`.
  - Model judgments go in `describe.*`:
    - `description` is the caption;
    - existing field `moods`;
    - new fields `genre`, `instruments`, `has_vocals`, `era`, `game_fit`.
- **`describe.game_fit`** lists the situations the track suits, at most two and possibly none, each with a 0–1 strength. Situations: combat, boss, chase, stealth, exploration, travel, wandering, puzzle, menu, town, tavern, dungeon, victory, defeat, sad-scene, romance, desolate, tension-build, celebration, rest, montage, credits, horror, ambient-bed.
- **Key→mood is only a weak prior.** Major/minor carries some valence in Western listeners, but the effect is confounded with tempo and loudness and varies by culture (meta-analysis, bioRxiv 10.1101/2023.03.16.532764). No rule writes a mood from the mode. A model may see the key; its provenance `input` records whether it did.
- **Cuts of one piece share a card.** The longest file is `role: primary`. The others are `role: companion` in `source.files`, and are described in `audio.cuts[]` with a role: full, cut-60, cut-30, cut-15, loop, stinger, alt-mix. The name `variants` stays reserved for device tiers (§7).
- **Moods are flagged `mood-unverified`** until a human sample review passes its threshold. A card whose describe step failed gets `describe-failed` and stays at `status: measured`.
- **Vendor tags go in `audio.vendor`** (added 2026-10-28): title, album, catalog number, composer, year and the composer's project tempo, copied by code (`by: vendor-metadata`) from ID3, RIFF INFO and the DAW's `Tempo: N` label. When the composer tempo is within 4% of the measured tempo or one of its half/double readings, it becomes `tempo_bpm` and the provenance says which reading it matched. Pack names never reach the tagger.
- **The tagger is CLAP** (`laion/clap-htsat-unfused`, Apache-2.0, local), chosen 2026-10-27 after a blind four-test comparison with MiDashengLM-7B (Kevin: "clap wins all 4"). It stores one embedding per excerpt in the sidecar; the card step scores label prompts against it. Each label is ranked by its **lift** (its probability on this track ÷ its mean over the library, music and sound effects separately), so labels CLAP favours everywhere don't win by default. `game_fit` keeps a situation only when its lift is high and the measured tempo, energy and key agree (no chase on a slow, quiet track; no stealth on a loud one). Music `settings` are not tagged, because CLAP can't hear a setting. Genre takes the pack name first when the vendor named one. Sound effects take subkind, objects and materials from filename words first and CLAP's 170 sound events second.
- **Analysis weights must allow commercial use.** Excluded by default (non-commercial weights): Essentia's TensorFlow genre/mood/instrument models, MuQ/MuQ-MuLan, MERT, Skey, madmom's models, Music Flamingo, MusicGen, YuE2. Essentia's AGPL DSP code is allowed as a local tool, never linked into game code.

## 4. Vocabularies

All of these are enums under `$defs/vocab` in the schema, and the `vocab` date versions them.

| Vocabulary | Values | Source |
|---|---|---|
| `kind` | model, anim, sprite, texture, vfx, audio, ui, **inspiration** | B11 §4.7 + C2 §9 |
| `subkind` | B11's list, **plus** `texture/skybox`; `audio/sfx/weapon`, `sfx/foley`, `sfx/other`, `music/track`, `voice`; `ui/hud`, `ui/input-prompt`; `inspiration/map` | B11, with additions for packs we already have (Kenney Skyboxes, Voiceover, Input Prompts, Synty HUD) |
| `environments` | dungeon, crypt, cave, mine, sewer, castle, temple, ruins, graveyard, camp, town, village, city, interior, tavern, shop, house, farm, forest, jungle, grassland, mountain, snow, desert, swamp, beach, ocean, underwater, sky, space, space-station, industrial, road, arena, neutral | C2 §10, extended |
| `settings` (theme/era) | fantasy, medieval, sci-fi, modern, post-apocalyptic, prehistoric, western, pirate, horror, steampunk, toy, holiday, sports, abstract, none | Kenney/Synty pack themes |
| `roles` (what it is for) | floor, wall, ceiling, roof, door, gate, stairs, column, terrain, path, water, obstacle, cover, platform, decor, furniture, container, pickup, collectible, key-item, weapon, armor, consumable, trap, hazard, light-source, interactable, spawn-marker, hero, enemy, npc, boss, mount, vehicle, projectile, effect, background, skybox, ui-element, icon, cursor, text, music-bed, ambience-bed, feedback, voice-line, layout-reference | C2 §10 "uses", renamed (§17) |
| `moods` (max 3) | dark, tense, eerie, mysterious, sad, calm, cozy, cheerful, playful, energetic, epic, triumphant, neutral | C2 §10 |
| `materials` | wood, stone, metal, cloth, leather, glass, bone, crystal, plant, earth, water, ice, fire, flesh, plastic, paper, fur | Poly Haven's `attributes.material` idea |
| `condition` | new, worn, damaged, broken, ruined, overgrown | Poly Haven's `attributes.condition`; drives "damaged variant" search |
| `style_family` | chunky-low-poly, detailed-low-poly, simple-low-poly, pixel-art, flat-cartoon, isometric-2d, sketch, **photoreal**, **any** | C2 §2's seven, plus photoreal (ambientCG and Poly Haven materials; not a creation choice) and any (style-neutral audio, fonts, masks) |
| `pov_fit` | iso, topdown, side, follow, fps, orbit, fixed | C2 §4 SDK rig ids |
| `sprite.drawn_view` | topdown, side, iso, front, three-quarter, none | the view the 2D art was drawn for |
| `genre` (music, max 3) | orchestral, cinematic, classical, piano, rock, metal, pop, electronic, ambient, acoustic, folk, country, blues, jazz, funk, hip-hop, world, latin, chiptune, experimental | Sidetrax pack themes, 2026-10-27 |
| `instruments` (music, max 10) | piano, keys, organ, strings, solo-violin, cello, brass, trumpet, horns, woodwinds, flute, sax, choir, lead-vocals, acoustic-guitar, electric-guitar, bass, synth-bass, drums, drum-machine, percussion, taiko, orchestral-percussion, synth-lead, synth-pad, arpeggiator, harp, bells, mallets, accordion, fiddle, banjo, ukulele, sound-design | 2026-10-27 |
| `era` (music) | timeless, ancient, medieval, renaissance, baroque, 19th-century, 1920s-40s, 1950s … 2000s, contemporary, futuristic | 2026-10-27 |
| `game_fit` keys | combat, boss, chase, stealth, exploration, travel, wandering, puzzle, menu, town, tavern, dungeon, victory, defeat, sad-scene, romance, desolate, tension-build, celebration, rest, montage, credits, horror, ambient-bed | 2026-10-29 |
| Type-local enums | kit pieces, edges, clip names, texture maps, glyph ranges, map types, relations, flags | schema |

**Objects (open vocabulary).** What an asset depicts has no fixed list: barrel, sarcophagus, knight, spear. The rules:
- `objects` holds lowercase singular English nouns, kebab-case, at most 12.
- Code normalizes them with a lemmatizer and a curated `objects-synonyms.json` (`skeleton warrior` → `skeleton`, `torches` → `torch`).
- Nouns that reach 20 or more assets become a facet automatically. The rest stay searchable as text and by embedding.
- WordNet synset ids were considered and left out for V1: more precision than agents need, for real extra work [O].

**Proposing a new tag:**
1. The tagger never invents enum values. If nothing fits, it uses the nearest tag and adds `proposed_tags: [{field, tag, nearest, reason}]`.
2. `gm assets facets --proposed` counts proposals. Curation (`gm-pack-curate`, or Kevin) accepts or rejects them.
3. Accepting a tag:
   - adds it to the enum;
   - bumps the schema minor version and `vocab`;
   - runs a migration that swaps `nearest` → `tag` on the cards that proposed it, without a model call.
4. Rejected proposals go on a deny list, so the tagger stops proposing them.

## 5. Usage rights

C2 §10's fields, made precise:

| Field | Values |
|---|---|
| `uses` | `in-game`, `placeholder`, `derive-layout`, `style-reference`, `vision-input` |
| `audience` | `private` < `public` |
| `redistribution` | `none` < `in-build` < `free` |
| `attribution` | credit text or `null` |
| `basis[]` | where each rule came from (below) |

**Basis entries** (`type`):
- **`license`**: what the license allows, the ceiling. Intake code proposes it from the license file or vendor marker (Kenney → CC0, Synty → `LicenseRef-synty-personal`). It counts only once `confirmed_by` names the admin who confirmed it.
- **`decision`**: an admin restriction. It must be `set_by.role: admin`. Example: Kevin, 2026-10-26: ProFantasy maps are inspiration only.
- **`default`**: the strict default (`[vision-input]`, `private`, `none`). It applies only while no license entry is confirmed. Quarantined cards must carry exactly these values; the schema checks that.

**Effective rights** = the ceiling (the confirmed license, or else the default) ∩ every decision:
- `uses` is the intersection of the sets;
- `audience` and `redistribution` take the lower value;
- `attribution` takes every credit line that applies.

So a decision cannot widen anything, by construction. Code recomputes the effective rights on every write and refuses any card whose stored `rights` differ. The schema also forbids `set_by.role: model`.

**Per-asset overrides:**
- An asset card may carry its own `rights`. Its basis is the asset's own license entry if it has one (mixed-license sets such as LPC, from `CREDITS.csv`), otherwise the collection's license entry, intersected with every decision at both levels.
- A collection with mixed licenses carries the most restrictive license as its own, and each asset carries its exact license.

**Enforcement (code, not agent judgment), from C2 §10:**
- `gm assets search` filters by intended use, `in-game` by default; `gm-map-inspiration` asks for `derive-layout`.
- The build and lockfile check rejects any asset without `in-game` (or `placeholder` in a draft). Publish also rejects `placeholder`, and rejects `private` assets when the game's audience is public.
- The repo commit check rejects files whose sha256 belongs to a `redistribution: none` asset, **including its previews and generated variants**. Their hashes are on the card too.
- Credits are generated from `attribution`.
- Refusals name the asset and the rule, so the voice agent can explain them.
- **`vision-input` gates sending a file to a vision model.** The tagging step checks it before any call. A quarantined drop can still be tagged, because `vision-input` is in the strict default. Whether that is acceptable for files of unknown origin is an open question (§18).

Examples:

| Collection | Ceiling (license) | Decisions | Effective |
|---|---|---|---|
| Kenney (any) | CC0-1.0: all five uses, public, free | none | all five, public, free, no credit |
| Synty POLYGON | LicenseRef-synty-personal: all five, private, in-build | none | all five, private, in-build |
| ProFantasy Cartographer's Annual | LicenseRef-profantasy-eula: derive-layout, style-reference, vision-input, private, none [I: to confirm from the bundle's terms] | Kevin 2026-10-26: derive-layout, vision-input | derive-layout + vision-input, private, none |
| Drive drop, no license | (none confirmed) → default | none | vision-input, private, none; quarantined |
| Sidetrax (Humble Complete Works), draft | LicenseRef-sidetrax-royalty-free: in-game, private, in-build (unconfirmed until sign-off) → default applies; plus Kevin's interpretation: vision-input | none | vision-input, private, none. After Kevin confirms the license: in-game + vision-input, private, in-build |

**Interpretations (added 2026-10-27).** Some licenses are silent on a use: Sidetrax's says nothing on editing, derivatives or AI. An `interpretation` basis entry records the admin's reading of that silence. It is separate from the license entry, so audits can tell what was granted from what was inferred.
- It is set by an admin and needs a `note` giving the reason.
- It adds uses to the ceiling only. Its audience and redistribution are ignored.
- It can never add a use listed in a license entry's `forbids`, whether or not that entry is confirmed.
- It is replaced when the licensor answers.
- Decisions still narrow afterwards.

**New uses (2026-10-27):**
- `vision-input` now covers any model analysis, vision or audio. A rename to `model-input` is proposed (§18), not done.
- `edit-audio`: cut, loop, fade, stretch or transpose whole tracks for a game.
- `derive-audio`: stems, motifs, MIDI, re-arranging, or AI conditioning on the audio.
- Neither audio use is granted for Sidetrax yet.

## 6. Who writes what, confidence and provenance

| Field group | Code measures | Vision model writes | Human sets |
|---|---|---|---|
| id, source hashes, variants, previews | ✓ | | |
| kind / subkind | ✓ from extension and folders | corrects the subkind (with confidence) | can override |
| license, rights | proposes from the license text | **never** | confirms the license; adds decisions |
| geometry, rig, clips, anim | ✓ (glTF JSON after B11 normalization) | | can fix |
| kit piece, edges, connects_to | piece from the filename; footprint from bounds | edges and connects_to, from the sheet | can fix |
| image, font, audio stats | ✓ (PNG header, fc-scan/fontTools, ffmpeg ebur128 and aspectralstats) | | |
| look (palette, luminance) | ✓ (k-means on the preview) | | |
| description, objects, environments, settings, roles, moods, materials, condition | filename seeds at draft | ✓ from the contact sheet + measured facts + collection context | ✓, locked |
| style_family, pov_fit | inherited from the collection | per asset, only when it differs | ✓ (curation owns the collection value) |
| map grid, layout spec | validation, normalization and graph metrics | rooms, connections, features, judged tags | can correct (`edited_by_human`) |
| status `reviewed`, `creation_choice`, `family_coverage` | | | ✓ |

**Provenance entry:** `{by, tool, model, at, confidence, locked, input}`.
- `by` is one of `code`, `model`, `human`, `filename`, `vendor-metadata`, `collection`, `license` or `default`.
- The schema requires `confidence` and `model` when `by: model`, and `locked: true` when `by: human`.
- `input` says what the writer looked at, for example "sheet + measured facts", or "title words + features; mood not heard".

**What the confidence means:**
- The model self-reports a confidence per field group.
- Code lowers it when the model disagrees with measured facts. Example: "tall door" while the bounds say 0.4 m sets `conflicts-with-measured`.
- Below 0.6, the card gets `low-confidence`. Search still returns it but ranks it lower.
- The calibration sample (§13 step 9) checks whether the self-reported numbers mean anything. If they don't, use agreement between two cheap passes instead.

**Locks:** a pipeline run skips any field whose provenance has `locked: true`, and a schema-version re-tag never overwrites a human edit (C2 §10).

**Audio mood is the weakest field [I].** A vision model looking at a waveform or spectrum strip plus the title is guessing; the Infinite Descent example is honest about it at 0.45. Options: an audio-capable model, or measured proxies (tempo, centroid, minor-key detection) plus the title. Audio moods should be marked for human review until one of those is tested.

## 7. IDs, content hashes, variants and previews

- **Asset id:** `t<tier>:<collection>/<path>@<version>` (B11). The path is lowercase kebab with no extension and no vendor format folder (`Models/GLB format/character-orc.glb` → `character-orc`). Synty keeps its folder: `t1:synty-polygon-goblin-war-camp/buildings/sm-bld-prop-torch-01@v3`.
- **Collection id:** `t<tier>:<collection>@<version>`.
- **Layout spec id:** `layout:<collection>/<path>@<version>#<extraction rev>`.
- **A new vendor version is a new id.** Code links old and new by path, with `related: replaces`, so lockfiles can offer the upgrade.
- **Hashes:**
  - `source.files[].sha256` covers the originals;
  - `source.content_hash` is the primary original;
  - `variants[].sha256` covers each desktop and mobile file.
- **Tag cache key:** (content_hash, schema major, vocab, tagger version). A re-import of unchanged files reuses the cached tags for free (C2 §10). A vocab change re-runs only cards whose tags touched the changed enums.
- **Near-duplicates:** Kenney ships the same model in several folders and packs, and the "Archive" copies overlap. Identical hashes collapse to one card plus `related: same-set` links. Near-identical previews (perceptual hash) get `near-duplicate`.
- **Hash manifests:** a collection can hold many files that never get cards, such as ProFantasy's symbol bitmaps (§16). `collection_info.hash_manifest` lists the sha256 of every file in the collection, so the commit check covers files that have no card.
- **Previews are content-addressed bucket keys, never signed URLs or credentials.** They inherit the asset's rights. The thumbnail of a `redistribution: none` map lives under a private prefix, and its hash is blocked from game repos like the image itself.

## 8. Collections and inheritance

- **Every asset card names its `collection`.** A loose Drive drop of three models is a collection too (C2 §7).
- **Inheritable fields:** `license`, `rights`, `describe.style_family`, `describe.pov_fit`, `describe.settings`, and `describe.environments` when the asset has none. The asset value wins when present. For `rights`, "wins" still means the intersection rule in §5, so an asset can never widen beyond its basis.
- **Stored cards are sparse; the index stores resolved cards.** Code resolves inheritance when it builds the search index and marks inherited values `by: collection`. Agents always see resolved cards.
- **Collection-only fields:** `collection_info.counts` (by kind or kind/subkind), `family_coverage` (characters, environment, props, UI, SFX, music: C2 §2's completeness check), `creation_choice` (curation-approved only), `requires`, `bundle`, and `pack_manifest` (back-pointer to today's `pack.json`).
- **The collection sheet** (a grid of its items) is the one preview a curator looks at to set the family and point of view for hundreds of items at once.

## 9. Versioning and migration

- **`schema`** is `ogm.asset-card/<major>.<minor>`:
  - minor: new optional fields or new enum values, so old cards stay valid;
  - major: renames, removals or meaning changes, which come with a migration script `migrate_<from>_<to>`.
- **`vocab`** is the date stamp of the enum release. Bumping it re-validates every card. Unknown values can only appear after a removal, and those cards get `needs-review`.
- **Re-tag policy:** a major schema or tagger-prompt change re-runs model fields for cards whose cache key no longer matches. Locked fields are skipped, and cost is estimated and approved before a library-wide run.
- **Migration from today's library** (a one-off `build_cards.py` next to `build_catalog.py`):

  | Today | Card |
  |---|---|
  | `pack.json` `id`, `vendor`, `title`, `current` | collection card `id` `t1:<id>@<current>`, `collection_info.vendor`, `title`, `version` |
  | `license: "CC0-1.0"` | `license` plus a confirmed `license` basis entry. Kenney's `License.txt` is the `ref` |
  | `license: "synty-personal"` | `license: "LicenseRef-synty-personal"` (SPDX custom-id form). Keep a read alias for the old value |
  | `category` (`2d`, `3d`, `audio`, `other`, missing for Synty) | dropped; replaced by `counts` from the item cards |
  | `versions.<v>.format`, `bundle`, `bundle_path`, `file_types` | `collection_info.origin`, `bundle`; file types become per-asset `source.files[].format` |
  | `requires` | `collection_info.requires`, as collection ids |
  | `catalog.json` | becomes the index built from cards; kept as a pack list for scripts until `gm assets` exists |

## 10. Search and facets

- **Default filters:**
  - `rights.uses ∋ in-game` (or the use the caller asks for);
  - `describe.style_family ∈ {game family, any}`;
  - `describe.pov_fit ∋ game view`, or empty (unknown);
  - `status ∈ {tagged, reviewed}`.

  `--include-draft` widens the status filter. Leaving the style family is an explicit, logged exception (C2 §2).
- **Facets** (`gm assets facets`):
  - kind and subkind, collection, environments, settings, roles, moods, materials, condition, style family, pov fit;
  - objects that pass the threshold;
  - rights uses;
  - numeric buckets: triangles, height in metres, duration, loudness, tempo;
  - booleans: animated, `rig_type`, `loopable`, `tileable`, `pixel_art`.
- **Rig queries:** `--rig-id rig:2ca4677e40f4`, or `--same-rig-as <id>`.
- **Full text** over title, description, objects, keywords and filenames.
- **Semantic search:** embeddings over `description + objects + environments + roles`. Example query: "something to block a corridor that fits a crypt".
  - A small local embedding model avoids spend [I]. Which model to use is open (§18).
  - Ranking = text and vector score, × confidence, × a small boost for `reviewed`.
- **Output:** one line per card by default (B11 §4.7). `--json` returns resolved cards. `gm assets sheet` makes one contact-sheet image of the hits.
- **Inspiration search** goes through layout specs: `gm maps search "small crypt 3-5 rooms one loop secret door"`. It turns into filters on `tags.computed` plus the judged tags, and it requires `derive-layout`.

## 11. Checks code runs

**The schema enforces:**
- types, enums and id patterns;
- subkind valid for its kind;
- per-kind blocks required at `measured` and above;
- `describe.description`, `objects` and `roles` required at `tagged` and above;
- quarantined cards carry exactly the strict default;
- no `model` role in rights;
- human provenance locked;
- model provenance has a confidence;
- an image-only layout spec has no rooms.

**Code enforces** (prototyped in the validator, §15):
1. Stored `rights` equal the effective rights computed from `basis` (§5).
2. No provenance entry for `rights*` has `by: model`.
3. Model provenance appears only on `describe.*` and the allowlist: `kit.open_edges`, `kit.connects_to`, `vfx.blend`, `audio.ucs_cat_id`, `map.map_type` (an image model may judge it when titles and folders do not say; added 2026-10-28), plus the subkind correction.
4. Inspiration cards never resolve to `in-game` or `placeholder`.
5. A layout spec's source card resolves to rights including `derive-layout`, and links back to the spec.
6. The spec's `tags.computed` match the graph: room and connection counts, loops = edges − nodes + components (with `outside` as a node), dead ends, secrets, polygon areas.
7. Model claims agree with measured facts (size words against bounds, "loop" against `loopable`). A disagreement sets `conflicts-with-measured`.
8. Every `objects` entry is normalized through the synonym map.

## 12. Map layout spec

`schemas/map-layout-spec.schema.json`, aligned with C2 §9:

| Part | Content | Writer |
|---|---|---|
| `source` | card id, content hash, `required_use: derive-layout` | code |
| `extraction` | status (`extracted`, `low-confidence`, `image-only`), model and tool, time, overall confidence, named code checks (polygons valid, rooms on grid, no overlap, connections touch rooms, graph connected, entrance exists, features inside rooms, grid matches image), `edited_by_human` | model + code |
| `grid` | square, hex or none; cols and rows; cell px; `cell_real` (5 ft…); confidence | model, checked by code against the image |
| `level` | index (0 = ground, negative = below), name, `site` (groups floors of one castle across images) | model |
| `rooms[]` | id, polygon in grid cells (origin top-left, half cells allowed), shape, `size_class` and `area_cells` (code), `function` (entrance, great-hall, crypt…), outdoor, confidence | model; size by code |
| `connections[]` | door, double-door, locked-door, secret-door, portcullis, archway, opening, stairs-up and -down, ladder, trapdoor, pit-drop, bridge, window; from/to = room id, `outside`, or `{spec, room}` on another floor; position; one-way; confidence | model |
| `features[]` | pillar, water, pit, altar, statue, throne, tomb, trap, treasure… plus `spawn-hint` and `exit-hint`; room; point or polygon; count | model |
| `tags.computed` | room, connection, loop, entrance, dead-end, secret and level-change counts, longest path, total area, size class | **code only** |
| `tags.judged` | map type, themes (environment vocab), flow (linear, branching, hub-and-spoke, loop, maze, open), difficulty flow, suits (genres), confidence | model |
| `notes` | our own words about the structure; **never text copied from the map or its publisher** | model |

**Size classes:**
- Rooms by `area_cells`: tiny < 20, small < 40, medium < 100, large < 300, huge ≥ 300.
- Specs by room count: small ≤ 5, medium 6–15, large 16–40, huge > 40.

These are [O] starting points, to tune on the ProFantasy set.

**What the spec is, legally (not legal advice):** structure only, with no pixels, symbols or copied text. C2 §9 allows games to use adapted layouts from it. `gm-map-inspiration` still varies a layout that comes out as a recognizable copy of one specific map.

## 13. How to tag a new batch (agent procedure)

For `gm-asset-intake` after a settled Drive drop or a `gm packs import`:

1. **Quarantine:** unpack into a fresh directory with zip-slip and size checks, and run nothing from it (C2 §7). Write a collection card with `status: quarantined`, `license: NOASSERTION` and the default basis.
2. **License:** read the license files and vendor markers.
   - Known vendor (Kenney → CC0; Synty → `LicenseRef-synty-personal`): propose a `license` basis entry.
   - Unknown: stop here, keep the drop quarantined, and send Kevin a one-line question.
   - Never guess a license, and never write a `decision`.
3. **Wait for confirmation:** the admin confirms the license (`confirmed_by`) and adds any decisions (for example "inspiration only"). Code computes the effective rights. Only then does the status move off `quarantined`.
4. **Identify items:**
   - one card per logical asset: one file, or a model with its textures;
   - drop engine-only files (`.meta`, Unreal projects);
   - extract installers (`.exe`, `.msi`) with 7z or msitools, never run them;
   - write the collection's `hash_manifest` over every file;
   - leave pure symbol or fill art in inspiration collections uncarded (hash only);
   - set `kind/subkind` from extension and folders;
   - parse vendor metadata (Synty `MaterialList`, Kenney `Tilesheet.txt`, LPC `CREDITS.csv`);
   - seed `describe` from filenames with `by: filename`. Status becomes `draft`.
5. **Normalize and measure** (B11 pipeline + C2 §3 variants):
   - fill the type blocks, `look` and variant hashes;
   - compute `rig_id` and canonical clip names;
   - run the tileable and loopable tests.

   Status becomes `measured`. The schema now requires the type blocks.
6. **Render previews:** a multi-angle sheet per 3D asset, a sheet per collection, a waveform plus spectrum strip and a 3 s clip for audio, a specimen for fonts. Inspiration maps get a downscaled thumbnail under the private prefix.
7. **Tag with the model**, only if the effective rights include `vision-input`:
   - batch 20–50 items per call: the sheets + the measured facts + the collection card + the vocabulary;
   - ask for `describe` fields with a confidence per group, and `proposed_tags` for anything off-list;
   - for inspiration maps, also ask for the layout spec.
8. **Validate with code:** run the schema and the §11 checks; normalize objects; recompute layout metrics; flag conflicts and low confidence. Failures go back for one retry with the error list. If they fail again they keep `needs-review`, and a layout becomes `image-only`. Passing cards become `tagged`.
9. **Calibrate** (first batches and new vendors only): a human reviews about 30 random cards per collection. Track field accuracy against confidence, and fix the prompt or the vocabulary before tagging at scale.
10. **Collection pass:** fill `counts`; suggest `style_family`, `pov_fit` and `family_coverage` for curation; never set `creation_choice` (a curation decision, C2 §7).
11. **Index and report:** rebuild the facets, text index and embeddings. Send Kevin one line per drop: what arrived, its license and rights, how many items, how many tagged, how many low-confidence, how many proposed tags, and anything still quarantined.

**Cost guard:** step 7 is the only step that spends money. Estimate it from item count × batch price before running, record it in C2 §1's analytics, and ask for approval above the per-run cap. Library-wide tagging needs Kevin's spending OK (C2 §10).

## 14. Prior art: what we adopt and what we skip

| Source | What it offers | Adopt? |
|---|---|---|
| **B11 (ours)** | `kind/subkind`, ids, `gm assets` commands, normalization rules | **Yes**, as the base; additions listed in §4 |
| **SPDX license list and `LicenseRef-`** | Standard license ids; custom ids for vendor licenses | **Yes** for `license`. `LicenseRef-synty-personal` replaces `synty-personal` |
| **Poly Haven API** ([public API](https://github.com/Poly-Haven/Public-API)) | Per asset: `categories`, `tags`, `authors`, `polycount`, `dimensions`, `files_hash`, `collections`, `attributes {condition, material}`, a category path, `description` [V: fetched `info/rock_moss_set_01`] | **Yes**, the `materials` + `condition` facets and a files hash. Its API needs a "Powered by Poly Haven" credit for live use [V] (B11 §6 already flags its terms) |
| **ambientCG API v2** | `assetId`, `dataType` (Material, HDRI, 3DModel…), `creationMethod`, `tags`, dimensions [V: fetched `Bricks076C`] | **Yes**, `texture.real_size_m` and `dataType`→subkind mapping for tier 2 adapters |
| **glTF `extras` / `KHR_xmp_json_ld`** | XMP packets (Dublin Core `dc:`, `xmpRights:`) embedded on asset, node, mesh, material, image or animation [V] | **Later, export only.** Cards stay outside the files (one store for every type). When a game ships a GLB we may stamp `dc:rights`/`dc:creator` via KHR_xmp_json_ld from the card |
| **Dublin Core / schema.org CreativeWork** | title, creator, rights, license, `usageInfo`, `acquireLicensePage`, `keywords` | **Naming only**: our `title`, `license`, `attribution` map onto `dc:title`, `dc:rights`, `schema:license`, `schema:creditText` if we ever publish metadata. Not worth adopting as the storage format |
| **Universal Category System (UCS)** for SFX | 82 categories, 753 subcategories (v8.2), `CatID` codes such as `WATRBubl`, filename pattern `CatID_FXName_Creator_Source` | **Optional field** `audio.ucs_cat_id`, model-proposed. Our subkinds stay coarse for agents; UCS gives pro-grade precision when present. The official list is a spreadsheet at universalcategorysystem.com |
| **Freesound** | Per-sound tags plus audio analysis descriptors (loudness, tempo, key) | **Yes in spirit**: measure, don't ask the model, for anything numeric |
| **Unity asset labels / Unreal asset registry tags** | Free-form labels; key-value metadata searchable in the editor | **No.** Free-form labels drift; this is why our vocabularies are enums with a proposal path |
| **Kenney / itch / OpenGameArt** | Pack-level tags and a license per pack; OGA has art-type + multi-license per item | **Pack level only**, as collection seeds. OGA's per-item multi-license is why asset cards may carry their own license basis |
| **WordNet / AudioSet ontology** | Rich noun and sound hierarchies | **Not V1.** More precision than agents need (§4) |

## 15. Worked examples and validation

**Validation run, 2026-10-26 [M]:**
- Ajv 8 with draft 2020-12, `strict` on except `strictTypes`, with formats; the script lives in the session scratchpad, outside the repo.
- Both schemas compile.
- All 15 files in `schemas/examples/` validate: 14 cards and 1 layout spec. The JSON blocks below were extracted from this document and validated as well.
- The §11 code checks pass for every example: rights recomputed from basis, no model-written rights, the model-writes allowlist, the map rights, the spec linking back to its card, and the graph metrics recomputed.
- **13 negative cases were all rejected:**
  - 10 by the schema: quarantined with in-game, tagged without a description, bad subkind, unknown environment, unlocked human edit, measured without geometry, rights set by a model, a decision set by intake code, image-only with rooms, a bad id;
  - 3 by the code checks: a decision that widens, a model writing rights, a wrong loop count.

**Which values are real:**
- Kenney and Synty files: hashes, sizes, triangles, bounds, clips, joints, audio stats, font glyph ranges and image sizes are [M], read from the files in `assets-local/`.
- Descriptions are written from looking at the previews.
- Mood, confidences and preview keys are [I] illustrations of what the pipeline would write. The Mini Dungeon `counts` split was classified by hand from the 30 preview names.
- **ProFantasy is entirely illustrative** (ids, file name, sizes, the all-zero hash, the layout), because the bundle is not imported yet. The rights reflect Kevin's 2026-10-26 decision. The license ceiling is [I] until intake reads the bundle's terms.

| Example | Type shown |
|---|---|
| `collection-kenney-mini-dungeon` | collection card, CC0, family coverage, human-locked pov_fit |
| `model-kit-kenney-mini-dungeon-wall` | modular kit piece |
| `model-character-kenney-mini-dungeon-orc` | rigged character with 32 clips, rig_id, attach points |
| `model-prop-synty-goblin-war-camp-torch` | static prop at `draft` (FBX not converted yet), filename tags, inherits Synty rights |
| `collection-synty-polygon-goblin-war-camp` | personal-license collection |
| `sprite-kenney-tiny-dungeon-knight` | 2D pixel sprite in a tilesheet |
| `texture-kenney-prototype-dark-grid` | texture |
| `audio-music-kenney-infinite-descent` | music loop, low-confidence mood |
| `audio-sfx-kenney-rpg-book-open` | short SFX (no LUFS), UCS id |
| `font-kenney-future` | font |
| `vfx-kenney-particle-flame` | particle texture |
| `collection-profantasy-cartographers-annual` | inspiration collection: license ceiling + Kevin's narrowing decision, hash manifest |
| `map-profantasy-example-dungeon` | inspiration map card linking its layout spec |
| `layout-profantasy-example-dungeon` | the layout spec |
| `collection-drive-drop-quarantined` | strict default for an unknown license |

<details><summary><code>collection-kenney-mini-dungeon</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-mini-dungeon@2.0",
  "card_type": "collection",
  "status": "tagged",
  "title": "Mini Dungeon (Kenney)",
  "license": "CC0-1.0",
  "rights": {
    "uses": [
      "in-game",
      "placeholder",
      "derive-layout",
      "style-reference",
      "vision-input"
    ],
    "audience": "public",
    "redistribution": "free",
    "attribution": null,
    "basis": [
      {
        "type": "license",
        "license": "CC0-1.0",
        "ref": "License.txt",
        "uses": [
          "in-game",
          "placeholder",
          "derive-layout",
          "style-reference",
          "vision-input"
        ],
        "audience": "public",
        "redistribution": "free",
        "attribution": null,
        "set_by": {
          "role": "intake-code"
        },
        "confirmed_by": "kevin",
        "date": "2026-10-26",
        "note": "Kenney CC0; credit optional."
      }
    ]
  },
  "previews": {
    "thumb": "packs/kenney-mini-dungeon/icon.png",
    "sheet": "previews/collections/kenney-mini-dungeon-2.0-sheet.webp"
  },
  "describe": {
    "description": "Chunky low-poly dungeon kit: one-unit floor and wall tiles, gate and stairs, a human and an orc on a shared rig, weapons, shields and small props.",
    "objects": [
      "wall",
      "floor",
      "gate",
      "stairs",
      "barrel",
      "chest",
      "character",
      "sword",
      "shield",
      "key",
      "potion",
      "trap"
    ],
    "environments": [
      "dungeon"
    ],
    "settings": [
      "fantasy",
      "medieval"
    ],
    "roles": [
      "floor",
      "wall",
      "gate",
      "stairs",
      "decor",
      "container",
      "pickup",
      "trap",
      "hero",
      "enemy",
      "weapon"
    ],
    "style_family": "chunky-low-poly",
    "pov_fit": [
      "iso",
      "topdown",
      "follow",
      "orbit"
    ]
  },
  "collection_info": {
    "vendor": "kenney",
    "version": "2.0",
    "origin": "bundle",
    "bundle": "kenney-all-in-1@3.7.0",
    "counts": {
      "model": 30,
      "model/kit": 12,
      "model/character": 2,
      "model/prop": 16
    },
    "family_coverage": {
      "characters": true,
      "environment": true,
      "props": true,
      "ui": false,
      "sfx": false,
      "music": false
    },
    "creation_choice": false,
    "pack_manifest": "assets-local/packs/kenney-mini-dungeon/pack.json"
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "rights": {
      "by": "license",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.85,
      "input": "collection sheet + item cards"
    },
    "describe.pov_fit": {
      "by": "human",
      "at": "2026-10-26T20:00:00-07:00",
      "locked": true,
      "input": "C2 §4: short walls, no ceilings, so no fps"
    },
    "collection_info.counts": {
      "by": "code",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "split classified by hand from the 30 preview names for this example"
    }
  }
}
```

</details>

<details><summary><code>model-kit-kenney-mini-dungeon-wall</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-mini-dungeon/wall@2.0",
  "card_type": "asset",
  "status": "tagged",
  "title": "Wall",
  "kind": "model",
  "subkind": "kit",
  "collection": "t1:kenney-mini-dungeon@2.0",
  "source": {
    "files": [
      {
        "path": "Models/GLB format/wall.glb",
        "sha256": "sha256:ed9fc37375fc85fa21dba37c688a140114ec3cb93ed4071c2abd145d375652e1",
        "bytes": 18148,
        "format": "glb",
        "role": "primary"
      },
      {
        "path": "Models/GLB format/Textures/colormap.png",
        "sha256": "sha256:bc492d755caf9e64924447f065681be0d5438a33cd0acddc72f3d00fd75893be",
        "bytes": 10838,
        "format": "png",
        "role": "texture"
      }
    ],
    "content_hash": "sha256:ed9fc37375fc85fa21dba37c688a140114ec3cb93ed4071c2abd145d375652e1"
  },
  "related": [
    {
      "rel": "same-set",
      "id": "t1:kenney-mini-dungeon/wall-half@2.0"
    },
    {
      "rel": "same-set",
      "id": "t1:kenney-mini-dungeon/wall-opening@2.0"
    }
  ],
  "previews": {
    "thumb": "previews/ed/ed9fc37375fc85fa-thumb.webp",
    "sheet": "previews/ed/ed9fc37375fc85fa-sheet.webp"
  },
  "describe": {
    "description": "Pale lavender-grey stone wall block, one tile square, with a raised rim on top; builds dungeon room and corridor walls.",
    "objects": [
      "wall",
      "stone-block"
    ],
    "environments": [
      "dungeon",
      "castle",
      "crypt"
    ],
    "roles": [
      "wall"
    ],
    "materials": [
      "stone"
    ],
    "condition": "new",
    "moods": [
      "neutral"
    ]
  },
  "geometry": {
    "bounds_m": {
      "min": [
        -0.5,
        0.0,
        -0.5
      ],
      "max": [
        0.5,
        1.1,
        0.5
      ]
    },
    "footprint_cells": {
      "w": 1,
      "d": 1,
      "cell_m": 1.0
    },
    "pivot": "base-center",
    "triangles": 186,
    "materials": [
      "colormap"
    ],
    "texture_keys": [
      "Models/GLB format/Textures/colormap.png"
    ],
    "normalized": true
  },
  "kit": {
    "piece": "wall",
    "grid_m": 1.0,
    "height_m": 1.1,
    "open_edges": [
      "e",
      "w"
    ],
    "connects_to": [
      "wall",
      "wall-half",
      "wall-narrow",
      "wall-opening",
      "column",
      "gate"
    ]
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.9,
      "input": "sheet + measured facts"
    },
    "kit.piece": {
      "by": "filename",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "kit.open_edges": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.6,
      "input": "sheet; to confirm with a snap test"
    },
    "kit.connects_to": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.7,
      "input": "sibling filenames + bounds"
    }
  }
}
```

</details>

<details><summary><code>model-character-kenney-mini-dungeon-orc</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-mini-dungeon/character-orc@2.0",
  "card_type": "asset",
  "status": "reviewed",
  "title": "Orc",
  "kind": "model",
  "subkind": "character",
  "collection": "t1:kenney-mini-dungeon@2.0",
  "source": {
    "files": [
      {
        "path": "Models/GLB format/character-orc.glb",
        "sha256": "sha256:e0b021c98b34a633567ca79f7c129cca48fd7919aa9e959464deba226767c284",
        "bytes": 199616,
        "format": "glb",
        "role": "primary"
      }
    ],
    "content_hash": "sha256:e0b021c98b34a633567ca79f7c129cca48fd7919aa9e959464deba226767c284"
  },
  "related": [
    {
      "rel": "same-set",
      "id": "t1:kenney-mini-dungeon/character-human@2.0"
    }
  ],
  "previews": {
    "thumb": "previews/e0/e0b021c98b34a633-thumb.webp",
    "sheet": "previews/e0/e0b021c98b34a633-sheet.webp"
  },
  "describe": {
    "description": "Small blocky green orc with a black topknot and orange clothes, chunky toy style, 0.78 m tall; full action set including melee attacks, kicks and a death clip.",
    "objects": [
      "orc",
      "character"
    ],
    "environments": [
      "dungeon",
      "cave",
      "camp"
    ],
    "settings": [
      "fantasy"
    ],
    "roles": [
      "enemy",
      "npc"
    ],
    "moods": [
      "playful"
    ]
  },
  "geometry": {
    "bounds_m": {
      "min": [
        -0.39,
        0.0,
        -0.158
      ],
      "max": [
        0.39,
        0.78,
        0.175
      ]
    },
    "pivot": "base-center",
    "triangles": 374,
    "vertices": 678,
    "materials": [
      "colormap"
    ],
    "texture_keys": [
      "Models/GLB format/Textures/colormap.png"
    ],
    "normalized": true
  },
  "rig": {
    "rig_type": "humanoid",
    "rig_id": "rig:2ca4677e40f4",
    "joint_count": 7,
    "attach_points": [
      {
        "slot": "hand-right",
        "joint": "arm-right"
      },
      {
        "slot": "hand-left",
        "joint": "arm-left"
      },
      {
        "slot": "head",
        "joint": "head"
      },
      {
        "slot": "root",
        "joint": "root"
      }
    ],
    "clips": [
      {
        "name": "static",
        "duration_s": 0.1,
        "loop": false
      },
      {
        "name": "idle",
        "duration_s": 1.33,
        "loop": true,
        "canonical": "idle"
      },
      {
        "name": "walk",
        "duration_s": 0.67,
        "loop": true,
        "canonical": "walk"
      },
      {
        "name": "sprint",
        "duration_s": 0.5,
        "loop": true,
        "canonical": "sprint"
      },
      {
        "name": "jump",
        "duration_s": 0.5,
        "loop": false,
        "canonical": "jump"
      },
      {
        "name": "fall",
        "duration_s": 0.33,
        "loop": true,
        "canonical": "fall"
      },
      {
        "name": "crouch",
        "duration_s": 0.17,
        "loop": true,
        "canonical": "crouch"
      },
      {
        "name": "sit",
        "duration_s": 0.17,
        "loop": true,
        "canonical": "sit"
      },
      {
        "name": "drive",
        "duration_s": 0.17,
        "loop": true,
        "canonical": "drive"
      },
      {
        "name": "die",
        "duration_s": 0.33,
        "loop": false,
        "canonical": "die"
      },
      {
        "name": "pick-up",
        "duration_s": 0.33,
        "loop": false,
        "canonical": "pick-up"
      },
      {
        "name": "emote-yes",
        "duration_s": 0.67,
        "loop": false,
        "canonical": "emote"
      },
      {
        "name": "emote-no",
        "duration_s": 0.67,
        "loop": false,
        "canonical": "emote"
      },
      {
        "name": "holding-right",
        "duration_s": 0.17,
        "loop": true,
        "canonical": "hold"
      },
      {
        "name": "holding-left",
        "duration_s": 0.17,
        "loop": true,
        "canonical": "hold"
      },
      {
        "name": "holding-both",
        "duration_s": 0.17,
        "loop": true,
        "canonical": "hold"
      },
      {
        "name": "holding-right-shoot",
        "duration_s": 0.2,
        "loop": false,
        "canonical": "attack-ranged"
      },
      {
        "name": "holding-left-shoot",
        "duration_s": 0.2,
        "loop": false,
        "canonical": "attack-ranged"
      },
      {
        "name": "holding-both-shoot",
        "duration_s": 0.2,
        "loop": false,
        "canonical": "attack-ranged"
      },
      {
        "name": "attack-melee-right",
        "duration_s": 0.42,
        "loop": false,
        "canonical": "attack-melee"
      },
      {
        "name": "attack-melee-left",
        "duration_s": 0.42,
        "loop": false,
        "canonical": "attack-melee"
      },
      {
        "name": "attack-kick-right",
        "duration_s": 0.53,
        "loop": false,
        "canonical": "attack-kick"
      },
      {
        "name": "attack-kick-left",
        "duration_s": 0.53,
        "loop": false,
        "canonical": "attack-kick"
      },
      {
        "name": "interact-right",
        "duration_s": 0.67,
        "loop": false,
        "canonical": "interact"
      },
      {
        "name": "interact-left",
        "duration_s": 0.67,
        "loop": false,
        "canonical": "interact"
      },
      {
        "name": "wheelchair-sit",
        "duration_s": 0.17,
        "loop": true,
        "canonical": "sit"
      },
      {
        "name": "wheelchair-look-left",
        "duration_s": 0.33,
        "loop": false,
        "canonical": "other"
      },
      {
        "name": "wheelchair-look-right",
        "duration_s": 0.33,
        "loop": false,
        "canonical": "other"
      },
      {
        "name": "wheelchair-move-forward",
        "duration_s": 0.5,
        "loop": true,
        "canonical": "other"
      },
      {
        "name": "wheelchair-move-back",
        "duration_s": 0.5,
        "loop": true,
        "canonical": "other"
      },
      {
        "name": "wheelchair-move-left",
        "duration_s": 0.5,
        "loop": true,
        "canonical": "other"
      },
      {
        "name": "wheelchair-move-right",
        "duration_s": 0.5,
        "loop": true,
        "canonical": "other"
      }
    ]
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "rig.attach_points": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "no hand bones; arm joints stand in, found via holding-* clips"
    },
    "rig.clips": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "canonical and loop from the clip-name synonym table"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.88,
      "input": "sheet + measured facts"
    },
    "describe.roles": {
      "by": "human",
      "at": "2026-10-26T20:00:00-07:00",
      "locked": true,
      "input": "prototype used it as the goblin enemy (C2 §2)"
    }
  }
}
```

</details>

<details><summary><code>model-prop-synty-goblin-war-camp-torch</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:synty-polygon-goblin-war-camp/buildings/sm-bld-prop-torch-01@v3",
  "card_type": "asset",
  "status": "draft",
  "title": "Torch 01",
  "kind": "model",
  "subkind": "prop",
  "collection": "t1:synty-polygon-goblin-war-camp@v3",
  "source": {
    "files": [
      {
        "path": "FBX/Buildings/SM_Bld_Prop_Torch_01.fbx",
        "sha256": "sha256:b296e3c8c0b10bc9f095e766fb8c9071b5468a17c909808707bef46f2e8210f6",
        "bytes": 64192,
        "format": "fbx",
        "role": "primary"
      },
      {
        "path": "MaterialList_PolygonGoblinWarCamp.txt",
        "sha256": "sha256:af089923cdad730e5860eeafb5f0e1e601c80d93958ea922e3185d5917457ffb",
        "bytes": 321105,
        "format": "txt",
        "role": "metadata"
      }
    ],
    "content_hash": "sha256:b296e3c8c0b10bc9f095e766fb8c9071b5468a17c909808707bef46f2e8210f6"
  },
  "describe": {
    "objects": [
      "torch"
    ],
    "environments": [
      "camp"
    ],
    "roles": [
      "light-source",
      "decor"
    ],
    "keywords": [
      "goblin"
    ]
  },
  "flags": [
    "missing-preview"
  ],
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "filename",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.5,
      "input": "SM_Bld_Prop_Torch_01 + folder Buildings + pack title"
    }
  }
}
```

</details>

<details><summary><code>collection-synty-polygon-goblin-war-camp</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:synty-polygon-goblin-war-camp@v3",
  "card_type": "collection",
  "status": "draft",
  "title": "POLYGON - Goblin War Camp (Synty)",
  "license": "LicenseRef-synty-personal",
  "rights": {
    "uses": [
      "in-game",
      "placeholder",
      "derive-layout",
      "style-reference",
      "vision-input"
    ],
    "audience": "private",
    "redistribution": "in-build",
    "attribution": null,
    "basis": [
      {
        "type": "license",
        "license": "LicenseRef-synty-personal",
        "ref": "Synty EULA (personal purchase); B11 policy",
        "uses": [
          "in-game",
          "placeholder",
          "derive-layout",
          "style-reference",
          "vision-input"
        ],
        "audience": "private",
        "redistribution": "in-build",
        "attribution": null,
        "set_by": {
          "role": "intake-code"
        },
        "confirmed_by": "kevin",
        "date": "2026-10-26",
        "note": "Kevin's instance and private repos only; raw files never committed or shared. Check the EULA before anything public."
      }
    ]
  },
  "describe": {
    "description": "Detailed low-poly goblin camp: tents, platforms, palisades, cages, wagons and camp props on a shared texture atlas.",
    "environments": [
      "camp",
      "forest"
    ],
    "settings": [
      "fantasy"
    ],
    "style_family": "detailed-low-poly",
    "pov_fit": [
      "iso",
      "follow",
      "fps",
      "orbit"
    ]
  },
  "collection_info": {
    "vendor": "synty",
    "version": "v3",
    "origin": "vendor-pack",
    "counts": {
      "model": 670
    },
    "creation_choice": false,
    "pack_manifest": "assets-local/packs/synty-polygon-goblin-war-camp/pack.json"
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "rights": {
      "by": "license",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "filename",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.6,
      "input": "folder names + MaterialList; not yet seen by the tagger"
    },
    "describe.pov_fit": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.5,
      "input": "C2 §4 [I]: POLYGON sets built for first and third person"
    }
  }
}
```

</details>

<details><summary><code>sprite-kenney-tiny-dungeon-knight</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-tiny-dungeon/tiles/tile-0097@1.0",
  "card_type": "asset",
  "status": "tagged",
  "title": "Knight (tile 97)",
  "kind": "sprite",
  "subkind": "character",
  "collection": "t1:kenney-tiny-dungeon@1.0",
  "source": {
    "files": [
      {
        "path": "Tiles/tile_0097.png",
        "sha256": "sha256:20915fde756b990f5b0c86fda557a93a6c306373d7c4fc07a1991f4ace3271b4",
        "bytes": 225,
        "format": "png",
        "role": "primary"
      }
    ],
    "content_hash": "sha256:20915fde756b990f5b0c86fda557a93a6c306373d7c4fc07a1991f4ace3271b4"
  },
  "previews": {
    "thumb": "previews/20/20915fde756b990f-thumb.webp"
  },
  "describe": {
    "description": "16 px pixel-art knight in a grey visored helmet and armour, facing the viewer; a hero or guard for top-down dungeon games.",
    "objects": [
      "knight",
      "helmet",
      "armor"
    ],
    "environments": [
      "dungeon",
      "castle",
      "town"
    ],
    "settings": [
      "fantasy",
      "medieval"
    ],
    "roles": [
      "hero",
      "npc",
      "enemy"
    ],
    "style_family": "pixel-art",
    "pov_fit": [
      "topdown"
    ]
  },
  "image": {
    "width_px": 16,
    "height_px": 16,
    "has_alpha": true,
    "pixel_art": true
  },
  "sprite": {
    "drawn_view": "front",
    "tile_px": 16,
    "sheet_index": 97,
    "tile": {
      "layer": "entity",
      "autotile": "none",
      "walkable": false
    }
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.86,
      "input": "collection sheet crop + neighbours"
    },
    "sprite.tile_px": {
      "by": "vendor-metadata",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "Tilesheet.txt"
    }
  }
}
```

</details>

<details><summary><code>texture-kenney-prototype-dark-grid</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-prototype-textures/dark/texture-01@1.0",
  "card_type": "asset",
  "status": "tagged",
  "title": "Prototype grid, dark 01",
  "kind": "texture",
  "subkind": "material",
  "collection": "t1:kenney-prototype-textures@1.0",
  "source": {
    "files": [
      {
        "path": "PNG/Dark/texture_01.png",
        "sha256": "sha256:07e28d7a86396fa4f1d7c43040f8e57e2374f6fa35b02bc48e70f9ccd4041c1a",
        "bytes": 2774,
        "format": "png",
        "role": "primary"
      }
    ],
    "content_hash": "sha256:07e28d7a86396fa4f1d7c43040f8e57e2374f6fa35b02bc48e70f9ccd4041c1a"
  },
  "previews": {
    "thumb": "previews/07/07e28d7a86396fa4-thumb.webp"
  },
  "describe": {
    "description": "Dark grey grid texture with a faint fine grid and a brighter 2x2 major grid, for blocking out levels before real art.",
    "objects": [
      "grid"
    ],
    "environments": [
      "neutral"
    ],
    "settings": [
      "none"
    ],
    "roles": [
      "floor",
      "wall",
      "terrain"
    ],
    "style_family": "any",
    "moods": [
      "neutral"
    ]
  },
  "look": {
    "mean_luminance": 0.21
  },
  "image": {
    "width_px": 1024,
    "height_px": 1024,
    "has_alpha": false,
    "indexed_colors": 16,
    "pixel_art": false
  },
  "texture": {
    "maps": [
      "albedo"
    ],
    "tileable": true,
    "color_space": "srgb",
    "pattern": "grid"
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.95,
      "input": "image"
    },
    "look.mean_luminance": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "illustrative value; measure when the tool exists"
    }
  }
}
```

</details>

<details><summary><code>audio-music-kenney-infinite-descent</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-music-loops/loops/infinite-descent@1.1",
  "card_type": "asset",
  "status": "tagged",
  "title": "Infinite Descent",
  "kind": "audio",
  "subkind": "music/loop",
  "collection": "t1:kenney-music-loops@1.1",
  "source": {
    "files": [
      {
        "path": "Loops/Infinite Descent.ogg",
        "sha256": "sha256:586735f25b5f677979e66206cc6dd1c43aaf9de0043697c67c24c149ec6ba95b",
        "bytes": 169891,
        "format": "ogg",
        "role": "primary"
      }
    ],
    "content_hash": "sha256:586735f25b5f677979e66206cc6dd1c43aaf9de0043697c67c24c149ec6ba95b"
  },
  "previews": {
    "waveform": "previews/58/586735f25b5f6779-waveform.webp",
    "clip": "previews/58/586735f25b5f6779-clip.webp"
  },
  "describe": {
    "description": "Short 12-second music loop with a steady, even level; a looping background bed for menus or exploration.",
    "objects": [],
    "environments": [
      "dungeon",
      "cave"
    ],
    "roles": [
      "music-bed"
    ],
    "moods": [
      "tense",
      "mysterious"
    ],
    "style_family": "any"
  },
  "audio": {
    "duration_s": 12.0,
    "sample_rate": 44100,
    "channels": 2,
    "loudness_lufs": -17.3,
    "loudness_range_lu": 0.3,
    "peak_dbfs": -0.5,
    "spectral_centroid_hz": 2789,
    "tempo_bpm": null,
    "loopable": null
  },
  "flags": [
    "low-confidence"
  ],
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "ffmpeg ebur128 + aspectralstats"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.55,
      "input": "title + measured features + waveform/spectrum strip; mood not heard"
    },
    "describe.moods": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.45,
      "input": "title words 'descent' + features; needs a listen or an audio model"
    }
  }
}
```

</details>

<details><summary><code>audio-sfx-kenney-rpg-book-open</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-rpg-audio/audio/book-open@1.0",
  "card_type": "asset",
  "status": "tagged",
  "title": "Book open",
  "kind": "audio",
  "subkind": "sfx/foley",
  "collection": "t1:kenney-rpg-audio@1.0",
  "source": {
    "files": [
      {
        "path": "Audio/bookOpen.ogg",
        "sha256": "sha256:90f96c5be94642bf16ea2e1b082920421e1c85159f0d18e687e3b464e792ad09",
        "bytes": 10309,
        "format": "ogg",
        "role": "primary"
      }
    ],
    "content_hash": "sha256:90f96c5be94642bf16ea2e1b082920421e1c85159f0d18e687e3b464e792ad09"
  },
  "previews": {
    "waveform": "previews/90/90f96c5be94642bf-waveform.webp",
    "clip": "previews/90/90f96c5be94642bf-clip.webp"
  },
  "describe": {
    "description": "Very short paper rustle of a book being opened; UI feedback for menus, journals or reading a note.",
    "objects": [
      "book"
    ],
    "environments": [
      "interior"
    ],
    "roles": [
      "feedback"
    ],
    "materials": [
      "paper"
    ],
    "style_family": "any"
  },
  "audio": {
    "duration_s": 0.154,
    "sample_rate": 48000,
    "channels": 2,
    "loudness_lufs": null,
    "loudness_range_lu": null,
    "peak_dbfs": -11.5,
    "spectral_centroid_hz": 6148,
    "tempo_bpm": null,
    "loopable": false,
    "ucs_cat_id": "PAPRHndl"
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "ffmpeg; clip under 0.4 s so no integrated loudness"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.8,
      "input": "filename + features"
    },
    "audio.ucs_cat_id": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.5,
      "input": "UCS list; verify CatID against the official sheet"
    }
  }
}
```

</details>

<details><summary><code>font-kenney-future</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-fonts/kenney-future@3.7.0",
  "card_type": "asset",
  "status": "tagged",
  "title": "Kenney Future",
  "kind": "ui",
  "subkind": "font",
  "collection": "t1:kenney-fonts@3.7.0",
  "source": {
    "files": [
      {
        "path": "Kenney Future.ttf",
        "sha256": "sha256:7a55b07f5968fac872648a7c5e959bd2b93e06f63153b585d56e4d5298ddff61",
        "bytes": 34160,
        "format": "ttf",
        "role": "primary"
      },
      {
        "path": "kenney_future-webfont.woff2",
        "sha256": "sha256:75ff4cc44eb40a8306fd1d6c9c7c91e8ff41e831847f00666485c936e40353ff",
        "bytes": 7388,
        "format": "woff2",
        "role": "companion"
      }
    ],
    "content_hash": "sha256:7a55b07f5968fac872648a7c5e959bd2b93e06f63153b585d56e4d5298ddff61"
  },
  "previews": {
    "thumb": "previews/7a/7a55b07f5968fac8-thumb.webp"
  },
  "describe": {
    "description": "Bold geometric display font with squared letterforms, for game titles, HUD labels and buttons.",
    "objects": [],
    "roles": [
      "text",
      "ui-element"
    ],
    "settings": [
      "sci-fi",
      "modern"
    ],
    "style_family": "any",
    "moods": [
      "energetic"
    ]
  },
  "font": {
    "family": "Kenney Future",
    "style": "Regular",
    "glyph_ranges": [
      "basic-latin",
      "latin-1",
      "latin-ext-a",
      "symbols"
    ],
    "monospace": false,
    "pixel_font_px": null,
    "formats": [
      "ttf",
      "woff",
      "woff2"
    ]
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "fc-scan charset"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.75,
      "input": "specimen sheet"
    }
  }
}
```

</details>

<details><summary><code>vfx-kenney-particle-flame</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:kenney-particle-pack/flame-01@1.1",
  "card_type": "asset",
  "status": "tagged",
  "title": "Flame 01",
  "kind": "vfx",
  "subkind": "particle",
  "collection": "t1:kenney-particle-pack@1.1",
  "source": {
    "files": [
      {
        "path": "PNG (Transparent)/flame_01.png",
        "sha256": "sha256:92a70bcb90b1e21c57b2dae42843135703b2e988abee97433f84c3119723d144",
        "bytes": 54099,
        "format": "png",
        "role": "primary"
      },
      {
        "path": "PNG (Black background)/flame_01.png",
        "sha256": "sha256:dc6b5decd0e7e99900b0493fa1496f80e34d272f5603081634d0e99235ea9d2b",
        "bytes": 35189,
        "format": "png",
        "role": "companion"
      }
    ],
    "content_hash": "sha256:92a70bcb90b1e21c57b2dae42843135703b2e988abee97433f84c3119723d144"
  },
  "previews": {
    "thumb": "previews/92/92a70bcb90b1e21c-thumb.webp"
  },
  "describe": {
    "description": "Soft greyscale flame wisp for particle systems; tint it orange for fire, green or blue for magic.",
    "objects": [
      "flame"
    ],
    "environments": [
      "neutral"
    ],
    "roles": [
      "effect",
      "light-source"
    ],
    "materials": [
      "fire"
    ],
    "style_family": "any"
  },
  "image": {
    "width_px": 512,
    "height_px": 512,
    "has_alpha": true,
    "indexed_colors": 256,
    "pixel_art": false
  },
  "vfx": {
    "blend": "additive",
    "background": "transparent",
    "tintable": true,
    "frames": 1,
    "emitter_preset": null
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.85,
      "input": "image on dark and light backgrounds"
    },
    "vfx.blend": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.7,
      "input": "greyscale on black companion file suggests additive"
    }
  }
}
```

</details>

<details><summary><code>collection-profantasy-cartographers-annual</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:profantasy-cartographers-annual@illustrative",
  "card_type": "collection",
  "status": "tagged",
  "title": "Cartographer's Annual (ProFantasy)",
  "license": "LicenseRef-profantasy-eula",
  "rights": {
    "uses": [
      "derive-layout",
      "vision-input"
    ],
    "audience": "private",
    "redistribution": "none",
    "attribution": null,
    "basis": [
      {
        "type": "license",
        "license": "LicenseRef-profantasy-eula",
        "ref": "license text shipped with the bundle (to read at import)",
        "uses": [
          "derive-layout",
          "style-reference",
          "vision-input"
        ],
        "audience": "private",
        "redistribution": "none",
        "attribution": null,
        "set_by": {
          "role": "intake-code"
        },
        "confirmed_by": "kevin",
        "date": "2026-10-26",
        "note": "Illustrative ceiling: private use of a purchased product. In-game use was not assessed because Kevin ruled it out."
      },
      {
        "type": "decision",
        "uses": [
          "derive-layout",
          "vision-input"
        ],
        "audience": "private",
        "redistribution": "none",
        "set_by": {
          "role": "admin",
          "name": "kevin"
        },
        "date": "2026-10-26",
        "note": "Inspiration only: agents learn layouts; images and symbols never used in a game, not even as placeholders (C2 §9)."
      }
    ]
  },
  "describe": {
    "description": "Campaign Cartographer example maps: dungeons, castles and buildings drawn on grids, used only to extract layout specs.",
    "environments": [
      "dungeon",
      "castle",
      "crypt",
      "cave"
    ],
    "settings": [
      "fantasy",
      "medieval"
    ],
    "roles": [
      "layout-reference"
    ]
  },
  "collection_info": {
    "vendor": "profantasy",
    "version": "illustrative",
    "origin": "drive-drop",
    "counts": {
      "inspiration/map": 0
    },
    "creation_choice": false,
    "hash_manifest": "private/hash-manifests/profantasy-cartographers-annual-illustrative.txt",
    "files_total": 0
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "rights": {
      "by": "license",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "rights.basis": {
      "by": "human",
      "at": "2026-10-26T20:00:00-07:00",
      "locked": true,
      "input": "Kevin, 2026-10-26"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.7,
      "input": "collection sheet"
    }
  }
}
```

</details>

<details><summary><code>map-profantasy-example-dungeon</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:profantasy-cartographers-annual/example-dungeon-01@illustrative",
  "card_type": "asset",
  "status": "tagged",
  "title": "Example dungeon 01",
  "kind": "inspiration",
  "subkind": "map",
  "collection": "t1:profantasy-cartographers-annual@illustrative",
  "source": {
    "files": [
      {
        "path": "example-dungeon-01.png",
        "sha256": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        "bytes": 0,
        "format": "png",
        "role": "primary"
      }
    ],
    "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
  },
  "previews": {
    "thumb": "private/previews/00/0000000000000000-thumb.webp"
  },
  "describe": {
    "description": "Grid dungeon of seven rooms around a central pillared hall, with a secret door into a small crypt and stairs down to a lower level.",
    "objects": [
      "pillar",
      "altar",
      "sarcophagus",
      "stairs"
    ],
    "environments": [
      "dungeon",
      "crypt"
    ],
    "settings": [
      "fantasy"
    ],
    "roles": [
      "layout-reference"
    ]
  },
  "image": {
    "width_px": 2400,
    "height_px": 1800,
    "has_alpha": false,
    "indexed_colors": null,
    "pixel_art": false
  },
  "map": {
    "map_type": "dungeon",
    "publication": "Cartographer's Annual (issue to record at import)",
    "grid_detected": {
      "cell_px": 50,
      "cols": 48,
      "rows": 36,
      "confidence": 0.92
    },
    "levels_shown": 1,
    "site": "example-dungeon-01",
    "layout_spec": {
      "id": "layout:profantasy-cartographers-annual/example-dungeon-01@illustrative#1",
      "status": "extracted",
      "confidence": 0.81
    }
  },
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-measure@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "describe": {
      "by": "model",
      "model": "vision-model-tbd",
      "tool": "gm-tag@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "confidence": 0.8,
      "input": "map image (vision-input allowed)"
    },
    "map.layout_spec": {
      "by": "code",
      "tool": "gm-map-extract@0.1",
      "at": "2026-10-26T20:00:00-07:00",
      "input": "model proposal validated by code checks"
    }
  }
}
```

</details>

<details><summary><code>layout-profantasy-example-dungeon</code></summary>

```json
{
  "schema": "ogm.map-layout-spec/1.0",
  "id": "layout:profantasy-cartographers-annual/example-dungeon-01@illustrative#1",
  "source": {
    "card_id": "t1:profantasy-cartographers-annual/example-dungeon-01@illustrative",
    "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "required_use": "derive-layout"
  },
  "extraction": {
    "status": "extracted",
    "by": {
      "model": "vision-model-tbd",
      "tool": "gm-map-extract@0.1"
    },
    "at": "2026-10-26T20:00:00-07:00",
    "confidence": 0.81,
    "checks": [
      {
        "name": "polygons-valid",
        "passed": true
      },
      {
        "name": "no-room-overlap",
        "passed": true
      },
      {
        "name": "connections-touch-rooms",
        "passed": true
      },
      {
        "name": "graph-connected",
        "passed": true
      },
      {
        "name": "entrance-exists",
        "passed": true
      },
      {
        "name": "grid-matches-image",
        "passed": true,
        "detail": "48x36 cells at 50 px"
      }
    ],
    "edited_by_human": false
  },
  "grid": {
    "type": "square",
    "cols": 48,
    "rows": 36,
    "cell_px": 50,
    "cell_real": {
      "value": 5,
      "unit": "ft"
    },
    "confidence": 0.92
  },
  "level": {
    "index": 0,
    "name": "ground",
    "site": "example-dungeon-01"
  },
  "rooms": [
    {
      "id": "entry",
      "polygon": [
        [
          2,
          16
        ],
        [
          8,
          16
        ],
        [
          8,
          20
        ],
        [
          2,
          20
        ]
      ],
      "shape": "chamber",
      "size_class": "small",
      "area_cells": 24,
      "function": "entrance",
      "confidence": 0.9
    },
    {
      "id": "hall",
      "polygon": [
        [
          14,
          10
        ],
        [
          30,
          10
        ],
        [
          30,
          26
        ],
        [
          14,
          26
        ]
      ],
      "shape": "hall",
      "size_class": "large",
      "area_cells": 256,
      "function": "great-hall",
      "confidence": 0.88
    },
    {
      "id": "c1",
      "polygon": [
        [
          8,
          17
        ],
        [
          14,
          17
        ],
        [
          14,
          19
        ],
        [
          8,
          19
        ]
      ],
      "shape": "corridor",
      "size_class": "tiny",
      "area_cells": 12,
      "function": "corridor",
      "confidence": 0.85
    },
    {
      "id": "guard",
      "polygon": [
        [
          16,
          4
        ],
        [
          30,
          4
        ],
        [
          30,
          10
        ],
        [
          16,
          10
        ]
      ],
      "shape": "chamber",
      "size_class": "medium",
      "area_cells": 84,
      "function": "guard-room",
      "confidence": 0.7
    },
    {
      "id": "store",
      "polygon": [
        [
          16,
          26
        ],
        [
          24,
          26
        ],
        [
          24,
          32
        ],
        [
          16,
          32
        ]
      ],
      "shape": "chamber",
      "size_class": "medium",
      "area_cells": 48,
      "function": "storage",
      "confidence": 0.6
    },
    {
      "id": "crypt",
      "polygon": [
        [
          30,
          8
        ],
        [
          38,
          8
        ],
        [
          38,
          16
        ],
        [
          30,
          16
        ]
      ],
      "shape": "chamber",
      "size_class": "medium",
      "area_cells": 64,
      "function": "crypt",
      "confidence": 0.75
    },
    {
      "id": "stair",
      "polygon": [
        [
          30,
          20
        ],
        [
          34,
          20
        ],
        [
          34,
          24
        ],
        [
          30,
          24
        ]
      ],
      "shape": "stairwell",
      "size_class": "tiny",
      "area_cells": 16,
      "confidence": 0.8
    }
  ],
  "connections": [
    {
      "id": "d0",
      "type": "door",
      "from": "outside",
      "to": "entry",
      "at": [
        2,
        18
      ],
      "confidence": 0.9
    },
    {
      "id": "d1",
      "type": "opening",
      "from": "entry",
      "to": "c1",
      "at": [
        8,
        18
      ],
      "confidence": 0.9
    },
    {
      "id": "d2",
      "type": "double-door",
      "from": "c1",
      "to": "hall",
      "at": [
        14,
        18
      ],
      "confidence": 0.85
    },
    {
      "id": "d3",
      "type": "door",
      "from": "hall",
      "to": "guard",
      "at": [
        20,
        10
      ],
      "confidence": 0.85
    },
    {
      "id": "d4",
      "type": "door",
      "from": "hall",
      "to": "store",
      "at": [
        20,
        26
      ],
      "confidence": 0.8
    },
    {
      "id": "d5",
      "type": "secret-door",
      "from": "hall",
      "to": "crypt",
      "at": [
        30,
        13
      ],
      "confidence": 0.65
    },
    {
      "id": "d6",
      "type": "door",
      "from": "hall",
      "to": "stair",
      "at": [
        30,
        22
      ],
      "confidence": 0.8
    },
    {
      "id": "d7",
      "type": "locked-door",
      "from": "guard",
      "to": "crypt",
      "at": [
        30,
        9
      ],
      "confidence": 0.55
    },
    {
      "id": "s1",
      "type": "stairs-down",
      "from": "stair",
      "to": {
        "spec": "layout:profantasy-cartographers-annual/example-dungeon-01-lower@illustrative#1",
        "room": "landing"
      },
      "at": [
        32,
        22
      ],
      "confidence": 0.85
    }
  ],
  "features": [
    {
      "id": "f1",
      "type": "pillar",
      "room": "hall",
      "at": [
        18,
        14
      ],
      "count": 8,
      "confidence": 0.9
    },
    {
      "id": "f2",
      "type": "altar",
      "room": "hall",
      "at": [
        27,
        18
      ],
      "confidence": 0.7
    },
    {
      "id": "f3",
      "type": "sarcophagus",
      "room": "crypt",
      "at": [
        34,
        12
      ],
      "count": 3,
      "confidence": 0.75
    },
    {
      "id": "f4",
      "type": "crate",
      "room": "store",
      "at": [
        20,
        29
      ],
      "count": 4,
      "confidence": 0.6
    },
    {
      "id": "f5",
      "type": "spawn-hint",
      "room": "entry",
      "at": [
        4,
        18
      ],
      "confidence": 0.8
    }
  ],
  "tags": {
    "computed": {
      "room_count": 7,
      "connection_count": 9,
      "loop_count": 1,
      "entrance_count": 1,
      "dead_end_count": 1,
      "secret_count": 1,
      "level_change_count": 1,
      "longest_path_rooms": 4,
      "total_area_cells": 504,
      "size_class": "medium"
    },
    "judged": {
      "map_type": "dungeon",
      "themes": [
        "dungeon",
        "crypt"
      ],
      "flow": "hub-and-spoke",
      "difficulty_flow": "gated",
      "suits": [
        "dungeon-crawler",
        "action-rpg",
        "stealth"
      ],
      "confidence": 0.7
    }
  },
  "notes": "Hub layout: one big pillared hall feeds every room. The crypt has two ways in (secret door from the hall, locked door from the guard room), which makes the only loop."
}
```

</details>

<details><summary><code>collection-drive-drop-quarantined</code></summary>

```json
{
  "schema": "ogm.asset-card/1.0",
  "vocab": "2026-10-26",
  "id": "t1:drive-2026-10-26-dungeon-sfx@1",
  "card_type": "collection",
  "status": "quarantined",
  "title": "Drive drop: dungeon sfx (license unknown)",
  "license": "NOASSERTION",
  "rights": {
    "uses": [
      "vision-input"
    ],
    "audience": "private",
    "redistribution": "none",
    "attribution": null,
    "basis": [
      {
        "type": "default",
        "uses": [
          "vision-input"
        ],
        "audience": "private",
        "redistribution": "none",
        "set_by": {
          "role": "intake-code"
        },
        "date": "2026-10-26",
        "note": "No license file or vendor marker found; asked Kevin."
      }
    ]
  },
  "collection_info": {
    "vendor": "unknown",
    "version": "1",
    "origin": "drive-drop",
    "counts": {
      "audio": 14
    }
  },
  "flags": [
    "license-unknown"
  ],
  "provenance": {
    "*": {
      "by": "code",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    },
    "rights": {
      "by": "default",
      "tool": "gm-intake@0.1",
      "at": "2026-10-26T20:00:00-07:00"
    }
  }
}
```

</details>

## 16. Measured while writing this [M]

- **Rig sharing works by hash:** the Mini Dungeon orc and human produce the same `rig_id` once only joint-to-joint parent links are hashed (§3).
- **Integrated loudness fails for short SFX** under 0.4 s (−70 LUFS gate floor), so cards need `peak_dbfs` (§3).
- **Synty `MaterialList_*.txt`** gives material slots and textures per prefab without opening FBX files (321 KB for Goblin War Camp).
- **The Mini Dungeon orc's hand slots are its arm joints:** it has no hand bones. `holding-*` clips show the props attach to the arm joints. The card records that, so an agent doesn't search for a `hand_r` bone.
- **No converter is installed here** (no Blender or assimp), so Synty FBX geometry can't be measured yet. That's why the torch example is a `draft`.
- **What the ProFantasy bundle looks like** (from the file listings of its 74 downloaded archives, made earlier this session; nothing installed or run):
  - **Format:** almost all are Windows installers (`.exe`, or `.msi` inside a `.zip`) for Campaign Cartographer 3+ add-ons: Cartographer's Annual issues 2007–2023, Symbol Sets 1–6, Dungeon Designer 3, City Designer 3, Source Maps (Castles, Cities, Temples) and others.
  - **About 7,000 maps are native CC3+ `.FCW` files.** These are vector drawings that need CC3+ (Windows) to render.
  - **About 257,000 bitmaps (`.PNG`, `.png`) are mostly symbol and fill art, not maps.** About 217,000 carry resolution suffixes such as `_VH`, `_HI`, `_LO` and `_VL`.
  - **About 4,000 `.jpg` files** and a minority of PNGs are rendered example maps or previews.
  - **About 40 license files** sit inside, including per-font licenses, so the bundle is a **mixed-license** collection.

  What follows for intake:
  - **Unpack installers by extraction** (7z or msitools), **never by running them** (C2 §7).
  - **Card only map images.** Symbol and fill bitmaps get no cards, but their hashes go into the collection's `hash_manifest`, so the commit check still blocks them.
  - **Card rendered maps first.** For the `.FCW` maps, a one-time CC3+ export under Wine produces the PNGs (open question 8, answered).
  - **Use one collection per installer,** grouped by the bundle.
  - **Fonts with their own licenses get per-asset `license` basis entries** (§5).

## 17. Conflicts flagged (pick one, clean up the other)

1. **The word `uses` means two things in C2 §10:** "Where it fits: uses (wall piece, floor tile…)" and the rights field `uses`. **Picked:** the rights field keeps `uses` (it's the enforced one, and the newest decision). The gameplay meaning becomes `describe.roles`. C2 §10's table row should be reworded when C2 is next edited.
2. **B11 `--style low-poly|pixel|toon|realistic` vs C2 §2 style families.** **Picked:** C2 §2's families (newer, tied to packs and creation choices) plus `photoreal` and `any`. B11 §4.7's flag values need updating to family ids.
3. **The `synty-personal` license class vs SPDX.** `local-asset-library.md` says `license` "is an SPDX id or a vendor class". **Picked:** SPDX expressions throughout, with `LicenseRef-synty-personal` for the vendor class. Update the doc and `import_synty.py` when the card builder lands, keeping a read alias.
4. **C2 §10's kind list** (model, character, prop, tile, modular piece, sprite, SFX, music, UI, texture, inspiration map) **vs B11's `kind/subkind`.** **Picked:** B11's two-level taxonomy, which already covers C2's list as subkinds, plus `inspiration/map`.
5. **B11 says tagging is from names, with an optional vision pass that needs approval. C2 §10 makes the vision pass part of intake.** **Picked:** C2 (newer, Kevin's direction). The spend approval still applies (§13 cost guard).

## 18. Open questions for Kevin

1. **Tagging spend:** OK to run a ~200-asset calibration sample (one-time vision cost, estimated before running) before the library-wide run is costed?
2. **`vision-input` on unknown-license drops:** the strict default lets intake send a quarantined drop to a vision model for identification. Keep that (helps identify the vendor), or make the default `uses: []` until you confirm?
3. **ProFantasy license ceiling:** when the bundle is imported, intake will read its terms. Should `style-reference` stay available in the ceiling (agents may look at a map for mood or palette), even though your decision currently allows only `derive-layout` + `vision-input`? (As written, it's off.)
4. **Who sees inspiration thumbnails:** C2 §9 offers 2–3 map candidates with thumbnails in the scope chat. With `audience: private`, may other members of your instance (family) see them, or only you?
5. **Embedding model for semantic search:** a small local model (no spend, runs on the maker PC or Railway CPU), or a hosted embedding API?
6. **Calibration reviewer:** you, or should an agent do a second-opinion pass and only escalate disagreements to you?
7. **New vocab additions:** OK for curation agents to accept proposed tags on their own (logged), or should each new enum value wait for your OK?
9. **Rename `vision-input` to `model-input`?** Audio analysis (Sidetrax, 2026-10-27) is the same kind of use as vision tagging. The rename is a breaking change: the schema enum and quarantine rule, every card, and §5, §13 and §18 would all change, with a schema minor bump. Until you decide, `vision-input` covers both.
10. ~~AI analysis of Sidetrax audio~~ **Answered (Kevin, 2026-10-27):** yes, by local models only (nothing uploaded, nothing generated). No vendor email. Recorded as an `interpretation` entry on each Sidetrax collection card. `edit-audio` and `derive-audio` are not granted.
8. ~~ProFantasy `.FCW` maps~~ **Answered (Kevin, 2026-10-26):** a one-time export. Claude installs CC3+ and its add-ons under Wine on Kevin's machine, batch-exports the example maps to PNG, then deletes the installers and duplicates. Agents and the product never run CC3+.

## For ticketing

- Card schema v1.0 and vocab release `2026-10-26`, both in the engine repo, with the proposal and acceptance migration.
- `build_cards.py`: migrate `pack.json` and `catalog.json` to collection cards (`LicenseRef-` rename).
- The rights engine: basis → effective computation, the refuse-on-mismatch write path, an admin-only decision command (`gm assets rights decide`), and audit log entries.
- Measurers:
  - glTF geometry, rig_id, clips with the canonical synonym table, attach points;
  - image header, palette, tileable test;
  - audio ffmpeg (ebur128, aspectralstats, peak, loop seam);
  - fonts (fontTools cmap);
  - vendor metadata parsers (Synty MaterialList, Kenney Tilesheet, LPC CREDITS).
- Preview renderer: 3D sheets, collection sheets, waveform and spectrum strips, font specimens, private-prefix map thumbnails.
- The tagger: batching, the prompt with vocabulary, confidence per group, `proposed_tags`, the cache key, and a `vision-input` gate before any call.
- The validator: schema + §11 checks, retry once, flags.
- Layout extraction and validation for inspiration maps, with graph metrics by code.
- The index: resolved cards, facets, full text, embeddings, rig queries, use-filtered defaults.
- The calibration sample and accuracy report; the human review UI in `gm-pack-curate` (edits lock fields).
- Hash blocklist for `redistribution: none`, covering originals, variants and previews, in the repo commit check.
