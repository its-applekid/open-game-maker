# `gm` command reference

`gm` is the offline-safe command line used inside Game Maker repositories. Run `gm help` for the installed command
list and `gm help <command>` for flags.

## Create a game repository

```text
gm new <game-2d|game-3d|game-multiplayer> <dir> [--family <id>] [--pov <id>]
```

The destination must be empty. The command copies the scaffold-only engine template, records the creation choices in
`gm.lock.json`, writes `AGENTS.md`, and installs the committed skill layout and `skills.lock`. It does not install
packages or add game entities. Install afterward with `pnpm install --offline --frozen-lockfile`.

When `packages/asset-cards/data/style-families.json` is available, `--family` must name one of its ids. Before that
registry ships, the choice is recorded with a warning.

## Refresh the skill pack

```text
gm skills sync [--check] [--force]
gm skills list
```

`sync` installs every platform `gm-*` skill and the vendored engine references under `.claude/skills/`. Relative
links in `.codex/skills/` and `.agents/skills/` make the same skills discoverable to each worker; filesystems without
symlink support receive copies and record `"linkMode": "copy"` in `skills.lock`.

The command preserves an installed file whose hash no longer matches the previous lock. Use `--check` to report any
missing, outdated, or locally edited file without writing; it exits 1 when drift exists. `--force` refreshes locally
edited pack files but still preserves files the pack did not install. `list` prints the discovery names currently
recorded in the lock.

The optional `GM_SKILLS_DIR` path selects a platform skill-pack root. Normal installed use locates the pack beside
`gm-cli`; tests and source checkouts can use the override without network access.
