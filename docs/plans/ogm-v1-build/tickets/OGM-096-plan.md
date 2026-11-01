# OGM-096 plan — Repair loop: triage, gm-repair and promise tests

## 1. Problem frame

A player's bug report is the only path where someone other than the creator can cause spend, so everything up to the repair job must be deterministic: replay the bundle, classify, dedupe, and only a reproducible crash becomes a ticket, with a failing promise test the worker must make pass and that then guards the behaviour forever. OGM-015 owns intake and admission; this ticket owns what happens between "admitted as repair" and "worker starts", plus the skill the worker loads.

Requirements trace: R68 → signature dedupe (post-replay), headless replay classification, editor-fix routing payload, repair ticket body and `after_create` diagnostics, `promises/*.spec.ts` generation that then runs forever (through OGM-093's L1), attempts and reservation as config.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1` (this worker binds nothing); secrets only from `packages/config` names (`OGM_API_URL`, `OGM_REPAIR_TOKEN`); no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- OGM-093's `packages/gm-verify/gates/l1-smoke.ts` (after merge): the open → inject → advanceTime loop and `GateResult` assembly; replay is that loop with `setSeed` and `restore` first.
- OGM-090's `packages/gm-verify/src/{browser,hooks}.ts`: never launch Chromium any other way.
- OGM-032's `services/builder/src/events/*` (after merge): a polling worker with backoff, idempotent per record, logging without payloads.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B8-aiur-integration-budgets-bugs.md` §6 "Game route" and "Retry and escalation": the body fields and the attempt-2 rework comment.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §3.2 (tolerances, not hashes) and §5 steps 2–5.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T02-aiur-integration.md` §4 "ticket filing contract": the markers comment `<!-- gm-job:<uuid> gm-ticket:<key> gm-sig:<hash> -->` and the labels.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/e2e.mjs` lines 37–55: logical-action replay.

## 3. Implementation units

### U1 replay.ts

Goal: classify a bundle by replaying it headless.
Files: Create `packages/gm-verify/replay.ts`, `packages/gm-verify/test/replay.browser.test.ts`, extend `packages/gm-verify/fixtures/stub-game/index.html` with `?crashAt=<tick>` and `setSeed`/`restore` behaviour, fixtures `packages/gm-verify/fixtures/bundles/{crash,no-actions,benign}.json`.
Approach: `replay(bundle, { serveDir, wallClockMs })`: validate the bundle (Zod over the A9 shape; `no_keyframe`/`no_actions` reasons short-circuit to `not_reproducible`); `openGame` phone/mobile with `?build=test&capture=1&seed=<seed>`; `setSeed(seed)`; `restore(keyframe)`; walk `actions` sorted by tick: `advanceTime((tick - cur) * 1000/60)`, `inject({ playerIndex: 0, tick, source: 'network', actions: { [action]: phase !== 'up' } })`; after the last action `advanceTime(2_000)`; collect console errors; `final = renderGameToText()`. Class: any error whose normalised text matches a bundle error → `reproduces_with_error`; else if `probes` differ from the bundle's final probes beyond tolerances (numbers ±5%, booleans exact) → `reproduces_no_error` with `reason: 'state_mismatch'`; else `not_reproducible`. Write `replay.json` (`seed, keyframe, actions, expectedError?`) beside the report for the promise generator; `scriptPath` returns it.
Interface sketch: see the ticket's `ReplayResult`.
Test scenarios: Given `crash.json` with `?crashAt=11` served then `reproduces_with_error` and `errorsSeen[0]` contains `cannot read`; Given `no-actions.json` then `not_reproducible` with `no_actions`; Given `benign.json` then `not_reproducible`; Given `wallClockMs: 1000` and a stub that never reaches the tick then `timeout`.
Execution note: characterisation-first against the stub; the SDK templates are exercised in the e2e.

### U2 Worker skeleton and config

Goal: `services/repair` polls the API and runs triage idempotently.
Files: Create `services/repair/package.json` (`@ogm/repair`, scripts incl. `start: node dist/index.js`), `tsconfig.json`, `src/index.ts`, `src/worker.ts`, `src/api.ts`, `src/config.ts`, `repair.config.json`, `test/{config,worker}.test.ts`.
Approach: `config.ts` loads `repair.config.json` (`{ "attempts": 2, "reservationFraction": 0.333, "wallClockMinutes": 10, "pollMs": 5000 }`), defaults with a warning when absent; `api.ts` is a 40-line typed client over OGM-015's routes (`GET /api/v1/internal/reports?status=admitted&route=game_repair,editor_hint`, `POST /api/v1/internal/reports/:id/triage`, `GET /api/v1/blobs/sign?key=`) using `packages/config` for `OGM_API_URL` and `OGM_REPAIR_TOKEN`; `worker.ts` loop: claim → fetch bundle (≤200 KB, else `stored`) → U1 → U3/U4/U5/U6 → write triage; one report at a time; errors logged without payload; `systemd --user` unit text goes to OGM-008's `ops/` as a follow-up line in the PR (not written here).
Test scenarios: Given no config file then defaults and one warning; Given a report already triaged (409 from the API) then skipped without rerunning replay; Given a 300 KB bundle then `stored` with `reason: 'bundle_too_large'`.

### U3 Post-replay dedupe and editor hint

Goal: merge equivalent reproductions; route complaint-only reports to the editor.
Files: Create `services/repair/src/dedupe.ts`, `services/repair/src/editor-hint.ts`, `services/repair/src/keywords.json`, `test/{dedupe,editor-hint}.test.ts`.
Approach: `dedupe`: a replay signature = sha256 of (`errorsSeen[0]` normalised, class, top 3 probe keys that differ); if an open repair job exists for the game with the same replay signature (API lookup) → `dedupedInto`, attach the report, no ticket. `editor-hint`: for `reproduces_no_error` or the API's `editor_hint` route, match `words` (lower-cased, tokenised) against `keywords.json` (`{ "fast": { "suggestion": "decrease", "controls": ["speed", "velocity"] }, "hard": …, "slow": … }`) and the game's `manifest.controls` ids/labels; a match → `editorHint { controlId, suggestion, reason }`; never a job.
Test scenarios: Given two crash bundles with the same error then the second is `dedupedInto`; Given "the enemy is too fast" and a control `enemySpeed` then `decrease`; Given no matching control then no hint and class unchanged.

### U4 Ticket body and rework comment

Goal: the redacted issue text.
Files: Create `services/repair/src/ticket-body.ts`, `test/ticket-body.test.ts`, fixtures with a `words` field containing a name.
Approach: title `Repair: <class> in <release> (<sig8>)`; body sections: one summary line; `## Context` (release, build hash, signature hash, reproduction class, `gm-report:<id>`); `## Load skills` (`gm-repair`, `gm-verify`); `## Acceptance` (`promises/<sig>.spec.ts` passes; `gm check` and `gm test` green; `.gm/changes/<jobId>.md` names the behaviour change); the markers comment from T02 §4; labels `complexity:2`, `feature:gm-<jobId>`, `kind:repair`. The attempt-2 text: a rework comment "Attempt 2 of 2: the promise test still fails: <first assertion line>" (B8 §6). Forbidden-field test: the body must not contain `words`, `screenshot`, `state`, `keyframe`, `actions`, any email or the name fixture.
Test scenarios: Given the crash fixture then the five sections present; Given `words: "I'm Sam"` then `Sam` absent; Given attempt 2 then the comment text.

### U5 Diagnostics for the hook bundle

Goal: the worker's private context.
Files: Create `services/repair/src/diagnostics.ts`, `test/diagnostics.test.ts`.
Approach: write `diagnostics.json` to the blob store (private prefix via the API's signed upload) with: `replay.json` path, errors with source-mapped frames (as supplied by OGM-015; this ticket does not map), probes before/after, the words in a fenced block headed `untrusted creator text`, the screenshot key (not bytes); return `diagnosticsKey`; OGM-036's bundle endpoint includes it as `diagnostics` when the job is a repair.
Test scenarios: Given a triage then the key resolves and the JSON has the fenced block; Given no screenshot then the field is absent.

### U6 Promise test generator

Goal: a failing Vitest spec in the game repo.
Files: Create `services/repair/src/promise-gen.ts`, `services/repair/templates/promise.spec.ts.tmpl`, `test/promise-gen.test.ts`.
Approach: render the template with `sig`, the relative path to `replay.json` (copied into `promises/<sig>.replay.json`), and the assertion: for `reproduces_with_error` → `expect(errors).toEqual([])` after replaying; the spec imports `replay` from `@gm/sdk/test` (OGM-022's pure stepper; if the SDK lacks a replay helper, the template inlines a 10-line loop over `advanceTime`/`inject` against the game's `GameModule` mounted headless with the SDK's test host) and reads the JSON; the file goes into the job's workspace as part of the ticket's first commit by the worker? No: the file is written by OGM-031's filing step? Neither: default is that the worker creates it from `diagnostics.promise` on its first turn (the skill says so), because only the worker has the checkout. The generator therefore outputs `{ path, contents }` into diagnostics.
Test scenarios: Given the crash fixture then the rendered spec, run with Vitest against the stub-backed test host, fails; with `?crashAt` removed it passes.
Execution note: the "fails first, then passes" pair is the gate's heart; keep it in one test.

### U7 gm-repair skill

Goal: `skills/gm-repair/SKILL.md` ≤80 lines.
Files: Create `skills/gm-repair/SKILL.md`, `skill.test.ts`, `package.json`, `tsconfig.json`.
Approach: steps: read `.gm/context/diagnostics.json`; write `promises/<sig>.spec.ts` from it and run `pnpm exec vitest run promises` to see it fail; fix the first new console error first; triage order (reproduce → isolate the system → smallest change → `gm check` → `gm test` → `gm run` → `gm chat post`); the two fixers (`vendor/phaser/v3-to-v4-migration` when Phaser 3 APIs appear; `vendor/threejs/*` "Common Mistakes" for old three); never touch the published release or `design/*.json`; write `.gm/changes/<jobId>.md`; if the defect is in the SDK or platform, raise an aiur attention instead of patching around it (B8 §6 item 4). One router row in `gm-core`.
Test scenarios: OGM-095's lint; ≤80 lines.

## 4. Verification

```
pnpm --filter @ogm/gm-verify test
pnpm --filter @ogm/repair test
pnpm -r typecheck && pnpm -r lint
# e2e on this machine (paste the sequence into the PR):
#  1. plant `throw new TypeError('cannot read vy')` at tick 300 in a draft game's sim; build; play in the host; press the bug button
#  2. curl -s $OGM_API_URL/api/v1/internal/reports?status=admitted | jq '.[0] | {reportId, route}'
#  3. node services/repair/dist/index.js --once   → prints class and ticket title
#  4. gh issue view <n> --repo <game repo> | head -30  → redacted body
#  5. in the worker's PR: promises/<sig>.spec.ts present, `gm test` output shows promises ok
```
Evidence to paste: Vitest summaries, the redacted issue body head, the promise-test fail→pass lines.

## 5. Deferred to implementation

- Triage write-back route: default `POST /api/v1/internal/reports/:id/triage`; if OGM-015 shipped a different name, use it; if none, add `services/api/src/reports/triage.ts` (named conflict-accepted edit).
- Who writes the promise file into the repo: default the worker on its first turn (skill step 2) from `diagnostics.promise`.
- Replay signature fields: default error text + class + differing probe keys.
- `keywords.json` size: default 12 feel words.
- Attempt tracking: default a `repair_attempts` counter on the job row read via the API; attempt 2 is sent as an aiur message through OGM-033's controls.

## 6. Scope boundaries

- Button, bundle upload, signature, route, admission: OGM-071/015. Filing, spend cap, labels: OGM-031. Hook body and bundle endpoint: OGM-036. SDK ring buffer: unowned in V1 (recorded in deferred findings). `promises/` runner: OGM-093. Editor hint UI and application: OGM-075/041.

## 7. Risks

- Bundles arrive without actions until the SDK records them: triage degrades to `not_reproducible: no_actions`, nothing spends; record the gap.
- Nondeterministic games produce `state_mismatch` noise: tolerances by default; the class is still spend-free.
- `after_create` timing on warm workspaces (B8 §8): diagnostics are fetched by the hook, but the skill also tells the worker to run `gm skills sync` and re-read `.gm/context/` if the file is missing.
- Cross-ticket API drift (OGM-015/036/031 shapes): each seam is one small adapter file in `src/api.ts`; refresh at pickup.
