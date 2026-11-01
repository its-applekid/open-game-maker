# OGM-093 plan — gm-verify skill, gm check and gm test gates

## 1. Problem frame

Only deterministic, token-free checks may block a draft (A9 L0–L1); the worker's own eyes on a contact sheet are the visual judge. OGM-090 gives us the browser driver and the report; OGM-022 gives us the hooks. This ticket adds the two gates and rewrites the `gm-verify` skill for a sandboxed worker whose output goes to the build chat.

Requirements trace: R103 → `gm check` (L0 static: typecheck, lint banning `Math.random`/`Date.now` in simulation, hook present) and `gm test` (L1 smoke: boot, 3,600 ticks, state round-trip, HUD still) block; the worker reads the sheet and answers the binary checklist in its PR; no paid judge. AE6 is the acceptance example this ticket makes true.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added; `typescript` is already a dependency); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-verify/SKILL.md` lines 8–31 ("Look"): keep every rule's substance; rewrite each against `gm run`/`gm shot`/`gm perf`; drop lines 33–54 ("Deliver").
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/e2e.mjs` lines 37–55: scripted-input loop (press, `tick`, read probes) → L1's input script.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/site/js/dungeon.js` lines 861–865: what "3,600 ticks without rendering, then one render" means.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §3.2 table: the nondeterminism sources the lint covers and the ones it does not (third-party visual randomness is allowed).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B14-skills/pipeline-and-design.md` §1.2: the defect taxonomy and "verdict first, then typed issues" output order; §2.1: "fix the first new console error before anything else", "treat the screenshots as the source of truth".
- OGM-090's `packages/gm-verify/src/{browser,hooks,capture}.ts` (after merge): `openGame`, `HookDriver`, `stills`.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs`: fixture + negative layout for the gate tests.

## 3. Implementation units

### U1 no-wall-clock-in-sim rule

Goal: a pure function over TypeScript source that finds banned calls in simulation files.
Files: Create `packages/gm-verify/gates/no-wall-clock.ts`, `packages/gm-verify/test/no-wall-clock.test.ts`, `packages/gm-verify/fixtures/sim-bad/src/sim/enemy.ts`, `packages/gm-verify/fixtures/sim-bad/src/render/particles.ts`, `packages/gm-verify/fixtures/sim-ok/src/sim/clock.ts` (header `// gm: nondeterministic ok`).
Approach: `scanFile(path, text): Finding[]` using `ts.createSourceFile` and `ts.forEachChild`; match `PropertyAccessExpression` whose text is `Math.random`, `Date.now`, `performance.now`, and `NewExpression` with expression `Date` and no arguments; `isSimPath(p)` is true unless `p` matches `/src\/(render|ui|audio)\//`; a file whose first 3 lines contain `gm: nondeterministic ok` is skipped. `scanRepo(root)` globs `src/**/*.ts` (no `node_modules`, no `*.spec.ts`).
Interface sketch: `type Finding = { file: string; line: number; col: number; what: 'Math.random' | 'Date.now' | 'performance.now' | 'new Date' }`.
Test scenarios: Given `sim-bad` then exactly one finding at `src/sim/enemy.ts` with the right line; Given the same call in `src/render/` then none; Given the header then none; Given `foo.Math.random()` (not the global) then none.
Execution note: test-first; fixtures are 5 lines each.

### U2 L0 static gate

Goal: `runL0(repo): GateResult` with typecheck, the rule and hook presence.
Files: Create `packages/gm-verify/gates/l0-static.ts`, `packages/gm-verify/gates/index.ts`, `packages/gm-verify/test/l0.test.ts`, `packages/gm-verify/fixtures/no-hooks/` (a `src/main.ts` exporting a `GameModule` whose `mount` never calls the SDK's `installTestHooks`).
Approach: `typecheck` = spawn `tsc --noEmit -p <repo>/tsconfig.json` (the repo's own `tsc` from `node_modules/.bin`, fall back to the workspace's), parse `file(line,col): error TSxxxx` lines into checks (first 20); `no-wall-clock-in-sim` = U1; `hook-present` = static: `src/main.ts` (or the `main` named in `package.json`'s `gm.entry`) imports from `@gm/sdk/test` or calls `installTestHooks(` (OGM-022's export name; refresh at pickup) — detail names the missing import. Assemble `GateResult` with durations.
Test scenarios: Given a repo with a type error then `typecheck` false with `file:line`; Given `no-hooks` then `hook-present` false; Given OGM-024's template (when present) then all three ok.

### U3 L1 smoke gate

Goal: `runL1(repo, opts): GateResult` through a real browser.
Files: Create `packages/gm-verify/gates/l1-smoke.ts`, `packages/gm-verify/test/l1.browser.test.ts`; extend `packages/gm-verify/fixtures/stub-game/index.html` with `restore(save)`, a `?blank` flag and a `?throwAt=100` flag (OGM-090's fixture; this ticket may edit it, same package).
Approach: serve `dist/` (or `--serve <dir>`) on `127.0.0.1:0` with OGM-090's static server; `openGame(url, { viewport: 'phone', tier: 'mobile' })` → `boot` ok when `ready` within 60 s and `console.errors` empty; `ticks`: if `--inputs`, replay `[{ t, action, phase }]` as `inject(ActionFrame)` between `advanceTime` chunks of 1,000 ms, else `advanceTime(60_000)` in six chunks, assert `renderGameToText().tick === 3600 ± 1` and no new console error; `round-trip`: `a = renderGameToText()`, `restore({ saveSchemaVersion: a.state.saveSchemaVersion ?? 1, data: a.state })` via `window.__gm.restore` (OGM-022 exposes `GameInstance.restore` in test builds; detail `unavailable: __gm.restore` when absent), `b = renderGameToText()`, deep-equal `a.state` and `b.state`; `hud-still`: `renderAt(60_000)`, screenshot `shots/hud.png`, decode with Playwright's `page.evaluate` canvas sampling (sample 1,000 pixels of a full-page `toDataURL` is unavailable cross-canvas, so sample the PNG with a 20-line PNG reader via `zlib.inflateSync` over the IDAT) and require stddev > 8 over the 1,000 samples; `promises`: when `promises/*.spec.ts` exist run `vitest run promises` in the repo and map results. Write `report.json` through OGM-090's writer with `probes` from `a.state` and `verdict`.
Interface sketch: `runL1(repo: string, o: { inputs?: string; ticks?: number; serveDir?: string }): Promise<GateResult>`.
Test scenarios: Given the stub then all five checks ok and `tick` is 3600; Given `?blank` then `hud-still` false; Given `?throwAt=100` then `ticks` false with the thrown message; Given no `restore` on `__gm` then `round-trip` false with `unavailable`; Given a `promises/fail.spec.ts` fixture then `promises` false naming the file.
Execution note: characterisation-first against the stub; the real templates (OGM-023/024) are added to the CI matrix when present.

### U4 gm check and gm test commands

Goal: the CLI surface.
Files: Create `packages/gm-cli/src/commands/check/index.ts`, `packages/gm-cli/src/commands/check/static.ts`, `packages/gm-cli/src/commands/check/hooks.ts`, `packages/gm-cli/src/commands/test/index.ts`, `packages/gm-cli/test/{check,test}.test.ts`.
Approach: `gm check` (bare) runs `static` and `hooks`, then `assets` when OGM-062's subcommand is registered (look it up through the scanner's registry; absence is not an error); prints failures only, `file:line message`, one summary line, exit 1 on failure, `--json` prints the `GateResult`; `gm check static|hooks` run one. `gm test [--inputs s.json] [--ticks 3600] [--serve dist] [--json]` runs U3, prints the summary and the report path. Both emit `playtesting` start/end events via OGM-090's helper when `GM_EVENTS_FILE` is set.
Test scenarios: Given `sim-bad` then `gm check` exits 1 and prints one line; Given `--json` then valid `GateResult`; Given `gm test` against the stub then exit 0 and `report.json` exists.

### U5 gm-verify skill rewrite

Goal: ≤80 lines a sandboxed worker can follow.
Files: Create `skills/gm-verify/SKILL.md`.
Approach: front matter (`name`, `description: Use before showing the creator anything visual…`); sections: Look (GPU is default, `gm run --viewport both`, timeline for motion, `--rig follow` draws twice, close-ups via `--inputs` and `--frames`, read each tile and name the worst thing first; never report a visual result you haven't looked at); Check (the binary checklist: blank frame? missing texture/magenta? text cut or unreadable? HUD overlapping play area on phone? placeholder primitive or debug gizmo? entity stuck/teleporting/ice-skating? animation speed mismatch?; answer each yes/no in the PR under `## Verify` with the sheet attached); Gates (`gm check` and `gm test` must be green before `gm run`; "fix the first new console error first"); Budgets (the report's `budgets`; `over` blocks; say which tier); Unchecked (always list `iPhone Safari` and `sound`; add anything you could not run); Rules (bind `127.0.0.1` only; never `0.0.0.0`; one `gm chat post` after every `gm run`; never install anything to verify). No deliver section.
Test scenarios: Given the file then ≤80 lines; grep finds none of `prototypes/`, `clips_page`, `artifact`, `assets-local`.

## 4. Verification

```
pnpm --filter @ogm/gm-verify test
pnpm --filter @ogm/gm-cli test
pnpm -r typecheck && pnpm -r lint
wc -l skills/gm-verify/SKILL.md
# in a scaffolded game (gm new game-2d /tmp/g; pnpm install --offline; pnpm build):
node packages/gm-cli/dist/gm.js check; echo exit=$?
node packages/gm-cli/dist/gm.js test --ticks 3600 --json | jq '.checks[] | {id, ok}'
```
Evidence to paste: the `gm check` output on the `sim-bad` fixture (one line, exit 1), the `gm test` checks JSON (five `ok: true`), Vitest summaries, the line count.

## 5. Deferred to implementation

- Simulation path heuristic: default "everything under `src/` except `render|ui|audio` dirs"; if OGM-020's `GameManifest` maps paths to systems at pickup, use it instead.
- Blank-still threshold: default stddev > 8 over 1,000 samples; tune on the templates.
- `restore` reach: default `window.__gm.restore`; if OGM-022 exposes `window.__gm.instance`, call `instance.restore`.
- Running `promises/*.spec.ts` through the repo's Vitest vs through the gate's: default the repo's (`pnpm exec vitest run promises`).
- Whether `gm test` also runs L0 first: default no (`gm-core`'s done rule orders them).

## 6. Scope boundaries

- Capture, report, semaphore, queue: OGM-090. Hooks, `?capture`, `restore` exposure: OGM-022.
- `gm check assets`: OGM-062. Conformance: OGM-029. Two-client: OGM-055. Replay and promise generation: OGM-096. Chat posting: OGM-081.

## 7. Risks

- `restore` not reachable in test builds at pickup: default `unavailable` detail, never a silent pass; flag OGM-022 in the PR.
- False positives from the AST rule in legitimate render-only code placed under `src/sim/`: default the header comment opt-out, reported in `detail`.
- Template drift: the gate is tested against the stub first; template runs are added as they land.
- Blank-check brittleness on dark scenes: default threshold with an override `--hud-min-stddev`; record the measured value in `detail`.
