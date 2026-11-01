# OGM-055 plan — gm-multiplayer-ready, multiplayer template, conversion job and two-client verify

## 1. Problem frame

Every game must be multiplayer-shaped from day one (R78) and a watcher must never see private text (R76). Three artefacts make that true for agents: a skill with a checker that fails bad shapes, a template that starts right, and a two-browser scenario that proves the room, the host client and the SDK together. Nothing exists today (E07-11: the skill is listed but absent). This is the last rooms ticket; everything it drives has merged.

Requirements trace:
- R78 → `skills/gm-multiplayer-ready` (eight rules + checker), `templates/game-multiplayer` (two spawns, two HUDs), the conversion recipe ending in the two-client verify.
- R76 → scenario step 3: canary never in any watcher frame; `privateMode` zeroing and path validation exercised on the wire.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/e2e.mjs` (verified): Playwright flow with logical actions through `window.__ogm` hooks and `tick`; copy the step/screenshot rhythm, switch flags to GPU (`.claude/skills/gm-verify/SKILL.md` line 11, verified).
- `skills/gm-core/SKILL.md` and `skills/gm-verify/SKILL.md` (OGM-091, OGM-093, new): skill front matter, ≤ 120-line rule, `references/` convention; copy the heading structure.
- `templates/game-2d/` (OGM-024, new): directory layout, `gm.manifest.json`, `design/` files; copy and add spawns/HUDs.
- `packages/gm-verify/scenarios/*` and `packages/gm-verify/report.ts` (OGM-090, new): scenario registration and the report JSON (`clients`, `probes`, `unchecked[]`, `renderer`).
- `packages/room-protocol/src/grant.ts` (OGM-050): `signGrant` for harness mode; `services/rooms` internal API (OGM-051) for room creation.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for the checker; Playwright on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback for the scenario; every service binds `127.0.0.1` (the scenario's rooms child too); secrets only from `packages/config` names (harness uses a fixture secret by env); no dependency under 1k stars without a named exception (none added; `typescript` for the checker's AST is already in the workspace); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands, results.

## 3. Implementation units

### U1 — Skill, recipe and checker

Goal: the rules agents read and a deterministic check that fails violations.
Files: Create `skills/gm-multiplayer-ready/SKILL.md`, `skills/gm-multiplayer-ready/references/convert-single-to-multiplayer.md`, `skills/gm-multiplayer-ready/scripts/check.ts`; Test `skills/gm-multiplayer-ready/scripts/check.test.ts` with fixtures `skills/gm-multiplayer-ready/scripts/fixtures/{good,bad-singleton,bad-spawns,bad-ids,bad-no-applyinput}/`.
Approach:
- `SKILL.md`: front matter (`name`, `description` naming when to use: any game, conversion jobs, before the two-client verify); the eight rules verbatim (T07 §4.4); a "Host is authoritative" paragraph correcting B14.
- The `gm.net` cheat sheet (role, `localPlayerIndex`, `players`, `onInput`, `sendEvent`), the `MultiplayerHooks` contract, the interpolation convention (`entities[id].p`/`r`), caps (256 B input, 64 KiB snapshot, ≤ 8 axes, ≤ 32 buttons).
- Done rule: `gm check`, `gm test`, `gm run --scenario two-client` green; post a still from the scenario in the build chat (gm-core's show-as-you-go rule).
- `references/convert-single-to-multiplayer.md`: ordered steps with before/after snippets from the prototype loop shape (E07-11) to the template shape; acceptance is the scenario.
- `check.ts` `checkGame(dir)` using the `typescript` compiler API over `src/**/*.ts`: rule 2 → module-scope `player` binding that is not a `Map`; rule 1 → no `applyInput(` declaration, or a raw `keys`/`gamepad` read inside `update|step|tick` outside `applyInput`; rule 3 → `entities[` with a numeric literal or a `++` counter as id; rule 4 → `design/spawns.json` length ≥ `gm.manifest.json.maxPlayers`; rule 6 → `mp.snapshot`/`mp.applySnapshot` present on the exported module; rule 7 → `players.get(` inside the `hud(` body.
- CLI: `node --import tsx scripts/check.ts <dir>` prints findings (`rule`, `file`, `line`, `message`) and exits 1 when any; ambiguous matches go to `notes`, never fail.
Interface sketch:
```ts
export function checkGame(dir: string): { ok: boolean; findings: Finding[]; notes: Finding[] };  // Finding = { rule: 1|2|3|4|6|7; file: string; line?: number; message: string }
```
Test scenarios:
- Given `fixtures/good` (a copy of the template), when checked, then `ok: true` and `findings` is empty.
- Given `bad-singleton` (`let player = {...}` at module scope), when checked, then one finding with `rule: 2` naming the file and line.
- Given `bad-spawns` (one spawn, `maxPlayers: 4`), when checked, then `rule: 4`.
- Given `bad-ids` (`entities[i]` with a counter), when checked, then `rule: 3`.
- Given `bad-no-applyinput`, when checked, then `rule: 1`.
- Given a dir without `gm.manifest.json`, when checked, then it throws a clear error (not a finding).
- Given the CLI on `bad-singleton`, when run, then the exit code is 1 and stdout names rule 2.
Execution note: write the five fixtures first; each must fail on exactly its rule and pass the others.

### U2 — `templates/game-multiplayer`

Goal: a scaffold that starts multiplayer-ready and passes every gate.
Files: Create `templates/game-multiplayer/{gm.manifest.json,design/design.json,design/spawns.json,src/game.ts,src/hud.ts,src/players.ts,README.md}` plus whatever `templates/game-2d` carries (`package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`); registered by directory presence for `gm new` (OGM-091 scans `templates/`).
Approach:
- Copy `templates/game-2d`; `gm.manifest.json` adds `capabilities: ['multiplayer']`, `maxPlayers: 4`, `inputs: [{id:'move', kind:'vector'},{id:'jump', kind:'button'}]`.
- `design/spawns.json`: `[{"id":"spawn-a","x":2,"y":2},{"id":"spawn-b","x":10,"y":2}]`.
- `players.ts`: `players = new Map<number, PlayerState>()`; `applyInput(playerIndex, frame)` moves `p` by `frame.actions.move`; `spawn(index, id)` places at `spawns[index % spawns.length]`.
- `game.ts`: `mount` wires `gm.net.onInput(applyInput)` on the host; `mp.snapshot()` returns `{tick, state:{entities: {[id]: {p, hp}}}}`; `mp.applySnapshot` writes `p`/`hp`; `mp.spawn/despawn` call `players.ts`.
- `hud.ts`: `hud(index)` reads `players.get(index)` only; the two HUD slices are the host's and the peer's `hud(localPlayerIndex)`.
- Grey-box visuals only; no pack assets; `README.md` names the source template commit.
Test scenarios:
- Given `gm new --template game-multiplayer /tmp/mp`, when `gm check && gm test` run, then green and `renderGameToText().players.length === 1` single-player.
- Given the checker on the template, when run, then `ok: true`.
- Given `gm-sdk check` on the template, when run, then every A4/B7 check passes.
- Given the template with two players in a fixture, when `advanceTime(1000)` runs with a `move` frame for index 1, then `players.get(1).p.x` increased and index 0 did not move.

### U3 — Two-client scenario

Goal: the seven T07 §4.5 steps as one runnable with a verify report.
Files: Create `packages/gm-verify/scenarios/two-client.ts`, `packages/gm-verify/scenarios/two-client/harness.html`, `packages/gm-verify/scenarios/two-client/harness.ts`; Test `packages/gm-verify/scenarios/two-client.test.ts` (Vitest, gated by `OGM_SCENARIOS=1`).
Approach:
- `runTwoClient({ gameDir, appUrl?, out, softwareGl? })`: spawn `node services/rooms/dist/main.js` with `OGM_ROOMS_PORT=<free>`, fixture `OGM_WS_TOKEN_SECRET`/`OGM_ROOMS_INTERNAL_SECRET`, `OGM_API_INTERNAL_URL=http://127.0.0.1:<stub>` (a stub capturing the `ended` callback), `OGM_GAMES_ORIGIN=http://127.0.0.1:<static>`, `OGM_ROOMS_TEST_TIMINGS={"ownerReconnectSec":2,"playerReconnectSec":1,"idleDisposeSec":5}`; serve the built game on `<static>`; wait for `/healthz`.
- Mode: `appUrl` given → drive `window.__ogmHost.room` (OGM-053) and OGM-052's routes; else harness: `POST /internal/rooms` → `roomId`, `signGrant` owner and player, open `harness.html?role=…` which builds a room client and the template iframe through `@gm/host`.
- Browser: `chromium.launch({ args: GPU flags })`, or `--use-angle=swiftshader` when `GM_VERIFY_SOFTWARE_GL=1`; two `newContext()`; renderer string read once for the report.
- Steps 1–7 as in OGM-055.md Contract; timings into `probes.welcomeMs`, `probes.playSwitchMs`; a still per step.
- Canary: `randomBytes(18).toString('base64url')`; app mode types it in the build chat; harness mode sends `presence {privateMode:true, focusControlId: canary}` and a `design.tx` patch at `['prompt', canary]`; assert at least one message was sent and none received contains it.
- Report through OGM-090's builder with `clients: 2`, `renderer`, `probes`, `unchecked: ['iPhone Safari','WAN latency', …harness ? ['sign-in'] : []]`; `finally` kills the rooms child and both browsers.
Interface sketch:
```ts
export async function runTwoClient(opts: { gameDir: string; appUrl?: string; out: string; softwareGl?: boolean }): Promise<VerifyReport>;
// CLI: pnpm --filter @ogm/gm-verify scenario two-client --game <dir> [--app http://127.0.0.1:5173/?test] --out shots/mp
```
Test scenarios:
- Given the rooms child is healthy, when host then peer join, then the peer's `welcome` arrives within 2,000 ms (`probes.welcomeMs` recorded).
- Given the host sends three `design.tx` (revs 1–3), when each is applied, then the watcher's `appliedDoc` deep-equals the host's doc at that rev.
- Given the canary was sent through presence and a bad-path patch, when 500 ms pass, then no received message contains it and the send counter is ≥ 2.
- Given the host calls `play()`, when the peer's state changes, then `phase === 'playing'` within 500 ms (`probes.playSwitchMs`).
- Given the peer injects a `move` frame for 60 ticks, when the host's `renderGameToText()` is read, then `players[1].p.x` increased.
- Given the host context closes, when the peer polls, then `pausedForHost` then `ended === 'host-left'` within the shortened window, and the stub received `{reason:'host-left'}`.
- Given a reopened host loads a draft on the static origin, when both report `draft.ready`, then `pin.buildId` changed on both.
- Given `GM_VERIFY_SOFTWARE_GL=1`, when run, then `renderer` contains `SwiftShader` and the run still passes.
- Given the rooms binary is missing, when run, then it fails fast naming the path looked for.
- Given any failure, when the run ends, then no `services/rooms` process from this run remains and both browsers are closed.
Execution note: build step 3 first with the room running and `validateDesignTx` temporarily bypassed locally to confirm the assertion can fail; revert before committing.

## 4. Verification

```
pnpm --filter @ogm/gm-verify build && pnpm --filter @ogm/rooms build
node --import tsx skills/gm-multiplayer-ready/scripts/check.ts templates/game-multiplayer
pnpm --filter @ogm/gm-verify test -- check   # checker fixtures
OGM_SCENARIOS=1 pnpm --filter @ogm/gm-verify test -- two-client
pnpm --filter @ogm/gm-verify scenario two-client --game templates/game-multiplayer --out /tmp/mp-run && cat /tmp/mp-run/report.json
gm new --template game-multiplayer /tmp/mp && gm check --dir /tmp/mp && gm test --dir /tmp/mp
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: the checker output, the report JSON (`probes.welcomeMs`, `probes.playSwitchMs`, `renderer`, `unchecked`), the `gm check`/`gm test` lines, head SHA, base.

## 5. Deferred to implementation

- Checker invocation: default standalone `node --import tsx`; if OGM-093 has a `gm check` plugin registry, register as `--multiplayer` in the same PR and name the extra file touched.
- Harness page implementation: default import OGM-053's `RoomClient` from `apps/web/src/net` through a Vite alias if verify may import the app; else a 60-line `colyseus.js` client in `harness.ts`.
- Step 5 measurement: default compare `players[1].p` before/after; adjust to the template's field if it differs.
- CPU-throttled peer context (T07 §6): default one extra run with CDP `Emulation.setCPUThrottlingRate 4` recorded as `probes.playSwitchMsThrottled`, not asserted.
- `gm check --dir` flag name: whatever OGM-093 shipped; the verification block is refreshed at pickup.

## 6. Scope boundaries

- Room rules: OGM-051. Host client and `window.__ogmHost.room`: OGM-053. SDK net: OGM-054. Invites: OGM-052. Screens: OGM-078. Capture engine and report schema: OGM-090. L0/L1 gates: OGM-093. Scaffold machinery: OGM-091. Conformance: OGM-029.

## 7. Risks

- 500 ms play switch on a loaded host (agents running): default report the measured number and fail only above 500 ms on an idle host; the scenario prints the load average.
- `apps/web` absent at pickup (unlikely at phase 9): harness mode is the default path and always runs; app mode runs when `--app` is given.
- Template drift from `templates/game-2d` changes: default copy at pickup; `README` names the source commit.
- AST heuristics producing false positives: default only unambiguous matches fail (module-scope `player`, missing function); the rest are `notes`.
