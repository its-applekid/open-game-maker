# OGM-029 plan — SDK conformance (gm-sdk check)

## 1. Problem frame

Lighter agents will modify games constantly; the conformance suite is the net that catches a broken control, a lossy save, a HUD outside the safe area or a debug adapter leaking into a published bundle before a human or `gm-verify` looks. A4 §10.3 specified nine checks and B7 added two; the hook surface they drive is fixed by D-HOOKS and reachable through `@gm/host`'s `request('test.*')`. The runner must use the GPU this machine has, say which GL it ran on, and run green on both templates so every scaffolded game starts conformant.

Requirements trace:
- R47 → the nine A4 checks plus B7's two as `gm-sdk check`, runnable on this GPU with a SwiftShader fallback.
- D-VERIFY-GPU → GPU flags by default, `GM_VERIFY_SOFTWARE_GL=1` fallback, renderer string in the report, at most 2 concurrent captures.
- R42 (consumed) → checks drive the game only through `GmTestHooks` and the bridge.

## 2. Patterns to follow

- `prototypes/title-city/tools/capture.mjs:17-23`: launch with the GPU flags, `pageerror` exits early, `waitForFunction(__ready)`, draw then screenshot. Port to `src/browser.ts` and `src/session.ts` against `request('test.renderAt')`.
- `prototypes/ui-v0/tools/e2e.mjs:6-12`: SwiftShader launch args, console/pageerror collection, screenshot with timeout. Port the collectors.
- `prototypes/title-city/tools/taptest.mjs:18`: a grid scan through `__tap` → the `hitTest` helper for C7.
- `docs/research/v0.3/A4-engine-sdk-editor.md` §10.3 (line 388): the nine checks, quoted into each module's doc comment; `docs/research/v0.4/B7-editor-sdk-input.md:38`: the two additions.
- `/home/orangekid/github/aiur/packages/aiur-contracts/fixtures/`: one fixture per schema; copy for `conformance.report.v1.json`.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (`--use-gl=angle --use-angle=swiftshader`); the static server binds `127.0.0.1`; secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars without naming the exception (none added; `parseArgs` from Node); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Package, CLI, build and serve

Goal: `gm-sdk check <gameDir> [--previous d] [--out d] [--json] [--software-gl] [--browser chromium|webkit]` builds two kinds and serves them.

Files:
- Create: `packages/sdk-conformance/package.json` (`bin: { "gm-sdk": "./dist/cli.js" }`), `tsconfig.json`, `vitest.config.ts`, `src/cli.ts`, `src/build.ts`, `src/serve.ts`, `src/index.ts`.

Approach: `cli.ts` parses with `node:util` `parseArgs`; `build.ts` runs `pnpm --filter <gameDir package> build` twice with the OGM-022 build-kind env (`GM_BUILD=test`, `GM_BUILD=published`; copy the exact name from `packages/sdk/src/core` at pickup) into `<out>/build-test` and `<out>/build-published` (pass `--outDir` through the template's Vite config or copy `dist/` after each build); `serve.ts` starts `node:http` static servers on `127.0.0.1:0` for each build dir and for the host page, returning the URLs; `index.ts` exports `runConformance(opts): Promise<Report>` used by the CLI and by OGM-093.

Interface sketch:
```
gm-sdk check <gameDir> [--previous <dir>] [--out <dir>] [--json] [--software-gl] [--browser chromium|webkit]
exit 0 all pass/unchecked; 1 any fail; 2 usage or boot failure
```

Test scenarios:
- Given a missing `gameDir` when run then exit 2 with one usage line.
- Given a game dir when `build` runs then two directories exist and each has `index.html`.

### U2. Host page and session

Goal: mount the build through `@gm/host` and expose a typed hook driver.

Files:
- Create: `src/host-page/index.html`, `src/host-page/main.ts` (bundled with Vite into `dist/host-page/`), `src/browser.ts`, `src/session.ts`, `src/session.test.ts`.

Approach: `host-page/main.ts` reads `?game=<url>&build=<kind>&caps=<csv>` and calls `createGameFrame({ container, gamesOrigin: new URL(game).origin, gameId: 'conf', buildId: 'x', build, mode: 'test', playerIndex: 0, capabilities, role: () => 'owner', onReady, onError })`, storing the frame on `window.__conf` (the two servers are different ports, so the origin check is real). `browser.ts`: `launch({ softwareGl })` → `chromium.launch({ args: softwareGl ? SW_FLAGS : GPU_FLAGS })`; `rendererString(page)` from a probe canvas's `WEBGL_debug_renderer_info`; `gl = /SwiftShader/.test(renderer) ? 'software' : 'gpu'`. `session.ts`: `openSession(browser, { hostUrl, gameUrl, build, caps, viewport })` → `{ page, hooks }` where `hooks.advanceTime(ms)` etc. are `page.evaluate(() => window.__conf.request('test.advanceTime', {ms}))`; `applyDesign(doc, patches)` sends `design.apply` and awaits `design.applied`; `restore(save)` sends `save.restore`; `serialize()` requests `save.write` via a test capability or reads `renderGameToText().state` (default: `renderGameToText`, since D-HOOKS makes it the save serializer, E04-2); `screenshot(path)`; `consoleErrors[]`; `close()`.

Interface sketch:
```ts
export interface Session { hooks: GmTestHooksDriver; applyDesign(doc: unknown, patches?: Patch[]): Promise<'live'|'restart-scene'>; restore(s): Promise<void>;
  text(): Promise<RenderText>; info(): Promise<RenderInfo>; screenshot(p: string): Promise<void>; manifest: GameManifest; consoleErrors: string[]; close(): Promise<void> }
```

Test scenarios:
- Given a fake page when `hooks.advanceTime(100)` runs then `request('test.advanceTime', {ms:100})` was evaluated.
- Given a `ready` timeout when opened then the session rejects with `boot-failed` and the console tail.

### U3. Checks C1–C6 (manifest, controls, save, migrate, capabilities, pause)

Goal: the first six A4 checks as pure functions over a `Session`.

Files:
- Create: `src/checks/{types,c01-manifest,c02-controls,c03-save,c04-migrate,c05-capabilities,c06-pause}.ts` and `.test.ts` each; `test/fake-session.ts`.

Approach: `type Check = { id: 'C1'…; name: string; run(ctx: CheckContext): Promise<CheckResult> }`, `CheckContext = { session, openSession(caps, build), manifest, design, previous?, out }`. C1: `GameManifestSchema.safeParse(manifest)`; control ids and palette ids unique; `view` in `ViewId`. C2: `setSeed(1)`; baseline `t0 = text()`; for each control: for each of `min`, `max`, `default` (numbers; for enums every option; for booleans both), `applyDesign(setPath(design, control.path, v))` must resolve; then `applyDesign(design)` and `advanceTime(0)`; `JSON.stringify(text()) === JSON.stringify(t0)` byte-equal, else fail naming the control and the first differing key. C3: `advanceTime(1000)`; `s = text().state`; `restore({saveSchemaVersion, data: s})`; `text().state` deep-equals `s` (≈: numbers within 1e-9). C4: if `<gameDir>/test/fixtures/save.previous.json` exists, `restore(fixture)` must resolve and `text()` must have `saveSchemaVersion === manifest.saveSchemaVersion`; else `unchecked: no-previous-save-fixture`. C5: for each optional capability in `manifest.capabilities.optional`, `openSession(all minus it, 'test')` must reach `ready` and `info().calls > 0`; none optional → `unchecked`. C6: `advanceTime(100)`; `send('lifecycle.pause')`; `t1 = text().tick`; wait two rAF (`page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`) plus 200 ms; `text().tick === t1`; `lifecycle.resume`; wait; `tick` increased.

Test scenarios (fake session scripted per check):
- C1: duplicate control id → fail naming it; valid manifest → pass.
- C2: a control whose apply also changes `state.score` → fail naming `score`; clean controls → pass; a `restart-scene` result is allowed when `text()` still matches.
- C3: a field dropped by restore → fail with the path.
- C4: no fixture → `unchecked`; fixture that throws in migrate → fail.
- C5: a capability whose removal breaks boot → fail naming it.
- C6: tick advancing while paused → fail; frozen → pass.

Execution note: write `fake-session.ts` first as a tiny scripted state machine (`state`, `tick`, `paused`, `applyDesign` hooks) so every check has a good and a bad script.

### U4. Checks C7–C9 (stills, published bundle, override hints)

Goal: the visual, bundle and hint checks.

Files:
- Create: `src/checks/{c07-stills,c08-published,c09-hints}.ts` and tests; `src/safe-area.ts`.

Approach: C7: two sessions, desktop 1280×720 (16:9) and iPad 1024×768 (4:3) with `viewport.safe = {top:24,right:0,bottom:20,left:0}` sent by the host page; `advanceTime(500)`; screenshot each to `<out>/still-desktop.png`, `still-ipad.png`; fail if a still is a single colour (sample 64 pixels through `page.evaluate` on a canvas copy, or `sharp`-free: compare PNG byte entropy > threshold — default the pixel sample via the host page's canvas); for each `text().players[i].screen` (from `worldToScreen`) assert inside the safe rect; `hitTest` at that point true. C8: load `<out>/build-published/index.html` in a session with `build: 'published'`, `capabilities: []`; `page.evaluate(() => typeof window.render_game_to_text === 'undefined' && typeof window.advanceTime === 'undefined' && !('__gm' in window))`; plus `grep` the published JS for `render_game_to_text|__gm` (fail if present; the SDK must tree-shake the adapter behind the build-kind flag); a `test.*` request on the published build must be refused (`error` code `no-test-capability`). C9: when `--previous` is given, read `previous/manifest.json`; every previous control id must be in `manifest.controls` ids, or in some control's `aliases`, or in `manifest.retired`; run `migrateOverride` fixtures from `<gameDir>/test/fixtures/overrides/*.json` (`{from, to, expect}`) through the control's `migrateOverride` (evaluated in the page via `request('test.migrateOverride')` if OGM-022 exposes it, else statically from the manifest's declared mapping); fold a sample override set (every control at `max`) by `setPath` and assert `applyDesign(folded)` twice on two sessions gives byte-equal `text()` (E04 §6 risk 6). No `--previous` → `unchecked: no-previous-build` for the id part, but the determinism part still runs.

Test scenarios:
- C7: a player at screen (0.99, 0.02) with top inset → fail; inside → pass; blank still → fail.
- C8: fake bundle text containing `render_game_to_text` → fail; clean and globals undefined → pass.
- C9: previous id `speed` renamed to `velocity` with no alias → fail; with `aliases: ['speed']` → pass; two sessions disagreeing on `text()` → fail.

### U5. Checks C10–C11 (entity ids, palette and tools) and report

Goal: B7's two checks and the report writer.

Files:
- Create: `src/checks/{c10-entity-ids,c11-palette}.ts`, `src/report.ts`, tests, `fixtures/conformance.report.v1.json`.

Approach: C10: with `--previous`, read `previous/design/*.json` and `<gameDir>/design/*.json`; every entity id in the previous set must exist now or be listed in `manifest.retiredEntities` (or `design/retired.json`; copy the name OGM-020 chose); else `unchecked`. C11: for each `manifest.palette[]` item: `editor.validatePlacement {prefab, pose: template spawn pose}` must answer `ok` or a reason string; apply a design with one entity of that prefab added (host-minted id `conf-<n>`), then `applyDesign(original)`, `text()` byte-equal to the baseline; for each `manifest.tools[]`: its declared target control ids exist (static; the dynamic tool round-trip is deferred, see §5). `report.ts`: assemble `{ sdkProtocol, renderer, gl, game: { dir, manifestId, sdkVersion }, checks, stills, startedAt, durationMs }`, validate with a local Zod schema, write `conformance.json`, print one line per check (`C6 pause-halts  pass  tick frozen for 2 frames`), set the exit code.

Interface sketch:
```ts
export type CheckResult = { id: `C${number}`; name: string; status: 'pass' | 'fail' | 'unchecked'; detail: string; artifacts?: string[] };
export type Report = { sdkProtocol: number; renderer: string; gl: 'gpu' | 'software'; game: { dir: string; manifestId: string; sdkVersion: string }; checks: CheckResult[]; stills: string[]; startedAt: string; durationMs: number };
```

Test scenarios:
- C10: a dropped id with no retirement → fail naming it; retired → pass; no previous → `unchecked`.
- C11: a palette item whose add/revert leaves state → fail; all revert → pass; a tool naming a missing control → fail.
- Report: any `fail` → exit 1; only `unchecked` → exit 0 and the `unchecked` list printed.

### U6. End-to-end spec on the templates

Goal: prove green on both templates, both GL paths, and that `--previous` catches a rename.

Files:
- Create: `test/conformance.spec.ts` (Vitest, long timeout) or `test/conformance.e2e.ts` run by `pnpm --filter @gm/sdk-conformance test:e2e`.

Approach: run `runConformance({ gameDir: 'templates/game-3d', out })` and the 2D template; assert 11 checks, no `fail`, `renderer` matches `/ANGLE \(Intel/` on this host (skip that assertion when `GM_VERIFY_SOFTWARE_GL=1` and assert `gl === 'software'` instead); copy the 3D template's `manifest.json` to a temp dir, rename one control id, run with `--previous` and assert `C9` is `fail`. Templates must already pass `ready` headless (OGM-023/024 outcomes); if a template fails a check, the fix belongs to that template's ticket and is reported, not patched here.

Test scenarios:
- Given `templates/game-3d` when run on GPU then 11 results, none fail, `gl: 'gpu'`.
- Given `templates/game-2d` when run with `GM_VERIFY_SOFTWARE_GL=1` then none fail, `gl: 'software'`.
- Given a renamed control in `--previous` when run then `C9` fails naming the id.

## 4. Verification

```
pnpm --filter @gm/sdk-conformance test
pnpm --filter @gm/sdk-conformance build
pnpm exec gm-sdk check templates/game-3d --out /tmp/conf-3d
pnpm exec gm-sdk check templates/game-2d --out /tmp/conf-2d
GM_VERIFY_SOFTWARE_GL=1 pnpm exec gm-sdk check templates/game-2d --out /tmp/conf-2d-sw
pnpm --filter @gm/sdk-conformance typecheck && pnpm -r lint
```
Paste the Vitest summary (22 good/bad check tests), the three CLI outputs (11 lines each plus the renderer string), and one line showing a check test failing with its assertion removed.

## 5. Deferred to implementation

- Blank-still detection: default sample 64 pixels from the host page's canvas copy; fail when all equal.
- C11 tool round-trip: default static (declared targets exist); the dynamic apply-tool-then-undo waits for the editor's tool protocol (OGM-075) and is listed as `unchecked: tool-dynamic-deferred` in the detail, not silently skipped.
- Safe insets used for C7: default `{24, 0, 20, 0}` desktop and `{24, 0, 20, 0}` iPad; OGM-090 may pass device values.
- Browser choice: default chromium; `--browser webkit` uses the cached `webkit-2311` as a bonus pass and is not required to pass.
- Semaphore: default none until OGM-090's lands; then take it.

## 6. Scope boundaries

- Verify report, stills at phone sizes, clips, budgets, console dedupe: OGM-090.
- `gm check`/`gm test` wrappers and the L0/L1 gates: OGM-093.
- Two-client multiplayer scenario: OGM-055.
- Fold and re-apply semantics: OGM-040, OGM-042.
- Template fixes: OGM-023, OGM-024, OGM-055.

## 7. Risks

- Build-kind flag and global names owned by OGM-022: default copy at pickup; the C8 grep patterns are constants in one file.
- The published build must tree-shake the adapter: default C8 fails loudly and names the file; the fix is OGM-022's.
- Byte-equality of `renderGameToText` across two sessions depends on seeded RNG and no wall-clock reads (R103 lint): default `setSeed(1)` before every comparison; a flake here is a real determinism bug, not test noise.
- GPU contention with concurrent verify jobs: default one browser per run; D-VERIFY-GPU's cap of 2 enforced by OGM-090's semaphore when present.
- Long runtime (two builds, up to ~15 sessions): default reuse one browser, one page per session, and run C5's capability sessions sequentially; target under 3 minutes per template on this host.
