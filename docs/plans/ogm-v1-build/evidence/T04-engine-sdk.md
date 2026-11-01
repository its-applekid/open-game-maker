# T04 engine-sdk: evidence packet

Researched at `9508c1c` (branch `research`, 2026-10-31). aiur reference `0f692a45b`. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

The game-side runtime (`@gm/sdk` over Three.js r186 + Rapier and Phaser 4.2), the host-side game frame (`@gm/host`: iframe, bridge, input, viewport), the message contract between them (manifest, design overrides, lifecycle, test hooks), camera rigs, device-tier asset loading, audio, the multiplayer client hooks, and the conformance suite.
Out of scope here: the editor UI (T09), the transaction log and override storage (T08), the room protocol (T07), the asset build/import (T05), the `gm-*` skills (T10).

## 2. Evidence packets

### E04-1: The engine–editor contract is message-based by decision, and the transport is a hand-written ~150-line MessageChannel bridge
- Claim / current behavior: Decision log "Stack" row: keep the contract (manifest, design overrides, test hooks) message-based so a second runtime stays possible. A4 §4 rule 5: hand-write the bridge (hello with origin check, transfer a `MessageChannel` port, `id`-correlated request/response); Comlink is the wrong shape for an allowlist, Penpal fails the 1k-star rule (567★).
- Source and exact locus: `docs/spec/game-maker-2000-v0.5-decisions.md` "Stack"; `docs/research/v0.3/A4-engine-sdk-editor.md` §4 (lines 63–91), §14 "Reusable packages".
- Why it matters: it fixes the package split (bridge separate from the SDK) and the validation point (host validates every inbound message with Zod).
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: `packages/iframe-bridge` has no game concepts; `packages/engine-contracts` holds the Zod schemas; both are hot write surfaces shared with T07, T08, T09.

### E04-2: Two naming lineages exist for the test hooks; the prototype proved `tick(seconds)`, the release plan names `render_game_to_text` and `advanceTime`
- Claim / current behavior: `prototypes/ui-v0/site/js/dungeon.js:861-865` defines `tick(sec)` (fixed 1/60 s steps without rendering, then one render) and exposes `window.__ogm = { tick, tileToScreen, map, mode, startPlay, stopPlay, attack, use, player, foes }`; `tools/e2e.mjs` drives the whole loop through it. The release plan "Engineering" row and B14 name `render_game_to_text()` (JSON of player-relevant state with a coordinate note) and `advanceTime(ms)`, taken from openai `develop-web-game`, whose fallback `advanceTime` waits real rAF frames.
- Source and exact locus: `dungeon.js:861-865`; `prototypes/ui-v0/tools/e2e.mjs:37-55`; `docs/spec/release-plan.md` §2 "Engineering"; `docs/research/v0.4/B14-skills/pipeline-and-design.md:150-175`; `docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §3.1–3.2 (fixed timestep, seeded RNG, `state()` must be the save serializer).
- Why it matters: `gm-verify` (T10) and the conformance suite are written against these names; two spellings would split the skills.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: the prototype's hook is a global in every build; A4 §4 rule 4 says the debug adapter is reachable only in draft/test builds and never a global in published builds.
- Suggested requirement/decision impact: one `GmTestHooks` type (§4): `advanceTime(ms)` is `tick` in milliseconds; `renderGameToText()` returns the same JSON as the save serializer plus a `coords` note; both are reachable over the bridge (`test.*` messages) and, in draft/test builds only, as `window.render_game_to_text` and `window.advanceTime` for the develop-web-game-derived client. Published builds strip the globals (conformance check 8).

### E04-3: The title town proved a second deterministic hook: capture mode draws any absolute time
- Claim / current behavior: `?capture` stops the clock; `window.__frame(t)` draws loop time `t`; `window.__ready` gates the harness; `window.__tap(x, y)` tests hit targets; `window.__marks` records load stages; `window.__info()` returns draw calls and triangles. `tools/capture.mjs` makes stills, tiled timelines and H.264 clips from it; `taptest.mjs` and `loadtime.mjs` use the same hooks. The scenes are written so everything is a pure function of time ("capture mode is exact", `rampage.js:6`).
- Source and exact locus: `prototypes/title-city/city.js:16, 877, 916, 943-958`; `prototypes/title-city/tools/capture.mjs`, `taptest.mjs`, `loadtime.mjs`; `.claude/skills/gm-verify/SKILL.md` "Look".
- Why it matters: `gm-verify`'s clip and timeline tooling already depends on these names; the SDK should provide them for every game, not only hand-written scenes.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: `__frame(t)` is absolute time, `tick(sec)` is relative; games with physics cannot jump backwards.
- Suggested requirement/decision impact: `GmTestHooks.renderAt(tMs)` = reset to the last keyframe plus `advanceTime` forward, render once; `ready`, `marks`, `renderInfo()` and `hitTest(nx, ny)` join the hook type so `capture.mjs` ports unchanged.

### E04-4: Headless WebGL on this machine runs on the Intel GPU through ANGLE, not SwiftShader
- Claim / current behavior: C1 measured SwiftShader at 1–2 fps. `gm-verify` and `capture.mjs` launch Chromium with `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist`; C4's load timings were produced that way. The render node `/dev/dri/renderD128` carries an ACL granting `orangekid` rw [M]. Playwright 1.64.1 with Chromium builds 1228 and 1248 is installed under `~/.cache/ms-playwright` [M]; `ffmpeg` is at `/usr/bin/ffmpeg` [M].
- Source and exact locus: `.claude/skills/gm-verify/SKILL.md` line 10; `prototypes/title-city/tools/capture.mjs:17`; `docs/research/v0.5/C1-ui-prototype-learnings.md` §6; host checks `getfacl /dev/dri/renderD128`, `ls ~/.cache/ms-playwright`.
- Why it matters: verification and conformance runs here are GPU-accelerated; the E2B/Railway assumption of software GL (A9 §3.5) no longer holds. It also means the agents' verify jobs compete for one iGPU (T11).
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: `gm-verify` still cannot measure phone frame rates (C2 §3 caveat).
- Suggested requirement/decision impact: the conformance runner and `gm-verify` default to the GPU flags; a `GM_VERIFY_SOFTWARE_GL=1` fallback keeps SwiftShader for sandboxes without `/dev/dri`.

### E04-5: The prototypes' iframe messaging is untyped and unchecked; it is evidence of the needed message set, not reusable code
- Claim / current behavior: parent → game: `{ogm:'play'|'edit'}`, `{tap:[x,y]}`, the strings `'pause'`/`'resume'`; game → parent: `{ogm:'start'}`, `'town-ready'`, `{sfx:[name,vol,rate]}`, `{loop:[name,gain]}`. All use `postMessage(…, '*')`; the only check is `e.source === f.contentWindow`. The studio iframe is same-origin (`demo/index.html`, `town/index.html`) with `allow="autoplay; fullscreen"`, `pointer-events:none` for the town.
- Source and exact locus: `prototypes/studio-v0/app.js:256-259`; `prototypes/studio-v0/title-town.js:14-34`; `prototypes/ui-v0/site/js/main.js:53, 70-72`; `prototypes/title-city/city.js:893-896, 947`.
- Why it matters: the real host runs on another origin (games domain, A4 §4; B4), so every message needs an origin check and a schema.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: none; the prototypes were declared throwaway (C1 header).
- Suggested requirement/decision impact: the message set in §4 covers the same needs (mode switch, pointer forwarding, audio relay, ready, load marks) with a versioned envelope.

### E04-6: iOS audio inside an iframe is unresolved; the town works around it by playing sounds in the parent
- Claim / current behavior: `city.js:893-896`: "Embedded … each cue is posted to the page, which plays it on the audio its sound button unlocked (iOS never lets an iframe start its own)". The studio unlocks on `pointerup`/`touchend`/`keydown`/`click` (not `pointerdown`) and sets `navigator.audioSession.type = 'playback'` so the ringer switch does not mute (`sound.js:163-187`; `audio.js:35-39`). Kevin heard no sound on his iPhone on 2026-10-26; the cause (Ogg, audio session, unlock event) is unconfirmed (C2 §3 item 5).
- Source and exact locus: as above; `docs/research/v0.5/C2-v1-scope-additions.md` §3 item 5; A4 §4 rule 6 (audio unlock in a cross-origin iframe listed as unverified).
- Why it matters: every game plays audio from inside the game iframe; if iOS refuses, the SDK needs a relay path to the host and A9 §3.6's `OfflineAudioContext` checks must run inside the game anyway.
- Confidence and freshness: [V] that the prototype does this; the iOS claim is [I] (observed with a same-origin iframe, never tested cross-origin with `allow="autoplay"`).
- Contradiction or open question: the brief says "MP3/Opus". Safari decodes Opus only in CAF/WebM containers in recent versions [I]; the prototypes shipped MP3 after Ogg failed.
- Suggested requirement/decision impact: `@gm/sdk/audio` unlocks on the first `pointerup` inside the iframe with `allow="autoplay"` set by the host; `audio.relay` messages (§4) are the fallback the host can enable per device; import writes MP3 always and Opus as an optional second file (T05); a real-iPhone spike is ticket work (§6).

### E04-7: Rapier is decided for physics; JoltPhysics.js does not displace it in V1
- Claim / current behavior: Release plan "Stack": Three.js r186 + Rapier. `@dimforge/rapier3d-compat` 0.21.0, Apache-2.0, parent repo 5.9k★; `World.takeSnapshot()`/`restoreSnapshot()` exist and a `-deterministic-compat` build exists (A5 §2 table, verified 2026-10-21). The `rapier.js` repo is archived; bindings live in `dimforge/rapier/typescript`. JoltPhysics.js: JS/WASM bindings of Jolt (MIT); the C++ engine has well over 1k★ but the JS binding repo is, from memory, under 1k★ [I]; WASM roughly 1.5–2 MB uncompressed, similar to Rapier's embedded base64 build [I]; it has no snapshot API comparable to Rapier's for the A5 rewind and bug-bundle design [I].
- Source and exact locus: `docs/spec/release-plan.md` §2 "Stack"; `docs/research/v0.3/A5-releases-saves-achievements-analytics-rewind.md` lines 22, 39, 49, 65; `docs/research/v0.4/B14-skills/gaps.md:13-15`.
- Why it matters: the 3D scaffold, the character controller and the save/replay hooks all bind to one physics API.
- Confidence and freshness: Rapier facts [V] as of 2026-10-21 research; Jolt figures [I].
- Contradiction or open question: no Rapier skill exists (B14: "write our own"); the majid scaffold pins rapier3d-compat 0.12.
- Suggested requirement/decision impact: Rapier only in V1, stepped at a fixed dt from the SDK clock; Jolt is a post-V1 evaluation only if a genre needs its vehicle or character features.

### E04-8: gltfpack and glTF Transform belong in V1, on the build side; the runtime must stop editing geometry
- Claim / current behavior: C4 measured gltfpack on the town: 174 GLBs, 8.6 MB → 4 kit files, 0.8 MB raw, ~5 s; meshopt decoder is 6 KB, decodes 2–3× faster than Draco; quantized positions break the prototype's runtime `applyMatrix4`/`mergeGeometries` path, so per-model processing moves to build time. Neither `gltfpack` nor `gltf-transform` is on PATH now [M] (C4 ran them from a scratchpad). meshoptimizer is MIT and far above 1k★ [I].
- Source and exact locus: `docs/research/v0.5/C4-mobile-asset-pipeline.md` §1.2–1.4, §5.1–5.4; host check `which gltfpack gltf-transform` (empty).
- Why it matters: splits ownership cleanly: T05 writes the variants and `assets/manifest.json`; T04 owns `pickTier()` and the loader with `setMeshoptDecoder`, lazy `KTX2Loader`, parallel deduped fetches.
- Confidence and freshness: [M]/[V] as of 2026-10-31.
- Contradiction or open question: KTX-Software (`toktx`) is not installed, so KTX2 output is unavailable until it is (T05/T11, no cost).
- Suggested requirement/decision impact: `AssetManifest` type (§4) is shared by T04 and T05; the SDK never derives file names.

### E04-9: recast-navigation-js is the only 3D navmesh option and needs a star-rule exception; grid pathfinding needs no WASM
- Claim / current behavior: B15 verified npm `recast-navigation` 0.43.1, MIT, TypeScript, and marked it "Use" for Three.js navmeshes. The GitHub repo's star count is, from memory, in the high hundreds, below the 1k rule [I]; its WASM is in the 0.5–1.5 MB range [I]. For tile and grid games, `pathfinding`/`easystarjs` (B15 mining) or a 60-line A* in the SDK cover the need with no WASM.
- Source and exact locus: `docs/research/v0.4/B15-open-source-games/mining.md:90, 135, 207`; `docs/plans/roadmap-next-phases.md` step 2.
- Why it matters: monster and NPC paths are in most genres; the decision fixes whether the 3D scaffold ships a WASM dependency by default.
- Confidence and freshness: [V] for the npm facts; [I] for stars and size.
- Contradiction or open question: the 1k-star rule.
- Suggested requirement/decision impact: V1 ships `@gm/sdk/nav` with grid A* built in and recast as a lazily loaded optional module behind a `nav.navmesh` capability; record the exception request for Kevin (like Norigin, ZzFX).

### E04-10: Effekseer's WebGL runtime is not a V1 fit; the repo already has a 2D effects library and a 3D instanced-quad pattern
- Claim / current behavior: `third_party/pixelfx` is vendored at a pinned commit (MIT, reviewed 2026-10-30, 2.7 MB of plain ES modules, no dependencies) for 2D pixel effects; `prototypes/title-city/fx.js` draws 3D effects as one instanced quad mesh per texture, computed from scene time alone. Effekseer (MIT; C++ editor on Windows; WebGL runtime as WASM, order of 1–2 MB [I]) needs `.efk` files authored in its desktop editor, which no agent here can run.
- Source and exact locus: `third_party/pixelfx/PIN`, `NOTICE.md`; `prototypes/title-city/fx.js:1-10`; `prototypes/title-city/tools/build.sh` (pixelfx copy).
- Why it matters: effects are agent-authored as data in this product (B5); a binary authoring tool breaks that loop.
- Confidence and freshness: [V] for the repo facts; [I] for Effekseer.
- Contradiction or open question: none.
- Suggested requirement/decision impact: `@gm/sdk/fx` = pixelfx adapter (2D) + a port of `fx.js` (3D sprites, data-driven); Effekseer deferred.

### E04-11: FastNoise Lite is cheap and useful; the town already carries inline noise it would replace
- Claim / current behavior: `city.js:27-36` implements value noise, `fbm` and `ridge` inline for terrain. FastNoise Lite (MIT, well above 1k★ [I]) has a dependency-free JavaScript port on npm (`fastnoise-lite`, a few tens of KB, no WASM) [I].
- Source and exact locus: `prototypes/title-city/city.js:27-36`; `docs/plans/roadmap-next-phases.md` step 2.
- Why it matters: terrain and procedural placement are common in 3D scopes; a shared, seeded noise keeps builds deterministic (A9 §3.2).
- Confidence and freshness: [V] for city.js; [I] for the port.
- Suggested requirement/decision impact: include in `@gm/sdk/proc` as a pinned dependency, seeded from the SDK RNG; no exception needed.

### E04-12: No camera contract exists in the research; the prototype proved iso + cutaway + follow lerp, and C2 names seven rigs
- Claim / current behavior: B7 §3 lists "camera" as a gap ("no camera contract in A4"). C2 §4 fixes the rig list (`iso`, `topdown`, `side`, `follow`, `fps`, `orbit`, `fixed`), per-rig occlusion (cutaway for iso, fade or collision for follow), a separate editor camera plus "view as player", and that the view is recorded in the lockfile. The prototype's iso rig: cutaway walls scaled to 28% between camera and floor, `camTarget.lerp(P, dt*5)`, closer zoom in play (`dungeon.js:269, 596, 846`; C1 §5).
- Source and exact locus: `docs/research/v0.4/B7-editor-sdk-input.md` §3 table row "XYZ orientation cube"; `docs/research/v0.5/C2-v1-scope-additions.md` §4; `prototypes/ui-v0/site/js/dungeon.js`.
- Why it matters: each rig carries its own input mapping (stick relative to camera, pointer lock, touch look) and per-player instance (C2 §6).
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: `fps` needs pointer lock on desktop, which is blocked in sandboxed iframes without `allow-pointer-lock` [I].
- Suggested requirement/decision impact: `CameraRig` interface (§4); the iframe sandbox list includes `allow-pointer-lock`; 2D rigs (`topdown`, `side`, `fixed`) are Phaser camera presets, 3D rigs are Three camera controllers.

### E04-13: Input is split: the host is the only gamepad reader and owns the touch overlay; the SDK normalizes everything to action frames with a player index
- Claim / current behavior: B7 §5.3: the host polls `getGamepads()` and forwards game actions over the bridge; the game never calls `getGamepads()`; keyboard focus inside the iframe goes to the game, so the SDK forwards raw keys the host needs (pause/edit toggle). A4 §12: the platform renders the virtual stick and buttons from declared actions, ≥44 pt, hidden when a keyboard or pad is in use. B7 §9 item 4: input carries `playerIndex`. The prototype's stick lived inside the game (`dungeon.js:bindTouch`), with iOS fixes (`touchstart` preventDefault, `gesturestart` cancel).
- Source and exact locus: B7 §5.3 (lines 142–158); A4 §12; `dungeon.js:607-620`.
- Why it matters: it decides which package renders the stick (host) and where the action mapping lives (contracts).
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: a host-rendered overlay over a cross-origin iframe steals pointer events from the game canvas; A4 §4 unverified items (gamepad in iPadOS Safari, fullscreen) still need a device spike.
- Suggested requirement/decision impact: the host overlay sits in its own layer with `pointer-events` only on controls; the game receives `input.frame` messages at the host rate plus its own in-iframe keyboard/pointer, merged by the SDK into one `ActionFrame` per player.

### E04-14: Device tiers are picked once at startup from capability signals, then adapted from frame time, with a `?tier=` override
- Claim / current behavior: C4 §3: `navigator.deviceMemory` is unsupported on iOS, `hardwareConcurrency` is clamped, the GPU string is "Apple GPU", so runtime frame time is the only reliable iPhone signal; three tiers (`desktop`, `mobile`, `low`), DPR caps 2/1.5/1, drop DPR after 60 frames above 22 ms, remember in `localStorage`. C2 §3: one logical id per asset, the manifest maps ids to variants, agents never pick a variant, player override in settings, `gm-verify` budgets per tier.
- Source and exact locus: C4 §3.1–3.3, §5.4; C2 §3 items 2–4.
- Why it matters: it is the SDK's only runtime contact with the asset pipeline.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: tier budgets are starting points "to tune on Kevin's iPhone" (C4 §5.5).
- Suggested requirement/decision impact: `pickTier()` and `AssetLoader` in `@gm/sdk/assets`; the manifest type lives in `engine-contracts`.

### E04-15: Multiplayer client hooks are V1 and the SDK owns snapshot interpolation; B14's "rules only, gameplay V2" note is stale
- Claim / current behavior: A7 R12 option A (host-authoritative relay): the simulation runs in the owner's iframe, other clients send inputs and receive host snapshots "interpolated by an SDK helper"; Colyseus Predict is not used. C2 §6: every game follows `gm-multiplayer-ready` from day one (input separate from simulation, per-player state keyed by player id, host-minted ids, spawn points, a HUD per player); each client keeps its own camera rig. B7 §9: `applyDesign` must be deterministic; presence is separate from design state. B14 and `B14-skills/web-engines.md` still say "gm-multiplayer-ready is V1 rules only; gameplay V2".
- Source and exact locus: `docs/research/v0.3/A7-infra-auth-git-multiplayer.md` R12 "Room model"; C2 §6 table; B7 §9; `docs/research/v0.4/B14-skill-sourcing.md:11, 66`.
- Why it matters: the SDK must expose `snapshot()/applySnapshot()`, per-player input and spawn from the first template, or conversion later is a rewrite.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: B14's version note contradicts the decision log (first-class V1); the decision log wins.
- Suggested requirement/decision impact: `MultiplayerHooks` (§4) is required by every template; T07 defines the wire protocol, T04 the client API and interpolation.

### E04-16: The design document is host-owned JSON; the game only implements `applyDesign` and returns its reload boundary
- Claim / current behavior: A4 §6–7: `applyDesign(next, patches) → "live" | "restart-scene"`; entities keyed by stable id (`Record<id, Entity>`), never array index; validation on the host before apply; overrides in a DB layer re-applied per build with `aliases`/`retired`/`migrateOverride` hints; B7 §2 keeps all of this and drops the NL agent; B7 §3 adds `validatePlacement`, `setSelection`, `sockets`, `gizmos`, `tools`, `control.scope` ("instance" | "prefab" | "global"), `editorPrefs`.
- Source and exact locus: A4 §6 (lines 115–186), §7, §7a; B7 §2–§3.
- Why it matters: the game-side surface is small and testable; the hard parts (transactions, merge) belong to T08.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: `Transaction.origin` was replaced by `actor` + `kind` (B7 §2); any T08 sketch must use the B7 form.
- Suggested requirement/decision impact: `GameInstance` and `ControlDecl` types in `engine-contracts`; `applyDesign` must be deterministic (E04-15).

### E04-17: The conformance suite (`gm-sdk check`) is the safety net for lighter agents and is fully specified
- Claim / current behavior: A4 §10.3 lists nine deterministic checks (manifest valid and ids unique; every control min/max/default round-trips through undo byte-equal; save round-trip; previous-release save migrates; boot with each optional capability disabled; pause halts within one frame; desktop 16:9 and tablet 4:3 screenshots inside the safe area; debug adapter absent from the published bundle; override hints present). B7 §2 adds: entity ids in `design/` survive across builds unless retired; every palette item and tool round-trips through undo.
- Source and exact locus: A4 §10.3; B7 §2 row "gm-sdk check".
- Why it matters: it is the gate before every draft and the thing `gm-repair` and reviewers rely on.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: `packages/sdk-conformance` runs in Node + Playwright with the hooks of E04-2/E04-3; `gm-verify` (T10) calls it rather than re-implementing.

### E04-18: Versioning: the SDK is pinned per build, the wire protocol has a major checked at handshake, and the convention already exists in aiur-contracts
- Claim / current behavior: A4 §15: `@gm/sdk` semver bundled and pinned per build; `sdkProtocol` major checked in `hello`; host supports N and N-1; additive-only minors; unknown capabilities ignored. `/home/orangekid/github/aiur/packages/aiur-contracts/README.md`: JSON Schema 2020-12, "Clients ignore unknown IDs and additive fields. A breaking change adds v2 beside v1", schemas plus golden fixtures per `<surface>.vN`, generated TS types.
- Source and exact locus: A4 §5, §15; aiur `packages/aiur-contracts/README.md` (exists at `0f692a45b`) [V].
- Why it matters: it gives `engine-contracts` a layout to copy (schema + fixture + generated type) and keeps the game iframe compatible across SDK upgrades.
- Confidence and freshness: [V] as of 9508c1c / aiur 0f692a45b.
- Suggested requirement/decision impact: Zod 4 (`toJSONSchema`, A4 §2) is the single source; `schemas/*.v1.json` and fixtures are emitted at build.

### E04-19: Prototype engine code is three.js r170 and not reusable as is; the SDK starts on r186
- Claim / current behavior: `prototypes/studio-v0/demo/vendor/three/build/three.module.js` reports `REVISION = '170'` [M]; `title-city/tools/build.sh` copies that vendored copy; `ui-v0` loads r170 from jsDelivr; C4 was written against r170. Research pins three 0.186.1 (A4 §2); `Clock` is deprecated since r183 (`B14-skills/web-engines.md`). No Phaser code exists anywhere in `prototypes/` (the studio's 2D scenes are canvas/DOM in `scenes.js`). No root `package.json`, no `.github/`, no CI [M]; the only JS tooling is `prototypes/ui-v0/tools/package.json` (playwright 1.64.1, esbuild 0.25.0).
- Source and exact locus: as named; `find … -name package.json` and `ls .github` on the host.
- Why it matters: the 3D wrapper, 2D wrapper and monorepo tooling are greenfield; prototype patterns (cutaway, torch light pool, hit feedback, kit instancing, service worker caching) port as pattern cards, not files.
- Confidence and freshness: [M] 2026-10-31.
- Suggested requirement/decision impact: T12's monorepo must add the root toolchain before any SDK ticket starts (hard prerequisite).

### E04-20: Audio design is fixed: Web Audio buses, Tone.js 15 for `song.json`, ZzFX for SFX, MP3 for samples
- Claim / current behavior: B5 §2.4–2.5 and A3: Tone.js (MIT, 14.8k★) + Tonal + VCSL for music as data; ZzFX (806★, recorded exception) / jsfxr for SFX; buses `music`/`sfx`/`amb` with pitch variation and crossfades exist in `audio.js` (91 lines); the studio converts every Kenney Ogg to MP3 because iPhone Safari cannot decode Ogg (`studio-v0/tools/build.sh` comments). A9 §3.6 wants a `renderCue()` hook on an SDK-owned `AudioContext` for loudness checks (library routing unverified).
- Source and exact locus: B5 §2.4–2.5, §4; `prototypes/ui-v0/site/js/audio.js`; `prototypes/studio-v0/tools/build.sh` sound section; A9 §3.6.
- Why it matters: the SDK must own the `AudioContext` so Tone.js and samples share buses and the offline render works.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: Tone.js 15 deprecated the global `Transport`; skills must use `getTransport()` (B14 gaps §12).
- Suggested requirement/decision impact: `@gm/sdk/audio` API in §4; Tone.js is an optional subpath import so 2D arcade games do not pay its weight.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Deterministic step hook | `prototypes/ui-v0/site/js/dungeon.js:861-865` `tick(sec)` (JS, no tests; exercised by `tools/e2e.mjs`) | Port the idea to `@gm/sdk/core` as `advanceTime(ms)` on a fixed 1/60 s accumulator | Proved in C1; the code is r170 prototype code |
| Capture mode | `prototypes/title-city/city.js` `?capture`, `__frame`, `__ready`, `__tap`, `__marks`, `__info` (JS, no tests) | Port as `renderAt`, `ready`, `hitTest`, `marks`, `renderInfo` in `GmTestHooks` | `capture.mjs`, `taptest.mjs`, `loadtime.mjs` already consume these names |
| Verify tooling | `prototypes/title-city/tools/{capture,taptest,loadtime}.mjs`, `prototypes/ui-v0/tools/{e2e,shot,perf,weight}.mjs` (Node ESM, no tests) | Keep as the seed of `packages/sdk-conformance` and `gm-verify` scripts (T10); retarget to the hook names above | Working, GPU-flagged, phone profiles |
| Iframe messaging | `studio-v0/app.js:256-259`, `title-town.js`, `ui-v0/site/js/main.js:70-72`, `city.js:947` (`'*'` origin, untyped) | Replace with `packages/iframe-bridge` + `engine-contracts` | No origin check, no schema |
| Web Audio mixer | `prototypes/ui-v0/site/js/audio.js` (buses, pitch variation, crossfade, procedural crackle); `studio-v0/sound.js` (iOS unlock on `pointerup`/`touchend`, `audioSession`) | Port to TypeScript in `@gm/sdk/audio` | Small, correct, carries the iOS lessons |
| Iso camera, cutaway walls, torch light pool, hit feedback | `dungeon.js` (JS) | Replace: rewrite as `iso` rig + pattern cards (T10) | r170, entangled with the prototype's map |
| 3D sprite effects | `prototypes/title-city/fx.js` (104 lines, pure function of time) | Port to `@gm/sdk/fx` | Capture-exact by construction |
| 2D pixel effects | `third_party/pixelfx` (MIT, pinned, 2.7 MB ESM) | Keep as a dependency of `@gm/sdk/fx` for Phaser games | Already reviewed and vendored |
| Kit packing, bakes, bundling | `title-city/tools/{bake,bundle,variants}.mjs`, `studio-v0/sw.js` | bake/bundle → T05 build step; `sw.js` pattern → `@gm/host` cache | Measured wins in C4 |
| Noise | `city.js:27-36` inline | Replace with `fastnoise-lite` in `@gm/sdk/proc` | Seeded, shared |
| Contract conventions | aiur `packages/aiur-contracts` (TS + JSON Schema + fixtures, tests present) | Copy the layout, not the code | Same ignore-unknown, v2-beside-v1 rule |
| Phaser 2D runtime | none | Build on `phaserjs/template-vite-ts` (B15) | No 2D engine code exists |
| Three + Rapier 3D runtime | none (r170 prototypes only) | Build; our own Vite scaffold (B15) | Greenfield |

## 4. Interfaces and contracts this track defines or consumes

**Owner T04: bridge envelope and message set** (`packages/engine-contracts/src/bridge.ts`, Zod 4 schemas emit `schemas/bridge.v1.json`).

```ts
export const SDK_PROTOCOL = 1;
export type Envelope<T extends string, P> = { v: 1; id: string; t: T; payload: P; replyTo?: string };

export type HostToGame =
  | Envelope<'hello', { protocol: number; capabilities: string[]; mode: 'play' | 'edit' | 'test'; build: 'draft' | 'test' | 'published'; playerIndex: number; tier?: Tier }>
  | Envelope<'lifecycle.pause' | 'lifecycle.resume' | 'lifecycle.dispose', {}>
  | Envelope<'mode.set', { mode: 'play' | 'edit' }>
  | Envelope<'design.apply', { rev: number; doc: unknown; patches: Patch[] }>          // host-validated effective design
  | Envelope<'editor.select', { ids: string[] }>
  | Envelope<'editor.pick', { x: number; y: number }>                                   // normalized 0..1 of the frame
  | Envelope<'editor.validatePlacement', { prefab: string; pose: Pose }>
  | Envelope<'input.frame', ActionFrame>                                                // host pad + touch overlay
  | Envelope<'viewport', { w: number; h: number; dpr: number; orientation: 'landscape' | 'portrait'; safe: Insets }>
  | Envelope<'settings', { mute: boolean; volume: number; textScale: number; reduceMotion: boolean }>
  | Envelope<'save.restore', { saveSchemaVersion: number; data: unknown }>
  | Envelope<'mp.snapshot', { tick: number; state: unknown }>                           // non-host clients (T07 relays)
  | Envelope<'mp.inputs', { tick: number; frames: ActionFrame[] }>                      // host client receives peers' input
  | Envelope<'test.advanceTime' | 'test.renderAt', { ms: number }>
  | Envelope<'test.renderGameToText' | 'test.renderInfo', {}>
  | Envelope<'test.hitTest', { nx: number; ny: number }>;

export type GameToHost =
  | Envelope<'ready', { protocol: number; manifest: GameManifest; marks: [string, number][] }>
  | Envelope<'design.applied', { rev: number; result: 'live' | 'restart-scene' }>
  | Envelope<'editor.picked', { targets: TargetRef[] }>
  | Envelope<'editor.placement', { ok: true } | { ok: false; reason: string }>
  | Envelope<'editor.screen', { id: string; x: number; y: number } | { id: string; offscreen: true }>
  | Envelope<'input.rawKey', { code: string; down: boolean }>                            // host hotkeys while the iframe has focus
  | Envelope<'save.write', { saveSchemaVersion: number; data: unknown }>                 // host fills identity and slot
  | Envelope<'event', { kind: 'achievement' | 'analytics' | 'checkpoint'; payload: unknown }>
  | Envelope<'audio.relay', { cue: string; vol: number; rate: number } | { loop: string; gain: number }>  // iOS fallback
  | Envelope<'mp.snapshot', { tick: number; state: unknown }>                           // host client → room (T07)
  | Envelope<'mp.input', ActionFrame>                                                   // non-host client → room (T07)
  | Envelope<'test.result', { ok: boolean; value?: unknown; error?: string }>
  | Envelope<'error', { code: string; message: string }>;
```

Rules carried from A4 §4: `hello` arrives by `window.postMessage` with an origin check, transfers the `MessagePort`, and every later message rides the port; the host drops unknown `t`, caps payloads at 256 KB (saves routed separately), rate-limits at 120 msg/s, and checks the role before forwarding any `design.apply`.

**Owner T04: game module and test hooks** (`packages/engine-contracts/src/game.ts`).

```ts
export interface GameModule<D, S> {
  manifest: GameManifest;                       // id, sdk range, title, inputs, presentation, view, capabilities, palette, tools, gizmos
  designSchema: ZodType<D>; controls: ControlDecl<D>[];
  mount(host: HostApi, design: D, save?: { saveSchemaVersion: number; data: S }): Promise<GameInstance<D, S>>;
}
export interface GameInstance<D, S> {
  pause(): void; resume(): void; dispose(): void;
  applyDesign(next: D, patches: Patch[]): 'live' | 'restart-scene';   // deterministic given next (E04-15)
  serialize(): { saveSchemaVersion: number; data: S };                 // also the renderGameToText source (A9 §3.1)
  restore(save: { saveSchemaVersion: number; data: S }): void;
  migrate?(prev: { saveSchemaVersion: number; data: unknown }): { saveSchemaVersion: number; data: S };
  pick?(nx: number, ny: number): TargetRef[]; worldToScreen?(id: string): { x: number; y: number } | null;
  validatePlacement?(prefab: string, pose: Pose): { ok: true } | { ok: false; reason: string };
  setSelection?(ids: string[]): void;
  mp: MultiplayerHooks;                                                 // required by every template (E04-15)
}
export interface GmTestHooks {                      // bridge `test.*`; also window globals in draft/test builds only
  ready: boolean; marks: [string, number][];
  advanceTime(ms: number): void;                    // fixed 1/60 s steps, no render until the last step (dungeon.js tick)
  renderAt(ms: number): void;                       // keyframe + advanceTime to absolute time, one render (city.js __frame)
  renderGameToText(): { coords: string; tick: number; mode: 'play' | 'edit'; state: unknown; players: unknown[] };
  renderInfo(): { calls: number; triangles: number; frameMs: number };
  hitTest(nx: number, ny: number): boolean;
  setSeed(seed: number): void; inject(frame: ActionFrame): void;
}
// window.render_game_to_text = () => JSON.stringify(hooks.renderGameToText()); window.advanceTime = hooks.advanceTime
```

**Owner T04: input and camera** (`packages/engine-contracts/src/input.ts`, `@gm/sdk/camera`).

```ts
export type ActionValue = boolean | number | { x: number; y: number };
export type ActionFrame = { playerIndex: number; tick: number; source: 'keyboard' | 'pointer' | 'touch' | 'gamepad' | 'network'; actions: Record<string, ActionValue> };
export type ViewId = 'iso' | 'topdown' | 'side' | 'follow' | 'fps' | 'orbit' | 'fixed';
export interface CameraRig {
  id: ViewId; dimension: '2d' | '3d';
  attach(target: { position(): Vec3 }, playerIndex: number): void;      // one instance per local player
  update(dt: number, frame: ActionFrame): void;                         // stick/look relative to this rig
  occlusion: 'none' | 'cutaway' | 'fade' | 'collide';
  inputMapping: { keyboard: Record<string, string>; touch: 'stick' | 'two-stick' | 'tap'; gamepad: Record<string, string>; pointerLock: boolean };
  worldToScreen(p: Vec3): { x: number; y: number } | null;
}
```

**Consumed from T05, type owned jointly** (`packages/engine-contracts/src/assets.ts`): the C4 §5.2 manifest.

```ts
export type Tier = 'desktop' | 'mobile' | 'low';
export type AssetManifest = { version: 1; tiers: Tier[]; files: Record<string, { bytes: number; tris?: number; gpuTexMB?: number; decoders: ('meshopt' | 'draco' | 'ktx2')[] }>;
  assets: Record<string, { file: Partial<Record<Tier | '*', string>>; mesh?: string; bounds?: [number, number, number]; license: { id: string; attribution?: string; use: 'any' | 'personal' | 'inspiration' } }> };
export function pickTier(): Tier;                                        // C4 §3.2 signals + ?tier= override
export interface AssetLoader { preload(ids: string[]): Promise<void>; mesh(id: string): Promise<Mesh>; texture(id: string): Promise<Texture>; audio(id: string): Promise<AudioBuffer> }
```

**Owner T04 (client API), protocol owned by T07** (`@gm/sdk/mp`).

```ts
export interface MultiplayerHooks {
  spawn(playerIndex: number, playerId: string): void;                   // host-minted ids, spawn points
  despawn(playerId: string): void;
  snapshot(): { tick: number; state: unknown };                         // host client, 20 Hz (A7 R12)
  applySnapshot(s: { tick: number; state: unknown }): void;             // peers; the SDK interpolates between two snapshots
  hud(playerIndex: number): HudModel;                                   // per-player HUD, private fields never included
}
```

**Owner T04: audio** (`@gm/sdk/audio`): `unlock()` (first `pointerup`/`touchend`, sets `audioSession.type='playback'`), buses `music|sfx|amb|voice`, `play(id, {vol, pitch, rate, bus})`, `music(id, {fade})`, `zzfx(params)`, `song(songJson)` (Tone.js, optional import), `renderCue(id): Promise<{peakDb, rmsDb}>` (OfflineAudioContext).

**Consumed from T08**: `Patch` (Immer/RFC 6902 subset) and `{ actor, rev, patches, kind: 'manual' | 'system' }` transactions; T04 only applies the effective doc.

**Consumed from T09**: the iframe element. Host attributes T04 requires: `sandbox="allow-scripts allow-same-origin allow-pointer-lock"` on the games origin, `allow="autoplay; fullscreen; gamepad"`, `src=https://<game-id>.<games-domain>/<build-hash>/index.html?build=draft&protocol=1`.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| T04-A | engine-contracts package | Zod schemas, generated TS, `schemas/*.v1.json` + fixtures for bridge, manifest, controls, assets manifest, test hooks | `packages/engine-contracts/**` | 3 | T12 root toolchain | Transaction log shapes (T08), room protocol (T07) |
| T04-B | iframe-bridge | ~150-line MessageChannel RPC with origin check, size cap, rate limit, unknown-type drop; unit tests with two jsdom windows | `packages/iframe-bridge/**` | 2 | T04-A | Any game or editor concept |
| T04-C | sdk core + test hooks | `GameModule` runtime, fixed-step clock, seeded RNG, `GmTestHooks`, window globals gated by build kind, `applyDesign` dispatch | `packages/sdk/src/core/**`, `packages/sdk/src/test/**` | 3 | T04-A, T04-B | Engine wrappers, editor widgets |
| T04-D | three + rapier wrapper and 3D scaffold | `@gm/sdk/three`: renderer setup (compileAsync, DPR caps), Rapier fixed step with snapshot, GLTF loader with meshopt/KTX2, `templates/game-3d` grey-box | `packages/sdk/src/three/**`, `templates/game-3d/**` | 3 | T04-C, T04-F | Camera rigs (T04-E), asset build (T05) |
| T04-E | camera rigs and input | Seven `CameraRig`s with input mappings; `ActionFrame` merge of host frames and in-iframe keys/pointer; editor camera + "view as player" hook | `packages/sdk/src/camera/**`, `packages/sdk/src/input/**` | 3 | T04-C, T04-D (3D rigs), T04-G (2D rigs) | Host gamepad polling and touch overlay (T04-H) |
| T04-F | device-tier asset loader | `pickTier()`, frame-time downgrade, `AssetLoader` over `AssetManifest`, parallel deduped fetches, lazy KTX2 | `packages/sdk/src/assets/**` | 2 | T04-A (manifest type agreed with T05) | Variant generation (T05) |
| T04-G | phaser wrapper and 2D scaffold | `@gm/sdk/phaser`: Scale FIT/EXPAND presentation, scene lifecycle to `GameInstance`, pixelfx adapter, `templates/game-2d` from `template-vite-ts` | `packages/sdk/src/phaser/**`, `templates/game-2d/**` | 3 | T04-C | 2D asset atlases (T05) |
| T04-H | host game frame | `@gm/host`: iframe creation with sandbox/allow attributes, `HostBridge` (Zod validation, role check hook), gamepad poller with `playerIndex`, touch overlay from declared actions, viewport/safe-area, settings broadcast, service-worker asset cache | `packages/host/**` | 4 | T04-A, T04-B | Editor panels, undo stack, lease (T08/T09) |
| T04-I | audio module | Buses, unlock, `audioSession`, ZzFX, Tone.js `song.json` player (optional import), `renderCue`, `audio.relay` fallback | `packages/sdk/src/audio/**` | 2 | T04-C | Audio analysis scripts (T05), narration (T06) |
| T04-J | multiplayer client hooks | `MultiplayerHooks`, snapshot interpolation, per-player HUD model, `gm-multiplayer-ready` lint rules as conformance checks | `packages/sdk/src/mp/**` | 3 | T04-C, T04-E; T07 protocol types | Room server, invites (T07) |
| T04-K | sdk-conformance (`gm-sdk check`) | The nine A4 checks plus B7's two, as a Node + Playwright runner on the GPU flags with a SwiftShader fallback; runs on both templates | `packages/sdk-conformance/**` | 3 | T04-C, T04-D, T04-G, T04-H | `gm-verify` prose and clips (T10) |
| T04-L | fx, nav and proc helpers | `@gm/sdk/fx` (fx.js port, pixelfx), `@gm/sdk/nav` (grid A*, lazy recast behind capability), `@gm/sdk/proc` (fastnoise-lite seeded) | `packages/sdk/src/{fx,nav,proc}/**` | 2 | T04-C | Effekseer, Jolt |

## 6. Risks and unknowns

1. **iOS audio in a cross-origin iframe** (E04-6). Spike on Kevin's iPhone before T04-I closes. Default: `allow="autoplay"` + unlock on `pointerup` inside the iframe; ship `audio.relay` as the fallback the host enables when the first unlock fails.
2. **Gamepad, pointer lock and fullscreen inside the sandboxed iframe on iPadOS Safari** (A4 §4 rule 6, B7 §8). Default: host-only gamepad reading (already decided) and `fps` rig gated to desktop until the device test passes.
3. **Host-rendered touch overlay over the game iframe steals pointer events** (E04-13). Default: overlay layer with `pointer-events` only on the controls; the game keeps direct touch for aiming and taps.
4. **Star-rule exceptions**: recast-navigation-js, ZzFX (already recorded), pixelfx (vendored, reviewed). Default: grid A* built in, recast optional; file the exception list for Kevin in one place.
5. **Tier budgets and detection are untuned** (C4 §5.5). Default: ship the C4 starting numbers as warnings, promote to failures after the iPhone spike.
6. **Rapier determinism across host and peers** is not needed in V1 (host-authoritative), but `applyDesign` determinism is. Default: conformance check applies the same doc twice on two instances and compares `renderGameToText`.
7. **`renderGameToText` size** on large levels. Default: cap at 64 KB with `truncated: true`, and a `view` parameter for players/entities/HUD.
8. **Three r186 vs the prototypes' r170 recipes** (`Clock` deprecated). Default: write fresh against r186; port measured patterns as cards.

## 7. Self-hosting notes

- Verification runs on this machine's Intel UHD through ANGLE/EGL (`/dev/dri/renderD128` ACL grants `orangekid` rw [M]); the SwiftShader-only assumption in A9 §3.5 is gone, but one iGPU is shared by every concurrent verify job (T11 should cap verify concurrency; CPU is a 6-core i7-10710U, 31 GB RAM [M]).
- Installed [M]: Node v24.14.0, npm 11.9.0, `/usr/bin/ffmpeg`, `/usr/bin/chromium`, Playwright browsers `chromium-1228`, `chromium-1248`, `chromium_headless_shell-*`, `webkit-2311` (WebKit lets conformance run a Safari-engine pass locally). Not installed: `gltfpack`, `gltf-transform`, `ktx`/`toktx`, `blender`; no global three/phaser/rapier packages; the npx cache holds none of them.
- No root `package.json`, no CI; only `prototypes/ui-v0/tools` has dependencies (playwright 1.64.1, esbuild 0.25.0). The monorepo toolchain (T12) is a prerequisite for every T04 ticket.
- The games domain and per-game subdomains (microphone) come from T11; T04 only needs the origin string in `hello` and in the host's origin check.
- Nothing in T04 spends money or needs a key: all dependencies are npm, MIT or Apache-2.0, and the device spikes use Kevin's own iPhone and iPad.
