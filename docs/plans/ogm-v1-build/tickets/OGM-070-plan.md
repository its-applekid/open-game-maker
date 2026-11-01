# OGM-070 plan — Web app scaffold and Netlify delivery

## 1. Problem frame

There is no web app: the live site is a hand-assembled static folder (`prototypes/studio-v0`) deployed by a 12-line script, with no router, no tests and no SPA fallback. Ten web tickets need one `apps/web` package to land in without touching each other's files. This ticket creates that package with the route table fixed, the screen-module convention that keeps the router untouched, the studio's design tokens, the PWA shell files, and a manual deploy script that preserves the prototype's licensing and caching behaviours.

Requirements trace: **R110** → `apps/web` on Vite + React + TS on the existing Netlify site with SPA fallback, `/api` proxy, `tokens.css`, two-cache `sw.js`, manifest, `window.__ogmHost` behind `?test`. **R113** → the phone rules live in `tokens.css` and `index.html` (safe areas, `svh`, landscape-phone, reduced motion, 64/44 px targets) and the deploy runs the frame-by-frame load check. **R114** → deploys are a script run by hand from this machine; CI never deploys.

Repository conventions (every plan states them): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback (`--use-angle=swiftshader`); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/website/playwright.config.ts`: copy the `webServer` block (preview server on a fixed loopback port, `reuseExistingServer: false`) and the `projects` split; swap `npm run preview` for `pnpm exec vite preview --host 127.0.0.1 --port 43170`.
- `/home/orangekid/github/aiur/website/vite.config.ts`: minimal `defineConfig`; add `server.proxy` and the React plugin.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/sw.js`: copy whole; keep `BUILD`, `CACHE`, `ASSETS`, the `fresh()`/`keep()` pair and the stale-while-revalidate branch.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/deploy.sh` lines 10–12: the `sed` stamp, the `_headers` write and the `netlify deploy --prod --no-build --dir … --site "$(cat .netlify-site-id)"` call.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/loadrec.mjs`: copy the Chromium launch (GPU flags), iPhone viewport, CPU throttle ×4, `recordVideo`, the `__mark` binding and the message logger; replace `createRequire('…/ui-v0/tools/')` with the workspace's `playwright` import.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/index.html` lines 11–20 (`:root`), 128, 137, 166, 319–335, 397, 411, 461–477 (media rules): port into `tokens.css`; do not port component rules.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/site/site.webmanifest`: copy, change `background_color`/`theme_color` to the studio's `#a69b8d` first-paint colour.

## 3. Implementation units

### U1 — Package, Vite, TypeScript, scripts

Goal: `@ogm/web` builds and typechecks inside the OGM-001 workspace.
Files: Create `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/app/App.tsx`, `apps/web/.gitignore` (`dist/`, `public/town/`, `public/art/`, `.netlify/`, `test-results/`).
Approach: `pnpm --filter @ogm/web add react react-dom react-router @tanstack/react-query zustand` and `add -D vite @vitejs/plugin-react typescript vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test`; pin the resolved versions in `package.json` (Vite 7.x, React 19.x, react-router 7.x, TanStack Query 5.x, zustand 5.x, Playwright 1.6x; all above 1k stars). `vite.config.ts`: `plugins: [react()]`, `server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:' + (process.env.OGM_API_PORT ?? '8787'), '/auth': same } }`, `build: { sourcemap: true, target: 'es2022' }`, `define: { __BUILD__: JSON.stringify(Date.now()) }` is not used for the SW (the SW is stamped by `deploy.sh`, see U6). `index.html`: `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`, `<meta name="robots" content="noindex,nofollow">`, apple meta tags, manifest link, favicon links, `<link rel="preload" as="image" href="/town/models/bake/poster-portrait.webp" media="(orientation: portrait)" fetchpriority="high">` and the landscape twin (OGM-071 fills `public/town/`), `<html style="background:#a69b8d">`. `tsconfig.json` extends `../../tsconfig.base.json` with `jsx: react-jsx`, `types: ['vite/client']`.
Interface sketch:
```json
{ "name": "@ogm/web", "private": true, "type": "module",
  "scripts": { "dev": "vite", "build": "tsc --noEmit && vite build", "preview": "vite preview --host 127.0.0.1 --port 43170",
    "test": "vitest run", "typecheck": "tsc --noEmit", "lint": "eslint src e2e tools", "e2e": "playwright test" } }
```
Test scenarios: Given the workspace, when `pnpm --filter @ogm/web build` runs, then `dist/index.html` exists and contains `viewport-fit=cover`. Given `pnpm -r typecheck`, then it passes with the empty app.

### U2 — Route table and screen-module collection

Goal: every path in the T09 route table resolves to a module under `src/routes/<screen>/`, collected without editing the router.
Files: Create `src/app/screen.ts`, `src/app/router.tsx`, `src/app/hashRedirect.ts`, `src/routes/{title,age,signin,connect,games,new,game,join,admin,settings}/route.tsx` (placeholders rendering the screen name in an `<h1>` only), `src/app/router.test.ts`, `src/app/hashRedirect.test.ts`.
Approach: `router.tsx` does `const mods = import.meta.glob<{ route: ScreenRoute }>('../routes/*/route.tsx', { eager: true })`, sorts by path for determinism, maps each `ScreenRoute` to a react-router `RouteObject` (wrapping `auth: 'required'` elements in `<RequireSession>` which, until OGM-072 lands, treats a `null` session as signed out and redirects to `/signin?next=`), and wraps `chrome: 'app'` in `<AppChrome>` (logo slot, FAB slot, chat-dock slot; empty until the owning tickets fill them). `createBrowserRouter`; `hashRedirect.ts` runs before the router mounts: `#library → /games`, `#new → /new`, `history.replaceState`. `game/route.tsx` declares `path: '/g/:gameId'` with children `versions` and `releases`; `admin/route.tsx` declares children `members|invites|budgets|builds|intake`; `connect/route.tsx` declares `/connect/github`.
Interface sketch: as quoted in the ticket's "Contract and invariants" (`ScreenRoute`).
Test scenarios: Given the collected modules, when the test enumerates the table's 16 paths, then `matchRoutes` finds each. Given a temporary fixture module under `src/routes/__fixture__/route.tsx`, when the glob runs, then it appears without a change to `router.tsx` (test writes and deletes the fixture via `vi.mock` of the glob result). Given `location.hash === '#library'`, when `hashRedirect()` runs, then `location.pathname === '/games'` and the hash is cleared. Failure: a module exporting no `route` throws at startup with the file name in the message.
Execution note: test-first; the fixture-collection test must fail against a hard-coded route list.

### U3 — Tokens and app chrome CSS

Goal: `tokens.css` carries the studio look and the phone rules; nothing else is styled yet.
Files: Create `src/tokens.css`, `src/app/chrome.css`; `src/app/tokens.test.ts`.
Approach: port the `:root` block (`--paper`, `--ink`, `--glass`, Gruvbox accents, `--display`, `--body`, `--pop`, `--r`), add `--tap-primary: 64px; --tap-secondary: 44px; --safe-l/r/t/b: env(safe-area-inset-*)`, `html { background: #a69b8d }`, `:focus-visible` outline, `.sr` class, `button { font: inherit }`. Media rules: `(prefers-reduced-motion: reduce)` kills animations and transitions; `(hover: hover) and (pointer: fine)` gates hover affordances; `(orientation: landscape) and (max-height: 540px)` is the landscape-phone block; `(hover: none)` shows meta without hover. Fonts load non-blocking (`media="print" onload`) exactly as `index.html` line 5. Utility classes `.tap-primary { min-width: var(--tap-primary); min-height: var(--tap-primary) }` and `.tap-secondary`.
Test scenarios: Given `tokens.css`, when read as text, then it contains `--tap-primary: 64px`, `prefers-reduced-motion`, `env(safe-area-inset-left`, `svh` and `max-height: 540px` (guards against dropping the phone rules in a restyle).

### U4 — Query client, store, API client base

Goal: one TanStack `QueryClient`, one zustand store with per-screen slices, one fetch wrapper that targets `/api` and `/auth` relative to the page origin.
Files: Create `src/app/query.ts`, `src/app/store.ts`, `src/lib/api/client.ts`, `src/lib/api/client.test.ts`.
Approach: `client.ts` exports `api<T>(path, init?)` that prefixes `/api/v1`, sends `credentials: 'include'`, parses JSON, throws `ApiError { status, body }` on non-2xx (402 bodies are kept intact for OGM-074's offers); `sse(path)` returns an `EventSource` on `/api/v1` + path. `store.ts`: `create<HostStore>()(…)` with `slices` registered by screens via `registerSlice(name, creator)` so no screen edits `store.ts`. `query.ts`: `staleTime: 10_000`, `retry: 1`.
Interface sketch:
```ts
export class ApiError extends Error { constructor(public status: number, public body: unknown) { super(`api ${status}`) } }
export function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>;
export function sse(path: string): EventSource;
```
Test scenarios: Given a mocked `fetch` returning 402 with a body, when `api()` is called, then it rejects with `ApiError.status === 402` and the body intact. Given a 204, then it resolves `undefined`. Given a path without a leading slash, then it throws a programming error.

### U5 — `window.__ogmHost` behind `?test`

Goal: Playwright specs can read the route and screen-registered hooks; production pages expose nothing.
Files: Create `src/app/testHook.ts`, `src/app/testHook.test.ts`.
Approach: `installTestHook(router)` is called from `main.tsx` only when `new URLSearchParams(location.search).has('test')`; it defines the object from the ticket contract and a `Map` registry; `register` throws on duplicate names; `navigate` calls `router.navigate`. Export `registerTestApi(name, api)` for screens, a no-op when the hook is absent.
Test scenarios: Given no `?test`, when the app mounts, then `window.__ogmHost` is undefined. Given `?test`, then `snapshot().route === '/'` and `register('x', {})` then `get('x')` returns it. Given a second `register('x')`, then it throws.

### U6 — PWA shell files and the service worker

Goal: `public/` carries `_redirects`, `_headers`, `site.webmanifest`, icons and the two-cache `sw.js` with inert push handlers.
Files: Create `public/_redirects`, `public/_headers`, `public/site.webmanifest`, `public/sw.js`, `public/icons/*` (copied), `public/favicon.ico` (copied), `src/app/sw-register.ts`, `src/app/netlify.test.ts`, `src/app/sw.test.ts`.
Approach: `_redirects` exactly: `/api/*  https://applekid.tailee0e71.ts.net:8443/api/:splat  200`, `/auth/*  https://applekid.tailee0e71.ts.net:8443/auth/:splat  200`, `/*  /index.html  200`. `_headers`: `/*` → `X-Robots-Tag: noindex, nofollow`; `/sw.js` → `Cache-Control: no-cache`; `/town/*` → `Cache-Control: no-cache`; `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`; `/site.webmanifest` → `Content-Type: application/manifest+json`. `sw.js`: the studio file plus an early return for `/api/` and `/auth/` paths and two handlers: `self.addEventListener('push', e => e.waitUntil(self.registration.showNotification(e.data?.json()?.title ?? 'Open Game Maker', { body, data: { url } })))` and `notificationclick` → `clients.openWindow(url)` (OGM-071 wires the subscription; OGM-016 sends). `sw-register.ts` registers `/sw.js` after `load` in production builds only.
Test scenarios: Given `_redirects`, when parsed line by line, then `/api/*` and `/auth/*` precede `/*` and all three carry status 200. Given `_headers`, then `/sw.js` and `/town/*` are `no-cache` and `/assets/*` immutable. Given `sw.js`, then it contains the literal `__BUILD__` and both cache names.

### U7 — Playwright harness and smoke e2e

Goal: `pnpm --filter @ogm/web e2e` runs against `vite preview` on the GPU flags with the software fallback.
Files: Create `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`, `apps/web/e2e/support/gpu.ts`.
Approach: `gpu.ts` exports `launchArgs()` → `process.env.GM_VERIFY_SOFTWARE_GL === '1' ? ['--use-angle=swiftshader'] : ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist']`; the config's `use.launchOptions.args` uses it; `webServer` runs `pnpm exec vite preview --host 127.0.0.1 --port 43170`; projects `desktop` (Desktop Chrome) and `phone` (`devices['iPhone 13']`, `defaultBrowserType` removed as in `prototypes/ui-v0/tools/e2e.mjs`).
Test scenarios: Given `/?test`, when loaded, then `__ogmHost.snapshot().route === '/'`. Given a direct navigation to `/games?test`, then the preview server serves the SPA and the route is `/games` (fallback works locally). Given `/#new`, then the URL becomes `/new`.

### U8 — Deploy script and phone load recording

Goal: one manual command publishes to the existing site after the frame-by-frame check.
Files: Create `apps/web/tools/deploy.sh`, `apps/web/tools/loadrec.mjs`, `apps/web/.netlify-site-id` (copy of `prototypes/studio-v0/.netlify-site-id`).
Approach: `deploy.sh` (`set -euo pipefail`, never `cd`): `pnpm --filter @ogm/web build`; `D=$(mktemp -d)`; `cp -r apps/web/dist/. "$D"`; `rm -f "$D"/art/packs/synty-*` (E12-12 rule); `sed -i "s/__BUILD__/$(date +%s)/" "$D/sw.js"` then `grep -q __BUILD__ "$D/sw.js" && exit 1`; start `vite preview` on 43171 serving `$D` (`pnpm exec vite preview --outDir "$D"`), run `node apps/web/tools/loadrec.mjs "$D/../loadrec" http://127.0.0.1:43171/ 22`, tile with `ffmpeg -ss 0 -t 3 -i <webm> -vf "fps=12.5,scale=156:-2,tile=10x4" -frames:v 1 sheet.png`, print the sheet path and the `town-ready` time; `--dry-run` stops here; otherwise `netlify deploy --prod --no-build --dir "$D" --site "$(cat apps/web/.netlify-site-id)"`. `loadrec.mjs` imports `chromium` from `playwright` (workspace dependency) and keeps the prototype's throttle, viewport and `__mark` logging.
Test scenarios: Given `bash apps/web/tools/deploy.sh --dry-run`, when run on this machine, then it prints the sheet path and exits 0 without calling `netlify`. Given a `sw.js` whose stamp was not replaced, then the script exits 1 before deploying. (Shell behaviour is verified by the operator; no Vitest.)

## 4. Verification

```
pnpm install
pnpm --filter @ogm/web test            # U2–U6 unit tests
pnpm --filter @ogm/web build
pnpm --filter @ogm/web e2e             # U7; GM_VERIFY_SOFTWARE_GL=1 pnpm --filter @ogm/web e2e as the fallback
pnpm -r typecheck && pnpm -r lint
bash apps/web/tools/deploy.sh --dry-run   # prints <tmp>/loadrec/sheet.png; open it
```
Paste into `## Local tests`: the Vitest summary (file count, pass count), the Playwright summary per project with the renderer string from `chrome://gpu` if captured, and the dry-run's `town-ready` line (it will read "no town" until OGM-071).

## 5. Deferred to implementation

- Exact pinned versions: whatever `pnpm add` resolves on the day; record them in the PR body.
- ESLint config: reuse OGM-001's root config; add `react-hooks` and `react-refresh` plugins only if OGM-001 did not.
- Whether `RequireSession` reads Better Auth's client (OGM-072) or a stub: default a stub `useSession()` returning `null` in `src/lib/api/session.ts` that OGM-072 replaces in place.
- Dev games origin for a cross-origin iframe in development: default none in this ticket (OGM-075 adds a second port).
- `_redirects` hostname: default the T11 ingress hostname literal; if OGM-006 lands a different one first, change the two lines and the test fixture together.

## 6. Scope boundaries

- No title screen, town bundle, sound, gamepad, notifications permission or bug button: OGM-071.
- No sign-in client or age screen: OGM-072. No real session guard beyond the stub.
- No `docs/ops/netlify-proxy.md`, `trustedOrigins`, cookie attributes: OGM-011. No ingress script: OGM-006.
- No prototype archiving or title-city move: OGM-101.
- No CI deploy step, ever (R114).

## 7. Risks

- **Netlify proxy to a Tailscale Funnel host** may fail TLS or time out on SSE (E11-6 open question). Default: keep the rewrite; long streams use WebSockets per D-ORIGIN; the e2e suite never depends on the proxy.
- **Vite 7 / React 19 version drift** from the research. Default: pin what resolves; both pass the 1k-star rule.
- **`import.meta.glob` ordering** differs across platforms. Default: sort collected paths before building the route tree.
- **Service worker caching a stale `index.html`** after deploy. Default: navigations are network-first (kept from the prototype); `/sw.js` is `no-cache`.
- **The phone load sheet needs a reviewer.** Default: the script prints the path; the operator looks (gm-verify); no automated pass/fail.
