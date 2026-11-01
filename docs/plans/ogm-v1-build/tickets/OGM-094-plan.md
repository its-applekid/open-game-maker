# OGM-094 plan — Platformer skill, pattern cards and gm docs pattern

## 1. Problem frame

The first genre skill must give a worker correct, themeless mechanics it can tune from the brief, without feeding it whole games (which anchor output) or filled defaults (which make every game the same). B15 fixed the card format and the retrieval command. This ticket writes four to six platformer cards with tests, the skill that indexes them, and `gm docs pattern`.

Requirements trace: R104 → pattern cards are themeless, 300–800 tokens, with a 3-line `advanceTime` test, fetched by `gm docs pattern` (the `gm new` half of R104 is OGM-091's).

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added; front matter parsed by a 15-line YAML-subset reader or `yaml` 1.3k stars if needed); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B15-open-source-games/reference-builds-and-homogenization.md` §4 rules 1–7: the card contract, copied into the format test.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B14-skills/pipeline-and-design.md` §4.2 "genres: platformer" row: the knob ranges and "derive gravity from height + time".
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/site/js/dungeon.js` lines 858–865: trauma decay and the camera-shake shape for the hit-feedback card (our own code).
- `/home/orangekid/github/aiur/.claude/skills/aiur-agent/SKILL.md`: the "When to use what" table for the skill's card index.
- OGM-091's `packages/gm-cli/src/skills/pack.ts` and OGM-060's command module shape (after merge).
- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-design-loop/SKILL.md` step 4 bullets: the pacing rules ("derive each move's time from its path, never a fixed slot") as a pitfall line.

## 3. Implementation units

### U1 Card front-matter reader and index

Goal: one module lists and reads cards from the pack or a game repo.
Files: Create `packages/gm-cli/src/skills/cards.ts`, `packages/gm-cli/test/cards.test.ts`, `packages/gm-cli/fixtures/cards/{a.md,b.md}`.
Approach: `findCardDirs(root)` → `<pack>/gm-*/references/cards` and, when `cwd` is a game repo, `.claude/skills/*/references/cards`; `parseCard(text)` splits the `---` block and parses the YAML subset used (scalars, arrays of scalars, arrays of flow maps `{ name, range: [a, b], unit, from }`) with a small hand reader (or `yaml` if the subset grows); returns `{ topic, aliases, engine, tunables, license, source, body }`; `index()` returns all cards with their file path; `match(topic, engine?)` ranks exact topic, then alias, then substring.
Interface sketch: `type Card = { file: string; topic: string; aliases: string[]; engine: 'phaser' | 'three' | 'both'; tunables: { name: string; range: [number, number]; unit: string; from: string }[]; license: string; source?: string; body: string }`.
Test scenarios: Given two fixture cards when matched by alias then the right one ranks first; Given `--engine three` then phaser-only cards are excluded; Given a card missing `tunables` then a parse error names the file.

### U2 gm docs pattern

Goal: the command.
Files: Create `packages/gm-cli/src/commands/docs/index.ts`, `packages/gm-cli/src/commands/docs/pattern.ts`, `packages/gm-cli/test/docs-pattern.test.ts`.
Approach: `gm docs pattern <topic> [--engine phaser|three] [--max 3] [--json]` prints each matched card's body verbatim separated by a `---- <file>` line; `--list` prints `topic  engine  aliases` one per line; unknown topic → exit 2, one line, and the three closest topics. Emits no events (reading docs is not an activity).
Test scenarios: Given `pattern jump` then the jump card body appears verbatim (byte equality with the file body); Given `--max 1` with two matches then one; Given `nothing` then exit 2 and suggestions.

### U3 The cards

Goal: four required, two optional cards with tests.
Files: Create under `skills/gm-genre-platformer/references/cards/`: `jump-buffer-coyote.md` + `.test.ts`, `deadzone-camera.md` + `.test.ts`, `one-way-platforms.md` + `.test.ts`, `hit-feedback-tiers.md` + `.test.ts`; optional `variable-jump-height.md`, `corner-correction.md` with tests.
Approach (per card): front matter per the ticket's contract; a `## Pattern` TS snippet (≤40 lines) against `@gm/sdk` types only (`ActionFrame`, a `Body` interface with `x, y, vx, vy, grounded`), pure functions or one small class so the test needs no engine: jump = `JumpController(tunables).update(dtMs, frame, body)` with buffer and coyote timers and gravity derived from `apexSeconds` and `jumpHeight` (`g = 2h/t²`, `v0 = g·t`); deadzone camera = `followDeadzone(cam, target, { deadzoneW, deadzoneH, lerp })`; one-way = `resolveOneWay(body, platform, prevY)` passing from below and `drop` through on down+jump; hit feedback = tiers `light|medium|heavy` mapping to `{ hitStopMs, shakeTrauma, flashMs }` with trauma² decay. `## When to use / When not`, `## No extras` ("this card does not add double jump / score / lives"), `## Tunables` ("pick from the brief's feel words"), `## Test` with the three lines that are also the `.test.ts` body. Sources: ideas and ranges from the vendored gamedev platformer skill (Apache, named in `source`); code written here.
Test scenarios (each is the card's 3-line test): jump: press at t=0, advance 16 ms → `vy < 0`; coyote: leave ground, press within `coyoteMs` → jumps, after it → no jump; buffer: press `jumpBufferMs/2` before landing → jumps on landing; deadzone: target moves 1 px inside the zone → camera unchanged; one-way: body rising through platform → not blocked, falling onto it → blocked; feedback: `heavy` → `hitStopMs` ≥ `medium`'s and trauma decays to 0 within 1 s of `advanceTime`.
Execution note: write each `.test.ts` first from the card's `## Test`; the snippet is done when the three lines pass. `advanceTime` here is `@gm/sdk/test`'s pure stepper (OGM-022); if it is not exported at pickup, a 5-line local `step(obj, ms)` with 1/60 s steps is acceptable and noted.

### U4 Where card tests run

Goal: the card tests run in CI without a new root workspace glob.
Files: Create `skills/gm-genre-platformer/package.json` (`name: @ogm/skill-gm-genre-platformer`, `private`, scripts `test: vitest run references/cards`, devDeps `vitest`, `@gm/sdk: workspace:*`), `skills/gm-genre-platformer/tsconfig.json`.
Approach: R120 names `skills/*` as a workspace glob (OGM-001); if it is absent at pickup, add the line as a named one-line root edit (same precedent as OGM-092's `tools/*`). The package has no `build`; `gm skills sync` copies only `SKILL.md` and `references/` into game repos (OGM-091's installer ignores `package.json`, `tsconfig.json`, `*.test.ts` — confirm the ignore list there; add if missing, one line).
Test scenarios: Given `pnpm -r test` then the four card tests run and pass; Given a game repo after `gm new` then no `*.test.ts` or `package.json` from the skill is present.

### U5 The skill

Goal: `skills/gm-genre-platformer/SKILL.md` ≤60 lines.
Files: Create `skills/gm-genre-platformer/SKILL.md`.
Approach: front matter; "Load when the scope says platformer, side-scroller, jump-and-run"; the loop (feel words → ranges → values written to `src/tunables.ts` as exported data for `gm-editor-tuning` → grey-box level from the template → cards via `gm docs pattern` → `gm run --rig side --viewport both` → `gm chat post`); the card index table; references to open (vendored paths); pitfalls (five lines). No theme words.
Test scenarios: ≤60 lines; the format test's theme blocklist passes; every card file is named in the index.

### U6 Card format test

Goal: one test enforces the contract over every skill.
Files: Create `packages/gm-cli/test/card-format.test.ts` (runs over `skills/*/references/cards/*.md` from the repo root; skipped when the dir is absent, so other packages' CI is unaffected).
Approach: front-matter keys; `range` is `[lo, hi]` with `lo < hi`; token estimate `body.length / 4` in 300–800; fenced languages ⊆ {`ts`}; body contains `## Test`; no blocklisted theme words; `tunables` snippet contains `pick from` and no numeric literal on the `tunables` export lines.
Test scenarios: Given the four cards then pass; Given a fixture card with `jumpBufferMs: 120` filled in then fail naming the line.

## 4. Verification

```
pnpm -r test            # includes @ogm/skill-gm-genre-platformer card tests and @ogm/gm-cli
pnpm -r typecheck && pnpm -r lint
node packages/gm-cli/dist/gm.js docs pattern --list
node packages/gm-cli/dist/gm.js docs pattern jump | head -40
wc -l skills/gm-genre-platformer/SKILL.md
```
Evidence to paste: the `--list` output (4–6 topics), the head of the jump card as printed, Vitest summaries (card tests named), the line count.

## 5. Deferred to implementation

- Two optional cards: default write them if the four take under half the budget.
- YAML reader: default hand-written subset; switch to `yaml` (1.3k stars) if a card needs more.
- Where tunables go in a game: default `src/tunables.ts` exporting a plain object (OGM-095's `gm-editor-tuning` reads it; OGM-097's M5 reads it).
- `advanceTime` source for tests: default `@gm/sdk/test`; fallback local stepper.

## 6. Scope boundaries

- `gm new`, pack install: OGM-091. Vendored references: OGM-092. Other skills' cards: OGM-095. The eval: OGM-097. 2D template: OGM-024.

## 7. Risks

- Cards drift from the SDK API: the card tests import `@gm/sdk` types, so a breaking SDK change fails CI here.
- Over-long cards: the format test caps at 800 tokens.
- Theme leakage through examples: the blocklist test plus review.
- Phaser-specific snippets that cannot be unit-tested without a scene: default keeps snippets engine-agnostic (pure functions over a `Body`), with one "wiring into Phaser" paragraph per card instead of code.
