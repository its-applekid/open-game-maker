# Client asset cache: research spike (2026-11-02)

Kevin's ask: "add tickets for caching client side so first game has loading screens and subsequent ones load fast.
consider game versions as assets will never differ in the same version. but only need to load new assets for new
versions. i expect most assets and cache should be able to persist over time for a given game, or even assets reused
between games. game version logs should contain all info necessary for intelligent cache and unloading/deleting cache
that's not used anymore."

Grounded in `origin/main` at `ba025cbb` (fetched today) and in the plan pack under
`docs/plans/ogm-v1-build/`.

## Summary: the recommended design in 10 lines

1. A *version* for the cache is a **build** (`buildId`); releases only point at builds (`ReleaseSchema.buildId`). A build is immutable, so its asset set never changes.
2. Asset files move to **one content-addressed URL space on the games origin**, `/a/<sha256>.<ext>`, shared by every build of every game; the build directory keeps only code, `index.html` and manifests.
3. `gm build assets` writes a per-build **cache plan** (`assets/cache-plan.json`): every file's full sha256, bytes, kind, tiers and load phase (`boot` / `ready` / `stream`); the publisher (#283) adds the lineage (previous build, added/removed hashes). This is the "version log" the client plans, shows progress and evicts from.
4. The SDK's loader, **in the game page itself**, diffs the plan against CacheStorage (`gm-blobs-v1`), fetches only the missing `ready` hashes with byte progress, then streams the `stream` phase (music) at low priority.
5. The bridge gains `load.progress` and `load.done`; the play screen shows a title-town glass layer with the game's cover and one progress bar (no text), only if loading takes over 150 ms, and fades it off the top of the live game.
6. The games-origin service worker (already in `packages/host/src/sw/game-cache.ts`, but not served or registered anywhere) becomes a thin cache-first reader for `/a/*` and immutable `/g/<game>/<build>/*`, so code loads from cache too.
7. A client **ledger** (IndexedDB on the games origin) records each played build and its hashes; after each play an idle **planner** under an exclusive Web Lock keeps builds played in the last 30 days, the last played build per game and the 2 newest drafts per game, deletes every unreferenced hash, and enforces a budget of min(1 GB, 25 % of quota).
8. `navigator.storage.persist()` is asked silently; when denied (Safari, Chrome without engagement), the design still works: the HTTP cache and CacheStorage keep things fast until eviction, then the loading screen returns once.
9. Each load reports one OGM-014 analytics event (hit / partial / miss, bytes fetched, ms to ready), so "second load fast" is a number Kevin can see.
10. Server side, blobs live in `$OGM_GAMES_ROOT/_a/` (deduplicated on disk too), are kept while any build with `artifact: 'present'` references them, and rollback works because the old build's plan and blobs are still there.

## What exists today (main)

| Piece | Where | What it does now | Gap for this ask |
|---|---|---|---|
| Games host | `services/games-host/src/server.ts`, `headers.ts`, `layout.ts` (OGM-007, #13) | Serves `/g/<gameId>/<buildId>/<path>` only when `.complete` exists; every 200 gets `Cache-Control: public, max-age=31536000, immutable`, ETag `"<buildId>:<path>"`, CORP `cross-origin`, CSP with `worker-src 'self' blob:`; non-200 is `no-store`; streams files, no compression, no `Range`. Routes: `/healthz`, `/g/*` only. | No shared asset space; does **not serve `/game-cache.js`**, so the worker cannot be registered in production; no `Content-Encoding` (JS/JSON go uncompressed over Funnel); no 206. |
| Build layout contract | OGM-007 "Contract and invariants" | `$OGM_GAMES_ROOT/<gameId>/<buildId>/{index.html, <bundle>.js, assets/manifest.json, assets/<hash>.<ext>, .complete}`; ids match `^[a-z0-9][a-z0-9_-]{0,63}$`. | Ids cannot start with `_`, so `$OGM_GAMES_ROOT/_a/` can never collide with a game. |
| Build writer | none on main; #283 (in progress) | Nothing calls `markComplete` outside games-host yet. | The blob copy belongs in #283's publish step. |
| Games-origin worker | `packages/host/src/sw/game-cache.ts`, `register.ts` (OGM-028, #50) | Network-first for `index.html`, cache-first for `/g/*/*/assets/*` in one `gm-assets` cache **keyed by full URL**, stale-while-revalidate for the rest in `gm-pages`; activate deletes every other cache; `registerGameCache('/game-cache.js', scope '/g/')`. Built by `build:sw` to `dist/game-cache.js`. | Keyed by URL that contains `<gameId>/<buildId>`, so **nothing is shared across builds or games**; no eviction ever (`gm-pages` and `gm-assets` grow forever); only the test stub (`packages/host/test/stub-game/main.ts:35`) registers it; templates do not. |
| SDK loader | `packages/sdk/src/assets/loader.ts` (OGM-026, #36) | `load()` parses `assets/manifest.json`; `resolve(id)` picks the file via the tier chain and returns `new URL(file, manifestUrl)`; one in-flight promise per file; `preload(ids)` fetches whole files as `ArrayBuffer`. | No progress, no cache awareness. An absolute `file` value such as `/a/<sha>.glb` already resolves correctly with no change. |
| SDK audio | `packages/sdk/src/audio/samples.ts:32-44` | Fetches whole files and `decodeAudioData`s them. | No streaming: a 4-min track is ~5 MB of MP3 and ~85 MB of decoded float PCM. `Range` is not needed today. |
| Asset build | `packages/gm-cli/src/commands/build/assets/files.ts:35` (OGM-063, #76) | Names `<slug>.<tier>.<sha256(bytes)[0:8]>.<ext>`; kits merge per collection (`kit.ts`); MP3 at `-q:a 4` (~165 kbps) with loudnorm (`audio.ts`). | 8 hex chars (32 bits) is fine inside one build, but not as a **global** key: a library of ~100k files has an expected ~1 collision. The slug is the per-game asset id, so the same bytes get different names in two games. |
| Manifest contract | `packages/contracts/src/assets.ts` (OGM-020, #24) | `files: Record<name, {bytes, tris?, gpuTexMB?, decoders}>`, `assets: Record<id, {file: {tier → name}, license, meta?}>`, loose objects (additive fields allowed, `ASSETS_SCHEMA_MINOR`). | No hashes, kinds or phases. |
| Releases | `packages/contracts/src/releases.ts` (OGM-045, #72) | `Build {id, gameId, branchId, gitSha, sdkVersion, status, artifact: 'present'｜'gc'}`; `Release {seq, version, buildId, kind: 'publish'｜'rollback', restoresReleaseId?, predecessorReleaseId?, changelog}`; `GET /games/:g/published` → `{releaseId, version, buildUrl, changelog}`. | The release row is the right pointer; it needs no new columns if the plan lives in the build dir. |
| Play screen | `apps/web/src/routes/game/GameScreen.tsx`, `apps/web/src/features/editor/frame.ts` | Mounts the frame with `readyTimeoutMs: 10_000`; state is `connecting｜ready｜error`; only the error state renders anything ("Try again"). While connecting the user sees an empty frame. | No loading layer; a slow first load over Funnel can hit the 10 s timeout and show an error. |
| Ready signal | `packages/sdk/src/core/boot.ts:155` | `ready` is sent at the end of `boot()`, before the template's scene loads its assets. | "Ready" does not mean "assets loaded"; the host needs a separate load signal. |
| App origin | `apps/web/public/_headers`, `apps/web/public/sw.js` (OGM-070, R110) | Netlify; `/assets/*` immutable; app worker with a per-deploy cache plus a durable `ogm-assets` cache. | Different origin from the games; it cannot cache game files (see browser facts). |
| Analytics | `packages/contracts/src/analytics.ts` (OGM-014, #33) | `ActivityEvent` with a fixed `Activity` enum and allow-listed `meta {command, system, path, count, durationMs, result}`. | Fits one load event per play with no schema change (see Decision 5). |
| Prior research | `docs/research/v0.5/C4-mobile-asset-pipeline.md` (row "Local cache"), `prototypes/studio-v0/sw.js` (two caches: per-build plus durable assets), `docs/research/v0.3/A5-…` (published pointer, update prompt) | The two-cache idea and the ≤ 2 MB / ≤ 30 files mobile first-view budget (OGM-063 `--budget mobile`). | The budget covers first view, not music; this design makes music `stream`. |
| Loading look | `prototypes/studio-v0/index.html:268-377` (`#loading`: `rgba(12,11,18,.7)` plus `backdrop-filter: blur(18px)`, three dots), `apps/web/src/routes/games/Cover.tsx` (cover image or hue placeholder), memory "seamless transitions" (live game under, only the top layer fades) | | The loading layer reuses these. |
| Decision | `docs/plans/ogm-v1-build/decisions.md` D-ASSETS-REFERENCE | Repos hold `assets.lock.json` (id + sha256 + rights); `gm build assets` resolves bytes from the instance library and blob store (#298, #299). | Same source bytes for every game, which makes outputs identical and cacheable across games. |

## Browser facts

Sources are named and were not re-fetched for this spike. Items marked **verify** need a device check (built into ticket 8).

**Origin, sandbox and partitioning**
- The games iframe has `sandbox="allow-scripts allow-same-origin allow-pointer-lock"` (OGM-028). Without `allow-same-origin` the frame would have an opaque origin, `caches` would throw `SecurityError` and service workers could not register (MDN: "Using Service Workers", "CacheStorage"). OGM-028 already records that the real origin exists for the tier memory and the cache worker.
- **Storage partitioning.** Chrome 115+ (Chrome for Developers, "Storage Partitioning"), Safari (WebKit, partitioned third-party storage since ITP 2.x, and partitioned service workers in third-party iframes) and Firefox (Total Cookie Protection / dFPI, MDN "State Partitioning") key third-party storage by **(top-level site, origin)**: CacheStorage, IndexedDB, service-worker registrations, Web Locks and `navigator.storage` all live in the partition "games origin under the app site". Consequences: (a) every game shares one partition, because the top-level is always the app; (b) opening a game URL **top-level** (verify, a direct link) uses a different, empty partition; (c) **changing the app's domain** (new Netlify name, a custom domain) starts every device's game cache from zero.
- **HTTP cache partitioning** (Chrome 86+ "Gaining security and privacy by partitioning the cache"; Safari; Firefox 85+): keyed by top-level site plus frame site plus URL. All games share the same pair, so identical URLs are shared across games in the HTTP cache too. This is why a global `/a/<sha>` URL helps even without a worker.
- A service worker controls *clients* in its scope but intercepts **every** fetch those clients make, whatever the URL (MDN "FetchEvent"). A page under `/g/` controlled with scope `/g/` therefore routes its `/a/*` requests through the worker. A script at `/game-cache.js` may claim `/g/` without a `Service-Worker-Allowed` header (the maximum scope is the script's directory, `/`).
- The first visit is not controlled until the worker activates and calls `clients.claim()` (MDN "Clients.claim()"). Requests made before that go to the network. The design does not depend on the worker for first-load caching: the page writes CacheStorage itself (`window.caches` exists in any secure-context document).
- Worker script updates bypass the HTTP cache by default (`updateViaCache: 'imports'`; MDN "ServiceWorkerContainer.register()"), and browsers re-check at most every 24 h. The script should still be served `Cache-Control: no-cache`, never the immutable header.

**Quota and eviction**
- Chrome (web.dev "Storage for the web", Chrome for Developers "Storage quotas and eviction criteria"): an origin may use up to 60 % of total disk; storage is *best-effort* by default and is evicted by origin, least recently used first, under storage pressure. `navigator.storage.persist()` never prompts; Chrome grants it from heuristics (installed PWA, bookmarked, high site engagement, notification permission). How the heuristic treats a **partitioned third-party** context is **verify**.
- Safari 17+ (WebKit blog "Updates to Storage Policy", 2023): per-origin quota became a share of disk (the post gives larger shares to browser apps than to apps embedding WebKit), cross-origin frames get a smaller slice of the top-level origin's quota, `navigator.storage.persist()` and `estimate()` are supported, and an origin marked persistent is skipped by the over-quota LRU cleanup. The exact third-party fraction on Kevin's iPad is **verify** via `navigator.storage.estimate()` inside the iframe.
- Safari ITP 7-day cap (WebKit blog "Full Third-Party Cookie Blocking and More", March 2020): all **script-writable storage** (IndexedDB, LocalStorage, CacheStorage, service-worker registrations) of a site is deleted after 7 *days of Safari use* without user interaction on that site. **Home Screen web apps** are exempt in practice: they have their own days-of-use counter, and their first-party site is interacted with whenever they are used. For a partitioned iframe the clock follows the top-level app site, which the family uses daily. Whether `persist()` exempts a site from the 7-day rule is **not documented**; treat it as no.
- Firefox: `persist()` shows a permission prompt (MDN "StorageManager.persist()"). In a third-party iframe it may be auto-denied (**verify**). The design must not show a Firefox prompt.
- The **quota is per partition, shared by every game** on the games origin, so one game cannot be budgeted separately except by our own planner. `navigator.storage.estimate()` (MDN) gives usage and quota for the partition. Chrome-only Storage Buckets (Chrome 122+) could split durability classes; not used, because it is Chrome-only.

**HTTP and fetch**
- `Cache-Control: immutable` with content-hashed URLs is the baseline (MDN "Cache-Control"; Firefox and Safari skip revalidation on reload; Chrome stopped revalidating subresources on normal reload in 2017). games-host already sends it on every `/g/` 200.
- `Range`: Safari's media stack requires the server to answer byte-range requests for `<audio>`/`<video>` sources (Apple "Safari HTML5 Audio and Video Guide": servers must support byte-range requests). `cache.match()` ignores `Range` and returns the full 200, so a worker serving media from cache must slice to 206 itself (the Workbox `workbox-range-requests` pattern). Today the SDK decodes whole files with `fetch` + `decodeAudioData`, so no `Range` is needed until music streams through a media element.
- Priority: `fetch(url, { priority: 'low' | 'high' })` (Fetch Priority, Chrome 101+, Safari 17.2+, Firefox 132+; ignored where unsupported) and `<link rel="modulepreload">` (Vite emits these) keep `ready` assets ahead of streamed ones.
- Byte progress: `response.body.getReader()` counts bytes as they arrive (MDN "Using readable streams"). With `Content-Length` present (games-host sets it) progress is exact; under `Content-Encoding` the length is the compressed size, so progress uses plan bytes instead.
- **Web Locks** (`navigator.locks.request(name, {mode: 'shared'|'exclusive'})`, MDN "Web Locks API"; Chrome 69+, Safari 15.4+, Firefox 96+; also in workers) scope to the storage partition, so two tabs of two games coordinate: loads take `gm-cache` shared, the eviction planner takes it exclusive, and a blob a running load just matched is never deleted under it.

**App origin (Netlify) and games origin (NUC) split**
- The app (Netlify CDN, `_headers` immutable `/assets/*`, its own `sw.js`) loads fast everywhere. The games origin is `https://applekid.tailee0e71.ts.net:10000` via Tailscale Funnel (`docs/ops/ingress.md`), served from the NUC. Every first load of a game crosses Kevin's home upload link and the Funnel relay (Tailscale's docs describe Funnel traffic as relayed through Tailscale's ingress servers and bandwidth-limited). First loads are slow by construction and every cache hit saves NUC upload.
- The app cannot pre-cache game files for the iframe: its CacheStorage is a different partition and origin, and a worker only sees its own clients' fetches. Prefetching from the app would also need CORS on the games host. So **all game caching lives on the games origin**, and the app only renders progress it is told about.

## Design

### 1. Cache model and the version log

**Unit.** A cached *version* is a build. Publishing, rollback and forks only move pointers to builds (`Release.buildId`; a fork's first build "plays the source release's artifact", OGM-048), so every one of them is a build the cache already understands.

**Content-addressed URLs.** `gm build assets` writes asset files as `<sha256>.<ext>` (full 64-hex sha256 of the output bytes) under `public/a/`, and the manifest's `files` keys and `assets[id].file[tier]` values become `/a/<sha256>.<ext>`. Vite copies `public/` into the build output; the publisher (#283) moves `dist/a/*` into `$OGM_GAMES_ROOT/_a/<sha256>.<ext>` (skip if present: dedup on disk) **before** writing `.complete`. games-host serves `GET /a/<sha256>.<ext>` with the same header set as `/g/` (immutable, CORP, nosniff, no cookies) and `ETag: "<sha256>"`. `AssetLoader.resolve()` needs no change: `new URL('/a/…', manifestUrl)` lands on the origin root. `gm run` serves `public/` at the root in dev, so `/a/` works there too.

Why not keep per-build `assets/` and map names to hashes in the worker (Decision 1): the mapping needs the worker to be installed and correct before the first fetch, gives nothing to the HTTP cache (whose URLs would still differ per build and per game), and keeps one copy per build on the NUC disk.

What stays per build: `index.html`, the Vite JS/CSS chunks, `assets/manifest.json`, `assets/cache-plan.json`, `design/design.json`, `manifest.json`. These are immutable under `/g/<gameId>/<buildId>/` and cached cache-first by the worker.

**Kits defeat cross-game reuse, and that is acceptable.** `kit.ts` merges the *used* models of a collection into one GLB, so two games using different subsets of a Kenney kit get different kit bytes. Kits are small after meshopt (C4: 174 GLBs, 8.6 MB → 4 kits, 0.8 MB). The large reusable files (music, SFX, characters, sprite sheets, textures) are one output per asset and deterministic, so they dedupe. A toolchain bump (sharp, ffmpeg, gltf-transform versions) re-hashes outputs once; the cache refills once.

**The version log** is two layers, both immutable:

1. The **release row** (exists): version, `buildId`, `predecessorReleaseId`, `restoresReleaseId`, changelog. The app already gets `{releaseId, version, buildUrl}` from `GET /games/:g/published`.
2. The **cache plan** `/g/<gameId>/<buildId>/assets/cache-plan.json`, written by `gm build assets` and completed by the publisher (code files and lineage). It is everything the client needs to plan, show progress and evict, without asking the API.

```ts
// packages/contracts/src/assets.ts (additive; ASSETS_SCHEMA_MINOR 2)
export type LoadPhase = 'boot' | 'ready' | 'stream';
export type CacheEntryKind = 'code' | 'model' | 'texture' | 'sprite' | 'sfx' | 'music' | 'voice' | 'font' | 'data';

export type CachePlanEntry = {
  sha256: string;                 // full hex of the bytes: the cache key everywhere
  url: string;                    // '/a/<sha256>.<ext>' for assets; build-relative ('index-3f2a.js') for code
  bytes: number;                  // exact size on disk (progress denominator)
  kind: CacheEntryKind;
  phase: LoadPhase;               // boot = needed to run code; ready = before the game starts; stream = after
  tiers: (Tier | '*')[];          // tiers whose load includes this file
  ids?: string[];                 // asset ids that resolve to it (debugging, per-scene planning later)
};

export type CachePlan = {
  version: 1;
  gameId: string;                 // filled by the publisher
  buildId: string;                // filled by the publisher
  built: string;                  // ISO time
  sdkVersion: string;
  tiers: Tier[];
  entries: CachePlanEntry[];      // assets from gm build assets + code appended by the publisher
  totals: Record<Tier, Record<LoadPhase, { bytes: number; files: number }>>;
  lineage?: {                     // filled by the publisher from the branch's previous latest build
    previousBuildId: string;
    added: string[];              // sha256s new in this build
    removed: string[];            // sha256s the previous build had and this one does not
    addedBytes: Record<Tier, number>;
  };
};
```

The phase rule in V1 is kind-based and needs no input from the creator: `code` → `boot`; `music`, `voice` (and later anything with `meta.loop` longer than 30 s) → `stream`; everything else → `ready` (Decision 3). `totals` lets the client show a correct bar before checking a single cache entry. `lineage` makes "this update is 300 KB" computable and gives the eviction planner the hashes a new version drops. The plan is not signed and needs no secrecy: it lists hashes and sizes that the manifest already exposes.

### 2. Loading screen and the SDK/host contract

**Flow on play.**
1. The app mounts the frame (unchanged) and shows nothing for 150 ms.
2. The game's `index.html` loads its code (cache-first through the worker after the first time).
3. `boot()` sends `ready` as today. The template then calls `loader.prepare()` (new), which:
   - reads `cache-plan.json`, picks the tier's entries, and under a **shared** `gm-cache` lock checks each `sha256` in `gm-blobs-v1` (`cache.match('/a/<sha>.<ext>')`);
   - sends `load.progress` at most 10 times a second (the bridge allows 120 msg/s) while it fetches the missing `ready` entries six at a time with `priority: 'high'`, counting bytes from `response.body`, and `cache.put`s each completed response;
   - sends `load.done`, records the play in the ledger (section 5), then fetches the missing `stream` entries with `priority: 'low'`, sending `load.progress {phase: 'stream'}` for the host's optional use.
4. The game starts its scene after `prepare()` resolves; `AssetLoader.#fetchFile` reads from `gm-blobs-v1` first, so nothing downloads twice.
5. A build without a plan (any build before this ships) sends no `load.*`; the host treats `ready` as done, so old builds behave as now.

```ts
// packages/contracts/src/bridge.ts (additive GameToHost envelopes)
| Envelope<'load.progress', { phase: LoadPhase; loaded: number; total: number; cachedBytes: number }>
| Envelope<'load.done', {
    ms: number;                         // navigation start → ready set cached
    fetchedBytes: number; cachedBytes: number;
    fetchedFiles: number; cachedFiles: number;
    persisted: boolean | null;          // navigator.storage.persisted(), null if unsupported
    usage?: number; quota?: number;     // navigator.storage.estimate()
  }>

// packages/host/src/frame.ts: GameFrameOptions gains
onLoad?(event: { t: 'load.progress' | 'load.done'; payload: unknown }): void;

// apps/web/src/features/editor/frame.ts: GameFrameState gains
load?: { phase: LoadPhase; loaded: number; total: number; done: boolean };
```

**The ready timeout** (`readyTimeoutMs: 10_000` in `apps/web/src/features/editor/frame.ts`, 30 s default in `packages/host/src/bridge.ts`) only covers hello → `ready`, which is code only. Add a separate *stall* timer: 20 s without a `load.progress` before `load.done` → `onError({code: 'load-stalled'})`, and the existing "Try again" shows. A slow but moving download never fails.

**What the play screen shows** (`apps/web/src/routes/game/LoadingLayer.tsx`, new): the game's cover (`Cover.tsx`'s image or hue placeholder) blurred behind the studio-v0 glass (`rgba(12,11,18,.7)` plus `backdrop-filter: blur(18px)`), one thin progress bar in the title-town ink and border style, bytes loaded over bytes needed. No text: the bar is `role="progressbar"` with `aria-label="Loading"` and `aria-valuenow`. It appears only if `load.done` has not arrived 150 ms after mount, so a cached play never flashes it. At `load.done` it fades out on top while the game already renders underneath (memory: seamless transitions, no cut, no dim cross-fade). `reduceMotion` drops the fade. Streamed music needs no UI: the game simply starts without it, and the music fades in when it arrives.

### 3. Persistence

- **Worker.** games-host serves `GET /game-cache.js` (from `packages/host/dist/game-cache.js`, `Cache-Control: no-cache`, the `/g/` security headers). The templates' `index.html` registers it inline before the bundle (`registerGameCache()`, scope `/g/`). Routes: cache-first `/a/*` → `gm-blobs-v1`; cache-first `/g/<game>/<build>/*` → `gm-builds-v1` (builds are immutable, so the current network-first for `index.html` buys nothing); everything else passes through. `activate` deletes only caches from an explicit retired-names list, never "everything not mine", so a newer page and an older worker never fight over names. Non-200 responses are never stored.
- **Page-side writes.** The SDK writes the same caches directly, so first-load caching works even when the worker is not yet in control, is unsupported, or was evicted.
- **`navigator.storage.persist()`** is called once per partition after the first `load.done` (no user gesture is needed in Chrome or Safari). It is skipped where `navigator.permissions.query({name: 'persistent-storage'})` reports `prompt` and the engine is Gecko, so Firefox never shows a prompt. The result rides on `load.done.persisted`.
- **When persistence is denied** (Safari's default; Chrome without engagement): everything still works. Within a session and across days the HTTP cache (immutable, partition-shared `/a/` URLs) and CacheStorage keep loads fast. After an eviction (ITP 7 days without app use, or storage pressure) the ledger and caches are gone together, and the next play shows the loading screen once. Nothing breaks, because the plan is always re-fetchable.
- **Installed PWA.** The app already has a manifest and worker (R110). Installed to the Home Screen on iPad and iPhone, the app gets its own days-of-use counter, which removes the 7-day ITP wipe in practice, and Chrome's `persist()` heuristic counts installation. This is a device setup step for Kevin (Decision 4), not in-app text.
- **Measurement.** On `load.done` the app posts one OGM-014 event (Decision 5):
  ```ts
  { activity: 'playtesting', boundary: 'point', source: 'editor', actor: 'human', gameId,
    meta: { system: 'game-load', command: fetchedBytes === 0 ? 'hit' : cachedBytes === 0 ? 'miss' : 'partial',
            count: Math.round(fetchedBytes / 1024), durationMs: ms, result: 'ok' } }
  ```
  The `rollups` endpoint already returns counts and durations per activity; filtering `system: 'game-load'` gives "first load N s, repeat loads M ms, X % hits". A stall or error posts the same event with `result: 'fail'`.

### 4. Cross-game reuse (with numbers from our packs)

Measured on `assets-local/` today (source files; build outputs are smaller, see ratios):

| Pack | Files used by a game | Source size | Built size (estimate) | Reused across games? |
|---|---|---|---|---|
| kenney-modular-dungeon-kit | 39 GLB, median 72 KB, 7.4 MB total | ~25 models ≈ 1.8 MB | kit ≈ 0.2–0.4 MB (C4 meshopt ratio ~10×) | only if the same subset; small anyway |
| kenney-tower-defense-kit | 160 GLB, median 26 KB, 5.8 MB | ~30 models ≈ 0.8 MB | kit ≈ 0.1–0.2 MB | as above |
| kenney-nature-kit | 329 GLB, median 7 KB, 3.0 MB | | kit < 0.1 MB | as above |
| kenney-particle-pack | 193 PNG, median 47 KB, 9.7 MB | 10 sprites ≈ 0.5 MB | WebP ≈ 0.15 MB | **yes**, one file per asset |
| smallscaleint-2d-hd-character-pack-1 | 33,302 PNG frames, median 12 KB, 710 MB | one character's sheets ≈ 1–3 MB | WebP ≈ 0.5–1.5 MB | **yes** |
| abstraction-music-loop-2024-q1 | 18 OGG loops, median 2.4 MB (48 s at 320 kbps) | 1 loop | MP3 `-q:a 4` ≈ 1.0 MB | **yes** |
| sidetrax-pack-13-theme-music | 10 WAV, median 42 MB (~4 min) | 1–2 tracks | MP3 ≈ 5 MB each | **yes** |

A typical small 3D game with these packs: code ≈ 1.2 MB (three + SDK; ≈ 0.35 MB with Brotli), kit models ≈ 0.4 MB, one rigged character ≈ 1 MB, 20 SFX ≈ 0.6 MB, two music tracks ≈ 10 MB. That is **≈ 13 MB, about 75 % of it music**. With phases, the `ready` set is ≈ 3 MB and the game starts after that; music streams.

- **A second game** by the same family that reuses the house music, character and SFX (likely: Kevin's catalog is the shared library under D-ASSETS-REFERENCE, and agents pick packs first) fetches only its code and kits: ≈ 1.5 MB of 13 MB, **≈ 85–90 % saved**. With no shared assets the saving is the shared code chunk at most (see risks).
- **A new version of the same game** (one model changed, one level tweaked) fetches the new JS chunk plus the one kit containing the change: ≈ 0.4–1.5 MB, versus the full 13 MB under today's per-build URL keys.
- **The NUC** stores each blob once in `_a/`, instead of once per build per game.

### 5. Eviction and unloading

**Ledger** (IndexedDB `gm-cache`, store `builds`, in the games partition):

```ts
type LedgerBuild = {
  key: `${string}/${string}`;       // gameId/buildId
  gameId: string; buildId: string;
  channel: 'published' | 'draft' | 'test';   // from hello.payload.build
  tier: Tier;
  hashes: string[];                 // the plan's entries for this tier (all phases)
  bytes: number;
  firstPlayedAt: number; lastPlayedAt: number; plays: number;
};
```

**Planner** (`packages/sdk/src/assets/evict.ts`), run in `requestIdleCallback` (or after 5 s) following `load.done`, under the **exclusive** `gm-cache` lock with `ifAvailable: true` (skipped if any load holds the shared lock; it runs after the next play):

```
keep = builds where lastPlayedAt > now - 30 days
     ∪ { newest-played build per gameId }                       // never lose a game's last state entirely
     ∪ { 2 newest 'draft' builds per gameId }                    // the edit loop flips builds every few minutes
drop older 'draft' builds first, then oldest-played builds, until Σ bytes(union of keep hashes) ≤ budget
budget = min(1 GiB, 0.25 × estimate().quota)
live   = ⋃ hashes(keep)
delete every gm-blobs-v1 entry whose sha ∉ live
delete gm-builds-v1 entries under /g/<game>/<build>/ for builds ∉ keep; delete their ledger rows
```

Cache entries without a ledger row (a crash between `put` and the ledger write) are unreferenced and therefore deleted, which is self-healing. Deleting a blob only costs a re-download, never a broken game, because the plan stays fetchable from the NUC.

**Rollback.** A rollback is a new release pointing at an older build (`kind: 'rollback'`). The app loads that build's plan. Hashes still cached (usually most, since adjacent versions share them) are hits, and the rest download with the loading bar showing only the missing bytes. Server-side, the old build must still be served: blobs in `_a/` are kept while **any** build with `artifact: 'present'` references them (the union of `cache-plan.json` hashes), and the existing `Build.artifact: 'gc'` path must refuse to collect a build that a release row still points at.

**Forks** reuse the source release's build (OGM-048), so a fork's first play is a full cache hit.

### 6. Risks and limits

| Risk | Effect | Mitigation |
|---|---|---|
| iOS ITP 7-day wipe and best-effort eviction | First-load screen returns after a week without app use | Home Screen install (Decision 4); design is correct after any wipe; measurable via `load.done.persisted` and the hit rate |
| Third-party quota slice on Safari; low-end Android with little free disk | `QuotaExceededError` on `cache.put` | Catch it: skip caching that file (play continues from network), run the planner with a halved budget, report `result: 'ok'` with `command: 'miss'` |
| One quota shared by every game | A big game can push others out | The planner's LRU across games plus the 1 GiB cap; per-game caps are not possible in the browser |
| Worker update races (old page, new worker) | Cache-name or route mismatch mid-load | Versioned cache names (`-v1`), no "delete all others" on activate, routes only add; page-side writes do not depend on the worker |
| Two tabs or games loading while the planner runs | Deleting a blob that is being matched | Web Locks: loads shared, planner exclusive with `ifAvailable` |
| hash8 names reused as a global key | Silent wrong asset across games | Full sha256 in `/a/` URLs and in the plan; hash8 stays only in the debug slug, which is dropped |
| Full-file audio decode | ~85 MB PCM per 4-min track in memory, music still downloads whole | `stream` phase defers it; real streaming (`<audio>` + `MediaElementAudioSourceNode`, games-host 206, worker range slicing) is a follow-up, not in these tickets |
| Offline play | The plan and blobs are cached, but the app needs `getDesignSnapshot` and saves from the API | Not a V1 goal; the cache is a prerequisite for it, nothing more |
| NUC upload over Funnel | First loads of ~13 MB at a few MB/s take several seconds | `ready`/`stream` split (≈ 3 MB before play), Brotli for code, every hit saves NUC upload; a CDN copy of published builds is a later lever (Netlify credits are limited) |
| App domain change or top-level game URLs | Partitioned caches start from zero | Keep one app domain; verify and direct links accept a cold cache |
| Shared code chunk across games | three + SDK (~1.2 MB raw) downloads per build | Later: emit the vendor chunk content-addressed into `/a/` too (deterministic Vite chunking per `sdkVersion`); not in V1 tickets |
| `allow-same-origin` on a shared origin (OGM-007 limitation) | A game can read or delete another game's cache entries | Accepted for V1 (family-only games); worst case is a re-download, since nothing in these caches is secret |

## Decisions for Kevin

1. **Shared `/a/<sha256>` URLs for assets** (one copy per file on the NUC and on each device, shared by every game and version) instead of per-build `assets/` with a worker-side mapping. *Recommend: yes.* It is the only option that also gives cross-game hits in the plain HTTP cache when Safari has dropped the worker.
2. **Retention**: keep builds played in the last 30 days, the last played build of every game, and the 2 newest drafts per game, under a budget of min(1 GB, 25 % of the browser's quota); evict least-recently-played first. *Recommend: yes,* and revisit the numbers with the hit-rate data.
3. **What waits and what streams**: the game starts when code, models, textures, sprites, SFX and fonts are cached; music and voice stream in afterwards and fade in. *Recommend: yes,* using the kind rule with no per-game setting in V1.
4. **Persistence**: ask the browser silently (never a prompt, never in-app text) and add the app to the Home Screen on the family's iPads and iPhones as the iOS fix for the 7-day wipe. *Recommend: yes.* The Home Screen step is a one-time device setup for Kevin.
5. **Measuring "second load fast"**: one OGM-014 event per play (`system: 'game-load'`, hit/partial/miss, KB fetched, ms to ready) with no schema change, instead of a new play-load table. *Recommend: reuse OGM-014;* a dedicated table only if Kevin wants per-device charts.

## Tickets

Ordered by dependency. Issue numbers: OGM-007 #13, OGM-014 #33, OGM-020 #24, OGM-026 #36, OGM-028 #50, OGM-045 #72, OGM-063 #76; open: #283 (register a finished build with the games host), #298 (gm build assets resolves from the instance library), #310 (templates emit manifest.json in the build dir).

### 1. Cache plan contract and content-addressed asset output in `gm build assets`

**Complexity:** 2   **Depends on:** OGM-020 (#24), OGM-063 (#76); after #298 (same command; rebase on it)

**What.** The version log the client plans from: `CachePlan`/`CachePlanEntry`/`LoadPhase` in the contracts, and `gm build assets` writing asset files as `public/a/<sha256>.<ext>` with a manifest whose file names are `/a/<sha256>.<ext>`, plus `public/assets/cache-plan.json`.

**Do.**
- Add the types and Zod schemas from this spike's section 1 to `packages/contracts/src/assets.ts` (additive, `ASSETS_SCHEMA_MINOR` 2), with a fixture and a JSON Schema export like the others.
- `files.ts`: `outputName()` → `<sha256 full>.<ext>`; default `--out` becomes `public/a`; manifest `files` keys and `assets[id].file` values are `/a/<name>`.
- `manifest.ts`: write `public/assets/cache-plan.json` (entries per output file: sha256, url, bytes, kind from the job kind, phase by the kind rule (`music`/`voice` → `stream`, else `ready`), tiers, ids; `totals` per tier and phase). Leave `gameId`, `buildId` and `lineage` empty for the publisher.
- Keep the budget report unchanged (it reads `files`).

**Code it touches.** `packages/contracts/src/assets.ts`, `packages/contracts/fixtures/`, `packages/gm-cli/src/commands/build/assets/{files,manifest,audio,image,kit,model,font}.ts`, `packages/gm-cli/test/build-assets.test.ts`.

**Done when.** The fixture game builds to `public/a/<64-hex>.<ext>` files whose names equal `sha256` of their bytes; `manifest.json` parses with `assetManifestSchema` and the SDK loader resolves `/a/…` URLs (existing loader tests plus one new); `cache-plan.json` parses with the new schema and its `totals` equal the sum of entries; the same lock built in two fixture "games" produces identical `/a/` names for a shared sprite and MP3 (the reason the change exists).

### 2. Games host: serve `/a/<sha256>`, the cache worker script, and compressed code

**Complexity:** 2   **Depends on:** OGM-007 (#13), OGM-028 (#50)

**What.** The games origin serves the shared blob space, the worker script, and Brotli/gzip for text types.

**Do.**
- `layout.ts`: `blobPath(root, file)` for `$OGM_GAMES_ROOT/_a/<sha256>.<ext>`, with a strict `^[0-9a-f]{64}\.(glb|webp|png|mp3|ogg|woff2|ktx2|json)$` check; `putBlob(root, src)` (link or copy, skip if present, fsync, atomic rename) exported for the publisher.
- `server.ts`: `GET|HEAD /a/:file` with `gameHeaders()` and `ETag: "<sha256>"`, 404 `no-store` otherwise; `GET /game-cache.js` from `packages/host/dist/game-cache.js` (path via env `OGM_GAMES_SW`, default the workspace path) with `Cache-Control: no-cache` and the security headers.
- Compression for `.js .mjs .css .html .json .map` when `Accept-Encoding` allows it (precompressed `.br` beside the file if present, else on the fly), `Vary: Accept-Encoding`; never for media types.

**Code it touches.** `services/games-host/src/{server,layout,headers,env,mime}.ts`, `services/games-host/test/*`.

**Done when.** Unit tests: a blob is served with the immutable header set and its sha ETag; a bad name, uppercase hex, traversal or a 63-char hash → 404; `/game-cache.js` has `no-cache`; a `.js` request with `Accept-Encoding: br` gets `Content-Encoding: br` and a `.webp` never does; `putBlob` twice is a no-op. The browser test registers the worker from a framed page at scope `/g/`.

### 3. Publisher: move blobs into `_a/`, complete the cache plan, keep referenced blobs

**Complexity:** 2   **Depends on:** #283, ticket 1, ticket 2

**What.** The build publish step (#283) finishes the version log and the server side of the shared store.

**Do.**
- Before `.complete`: `putBlob` every `dist/a/*` into `_a/`, remove `dist/a/` from the build dir, and append `code` entries (Vite outputs with sha256, bytes, phase `boot`) plus `gameId`, `buildId` and `lineage` (previous latest build of the branch, added/removed hashes, `addedBytes`) to `assets/cache-plan.json`.
- `gcBlobs(root, liveBuilds)`: delete `_a/` files not referenced by the plan of any build whose `artifact` is `present`; wire it to wherever builds are flipped to `gc`, and make that flip refuse builds a `releases` row points at (rollback must keep working).

**Code it touches.** The #283 publish path (`services/api/src/jobs/*` or `services/api/src/builds/*` as #283 lands it), `services/api/src/releases/service.ts` (gc guard), `services/games-host/src/layout.ts` (helpers from ticket 2).

**Done when.** An integration test publishes two fixture builds of one game and one of another game sharing an MP3: `_a/` holds that MP3 once; each build dir has no `a/`; plans carry correct lineage; `gcBlobs` after gc'ing the first build keeps every hash still referenced; a build referenced by a release refuses gc.

### 4. Cache worker: content-addressed, immutable builds, no blanket deletes; templates register it

**Complexity:** 2   **Depends on:** ticket 2

**What.** Rework `game-cache.ts` for the new URL space, and actually register it from games.

**Do.**
- Routes: `/a/<sha>.<ext>` → cache-first `gm-blobs-v1`; `/g/<game>/<build>/*` → cache-first `gm-builds-v1` (immutable); everything else passes; only `ok` responses are stored; `activate` deletes only names on a `RETIRED` list (`gm-assets`, `gm-pages`).
- Template `index.html` (2D and 3D): inline `navigator.serviceWorker?.register('/game-cache.js', {scope: '/g/'})` before the module script, ignore failures (Firefox private mode, unsupported).

**Code it touches.** `packages/host/src/sw/{game-cache,register}.ts`, `packages/host/src/sw/game-cache.test.ts`, `packages/host/src/browser/cache.spec.ts`, `templates/game-{2d,3d}/index.html`.

**Done when.** Unit tests for the new routing table; the browser spec loads a stub game twice from two different build ids that share a blob and sees that blob served from `gm-blobs-v1` on the second load (no network request for it), and the second build's code from network once and then from `gm-builds-v1`.

### 5. SDK: plan-driven preload with byte progress, ledger, and `load.*` bridge messages

**Complexity:** 3   **Depends on:** ticket 1, OGM-026 (#36); works without tickets 3–4 (writes caches itself)

**What.** The game page loads only missing hashes, reports real progress and records the play.

**Do.**
- Contracts: `load.progress` and `load.done` `GameToHost` envelopes (section 2), additive.
- `packages/sdk/src/assets/cache.ts`: `prepare({plan, tier, send})`: fetch `cache-plan.json`; under `navigator.locks` shared `gm-cache`, `match` each entry in `gm-blobs-v1`; fetch missing `ready` entries six at a time with `priority: 'high'`, count `response.body` bytes, `put`; throttle `load.progress` to 10/s; send `load.done` with `storage.persisted()` and `estimate()`; then fetch `stream` entries with `priority: 'low'`. A `QuotaExceededError` on `put` skips caching that file.
- `loader.ts` `#fetchFile` and `audio/samples.ts` read `gm-blobs-v1` first for `/a/` URLs.
- Ledger in IndexedDB `gm-cache`/`builds` (`LedgerBuild`, section 5), written after `load.done`; `persist()` once per partition, skipped for a Gecko `prompt` state.
- Templates call `await loader.prepare()` after `boot()` and before the scene loads.

**Code it touches.** `packages/contracts/src/bridge.ts`, `packages/sdk/src/assets/{cache,loader,index}.ts`, `packages/sdk/src/audio/samples.ts`, `packages/sdk/src/core/boot.ts` (expose `send` for `load.*`), `templates/game-{2d,3d}/src/main.ts`.

**Done when.** Vitest with a fake CacheStorage, fetch and locks: a cold plan fetches every `ready` entry and reports monotonic progress ending at `total`; a warm plan fetches nothing and sends `load.done` with `fetchedBytes: 0`; a half-warm plan fetches exactly the missing hashes; `stream` entries are fetched after `load.done`, never before; a quota error does not fail the load; a build without `cache-plan.json` sends no `load.*`.

### 6. Play screen: loading layer, stall timeout, and the load analytics event

**Complexity:** 2   **Depends on:** ticket 5, OGM-014 (#33)

**What.** The first play of a version shows the cover-and-bar layer with real progress; cached plays show nothing; every load is measured.

**Do.**
- `packages/host/src/frame.ts`: forward `load.progress`/`load.done` to a new `onLoad` option.
- `apps/web/src/features/editor/frame.ts`: `GameFrameState.load`; a 20 s stall timer (reset by each progress) → `error` with `load-stalled`; `ready` without any `load.*` counts as done.
- `apps/web/src/routes/game/LoadingLayer.tsx` plus `game.css`: the game's `Cover` blurred under the studio-v0 glass, one progress bar (`role="progressbar"`, `aria-label="Loading"`, no visible text), shown only after 150 ms without `load.done`, top layer fades out over the live game, no fade under `reduceMotion`.
- On `load.done` (and on stall), post the OGM-014 event from section 3 through the existing analytics client.

**Code it touches.** `packages/host/src/{frame,bridge}.ts`, `apps/web/src/features/editor/frame.ts`, `apps/web/src/routes/game/{GameScreen.tsx,LoadingLayer.tsx,game.css}`, tests beside them.

**Done when.** Component tests: progress 0 → 100 % renders the bar's `aria-valuenow`; `load.done` within 150 ms renders nothing; a stalled load shows "Try again"; the analytics call carries `hit|partial|miss`. Phone-size stills of the layer at 0 %, 50 % and done are attached to the PR (gm-verify).

### 7. Eviction planner

**Complexity:** 2   **Depends on:** ticket 5

**What.** After each play, delete cache entries that no kept version references, within a budget.

**Do.** `packages/sdk/src/assets/evict.ts`: run on idle after `load.done` with an exclusive `gm-cache` lock (`ifAvailable`); keep set and budget exactly as section 5 (30 days, newest per game, 2 newest drafts per game, min(1 GiB, 25 % quota), LRU by `lastPlayedAt`); delete unreferenced `gm-blobs-v1` entries, `gm-builds-v1` entries of dropped builds and their ledger rows. Constants live in one exported object so the numbers can change after Kevin sees the hit rate.

**Code it touches.** `packages/sdk/src/assets/{evict,cache}.ts`, `packages/sdk/src/assets/evict.test.ts`.

**Done when.** Unit tests with a fake clock and caches: a hash shared by a kept and a dropped build survives; a build last played 31 days ago is dropped unless it is its game's newest; the third-newest draft is dropped; an over-budget ledger drops the least recently played game first; orphan cache entries without ledger rows are deleted; the planner does nothing while a shared lock is held.

### 8. Device proof: second load fast on Kevin's iPad and Android

**Complexity:** 2   **Depends on:** tickets 3, 4, 6, 7

**What.** Evidence that the design holds on the real stack (Netlify app, NUC games origin over Funnel), and answers to the "verify" items.

**Do.**
- Playwright e2e on the hosted-like stack: play game A (cold) → reload → play A (hit) → publish A v2 changing one model → play (partial, fetches only that kit and the code) → play game B sharing music (partial, music not fetched) → roll back A → play (hits). Assert the network requests and the `load.done` numbers at each step.
- On Kevin's iPad (Safari and Home Screen) and an Android phone: record `persisted`, `estimate()` inside the iframe, cold and warm `ms` and bytes; check whether the worker registers in the partitioned iframe on iOS. Put the numbers in the PR and in this spike's "Browser facts" as verified.

**Code it touches.** `apps/web/e2e/` (or `packages/host/src/browser/`), `docs/research/client-asset-cache-2026-11-02.md` (verified rows).

**Done when.** The e2e passes in CI; the device table is in the PR with cold vs warm load time and bytes for one real game; Kevin has seen a phone MP4 of a cold load (bar) followed by a warm load (no bar).
