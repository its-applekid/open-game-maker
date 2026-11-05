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

From the repository root:

- `make test` and `make test-py` run the dependency-free drive-sync suite and compile every worker.
- `make test-py-models` runs the audio and maps suites in the audio environment and fails with setup instructions when that environment is absent.
- `make venv-audio` and `make venv-drive-sync` create the two declared environments.
- `make check-workers` verifies every worker directory and requirements file from `workers.json` exists and that each `python` sits under its `venv`.
