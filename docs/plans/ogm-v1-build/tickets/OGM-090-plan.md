# OGM-090 plan — gm run, gm shot, gm perf and the verify report

## 1. Problem frame

Agents must judge a build by looking at it, and the only working capture code is five throwaway Playwright scripts bound to the title town's hooks. This ticket ports them into `@ogm/gm-verify` and the `gm` CLI on the real GPU, defines the verify report every downstream consumer reads (build chat, admin analytics, repair, the sameness eval), and solves the one new problem: a worker inside a Codex sandbox has no network and no GPU, so its `gm run` must hand off to a host-side runner through the workspace filesystem.

Requirements trace: R102 → `gm run`, `gm shot`, `gm perf` as TS ports on the GPU flags with the renderer string reported, SwiftShader fallback, and a verify report JSON with budgets, rig, clients and `unchecked[]`.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names (this package needs none); no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/prototypes/title-city/tools/capture.mjs`: copy the launch args, the `pageerror`-before-ready exit, the `shot(t)` helper, the `xstack` layout string and the ffmpeg record arguments exactly.
- `/home/orangekid/games/open-game-maker-2000/prototypes/title-city/tools/loadtime.mjs`: copy the iPhone 13 context, `Emulation.setCPUThrottlingRate`, the first/cached loop and the network-vs-service-worker response counting; drop the `.t-scene.on` selector (E10-15).
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/loadrec.mjs`: copy `recordVideo`, `exposeBinding('__mark')` and the timestamped log for `gm perf --record`.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/weight.mjs`: copy the `performance.getEntriesByType('resource')` grouping for bytes by type.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/e2e.mjs` lines 37–55: the input-script shape (logical actions + stepping) for `--inputs`.
- `/home/orangekid/games/open-game-maker-2000/prototypes/title-city/tools/look.mjs`: draw each time twice before a still when `--rig follow`.
- OGM-060's `packages/gm-cli/src/commands/assets/search.ts` (exists once OGM-060 merges): the command module shape the directory scanner expects (`export const command = { name, describe, options, run }`), `--json`, exit codes.
- `/home/orangekid/github/aiur/.claude/skills/aiur-agent/SKILL.md`: not code, but the "evidence first, then verdict" ordering for the report's human summary.

## 3. Implementation units

### U1 Package skeleton and the report contract

Goal: `@ogm/gm-verify` exists with the `VerifyReport` Zod schema and writer.
Files: Create `packages/gm-verify/package.json` (`name: @ogm/gm-verify`, deps `playwright@1.64.1` exact, `zod` as pinned by OGM-004, devDeps `vitest`, `tsx`), `packages/gm-verify/tsconfig.json` (extends `tsconfig.base.json`), `packages/gm-verify/src/index.ts`, `packages/gm-verify/src/report.ts`, `packages/gm-verify/test/report.test.ts`.
Approach: `report.ts` declares `VerifyReportSchema` with every field of the T10 §4 JSON plus `software: boolean`, `error?: string`, `verdict: 'pass' | 'fail' | 'error'`, `startedAt`, `endedAt`, `gmVerifyVersion`; `writeReport(outDir, report)` writes `report.json` and a `summary.txt` (one line per budget and the verdict). `verdictFor(report)` is pure: `fail` if any budget tuple's third element is `over` or any console entry has `level: 'error'`, else `pass`. Emit JSON Schema to `packages/gm-verify/schemas/verify-report.v1.json` with the same tool OGM-004 uses.
Interface sketch:
```ts
export type BudgetTuple = [actual: number, limit: number, status: 'ok' | 'over' | 'unknown'];
export interface VerifyReport { runId: string; jobId?: string; aiurIssue?: number; renderer: string; software: boolean;
  viewport: 'desktop' | 'phone'; tier: Tier; rig?: ViewId; frames: { t: number; path: string }[]; timeline?: string; clip?: string;
  console: { level: 'error' | 'warning'; text: string; count: number }[];
  budgets: Record<'downloadBytes' | 'drawCalls' | 'triangles' | 'textureBytes', BudgetTuple>;
  probes: Record<string, number | string | boolean>; clients: number; unchecked: string[]; verdict: 'pass' | 'fail' | 'error'; error?: string;
  startedAt: string; endedAt: string; gmVerifyVersion: string }
```
Test scenarios: Given the T10 example JSON when parsed then it validates; Given a report without `unchecked` when parsed then it fails; Given one `over` budget when `verdictFor` runs then `fail`; Given only warnings then `pass`.
Execution note: test-first; the schema is the contract OGM-093/096/055 copy.

### U2 Browser launch, renderer detection and the hook driver

Goal: one function opens a game page on the GPU (or SwiftShader when forced or unavailable) and returns typed access to `window.__gm`.
Files: Create `packages/gm-verify/src/browser.ts`, `packages/gm-verify/src/hooks.ts`, `packages/gm-verify/fixtures/stub-game/index.html`, `packages/gm-verify/test/browser.browser.test.ts`.
Approach: `launch({ software })` → `chromium.launch({ args: software ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] })`; `rendererString(page)` evaluates a 6-line WebGL probe (`getExtension('WEBGL_debug_renderer_info')`, `UNMASKED_RENDERER_WEBGL`); `isSoftware(str)` uses the godogen regex. `openGame(url, { viewport, tier })` creates the context (`desktop`: 1440x900; `phone`: 390x844, `deviceScaleFactor: 2`, `isMobile`, `hasTouch`), navigates to `${url}?build=test&capture=1&tier=${tier}`, installs `pageerror` (exit before ready) and `console` listeners, waits `() => window.__gm?.ready` (timeout 180 s). `hooks.ts` wraps `page.evaluate` for each `GmTestHooks` member and the aliases; `renderAt` calls twice when `rig === 'follow'`. `PLAYWRIGHT_BROWSERS_PATH` is honoured; default `~/.cache/ms-playwright`.
Interface sketch: `openGame(url: string, o: { viewport: Viewport; tier: Tier; software?: boolean }): Promise<{ page; hooks: HookDriver; renderer: string; software: boolean; console: ConsoleCollector; close() }>`.
Test scenarios: Given the stub page served on 127.0.0.1 when opened on this host then `renderer` contains `Intel` and `software` is false; Given `GM_VERIFY_SOFTWARE_GL=1` then `software` is true; Given a page that throws before `ready` then `openGame` rejects within 2 s with the message; Given `renderAt(1000)` then `renderGameToText().tick` is 60.
Execution note: the stub page is the fixture for every later unit; keep it to 20 lines.

### U3 Stills, timeline and clip

Goal: `capture.ts` reproduces `capture.mjs` modes against the hook driver.
Files: Create `packages/gm-verify/src/capture.ts`, `packages/gm-verify/test/capture.browser.test.ts`.
Approach: `stills(h, times, outDir)` → `renderAt(t*1000)` then `page.screenshot({ path: outDir/t${t}.png })`; `timeline(h, times, outPng)` → stills into a temp dir then `execFileSync('ffmpeg', [... xstack ... 'scale=1600:-1'])` with the same layout expression as `capture.mjs`; `record(h, seconds, fps=30, outMp4, start=0)` → JPEG frames at quality 92 then `ffmpeg -framerate fps -i f%05d.jpg -vf scale=960:-2 -c:v libx264 -pix_fmt yuv420p -preset slow -crf 27 -movflags +faststart`. Clean temp dirs. Under `software` cap frames at 6 and clips at 5 s.
Interface sketch: `capture(h, { frames?: number[]; timeline?: { from: number; to: number; step: number }; record?: { seconds: number; fps?: number; start?: number }; outDir: string }): Promise<Pick<VerifyReport, 'frames' | 'timeline' | 'clip'>>`.
Test scenarios: Given frames 0,1,2 then three PNGs exist and `t0` differs from `t2` by pixel hash; Given a timeline 0:3:1 then one PNG of width 1600; Given `record 2s` then `ffprobe -show_streams` reports `yuv420p` and `h264` and the moov atom precedes mdat (`+faststart`); Given no ffmpeg on PATH then a refusal error naming ffmpeg and stills still present.

### U4 Console dedupe, budgets, probes and the report assembly

Goal: a run ends in a complete `VerifyReport`.
Files: Create `packages/gm-verify/src/console.ts`, `packages/gm-verify/src/budgets.ts`, `packages/gm-verify/src/run.ts`, `packages/gm-verify/test/{console,budgets}.test.ts`.
Approach: `ConsoleCollector` keys messages by `level + text.slice(0,200)` and counts; `budgets.ts` exports `TIER_BUDGETS: Record<Tier, { downloadBytes; drawCalls; triangles; textureBytes }>` with placeholders `mobile {6_000_000, 250, 300_000, 128e6}`, `desktop {25_000_000, 1_000, 1_500_000, 512e6}`, `low {4_000_000, 150, 150_000, 64e6}` marked "until calibration on Kevin's devices (A9 §3.5)"; `measureBudgets(h, manifestPath)` reads `renderInfo()` for calls/triangles, sums `assets/manifest.json` `files[*].bytes` for the chosen tier (OGM-020 `AssetManifest`; `unknown` when the manifest is absent) and `gpuTexMB` for textureBytes; `probes` come from `renderGameToText().state` top-level booleans/numbers. `run.ts` composes U2–U4, appends `playtesting` start/end lines to `$GM_EVENTS_FILE` when set, writes the report.
Test scenarios: Given the same error 3 times then one entry with `count: 3`; Given triangles 410,000 on mobile then `['over']`; Given no manifest then `downloadBytes` status `unknown` and `unchecked` gains `"download size"`.

### U5 gm perf

Goal: phone-profile load timing and resource weight.
Files: Create `packages/gm-verify/src/perf.ts`, `packages/gm-cli/src/commands/perf/index.ts`, `packages/gm-verify/test/perf.browser.test.ts`.
Approach: port `loadtime.mjs` (`devices['iPhone 13']`, CPU rate from `--cpu`, first then cached, `waitForFunction(() => window.__gm?.ready)`), add `weight.mjs` grouping (`models|audio|images|code|fonts|other` by URL path), add `--record <dir>` from `loadrec.mjs`; output one line per run plus `--json`. Merge into the report as `perf: { firstMs, cachedMs, fromNetwork, fromCache, bytesByType }` (optional field in U1's schema).
Interface sketch: `gm perf [--url] [--device iphone13] [--cpu 4] [--record dir] [--json]`.
Test scenarios: Given the stub page then `firstMs` > 0 and `cachedMs` ≤ `firstMs` + jitter; Given `--cpu 1` vs `--cpu 4` then the throttled run is not faster.

### U6 Semaphore and the host-side queue

Goal: at most two captures on the host; sandboxed callers hand off through the workspace.
Files: Create `packages/gm-verify/src/semaphore.ts`, `packages/gm-verify/src/queue.ts`, `packages/gm-verify/src/serve.ts`, `packages/gm-verify/test/{semaphore,queue}.test.ts`.
Approach: `acquire()` tries `mkdirSync('$XDG_RUNTIME_DIR/ogm-verify/slot-{0,1}')` writing its PID; a slot whose PID is dead is reaped; waits with backoff up to 10 min. Queue: when `GM_VERIFY_QUEUE=1` (set by OGM-037's sandbox policy env) `gm run` writes `.gm/verify/<runId>/request.json` `{ v: 1, cwd: '.', serveDir: 'dist', args: {...} }` and polls for `report.json`; `gm verify serve --workspaces <root>` (host side, `nice 10`) watches `*/.gm/verify/*/request.json` with `fs.watch` plus a 2 s poll, validates `serveDir` resolves inside that workspace, serves it on an ephemeral `127.0.0.1` port with a 30-line static server, runs U4, writes `report.json` and the shots into the same dir. Never reads anything else from the request.
Interface sketch: `gm verify serve --workspaces ~/.local/share/ogm/workspaces` (registered under `run/` as a subcommand `run serve`? no: keep it `gm verify serve` in `packages/gm-cli/src/commands/run/serve.ts`, registered by the scan).
Test scenarios: Given two held slots when a third acquires then it waits until one releases; Given a dead PID in a slot then it is reaped; Given a request with `serveDir: '../..'` then it is refused and `report.json` has `verdict: 'error'`; Given a valid request then `report.json` appears and `frames` paths exist.

### U7 gm run and gm shot commands

Goal: the CLI surface of T10 §4.
Files: Create `packages/gm-cli/src/commands/run/index.ts`, `packages/gm-cli/src/commands/run/serve.ts`, `packages/gm-cli/src/commands/shot/index.ts`, `packages/gm-cli/test/run.test.ts`.
Approach: `run` parses the flags verbatim from the contract, starts a static server for `--url`-less runs on `127.0.0.1:0` serving the game's `dist/` (refuse non-loopback `--url`), runs `both` viewports sequentially under one semaphore slot, prints `shots/report.json` path and the one-line verdict; `--inputs script.json` is `[{ t: 0.5, action: 'jump', phase: 'down' }, ...]` replayed through `inject(ActionFrame)` between `advanceTime` steps. `shot --sheet <dir>` tiles every `*.png` in `dir` (sorted with a numeric comparator, `sort -V` lesson) into `sheet.png` by the U3 timeline tiler.
Test scenarios: Given `gm run` without ffmpeg then exit 2 and the hint; Given `--url http://0.0.0.0:8000` then exit 2 "loopback only"; Given `--inputs` with one `jump` then the stub's `renderGameToText().state.lastAction` is `jump`.

## 4. Verification

```
pnpm --filter @ogm/gm-verify test
pnpm --filter @ogm/gm-cli test
pnpm -r typecheck && pnpm -r lint
# manual, paste output into ## Local tests:
python3 -m http.server 8792 --bind 127.0.0.1 --directory packages/gm-verify/fixtures/stub-game &
node packages/gm-cli/dist/gm.js run --headless --url http://127.0.0.1:8792/ --viewport both --frames 0,1,2 --timeline 0:3:1 --record 2s --out /tmp/shots
node packages/gm-cli/dist/gm.js shot --sheet /tmp/shots/phone
node packages/gm-cli/dist/gm.js perf --url http://127.0.0.1:8792/ --json
ffprobe -v error -show_streams /tmp/shots/phone/run.mp4 | grep -E 'codec_name|pix_fmt'
jq '.renderer,.software,.verdict,.unchecked' /tmp/shots/report.json
```
Evidence to paste: the `renderer` line (must name Intel/ANGLE on this host), the ffprobe lines, the tiled `sheet.png` attached to the PR, Vitest summary with counts.

## 5. Deferred to implementation

- Static server: hand-written `http.createServer` (default) vs `sirv` (3k stars) — default hand-written, 30 lines.
- `--viewport both` ordering: desktop first (default).
- Whether `gm perf` is merged into `report.json` or writes `perf.json` beside it — default: optional `perf` field in the report.
- Budget placeholder numbers — default as in U4; a `budgets.json` override path `--budgets` for the calibration pass.
- Queue transport if OGM-037's sandbox turns out to allow a Unix socket — default stays the filesystem queue.
- Activity event stamping of `aiurRunId`: read `AIUR_TICKET_BRANCH`/`AIUR_HOOK_TICKET_IDENTIFIER` if present (T02 E02-10), else omit.

## 6. Scope boundaries

- Hook semantics, `?capture`, `window.__gm` exposure: OGM-022.
- `gm check` / `gm test` / L0 / L1 / the skill text: OGM-093.
- Two-client scenario: OGM-055. Replay: OGM-096. Chat posting: OGM-081. Build-time download budget: OGM-063.
- systemd unit for `gm verify serve`: OGM-008 (`ops/`).

## 7. Risks

- Sandbox has no GPU (spike S2 unresolved): default is the host-side queue (U6); nothing in this ticket runs Chromium inside the sandbox.
- iGPU contention with two concurrent captures: unmeasured; default semaphore 2, `nice 10`; record run durations in the report so OGM-008's status script can show it.
- `renderAt` exactness depends on OGM-022 honouring `?capture`: default fallback to `advanceTime` deltas with `unchecked: ["exact frame times"]`.
- Phone MP4 playback regressions: keep the exact ffmpeg arguments; the one human check covers it.
