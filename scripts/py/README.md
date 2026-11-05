# Python workers

Long-running product code is TypeScript. Existing tested Python tools live here when their model or host dependencies make a port impractical.

Each worker owns a directory and a pinned `requirements.txt`. `workers.json` is the machine-readable contract for worker locations, virtual environments, test runners, and CI eligibility. Maps deliberately share the audio environment because they use the same model stack.

Run workers with their declared interpreter and isolated mode:

```sh
scripts/py/audio/.venv/bin/python -I scripts/py/audio/analyze.py --help
scripts/py/audio/.venv/bin/python -I scripts/py/maps/tag_maps.py --help
scripts/py/drive-sync/.venv/bin/python -I scripts/py/drive-sync/drive_sync.py status
```

The old `scripts/audio`, `scripts/maps`, and `scripts/drive-sync` paths are compatibility symlinks for frozen prototypes and existing skills. New callers use `scripts/py` paths.

## Game-audio preparation (music packs)

`scripts/py/audio/prepare_game_audio.py` turns one owned music pack into game-ready files with only `ffmpeg` and the standard library: a card per track (duration, measured signal, mood and likely-use suggestions, loop suitability and points), an OGG and an MP3 rendition, one 20-second preview per use group (village, travel, forest, cave, dungeon, combat, boss, victory), and a browsable `README.md`.

```sh
python3 -I scripts/py/audio/prepare_game_audio.py --pack assets-local/packs/<pack>
python3 -I scripts/py/audio/prepare_game_audio.py --pack assets-local/packs/<pack> --validate-only
python3 -I scripts/py/audio/prepare_game_audio.py --processed <folder> --validate-only
```

Output lands in `<pack>/<version>/processed` unless `--output` stages it elsewhere. Mood, likely use, and loop points are suggestions until someone listens: correct them in `processed/curation.json` (set `"auditioned": true` when a track has been heard) and rerun; the run keeps edited values and refreshes everything else. Nothing is uploaded and nothing is spent.

## Carding a library pack (music and sound effects)

`analyze.py` then `build_audio_cards.py` turn a whole pack family into C3 cards. The order is the point: **names first,
then measurements, then the model** (`docs/research/asset-searchability-2026-11-05.md` §5), because a filename and its
folder are free and a CLAP pass is the slowest step in the run.

1. `analyze.py` writes one sidecar per file: name tags (`names_for`), measurements, a CLAP embedding, a waveform and a
   two-second OGG clip. It skips a file whose sidecar already matches its sha256.
2. `build_audio_cards.py` scores labels against those embeddings and writes the cards.
3. `card_coverage.py` reports what the run actually produced, per pack and per field.

```sh
# price the run before starting it: the summary prints secs/file and the hours still to go
scripts/py/audio/.venv/bin/python -I scripts/py/audio/analyze.py --only 'pixabay-music-*' --limit 20
# then the real passes, one family at a time
scripts/py/audio/.venv/bin/python -I scripts/py/audio/analyze.py --only 'pixabay-music-*' --workers 4
scripts/py/audio/.venv/bin/python -I scripts/py/audio/build_audio_cards.py
python3 -I scripts/py/audio/card_coverage.py --packs assets-local/packs
```

- **Music or effect** is decided in `name_tags.is_music`, and only the listed families are music (`sidetrax-*`,
  `kenney-music-*`, `pixabay-music-*`, `abstraction-music-loop-*`, `drive-barbarian-chiptune`). A music pack gets key,
  tempo, meter, sections, energy and **loop points**; an effect pack gets neither. Adding a family means adding it there.
- **Name tags** (`name_tags.py`, standard library only): a UCS CatID becomes `audio.ucs_cat_id` and the subkind, a
  filename minus its variation number becomes `audio.variation_group` when a set really has siblings, and the category
  and descriptive words become `describe.keywords`. A name beats the model wherever it has something to say.
- **Coverage** (`card_coverage.py`, standard library only) prints one row per pack and a totals row for music and for
  effects. `--min 0.9` gates on the fields a card must carry to be searchable and exits 1 naming the pack that is short;
  without `--min` it only reports. A loop pack is additionally held to `audio.loop_points`.

From the repository root:

- `make test` and `make test-py` run the dependency-free drive-sync suite and compile every worker.
- `make test-py-models` runs the audio and maps suites in the audio environment and fails with setup instructions when that environment is absent.
- `make venv-audio` and `make venv-drive-sync` create the two declared environments.
- `make check-workers` verifies every worker directory and requirements file from `workers.json` exists and that each `python` sits under its `venv`.
