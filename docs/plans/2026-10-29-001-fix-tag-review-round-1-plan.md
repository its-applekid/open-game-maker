---
title: Tag fixes from Kevin's first swipe review
type: fix
status: done (round 1); re-check pending
date: 2026-10-29
origin: Kevin's swipe review deck (private artifact), 93 verdicts
---

# Tag fixes from Kevin's first swipe review

**Status: done 2026-10-29** after Kevin's 93 verdicts (commits 317f0ce, 3d1019c). Changed cards went back to the deck as re-check items. The original queued text is kept below. Every fix below re-scores data we already stored (CLAP and CLIP embeddings, measured tempo and energy, CAD symbols). Nothing has to be re-analysed, so a full rebuild takes minutes, not hours.

## What the review found

21 of 34 cards were right and 13 were wrong.

| Area | Judged | Wrong | Pattern |
|---|---|---|---|
| Music | 9 | 5 | All 5 are "best for" (`game_fit`): chase, stealth, boss and defeat given to tracks that don't fit |
| Maps | 16 | 9 | 5 are not usable maps; 2 ask for view and scale tags; 1 has wrong objects; 1 is a near-empty tutorial |
| Sounds | 9 | 2 | Material wrong: a retro "coin" is not metal, and "plates slide" sounds like a blade on a whetstone |

Kevin's words, in short:
- "I'm growing suspicious the model over-labeled chase."
- "Best for seems a bit too crude; there don't seem to be enough options."
- Drakkenhall (a city panorama): tell top-down tile maps apart from forward-looking or profile views.
- Operation Manna (all of Greece): a zoomed-out paper map, not a map a player walks on.

## Root causes

1. **`game_fit` is a percentile, so every track gets two "suits" situations, even when none fit.** Each situation goes to roughly the top tenth of the library whatever the track sounds like: chase on 118 tracks, stealth on 123 and boss on 142. With 13 situations there aren't enough options for wandering, travel, romance or desolation.
2. **Maps have no "is this usable" check.** Paper standees (50), step-by-step tutorial frames, symbol or chart examples (3) and blank tiles (19 with "Blank" in the path) are all carded as maps.
3. **Maps have no view or scale fields.** `map_type` mixes what the place is (city, dungeon) with how it is drawn (panorama, battlemap).
4. **Objects come from every CAD symbol in the file.** A cellar map lists roof symbols that sit on hidden or other-level layers.
5. **Filename material words override CLAP in every pack.** "coin" means metal and "plate" means metal, even in synth and retro packs where the sound is synthetic.

## Fixes (queued)

- **F1 Music "best for".**
  - Expand the situations with travel, wandering, romance, wasteland or desolate, montage, credits, tension-build, celebration and calm-interior, about 22 in all.
  - Keep a situation only when its lift is high and the measured facts agree:
    - chase, combat and boss need tempo ≥ 110 BPM, or energy in the top 40%;
    - stealth needs low energy and sparse percussion;
    - defeat and sad-scene need a minor key or a slow tempo.
  - Allow zero situations, and drop "suits" from the description when none qualify.
  - Re-check: the 5 flagged tracks no longer carry the rejected situation, and "chase" falls from 118 tracks to the fast, high-energy ones.
- **F2 Is it a map, and is it usable.**
  - Add a separate yes/no field, `map.is_map`, judged from the image and its path. Paper standees, symbol and chart examples, keys and legends, and tutorial frames get `false`.
  - Today "map" is only an object tag: 32 map cards carry "map" in `objects` or `keywords`, and nothing marks the non-maps. Remove "map" from `objects` and `keywords` everywhere; the new field replaces it (Kevin, 2026-10-29).
  - For real maps, add a `map.usable` judgement (yes / reference-only / no) with a reason: blank or near-empty (low ink coverage), tutorial step, or too zoomed-out to walk on.
  - Non-maps and unusable maps keep their card, flagged `not-a-map` or `unusable`, and drop out of default search.
- **F3 Map view and scale.**
  - Add `map.view` (top-down, side or cross-section, perspective or panorama) and `map.scale` (battlemap, building, settlement, region, world) to C3 §3, scored from the stored CLIP embeddings plus grid and extents.
  - Operation Manna becomes region-scale and reference-only; Drakkenhall becomes a perspective panorama.
- **F4 Map objects.**
  - Drop symbols on hidden layers.
  - When the title names a level (cellar, basement, upper floor), drop symbols that belong to other levels, such as roofs on a cellar.
- **F5 Sound materials.** Trust filename material words only in foley, impact and RPG packs. In retro, sci-fi, synth and interface packs, use CLAP's material, or none. Remove "plate" from the metal words.
- **F6 Re-run and validate.**
  - Rebuild the audio and map cards, then run `validate.mjs`.
  - Check every flagged card against Kevin's note.
  - Re-send any changed cards to the review deck so he can confirm them.

## Not changing

- **Moods, genres, instruments and the other music tags:** no complaints so far (Helpless, Singularity and Bounce were liked).
- **Sound events and subkinds:** 7 of 9 sounds were liked.

## Round 1 results (93 verdicts, 2026-10-29)

64 liked, 29 rejected. By type: music 6 liked / 9 rejected; maps 17 / 11; sounds 14 / 3; 2D 17 / 1; 3D 13 / 2.

**Attributes that worked:**
- measured facts: length, tempo, key, size, grid;
- sound events and objects taken from filenames;
- map objects from CAD symbols, and map keywords from labels;
- map type, when the title or folder says it;
- 2D/3D pack descriptions, written from vendor text plus Kevin's confirmations.

**Attributes that did not:**
- every field CLAP ranks by lift against the library. Lift guarantees each label a similar share whatever the track sounds like:
  - music "best for": wrong in 8 of 9 music rejects;
  - music settings: on 100% of tracks, with "holiday" on 260;
  - music genre: agreed with the pack's own genre name about 30% of the time;
  - map settings and moods: a WWII map tagged "pirate", a crypt "cozy";
- instruments on unusual timbres: a steel drum heard as ukulele, banjo and sax;
- material words in synth packs.

### Library-wide audit before and after

| Field | Before | After |
|---|---|---|
| Music best for | 2 per track, 11–19% each | 0–2 per track, 24 situations; Kevin's rejected situations kept: 11/14 → 2/14 |
| Stingers best for | "defeat" on 54 of 85 | victory or menu; defeat on none |
| Moods | 91 energetic+sad, 116 cozy+energetic | 0 contradictory pairs; energetic and calm checked against measured energy |
| Music settings | 100% coverage, all 11 spread evenly | not tagged |
| Genre | CLAP only | pack name first, where the vendor names a genre |
| Sound materials | 47 in synth packs; "fire" on card slides | 25, each naming the material outright ("Impact metal", "Glass"); no CLAP fire; none on voice lines |
| Map is a map | not recorded; "map" was an object on 32 cards | `is_map`: 274 non-maps (papercraft 145, tokens 63, standees 50, symbol sheets 10, handouts 3, textures 3) |
| Map usable | not recorded | 66 near-empty, 86 tutorial steps, 359 zoomed-out (reference-only) |
| Map view / scale | not recorded | 227 perspective, 54 side; scale from map type |
| WWII map type | 86 of 125 "mine" | region |
| Map settings / moods | random | settings only from folder or publication words (medieval 282, modern 125, sci-fi 53); moods dropped |

### Still open (next round)

- **Moods are still wrong on some tracks.** Warsaw is "epic, triumphant" though Kevin hears it as desolate. Romance still gets "combat": its measured energy is high, so the gate passes it.
- **Instruments.** Unusual timbres are misheard, and 93 tracks put folk instruments on electronic, metal or chiptune.
- **Map environments are still CLIP lift**, e.g. "tavern" on dungeons. The same fix as settings probably applies.
- **Dioramas.** Kevin liked "Krom Diorama Barn 01 Walls B" but called the Sages Tower diorama "not a usable map". All 145 diorama sheets are now `is_map: false`. Kevin decides whether papercraft counts as a map.
- **Map keywords come from the map's own labels.** "priests" on Teotihuacan is a room label, so it stays.
- **Hidden CAD layers.** The DXF sidecar has no layer visibility, so F4 can only use level words.
