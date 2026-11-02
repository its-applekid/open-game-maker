# `gm` command reference

`gm` is the offline-safe command line used inside Game Maker repositories. Run `gm help` for the installed command
list and `gm help <command>` for flags.

## Create a game repository

```text
gm new <game-2d|game-3d|game-multiplayer> <dir> [--family <id>] [--set <id>] [--pov <id>]
```

The destination must be empty. The command copies the scaffold-only engine template, records the creation choices in
`gm.lock.json`, writes `AGENTS.md`, and installs the committed skill layout and `skills.lock`. It does not install
packages or add game entities. Install afterward with `pnpm install --offline --frozen-lockfile`.

`--family` must name a family id from `packages/asset-cards/data/style-families.json`, the registry `gm assets search`
reads. A set id (for example `limezu-modern`) is refused with its family named; sets stay nested under their family.
`--set` must name a set in that registry and, when `--family` is present, belong to the chosen family. It records the
set in `gm.lock.json`, pins the exact `@gm/pack-<set>` version, and installs only that set's `gm-set-<set>` skill.

## Verify a game

```text
gm check [--json]
gm check static [--json]
gm check hooks [--json]
gm test [--inputs <script.json>] [--ticks <count>] [--serve <dir>] [--out <dir>] [--json]
gm run [--inputs <script.json>] [--frames <seconds,...>] [--timeline <from:to:step>] [--out <dir>]
```

`gm check` runs TypeScript, deterministic simulation-source, test-hook, and registered asset gates. Use `static` or
`hooks` to select only that gate group. Failures name `file:line` where available and exit 1; `--json` emits the L0
gate result.

`gm test` serves the built game from `dist/` on `127.0.0.1`, advances 3,600 fixed ticks by default, applies an optional
logical-input script, checks a save-state round trip, writes a HUD still, runs `promises/*.spec.ts`, and writes
`shots/test/report.json`. A failed or unavailable check exits 1. `--serve`, `--ticks`, and `--out` override the defaults;
`--json` emits the L1 gate result and report path.

`gm run` captures deterministic stills, timelines, clips, and browser budgets. It writes `report.json` plus
`state.json` containing the final `renderGameToText()` value when that hook is available; sameness evals use the state
keys without exposing values. Use `gm help run` for viewport, recording, rig, and asset-tier flags. `--record-native`
records the game canvas at its pixel size, scaled up only by a whole-number factor, rendering every frame through the
game's deterministic hook so a clip holds exactly duration x fps frames.

## Refresh the skill pack

```text
gm skills sync [--check] [--force]
gm skills list
```

## Read a mechanic pattern card

```text
gm docs pattern <topic> [--engine phaser|three] [--max 1..3]
gm docs pattern --list [--engine phaser|three]
```

The command reads the installed skills' `references/cards/` directories and prints matching cards verbatim. Topic,
alias, and substring matches are ranked in that order. `--list` shows each topic, engine, aliases, and optional set;
an unknown topic exits 2 with a list hint. Pattern retrieval is offline and never summarizes or rewrites a card.

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

`sync` installs the platform's shared `gm-*` runtime skills, the one `gm-set-<set>` skill recorded in `gm.lock.json`,
and the vendored engine references under `.claude/skills/`. With no recorded set, it installs no set skill.
Workspace-only package metadata, TypeScript config, and skill tests stay in the platform repository. Relative links
in `.codex/skills/` and `.agents/skills/` make the same skills discoverable to each worker; filesystems without symlink
support receive copies and record `"linkMode": "copy"` in `skills.lock`.

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

## Build the game

```text
gm build [--json]
```

Runs `pnpm build` in the game repository, then checks that `dist/` holds `manifest.json` and `design/design.json` and
that both match the `@ogm/contracts` schemas the publisher and API read. The templates' Vite config writes both files
(`@gm/sdk/vite`): the manifest from `src/manifest.ts`, and the design folded from every `design/*.json` (a key defined
in two files fails the build). Exits 1 naming each missing or invalid file.

## Build game assets

```text
gm build assets [--tier desktop,mobile,low] [--budget mobile] [--out public/a] [--ktx2] [--no-cache] [--strict]
```

The command validates `assets.lock.json` and writes GLB, WebP, MP3, and font files to
`public/a/<full-sha256>.<ext>`. Manifest URLs use the matching `/a/…` path so identical outputs are shared across
games and versions. It also writes `public/assets/manifest.json`, `public/assets/cache-plan.json`, and
`public/assets/budget.json`. The cache plan lists each file's size, kind, tier coverage, and ready/stream phase.
Models receive tiered geometry and texture limits; small prop collections that share an embedded texture are
combined into a single kit GLB. Sprite and pixel-art images keep their source dimensions and use lossless WebP
encoding.

Generated work is cached under `.gm/cache/assets/`. Use `--no-cache` to rebuild without reading or updating that
cache, `--strict` to stop at the first invalid asset, or `--json` for manifest and budget data on stdout. The selected
`--budget` tier determines the exit status when a limit is exceeded. `--ktx2` requires `toktx`; KTX2 encoding is
reserved for a later release, so V1 builds should omit that flag. Audio builds also require `ffmpeg`.

## Search the asset library

```text
gm assets search <words...> [--family <id>] [--set <id>] [--kind <kind/subkind>] [--pov <id>] [--use <use>]
```

`--set` restricts results to one exact curated compatibility set, such as `smallscaleint`. Inside a game repository,
the lockfile's family and compatible sets still apply unless the existing `--any-family --reason` escape is used.
