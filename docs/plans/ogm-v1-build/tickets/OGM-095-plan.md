# OGM-095 plan — Skill wave 2: gm-input, gm-ui-hud, gm-audio, gm-scope-options, gm-editor-tuning

## 1. Problem frame

After `gm-core`, `gm-verify` and the platformer skill, a worker still has no guidance for input, HUD, audio, scoping and tunables, which are where generated games most often diverge from the SDK's rules (host-owned gamepad and touch, iOS audio unlock, hand-tuned constants the editor cannot reach). B14 fixed the sources and verdicts; the SDK surfaces these skills describe are merged by phase 8. This ticket writes five short skills, each with a test that pins its named commands and exports to reality, as five PRs under one issue.

Requirements trace: R100 → `gm-input`, `gm-ui-hud`, `gm-audio`, `gm-scope-options`, `gm-editor-tuning` exist in the pack shipped to game repos.

Repository conventions (state in each PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>` on the last PR, `Part of #<issue>` on the first four; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- OGM-094's `skills/gm-genre-platformer/{SKILL.md,package.json,tsconfig.json}` and `references/cards/*.md`: the skill directory shape, the ≤60/80-line discipline, the card format.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B14-skills/web-engines.md` "gm-* workflow layer" rows `gm-ui-hud`, `gm-input`, `gm-editor-tuning`, `gm-scope-options`, `gm-audio`: what to borrow, in our words.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B14-skills/pipeline-and-design.md` §4.2 rows `input-systems`, `game-ui-ux`, `audio-design`, `prototype-fast`, `game-jam`: the highlights to keep (actions over keys, edge vs held, deadzones, rebinding; anchors, safe areas, gamepad focus, event-driven HUD; buses, slider-to-dB, ducking, SFX variation; one question, keep/kill criteria).
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/sound.js` lines 163–187: the unlock-on-`pointerup`/`touchend` and `audioSession` rules, as prose.
- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-design-loop/SKILL.md` step 3: "2-5 quick variations and recommend one; one step at a time" → `gm-scope-options`.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T04-engine-sdk.md` §4: the exact names (`ActionFrame`, `ActionValue`, `CameraRig.inputMapping`, `MultiplayerHooks.hud`, `@gm/sdk/audio` `unlock`, `play`, `music`, `zzfx`, `song`, `renderCue`) the skills must use; refresh against `packages/sdk` exports at pickup.

## 3. Implementation units

### U1 Shared skill lint (first PR, with gm-input)

Goal: a reusable test helper that checks a SKILL.md's named commands and SDK identifiers exist.
Files: Create `packages/gm-cli/src/skills/lint.ts`, `packages/gm-cli/test/skills-lint.test.ts`.
Approach: `extractCommands(md)` finds backticked strings starting with `gm ` and returns `['gm run', 'gm checkpoint open', …]` (first two words, or three when the second is `assets|packs|maps|docs|checkpoint|chat|skills|check`); `extractSdkNames(md)` finds backticked identifiers in the form `sdk.audio.play`, `ActionFrame`, `unlock()` adjacent to `@gm/sdk` mentions, returning dotted paths; `checkSkill(path, { commands: Set<string>, sdkExports: Record<string, unknown> })` returns misses. The registry of commands comes from the CLI's scanner (`listCommands()` from OGM-060); SDK exports from `import * as sdk from '@gm/sdk'` plus subpath modules (`@gm/sdk/audio`, `@gm/sdk/input`, `@gm/sdk/camera`).
Test scenarios: Given a fixture skill naming `gm nope` then one miss; Given `sdk.audio.playy` then one miss; Given real names then none.

### U2 gm-input

Goal: `skills/gm-input/` (PR 1).
Files: Create `skills/gm-input/SKILL.md` (≤80), `skills/gm-input/skill.test.ts`, `skills/gm-input/references/cards/action-map.md` (+ `.test.ts`), `package.json`, `tsconfig.json`.
Approach: sections: declare actions in the manifest (names, kinds `button|axis|vector`), read only `ActionFrame` (never `keydown` for gameplay; `input.rawKey` is for host hotkeys), edge vs held (card shows a `pressed/justPressed` helper), deadzone and clamping for `{x,y}` values, buffering points at `gm docs pattern jump`, host owns gamepad and the touch overlay (never add touch buttons in the game; declare actions and the host draws 64 px targets), per-player `playerIndex`, rebinding is the host's settings, test with `gm test --inputs` scripts. Card: `action-map.md` with `tunables: deadzone [0.15, 0.30], repeatDelayMs [150, 300]` and a 3-line test (`inject({ move: {x: 0.1, y: 0} })` → below deadzone reads 0).
Test scenarios: `skill.test.ts` = U1 over the file plus ≤80 lines; the card test.

### U3 gm-ui-hud

Goal: `skills/gm-ui-hud/` (PR 2).
Files: Create `skills/gm-ui-hud/SKILL.md`, `skill.test.ts`, package files.
Approach: the host's platform HUD (pause, saves, achievements, settings) is not yours; the game HUD is DOM-over-canvas or in-engine text, per player from `MultiplayerHooks.hud(playerIndex)` and never containing private fields; read `viewport.safe` insets; scale from a reference resolution; ≤25% coverage with the centre clear; 16 px minimum at phone DPR, 64/44 px targets if the game draws any button; the five-state inventory and one still per state (`gm run --frames` after `--inputs` reaches each state); readable contrast (advisory); reduced motion respected for HUD animation; no `landing-page-design`-style styling.
Test scenarios: U1 over the file; ≤80 lines.

### U4 gm-audio

Goal: `skills/gm-audio/` (PR 3).
Files: Create `skills/gm-audio/SKILL.md`, `skill.test.ts`, `references/zzfx-presets.md`, package files.
Approach: use the SDK context only (never `new AudioContext`); `unlock()` on first `pointerup`/`touchend`; buses and sensible defaults (music −12 dB under sfx); one-shots with pitch variation ±5% for repeats; samples from packs via `gm assets search --kind audio` and `gm assets use` (MP3 at build); ZzFX for UI/impact/pickup with the presets reference (6–10 named parameter arrays, in our words, MIT ZzFX attribution); music: Tone 15 `getTransport()` and `song.json` through `song()`, or a looped MP3 via `music(id, { fade })`; ducking the voice bus; `renderCue(id)` peak < −1 dBFS and the levels spread; iOS: expect `audio.relay`; always list `sound` under `unchecked`.
Test scenarios: U1 over the file; the presets file parses as a fenced JSON block of arrays.

### U5 gm-scope-options

Goal: `skills/gm-scope-options/` (PR 4).
Files: Create `skills/gm-scope-options/SKILL.md`, `skill.test.ts`, package files.
Approach: read `gm.lock.json` (genre, vibe, family, world, players, pov) and the job's scope; the user's words set the bar; a narrow edit stays narrow; when the brief is vague (no mechanic named, or fewer than N nouns), offer three clearly different takes as one `gm checkpoint open --option a=… --option b=… --option c=… --recommend` with one line each, non-blocking unless the build depends on it (≤3 checkpoints per creation build, D-BUILD-CHAT); ask only when a choice materially changes the result; write the agreed scope as the acceptance list (`## Acceptance` in the ticket workpad) with observable keep/kill criteria; "defaults I'd reach for" pass from `gm-core`.
Test scenarios: U1 over the file; ≤80 lines.

### U6 gm-editor-tuning

Goal: `skills/gm-editor-tuning/` (PR 5, closes the issue).
Files: Create `skills/gm-editor-tuning/SKILL.md`, `skill.test.ts`, `references/tune-by-outcome.md`, package files.
Approach: every gameplay constant lives in `src/tunables.ts` as exported data; declare each in `manifest.controls` (`ControlDecl`: id, label, kind, range, step, scope label) with the range from the card that introduced it; `applyDesign(next)` reads tunables from the design doc so the editor's changes apply live without a rebuild (`'live'` result) and only structural changes return `'restart-scene'`; the "tune by outcome" table (feel word → knob and direction, e.g. "floaty" → apexSeconds up, "snappy" → jumpBufferMs down); keep card example values out (M5); no lil-gui or debug panels in production builds (test builds only, gated like the hooks).
Test scenarios: U1 over the file; the reference table has ≥8 rows.

### U7 Router rows

Goal: `gm-core` routes to each skill.
Files: Modify `skills/gm-core/SKILL.md` (one row per PR).
Approach: append the row in the "Load when…" table; OGM-091's gm-core test enforces presence; keep the file ≤120 lines (trim elsewhere only if needed, and say so).
Test scenarios: OGM-091's test passes after each PR.

## 4. Verification

```
pnpm -r test            # five skill tests, OGM-094's card-format test, OGM-091's gm-core test
pnpm -r typecheck && pnpm -r lint
for s in input ui-hud audio scope-options editor-tuning; do wc -l skills/gm-$s/SKILL.md; done
node packages/gm-cli/dist/gm.js new game-2d /tmp/g && node packages/gm-cli/dist/gm.js skills list   # in /tmp/g: five new names
```
Evidence to paste (per PR): the skill test output, the line count, and one deliberate break (rename an identifier in a scratch copy, show the test failing).

## 5. Deferred to implementation

- Exact SDK identifier spellings: refresh from `packages/sdk/src/index.ts` and subpaths at pickup; the lint test enforces them.
- Whether `gm-input` and `gm-ui-hud` get cards beyond `action-map`: default one card for input, none for HUD.
- The vague-brief heuristic in `gm-scope-options`: default "no mechanic named or under three concrete nouns".
- ZzFX attribution wording: default a one-line MIT credit in the presets reference.

## 6. Scope boundaries

- SDK input/camera/audio code: OGM-025/027. Host HUD, overlay, editor framework: OGM-028/075. Scope ticket: OGM-088. Checkpoints: OGM-081/082. Multiplayer skill: OGM-055. Repair: OGM-096. Cards format and `gm docs pattern`: OGM-094.

## 7. Risks

- SDK surface still moving when the first PR lands: the lint test catches drift; default order of PRs is input → ui-hud → audio → scope-options → editor-tuning so the most SDK-bound land first while OGM-025/027 are fresh.
- Skills growing past 80 lines: hard cap in the test; overflow goes to `references/`.
- Overlap with `gm-core`'s rules (options before build): `gm-core` keeps the one-line rule and points here for the method.
