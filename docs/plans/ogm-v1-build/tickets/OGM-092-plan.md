# OGM-092 plan — Vendored engine reference layer and API-name checker

## 1. Problem frame

Workers need correct engine API facts for Phaser 4.2 and three.js r186 without reading library source, and the research found three sets worth vendoring at pinned commits. Nothing is vendored and the name checker that proved them is lost. This ticket copies the sets with their licences, rewrites the awesome-gamedev code blocks to TypeScript, pins the commits, and rebuilds the checker as a tested script that CI runs.

Requirements trace: R100 → "a vendored engine reference layer (Phaser official, CloudAI three.js minus R3F, awesome-gamedev adaptations) pinned in `skills.lock` with an API-name checker".

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (three 100k+, phaser 40k, tsx 12k, vitest 14k); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/.claude/skills/compound-engineering.skills` + `.version` + `.LICENSE`: one manifest, one version, one licence file per vendored set; `skills/vendor/skills.lock` holds the versions for all three.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B14-skills/web-engines.md` "API accuracy check method": the extraction rules (`new X(`, `import {..} from 'three...'`, `.method(`) and the benign-miss categories the allowlist encodes.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B14-skills/pipeline-and-design.md` §4.2 table: which awesome-gamedev skills to take and what each becomes.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B14-skill-sourcing.md` §3 (licence table), §4 (exclusions), §5 (packaging rules: front matter `license:` and `source:` the PixiJS way).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs`: the shape of a small Node validator with fixtures and negatives (the checker's test layout copies it).

## 3. Implementation units

### U1 Workspace package for skill tooling

Goal: `@ogm/tools-skills` exists and CI runs its tests.
Files: Create `tools/skills/package.json`, `tools/skills/tsconfig.json`; Modify `pnpm-workspace.yaml` (append `- "tools/*"`).
Approach: `package.json` scripts `test: vitest run`, `typecheck: tsc -p .`, `lint: eslint .`, `check-api-names: tsx check-api-names.ts ../../skills/vendor`; devDependencies `three@0.186.1`, `phaser@4.2.1`, `tsx`, `vitest`, `typescript` (versions as pinned by OGM-001 where they exist). The root CI from OGM-001 runs `pnpm -r test`, so no workflow edit.
Test scenarios: Given `pnpm install` then `pnpm --filter @ogm/tools-skills test` runs (an empty-suite smoke).
Execution note: this is the one root-file edit; keep the diff to one line and say so in the PR.

### U2 Vendor Phaser official skills

Goal: 28 skills under `skills/vendor/phaser/` at a pinned commit.
Files: Create `skills/vendor/phaser/<skill>/SKILL.md` ×28, `skills/vendor/phaser/LICENSE.md`, `skills/vendor/phaser/README.md`.
Approach: `git clone --depth 1 https://github.com/phaserjs/phaser /tmp/phaser` (platform-build agents have network); record `git -C /tmp/phaser log -1 --format=%H -- skills/` as the pin; copy `skills/*` verbatim; prepend front matter `license: MIT`, `source: phaserjs/phaser@<sha> skills/<name>/SKILL.md`, `modified: false`; copy `LICENSE.md`. Do not copy `phaserjs/phaser-game-agent` (paid MCP). Add a 5-line `README.md` noting the JS-only snippets and that types come from `phaser` 4.2.
Test scenarios: Given the directory then 28 `SKILL.md` files with the three keys; Given the checker then ≤12 misses, all in `allowlist.json`.

### U3 Vendor CloudAI-X threejs-skills minus R3F

Goal: 12 skills under `skills/vendor/threejs/` at `0e18186`.
Files: Create `skills/vendor/threejs/<skill>/SKILL.md` ×12, `skills/vendor/threejs/LICENSE`, `skills/vendor/threejs/README.md`.
Approach: clone at the pinned commit (`git fetch --depth 1 origin 0e18186` then checkout); copy all skills except `threejs-react-three-fiber` and `threejs-asset-pipeline` (needs gltf-transform CLI; name it in the README as "operator-side, see OGM-063"); front matter `license: MIT`, `source: CloudAI-X/threejs-skills@0e18186… <path>`, `modified: false`; copy `LICENSE`.
Test scenarios: Given the directory then 11 or 12 files (state which) and 0 checker misses against `node_modules/three`.

### U4 Adapt awesome-gamedev skills to TypeScript

Goal: 17 skills under `skills/vendor/gamedev/` with every code block in TypeScript against our engines.
Files: Create `skills/vendor/gamedev/<skill>/SKILL.md` and `references/*.md` where the source has them, `skills/vendor/gamedev/{LICENSE,NOTICE,CHANGES.md,README.md}`.
Approach: clone at `184b72b`; take the list in the ticket's Scope; for each file keep the prose and section order (When to use / When not / Core workflow / Patterns / Pitfalls / Related), rewrite every GDScript/C#/Python block as a TypeScript block that compiles conceptually against Phaser 4.2 or three r186 (role names only, no theme); in `threejs-scene-setup` replace the jsDelivr import map with `import * as THREE from 'three'` and a Vite note; drop any "Watch real players" step in favour of "run `gm run` and read the sheet" (one line); front matter `license: Apache-2.0`, `source: gamedev-skills/awesome-gamedev-agent-skills@184b72b… <path>`, `modified: true`; `CHANGES.md` lists each file and the change ("code blocks rewritten to TypeScript; import map removed"); keep `NOTICE`.
Test scenarios: Given the tree then no fenced block has language `gdscript`, `csharp` or `python` (a test greps fences); Given the checker over the three.js and Phaser skills then 0 misses apart from allowlisted user callbacks.
Execution note: budget ~2 hours; prioritise `platformer` (+`feel-tuning`), `input-systems`, `game-ui-ux`, `audio-design`, `camera-systems`, `game-feel`, `prototype-fast`, which OGM-094/095 cite; the rest may follow in the same PR or a second PR under this ticket.

### U5 skills.lock and README

Goal: the pins in one file.
Files: Create `skills/vendor/skills.lock`, `skills/vendor/README.md`.
Approach: JSON `{ "v": 1, "vendoredAt": "<date>", "sets": { "phaserjs/phaser": { "sha": "<40>", "license": "MIT", "path": "phaser" }, "CloudAI-X/threejs-skills": { "sha": "0e18186…", "license": "MIT", "path": "threejs" }, "gamedev-skills/awesome-gamedev-agent-skills": { "sha": "184b72b…", "license": "Apache-2.0", "path": "gamedev", "modified": true } } }`. OGM-091 copies `sets.*.sha` into each game repo's `skills.lock.vendored`. README: what, pins, refresh procedure (new PR, re-run checker, update lock).
Test scenarios: Given the lock then every `sets.*.path` exists and every `sha` is 40 hex chars.

### U6 API-name checker

Goal: a tested script that proves the names exist.
Files: Create `tools/skills/check-api-names.ts`, `tools/skills/check-api-names.test.ts`, `tools/skills/allowlist.json`, `tools/skills/fixtures/{good-three.md,bad-three.md,good-phaser.md,bad-phaser.md}`.
Approach: parse fenced blocks (```` ```ts|js|typescript|javascript ````) with a 10-line state machine; regexes: `new\s+(?:THREE\.|Phaser\.[\w.]*)?([A-Z]\w*)\s*\(` → classes; `import\s*\{([^}]*)\}\s*from\s*['"]three` → classes; `\.([a-z]\w*)\s*\(` → methods; build the library name sets once per run by scanning `node_modules/three/src/**/*.js` and `node_modules/phaser/src/**/*.js` for `class (\w+)`, `export (?:function|const|class) (\w+)`, `(\w+)\s*[:=]\s*function`, `^\s+(\w+)\s*\(` (method definitions) — cache to `tools/skills/.cache/<lib>-<version>.json`; a miss is a name absent from the set and not in `allowlist.json` (`{ "three": [...], "phaser": ["setPipeline", "BitmapMask", "requestAnimationFrame", ...], "userCallbacks": true }` where identifiers defined in the same code block are ignored). Output one line per skill (`<skill> <lib> classes=N methods=M missing=K`) and the misses with `file:line`; exit 1 on any non-allowlisted miss; `--json`.
Interface sketch: `tsx check-api-names.ts <dir> [--lib three|phaser|auto] [--json] [--allowlist allowlist.json]`; `auto` picks by directory (`threejs` → three, `phaser` → phaser, `gamedev/threejs-*` → three, `gamedev/phaser-*` → phaser, others skipped).
Test scenarios: Given `good-three.md` (`new THREE.Mesh(...)`, `.setAnimationLoop(`) then 0 missing; Given `bad-three.md` (`new THREE.Clockk(`) then 1 missing class at the right line; Given `bad-phaser.md` (`this.add.spritee(`) then 1 missing method; Given a block that defines `function onHit()` and calls `.onHit(` then 0 missing (same-block identifiers ignored); Given an allowlisted name then 0 missing; Given the real vendored tree then the printed counts are within ±10% of B14's and exit 0.
Execution note: write the four fixtures and tests first; the regexes are tuned until the fixtures pass, then run on the tree.

## 4. Verification

```
pnpm install
pnpm --filter @ogm/tools-skills test
pnpm --filter @ogm/tools-skills check-api-names
pnpm -r typecheck && pnpm -r lint
find skills/vendor -type f -perm -u+x -o -name '*.sh' -o -name '*.py' -o -name '*.js' | wc -l   # must print 0
grep -rn 'jsdelivr\|unpkg\|cdn\.' skills/vendor --include=*.md | grep -v 'reference:' | wc -l    # must print 0
jq '.sets | keys' skills/vendor/skills.lock
```
Evidence to paste: the checker's per-set count lines, the two `wc -l` zeros, the lock keys, Vitest summary.

## 5. Deferred to implementation

- Drop `curves-and-paths`/`actions-and-utilities` from Phaser for token budget: default keep all 28.
- Keep `threejs-asset-pipeline`: default drop (CLI not in sandboxes); note for OGM-063.
- Which awesome-gamedev skills beyond the seven priority ones land in the first PR: default all 17 if time allows, else a second PR under the same issue (`Part of #<issue>` then `Closes #<issue>`).
- Cache location for the library name sets: default `tools/skills/.cache/` (gitignored by adding to `tools/skills/.gitignore`, not the root file).

## 6. Scope boundaries

- Installing vendored sets into game repos, `skills.lock` in game repos: OGM-091.
- All `gm-*` skills: OGM-091/093/094/095/096/055.
- Rapier/pmndrs postprocessing references: not in V1 (deferred findings).
- The eval harness that shares `tools/skills/`: OGM-097.

## 7. Risks

- Upstream moved or deleted (CloudAI rewrites often): pins are by SHA; if a SHA is gone, record it and vendor the nearest ancestor with a lock note.
- Apache compliance for modified files: `CHANGES.md` + `modified: true` front matter; a test enforces the key.
- The checker proves names, not signatures (B14 caveat): stated in `skills/vendor/README.md`; signature errors are caught by `gm check` typecheck in OGM-093.
- Token bulk (~78k for CloudAI alone): the sets load on demand through `gm-core`'s router (OGM-091); nothing here is always-loaded.
