# OGM-026 plan — Device-tier asset loader

## 1. Problem frame

Games ship one logical id per asset; `gm build assets` (OGM-063) writes per-tier content-hashed files and `assets/manifest.json`. The runtime must pick a tier once from weak browser signals (iPhone hides memory, cores and GPU), adapt from measured frame time, and resolve ids through the manifest without ever composing a file name. This ticket is the SDK's only contact with the asset pipeline (E04-14) and must stay engine-light so OGM-023 (three) and OGM-024 (phaser) can both consume it.

Requirements trace:
- R45 → `pickTier()` from capability signals + frame-time downgrade + `?tier=` override; the loader reads `assets/manifest.json` and never derives file names.
- D-TIERS → tiers are build-time products; the SDK chooses and adapts, never generates.

## 2. Patterns to follow

- `docs/research/v0.5/C4-mobile-asset-pipeline.md` §3.2: the tier heuristic (copy the thresholds and the DPR caps 2 / 1.5 / 1 verbatim) and §3.3 the `low → mobile → desktop` chain.
- `docs/research/v0.5/C4-mobile-asset-pipeline.md` §5.2: the manifest JSON (use it as the test fixture, byte for byte).
- `prototypes/studio-v0/sound.js:63-68`: a `Map<key, Promise>` so one URL is fetched once (`load()`); copy the shape for `fetchFile`.
- `prototypes/title-city/city.js:218`: DPR capped at 1.25 on coarse pointers when embedded; the governor generalises this.
- `/home/orangekid/github/aiur/packages/aiur-contracts/README.md`: "clients ignore unknown fields"; parse the manifest with OGM-020's Zod schema in non-strict mode.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); services bind `127.0.0.1`; secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars without naming the exception (`meshoptimizer` and `three` are far above); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Package shell (only if absent)

Goal: `@gm/sdk` exists with a `./assets` subpath export so OGM-023/024 can import it.

Files:
- Create (if missing): `packages/sdk/package.json`, `packages/sdk/tsconfig.json`, `packages/sdk/vitest.config.ts`.
- Modify: none.

Approach: check `ls packages/sdk` at pickup. If OGM-022 has merged, add only the `"./assets"` entry to `exports` (append; one line). Otherwise create the minimal package: `name: "@gm/sdk"`, `type: module`, `exports: { "./assets": "./src/assets/index.ts" }`, scripts `build` (`tsc -p tsconfig.json`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `lint` (workspace eslint), deps `three@0.186.1`, `meshoptimizer`, `@ogm/contracts: workspace:*`, devDeps `@types/three`, `vitest`, `jsdom`. `tsconfig.json` extends `tsconfig.base.json` (OGM-001). The engine package never depends on `services/*` (architecture §2).

Interface sketch:
```json
{ "name": "@gm/sdk", "exports": { "./assets": "./src/assets/index.ts" } }
```

Test scenarios:
- Given the package, when `pnpm --filter @gm/sdk typecheck` runs, then it exits 0 with no sources but the assets module.

### U2. `tier.ts`: signals and `pickTier`

Goal: a pure, table-tested tier decision with override and memory.

Files:
- Create: `packages/sdk/src/assets/tier.ts`, `packages/sdk/src/assets/tier.test.ts`.

Approach: `type Signals = { coarse: boolean; iOS: boolean; deviceMemory?: number; hardwareConcurrency?: number; dpr: number; override?: Tier | null; remembered?: Tier | null }`. `readSignals(win = window)` fills from `matchMedia('(pointer: coarse)')`, the C4 iOS test (`/iP(hone|ad|od)/` or `maxTouchPoints > 1 && /Mac/`), `navigator.deviceMemory`, `navigator.hardwareConcurrency`, `devicePixelRatio`, `new URLSearchParams(location.search).get('tier')` validated against the `Tier` enum, and `localStorage.getItem('gm.tier')` in a try/catch. `pickTier(signals = readSignals())`: override → remembered → computed (`mem = deviceMemory ?? (coarse ? 4 : 8)`; `!coarse && mem >= 8` → desktop; `mem <= 2 || (hardwareConcurrency ?? 4) <= 2 && !iOS` → low; else mobile). `dprCap(tier)` returns 2 / 1.5 / 1. `remember(tier)` writes `gm.tier` unless an override is present.

Interface sketch:
```ts
export function readSignals(win?: Window): Signals;
export function pickTier(signals?: Signals): Tier;
export const DPR_CAP: Record<Tier, number>;   // desktop 2, mobile 1.5, low 1
```

Test scenarios:
- Given `{coarse:false, deviceMemory:8}` when picked then `desktop`.
- Given `{coarse:true, iOS:true}` (no memory) when picked then `mobile`.
- Given `{coarse:true, iOS:false, hardwareConcurrency:2}` when picked then `low`.
- Given `override:'low'` and `remembered:'desktop'` when picked then `low`.
- Given `localStorage.getItem` throws when `readSignals` runs then `remembered` is null and nothing throws.

Execution note: test-first; the table is the spec.

### U3. `governor.ts`: frame-time downgrade

Goal: lower DPR, then effects, from measured frames; persist; notify.

Files:
- Create: `packages/sdk/src/assets/governor.ts`, `packages/sdk/src/assets/governor.test.ts`.

Approach: `new FrameGovernor({ tier, dpr: Math.min(devicePixelRatio, DPR_CAP[tier]), storage })`. `observe(frameMs)` pushes into a 60-slot ring; when full, compute the median; if `> 22`, step `dpr` down the ladder `[2, 1.5, 1.25, 1]` to the next value below the current; if already at 1, set `effects = false`; clear the ring and start a fresh 60-frame window; stop evaluating after `effects` is false. Emit `{tier, dpr, effects}` through `onChange(cb)`; write `gm.tier.adapted` (`{dpr, effects}`) to storage. On construction, read `gm.tier.adapted` and start from it (never raise within a session). Pure logic; `performance.now` is not used (frames are passed in).

Interface sketch:
```ts
export class FrameGovernor { constructor(o: { tier: Tier; dpr: number; storage?: Storage });
  observe(frameMs: number): void; get state(): { tier: Tier; dpr: number; effects: boolean }; onChange(cb: (s) => void): () => void }
```

Test scenarios:
- Given 59 slow frames when observed then no change; the 60th at median > 22 ms drops `dpr` from 2 to 1.5 and emits once.
- Given `dpr` 1 and a slow window when observed then `effects` becomes false and later windows change nothing.
- Given a remembered `{dpr:1.25}` when constructed with cap 2 then state starts at 1.25.
- Given 60 frames with median 16 ms when observed then nothing changes.

### U4. `loader.ts`: manifest resolution and fetch

Goal: ids → files → decoded objects, one fetch per file, lazy decoders.

Files:
- Create: `packages/sdk/src/assets/loader.ts`, `packages/sdk/src/assets/errors.ts`, `packages/sdk/src/assets/loader.test.ts`, `packages/sdk/src/assets/index.ts`.

Approach: `createAssetLoader({ manifestUrl, tier, fetch = globalThis.fetch, audioContext? })`. `load()` fetches and parses the manifest with OGM-020's `AssetManifestSchema` (reject with the URL on failure). `resolve(id)`: entry or throw `AssetNotFound(id)`; file = first of `[tier, ...chainBelowToAbove(tier), '*']` present in `entry.file` (chain for `low`: low, mobile, desktop; for `mobile`: mobile, desktop; for `desktop`: desktop) else throw `AssetUnavailable(id, tried)`; URL = `new URL(file, manifestUrl)`. `fetchFile(name)`: `Map<string, Promise<ArrayBuffer>>`, `fetch(url).then(r => r.ok ? r.arrayBuffer() : throw)`. `gltf(name)`: cache of parsed `GLTF` per file; `GLTFLoader.parse` with `setMeshoptDecoder(MeshoptDecoder)` when `files[name].decoders` has `meshopt`; when it has `ktx2`, `await import('three/addons/loaders/KTX2Loader.js')`, `new KTX2Loader().setTranscoderPath(basisPath)` and `.detectSupport(renderer)` where `renderer` comes from `attachRenderer()` (throw a clear error if a ktx2 file is requested before a renderer is attached). `mesh(id)`: the named mesh (`entry.mesh`) from the parsed scene or the first mesh; return it unmodified (no geometry edits, E04-8). `texture(id)`: `TextureLoader`-equivalent from a blob URL of the bytes, `colorSpace = SRGBColorSpace`. `audio(id)`: `(audioContext ?? new OfflineAudioContext(1, 1, 44100)).decodeAudioData(bytes.slice(0))`. `preload(ids)`: `Promise.all(ids.map(resolve → fetchFile))`. Basis transcoder path: the files OGM-063 copies into `assets/basis/` (document; default `new URL('basis/', manifestUrl)`).

Interface sketch:
```ts
export interface AssetLoader {
  load(): Promise<AssetManifest>; resolve(id: string): { url: string; file: string; mesh?: string; bounds?: [number,number,number]; license: AssetManifest['assets'][string]['license'] };
  preload(ids: string[]): Promise<void>; mesh(id: string): Promise<Mesh>; texture(id: string): Promise<Texture>; audio(id: string): Promise<AudioBuffer>;
  attachRenderer(r: WebGLRenderer): void; readonly tier: Tier }
export class AssetNotFound extends Error {}; export class AssetUnavailable extends Error {}
```

Test scenarios (Vitest, jsdom, `fetch` stubbed with the C4 §5.2 fixture):
- Given tier `low` and `monsters/yeti` when resolved then file is `monster-yeti.mobile.a81e.glb` (low maps to the mobile file).
- Given tier `mobile` and `castle/tower-base` when resolved then file is `kit-castle.3f9a1c.glb` via `'*'`.
- Given two ids on `kit-castle.3f9a1c.glb` when both preloaded then `fetch` was called once for that file.
- Given id `nope` when resolved then `AssetNotFound` names `nope`.
- Given a file with `decoders: ['ktx2']` when `mesh()` runs then the KTX2 dynamic import spy fired; given `['meshopt']` only then it did not.
- Given a manifest missing `assets` when `load()` runs then the rejection names the manifest URL.
- Given a mocked `OfflineAudioContext` when `audio(id)` runs then `decodeAudioData` received the bytes.

Execution note: GLTF parsing in jsdom needs a stub for `GLTFLoader.parse`; test the wiring (decoder set, import gating) with `vi.mock('three/addons/loaders/GLTFLoader.js')`. Real GLB decoding is proven by OGM-023's headless boot.

## 4. Verification

```
pnpm --filter @gm/sdk test -- assets
pnpm --filter @gm/sdk typecheck
pnpm -r lint
```
Paste into `## Local tests`: the Vitest summary (file names and counts), the typecheck exit, and one line proving a test fails without the change (e.g. revert the chain and show the `low → mobile` case fail).

## 5. Deferred to implementation

- Ring size and threshold constants: default 60 frames / 22 ms (C4); keep them exported for OGM-090 to read.
- Whether `texture(id)` uses `ImageBitmapLoader` or `TextureLoader`: default `ImageBitmapLoader` with `TextureLoader` fallback where `createImageBitmap` is missing (Safari versions vary).
- Storage key names: default `gm.tier` and `gm.tier.adapted`.
- Basis transcoder location: default `basis/` beside the manifest; OGM-063 confirms.

## 6. Scope boundaries

- No tier generation, kit packing, budgets or `assets/manifest.json` writing (OGM-063).
- No `setPixelRatio` or Phaser scale calls (OGM-023, OGM-024).
- No `AudioContext` ownership or buses (OGM-027).
- No manifest type changes (OGM-020; file an additive request there).

## 7. Risks

- `packages/sdk` package creation races OGM-022 (phase 5): default is to create the minimal package here and accept the merge.
- KTX2 needs a renderer for `detectSupport`: default throws a named error if a `ktx2` file is requested before `attachRenderer`; OGM-023 attaches at mount.
- Three r186 `addons` import paths differ from the r170 prototypes: default write against r186 (`three/addons/...`), not against `dungeon.js`.
- Tier thresholds are untuned: default C4 numbers, exported constants, tuned under OGM-090 on Kevin's phone.
