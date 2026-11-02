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

`--family` must name a family id from `packages/asset-cards/data/style-families.json`, the registry `gm assets search`
reads. A set id (for example `limezu-modern`) is refused with its family named; sets stay nested under their family.

## Verify a game

```text
gm check [--json]
gm check static [--json]
gm check hooks [--json]
gm test [--inputs <script.json>] [--ticks <count>] [--serve <dir>] [--out <dir>] [--json]
```

`gm check` runs TypeScript, deterministic simulation-source, test-hook, and registered asset gates. Use `static` or
`hooks` to select only that gate group. Failures name `file:line` where available and exit 1; `--json` emits the L0
gate result.

`gm test` serves the built game from `dist/` on `127.0.0.1`, advances 3,600 fixed ticks by default, applies an optional
logical-input script, checks a save-state round trip, writes a HUD still, runs `promises/*.spec.ts`, and writes
`shots/test/report.json`. A failed or unavailable check exits 1. `--serve`, `--ticks`, and `--out` override the defaults;
`--json` emits the L1 gate result and report path.

## Refresh the skill pack

```text
gm skills sync [--check] [--force]
gm skills list
```

## Build chat and checkpoints

```text
gm chat post --job <id> --text "<one line>" [--image <png>]
gm chat post --job <id> --text "<one line>" --clip <mp4> --poster <png>
gm checkpoint open --job <id> --question "<question>" --option <id>=<label> --option <id>=<label> [--media <id>=<chat-message-id>] [--recommend <id>] [--blocking]
gm checkpoint wait <checkpoint-id|decision-id> [--timeout <seconds>]
```

`gm chat post` copies media into `.gm/outbox/media/` and prints the chat message id. `gm checkpoint open` prints
the checkpoint id and the `decision.requested` `emit_event` call the agent must make. `gm checkpoint wait` prints
the selected option id, exits 3 on timeout, and exits 4 when the checkpoint becomes moot.

`sync` installs every platform `gm-*` skill and the vendored engine references under `.claude/skills/`. Relative
links in `.codex/skills/` and `.agents/skills/` make the same skills discoverable to each worker; filesystems without
symlink support receive copies and record `"linkMode": "copy"` in `skills.lock`.

The command preserves an installed file whose hash no longer matches the previous lock. Use `--check` to report any
missing, outdated, or locally edited file without writing; it exits 1 when drift exists. `--force` refreshes locally
edited pack files but still preserves files the pack did not install. `list` prints the discovery names currently
recorded in the lock.

The optional `GM_SKILLS_DIR` path selects a platform skill-pack root. Normal installed use locates the pack beside
`gm-cli`; tests and source checkouts can use the override without network access.

## Agree a scope session

```text
gm scope done --file .gm/scope/<session-id>.json
```

The file must match the agreed-scope schema and its name must match the session id. The command queues
`scope.agreed` in `.gm/outbox/scope.jsonl` for the build-chat relay.

## Build game assets

```text
gm build assets [--tier desktop,mobile,low] [--budget mobile] [--out public/assets] [--ktx2] [--no-cache] [--strict]
```

The command validates `assets.lock.json`, builds content-hashed GLB, WebP, MP3, and font files, then writes
`public/assets/manifest.json` and `public/assets/budget.json`. Models receive tiered geometry and texture limits;
small prop collections that share an embedded texture are combined into a single kit GLB. Sprite and pixel-art
images keep their source dimensions and use lossless WebP encoding.

Generated work is cached under `.gm/cache/assets/`. Use `--no-cache` to rebuild without reading or updating that
cache, `--strict` to stop at the first invalid asset, or `--json` for manifest and budget data on stdout. The selected
`--budget` tier determines the exit status when a limit is exceeded. `--ktx2` requires `toktx`; KTX2 encoding is
reserved for a later release, so V1 builds should omit that flag. Audio builds also require `ffmpeg`.
