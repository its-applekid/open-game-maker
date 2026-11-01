# T10 agent-skills-and-verify: evidence packet

Researched at commit `9508c1c46735e442a2e07a1bffad2bb9f190da8d` (branch `research`, 2026-10-31); aiur `main` `0f692a45b`. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

The skills coding agents load inside a build (`gm-*` workflow layer, vendored engine reference layer, pattern cards, scaffold-only templates), the sameness eval, `gm-verify` (headless Chromium on this machine's GPU, the tick hook, phone and desktop stills, timelines, clips), the repair loop for reproducible crashes, and how skills reach each creator's repo through aiur.
What exists today: six `SKILL.md` files under `.claude/skills/`, the `agent-sprite-forge` plugin, and the capture tools under `prototypes/title-city/tools/` and `prototypes/studio-v0/tools/` (plus `prototypes/ui-v0/tools/`, which the others load Playwright from).
Out of scope here: the `gm` CLI binary and asset pipeline (T05), the SDK runtime (T04), job admission and bug intake (T01), the aiur HTTP surface (T02), the sandbox (T03).

## 2. Evidence packets

### E10-1: The six existing skills are Claude-in-this-repo dogfooding skills, not sandbox build skills
- Claim / current behavior: `.claude/skills/{gm-design-loop,gm-verify,gm-assets,gm-asset-variants,gm-asset-intake,gm-pack-scout}/SKILL.md` (44/50/73/56/46/26 lines) address an agent working with Kevin on this machine: they publish artifact pages, cite `assets-local/`, `scripts/assets/*.py`, `tools/capture.mjs`, `meta-improve`, and Kevin by name. None of B11 §4.8's build-agent set exists: no `gm-core`, `gm-genre-*`, `gm-input`, `gm-ui-hud`, `gm-audio`, `gm-repair`, `gm-multiplayer-ready`, `gm-scope-options`, `gm-editor-tuning`, `gm-saves-achievements`.
- Source and exact locus: `/home/orangekid/games/open-game-maker-2000/.claude/skills/*/SKILL.md`; planned set in `docs/research/v0.4/B11-asset-pack-library.md` §4.8.
- Why it matters: the V1 skill pack is greenfield. The existing six are source material (rules Kevin already signed off: assets first, options before build, look before sending, clone never edit) and must be rewritten against the `gm` CLI, not copied into game repos.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: `gm-asset-variants` step 1 already cites `gm assets search`, a command that does not exist (E10-16).
- Suggested requirement/decision impact: ticket "gm-core router + skill pack" starts from B11 §4.8 and B14 §2; the six existing files feed its rules sections; `gm-asset-intake`/`gm-pack-scout` stay operator skills owned by T05.

### E10-2: `gm-verify`'s executable spine is five Playwright scripts bound to one capture contract
- Claim / current behavior: `capture.mjs` (stills | timeline | record), `taptest.mjs`, `loadtime.mjs`, `poster.mjs`, `mix_sound.mjs`, `bake.mjs`, `variants.mjs` all launch Chromium with `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist`, open `index.html?capture&...`, wait for `window.__ready`, then call `window.__frame(t)` before each screenshot. `record` writes JPEG frames and encodes H.264 `yuv420p`, 960 px wide, CRF 27, `+faststart` with ffmpeg; `timeline` tiles with `xstack`. `loadrec.mjs` (studio-v0) records an iPhone-profile load with CDP CPU throttling 4x and `recordVideo`. Every script resolves Playwright through `createRequire('<repo>/prototypes/ui-v0/tools/')`. No tests exist for any of them.
- Source and exact locus: `prototypes/title-city/tools/capture.mjs:17-40`, `taptest.mjs:13-25`, `loadtime.mjs:11-20`, `prototypes/studio-v0/tools/loadrec.mjs:7-16`; contract in `prototypes/title-city/city.js:16,943,958` (`CAPTURE = Q.has('capture')`, `window.__frame = frame`, `window.__ready = true`) and `index.html:15`.
- Why it matters: this is the only working "look before sending" code in the repo and it is already shaped like `gm run --headless --frames` / `gm shot --sheet` / clip export from B11 §4.7. The port to TypeScript is mechanical; the contract (`?capture`, `__ready`, `__frame(t)`) is what the SDK must expose.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: `poster.mjs` and `mix_sound.mjs` are title-town specific (animated WebP poster, `window.__sounds` cue list) and need no port.
- Suggested requirement/decision impact: `gm run` is a TS port of `capture.mjs` + `loadtime.mjs` + `loadrec.mjs`, with `taptest.mjs` as an optional probe. Keep the encoding parameters (phone playback was verified by Kevin through these).

### E10-3: Four hook vocabularies for the same thing; T04 must pick one
- Claim / current behavior: ui-v0 exposes `window.__ogm.tick(sec)` (fixed 1/60 s steps without rendering, then one render) plus `map`, `mode`, `player`, `foes`, `tileToScreen`; title-city exposes `window.__frame(t)` (absolute loop time, idempotent redraw) plus `__ready`, `__tap(x,y)`, `__info()` (render calls, tris); B14 and the release plan name `render_game_to_text()` + `advanceTime(ms)`; A9 §3.1 sketches `GmTestHook { step(ticks), act(), state(), probes(), events(), editor }`.
- Source and exact locus: `prototypes/ui-v0/site/js/dungeon.js:861-865`; `prototypes/title-city/city.js:936-958`; `docs/research/v0.4/B14-skill-sourcing.md` §1.4; `docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §3.1; `docs/spec/release-plan.md` "Engineering" row.
- Why it matters: every verify script, pattern-card test, repair replay and the sameness eval (B15 M4 reads `render_game_to_text()` keys) call this surface. Two are simulation hooks (tick/advanceTime), one is a presentation hook (frame at time t, needed for scenes with no simulation such as titles and cut-scenes).
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: C1 §9 recommends `tick(sec)`; B14 recommends `advanceTime(ms)` from the openai skill; the release plan already fixed `advanceTime` and `render_game_to_text` as names.
- Suggested requirement/decision impact: T04 owns the names. This track needs both a stepping call and a draw-at-time call, a ready flag, a text/state dump, a logical-action injector, and renderer counters (sketch in §4). Recommend `advanceTime(ms)` and `render_game_to_text()` as the public names with `frame(t)` for presentational scenes [O].

### E10-4: The GPU path works headless on this machine; the default path is SwiftShader
- Claim / current behavior: Playwright 1.64.1 Chromium with `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` reports `ANGLE (Intel, Mesa Intel(R) UHD Graphics (CML GT2), OpenGL ES 3.2)`; with no flags it reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)...))`. No X server or `xvfb-run` was needed.
- Source and exact locus: measured with a 20-line probe in the session scratchpad against `prototypes/ui-v0/tools/node_modules/playwright` (nothing written to the repo); flags from `prototypes/title-city/tools/capture.mjs:17`.
- Why it matters: C1 §6 measured 1–2 fps and 10–30 s per e2e step under SwiftShader (`prototypes/ui-v0/tools/e2e.mjs:6` still launches `--use-angle=swiftshader`); the GPU path removes that cost. A9 §3.5's "CI WebGL runs on SwiftShader, FPS numbers are meaningless" was a Railway assumption and no longer holds on this host, though absolute phone budgets still need Kevin's devices (C2 §3 caveat).
- Confidence and freshness: [M], 2026-10-31.
- Contradiction or open question: concurrent captures share one iGPU; contention was not measured. Sandboxed agents (T03) see the GPU only if `/dev/dri/renderD128` is passed into the sandbox.
- Suggested requirement/decision impact: `gm run` defaults to the GPU flags and prints the `RENDERER` string in its report (godogen's trap, B14 pipeline §1.2); fall back to SwiftShader with a warning and fewer frames.

### E10-5: Verify tooling on the host: present, versions, and what is missing
- Claim / current behavior: Node v24.14.0, npm 11.9.0; Playwright 1.64.1 installed only in `prototypes/ui-v0/tools/node_modules` (package.json pins `"playwright": "^1.64.1"`, `"esbuild": "0.25.0"`); browsers cached at `~/.cache/ms-playwright/{chromium-1228,chromium-1248,chromium_headless_shell-*,webkit-2311,ffmpeg-1011,ffmpeg-1013}`; system `/usr/bin/ffmpeg` 7.1.5 and `/usr/bin/chromium`; `xvfb-run` present; `gltf-transform`, `gltfpack`, `blender`, global `esbuild` absent from PATH; `agent-browser@0.27.0`, `@openai/codex@0.162.1`, `@anthropic-ai/claude-code@2.1.316` global.
- Source and exact locus: `which`, `npm ls -g`, `ls ~/.cache/ms-playwright` on the host; `prototypes/ui-v0/tools/package.json`.
- Why it matters: `gm-verify` can be built and run today with no installs beyond a repo-local `npm i` of the same pins; WebKit is cached, so an iPad-profile WebKit pass (A9 L2) costs nothing extra.
- Confidence and freshness: [M], 2026-10-31.
- Contradiction or open question: whether sandboxed workers may reach `~/.cache/ms-playwright` (read-only bind) is a T03 decision; otherwise each sandbox image needs its own ~400 MB browser copy.
- Suggested requirement/decision impact: pin `playwright` and the browser build id in the gm-verify package; mount the browser cache read-only into sandboxes.

### E10-6: aiur installs a fixed skill bundle and never selects skills per ticket; repo-shipped skills get no Codex link
- Claim / current behavior: `Aiur.AgentSkills` embeds `aiur-agent aiur-debug aiur-experiment design-import` plus the pinned Compound Engineering set at compile time and writes them into every workspace at each backend's declared path: Claude `.claude/skills`, Codex `.codex/skills/<skill>` as a symlink to `.claude/skills/<skill>`, Muse `.agents/skills`. It skips any destination that already exists ("never clobber a skill the target repo already ships"). The symlink loop iterates only `@issue_worker_skills`, so a repo's own `.claude/skills/gm-*` get no `.codex/skills` link. No `skills:` field exists in `configuration-agent.md`/`configuration-daemon.md`; the only skill-related config is Muse `trust_workspace` and the Codex sandbox note that `.agents` is writable "so tracked skills links can be updated".
- Source and exact locus: `/home/orangekid/github/aiur/src/lib/aiur/agent_skills.ex:1-30,42,116-128,141-200`; `src/lib/aiur/coding_agent/providers/{claude,codex,muse}.ex:19-21`; `website/docs-app/reference/configuration-agent.md:196,268`.
- Why it matters: B8 §2.3's finding stands on current main. The gm-* pack must therefore live in each creator's game repo (written by `gm new` and refreshed by the `after_create` hook), and the scaffold must write the Codex and `.agents` links itself.
- Confidence and freshness: [V] for the install logic; [I] that Codex discovers `.codex/skills` links the scaffold writes (not run).
- Contradiction or open question: B8 marked "whether skills the hook writes are picked up by Codex" unconfirmed; still unconfirmed.
- Suggested requirement/decision impact: `gm new` writes `.claude/skills/gm-*`, `.codex/skills/gm-* -> ../../.claude/skills/gm-*`, `.agents/skills/gm-*`, `skills.lock`, and `AGENTS.md`; one Codex dry run is the acceptance test.

### E10-7: `gm-verify` has no drop-in upstream; the recommended spine was deleted upstream
- Claim / current behavior: B14 chose openai `develop-web-game` (Apache-2.0) as the spine, recovered from git history after its 2026-04-23 deletion; its client forces SwiftShader, captures the largest canvas only, maps 8 keys, and its `advanceTime` fallback waits real rAF frames. Majid `qa-release` (MIT) contributes canvas-pixel checks and an evidence manifest; godogen contributes the renderer-string trap and the visual-defect taxonomy.
- Source and exact locus: `docs/research/v0.4/B14-skill-sourcing.md` §1.4; `docs/research/v0.4/B14-skills/pipeline-and-design.md` §2.1, §1.2; `B14-skills/web-engines.md` "gm-verify" row.
- Why it matters: everything the openai client did, `capture.mjs` + `e2e.mjs` already do better on this host (GPU, full-page screenshots, phone profiles, virtual time through the hook). Vendoring a deleted skill adds licence bookkeeping for no code we would run.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: write `gm-verify` ourselves from the repo's scripts; borrow only the defect checklist wording (own words) and the "fix the first new console error first" rule.

### E10-8: The vendored engine reference layer and `skills.lock` do not exist; the API-name checker is lost
- Claim / current behavior: B14 adopts Phaser official skills (28, MIT, in `phaserjs/phaser/skills`), CloudAI-X threejs-skills (13, MIT, minus R3F, pinned to the 2026-10-19 rewrite) and awesome-gamedev adaptations (Apache-2.0 + NOTICE), each with `license:`/`source:` front matter and one `skills.lock`. Nothing is vendored at the researched commit; `find` finds no `skills.lock`; the API-name checker "written during this research" lived in a `/tmp/claude-1000/...scratchpad/tools/` path and is not in the repo.
- Source and exact locus: `docs/research/v0.4/B14-skill-sourcing.md` §1.2, §5; `B14-skills/web-engines.md` "API accuracy check method"; repo search for `skills.lock` (none).
- Why it matters: a named reuse target that does not exist is a defect per the brief: the checker must be rewritten (about a day: extract `new X(`, imports and `.method(` names from code blocks and grep the pinned library source).
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: C1 §8 measured CloudAI `@ 0e18186` and awesome-gamedev `@ 184b72b` as high value in practice; those are the commits to pin.
- Suggested requirement/decision impact: one ticket vendors the three sets at pinned SHAs with notices, writes `skills.lock`, and includes the checker as a script with a test.

### E10-9: Pattern cards, scaffold-only `gm new`, anti-sameness rules and the homogenization eval are all unbuilt
- Claim / current behavior: B15 decides: no whole games in build context; themeless TypeScript pattern cards (300–800 tokens, tunables as ranges, a 3-line `advanceTime` test) under each genre skill's `references/`, fetched with `gm docs pattern <topic>`; `gm new` creates boot, hooks, input map, grey-box level and no entities; three `gm-core` rules (WHAT from scope only; name-your-defaults pass; no unasked mechanics); eval metrics M1 jscpd leakage, M4 unasked mechanics, M5 card-default fingerprint per run, M2/M3/M7 per set. None exists.
- Source and exact locus: `docs/research/v0.4/B15-open-source-games.md` §2; `B15-open-source-games/reference-builds-and-homogenization.md` §4–§6.
- Why it matters: the eval is the ship gate for every skill change; without it skill tickets have no acceptance test beyond "the agent used it".
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: skill-creator's harness shells out to `claude -p` and the eval costs 20 builds per iteration; on subscriptions that is quota, not money, but it is not free. B11 §4.7 called `gm new` a "genre starter"; B15 §6.2 changes it to scaffold-only.
- Suggested requirement/decision impact: M1/M4/M5 ship as scripted assertions with the first genre skill; M2/M3/M7 later; the eval runs on demand, never in CI.

### E10-10: The repair loop is specified across A9 and B8 and decided by Kevin; only the numbers are open
- Claim / current behavior: bundle (≤200 KB: version, device profile, seed, last `state()` keyframe, ~30 s action ring buffer, console errors with server-side source maps, probes, events, one ~480 px screenshot, the creator's words) → private storage → deterministic triage (signature dedupe; replay to classify reproduces-with-error / no-error / not-reproducible; editor-fixable complaints routed to the editor command path) → repair job with a generated failing "promise" test that then runs in L1 forever. Decided: auto-repair only reproducible crashes (D2 b), repairs share the three edit slots (D3 a), numbers after measurement (D5 c; placeholder 2 attempts at ~1/3 of a feature reservation). Diagnostics reach the agent only through `after_create`; issue bodies carry redacted metadata and an opaque `gm-report` id.
- Source and exact locus: `docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §5; `docs/research/v0.4/B8-aiur-integration-budgets-bugs.md` §6–§7; `docs/spec/game-maker-2000-v0.5-decisions.md` picks table.
- Why it matters: the loop touches T01 (intake, admission), T02 (hook, ticket body), T04 (ring buffer and keyframes in the SDK), T08 (`state()` is the save serializer) and this track (`gm-repair`, the promise test). It is the one V1 flow that is irreducibly cross-context.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: `after_create` timing before the first prompt in warm workspaces is still unconfirmed (B8 §8).
- Suggested requirement/decision impact: a cross-context ticket owns triage + `gm-repair` + promise-test generation; T01 owns the button and storage; T04 owns the ring buffer.

### E10-11: C1 measured the hook pays for itself and named skills to keep out
- Claim / current behavior: after adding `tick(sec)` the full editor→play→result loop passed on desktop and phone emulation with 0 page errors; threejs-skills and awesome-gamedev `game-feel` were high value, `game-ui-ux` low; `landing-page-design` "claims ANY web UI" and must stay out of the agent's skill set.
- Source and exact locus: `docs/research/v0.5/C1-ui-prototype-learnings.md` §1, §8, §9 rows 1 and 5.
- Why it matters: fixes the first skill wave (platformer feel, three.js reference) and the exclusion list for the sandbox skill directory.
- Confidence and freshness: [V] (C1's [M] results), as of 9508c1c.
- Contradiction or open question: aiur workers run under the machine's `CLAUDE_CONFIG_DIR` profiles; whether user-level skills (`~/.claude/skills`, plugins) are visible to Claude workers inside a sandbox depends on T03's home-dir policy [I].
- Suggested requirement/decision impact: the sandbox image carries only the game repo's skills; no user-level skill directory is mounted.

### E10-12: C2 binds `gm-verify` to tier budgets, camera rigs, two-client rooms and activity events
- Claim / current behavior: `gm-verify` must run the mobile tier under phone emulation and fail over download size, texture memory, draw calls or triangles; run the play loop in each camera rig; run two Playwright contexts (host and friend) for invite → join → Play → own camera → reconnect; and emit `playtesting` activity events keyed by aiur issue and run ids (the taxonomy is owned by `gm-core`).
- Source and exact locus: `docs/research/v0.5/C2-v1-scope-additions.md` §1 (lines 66–98), §3 item 4 (154–160), §4 item 5, §6 "Testing" (285–291), "For ticketing".
- Why it matters: these are acceptance criteria the verify report must carry; the two-client test depends on T07's room and T01's invite flow and cannot land in the first verify ticket.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: C2 §3 and the decision log both say real-iPhone sound and frame-rate checks need Kevin's devices; `gm-verify` can only report "not checked on iPhone Safari" (the existing SKILL.md's last rule).
- Suggested requirement/decision impact: the verify report JSON (§4) has `budgets`, `rig`, `clients` and `unchecked[]` fields from day one; the two-client probe is a follow-up ticket gated on T07.

### E10-13: "Show as you go" is decided for the build chat; aiur's milestone channel is text-only
- Claim / current behavior: the decision log (2026-10-31) says agents post screenshots and short clips at each visible step and "the agents' design skill tells them to do this"; `gm-design-loop` step 4 already contains that rule. aiur's channel for milestones is `emit_alert` and the `## Agent Workpad` issue comment (text); no attachment or image field was found in the `aiur-agent` skill or the alert modules.
- Source and exact locus: `docs/spec/game-maker-2000-v0.5-decisions.md` "Build chat" row; `.claude/skills/gm-design-loop/SKILL.md:30-32`; `/home/orangekid/github/aiur/.claude/skills/aiur-agent/{SKILL.md,emit-and-subscribe.md}` (grep for image/attachment: none).
- Why it matters: for a still or clip to reach the creator the worker needs a GM-owned upload (`gm progress --still shot.png`) that writes to the bucket and posts a chat message; aiur alone cannot carry it.
- Confidence and freshness: [V] for the decision and the rule; [I] that aiur has no media path (grep-level check).
- Contradiction or open question: T06 defines the build-chat message; T05/T11 own the bucket.
- Suggested requirement/decision impact: `gm progress` grows `--media <file>`; `gm-core` makes posting a still after every `gm run` mandatory.

### E10-14: `agent-sprite-forge` is an operator tool, not a sandbox skill
- Claim / current behavior: plugin v0.4.0 (MIT, `0x0funky/agent-sprite-forge`) is enabled at project scope and cached at `~/.claude/plugins/cache/agent-sprite-forge/agent-sprite-forge/0.4.0/skills/{generate2dsprite,generate2dmap,video2dsprite,generate2dmedia,codeart2d}` with 77 Python scripts; `route_media.py` orders paid APIs (OpenAI, Gemini, xAI, BytePlus, fal) first and falls back to the signed-in Codex/Grok CLI, then `no-route` → `codeart2d`. CLAUDE.md forbids adding a provider key and requires Kevin's go before any generation; paid-pack assets never go to it as references.
- Source and exact locus: `.claude/settings.json`; plugin `.claude-plugin/plugin.json`, `skills/generate2dmedia/scripts/route_media.py:13-26,76-84`; `CLAUDE.md` "Sprite Forge skills".
- Why it matters: it is the only tier-3 2D generator in reach, and it spends (or consumes Codex quota) by design; it belongs behind a backend adapter with the spending gate, or stays an operator-only tool, never in a creator's repo.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: the decision log says paid art generators are V2; Codex-CLI image generation is "free" on the subscription but still consumes the coding agents' quota.
- Suggested requirement/decision impact: V1: not installed in game repos; `gm-assets` tier 3 means code-drawn or procedural only, and says so. Revisit with the T05 tier-2/3 adapter design.

### E10-15: The existing `gm-verify` deliver path is throwaway; its load tests carry a studio-specific selector
- Claim / current behavior: "Deliver" publishes an artifact page built by `clips_page.py` and re-encodes files over the artifact limit; `loadtime.mjs:17` waits for `document.querySelector('.t-scene.on') || window.__ready` (the studio title's class); `loadrec.mjs` hard-codes the ui-v0 tools path.
- Source and exact locus: `.claude/skills/gm-verify/SKILL.md:34-49`; `prototypes/title-city/tools/loadtime.mjs:17`; `prototypes/studio-v0/tools/loadrec.mjs:5`.
- Why it matters: in V1 the consumer is the build chat (T09 panel, T06 message), not claude.ai artifacts; the port must drop the artifact step and take the ready condition from the SDK hook only.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: `clips_page.py` is not ported; `gm run` returns paths and the chat renders them.

### E10-16: Skills already reference a `gm` CLI that does not exist
- Claim / current behavior: `gm-asset-variants` step 1 says "Search the catalog (`gm assets search`, or `assets-local/catalog.json`)"; B11 §4.7 defines the full surface (`gm assets search|facets|info|sheet|use|register`, `gm new`, `gm docs`, `gm check`, `gm test`, `gm run --headless`, `gm shot --sheet`, `gm perf`, `gm progress`, `gm narrate`, `gm sfx zzfx`, `gm music`). The repo has no `gm` binary and no `package.json` outside the prototypes.
- Source and exact locus: `.claude/skills/gm-asset-variants/SKILL.md:25`; `docs/research/v0.4/B11-asset-pack-library.md` §4.7; repo `find -name package.json`.
- Why it matters: every V1 skill is written against these commands; the skill tickets depend on at least a CLI skeleton with `run`, `shot`, `perf`, `docs`, `progress`, `check`, `test` (this track) and `assets *` (T05).
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: ownership split of the `gm` binary between T05 and this track (recommendation in §4).
- Suggested requirement/decision impact: one `packages/gm-cli` with namespaces owned by different tickets; `run|shot|perf|docs pattern` are this track's.

### E10-17: Every script the six skills cite exists, in Python, mostly untested
- Claim / current behavior: 20/20 cited paths exist (`scripts/assets/{pack_thumbnails,sprite_libraries,fetch_polypizza_bundle,fetch_drive_folder,build_catalog,pack_previews,fetch_itch_free,fetch_itch_owned,install_itch_pack,import_synty}.py`, `scripts/drive-sync/drive_sync.py`, `scripts/audio/.venv`, `third_party/pixelfx/src`, the lineup/variants/pixelfx-gallery HTML pages, `assets-local/catalog.json`). Tests exist only for `scripts/drive-sync`, `scripts/maps`, `scripts/audio`; none for `scripts/assets/*`. No `.github/` directory, so no CI.
- Source and exact locus: existence check on the host; `find scripts prototypes -name 'test_*'`.
- Why it matters: T05 owns these; this track only needs to know the skills' claims are true today and that none of it runs in a sandbox without `assets-local/`.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: none for this track beyond "rewrite the skills against `gm`".

### E10-18: B14's version note on multiplayer is superseded
- Claim / current behavior: B14 and both sub-reports say "`gm-multiplayer-ready` in V1 covers only the architecture rules; multiplayer gameplay (Colyseus) is V2". The decision log (2026-10-26) and release plan make multiplayer first-class in V1; C2 §6 says every game follows `gm-multiplayer-ready` from day one and a multiplayer game starts from a template that already has the networking.
- Source and exact locus: `docs/research/v0.4/B14-skill-sourcing.md` version note; `docs/spec/game-maker-2000-v0.5-decisions.md` "Multiplayer"; `docs/research/v0.5/C2-v1-scope-additions.md` §6 table row "Choose at creation, convert later".
- Why it matters: the skill must teach the T07 room client and T04 hooks, and the scaffold needs a multiplayer variant; the sourcing verdict ("nothing trustworthy exists for Colyseus; write new") still holds.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: none once precedence is applied.
- Suggested requirement/decision impact: `gm-multiplayer-ready` is a V1 skill with a Colyseus section, written after T07's protocol types exist.

### E10-19: The visual judge in V1 is the worker itself, not a paid model
- Claim / current behavior: A9 §3.7 budgets an LLM visual checklist at publish (~$0.04 on Sonnet); the planning pack forbids spending and provider keys; the existing `gm-verify` rule is "never report a visual result you haven't looked at", and the worker already runs on a multimodal subscription agent that can read the tiled timeline.
- Source and exact locus: `docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §3.7, §4 L3; `docs/plans/ogm-v1-build/README.md` "Non-goals"; `.claude/skills/gm-verify/SKILL.md:8`.
- Why it matters: removes one service and one budget line from V1; the deterministic layers (L0 static, L1 smoke) are $0 by design and do the blocking.
- Confidence and freshness: [V] for the sources; [O] for the resolution.
- Contradiction or open question: A9's calibration of binary checks (≥90 % precision before they may block) still applies to whatever reads the frames.
- Suggested requirement/decision impact: L3's judge becomes "the worker reads `gm shot --sheet` and answers the binary checklist in its PR"; blocking stays with L0–L1 and the budget checks.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Stills, tiled timeline, phone MP4 | `prototypes/title-city/tools/capture.mjs` (JS, 43 lines, no tests) | Port to TS as `gm run`/`gm shot` | Proven on this host; encoding settings verified on Kevin's phone |
| Tap-target scan | `title-city/tools/taptest.mjs` (JS, no tests) | Port as an optional `gm run --probe taps` | Cheap; needs `__tap` from the SDK input layer |
| Phone-profile load time and load recording | `title-city/tools/loadtime.mjs`, `studio-v0/tools/loadrec.mjs` (JS, no tests) | Port into `gm perf` | Already uses iPhone profile + CDP CPU throttle + service-worker counts |
| Full editor→play→result e2e | `prototypes/ui-v0/tools/e2e.mjs` (JS, no tests) | Replace with `gm run --inputs <script.json>` | Hard-codes dungeon selectors; keep as the input-script pattern (logical actions + `tick`) |
| FPS and page weight | `ui-v0/tools/perf.mjs`, `weight.mjs` (JS) | Fold into `gm perf` | Small; the resource grouping is the budget report |
| Sound under a clip | `title-city/tools/mix_sound.mjs` (JS) | Keep as-is, later | Title-town only (`window.__sounds`); not V1 verify |
| Clip page for artifacts | `title-city/tools/clips_page.py` (Python) | Replace | Build chat renders clips (E10-15) |
| Poster/bake/bundle | `title-city/tools/{poster,bake,bundle}.mjs` | T05/T04 references | Device-tier bake and esbuild bundling belong to the pipeline and build tooling |
| Model variants | `title-city/tools/variants.mjs` + `variants.html` (JS, no tests) | T05 (`gm-asset-variants`) keeps the op set | Out of this track |
| `gm-design-loop` SKILL.md | 44 lines, Kevin-facing | Rewrite into `gm-core`'s loop section | Rules are decided; wording and tools change |
| `gm-verify` SKILL.md | 50 lines, prototype-bound | Rewrite against `gm run/shot/perf` | Keep every "look" rule; drop the artifact deliver path |
| `gm-assets` SKILL.md | 73 lines, `assets-local` + Python | Rewrite against `gm assets *` (T05) | Tier order and lineup rule stay |
| `gm-asset-variants` SKILL.md | 56 lines | Keep rules; T05 ports tooling | Hard rules are Kevin's |
| `gm-asset-intake`, `gm-pack-scout` | 46 / 26 lines, operator skills | Keep (T05 owns) | Not build-agent skills |
| aiur skill install | `aiur/src/lib/aiur/agent_skills.ex` (Elixir, tested upstream) | Keep; GM adapts around it | No per-ticket injection (E10-6) |
| `agent-sprite-forge` plugin | v0.4.0, Python, pytest.ini present | Keep as operator tool | Spends; not in sandboxes (E10-14) |
| Engine reference skills | none vendored | Vendor (Phaser official, CloudAI minus R3F, awesome-gamedev adapted) | B14 §1.2–1.3 |
| API-name checker | lost (scratchpad) | Rewrite (TS, ~150 lines, with a test) | E10-8 |
| Pattern cards, `gm new` scaffolds | none | Build | B15 §4 |
| Sameness eval | none | Build M1/M4/M5 first | B15 §5 |
| Repair triage + promise tests | none | Build | A9 §5, B8 §6 |

## 4. Interfaces and contracts this track defines or consumes

**SDK test hook (consumed from T04; this track states the needs).**
```ts
interface GmTestHook {            // window.__gm
  ready: boolean;                 // assets loaded, first frame drawn
  advanceTime(ms: number): void;  // fixed-step simulation, no render (ui-v0 tick)
  frame(t: number): void;         // draw loop time t exactly (title-city __frame); presentational scenes
  render_game_to_text(): object;  // concise state JSON with a coordinate note (also the save serializer)
  act(action: string, phase: 'down' | 'up' | 'tap', arg?: unknown): void; // logical actions, not DOM events
  probes(): Record<string, number | string | boolean>;
  events(since: number): { t: number; type: string; data?: unknown }[];
  seed(): number; reseed(n: number): void;
  renderer(): { calls: number; triangles: number; textureBytes: number; backend: string };
  tap?(x: number, y: number): boolean;   // 0..1 screen coords; input-layer hit test
}
```

**`gm run` (this track defines; `gm` binary shared with T05).**
```
gm run --headless [--url http://127.0.0.1:PORT/] [--viewport desktop|phone|both] [--tier mobile|desktop]
       [--inputs script.json] [--frames 0,2,5] [--timeline 0:10:0.5] [--record 15s] [--rig iso] [--out shots/]
gm shot --sheet shots/            # one tiled image
gm perf [--device iphone13 --cpu 4] # load first/cached, bytes by type, draw calls, tris, texture memory vs tier budget
gm docs pattern <topic>           # prints 1–3 pattern cards
gm progress "<line>" [--media f]  # build-chat post (T06 message), uploads media to the bucket (T05/T11)
```

**Verify report (this track defines; read by the build chat, admin analytics, the repair loop).**
```json
{ "runId": "…", "jobId": "…", "aiurIssue": 123, "renderer": "ANGLE (Intel, …)",
  "viewport": "phone", "tier": "mobile", "rig": "iso",
  "frames": [{ "t": 0, "path": "shots/phone/t0.png" }], "timeline": "shots/phone/timeline.png", "clip": "shots/phone/run.mp4",
  "console": [{ "level": "error", "text": "…", "count": 3 }],
  "budgets": { "downloadBytes": [4100000, 6000000, "ok"], "drawCalls": [180, 250, "ok"], "triangles": [410000, 300000, "over"], "textureBytes": [0, 0, "ok"] },
  "probes": { "alive": true, "won": false }, "clients": 1,
  "unchecked": ["iPhone Safari", "sound"], "verdict": "fail" }
```

**Activity event (consumed by T01's event store; emitted by `gm` commands and skill markers).**
`{ jobId, aiurIssue, aiurRunId, activity: "playtesting", source: "gm run" | "skill:gm-verify", phase: "start" | "end", at }`.

**Skill pack in a game repo (this track defines; written by `gm new`, refreshed by T02's `after_create` hook).**
`.claude/skills/gm-*/SKILL.md`, `.claude/skills/vendor/{phaser,threejs,gamedev}/...`, `.codex/skills/<name> -> ../../.claude/skills/<name>`, `.agents/skills/<name>` (same link), `skills.lock` (`{ pack: "1.3.0", vendored: { "phaserjs/phaser": "<sha>", "CloudAI-X/threejs-skills": "0e18186", "gamedev-skills/awesome-gamedev-agent-skills": "184b72b" } }`), `AGENTS.md` pointing at `gm-core`.

**Repair ticket body (this track defines; T02 files it through `gm-intake`).**
Title from the signature class; body: release, signature hash, reproduction class, `gm-report:<id>`, `gm-job:<uuid>`, "Load skills: gm-repair, gm-verify", acceptance "the promise test `promises/<sig>.spec.ts` passes; L0–L1 green". Diagnostics arrive via the hook bundle, never in the body.

**Bug bundle (consumed; T01 stores, T04 assembles).** A9 §5 shape: `{ game, version, sdk, device, seed, keyframe: state, actions: [[tick, action, phase]], state, errors[], probes, events[], editorOps[], screenshot, words }`.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| T10-A | `gm run` / `gm shot` / `gm perf`: headless capture on the GPU | TS port of `capture.mjs`+`loadtime.mjs`+`loadrec.mjs`; stills at 1440x900 and 390x844@2x, tiled timeline, H.264 clip, renderer string, console dedupe, verify report JSON, tier budgets | `packages/gm-cli/src/run,shot,perf`, `packages/gm-verify/` (Playwright 1.64.1 pinned), fixtures: a 20-line SDK stub page | 3 | T04 hook names (`advanceTime`, `render_game_to_text`, `frame`, `ready`) | The SDK runtime; the build chat UI; two-client tests |
| T10-B | Skill pack scaffold + `gm-core` router | `gm new` writes `.claude/skills`, Codex and `.agents` links, `skills.lock`, `AGENTS.md`; `gm-core` ≤ 120 lines: tier order, `gm` cheat sheet, done = `gm check`/`test`/`run` green, show-as-you-go rule, B15's three anti-sameness rules, activity taxonomy | `skills/gm-core/`, `packages/gm-cli/src/new`, `templates/{phaser,three}-scaffold/` | 3 | `gm` CLI skeleton (T05 or T10-A, whichever lands first); T04 scaffold files | Genre content; pattern cards; vendored sets |
| T10-C | Vendor the engine reference layer | Phaser official (28), CloudAI (12, no R3F), awesome-gamedev adaptations (TS rewrite of code blocks), licence front matter, `skills.lock`, API-name checker + test | `skills/vendor/`, `tools/skills/check-api-names.ts` | 2 | none | Writing gm-* skills |
| T10-D | `gm-verify` skill + L0/L1 gates | Rewritten skill (look rules, defect checklist, budgets, unchecked list); L0 static (`tsc`, lint banning `Math.random`/`Date.now` in sim, hook present); L1 smoke (boot, 3,600 ticks, state round-trip, HUD still) as `gm check`/`gm test` | `skills/gm-verify/`, `packages/gm-cli/src/check,test`, `packages/gm-verify/gates/` | 3 | T10-A; T04 seeded RNG + fixed timestep | Explorer bots (A9 L2); device calibration |
| T10-E | Platformer wave: `gm-genre-platformer`, pattern cards, `gm docs pattern` | First genre skill with 4–6 themeless cards (jump buffer + coyote, deadzone camera, one-way platforms, hit feedback tiers), each with an `advanceTime` test | `skills/gm-genre-platformer/references/*.md`, `packages/gm-cli/src/docs` | 2 | T10-B, T10-C | Other genres; HUD/input skills |
| T10-F | Skill wave 2: `gm-input`, `gm-ui-hud`, `gm-audio`, `gm-multiplayer-ready`, `gm-scope-options`, `gm-editor-tuning` | Six short skills written to B14 §2 verdicts; `gm-multiplayer-ready` includes the T07 client section; `gm-audio` covers ZzFX + Tone 15 `getTransport()` | `skills/gm-*/` | 2 each (one PR per skill) | T10-B; T07 protocol types for the multiplayer skill; T04 input action map | Code in the SDK; room server |
| T10-G | Repair loop: triage, `gm-repair`, promise tests | Signature dedupe, headless replay classification, editor-fix routing, repair ticket body, `promises/*.spec.ts` generator, 2-attempt placeholder as config | `services/repair/`, `skills/gm-repair/`, `packages/gm-verify/replay.ts` | 4 | T10-A, T10-D; T01 bug intake + storage; T02 `after_create` bundle; T04 ring buffer; T08 `state()` = save | The report button; admission; aiur changes |
| T10-H | Sameness eval harness | 10 briefs, `with_skill` vs `baseline` configs, M1 (jscpd), M4, M5 assertions, `benchmark.md`; runs on demand on the signed-in agents | `evals/skills/`, `tools/skills/eval.ts` | 3 | T10-A, T10-E | CI gating; paid judges; M2/M3 embeddings |
| T10-I | Build-chat media from the worker | `gm progress --media` uploads a still/clip and posts a chat message; `gm-core` requires one after every `gm run` | `packages/gm-cli/src/progress` | 2 | T06 message type; T05/T11 bucket signed upload; T01 job id | The chat panel; aiur alerts |

## 6. Risks and unknowns

- **Hook naming and ownership (E10-3).** Default: T04 ships `advanceTime`, `render_game_to_text`, `frame`, `ready`, `act`, `probes`, `renderer` under `window.__gm`; `tick(sec)` becomes an alias. Decide before T10-A.
- **GPU inside the sandbox (E10-4).** Default: T03 binds `/dev/dri/renderD128` read-write into the capture sandbox and the Playwright browser cache read-only; fall back to SwiftShader with `--frames` reduced and a warning in the report. Spike: one `gm run` inside the chosen sandbox.
- **Codex discovery of repo-shipped skills (E10-6).** Default: write `.codex/skills` and `.agents/skills` links from the scaffold; acceptance = one Codex ticket that loads `gm-core`. If Codex ignores them, the `after_create` hook can also append to `AGENTS.md`.
- **Concurrent captures on one iGPU.** Unmeasured. Default: a host-wide semaphore of 2 concurrent `gm run` processes; measure with the 1+3 slot default.
- **Vendored-set drift (E10-8).** CloudAI was rewritten five days before B14; Phaser skills track master. Default: pin SHAs, refresh only through a PR that re-runs the checker.
- **Eval cost (E10-9).** 20 builds per iteration on subscriptions. Default: on-demand only; required before a skill change merges, not on every PR.
- **Repair numbers (E10-10).** Kevin picked "after measurement". Default: 2 attempts, 1/3 reservation, both in config; T10-G records attempt cost so the number can be set.
- **Visual judge (E10-19).** Default: no paid judge in V1; the worker reads the sheet and answers the binary checklist in the PR; only L0–L1 and budgets block.
- **`after_create` timing on warm workspaces (B8 §8).** Default: the skill pack is in the repo, so the hook only refreshes it; if the hook runs late, the previous pack version is already there.
- **`landing-page-design` and other host skills leaking into workers (E10-11).** Default: sandbox home contains no user-level skills or plugins; verify once with `ls ~/.claude/skills` inside a worker.
- **Two-client verify (E10-12).** Needs T07's room and invite links; default: a follow-up ticket after T07's first PR, not part of T10-D.

## 7. Self-hosting notes

- Checked read-only on the host: `node v24.14.0`, `npm 11.9.0`; Playwright `1.64.1` (repo-local in `prototypes/ui-v0/tools/node_modules`); browser cache `~/.cache/ms-playwright/{chromium-1228, chromium-1248, chromium_headless_shell-1228/1248, webkit-2311, ffmpeg-1011/1013}`; `/usr/bin/ffmpeg 7.1.5`, `/usr/bin/chromium`, `/usr/bin/xvfb-run`; GPU `Intel Comet Lake UHD Graphics` at `/dev/dri/{card0,renderD128}`; no `blender`, `gltf-transform`, `gltfpack`, global `esbuild`.
- Measured: headless WebGL on the iGPU through ANGLE/EGL with no display server (E10-4). This replaces A9's and C2's "CI is SwiftShader" assumption: relative performance proxies (draw calls, triangles, script time per tick, bytes) are now taken on real GL; absolute phone frame rates still need Kevin's iPhone.
- Memory and cores: A9 estimates 1–2 GB per browser; with 1 creation + 3 edit builds each running `gm run` the verify layer alone can hold 4–8 GB of the 31 GB and 4 of 12 cores; T11 should reserve the rest for aiur workers and services and apply `nice` to capture processes.
- Everything this track needs installs from npm with pinned versions already in the lockfile (`playwright`, `esbuild`); the Playwright browser download is the only large fetch and is already cached, so a repo-local `npm ci` with `PLAYWRIGHT_BROWSERS_PATH` pointing at the cache adds nothing.
- The sprite-forge plugin runs with `~/.local/share/ogm/forge-venv/bin/python` on this machine only; no sandbox image should include it (E10-14).
- Codex CLI 0.162.1 and Claude Code 2.1.316 are the global agents aiur drives; the skill pack must be legible to both, hence the three install paths in §4.
