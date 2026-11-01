# OGM-009 plan — Python workers convention and CI job

## 1. Problem frame

The only tested production code in the repo is Python (E12-5), and it stays Python because its models have no TypeScript equivalents (E05-13, D-STACK). What is missing is a convention: one place (`scripts/py/`), one `requirements.txt` per tool, one documented interpreter path per tool that the `gm` CLI can read, one `make test`, and a CI job that runs what CI can run (stdlib tests and a byte-compile) while the model suites run on this host. The move must not break the six skills and the prototype tools that cite the old paths, so symlinks stay at the old names.

Requirements trace: R120 → CI runs the venv-free Python tests (`ci-python / python`). R80 → `drive_sync.py` kept; its queue, manifest and `intake.json` are untouched; only its location and the paths in its unit/README change.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/README.md` "Run" and "Tests": the `<venv>/bin/python -I <script>` invocation style; keep verbatim with new paths.
- `/home/orangekid/games/open-game-maker-2000/scripts/audio/requirements.txt` header comment (pins, install line, index URL): the per-tool requirements format.
- `/home/orangekid/github/aiur/.github/workflows/aiur-contracts.yml`: a small path-scoped workflow; copy the shape for `ci-python.yml` (without the path filter, so the check always exists for the merge policy).
- `/home/orangekid/github/aiur/Makefile`: `.PHONY` targets with one-line recipes; same register.

## 3. Implementation units

### U1 Move, symlink, fix path constants

Goal: the workers run from `scripts/py/*` and from the old paths.

Files: Move `scripts/audio` → `scripts/py/audio`, `scripts/maps` → `scripts/py/maps`, `scripts/drive-sync` → `scripts/py/drive-sync`. Create symlinks `scripts/audio`, `scripts/maps`, `scripts/drive-sync`. Modify `scripts/py/audio/build_audio_cards.py` (`HERE`, `REPO`), `scripts/py/audio/test_import.py` (`VALIDATOR`), `scripts/py/maps/tag_maps.py` (`REPO`), `scripts/py/drive-sync/drive_sync.py` and `test_drive_sync.py` (any `Path(__file__)…parents[n]`), `scripts/py/drive-sync/ogm-drive-sync.service` (`ExecStart` paths), `scripts/py/drive-sync/README.md` (commands), `scripts/py/audio/test_build_audio_cards.py` and `scripts/py/maps/test_tag_maps.py` (one `REPO` assertion each).

Approach: `git mv` each directory (the filesystem rename carries `.venv` and `__pycache__`); `ln -s py/audio scripts/audio` etc. and `git add` the links. Then `grep -n "parents\[" scripts/py -r` and fix each: a file at `scripts/py/<tool>/x.py` has `Path(__file__).resolve().parents[0]` = tool dir, `[1]` = `scripts/py`, `[2]` = `scripts`, `[3]` = repo; use `.resolve()` everywhere so running through a symlink still resolves to the real location. `build_audio_cards.py:19` `HERE = Path(__file__).parent` → `Path(__file__).resolve().parent`, `:25` `REPO = HERE.parents[1]` → `HERE.parents[2]`; `tag_maps.py:22` `parents[2]` → `parents[3]`; `test_import.py:10` `Path(__file__).parents[2]` → `Path(__file__).resolve().parents[3]` (if OGM-004 has merged, that line already points at `packages/contracts/bin/validate-cards.mjs`; keep its target, fix only the depth). The unit file: `%h/games/open-game-maker-2000/scripts/py/drive-sync/.venv/bin/python -I %h/games/open-game-maker-2000/scripts/py/drive-sync/drive_sync.py run` and a comment that OGM-002's `ops/systemd/ogm-drive-sync.service` is the installed one.

Test scenarios:
- Given the move, when `python3 -I scripts/py/drive-sync/test_drive_sync.py` runs, then `OK` with 27 tests.
- Given the audio venv, when `scripts/py/audio/.venv/bin/python -I -m pytest scripts/py/audio scripts/py/maps -p no:cacheprovider` runs, then 40 passed.
- Given `test_build_audio_cards.py` with the new assertion `assert (b.REPO / "scripts/py/audio").is_dir()`, when `REPO` is left at `parents[1]`, then it fails; fixed, it passes (same for `test_tag_maps.py` with `t.REPO`).
- Given `scripts/audio/.venv/bin/python -c "import numpy"` through the symlink, then exit 0.
- Given `python3 -I scripts/drive-sync/test_drive_sync.py` through the symlink, then the same 27 OK (the `resolve()` makes `__file__`-relative paths correct either way).

Execution note: add the two `REPO` assertions first and watch them fail at the old depth after the move.

### U2 Convention files

Goal: `README.md`, `maps/requirements.txt`, `workers.json`.

Files: Create `scripts/py/README.md`, `scripts/py/maps/requirements.txt`, `scripts/py/workers.json`.

Approach: `README.md`: the rule (Python only here, where it already works; no new Python without a `decisions.md` entry), the table from `workers.json` (tool, venv, how to create it, which tests, CI or host), the invocation (`<python> -I`), `make` targets, how the `gm` CLI finds interpreters (`workers.json`), the JSONL tagger contract from T05 §4 as the target for OGM-065 (not implemented here). `maps/requirements.txt`: `# scripts/py/maps uses the audio venv (numpy, Pillow, transformers CLIP). No separate venv: see workers.json.` then `-r ../audio/requirements.txt`. `workers.json` as in the ticket.

Test scenarios:
- Given `workers.json`, when `make check-workers` runs, then every `dir` and `requirements` path exists and every `python` path is under a listed `venv` (venv existence is not asserted in CI).

### U3 Makefile

Goal: `make test` for Python; model suites loud when the venv is missing.

Files: Create `Makefile` (root).

Interface sketch:

```make
.PHONY: test test-py test-py-models py-compile check-workers venv-audio venv-drive-sync
export PYTHONDONTWRITEBYTECODE=1
AUDIO_PY := scripts/py/audio/.venv/bin/python
test: test-py
test-py: py-compile check-workers
	python3 -I scripts/py/drive-sync/test_drive_sync.py
py-compile:
	python3 -m compileall -q scripts/py
check-workers:
	python3 -I scripts/py/check_workers.py
test-py-models:
	@test -x $(AUDIO_PY) || { echo "audio venv missing: make venv-audio (network; host only)"; exit 1; }
	$(AUDIO_PY) -I -m pytest scripts/py/audio scripts/py/maps -p no:cacheprovider
venv-audio:
	python3 -m venv scripts/py/audio/.venv && $(AUDIO_PY) -m pip install -r scripts/py/audio/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
venv-drive-sync:
	python3 -m venv scripts/py/drive-sync/.venv && scripts/py/drive-sync/.venv/bin/pip install -r scripts/py/drive-sync/requirements.txt
```

(`scripts/py/check_workers.py`: 15 lines, stdlib, validates `workers.json` paths; it is the "test" for U2.)

Test scenarios:
- Given a clean checkout without venvs, when `make test-py` runs, then exit 0 (27 OK + compile + check-workers).
- Given no audio venv, when `make test-py-models` runs, then exit 1 with the `make venv-audio` hint (loud, not skipped).
- Given a syntax error introduced in `scripts/py/maps/hash_manifest.py`, when `make py-compile` runs, then exit 1 naming the file.

### U4 `ci-python.yml`

Goal: a second workflow with job `python` that always runs.

Files: Create `.github/workflows/ci-python.yml`.

Interface sketch (whole file):

```yaml
name: ci-python
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  python:
    name: python
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: make test-py
```

Test scenarios:
- Given a PR, then two checks appear: `ci / required` and `ci-python / python`; `grep -c 'name: python'` = 1.
- Given `test_drive_sync.py` made to fail, then `ci-python / python` is red while `ci / required` is unaffected.

## 4. Verification

```
make test-py
make test-py-models                      # this host (venv present)
ls -l scripts/audio scripts/maps scripts/drive-sync
python3 -I scripts/drive-sync/test_drive_sync.py -v 2>&1 | tail -3
git status --porcelain | grep -v '^R' | head  # only the new files and the symlinks beyond renames
```

Paste into `## Local tests`: the three test summaries (27 OK, compile clean, 40 passed), the `ls -l` lines showing the symlinks, and the note that the audio venv moved with the directory (`du -sh scripts/py/audio/.venv`).

## 5. Deferred to implementation

- Whether the symlinks are permanent or removed when OGM-091/093 and OGM-101 land: default keep until the last reference is gone; a grep for `scripts/audio|scripts/maps|scripts/drive-sync` outside `scripts/py` is listed in the README as the removal check.
- `compileall` on Python 3.13 vs the runner's 3.13: default pin `3.13` in CI to match the host.
- A `requirements-dev.txt` for pytest: default no; `pytest` is already pinned in the audio requirements.
- `make test` later gaining the TypeScript suite: default no; `pnpm test` stays the TS entry (AGENTS.md).

## 6. Scope boundaries

- `--json` output and `gm packs tag`: OGM-065. Intake service: OGM-064. Unit installation: OGM-002.
- `scripts/assets/*.py`: stay; OGM-064/068 replace. Skills' path references: OGM-091/093.
- `ci.yml` and `.gitignore`: frozen by OGM-001 (both already accommodate this ticket).

## 7. Risks

- OGM-004 edits two of the moved files in the same phase: whichever merges second rebases two small hunks; both tickets say so.
- A fresh clone has no venvs: `make test-py` needs none; model suites are host-only by design (E12-6).
- `git mv` of a directory with a 2+ GB venv is a rename on one filesystem (instant); do not `cp`.
- Symlinks in a git repo on Linux are fine; the Netlify build (OGM-070) never touches `scripts/`.
