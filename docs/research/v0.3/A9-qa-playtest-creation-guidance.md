# A9: Automated playtesting, quality gates, the bug-repair loop, and creation guidance

**Spikes:** S10 and R17 (testing, reproducibility, performance evidence), R18 (creation guidance, the first-build wait, learning validation), and the §5.7 bug button.
**Spec baseline:** v0.3, §1.3, §5.3–5.5, §5.7, §6, §7.3, §7.7, §11.2 S10, §11.4 R17/R18, §13.
**Access date for all sources:** 2026-10-21.
**Status:** research only. I ran no benchmark and no prototype. Every number below is either cited, a labeled estimate, or a proposal to measure.
**Sibling reports:** A4 covers the SDK and editor contract, A5 covers saves and releases, and A2/A3 cover design-expertise skills. This report refers to them and does not repeat them.

---

## 0. Summary of conclusions

1. **Playwright 1.64.1 is the test backbone. Reuse it, do not build our own.** It has a fake clock that drives `requestAnimationFrame`, WebKit and device profiles, video and trace capture, and a bundled MCP server and CLI. The work Game Maker must build is the **in-game test hook** (`window.__gm`), not the harness.
2. **Determinism comes from the SDK, not from the browser.** Fixed-timestep simulation, a seeded RNG owned by the SDK, and input recorded as *logical actions per simulation tick* make replay work. A seed plus timed raw DOM events does not. This must be an A4 SDK requirement. Without it, replay-based bug repair and regression "promises" both fall apart.
3. **Layered gates.** Every draft build runs a cheap deterministic layer (about 2–6 CPU-minutes, no LLM). Publish adds an exploration bot, a WebKit/iPad-profile pass, save-migration fixtures, and one LLM visual review. Human or specialist review covers fun, story, and child accessibility. Automation cannot establish those (§4).
4. **Performance budgets cannot be set from CI.** Headless Chromium on Railway renders WebGL on the CPU through SwiftShader, so its frame rates say nothing about an iPad. CI can catch *regressions* (main-thread script time per simulated frame, Long Animation Frames, asset bytes, load time) relative to the previous release. Absolute FPS budgets need a calibration run on Kevin's actual iPads and desktops. I propose that methodology, not numbers (§3.5).
5. **LLM-as-judge is a smoke detector, not a verdict.** Benchmarks show vision models catch obvious static glitches unreliably and temporal glitches at near-chance rates. Use the judge to flag, not to block, except on a few binary checks it does well, such as "is the screen blank" or "is the text unreadable" (§3.7).
6. **First-build wait (R18).** The evidence favors *"keep making while it builds"*: drawing characters, choosing music, and tuning a prebuilt **genre demo kit**. A passive progress screen is worse. Web push on iPad works **only after the site is installed to the Home Screen** (iPadOS 16.4+). Plan an install prompt, or accept email and parent notifications as the fallback.
7. **Variants should come from tunables, not agent builds.** About three variants shown as presets of an existing demo kit cost close to nothing and are playable instantly. Variants built by an agent cost a full build each, so they belong only to truly divergent concepts.

---

## 1. Requirement being investigated

- **§7.3/R17:** Test controls, editing, saves, previous-release migration, visual and audio coherence, and mobile behavior. Check whether the debug and replay hooks are sufficient. Recommend evidence-based budgets. Say where humans are needed.
- **§5.7:** Bug button, diagnostic bundle, automatic issue, repair budget, retries, fallback message, regression promises, and privacy scoping.
- **§5.4/5.5/R18:** Clarification with little reading, variant presentation, the wait of up to about an hour, notifications, and learning-validation evidence (§13.2).

---

## 2. Primary sources and versions (verified 2026-10-21 unless marked)

| Item | Version or state | Evidence |
|---|---|---|
| Playwright (`microsoft/playwright`) | **v1.64.1** (2026-10-14), Apache-2.0, ~98k stars | `gh api repos/microsoft/playwright/releases/latest`; release notes: 1.62 bundles MCP and CLI (`npx playwright mcp` / `cli`), plus WebP screenshots; 1.63 adds aria/DOM/screen snapshots per action in traces; 1.64 adds custom-fps VP9 video (Firefox and WebKit capped at 25 fps), `page.webmcp`, and WebMCP-on-by-default in MCP. https://playwright.dev/docs/release-notes |
| Playwright clock | `install`, `pauseAt`, `runFor`, `fastForward`, `setFixedTime`. `runFor` fires timers **and animation frames**. `performance` is on the list of overridden APIs, but `performance.now` behavior is **not spelled out (unverified)** | https://playwright.dev/docs/clock |
| Playwright WebKit | Built from WebKit main, **not branded Safari**. Linux builds differ from macOS (for example, codecs) | https://playwright.dev/docs/browsers |
| Headless Chromium WebGL | Playwright **always passes `--enable-unsafe-swiftshader`** (`packages/playwright-core/src/server/chromium/chromium.ts`, line ~378, read via gh api). Chromium removed the automatic SwiftShader fallback around M139, so without that flag WebGL fails on GPU-less hosts | blink-dev "Intent to Remove: SwiftShader Fallback"; Chromium `docs/gpu/swiftshader.md` |
| `toHaveScreenshot` | `threshold` defaults to 0.2, plus `maxDiffPixels` and `stylePath`. Baselines are stored per browser and platform; generate baselines in the same environment | https://playwright.dev/docs/test-snapshots |
| Playwright MCP (`microsoft/playwright-mcp`) | v0.0.83 (2026-09-28), Apache-2.0, ~38k stars. Works from the accessibility tree; screenshots are view-only; `--caps vision` adds coordinate clicks; `--caps devtools` adds tracing and video; `--device`. The README says **CLI+skills are more token-efficient than MCP** | repo README |
| Chrome DevTools MCP (`ChromeDevTools/chrome-devtools-mcp`) | v1.11.0 (2026-10-15), Apache-2.0, ~54k stars. Provides performance traces and insights, console with source maps, network, screenshots. **Telemetry on by default** (`--no-usage-statistics`), and **CrUX lookups send trace URLs to Google** (`--no-performance-crux`). Chrome only | repo README |
| agent-browser (`vercel-labs/agent-browser`) | v0.39.1, Apache-2.0, ~44k stars (already in the prior catalog; not re-evaluated) | gh api |
| pixelmatch | **v8.0.0** (2026-10-06), ISC, ~7k stars | gh api |
| web-vitals | Apache-2.0, ~8.6k stars (latest release tag not returned by the API) | gh api |
| CCapture.js | v2.0.0 (2026-07-27), MIT, ~3.8k stars | gh api |
| seedrandom | ~2.1k stars, **last push 2024-04**, no SPDX license detected via the API (README says MIT; **verify**). A ~10-line inline mulberry32 is the lazier choice | gh api |
| Long Animation Frames API | Chrome/Edge 123+. **Not supported in Safari or Firefox.** 50 ms threshold; per-script attribution | https://developer.chrome.com/docs/web-platform/long-animation-frames |
| Phaser / Three.js | Phaser v4.2.1 (2026-07-09); Three.js r186 (2026-09-24) | gh api |
| Web push on iPad | iPadOS 16.4+: **Home Screen web apps only**, requires a user gesture, and the manifest needs `display: standalone` or `fullscreen`. No Apple developer account needed. Declarative Web Push (no service worker) arrived in iOS/iPadOS 18.4, also Home Screen only | https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ; WebKit Safari 18.4 notes |
| VLM game-QA evidence | GlitchBench (arXiv 2312.05291): 593 glitch and 330 clean screenshots; best model at the time 43.4%. VideoGameQA-Bench (arXiv 2505.15952): visual unit and regression tasks. TempGlitch (arXiv 2605.21443): 12 VLMs **near chance** on temporal glitches | arXiv |
| Reachability bots | Go-Explore for reachability testing (Lu et al., arXiv 2209.00570, IEEE ToG): beats curiosity-driven RL on coverage, and notes that replaying recorded human input "is not robust to level changes, not exhaustive" | arXiv |
| Children's UX | NN/g, "Children's UX" (Sherwin & Nielsen, 2019; 125 children across 2001, 2010, and 2018 studies): ages 3–5 cannot or barely read; avoid scrolling; prominent in-app back buttons; kids skip instruction paragraphs; 6–8 tested best in pairs | https://www.nngroup.com/articles/childrens-websites-usability-issues/ |
| ScratchJr | Ages 5–7 design (Flannery, Bers et al., IDC 2013). A 2023 IJCCI study found novices engage with no instruction, but engagement is best with curricular support (**findings summarized secondhand; the full paper was not read**) | MIT Media Lab publication page; BC DevTech PDFs |
| Toca Boca | "Digital toys, not games": no text, no tutorials, no stress music (company statements via press; **no published test method**) | GamesBeat, KillScreen |
| Game Builder Garage | 7 guided lessons in strict steps, then "Checkpoints" (fix-the-broken-mechanic puzzles), then free programming unlocked after lesson 1 (reviews and Nintendo marketing) | Nintendo listing; Nintendo Life and GameSpot reviews |
| Super Mario Maker | **Clear Check: the creator must beat a course before upload** (both games; Nintendo support plus guides) | Nintendo support a_id 21369 |
| Yamamura's Dojo (SMM2) | Beginner, Intermediate, and Advanced tiers of short demonstrative lessons covering design topics such as fairness and pacing. Criticized as not hands-on (fan wiki and reviews) | mariowiki |
| Roblox Studio | An onboarding tour plus editable templates (platformer, laser tag, racing); the first curriculum project is a simple platformer (page updated 2026) | https://create.roblox.com/docs/experiences |
| Minecraft Education | **Not researched this round.** Inaccessible in the time box; unverified |

Claude API prices (from the skill cache dated 2026-10-06): Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per million input/output tokens. The image token estimate of about (w×h)/750 is **from memory; verify against the vision docs**. aiur may run on subscriptions, so read token counts as the durable measure.

---

## 3. Findings: testing, reproducibility, performance (S10/R17)

### 3.1 The in-game hook contract (build; belongs to the A4 SDK)

Every game must expose a test and diagnostic adapter through the SDK. The game itself does not hand-roll it. The prior catalog's `window.__game = { state, seed, step(n), input(action) }` pattern holds up, with these additions:

```ts
interface GmTestHook {
  version: string;                       // game semver + SDK version
  seed(): number; reseed(n: number): void;
  step(ticks: number): void;             // advance fixed-timestep sim; no rendering needed
  act(action: string, phase: 'down'|'up'|'tap', arg?: unknown): void; // logical actions, from the input manifest
  state(): JsonValue;                    // the same serializer as cloud saves (A5) — one code path
  load(save: JsonValue): void;
  probes(): Record<string, number|string|boolean>; // genre facts: hp, x, y, room, questFlags, score, alive, won
  events(since: number): GameEvent[];    // won, died, softlock-suspect, error, achievement
  editor: { list(): ControlId[]; apply(id: ControlId, v: unknown): void; undo(): void }; // A4 editor manifest
}
```

Key decisions:

- **Logical actions, not DOM events.** Replay records `(tick, action, phase)` against the game's own input manifest. Touch, keyboard, and gamepad all map onto those actions, so one recording replays on any device profile.
- **`state()` must be the save serializer.** Then save tests, the bug snapshot, rewind (§5.17), and `load()` for jumping straight to a scenario all share one tested path.
- **Playwright 1.64 WebMCP** (`page.webmcp`, enabled by default in MCP) could register this hook as named tools, so an agent can call `gm_step` directly. It is experimental, so treat it as a later optimization. `page.evaluate` is enough today.

### 3.2 Determinism: what holds and what doesn't

| Source of nondeterminism | Mitigation | Residual risk |
|---|---|---|
| `Math.random` | SDK-owned seeded PRNG (mulberry32 inline). Lint or the agent skill forbids raw `Math.random` in simulation code | Third-party libraries (particles) using `Math.random`: acceptable if they only affect visuals |
| Variable frame delta | Fixed timestep (for example 60 Hz) with an accumulator; render interpolates | Physics engines must also be stepped at a fixed dt (Arcade Physics and Rapier both allow it) |
| Wall-clock time | Playwright `clock.install()` + `runFor`, or better, call `step()` directly with no rendering | `performance.now` behavior under the fake clock is not documented (verify in the first spike) |
| Floating point across browsers | Same browser binary + same build gives the same results. **Cross-engine (Chromium vs WebKit) bit-exactness is not guaranteed** | Replay a bug from an iPad in WebKit; compare *probes* with tolerances, not hashes |
| Asset/async loading order | The SDK gates the simulation start on "assets ready" | Lazy-loaded rooms must load deterministically, or the replay must wait |
| Network and multiplayer | Out of MVP. Needs server-authoritative logs; **inputs + seed are insufficient** | Defer (A-multiplayer) |
| Audio-driven timing (rhythm games) | Simulation must not read the audio clock | Rhythm genre needs a special case |

**Verdict on §5.7's question:** seed plus about 30 s of inputs is sufficient **only if** the bundle also has a *starting state snapshot* (taken at the beginning of the ring buffer) and the game follows the rules above. Without the snapshot you would have to replay from boot, which is infeasible after a 40-minute session. Recommendation: the SDK writes a `state()` keyframe every N seconds (about 10 s) into the ring buffer. Rewind (§5.17) needs the same machinery, so it is reused, not duplicated.

**Limits:** If the bug is in rendering or in code outside the simulation (camera, shaders, UI layout), replay reproduces the *situation*, not necessarily the defect. That is why the bundle includes the screenshot and console errors.

### 3.3 Exploration bots for reachability and unwinnable states

Recorded playthroughs are brittle when levels change (Go-Explore paper). Use cheap, genre-parameterized explorers that run against `step()` headlessly. No rendering is needed, so they run thousands of ticks per second (**estimate**).

- **Simple UI or puzzle game:** a random-plus-greedy agent over the action set. Asserts: a reachable win event within K actions, a reachable lose or retry path, no dead UI (every visible button does something).
- **Platformer:** Go-Explore-lite. Archive cells keyed by (room, x/16, y/16, key-items); pick a less-visited cell, `load()` its state, then try random action macros (hold-right+jump for n ticks). Asserts: the goal cell is reached; each checkpoint is reachable from spawn; no cell is a trap where every macro fails to progress for T ticks (softlock suspect). Creator-made levels pose the same problem as Mario Maker, and Nintendo solves it with a human **Clear Check**. Copy that: a level that the bot cannot clear is not a blocker if the *creator* has cleared it. Record the creator's clear as a replay fixture.
- **Stateful RPG:** a graph explorer over quest flags. Walk dialogue and choice trees through `act`; BFS over `(room, questFlags)` with a budget. Asserts: the main quest end flag is reachable; no flag combination leaves zero outgoing progress (dead end); inventory or flag invariants hold after `state()`→`load()` round-trips.

**What bots cannot establish:** whether something is fun, whether difficulty is *appropriate*, whether a 5-year-old can understand the goal, or narrative quality. Bots *can* produce evidence for A2/A3 critics, such as death heatmaps, time-to-clear distributions, and unused rooms. This is also the honest version of the §6.3 "robot playtesters" idea: present the heatmap as "the robot got stuck here 40 times," without claiming the robot is a player.

### 3.4 Visual regression on canvas

- `toHaveScreenshot` and pixelmatch work on canvas **only with frame-exact capture**: pause the clock, `step()` to tick N, render once, then screenshot. Baselines must come from the same container image (Playwright docs). Run inside the official Playwright Docker image on Railway, pinned to the same tag as the `@playwright/test` version.
- **Use them for:** the platform HUD and editor chrome (stable), title screens, and "same seed, same tick" golden frames *within one release line*. **Do not use them** across agent rebuilds, where art changes on purpose. In those cases use perceptual checks: non-blank frame, palette consistency with the style brief (histogram distance), and text contrast.
- Keep baselines in the game repo as WebP (1.62+) to stay small. Note that lossy WebP interacts with `threshold`, so use lossless for goldens.

### 3.5 Performance: evidence and budget methodology

**Fact:** CI WebGL runs on SwiftShader (CPU). Its FPS numbers are meaningless for iPad GPUs, and Railway offers no GPU (**unverified for current Railway plans; A-infra should confirm**). LoAF is Chromium-only, so it cannot instrument iPad Safari in the field.

**What CI can measure reliably as a relative regression (same container, same machine class):**
1. **Simulation cost:** ms of script per `step()` tick, measured in a loop (CPU-bound and comparable between builds).
2. **Main-thread frame work:** Chrome DevTools trace or LoAF entries during a 20 s scripted run. Report the count of frames over 50 ms and the `blockingDuration` sum.
3. **Bundle and asset bytes**, first-load request count, and time-to-interactive under a throttled network profile (CDP `Network.emulateNetworkConditions`).
4. **Memory:** JS heap after a 2-minute soak with room transitions (leak detection).
5. **Draw calls and triangles** from the renderer's own counters (Three.js `renderer.info`; Phaser's renderer stats), exposed through `probes()`. These are GPU-independent proxies for GPU load.

**Owner-approvable budget methodology (proposed, not numbers):**
1. Build a **calibration pack**: the three representative games, plus stress variants (2× and 4× entity counts).
2. Run each on the **real target devices** (Kevin's specific iPads and desktops; record models and OS versions). The SDK's built-in in-game frame-time recorder logs rAF deltas (p50, p95, p99, % of frames over 1.5× the refresh interval) and posts them to analytics. This works in Safari because it is plain rAF timing, not LoAF.
3. Also measure on the device *while a build is running server-side*. That should not matter for a client-side game, but §7.7 asks, and it checks the live-update and HMR paths.
4. Fit a mapping from the CI proxies (draw calls, sim ms, bytes) to the device p95 frame time. Set CI budgets as **proxy thresholds that predicted acceptable device performance** in the calibration data.
5. Kevin approves the device targets (for example "p95 frame time under X ms on iPad model Y"). The research supplies the measured curve. Re-calibrate when the SDK or the engines change major version.

Until calibration exists, the gate is **"no more than +Z% regression versus the last published release on proxies"**, plus hard ceilings only for obvious failures (frames over 1 s, heap growing without bound).

### 3.6 Audio checks

`OfflineAudioContext` renders the game's audio graph faster than real time. It is a standard Web Audio API, available in all three engines. Through a hook (`gm.audio.renderCue(id)`), compute RMS and an approximate integrated loudness (a K-weighted LUFS implementation is about 60 lines, or a small library; **no ≥1k-star JS LUFS library was verified**). Checks: no clipping (peak below −1 dBFS); music and SFX levels within a set dB spread; dialogue or voice ducking engaged; nothing silent that should play. Taste is out of scope (A2/A3 audio skill + human). Caveat: this only works if games route audio through the SDK's mixer. Tone.js, Howler, or Phaser's sound manager can be routed into an `AudioContext` that the SDK owns (**integration unverified per library**).

### 3.7 LLM-as-judge on screenshots and video

**Can establish (reasonably):** blank or black screens, missing sprites (magenta or empty boxes), text overflow or unreadable contrast, obvious style mismatch with the chosen art direction ("the 8-bit game has a photoreal tree"), HUD overlap on phone versus desktop layouts, and whether an obvious goal is visible on screen. Run it as a checklist of binary questions per frame, not as a free-form "rate this".

**Cannot establish:** fun, pacing, fairness, emotional tone for a specific child, subtle animation or physics glitches (TempGlitch shows near-chance results), or anything that needs knowledge of the rules. Single-screenshot glitch detection was below 50% in GlitchBench (2023 models; newer models will do better, but there is no current leaderboard I verified).

**Policy:** On draft builds the judge produces *advisory* findings for the implementing agent. On publish, block only on the 3–4 binary checks that we validate on our own labeled fixture set (see §7). **Cost estimate:** 12 frames at 1280×720 is about 12 × 1.2k ≈ 15k image tokens, plus about 3k prompt and 1k output. That is roughly **$0.04–0.05 on Sonnet 5.5** or **~$0.002 on Haiku 5.5** per review (estimate; verify the image-token formula). It is cheap enough for every publish and affordable for every draft.

**Playwright MCP vs CLI for agents:** For the *implementing agent's* own iterative debugging, the Playwright CLI plus a skill is more token-efficient, as the Playwright MCP README itself says. The accessibility tree is useless for a canvas, so agents need `probes()` text plus occasional screenshots. Chrome DevTools MCP is valuable for perf traces and source-mapped console output, but must be run with `--no-usage-statistics --no-performance-crux`: by default it sends trace URLs to Google, which would leak private game URLs. Neither MCP is needed in the deterministic CI gates. Plain `@playwright/test` scripts are cheaper and reproducible.

### 3.8 Save-migration fixtures (interface with A5)

- Every publish snapshots **fixture saves**: the bot's states at checkpoints (start, mid-quest, end) via `state()`, stored as `fixtures/saves/v{semver}/*.json`. They are synthetic, never real user saves.
- The publish gate for release N loads every fixture from the releases still inside the A5-defined compatibility window, runs migrations, and asserts: `load()` doesn't throw; key probes are preserved (room, inventory count, quest flags monotonic); a 30 s bot run after loading triggers no errors.
- Real-user saves may be used **only** as private, ephemeral test inputs inside the isolated build environment, if A5 and Kevin allow it. They never go into the repository (§5.7 privacy).

---

## 4. Proposed layered test architecture

| Layer | Runs on | Contents | Est. wall / cost per run |
|---|---|---|---|
| **L0 Static** | every agent commit | `tsc`, lint (ban raw `Math.random` and `Date.now` in simulation code), SDK contract check (hook present, editor manifest valid against the A4 schema), bundle-size diff | <1 min CPU, $0 tokens |
| **L1 Deterministic smoke** | every draft build | Chromium headless: boot without console errors; `step` 3,600 ticks with scripted actions; win and lose probes reachable by the scripted path; `state()`/`load()` round-trip; every editor control `apply`→`undo` restores state; HUD golden screenshot; regression promises replay | ~2–4 min CPU (**estimate**), $0 tokens |
| **L2 Exploration and device** | draft builds marked "ready to try" + all publishes | Genre explorer bot (budgeted, about 2–5 min); WebKit iPad and phone viewport profiles (layout, touch-action mapping, safe areas); network-throttled load; perf proxies vs last release; audio offline checks | ~5–10 min CPU (**estimate**) |
| **L3 Publish-only** | publish | Save-migration fixtures; LLM visual checklist (binary questions); video capture for library preview (CCapture or Playwright video); evidence pack (death heatmap, time-to-clear) for A2/A3 critics | +2–3 min, ~$0.05 tokens |
| **L4 Human** | periodically / publish of a new game | Creator's Clear Check (Mario Maker pattern: the creator plays it before others can); family playtest observations; Kevin review on escalation | Human time |

Gate rule (from §7.3): any L0–L1 failure keeps the draft out of the "try it" state and returns it to the agent. L2–L3 failures block publish; the last published release is never overwritten. The tolerable-chaos zone is drafts: the creator can play a draft that passed L1 even if L2 found issues, labeled as "the robot found something odd."

Railway compute: Playwright's Docker image needs about 1–2 GB RAM per browser (**estimate**). At low family scale, cost per run is cents of CPU. Measure it in the next spike instead of trusting these figures.

---

## 5. Bug-button repair loop (§5.7)

**Bundle (assembled client-side by the SDK; size target about 200 KB or less):**
- Game id, release or draft version, SDK version, device profile (UA, viewport, input type)
- Seed, last state keyframe, ~30 s action ring buffer from the keyframe, and the current `state()`
- Last 50 console errors and unhandled rejections with source-mapped stack traces (keep source maps server-side)
- `probes()`, the last ~200 `events()`, and the editor operations log since the last load
- One downscaled screenshot (~480 px WebP) **plus** the child's words: text, or a transcript if voice was used. Audio is not kept by default.

**Flow (deterministic until diagnosis is needed):**
1. The bundle is uploaded to private storage (not GitHub). A deterministic job creates an issue in the private game repo with **redacted metadata only**: version, error signature, and a link to the private bundle. A public source repo (§9.3) never gets screenshots, speech, names, or saves.
2. **Automatic triage, no LLM:** dedupe by error signature. Replay headlessly to tick-match and classify the bug: *reproduces with error*, *reproduces with no error* (a logic or design complaint), or *does not reproduce*.
3. **If an editor control can fix it** ("too hard", "enemy too fast"), route to the A4 editor command path instead of coding. This costs nearly nothing.
4. Otherwise, start a **repair job** with the bundle, the replay script, and a generated **failing promise test** (replay plus an assertion derived from the complaint). The repair must make the promise pass and keep L0–L2 green.
5. **The promise is kept:** `promises/*.spec.ts` runs in L1 forever, or until a feature deliberately changes that behavior (the agent must state that in the changelog).

**Proposed budgets and limits (Kevin decides; these are defaults):**
- A repair job's budget is smaller than a feature job's, for example about 1/3, because the scope is narrow. Allow 2 automatic attempts. On the 2nd failure, stop and escalate.
- Wall-clock target: 10 minutes or less to a fixed draft for reproducible errors.
- **Fallback message** (shown as a picture plus spoken text): "The robots couldn't fix this one yet. Uncle Kevin will take a look. You can keep playing the last version, or try a different idea!" Then escalate to Kevin's admin queue with the bundle.
- Non-reproducible reports: keep the bundle, add a probe and logging promise, and don't burn tokens guessing.

**Data questions:** retention period for bundles and screenshots of children's play; whether transcripts are kept; and whether bundles can ever be sent to an LLM provider at all. Bundles include child-generated content, so this needs a ruling under R19 and §10.4.

---

## 6. Creation guidance, waiting, and learning (R18)

### 6.1 Clarifying with minimal reading (ages 5–7)

Evidence: pre-readers can't read and early readers read tentatively. Kids skip instruction text; avoid scrolling; familiar icons work even at age 3 (NN/g). Toca Boca succeeded with no text and no tutorials. ScratchJr shows novices can engage unguided, but do better with support.

Proposals:
- **Every question is a full-screen picture choice** with 3–4 large options plus "Other" (mic or draw), and speech plus captions read it aloud automatically. No scrolling. A visible "surprise me" option is the default path.
- **Question budget:** The §5.3 form already gathers art, style, genre, and references. Narrowing (§5.4) should add **at most 2–3 picture questions**, chosen by an agent only where uncertainty is *meaningful*: "what do you do?", "how do you win?", "what's the scary or fun thing?". After that, proceed with defaults. The system shows a picture "plan card" (the creator's drawing, the chosen hero, a 3-panel storyboard) and the child taps 👍 or "change". That is the "creator's wish vs. agent's plan" comparison from §6.3. Treat the cap of 3 as a starting hypothesis to test with the niece and nephew, not as evidence-based.
- **Reference "what do you like?"** as a picture grid of verbs (jump, build, explore, fight, collect, talk). This is cheaper than free-form speech and doubles as genre-exposure data.
- Preserve imagination: the child's drawing or words go into the plan card verbatim, and the agent brief must quote them. A2/A3 should add "fidelity to the creator's words and drawings" as a rubric item.

### 6.2 Variant presentation

| Option | Cost | Latency | Use for |
|---|---|---|---|
| Static picture variants (prebuilt gallery per art style × genre, or composited from asset packs) | ~$0 at request time | instant | art, mood, setting |
| **Playable presets of a prebuilt genre demo kit** (same template, three tunable presets: floaty vs snappy jump, slow vs fast enemies) | ~$0 (no agent) | instant | "feel" questions, the main §5.4 use |
| Image-generated mock screenshots | image API cost per variant (vendor-dependent; R16/R19) | 10–60 s (**estimate**) | unusual concepts not in the gallery |
| Agent-built ~10 s demos | roughly one small build each (minutes and tens of thousands of tokens; **estimate**, measure in an aiur benchmark) | minutes | almost never; only truly divergent mechanics |

Recommendation: build a **demo kit per MVP genre** once, platform-owned, with editor tunables. Variants then become presets, which is consistent with §3.2 (deterministic before agent) and §5.4 ("don't require an expensive three-variant build").

### 6.3 The first-build wait (up to about an hour)

What comparable products do: Game Builder Garage and Yamamura's Dojo use short, demonstrative lessons. Mario Maker makes *making* the activity itself. Roblox offers editable templates first. None of them makes a child wait an hour. Our wait has no direct precedent, so design it as **parallel creation**, not as a distraction.

Candidate activities, ranked by how much they feed the build or the child's authorship:
1. **Draw or approve characters and objects.** These feed the asset pipeline (A-assets) while the code builds. The child's drawing appears in the game: authorship and real progress at once.
2. **Tune and play the genre demo kit** using the same editor controls the real game will have. This teaches the editor before the game exists, and the choices (jump height, colors) carry over as defaults where they map.
3. **Pick music and sounds** from a picture grid (moods). This feeds the audio brief.
4. **"Watch it being built" storytelling:** the progress board (§5.5) as a picture timeline with the child's hero ("the builders are making your volcano… now testing jumps"). Stage changes come from deterministic job events, never from an agent narrating (§5.5). Show a screenshot from L1 smoke tests as soon as one exists. That is real progress, not a fake bar.
5. Play the other games on the wall.

**Closing the browser:** jobs are durable (§5.5). On return, Home shows the game card with "Ready! ▶". For notifications:
- **iPad web push requires Home Screen installation** (iPadOS 16.4+; verified). In the first-session flow, add a parent-assisted "Add to Home Screen" step (Safari share sheet; iPadOS has no programmatic install prompt).
- Fallbacks: an email or SMS to the parent or Kevin (account-level; R04), and an in-app badge on return. On desktop Chrome and Edge, standard web push works without install.
- Notification text is picture-forward and never includes the child's name on the lock screen (privacy default; **Kevin decides**).

### 6.4 Lightweight learning-validation evidence (§13.2)

Collect these without homework:
- **Automatic (analytics, R11):** genres tried versus their first choice; % of changes made through editor controls versus new-feature requests; returns to the same game; voice versus tap usage; "Other" usage; plan-card "change" taps (an idea-fidelity proxy); repair outcomes.
- **Observation protocol for family sessions** (Kevin or a parent, about 5 minutes, a one-page form): Did they complete creation without adult reading? (yes / with help, at which step) Did they recognize their idea? (the child's own words) Could they say what's different about a new genre? (one prompt: "how is this game different from your other one?") What did they try to do that the UI didn't allow?
- **Optional child reflection:** one tap, "how did making feel?" with 3 faces, skippable (§6.3 says it must not become mandatory).
- Record observations as session notes in Kevin's admin area. Do not record audio or video of children by default.

---

## 7. Evaluation method for this report's proposals

1. **Determinism spike (about 1 day):** a Phaser 4 platformer stub with the hook. Record 30 s in Chromium and replay 100× (expect identical probes), then replay in Playwright WebKit (measure probe drift). Also measure `performance.now` under `clock.install`.
2. **Bot spike:** inject 10 known defects (unreachable goal, soft-lock pit, missing quest flag) into the three representative games. Measure the bot detection rate and time. Target: catch at least 8 of 10 with explorers costing under 5 CPU-minutes. That target is a hypothesis, not a promise.
3. **Judge calibration:** a labeled set of about 60 frames from our own games (blank, overflow, wrong style, clean). Measure precision and recall per binary check on Haiku 5.5 versus Sonnet 5.5. Only checks with ≥90% precision may block publish (bounded cost: under $5).
4. **Perf calibration:** §3.5 on Kevin's devices.
5. **R18 family test:** 2 sessions each with the niece and nephew. Use the observation form. Compare a 2-question versus a 4-question narrowing flow; compare waiting with the demo kit versus drawing.

---

## 8. Reuse / adapt / build

| Reuse | Adapt | Build |
|---|---|---|
| `@playwright/test` 1.64 (clock, devices, video, trace, toHaveScreenshot), official Docker image | Go-Explore idea into small genre explorers | SDK test and diagnostic hook (A4), ring buffer + keyframes (shared with rewind) |
| pixelmatch v8 (if used outside the Playwright expect) | Chrome DevTools MCP for agent perf debugging (privacy flags on) | Explorer bots per genre template |
| Playwright CLI and MCP for implementing agents | LUFS snippet for OfflineAudioContext | Bug-bundle uploader, triage and replay job, promise-test generator |
| web-vitals (platform shell, not canvas) | Mario Maker Clear Check, as creator playthrough fixtures | Genre demo kits, picture-question library, observation form |
| CCapture.js (preview capture) | | Perf calibration recorder in the SDK |

Licensing: everything listed is Apache-2.0, MIT, or ISC. seedrandom's license metadata is missing; prefer an inline PRNG.

## 9. Stack integration

- **TypeScript and the SDK:** the hook lives in `@gm/sdk/test`. Phaser 4 and Three.js games implement `probes`/`state`; fixed timestep is in the SDK loop wrapper.
- **aiur:** L0–L3 are deterministic CI jobs. aiur agents start only for repairs or for reviews that need judgment (§3.2). The implementing agent's skill (S01/S10) must run L1 locally before declaring done.
- **Railway:** a test-runner service built on the Playwright image, isolated from the live game hosting (A-infra), with CPU-only WebGL.
- **Privacy:** bundles go to private storage; the issue gets metadata only; Chrome DevTools MCP telemetry and CrUX are off.

## 10. Recommended next steps

1. Add the hook interface, fixed-timestep rule, and seeded-RNG rule to the A4 SDK spec as **required**.
2. Run the determinism and bot spikes (§7.1–7.2) on one platformer before writing more QA code.
3. Build one genre demo kit (platformer) to test both variants-as-presets and the waiting activity.
4. Draft the bug-bundle schema together with A5 (shared `state()`).
5. Schedule the perf calibration and the R18 family sessions.

## 11. Decisions for Kevin

1. **Repair budget and retries:** accept the default of 2 automatic attempts at about 1/3 of a feature budget, then escalate to you?
2. **Bug-bundle data:** may screenshots and transcripts of the kids' play go to the LLM provider for repair? How long are they retained?
3. **iPad Home Screen install:** make "Add to Home Screen" a parent-assisted first-run step (it enables push), or rely on email or badges only?
4. **Narrowing cap:** start with at most 2–3 picture questions plus a plan card, and adjust after the family tests?
5. **Draft playability:** may kids play drafts that passed smoke tests but have unresolved robot findings (the tolerable-chaos zone)?
6. **Performance targets:** approve a calibration session on your actual iPads and desktops before any FPS or latency targets are set?
7. **Clear Check:** require the creator (or a parent) to beat a new level or game before it is shared with others, as Mario Maker does?

**Unverified items:** `performance.now` under the Playwright clock; Railway GPU availability; the image-token formula; Minecraft Education onboarding (not researched); the full findings of the ScratchJr 2013 paper; all wall-clock and CPU estimates.
