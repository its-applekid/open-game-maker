---
title: "feat: Tag the drive-barbarian-chiptune pack with the local audio worker (OGM-065, audio pass)"
type: feat
status: active
date: 2026-11-01
---

# feat: Tag the drive-barbarian-chiptune pack with the local audio worker

## Overview

GitHub issue #77 (OGM-065, "Local taggers: audio, maps and CLIP on contact sheets") has three tagger families. This plan covers only the audio one, run on the newly imported `drive-barbarian-chiptune` pack: 46 WAV files, hints `chiptune`, `dark`, `retro`, `action-adventure`, `RPG`. The pack came in through the Drive inbox, so its rights are the strict default (`vision-input` only, private, no redistribution). Its licence is unknown and the files are itch-owned, so it is private use only.

Result: 46 audio cards, one per WAV, each `status: measured|tagged`, with measured facts (tempo, key, loudness, duration, loop points where found) kept apart from model labels (moods, genre, game fit), plus a 20 s preview clip per card under `private/previews/`. Nothing leaves the machine, nothing costs money.

Command (from OGM-065, run on the NUC, which holds the asset library):

```
nice -n 10 gm packs tag --kind audio --only 'drive-barbarian-chiptune' --json
```

## Problem Frame

The audio worker (`analyze.py` + `build_audio_cards.py`, CLAP `laion/clap-htsat-unfused`, essentia/librosa) was built and tuned on Sidetrax and Kenney. Read against this pack, it has gaps that would produce confident wrong cards:
- `analyze.py` `MUSIC_PACKS = ("sidetrax-*", "kenney-music-*")`. `drive-barbarian-chiptune` matches neither, so all 46 files would take the sound-effect path: SFX event labels, no mood or genre, one `whole` excerpt.
- `PRIVATE_VENDORS = ("sidetrax-", "synty-")`. A `drive-` pack would get its waveform under public `previews/`, not `private/previews/`.
- `loop_search` runs only for `sidetrax-*`, so no loop points would be found.
- Previews today are waveform PNGs only; no 20 s clip exists. Pack hints reach the tagger only through `pack_genre()` (a pack-id word such as `chiptune`). `dark`, `retro` and the game types have no path in.
- `--json` (T05 section 4) is not yet on the scripts; OGM-065 U1 adds it.

## Requirements Trace

- R52, R86. Local code and models only; `nice -n 10`, workers at most cores/3, no network, no spend.
- D-CARDS. Measured facts in `audio.*` (code only); model judgments in `describe.*` with `by: model`, `model`, `confidence`.
- Rights invariant: no tagger writes `rights` or `license`; `no-model-rights` passes. Contract: one JSON line per card, non-zero exit on schema failure.

## Scope Boundaries

- Audio only, one pack, 46 files. No changes to label sets or thresholds in `labels.py` and `build_audio_cards.py` (`FIT_LIFT`, lift cut-offs). Classification of the pack as music, and its private prefix, are not label changes.
- No new model, no download (`HF_HUB_OFFLINE=1`; a missing cache fails naming the path). Runs on the NUC only, not the PC.

### Deferred to Follow-Up Work

- CLIP contact-sheet tagger, `@ogm/asset-previews`, 3D and sprite tagging; map tagging and `gm maps search`.
- Blob-store import of previews (OGM-067); semantic embeddings for search; music `settings`/`era` (CLAP cannot hear a setting).

## Context & Research

### Relevant Code and Patterns

- `scripts/audio/analyze.py` and `measure.py`: key, mode, tempo (+ alternatives), meter, loudness, energy, `loopable`, `loop_points` (only with `loop_search`), vendor tags, two CLAP excerpts per music file, sidecar skipped on equal sha256.
- `scripts/audio/build_audio_cards.py` and `labels.py`: lift ranking against the library mean, `fits()` gate on tempo, energy and key, validation. Music cards always carry `low-confidence` and `mood-unverified` (`MUSIC_CONF = 0.5`).
- C3: `audio.*` is code only; `describe.*` is model with `confidence`; below 0.6 is `low-confidence`; `game_fit` has at most two situations; music `settings` are not tagged; locked fields are skipped.

## Key Technical Decisions

- **Hints seed and boost; they never create.** The hints are stored on the collection card (assumed field `collection_info.hints`; if absent, written by the intake step first). They do three things only: (1) `chiptune` fills `genre` directly (as `pack_genre` already does), (2) hint words that are label names (`dark`, `action-adventure` mapping to `combat`/`exploration`, `RPG`) multiply that label's CLAP lift by 1.25 before the existing cut-off (assumed factor), so a hint cannot pass a label the audio scores below the cut-off by much, (3) a boosted label still fails if the measured gate (`fits()`, the energy overrule on `energetic`/`calm`) rejects it. `retro` is not an enum value: it goes to `proposed_tags` (nearest era `1980s`, assumed) with reason "pack hint", never to `era`.
- **Provenance records the seed.** A boosted label's provenance `input` says "pack hint boosted"; a hint on a label with CLAP lift under 1.0 is dropped.
- **Measured versus labelled stays as C3 says.** `audio.*` by `code`; `describe.*` by `model` (CLAP id, confidence); `audio.vendor` by `vendor-metadata`. Genre may be `by: collection`, hint-derived, with its own provenance key.
- **Per-group confidence.** Today one `describe` confidence (0.5) covers everything. Add `describe.moods`, `describe.genre`, `describe.game_fit` provenance keys carrying top-lift-derived confidence capped at 0.85 (assumed, mirroring the SFX cap); each under 0.6 adds `low-confidence`. The card keeps `mood-unverified` until the review below passes.
- **Status.** `tagged` when description, objects and roles exist (music always has `roles: ["music-bed"]`), else `measured` (CLAP not run or `describe-failed`). A file where measuring fails is not carded; the line is `invalid`.
- **Scope of the card rebuild.** `build_audio_cards.py` computes library means over every sidecar (lift needs the Sidetrax baseline) but writes only packs matching `--only`. Existing 2,814 cards stay byte-identical (assumed; checked in U5).
- **Loop points.** `loop_search` is enabled for this pack through a named allowlist, not a prefix guess. Loop points are written only where pymusiclooper finds a pair; `loopable` (seam test) is always measured. No loop points means none written.

## Open Questions

### Resolved During Planning

- Run host: the NUC (library, venv, cached CLAP weights). The PC has no copy of the pack.
- Worker cap: `min(--workers, floor(cores/3))`; NUC core count not checked (assumed 8, so 2 workers); the CLI prints the clamp.
- Venv: `scripts/py/audio/.venv/bin/python` (OGM-009), else `scripts/audio/.venv/bin/python`.

### Deferred to Implementation

- Whether `collection_info.hints` exists; if not, hints live in a small file beside `pack.json`.
- Clip format (assumed Ogg Vorbis, mono 22.05 kHz, ~250 KB) and whether the schema's `previews` allows `clip`.
- Clip start: the loudest excerpt start; files under 20 s are used whole.

## Output Structure

Under `assets-local/packs/drive-barbarian-chiptune/`: `collection.card.json` (counts only), `<ver>/analysis/*.analysis.json` (46), `cards/*.card.json` (46). Under `assets-local/private/previews/<h2>/`: 46 `<h16>-waveform.png` and 46 `<h16>-clip.ogg`.

## High-Level Technical Design

*Directional guidance, not implementation specification.*

```
gm packs tag --kind audio --only 'drive-barbarian-chiptune' --json   (NUC; exit 2 without vision-input)
  nice -n 10 analyze.py --json   -> measures, loop search, CLAP embeddings, waveform, 20 s clip, sidecar
  nice -n 10 build_audio_cards.py --json --only ...  -> lift vs whole library, hint boost, fits() gate, cards
  CLI: validate each card (@ogm/contracts + no-model-rights), update counts, emit packs.tag
```

Worker env is scrubbed: `PATH`, `HOME`, `OGM_ASSETS_ROOT`, `GM_EVENTS_FILE`, `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`; no key, no proxy.

## Implementation Units

### U1. `--json` contract on the two audio scripts (shared with OGM-065 U1)

**Goal:** One line per card on stdout, summaries on stderr, exit non-zero on schema failure.

**Files:** Modify `scripts/audio/analyze.py`, `scripts/audio/build_audio_cards.py`; Test `scripts/audio/test_analyze.py`, `scripts/audio/test_build_audio_cards.py`.

**Approach:** `emit_card(path, card)` prints `{"card": <path relative to the assets root>, "status": "measured|tagged", "flags": [...]}` with `flush=True`; `analyze.py` prints `{"file", "status": "analysed|skip|fail"}` as progress. A card failing validation prints `{"card", "status": "invalid", "errors": [...]}` and the script exits 1. If OGM-065 U1 has merged, skip this unit.

**Tests:** `emit_card` writes exactly one stdout line with `card`, `status`, `flags`; summaries go to stderr only; an invalid card gives exit 1 and an `invalid` line naming it.

### U2. Classify the pack as music, private, loop-searched

**Goal:** The pack takes the music path with the right preview prefix.

**Files:** Modify `scripts/audio/analyze.py` (`MUSIC_PACKS`, `PRIVATE_VENDORS`, loop-search condition); Test `scripts/audio/test_analyze.py`.

**Approach:** Add `drive-barbarian-chiptune` to a `MUSIC_PACKS` glob and to a new `LOOP_SEARCH_PACKS` tuple; add `drive-` to `PRIVATE_VENDORS`. No change to measurement code.

**Tests:** `is_music("drive-barbarian-chiptune")` is true and a Kenney SFX pack stays false; a `drive-` waveform key starts `private/previews/`; the existing 40 tests pass.

### U3. Hint seeding and per-group confidence

**Goal:** Hints raise ranking of labels the audio already supports; each label group states its own confidence.

**Files:** Modify `scripts/audio/build_audio_cards.py`; Test `scripts/audio/test_build_audio_cards.py`.

**Approach:** Read hints from the collection card. A pure `apply_hints(lift, names, hints)` returns boosted lift (1.25x on named labels only, never below-1.0 lift). Call it before `pick()`; leave `fits()`, `OPPOSED` and the energy overrule after it. Write `describe.moods|genre|game_fit` provenance with confidence and an `input` string that names the hint when it raised a label. `retro` and any hint with no enum home go to `proposed_tags`.

**Tests:** hint `dark` picks lift 1.2 but not 0.8; `retro` yields `proposed_tags` and no `era`; a boosted `energetic` on a low-energy track is still removed; confidence 0.5 sets `low-confidence`; no hints reproduces today's Sidetrax fixture output.

### U4. 20 s preview clips under `private/previews/`

**Goal:** A short listenable clip per card without opening the WAV.

**Files:** Modify `scripts/audio/analyze.py`; Modify `build_audio_cards.py` (`previews.clip`); schema check in `docs/research/v0.5/schemas/asset-card.schema.json` if `previews.clip` is missing; Test `scripts/audio/test_analyze.py`.

**Approach:** `ffmpeg -ss <start> -t 20 -ac 1 -ar 22050 -c:a libvorbis -q:a 2` from the loudest excerpt start (the existing excerpts), written `.part` then renamed, key `private/previews/<h2>/<h16>-clip.ogg` from the content hash. The prefix rule is U2's. Clip failure sets a `missing-preview` flag and does not stop the batch.

**Tests:** a 46 s fixture yields a 20 s clip and a 12 s fixture 12 s; the key starts `private/previews/`; the card validates with `previews.clip`.

### U5. Run, validate and compare

**Goal:** Produce the 46 cards and prove nothing else changed.

**Approach:** On the NUC run the Overview command, then `validate.mjs` over the pack. Hash all other packs' cards before and after and diff. Also check `--workers 32` is reported as clamped.

### U6. Human calibration review (not a merge gate)

**Goal:** Learn whether the labels and confidences mean anything for chiptune.

**Files:** none committed; sheet written to `private/` and shown locally.

**Approach:** Table of all 46 cards: id, key, BPM, duration, loop yes/no, moods, genre, game_fit, confidence. Kevin listens to the 20 s clips and marks each group agree/disagree. Disagreements become locked human edits (`by: human`, `locked: true`). If agreement on moods is at least 70% (assumed bar), drop `mood-unverified` for this pack only.

## System-Wide Impact

- **Interaction graph:** `gm assets search` returns these tracks for `--kind audio --game-fit combat|boss|dungeon`; low-confidence ranks lower.
- **Sharing:** the pack's licence is unknown and itch-owned, so the collection stays `audience: private`, `redistribution: none`. That implies: (1) clips, waveforms and WAVs live only under `assets-local/` and `private/previews/`, never in artifacts, PRs, issue comments or a shared page; (2) their sha256 values are blocked from game repos (C3 commit check); (3) a game Kevin builds from them cannot be shared or published until he finds the licence terms and records them as a human-set rights change; (4) the calibration table may go in the PR as text, but no audio.
- **Unchanged invariants:** `rights`, `license`, `source` are never written by the tagger; the 2,814 existing cards are not rewritten; locked fields are skipped.
- **State lifecycle:** sidecars skip on equal sha256; cards write `.part` then rename; a crash leaves earlier cards untouched.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| CLAP (trained on real audio) hears chiptune as "electronic" or "video game" and mis-ranks moods | Lift against the library, `chiptune` genre from the hint, calibration review, `mood-unverified` stays |
| Hint boost makes everything "dark" | Boost only multiplies a lift already above 1.0 and respects `fits()` and the energy overrule; U3 test; review counts how many cards got each hinted mood |
| `pack_genre` / hints conflict with C3's "pack names never reach the tagger" | Hints come from the intake-stored collection card, recorded in provenance as `by: collection`; C3 line to be reworded (Documentation) |
| Dependency: OGM-064 (draft cards, collection card) and OGM-065 U1 | If `gm packs tag` is not merged, run the two scripts directly with the same flags |
| Licence turns out restrictive | Nothing leaves the machine; if model analysis is disallowed, delete `describe.*` and embeddings, keep code facts (same fallback as the Sidetrax plan) |

## Documentation / Operational Notes

- C3 music rules: note that collection-stored pack hints may seed labels, with provenance. `local-asset-library.md`: `private/previews/` also holds 20 s clips.
- PR `## Local tests`: pytest count (40 plus new), command output tail, validator result, the 46-row calibration table, which host ran what.

## Acceptance Criteria

- `nice -n 10 gm packs tag --kind audio --only 'drive-barbarian-chiptune' --json` on the NUC exits 0 and prints 46 `measured|tagged` lines; the process list shows `nice` 10 and workers at most cores/3.
- 46 cards, one per WAV, all valid, `no-model-rights` clean; `rights` and `license` byte-identical to before.
- Every card has duration, loudness, tempo and key (key may be absent when `key_strength` is low, as today), with loop points only where found.
- Every card carries `describe.moods`, `genre` (includes `chiptune`) and per-group confidence; any group under 0.6 sets `low-confidence`.
- Every hint-boosted label names the hint in its provenance; `retro` appears only in `proposed_tags`.
- 46 clips of at most 20 s and 46 waveforms exist under `private/previews/`; none under `previews/`.
- Pytest in the audio venv: the existing 40 pass plus the new cases. Other packs' cards are byte-identical.
- No network call, no provider key in the worker env, no spend.
- Calibration table delivered to Kevin; it does not block merge.

## Files Touched

- `scripts/audio/{analyze,build_audio_cards}.py` and their two test files (`scripts/py/audio/*` after OGM-009)
- `docs/research/v0.5/schemas/asset-card.schema.json` (only if `previews.clip` is missing)
- C3 standard and `docs/reference/local-asset-library.md`. `gm packs tag` (OGM-065 U4) is used, not edited; `assets-local/` outputs are not committed.

## Sources & References

- Issue #77 (OGM-065); `docs/plans/ogm-v1-build/tickets/OGM-065.md` and `OGM-065-plan.md`
- `docs/plans/2026-10-27-001-feat-music-library-preprocessing-plan.md`
- C3 standard, audio packs survey, local asset library reference; `scripts/audio/{analyze,build_audio_cards,labels,measure}.py`
