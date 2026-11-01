# OGM-097 plan — Sameness eval harness

## 1. Problem frame

Every skill change needs an acceptance test beyond "the agent used it": do games built with the skill still differ from each other and from the cards, and do they do only what the brief asked? B15 fixed three cheap per-run metrics (M1 leakage, M4 unasked mechanics, M5 card-default fingerprint) and the skill-creator shape. This ticket builds the runner and the metrics so a skill change can be measured on demand on the signed-in agents, never in CI.

Requirements trace: R105 → the sameness eval (M1, M4, M5) runs on demand before a skill change merges.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback (used through `gm run`); every service binds `127.0.0.1`; secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars without naming the exception (`jscpd` 6.4k stars, MIT); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B15-open-source-games/reference-builds-and-homogenization.md` §5.1 (M1/M4/M5 definitions, thresholds to tune) and §5.2 (brief set, configs, `grading.json`, `benchmark.md`, ship gate, human check).
- OGM-092's `tools/skills/check-api-names.ts` (after merge): script layout, fixtures-first tests, `--json`.
- OGM-091's `gm new` and OGM-093's `gm check`/`gm test`, OGM-090's `gm run --out`: the runner shells out to the built CLI, never imports internals.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/e2e.mjs`: a scripted post-build run (the eval's `gm run --inputs` script is one short jump/move sequence shared by all briefs).
- `/home/orangekid/github/aiur/.claude/skills/aiur-agent/SKILL.md` "complexity-routing" reference (path `references/complexity-routing.md`): how the Codex and Claude CLIs are invoked non-interactively in this fleet; copy the invocation flags.

## 3. Implementation units

### U1 Briefs, configs, checklists, thresholds

Goal: the data the harness runs on.
Files: Create `evals/skills/briefs/{01..12}-<slug>.md`, `evals/skills/evals.json`, `evals/skills/configs/{with_skill,baseline,full_reference}.json`, `evals/skills/checklists/unasked-mechanics.json`, `evals/skills/thresholds.json`, `evals/skills/.gitignore` (`.runs/`), `evals/skills/README.md`.
Approach: 10 briefs of 3–6 sentences, each naming theme, 1–3 mechanics, a feel word and a win condition; genres: platformer ×3 (one near-duplicate pair for M7 later), top-down ×2, puzzle ×2, "no template" ×3 (cooking rhythm, lighthouse keeper, a sorting game); `evals.json` lists `{ id, promptFile, expectedMechanics: [...] }`; configs name the skill dirs to keep (`with_skill`: all; `baseline`: all except `gm-genre-*` and cards; `full_reference`: `with_skill` + `corpusPath` from `OGM_EVAL_CORPUS`, skipped when unset); the checklist: `[{ "id": "double jump", "keys": ["doubleJump", "jumpsLeft"], "grep": ["doubleJump", "double jump"] }, …]` for the eight B15 items; thresholds `{ "m1Pct": 15 }`.
Test scenarios: a test parses every brief and `evals.json` and asserts each brief lists `expectedMechanics` that appear verbatim in its text.

### U2 Runner

Goal: one run = one scratch game built by an agent and verified.
Files: Create `tools/skills/eval.ts`, `tools/skills/eval/runner.ts`, `tools/skills/eval/agent.ts`, `tools/skills/eval.test.ts`; Modify `tools/skills/package.json` (`"eval": "tsx eval.ts"`, `jscpd` devDependency pinned to the current 4.x).
Approach: CLI `eval.ts --config a,b --briefs 01,02 --agent codex|claude --max-parallel 1 --dry-run --confirm --out evals/skills/results/<date>`; refuse without `--confirm` unless `--dry-run`; per run: `mkdir evals/skills/.runs/<date>/<brief>-<config>`; `gm new game-2d <dir>` (platformer/top-down/puzzle) or `game-3d` when the brief says 3D; apply config by deleting skill dirs and their links; `pnpm install --offline`; `agent.ts` invokes `codex exec --sandbox workspace-write -C <dir> "<system line>\n\n<brief>"` or `claude -p --permission-mode acceptEdits --cwd <dir> "<…>"` with a 45-minute timeout, capturing stdout to `agent.log` and usage lines when printed; then `gm check --json`, `gm test --json`, `gm run --headless --viewport phone --inputs evals/skills/inputs/basic.json --frames 60,300 --out <dir>/shots --json`; then U3–U5; write `grading.json` (`EvalRun`) and copy `shots/sheet.png` into `results/`.
Interface sketch: see the ticket's `EvalRun`.
Test scenarios: Given `--dry-run` then a scratch dir exists with the config applied (`baseline` has no `.claude/skills/gm-genre-platformer`) and `grading.json` has `agent: 'skipped'`; Given no flags then exit 2; Given a fake agent script (`--agent fake` points at `tools/skills/fixtures/fake-agent.sh` that copies a canned game) then the full pipeline produces metrics.
Execution note: the fake agent makes the pipeline testable without quota; keep it.

### U3 M1 leakage

Goal: duplicated-token % against cards and corpus, scaffold excluded.
Files: Create `tools/skills/eval/m1.ts`, fixture `tools/skills/fixtures/eval-run/`.
Approach: build the comparison set: every card's fenced `ts` block written to `.runs/<id>/.m1/cards/*.ts`, plus `corpusPath/**/*.ts` when set; produce `fresh/` via `gm new` once per eval; run `jscpd --min-tokens 30 --reporters json --output .m1 <game>/src .m1/cards [corpus]` and keep only clones that pair a game file with a card/corpus file; subtract clones also present when diffing `fresh/src` (scaffold code); `duplicatedPct` = duplicated tokens in game files / total game tokens; `largestClone`.
Test scenarios: Given a fixture game with a verbatim card snippet then `duplicatedPct` > 0 and the clone names the card; Given the fresh scaffold only then 0.

### U4 M4 unasked mechanics

Goal: list extras not in the brief.
Files: Create `tools/skills/eval/m4.ts`.
Approach: keys from the `renderGameToText()` dump (`gm run` writes `state.json`; if absent, call the hooks once via OGM-090's driver), a case-insensitive grep over `src/**` for the checklist's `grep` terms, union by checklist id; subtract ids whose words appear in the brief or `expectedMechanics`; result is the remaining ids.
Test scenarios: Given a dump with `doubleJump` and a brief without it then `['double jump']`; Given the brief says "double jump" then `[]`.

### U5 M5 card-default fingerprint

Goal: count tunables equal to card example values.
Files: Create `tools/skills/eval/m5.ts`.
Approach: load `src/tunables.ts` by transpiling with `typescript` and evaluating in a `vm` context (no imports allowed; if the file imports, fall back to a regex over `name: number` pairs); collect example numbers per card: every numeric literal in the card's `## Test` block and prose lines that mention a tunable name; a tunable counts as equal when its value matches any example for that name (±0); `equalToCardExample / total`.
Test scenarios: the worked example (2 of 3 → fail); a game with values inside ranges but off the examples → 0.

### U6 Report

Goal: `benchmark.md` per date.
Files: Create `tools/skills/eval/report.ts`.
Approach: table per config: brief, gates (✓/✗ ×3), time, tokens, M1 %, M4 count, M5 fraction, passed; a summary row (pass rate, mean M1, total M4, mean M5); a "Ship gate" block comparing with the previous `results/<date>` when present (pass rate not lower; M1 under threshold; M4 zero); links to each `sheet.png`.
Test scenarios: Given two canned `grading.json` sets then the table and the gate verdict render; Given no previous results then "no baseline" is printed, not a crash.

## 4. Verification

```
pnpm --filter @ogm/tools-skills test
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/tools-skills eval -- --dry-run --config baseline --briefs 01
pnpm --filter @ogm/tools-skills eval -- --agent fake --config with_skill,baseline --briefs 01,02 --confirm --out /tmp/eval
cat /tmp/eval/benchmark.md
grep -rn 'eval' .github/workflows | grep -v 'check-api' | wc -l    # must print 0
# with Kevin's go (quota): pnpm --filter @ogm/tools-skills eval -- --agent codex --config with_skill,baseline --briefs 01,02 --confirm
```
Evidence to paste: the fake-agent `benchmark.md`, the CI grep zero, and (if run) the real two-brief table plus the four-game sheet.

## 5. Deferred to implementation

- jscpd invocation (CLI vs API): default CLI with JSON reporter.
- Token capture: default parse the CLI's final usage line when present; else `tokens` absent.
- `full_reference` corpus location: default `OGM_EVAL_CORPUS` env, outside the repo, never committed.
- Whether a failed `gm check` short-circuits metrics: default no (metrics still computed; `passed: false`).
- Brief count beyond 12: default 12 (10 + 2 near-duplicates).

## 6. Scope boundaries

- Cards, skills: OGM-094/095. `gm` commands: OGM-090/091/093. CI: never. M2/M3/M7: later. Corpus of open-source games: operator-provided.

## 7. Risks

- Quota burn: `--confirm` plus the README's cost line; default parallelism 1.
- Agents installing dependencies in scratch repos: Codex sandbox `workspace-write` with network off where the offline store allows; the README says to run on this host where the store exists (OGM-038).
- Metrics that never move (skill-creator's "non-discriminating" warning): the report flags a metric with identical values across all runs.
- Flaky `gm run` under load: one retry; the sheet is advisory.
