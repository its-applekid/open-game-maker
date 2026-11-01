# C4: Mobile-friendly 3D assets and fast phone loads

Kevin, 2026-10-31: "any asset used effectively has mobile-friendly alternatives and processing built into usage of the
asset." This file is the research spike (sections 0-5 below, written by a research agent with measurements on copies of
the title town) plus what was applied to the title town the same day.

## Applied to the title town (2026-10-31)

Measured with `apps/web/title-town/tools/loadtime.mjs`-style runs (iPhone 13 profile, CPU 4x slower, localhost).

| Change | Where | Effect |
|---|---|---|
| Terrain heights and colours baked at build time | `tools/bake.mjs` -> `models/bake/terrain.bin`, `terrain()` | terrain step 6 s -> 0.4 s (desktop) |
| Forest placement baked | `models/bake/trees.bin`, `trees()` | trees step 8 s -> 0.8 s (4x CPU) |
| Every model the town and its scenes use processed once (merge, base-centre, per-triangle swatch UVs) and quantised into one gzipped pack | `models/bake/models.bin.gz` (0.32 MB for ~170 models, was ~7 MB of GLBs), `loadPack()` | one request instead of ~170, no glTF parsing or per-triangle work on the phone |
| Models that still load as GLB fetch in parallel | `kenney()` shares a promise per model; `flush()` prefetches | removes the serial round trips found in section 0.1 |
| Town bundled into one script | `tools/bundle.mjs` (esbuild) | one request instead of a few hundred module fetches |
| Shaders compiled before the first frame | `renderer.compileAsync` | first-frame stall moved before the reveal |
| Scenes set up after the town is on screen | `startScenes()` in city.js | the town shows first; scene houses stay instanced until handed over |
| Looping poster while the town loads, cross-faded into the live view | `tools/poster.mjs`, `studio-v0/title-town.js` | something moving on screen in ~1.5-2.5 s instead of black; two posters (portrait, landscape) rendered at the widest shape of each orientation and cropped with `object-fit: cover`, which matches the live camera exactly at any screen shape because it keeps its vertical field of view |
| Local cache: service worker; big assets in a cache that survives deploys (stale-while-revalidate), code and baked files per deploy | `studio-v0/sw.js` | repeat visits load from the device |

Result: town ready in ~9.4 s at 4x CPU with 46 requests and 0.6 MB (was ~83 s, ~240 requests, ~7 MB); poster on screen
after ~2.5 s. Not measured on a real iPhone.

Not done yet (ranked in 5.6): content-hashed file names, baking the town plan/streets/fractures, device tiers with
adaptive pixel ratio, code-splitting the scenes, KTX2 (only once high-poly purchased models ship), and a general
per-game asset build with a manifest (5.1-5.2), which is the piece every game needs.

---

Date: 2026-10-31. Scope: Open Game Maker 2000 games (TypeScript + three.js r170, static sites, often opened on iPhones).
Grounded on the town source now archived at `apps/web/title-town` (formerly the studio's title town, deployed as `studio-v0/town/`). Nothing in the repo was
changed. Every experiment ran on copies in the scratchpad.

---

## 0. What I measured first

These are my own local measurements. They show where the time actually goes, which matters more than the generic advice
in later sections.

### 0.1 Where the title town's load time goes

The test copied `tools/loadtime.mjs`: Playwright Chromium, iPhone 13 profile, CPU throttled 4x, the town served from
`studio-v0/town` with `?cam=menu&scene=all&embed`. The script reads the town's own `window.__marks` stage markers.

| Stage (marks in city.js) | Localhost, no network throttle | 100 ms RTT, 10 Mbit/s ("good 4G") |
|---|---|---|
| script parse/eval (`start`) | 0.96 s | 2.0 s |
| `terrain` (baked heights to mesh) | +2.2 s | +3.3 s |
| `plan` (streets, wall, castle, lots) | +2.3 s (one 2.3 s long task) | +2.4 s |
| `houses` (`buildHouses`) | +4.0 s | **+10.0 s** |
| `flush` (one InstancedMesh per model) | +3.9 s | **+11.6 s** |
| `trees` | +1.2 s | +1.5 s |
| `frame0` (torches/clouds/boats + first render) | +3.7 s (4.7 s long task) | +3.4 s |
| **ready** | **18.4 s** | **34.6 s** |

The page fetches 80 GLBs (5.5 MB), 2 `.bin` bakes (1.45 MB), 17 PNGs and one 784 KB JS bundle. The main-thread long tasks
add up to about 12 s at 4x CPU.

**Finding 1: the models load one after another.** `kenney()` is awaited inside a `for` loop in both `buildHouses()` and
`flush()`, so the ~80 GLB requests run in series and each round trip waits for the previous one. On localhost this costs
little. On a real phone network it costs about one RTT per model. I patched the minified bundle in a scratch copy to
prefetch every model with `Promise.all` before those loops, and changed nothing else:

| Variant (100 ms / 10 Mbit/s, 4x CPU) | ready |
|---|---|
| as shipped | 34.6 s |
| `flush()` prefetches its models in parallel | 25.6 s |
| `buildHouses()` and `flush()` both prefetch | **22.3 s** |

That is about 12 s saved by a one-line change, before touching any asset. It matches the real iPhone's roughly 15 s: a
faster CPU than 4x-throttled desktop, but real RTTs.

**Finding 2: Netlify sends GLB and BIN files uncompressed.** I checked the live site with
`curl -I -H 'Accept-Encoding: br, gzip'`:

- `town/models/castle/gate.glb` comes back as `content-type: application/octet-stream` with **no `content-encoding`**.
- `town/models/bake/terrain.bin` is the same: 1,409,100 bytes on the wire. Gzipped it would be 765 KB.
- `city.bundle.js` is served with `content-encoding: br`.

Netlify only documents automatic compression for "HTML, CSS, JS among other files". A community thread reports that it
does not compress glb/gltf/wasm ([Netlify forum](https://answers.netlify.com/t/automatically-compress-served-content/31253),
[Netlify Brotli blog](https://www.netlify.com/blog/2020/05/20/gain-instant-performance-boosts-as-brotli-comes-to-netlify-edge/)).
So every model byte goes over the wire raw, and that is why compression inside the file (meshopt/Draco, quantization)
pays off so much here.

**Finding 3: the procedural variants are very bloated.** The variants made by `tools/variants.mjs` (written with
GLTFExporter) are non-indexed float32 with an embedded copy of the 512x512 colormap PNG. `building-m-plus2.glb` is
773 KB for 7,868 triangles. Welding alone brings it from 23,604 to 9,530 vertices. The 68 deployed variants come to
5.6 MB raw, and about 1.1 to 1.5 MB of that is the same colormap embedded over and over.

**Finding 4: every deploy throws the device cache away.** `sw.js` names its cache `ogm-<BUILD>` and deletes old caches on
activate, so each deploy forces a full ~7 MB re-download even when no model changed. Content-hashed file names plus one
long-lived asset cache would fix this (section 5.6).

### 0.2 Compression experiments on real project files

Tools: `@gltf-transform/cli` 4.5.1 and `gltfpack` 1.3 (npm), installed in the scratchpad. "gz" is `gzip -6`, shown for
reference. Netlify currently sends the raw column (Finding 2).

**One variant (building-m-plus2, 7,868 tris, embedded PNG):**

| Output | raw | gz | notes |
|---|---|---|---|
| source | 773 KB | 73 KB | float32, non-indexed |
| `gltf-transform weld` | 370 KB | 88 KB | 9,530 verts |
| `gltf-transform optimize --compress quantize` | 256 KB | 83 KB | |
| `gltf-transform optimize --compress meshopt --texture-compress webp --simplify false` | **72 KB** | 32 KB | 1.6 s CLI |
| same + `--simplify-ratio 0.5 --simplify-error 0.001` | 70 KB | 31 KB | only 7,868 to 7,288 tris; low-poly kits barely simplify |
| `gltf-transform optimize --compress draco --texture-compress webp` | **25 KB** | 22 KB | |
| `gltfpack -cc` | 79 KB | 42 KB | PNG kept |

**Whole deployed town set, per file (174 GLBs):**

| Set | before raw | gltfpack `-cc -tr` raw | gltfpack `-cc -tr -noq` raw |
|---|---|---|---|
| castle (76) | 2.08 MB | **0.41 MB** | 0.63 MB |
| minidungeon (30) | 0.90 MB | **0.24 MB** | 0.29 MB |
| variants (68) | 5.61 MB | 2.07 MB (mostly embedded PNGs) | 2.52 MB |

Running `gltf-transform optimize` per file *with* external textures made Kenney files bigger after gzip (castle 356 KB to
816 KB gz). The reason is that GLB output embeds the shared `Textures/colormap.png` into all 76 files. **Keep the colormap
external (`gltfpack -tr`) or pack a whole kit into one file.**

**Whole town set merged into one GLB:**

```
gltf-transform merge castle/*.glb minidungeon/*.glb variants/*.glb town.glb --merge-scenes false   # 6.96 MB, 3 s
gltf-transform dedup town.glb town-dedup.glb                                                       # 6.52 MB
gltfpack -i town-dedup.glb -o town-gp.glb -cc -kn -km                                              # 0.80 MB raw, 0.34 MB gz
```

That takes **174 requests and 8.6 MB raw down to 1 request and 0.80 MB**, or 0.34 MB if gzip is ever enabled. Four
colormap PNGs survived dedup because they are byte-different encodings. A purpose-built script would keep exactly one per
kit.

**High-poly stand-in.** No high-poly purchased model exists in `assets-local`, so I used Khronos `DamagedHelmet.glb`
(15.4 k tris, five 2048² JPEG textures, 3.77 MB):

| Output | raw | tris | notes |
|---|---|---|---|
| source | 3.77 MB | 15,452 | five 2048² textures = about 112 MB of GPU memory as RGBA8 with mips |
| desktop: `optimize --compress meshopt --texture-compress webp --texture-size 2048` | 1.44 MB | 15,188 | 7.6 s |
| mobile: `... --texture-size 1024 --simplify-ratio 0.5 --simplify-error 0.001` | 0.52 MB | 12,378 | GPU about 28 MB |
| mobile, Draco instead of meshopt | 0.43 MB | 12,378 | |
| low tier: `... --texture-size 512 --simplify-ratio 0.25 --simplify-error 0.01` | 0.21 MB | 4,507 | GPU about 7 MB |

**Decode cost.** I timed a full parse plus decode through gltf-transform's NodeIO in Node on desktop. These are relative
numbers only, and gltf-transform's own parse overhead dominates them:

| File | meshopt | Draco |
|---|---|---|
| variant | 9.6 ms | 22.1 ms |
| helmet, mobile variant | 11.4 ms | 38.7 ms |

Draco is consistently 2 to 3.5x slower. The meshopt author's native benchmark found about 100x faster decode
(0.19 ms vs 19 ms on one model, 1.9 ms vs 169 ms on Sponza)
([zeux gist](https://gist.github.com/zeux/b48678a44944187c16f55ad6cca45e78)). The WASM build is about 5x slower than
native SSSE3 ([zeux, "Small, fast, web"](https://zeux.io/2019/03/11/small-fast-web/)). The meshopt README states
"1-3 GB/s on modern desktop computers" with SIMD
([meshoptimizer js README](https://github.com/zeux/meshoptimizer/blob/master/js/README.md)).

**Decoder download cost (three@0.170.0 from jsDelivr, measured):**

| File | raw | gz |
|---|---|---|
| `libs/meshopt_decoder.module.js` | 24.9 KB | **6.4 KB** (WASM inlined) |
| `libs/draco/gltf/draco_decoder.wasm` + `draco_wasm_wrapper.js` | 251 KB | **75 KB** |
| `libs/basis/basis_transcoder.wasm` + `.js` | 585 KB | **260 KB** |
| `loaders/KTX2Loader.js` | 27 KB | 7 KB |

---

## 1. glTF optimisation tools (local, free)

Both tools are permissively licensed. glTF Transform is MIT; meshoptimizer/gltfpack is MIT. Basis Universal and
KTX-Software are Apache-2.0.

### 1.1 glTF Transform (`@gltf-transform/cli`, `@gltf-transform/functions`)

- **The one-shot command is `optimize`.** In v4.5.1 its defaults are:
  - `--compress meshopt`, `--texture-compress auto` (re-encodes in the original format), `--texture-size 2048`
  - `--simplify true` with `--simplify-error 0.0001`, `--weld true`
  - `--instance true`, `--join true`, `--flatten true`, `--palette true`, `--prune true`, `--resample true`

  Source: local `gltf-transform optimize -h`; [npm CLI](https://npmjs.com/package/@gltf-transform/cli). The docs warn
  that "defaults in the optimize command may not be ideal for all scenes"
  ([CLI docs](https://gltf-transform.dev/cli)).
- **Individual commands** ([CLI docs](https://gltf-transform.dev/cli)):
  - Scene: `instance`, `join`, `flatten`, `center`
  - Geometry: `draco`, `meshopt`, `quantize`, `weld`, `unweld`, `simplify`
  - Material: `palette`, `unlit`
  - Texture: `resize`, `etc1s`, `uastc`, `webp`, `avif`, `png`, `jpeg`
  - Package: `dedup`, `prune`, `merge`, `inspect`
- **The scripting API** (`@gltf-transform/functions`) exposes the same steps as `document.transform(...)` steps:
  - geometry and scene: `dedup()`, `prune()`, `weld()`, `simplify({simplifier: MeshoptSimplifier, ratio, error})`,
    `quantize()`, `meshopt({encoder: MeshoptEncoder})`, `draco()`, `instance()`, `join()`, `flatten()`, `palette()`,
    `center()`
  - textures: `textureCompress({encoder: sharp, targetFormat: 'webp', resize: [1024, 1024]})`
  - helpers: `mergeDocuments()`, `copyToDocument()`, `inspect()`

  This API is the right base for a project build step (section 5), because it can read license data from `extras` and
  write a manifest in the same script.
- **WebP and AVIF are encoded in-process** through sharp. **KTX2 (`etc1s`/`uastc`, `--texture-compress ktx2`) shells out
  to KTX-Software's `ktx`/`toktx`**, which has to be installed separately; it is not on this machine
  ([etc1s -h](https://gltf-transform.dev/cli); [KTX-Software](https://github.com/KhronosGroup/KTX-Software/)). With
  `ktx2`, optimize uses UASTC for normal, occlusion and metal-rough maps and ETC1S for the rest.

### 1.2 gltfpack (meshoptimizer)

- It does one thing very fast: about 40 s for all 174 town files through the npm WASM build. The native binary is faster,
  handles bigger files and includes BasisU/WebP encoding
  ([gltfpack README](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)).
- **Key flags** (local `gltfpack -h`):
  - compression: `-c`, `-cc` (higher ratio, meant to be followed by gzip), `-cz` (KHR_meshopt_compression, maximum)
  - simplification: `-si R` (ratio), `-se E` (error, default 1%), `-slb` (lock borders), `-sa` (aggressive)
  - textures: `-tc` (KTX2 ETC1S), `-tu` (UASTC), `-tw` (WebP), `-tl N` (max size), `-ts R` (scale),
    `-tr` (keep external texture paths)
  - scene: `-mi` (EXT_mesh_gpu_instancing), `-kn` / `-km` (keep named nodes and materials)
  - vertex precision: `-noq` (no quantization), `-vpf` (float positions), `-vp/-vt/-vn N` (quantization bits)

### 1.3 What pays off for which kind of model

| | Kenney-style low-poly kits (lots of tiny files, one shared colormap) | High-poly purchased model (few files, big textures) |
|---|---|---|
| Biggest win | **Fewer requests** (pack a kit into 1 file) and **weld + quantize + meshopt** (5 to 10x smaller raw). Keep the one colormap external or shared. | **Textures**: resize per tier, then WebP (download) or KTX2 (GPU memory). Textures are usually 70 to 90% of bytes and GPU memory. |
| Simplify | Little gain (7,868 to 7,288 tris at 0.1% error). Use it only for far LODs, with `--simplify-lock-border`. | Large gain for mobile tiers: ratio 0.5 at error 0.001, or 0.25 at 0.01 for low tier. |
| Geometry codec | **meshopt**: many small meshes, tiny decoder (6 KB), fast decode. | Draco is about 20% smaller than meshopt here (0.43 vs 0.52 MB) but needs a 75 KB decoder and decodes 2 to 3x slower. Prefer meshopt unless the model is geometry-dominated and few in number. |
| Texture codec | Keep PNG (7.5 KB colormap, `NearestFilter`). KTX2 would cost 260 KB of transcoder to save nothing. | WebP for download size. KTX2 ETC1S/UASTC when GPU memory is the limit (iPhone, section 2). |

This agrees with the rule of thumb "Draco for 1–3 hero models … meshopt for 50+ small meshes"
([svilenkovic](https://www.svilenkovic.com/3d/draco-vs-meshopt)).

### 1.4 three.js r170 loader setup

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';   // EXT_meshopt_compression, r122+
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';                // KHR_texture_basisu
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';              // only if a Draco asset ships

const ktx2 = new KTX2Loader().setTranscoderPath('vendor/three/examples/jsm/libs/basis/').detectSupport(renderer);
const draco = new DRACOLoader().setDecoderPath('vendor/three/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)   // GLTFLoader uses decodeGltfBufferAsync when present (r170 checks for it)
  .setKTX2Loader(ktx2)                 // lazy: the 260 KB transcoder only downloads when a KTX2 texture appears
  .setDRACOLoader(draco);              // DRACOLoader decodes in Web Workers
```

- `KHR_mesh_quantization` is native in three.js since r111. `EXT_meshopt_compression` needs `setMeshoptDecoder` (r122+)
  ([gltfpack README](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)).
- `KTX2Loader.detectSupport(renderer)` must be called before loading
  ([KTX2Loader docs](https://threejs.org/docs/pages/KTX2Loader.html),
  [basis libs](https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/README.md)).
- The meshopt decoder has `useWorkers(n)` and `decodeGltfBufferAsync`. Calling `MeshoptDecoder.useWorkers(2)` once moves
  decode off the main thread
  ([meshoptimizer js README](https://github.com/zeux/meshoptimizer/blob/master/js/README.md)).
- **Project-specific trap: quantized geometry breaks the runtime code.** `kenney()` and `kenneyScene()` call
  `geometry.clone().applyMatrix4()`, `toNonIndexed()`, `mergeGeometries()` and rewrite UVs with `setXY()`. With gltfpack's
  default quantization, positions are integer `Uint16` with a dequantizing node transform, normals are `Int8`, and UVs
  are `Uint16` normalized. Writing transformed floats back into those arrays corrupts the geometry, and
  `mergeGeometries` refuses mixed array types. Either:
  - (a) move that processing to build time, so the runtime never edits geometry. This is recommended (section 5) and
    removes CPU work anyway. Or
  - (b) build with `-noq` / `--compress meshopt` plus float positions (`gltfpack -vpf`). That is meshopt without
    quantization: still about 3x smaller raw, but loses roughly a third of the gain.

---

## 2. Texture strategy for mobile

**GPU memory is what kills iPhone tabs, not download size.** A PNG, JPEG or WebP is decoded to RGBA8 on the GPU:
`w*h*4*1.33` with mips, so **22 MB per 2048² texture**, 5.6 MB at 1024² and 1.4 MB at 512². WebP shrinks the download but
**not** GPU memory.

KTX2/Basis transcodes on the device to a GPU block format (ASTC/ETC2 on iPhone, BC on desktop) at 4 to 8 bits per pixel.
That is about **4 to 8x less GPU memory**, and it uploads without a decode step
([gltf-transform etc1s -h](https://gltf-transform.dev/cli);
[Needle docs](https://engine.needle.tools/docs/how-to-guides/optimization/compress-textures)).

- **ETC1S vs UASTC.**
  - ETC1S gives the smallest files (one write-up reports 70 to 90% size cuts) at lower quality, with fringing on
    high-contrast edges.
  - UASTC is higher quality (40 to 50% cuts) and is the choice for normal, ORM and data maps.
  - The common split is ETC1S for base colour and emissive, UASTC for normal, metallic-roughness and AO
    ([paradowski](https://paradowski.com/stories/introducing-zencompress-for-gltf),
    [Needle](https://engine.needle.tools/docs/how-to-guides/optimization/compress-textures),
    [three.js forum](https://discourse.threejs.org/t/compressed-textures-using-more-memory-than-uncompressed-textures/30077/5)).
  - After transcoding, both use similar GPU memory. Spector.js and stats.js mis-report compressed sizes (same forum
    thread).
- **Transcoder cost.** The Basis transcoder is 260 KB gz (measured). That is worth paying only when a game ships tens of
  MB of textures, which means purchased/PBR models and not Kenney kits. For pixel-art and colormap textures with
  `NearestFilter`, block compression smears the swatches, so keep PNG for those.
- **iOS Safari limits.** No official numbers exist. Field reports:
  - A per-tab ceiling of roughly 500 MB on a 4 GB iPhone ([Apple forums](https://developer.apple.com/forums/thread/741624),
    [Unity forum](https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771)).
  - Pages with many textures get killed and reloaded, sometimes in a loop
    ([WebKit 300782](https://bugs.webkit.org/show_bug.cgi?id=300782),
    [WebKit 232357](https://bugs.webkit.org/show_bug.cgi?id=232357)).
  - Memory not freed across navigations ([WebKit 290623](https://bugs.webkit.org/show_bug.cgi?id=290623)), and context
    loss on iOS 17 and 18
    ([three.js forum](https://discourse.threejs.org/t/three-js-broken-on-ios-17-with-context-lost/58025),
    [WebKit 289601](https://bugs.webkit.org/show_bug.cgi?id=289601)).
  - Developers stabilise with 512² compressed textures and separate mobile builds
    ([Unity forum](https://discussions.unity.com/t/webgl-deliver-for-all-platforms-including-iphones-930374/930374)).
  - **Practical budget: about 150 to 250 MB of total GPU resources on a phone tier.** Handle `webglcontextlost`, and call
    `renderer.dispose()` / `forceContextLoss()` when leaving a game (this matters for the studio iframe).
- **Max sizes per tier.** 4096 is near-universal and only about half of devices exceed it
  ([webglfundamentals](https://webglfundamentals.org/webgl/lessons/webgl-cross-platform-issues.html)). Recommended:
  - desktop: 2048 max
  - mobile: 1024 max (base colour), 512 for secondary maps
  - low: 512 max

  Keep power-of-two sizes so mips work everywhere (`gltfpack -tp`; gltf-transform resize keeps aspect ratio).
- **Mipmaps.** Required for minified textures (aliasing and bandwidth). KTX2 carries pre-built mips (`toktx --genmipmap`;
  gltf-transform passes this through). PNG/WebP mips are generated on upload, which costs GPU time on the first frame.
  The title town's colormap correctly uses `NearestFilter` and no mips.
- **Use `renderer.initTexture(tex)`** to upload during loading rather than on the first frame
  ([WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)).

---

## 3. LOD and device tiers

### 3.1 What the browser exposes, especially on iPhone

| Signal | Chrome/Android | iOS Safari | Use |
|---|---|---|---|
| `navigator.deviceMemory` | yes (0.25 to 8, bucketed) | **not supported** ([caniuse](https://caniuse.com/mdn-api_navigator_devicememory), [web-features](https://web-platform-dx.github.io/web-features-explorer/features/device-memory)) | Android/desktop only |
| `navigator.hardwareConcurrency` | real count | **clamped** for privacy; sources disagree on 2 or 4/8 ([WebKit 233381](https://bugs.webkit.org/show_bug.cgi?id=233381), [caniuse](https://caniuse.com/hardwareconcurrency)) | weak signal |
| `WEBGL_debug_renderer_info` | real GPU string | **"Apple GPU"** since Safari 14 ([detect-gpu #25](https://github.com/pmndrs/detect-gpu/issues/25)) | desktop/Android only |
| `matchMedia('(pointer: coarse)')`, `devicePixelRatio`, `screen.width*height` | yes | yes | identify phone/tablet; DPR 3 phones need capping |
| `gl.getParameter(MAX_TEXTURE_SIZE)`, `getSupportedExtensions()` | yes | yes | capability checks (KTX2 formats via `KTX2Loader.detectSupport`) |
| runtime frame time | yes | yes | **the only reliable signal on iPhone** |

**detect-gpu** (pmndrs, MIT) maps renderer strings to gfxbench fps tiers: 0 below 15 fps, 1 at 15+, 2 at 30+, 3 at 60+.
On iOS it falls back to screen-size heuristics. Its data can be self-hosted (`benchmarksURL`), but the README notes that
**gfxbench stopped updating in December 2025**, so newer GPUs will drift
([detect-gpu](https://github.com/pmndrs/detect-gpu)).

### 3.2 Recommended tiering for this project

Keep it simple: three tiers picked at startup, then adjusted at runtime.

```js
const coarse = matchMedia('(pointer: coarse)').matches, iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
const mem = navigator.deviceMemory ?? (coarse ? 4 : 8);
let tier = !coarse && mem >= 8 ? 'desktop' : (mem <= 2 || (navigator.hardwareConcurrency || 4) <= 2 && !iOS) ? 'low' : 'mobile';
if (new URLSearchParams(location.search).get('tier')) tier = ...;   // override for testing and screenshots
renderer.setPixelRatio(Math.min(devicePixelRatio, { desktop: 2, mobile: 1.5, low: 1 }[tier]));
```

Then **adapt at runtime**. Time about 60 frames after the first render. If the median is above 22 ms, drop DPR one step
(1.5, then 1.25, then 1). If it is still slow, switch off the costly extras (shadows, scene effects) and remember the
result in `localStorage`. city.js already caps DPR at 1.25 when embedded on coarse pointers. Making that general is a
cheap win.

### 3.3 How projects ship per-tier variants

- **A manifest beats parallel folders.** The build writes `assets/manifest.json` mapping a logical id
  (`castle/tower-base`) to `{desktop: 'castle.desktop.<hash>.glb#tower-base', mobile: ..., low: ...}` along with sizes
  and licence data. The runtime resolves ids through it. Parallel folders (`models/` and `models-mobile/`) work, but they
  break as soon as a tier has no override, and they cannot carry hashes or licences.
- **Tiers only where they differ.** Kenney kits need no geometry tiers at all: the same packed kit serves every tier, and
  only DPR and effects change. High-poly models get `desktop` (2048 tex, full mesh), `mobile` (1024, ratio 0.5) and `low`
  (512, ratio 0.25), with a fallback chain `low → mobile → desktop`.
- **Distance LODs** (THREE.LOD or per-instance swap) are a separate axis. They are worth it for high-poly models seen
  from far away. gltf-transform `simplify` and gltfpack `-si` generate them. Ship them as extra meshes in the same file,
  or use `MSFT_lod`, which three.js does not load natively, so a custom mesh-name convention (`name_LOD1`) is simpler.

---

## 4. Load-time techniques beyond asset bytes

Ordered by measured or likely impact on the title town.

1. **Fetch in parallel; never await assets in a loop.** Measured: 34.6 s to 22.3 s (section 0.1). Start every asset
   fetch at the top of the module, before terrain work begins, so network and CPU overlap. A single packed kit file makes
   this automatic.
2. **Bake deterministic setup at build time.** This is already done for terrain and trees (`tools/bake.mjs`). Extend it
   to:
   - **`kenney()`'s per-model processing**: merge, centre, strip attributes, per-triangle UV averaging. Do it once in
     Node with gltf-transform, emitting the final geometry. Better still, snap UVs to colormap texel centres instead of
     averaging, so identical swatches weld and vertex count drops.
   - The **house plan, street meshes and wall placements**. The `plan` stage (2.3 s at 4x) is the same on every load,
     since it runs on a fixed `rng(33)`. It can bake to a compact instance table (model id, x, z, rot, scale, roof
     colour) and to one merged street/bridge mesh.
   - **Scene fractures.** The two scenes fracture houses at setup. Precompute the fragment geometry offline and ship it
     in the kit file.
3. **Shader pre-compilation.** The 3.4 to 3.7 s `frame0` stage is mostly first-render program compile and upload.
   - Call `await renderer.compileAsync(scene, camera)` before the first render. It "resolves when the given scene can be
     rendered without unnecessary stalling due to shader compilation" and uses `KHR_parallel_shader_compile`
     ([WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html),
     [three.js PR #19752](https://github.com/mrdoob/three.js/pull/19752)).
   - Safari has shipped the extension since iOS 14.5
     ([web-features](https://web-platform-dx.github.io/web-features-explorer/features/khr-parallel-shader-compile.json)),
     **but `linkProgram` still blocks on Safari's Metal/ANGLE backend**
     ([WebKit 251514](https://bugs.webkit.org/show_bug.cgi?id=251514), status unconfirmed). So on iPhone, expect it to
     move the stall rather than remove it. The real fix there is **fewer distinct programs**:
     - Share one `ShaderMaterial` instance per kit, with the colormap as a uniform. Today `kitMat()` creates one per
       model. three.js caches the compiled program by source, so these are mostly cheap, but each still pays uniform
       setup.
     - Avoid `onBeforeCompile` variants and keep `defines` stable.
   - Show the poster while it compiles (item 7).
4. **Fewer draw calls.** One InstancedMesh per model is right (`flush()`). Next steps:
   - Pack all kit meshes into one geometry and use **`THREE.BatchedMesh`** (r159+). That gives one draw call for every
     kit model with per-instance matrices and colours, which suits the town's roughly 100 model types.
   - Check `renderer.info.render.calls` (city.js already exposes it in `__info`). Under about 150 calls is comfortable on
     iPhone.
   - `gltf-transform join` / `gltfpack -mm` do static merging at build time.
5. **Web Workers.** Move CPU-heavy, deterministic geometry work off the main thread: terrain mesh build, fracture,
   whatever cannot be baked. Return transferable `ArrayBuffer`s and build the `BufferGeometry` on the main thread
   (cheap). `MeshoptDecoder.useWorkers(2)` does the same for decode. OffscreenCanvas rendering in a worker is possible
   but complicates input and audio; not worth it here.
6. **Progressive streaming.**
   - Stage 1 (under about 1 s): sky, terrain and the castle silhouette from a tiny "core" kit.
   - Stage 2: houses.
   - Stage 3: scenes, effects and sound.

   city.js already shows the town before the scenes. Push the cut earlier: post `town-ready` after terrain plus castle,
   and fade houses in as their batch lands.
7. **Poster or looping preview first.** On the studio menu, show a still (WebP, about 60 KB) or a short looping MP4/WebM
   of the town immediately (render it with `tools/capture.mjs`), then crossfade to live WebGL when ready. On a phone the
   perceived load becomes about 1 s. A video also needs no GPU warm-up. `<video muted playsinline autoplay loop>`
   autoplays on iOS.
8. **Compress what Netlify will not.** GLB and BIN go out raw (Finding 2). For non-glTF binaries such as `terrain.bin`:
   - Quantize the data itself (heights as `Int16`, colours as `Uint8`), or
   - ship `terrain.bin.gz` and inflate it with
     `new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()` (Safari 16.4+).

   That takes 1.41 MB to 0.77 MB with gzip alone, before quantizing. For GLB, meshopt in the file already does the job.
   Alternatively, test whether a `Content-Type: model/gltf-binary` header in `_headers` makes Netlify compress. That is
   unverified.
9. **Cache that survives deploys.** Content-hash the asset file names (`castle.<hash>.glb`) and keep a separate
   long-lived cache (`ogm-assets`) in `sw.js` that is not wiped per BUILD. Serve `/town/models/*` with
   `Cache-Control: public, max-age=31536000, immutable`.
10. **JS bundle.** It is 784 KB, brotli on the wire, and costs about 1 s of parse at 4x. Code-split the scenes
    (`rampage.js`, `earthbound.js`, fx) behind dynamic `import()` so they load after first paint.

---

## 5. Recommended pipeline for Open Game Maker 2000

### 5.1 Shape

```
assets-local/packs/<pack>/<ver>/extracted/...            (originals, never touched)
            │  game declares what it uses: game/assets.json   ["castle/tower-base", "minidungeon/barrel", "variants/house-32", ...]
            ▼
tools/assets/build.mjs  (Node, @gltf-transform/core + functions + meshoptimizer + sharp; KTX-Software optional)
   1. resolve each id → source file + pack licence record (from the catalog / intake data)
   2. per source:  dedup → prune → weld → (kit only: bake runtime transforms, snap UVs) → resample
   3. group: Kenney-style kits → one GLB per kit (one mesh per model, named by id, one shared colormap)
             high-poly models → one GLB per model per tier
   4. per tier:  simplify (ratio/error per tier) → texture resize (2048/1024/512) → webp or ktx2 → quantize → meshopt
   5. content-hash file names; write public/assets/manifest.json
   6. report: bytes per tier, tris per tier, GPU-texture MB per tier; fail the build if the mobile tier exceeds budget
            ▼
runtime: assets.ts  →  pickTier()  →  load(id) resolves through manifest, fetches each needed file once (in parallel),
                       returns {geometry, material, bounds}; KTX2 transcoder only loaded if the manifest says a file needs it
```

Run it from each game's build (`build.sh`), not at runtime. Cache outputs by `(source hash, recipe hash)` so rebuilds take
seconds. The variant generator (`tools/variants.mjs`) should write its output into the same pipeline, so its 773 KB
GLTFExporter files never ship.

### 5.2 Manifest (licence and usage carried along)

```json
{
  "version": 1, "built": "2026-10-31T12:00:00Z",
  "tiers": ["desktop", "mobile", "low"],
  "files": {
    "kit-castle.3f9a1c.glb": { "bytes": 412000, "tris": 38000, "gpuTexMB": 1.4, "decoders": ["meshopt"] },
    "monster-yeti.mobile.a81e.glb": { "bytes": 98000, "tris": 4200, "gpuTexMB": 1.4, "decoders": ["meshopt"] }
  },
  "assets": {
    "castle/tower-base": {
      "file": { "*": "kit-castle.3f9a1c.glb" }, "mesh": "castle/tower-base",
      "bounds": [1.0, 1.31, 1.0],
      "source": { "pack": "kenney-castle-kit", "version": "2.0", "path": "Models/GLB format/tower-base.glb", "sha1": "…" },
      "license": { "id": "CC0-1.0", "attribution": "Kenney (kenney.nl)", "use": "any" }
    },
    "monsters/yeti": {
      "file": { "desktop": "monster-yeti.desktop.c02d.glb", "mobile": "monster-yeti.mobile.a81e.glb", "low": "monster-yeti.mobile.a81e.glb" },
      "source": { "pack": "quaternius-ultimate-monsters", "version": "1.0", "path": "glb/Yeti-ceRHr.glb" },
      "license": { "id": "CC0-1.0", "attribution": "Quaternius", "use": "any" }
    }
  }
}
```

- Licence fields come from the existing intake records (`gm-asset-intake`).
- The build also writes the licence into each output GLB's `asset.extras`, so the file stays self-describing.
- A game's credits screen can be generated straight from `assets.*.license`.
- Personal-licence packs (Synty, Sidetrax) keep `"use": "personal"`. The deploy step can refuse to publish those
  publicly if that rule is ever wanted, matching how `deploy.sh` already strips Synty previews.

### 5.3 Exact commands

**(a) Kenney-style low-poly kit.** Pack it, keep the shared colormap, meshopt. No simplify and no texture recompress
(the colormap is 7.5 KB of PNG with `NearestFilter`):

```bash
# whole kit (or the subset a game uses) into one file, one named mesh per model
gltf-transform merge kit/*.glb kit.glb --merge-scenes false
gltf-transform dedup kit.glb kit.glb
gltf-transform prune kit.glb kit.glb
gltf-transform weld  kit.glb kit.glb
gltf-transform meshopt kit.glb kit-castle.glb --level high          # quantize + EXT_meshopt_compression
# equivalent single step with gltfpack (fastest; keeps names so the runtime can find each model):
gltfpack -i kit.glb -o kit-castle.glb -cc -kn -km
# if the runtime must still edit geometry (today's kenney()), avoid integer positions:
gltfpack -i kit.glb -o kit-castle.glb -cc -kn -km -vpf
# per-file alternative that keeps the external colormap (no merge):
gltfpack -i tower-base.glb -o out/tower-base.glb -cc -tr
```

Expected for the title town:

- 174 files and 8.6 MB raw become **4 kit files of about 0.8 MB raw in total** (0.34 MB gz), measured.
- About 7.8 MB less to download. At 10 Mbit/s that is roughly **6 s of transfer saved** on a first visit, plus about 170
  fewer requests.
- Variant files individually: 773 KB becomes 72 KB (meshopt, WebP) or 25 KB (Draco).
- CLI time: gltfpack about 0.2 s per file, gltf-transform about 1.5 s per file (Node start-up). Use the API in one
  process for batches: 174 separate CLI calls took 5.4 min, while one merge plus gltfpack took about 5 s.

For the build-time `kenney()` port, use the gltf-transform API. Per model:

1. `flatten` + `join` (merge meshes)
2. `transformPrimitive` (centre on the base)
3. remove attributes other than POSITION, NORMAL and TEXCOORD_0
4. `unweld`, set each triangle's UV to its colormap texel centre, then `weld`
5. write the bounds (`w, d, h`) into `mesh.extras`

The runtime then does `new InstancedMesh(gltf.meshes[id].geometry, kitMat)` with no per-triangle JS.

**(b) Typical high-poly purchased model.** Three tiers:

```bash
SRC=model.glb
# desktop: full mesh, 2048 textures, WebP (or KTX2 if GPU memory matters on desktop too)
gltf-transform optimize $SRC out/model.desktop.glb --compress meshopt --texture-compress webp --texture-size 2048 \
  --simplify-error 0.0001
# mobile: half the triangles where error allows, 1024 textures, KTX2 (ETC1S colour, UASTC normal/ORM)
gltf-transform optimize $SRC out/model.mobile.glb --compress meshopt --texture-compress ktx2 --texture-size 1024 \
  --simplify-ratio 0.5 --simplify-error 0.001 --simplify-lock-border true
# low: a quarter of the triangles, 512 textures
gltf-transform optimize $SRC out/model.low.glb --compress meshopt --texture-compress ktx2 --texture-size 512 \
  --simplify-ratio 0.25 --simplify-error 0.01 --simplify-lock-border true
# without KTX-Software installed, use --texture-compress webp for mobile/low (smaller download, but full RGBA in GPU memory)
# animated/skinned models: add --join false --flatten false --instance false so rigs and named nodes survive
# gltfpack equivalent for mobile: gltfpack -i $SRC -o out/model.mobile.glb -cc -si 0.5 -se 0.001 -slb -tc -tu normal,attrib -tl 1024 -kn
```

Expected, measured on DamagedHelmet with WebP:

| Tier | Download | Triangles | GPU textures |
|---|---|---|---|
| source | 3.77 MB | 15.4 k | about 112 MB |
| desktop | 1.44 MB | 15.2 k | |
| mobile | 0.52 MB | 12.4 k | about 28 MB as RGBA, **about 4 to 7 MB as KTX2** |
| low | 0.21 MB | 4.5 k | about 7 MB as RGBA, about 1 to 2 MB as KTX2 |

Processing takes about 7 s per model per tier on this machine.

### 5.4 Runtime loader sketch (TypeScript)

```ts
// assets.ts
import manifest from './assets/manifest.json';
const tier = pickTier();                                   // section 3.2
const files = new Map<string, Promise<GLTF>>();
const fileFor = (id: string) => { const f = manifest.assets[id].file; return f[tier] ?? f.mobile ?? f.desktop ?? f['*']; };
const loadFile = (name: string) => files.get(name) ?? (files.set(name, loader.loadAsync(`assets/${name}`)), files.get(name)!);
export async function preload(ids: string[]) { await Promise.all([...new Set(ids.map(fileFor))].map(loadFile)); }   // parallel, deduped
export async function mesh(id: string) { const g = await loadFile(fileFor(id)); return g.scene.getObjectByName(manifest.assets[id].mesh ?? id) as THREE.Mesh; }
```

### 5.5 Budgets the build should enforce (mobile tier)

These are starting points; tune them on Kevin's iPhone.

- First-view download under 2 MB.
- Under 30 requests before first frame.
- Under 300 k visible triangles.
- Under 150 draw calls.
- Under 100 MB of GPU textures.
- No texture above 1024.
- First frame under 5 s at 4x CPU with 100 ms / 10 Mbit/s.

Add a `tools/loadtime.mjs` network-throttle mode, as used here, so the budget checks real RTT and not just CPU.

### 5.6 Ranked plan for the title town

| # | Change | Effort | Expected impact |
|---|---|---|---|
| 1 | Prefetch all models in parallel (no `await` in loops in `buildHouses`/`flush`) | minutes | **measured -12 s** (34.6 to 22.3 s) at 100 ms / 10 Mbit/s |
| 2 | Pack the town's 174 GLBs into 4 kit files with weld + meshopt, colormap shared | hours | 8.6 MB to 0.8 MB raw, about 170 fewer requests; about -6 s at 10 Mbit/s, more on slow 4G |
| 3 | Bake `kenney()` processing (and fix the variants' bloat) at build time | hours | removes per-triangle JS and avoids the quantization trap; CPU estimate -1 to 3 s at 4x (not measured) |
| 4 | Poster/loop video on the studio menu while the town loads | hours | perceived load about 1 s on phones |
| 5 | Content-hashed asset names + asset cache that survives deploys | an hour | repeat visits after a deploy re-download nothing that did not change |
| 6 | `compileAsync` before first render; one shared kit material | an hour | hides part of the 3.5 s first-frame stall (less on Safari, see WebKit 251514) |
| 7 | Bake the house plan, streets and fractures; `terrain.bin` quantized or gzip+DecompressionStream | a day | -2 to 4 s CPU at 4x (plan 2.3 s, terrain 2.2 s); about -0.7 MB |
| 8 | Device tier + adaptive DPR (general for all games) | hours | steadier frame rate on phones; protects against GPU-memory reloads |
| 9 | Code-split scenes out of the 784 KB bundle | hours | about -0.5 s parse at 4x |
| 10 | KTX2 textures | when the first PBR/purchased model ships | 4 to 8x less GPU texture memory; not useful for Kenney kits |

---

## Sources

- glTF Transform CLI: https://gltf-transform.dev/cli ; npm: https://npmjs.com/package/@gltf-transform/cli ; extensions (KHR_texture_basisu): https://gltf-transform.dev/extensions.html
- gltfpack README: https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md
- meshoptimizer JS README (decoder speed, useWorkers): https://github.com/zeux/meshoptimizer/blob/master/js/README.md
- meshopt vs Draco native benchmark: https://gist.github.com/zeux/b48678a44944187c16f55ad6cca45e78 ; WASM decoder: https://zeux.io/2019/03/11/small-fast-web/
- Draco vs meshopt guidance: https://www.svilenkovic.com/3d/draco-vs-meshopt
- three.js WebGLRenderer (compile, compileAsync, initTexture): https://threejs.org/docs/pages/WebGLRenderer.html ; compileAsync PR: https://github.com/mrdoob/three.js/pull/19752
- three.js KTX2Loader: https://threejs.org/docs/pages/KTX2Loader.html ; basis libs README: https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/README.md
- KHR_parallel_shader_compile support: https://web-platform-dx.github.io/web-features-explorer/features/khr-parallel-shader-compile.json ; MDN: https://developer.mozilla.org/docs/Web/API/KHR_parallel_shader_compile ; Safari linkProgram blocking: https://bugs.webkit.org/show_bug.cgi?id=251514
- ETC1S vs UASTC: https://engine.needle.tools/docs/how-to-guides/optimization/compress-textures ; https://paradowski.com/stories/introducing-zencompress-for-gltf ; https://discourse.threejs.org/t/compressed-textures-using-more-memory-than-uncompressed-textures/30077/5
- iOS memory and crashes: https://developer.apple.com/forums/thread/741624 ; https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771 ; https://discussions.unity.com/t/webgl-deliver-for-all-platforms-including-iphones-930374/930374 ; https://bugs.webkit.org/show_bug.cgi?id=300782 ; https://bugs.webkit.org/show_bug.cgi?id=232357 ; https://bugs.webkit.org/show_bug.cgi?id=290623 ; https://bugs.webkit.org/show_bug.cgi?id=289601 ; https://discourse.threejs.org/t/three-js-broken-on-ios-17-with-context-lost/58025
- Texture size support: https://webglfundamentals.org/webgl/lessons/webgl-cross-platform-issues.html
- deviceMemory: https://caniuse.com/mdn-api_navigator_devicememory ; https://web-platform-dx.github.io/web-features-explorer/features/device-memory
- hardwareConcurrency: https://caniuse.com/hardwareconcurrency ; https://bugs.webkit.org/show_bug.cgi?id=233381
- detect-gpu: https://github.com/pmndrs/detect-gpu ; Apple GPU obfuscation: https://github.com/pmndrs/detect-gpu/issues/25
- Netlify compression: https://answers.netlify.com/t/automatically-compress-served-content/31253 ; https://www.netlify.com/blog/2020/05/20/gain-instant-performance-boosts-as-brotli-comes-to-netlify-edge/
- Test model: Khronos glTF Sample Assets, DamagedHelmet (CC BY 4.0): https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/DamagedHelmet

## Caveats

- Load timings come from desktop Chromium with 4x CPU and emulated network, not a real iPhone. The relative gains should
  hold, but absolute seconds will differ.
- The parallel-prefetch test patched the minified bundle. The `buildHouses` patch prefetched every variant in each
  changing house's set, which is a few more models than strictly needed. The file count stayed at 80, so the effect was
  negligible.
- Decode timings in Node include gltf-transform's parse overhead. They show the ratio between meshopt and Draco, not
  absolute phone decode cost.
- KTX2 GPU-memory figures are calculated from block-format bit rates, not measured. KTX-Software is not installed here,
  so the KTX2 commands were not run.
- Netlify might compress GLB if served with a different `Content-Type`. Not tested, to avoid spending a deploy.
