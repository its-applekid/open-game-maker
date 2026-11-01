# OGM-007 plan — Games origin host

## 1. Problem frame

Untrusted game code must run where it cannot touch the app's session, cookies or other origins: a separate site, locked by CSP, framed with sandbox attributes (R40, B4 §3.5). Without a domain, V1's separate site is one shared origin on this machine's Tailscale hostname, port 10000 (D-GAMES-ORIGIN). The host is a static server with a strict header set and an immutable directory contract that the publisher (OGM-045) writes into and the verify tools (OGM-090) load from. The cross-site Playwright test is the proof that the boundary holds in a real browser.

Requirements trace: R40 → separate-origin sandboxed iframe with origin check (frame-ancestors) and the header set. R69 → a `systemd --user` unit (OGM-002's `ogm-games.service`), loopback bind, Tailscale ingress.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T04-engine-sdk.md` §4 "Consumed from T09": the iframe attributes the test uses verbatim.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B4-sandboxing.md` §6 tests 17–18: the browser-runtime assertions (`parent.document`, outside `fetch` blocked by CSP) to automate.
- `/home/orangekid/games/open-game-maker-2000/prototypes/title-city/tools/capture.mjs` lines 1–15: the Chromium launch flags for the GPU path; copy into `playwright.config.ts` with the `GM_VERIFY_SOFTWARE_GL` switch.
- `/home/orangekid/games/open-game-maker-2000/packages/blob-store/src/serve.ts` (OGM-005, if merged): the "return status/headers/stream, let the framework adapt" style; same here for testability.

## 3. Implementation units

### U1 Layout and ids

Goal: one module that both the host and the publisher use for paths; no caller-controlled segment reaches the filesystem unchecked.

Files: Create `services/games-host/src/layout.ts`. Test `test/layout.test.ts`.

Approach: `ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/`; `isId(s)`; `buildDir(root, gameId, buildId)` throws `BadId` unless both match and returns `path.join(root, gameId, buildId)`; `resolveFile(dir, urlPath)`: split on `/`, reject empty-after-trim, `.`/`..` and any segment with `\0` or `\\`, default `index.html` when the path is empty or ends with `/`, then `fs.realpath` the candidate and require it to start with `realpath(dir) + sep` (symlink escape → null); `isComplete(dir)` checks `.complete`; `markComplete(dir)` opens the directory, `fsync`s it, writes `.complete` with the ISO time, `fsync`s again (publisher's last step).

Interface sketch:

```ts
export const ID_RE: RegExp;
export function buildDir(root: string, gameId: string, buildId: string): string;   // throws BadId
export function resolveFile(dir: string, urlPath: string): Promise<string | null>; // null = not found / escaped
export function isComplete(dir: string): Promise<boolean>;
export function markComplete(dir: string): Promise<void>;
```

Test scenarios:
- Given `buildDir(root,'demo','b1')`, then `<root>/demo/b1`; given `'Demo'`, `'..'`, `'a'.repeat(65)`, then `BadId`.
- Given a build dir with `index.html` and `assets/x.webp`, when `resolveFile(dir,'')`, `'/'`, `'assets/x.webp'` run, then the expected real paths; `'../index.html'`, `'%2e%2e/x'` (decoded by the server first), `'assets/../../x'` → null.
- Given a symlink inside the build pointing at `/etc/hostname`, then `resolveFile` → null.
- Given `markComplete(dir)`, then `isComplete` flips from false to true and `.complete` parses as a date.

### U2 Headers and MIME

Goal: the header matrix as data, tested in isolation.

Files: Create `src/headers.ts`, `src/mime.ts`. Test `test/headers.test.ts`.

Approach: `gameHeaders(appOrigin)` returns the record from the ticket with `frame-ancestors ${appOrigin}` (accept a space-separated list for tests); `healthHeaders()` returns `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`. `mimeFor(ext)` map: `html`→`text/html; charset=utf-8`, `js`/`mjs`→`text/javascript`, `css`, `json`, `wasm`→`application/wasm`, `glb`→`model/gltf-binary`, `gltf`→`model/gltf+json`, `ktx2`→`image/ktx2`, `webp`, `png`, `jpg`, `svg`→`image/svg+xml`, `mp3`→`audio/mpeg`, `ogg`, `wav`, `map`→`application/json`, `txt`, default `application/octet-stream`.

Test scenarios:
- Given `gameHeaders('https://ogm2000.netlify.app')`, then CSP contains `frame-ancestors https://ogm2000.netlify.app` and `default-src 'none'`, and the record has exactly the eight keys of the contract.
- Given `mimeFor('wasm')` → `application/wasm`; `mimeFor('exe')` → `application/octet-stream`.

### U3 Server

Goal: Hono app, loopback bind, `/healthz`, `/g/` streaming with the gates from U1/U2.

Files: Create `src/server.ts`, `src/index.ts`, `src/env.ts`. Test `test/server.test.ts`.

Approach: `createApp({ root, appOrigin, version })` returns a Hono app: `GET /healthz` → `HealthResponse`-shaped JSON (`import { HealthResponse } from '@ogm/contracts'` if OGM-004 is merged, else the literal) with `uptimeSec` from `process.uptime()`; `GET /g/:gameId/:buildId/*`: `buildDir` (BadId → 404), `isComplete` (false → 404), `resolveFile` (null → 404), `stat` (directory → 404), stream with `Readable.toWeb(createReadStream(file))`, headers `gameHeaders` + `Content-Type` + `Content-Length` + `ETag: "<buildId>:<rel>"`; `HEAD` mirrors `GET` without a body; every other route → 404 with `Cache-Control: no-store`. A middleware strips any `Set-Cookie` a future handler might add (defence in depth) and never reads `c.req.header('cookie')`. `index.ts`: `loadEnv('games-host', { OGM_GAMES_PORT: {kind:'port'}, OGM_GAMES_ROOT: {kind:'path'}, OGM_APP_ORIGIN: {kind:'url'} })` (or `env.ts` fallback with the same names), assert bind host is `127.0.0.1` (`OGM_GAMES_BIND` optional, only `127.0.0.1` accepted), `serve({ fetch: app.fetch, hostname: '127.0.0.1', port })`, log one JSON line `{"service":"games-host","port":…,"root":…}`, handle `SIGTERM` by `server.close()`.

Interface sketch:

```ts
export function createApp(opts: { root: string; appOrigin: string; version: string; now?: () => number }): Hono;
// GET /healthz -> 200 {ok:true,service:'games-host',version,uptimeSec}
// GET|HEAD /g/:gameId/:buildId/*  -> 200 file | 404
```

Test scenarios (Vitest with `app.request(...)` against a temp root):
- Given a complete build, when `GET /g/demo/b1/` runs, then 200, `text/html`, all contract headers, body equals `index.html`.
- Given the same request with `Cookie: a=b`, then the response has no `set-cookie` and the handler never touched the header (spy on `c.req.header`).
- Given `GET /g/demo/b1/assets/x.webp`, then `image/webp`, `Content-Length` correct, `Cache-Control … immutable`.
- Given `GET /g/demo/b1/../../etc/passwd` and `%2e%2e` variants, then 404; given a directory path `assets/`, then 404.
- Given `.complete` removed, then 404 for every path of that build; given it restored, 200.
- Given `GET /healthz`, then `ok: true`, `service: 'games-host'`, `Cache-Control: no-store`.
- Given `OGM_GAMES_BIND=0.0.0.0`, when `index.ts` starts, then it exits non-zero with `bind must be 127.0.0.1`.

### U4 Cross-site browser test

Goal: prove the boundary in Chromium: allowed parent frames the build, disallowed parent cannot, no cookies, CSP blocks outside fetch.

Files: Create `playwright.config.ts`, `test/browser/cross-site.spec.ts`, `test/browser/fixtures/demo-build/{index.html,game.js}`, `test/browser/helpers/parent-server.ts`.

Approach: the spec starts (1) the games host on a free loopback port `p2` with `root` = a temp copy of the fixture (marked complete) and `appOrigin = http://127.0.0.1:${p1}`; (2) a tiny `node:http` parent server on `p1` serving `parent.html` that embeds `<iframe id="g" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="autoplay; fullscreen; gamepad; microphone" src="http://127.0.0.1:${p2}/g/demo/b1/index.html?build=draft&protocol=1">`; (3) a third server on `p3` that records hits; (4) a second parent on `p4`. `game.js` writes results to `window.__probe = { cookie: document.cookie, parentDoc: (()=>{try{return !!parent.document}catch{return 'blocked'}})(), fetchOutside: await fetch(`http://127.0.0.1:${p3}/x`).then(()=>'ok',()=>'blocked') }`. Playwright reads `page.frame({ name|url })` and evaluates `__probe`; asserts `cookie === ''`, `parentDoc === 'blocked'`, `fetchOutside === 'blocked'` and `p3` recorded zero hits; for `p4`, asserts a console message containing `frame-ancestors` and that `frame.evaluate` rejects. Config: `use.launchOptions.args` = GPU flags or `['--use-angle=swiftshader']` when `GM_VERIFY_SOFTWARE_GL=1`; `executablePath` from `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when set; `workers: 1`.

Test scenarios:
- Given the allowed parent, when the page loads, then the probe shows the three blocked/empty values and the game rendered (`frame.locator('#ready')` visible).
- Given the disallowed parent, then the iframe does not load the document (CSP `frame-ancestors`).
- Given `GM_VERIFY_SOFTWARE_GL=1`, then the suite passes on a machine without `/dev/dri` (CI).

Execution note: run the Vitest suite first; the browser test last, with `pnpm exec playwright install chromium` once locally if the system Chromium path is not used.

## 4. Verification

```
pnpm --filter @ogm/games-host build && pnpm --filter @ogm/games-host test
pnpm --filter @ogm/games-host typecheck && pnpm --filter @ogm/games-host lint
pnpm --filter @ogm/games-host test:browser                       # GPU flags on this host
GM_VERIFY_SOFTWARE_GL=1 pnpm --filter @ogm/games-host test:browser
OGM_GAMES_PORT=3400 OGM_GAMES_ROOT=$(mktemp -d) OGM_APP_ORIGIN=https://ogm2000.netlify.app node services/games-host/dist/index.js &
curl -sSI http://127.0.0.1:3400/healthz | head -3; curl -sSI http://127.0.0.1:3400/g/x/y/ | head -1   # 200 / 404
```

Paste into `## Local tests`: the Vitest summary, both Playwright summaries (GPU and SwiftShader, with the renderer string if printed), and the two curl status lines.

## 5. Deferred to implementation

- Hono vs plain `node:http`: default Hono (D-API consistency, `/healthz` middleware reuse).
- `ETag` content: default `"<buildId>:<relative path>"` (builds are immutable; a hash is unnecessary).
- `Cross-Origin-Embedder-Policy` for SharedArrayBuffer (Rapier threads): default not set in V1; OGM-023 may ask for `require-corp` and this host adds it then.
- Range requests for media: default supported via Hono's `serveStatic`-style handling only if trivial; otherwise 200 full responses (phones stream MP3 fine).

## 6. Scope boundaries

- Bridge, handshake, hooks: OGM-021/022/028. Publishing builds, draft/published pointer: OGM-045. `gm build` output: OGM-063.
- Ingress on 10000: OGM-006. App CSP `frame-src`: OGM-070. iOS audio/mic device checks: OGM-027/028.

## 7. Risks

- Shared games origin across a family's games: accepted for V1 (E11-7); bridge-only saves limit the blast radius; a domain unlocks per-game subdomains later.
- CSP too strict for a real build (fonts from `data:`, inline scripts emitted by a bundler): the fixture build mirrors OGM-063's planned output; if a later ticket needs a relaxation it edits `headers.ts` with a test.
- Playwright in CI downloads Chromium each run: acceptable; the GPU path runs on this host.
- `frame-ancestors` with `http://127.0.0.1:<port>` origins in tests but `https://ogm2000.netlify.app` in prod: `OGM_APP_ORIGIN` accepts a space-separated list so a dev origin can be added without code.
