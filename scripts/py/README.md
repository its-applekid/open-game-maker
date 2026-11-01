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

From the repository root:

- `make test` and `make test-py` run the dependency-free drive-sync suite and compile every worker.
- `make test-py-models` runs the audio and maps suites in the audio environment and fails with setup instructions when that environment is absent.
- `make venv-audio` and `make venv-drive-sync` create the two declared environments.
- `make check-workers` verifies every worker directory and requirements file from `workers.json` exists and that each `python` sits under its `venv`.
