---
title: Tag fixes from Kevin's first swipe review
type: fix
status: queued
date: 2026-10-29
origin: Kevin's swipe review deck (private artifact), first 34 of 106 cards
---

# Tag fixes from Kevin's first swipe review

**Status: queued.** Run it once Kevin has judged more of the deck, or when he says go. Every fix below re-scores data we already stored (CLAP and CLIP embeddings, measured tempo and energy, CAD symbols). Nothing has to be re-analysed, so a full rebuild takes minutes, not hours.

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
- **F2 Map usability.** Add a `map.usable` judgement (yes / reference-only / no) with a reason: blank or near-empty (low ink coverage), standee or token, chart or symbol example, tutorial step. "No" maps keep their card, flagged `not-a-map`, and drop out of default search.
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
