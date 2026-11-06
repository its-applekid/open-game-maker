# `@ogm/core-bump`

Keeps every instance repository on the latest Game Maker core. One timer tick reads the core repository's branch head,
compares it with the commit each instance repository pins in its own `vendor/core.json`, and — when they differ — runs
that repository's `scripts/bump-core.sh` in a scratch clone and opens a pull request with the result.

The job only opens the pull request. The instance repository's own checks gate the merge, and the job never merges,
approves or force-pushes anything.

## What a tick does

For each `owner/repository` in `OGM_CORE_BUMP_REPOS`:

1. Read the repository's default branch and its `vendor/core.json`.
2. Skip when the pinned `core.sha` is already the core head (`current`), when the file is not there yet (`no-pin`, which
   is what an instance repository looks like before it adopts vendoring), or when a `core-bump/` pull request is already
   open (`pull-open`, so at most one bump waits for review at a time).
3. Otherwise clone `https://github.com/<owner>/<repository>.git` at the default branch into
   `OGM_CORE_BUMP_WORK_DIR`, run `scripts/bump-core.sh <core-sha>`, and check that `vendor/core.json` now pins that
   commit. A run that does not move the pin is an error, not a pull request.
4. Commit as the App's bot user and push `core-bump/<first 12 of the core sha>`. A branch an earlier tick already
   pushed (because opening the pull request failed) is reused instead of pushed again.
5. Open a pull request whose body names both commits.

`vendor/core.json` is the instance repository's file; this job only reads `core.sha` and requires it to be a full
40-character commit id:

```json
{ "core": { "sha": "<40-character commit id>", "ref": "main" } }
```

## Configuration

The unit reads `~/.config/ogm/env/core-bump.env`, and also `~/.config/ogm/env/ogm-commit.env` for the GitHub App
credentials (`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`) so one installation covers
the instance repositories. Create the first file with:

```sh
pnpm --filter @ogm/config exec ogm-env-init core-bump
```

Then fill `OGM_CORE_BUMP_REPOS` (comma-separated `owner/repository`) and `OGM_CORE_BUMP_CORE_REPO`. Sane defaults:
`OGM_CORE_BUMP_CORE_BRANCH=main`, and `OGM_CORE_BUMP_WORK_DIR` is `~/.local/state/ogm/core-bump`. The core repository
must be public: the head commit is read without a token.

```sh
systemctl --user list-timers ogm-core-bump.timer
journalctl --user -u ogm-core-bump -f
systemctl --user start ogm-core-bump        # one tick now
```

A tick the App cannot use, or one where a script fails, exits 1 and names the repository on stdout; the next tick
retries. Clones live under the work directory and are removed and recreated per tick.

## Not in scope

The vendor tarballs in `vendor/` are interim. When the versioned core packages land (#490) this job is replaced by
version bumps of those packages, and the clone-and-script path goes away.
