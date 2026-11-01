# OGM-101 plan — Archive the prototypes

## 1. Problem frame

Once `apps/web` deploys, the three prototypes are history: their write-ups and proven contracts live on in the pack, the title town lives on as a built asset the web app serves, and nothing else should be ported again. This ticket moves the town's sources under the web app with history intact, marks the two UI prototypes archived, points readers at the successors, and retires the old deploy script so no one deploys the studio by mistake.

Requirements trace: R124 → the prototypes are frozen; `studio-v0` and `ui-v0` are archived after `apps/web` deploys; `title-city` moves under the web app as a built asset.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback (the title e2e from OGM-070 uses them); every service binds `127.0.0.1`; secrets only from `packages/config` names (none here); no new dependency below 1k GitHub stars (none added); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/README.md` lines 1–5: the "(throwaway)" header plus a link to the write-up; the archived banner extends it.
- `/home/orangekid/games/open-game-maker-2000/prototypes/title-city/tools/build.sh` line 5 (`ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"`): the depth from `apps/web/title-town/tools` to the repo root is the same three levels, so `ROOT` is unchanged and only `HERE` moves.
- `/home/orangekid/games/open-game-maker-2000/prototypes/title-city/tools/bundle.mjs` line 7: the `createRequire` root to repoint at `apps/web`.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/deploy.sh`: what the new deploy script (OGM-070) reproduces; this ticket only retires it.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T12-repo-code-map.md` §4 "Proposed tree": the destination paths (`apps/web/title-town/ ← prototypes/title-city/{city,rampage,earthbound,fx}.js, fx-variants/, tools/{bake,bundle,variants,poster}.mjs`).

## 3. Implementation units

### U1 Move the town sources with history

Goal: `apps/web/title-town/` exists with the prototype's git history.
Files: Move `prototypes/title-city/**` → `apps/web/title-town/**` (git mv); Modify `apps/web/title-town/tools/build.sh` (`HERE="$ROOT/apps/web/title-town"`; three.js source line: keep `prototypes/studio-v0/demo/vendor/three` until OGM-070's pin exists, then `node_modules/three` under `apps/web`, decide at pickup), `apps/web/title-town/index.html` (comment paths only), `apps/web/title-town/tools/{bundle,bake,poster,variants,capture,taptest,loadtime,look,mix_sound}.mjs` (`createRequire(resolve(HERE, '../../') + '/')` → `apps/web/node_modules`).
Approach: one `git mv`; `sed` for the path strings; run `bash apps/web/title-town/tools/build.sh` (needs `assets-local/`, operator machine only) and `node apps/web/title-town/tools/bundle.mjs apps/web/public/town`; compare `sha256sum` of the new `city.bundle.js` with one built from the old path on the same machine before the move (do the old build first and keep the hash in the PR).
Test scenarios: Given the move then `git log --follow --oneline apps/web/title-town/city.js | wc -l` > 1; Given the bundle then the two hashes match; Given `git status --porcelain` then no `vendor/`, `models/` or `_pf.mjs` entries.
Execution note: build from the old path first (hash), then move, then build again (hash); paste both.

### U2 Ignore rules check

Goal: nothing licensed becomes trackable.
Files: possibly Modify `.gitignore` (one anchored line each for `/apps/web/title-town/vendor/` and `/apps/web/title-town/models/`, only if the rewritten root file no longer matches).
Approach: `git check-ignore -v apps/web/title-town/vendor/x apps/web/title-town/models/x apps/web/public/town/x`; if any is not ignored, add the anchored lines and name the edit in the PR (OGM-001 owns the file; conflict accepted for two lines).
Test scenarios: Given the three paths then `git check-ignore` reports each as ignored.

### U3 prototypes/README.md and the archived banners

Goal: readers land on the successor.
Files: Create `prototypes/README.md`; Modify `prototypes/studio-v0/README.md`, `prototypes/ui-v0/README.md` (prepend two lines).
Approach: README sections: `ui-v0` (home → editor → play loop; write-up `docs/research/v0.5/C1-ui-prototype-learnings.md`; replaced by `apps/web` routes and `packages/sdk` hooks), `studio-v0` (the studio loop, dark glass tokens kept as `apps/web/src/tokens.css`, title host as the React title route, deploy by `apps/web/tools/deploy.sh`), `title-city` (moved to `apps/web/title-town`, built into `apps/web/public/town/` by its `tools/build.sh` + `bundle.mjs`), capture tools (replaced by `@ogm/gm-verify`: `gm run`, `gm shot`, `gm perf`), and the rule: frozen; do not port; read the write-ups. Banners: `**Archived (OGM-101).** Replaced by `apps/web`; kept for history and the write-up below.`
Test scenarios: Given the README then every path it names exists (`for p in $(grep -o '`[a-z./-]*`' prototypes/README.md | tr -d '`'); do test -e "$p" || echo "missing $p"; done` prints nothing).

### U4 Retire the studio deploy script and mark the build script

Goal: no accidental studio deploy.
Files: Modify `prototypes/studio-v0/tools/deploy.sh` (body → two lines: message to stderr, `exit 1`), `prototypes/studio-v0/tools/build.sh` (first comment line: archived; the town builds from `apps/web/title-town`).
Test scenarios: Given `bash prototypes/studio-v0/tools/deploy.sh` then exit 1 and the message; Given `grep -c netlify prototypes/studio-v0/tools/deploy.sh` then 0.

### U5 Header lines on superseded tools

Goal: nobody re-ports `capture.mjs`.
Files: Modify `apps/web/title-town/tools/{capture,taptest,loadtime,look,mix_sound,poster}.mjs`, `clips_page.py` (one comment line after the shebang: `// superseded by gm run / gm shot / gm perf (OGM-090); kept for the town only`).
Test scenarios: Given `grep -L 'superseded by gm run' apps/web/title-town/tools/{capture,taptest,loadtime,look,mix_sound,poster}.mjs` then empty.

### U6 Web app still builds and the title still reveals

Goal: no regression in the live title.
Files: none.
Approach: `pnpm --filter @ogm/web build`; run OGM-070/071's Playwright title test (poster → `'town-ready'` → fade) against the built app with the freshly built `public/town/`; attach the three stills the test writes.
Test scenarios: Given the build then the title test passes and `public/town/city.bundle.js` is served (`curl -sI http://127.0.0.1:<port>/town/city.bundle.js` 200).

## 4. Verification

```
# before the move (old path), on this machine:
bash prototypes/title-city/tools/build.sh && node prototypes/title-city/tools/bundle.mjs prototypes/title-city && sha256sum prototypes/title-city/city.bundle.js
git mv prototypes/title-city apps/web/title-town
# after edits:
bash apps/web/title-town/tools/build.sh && node apps/web/title-town/tools/bundle.mjs apps/web/public/town && sha256sum apps/web/public/town/city.bundle.js
git log --follow --oneline apps/web/title-town/city.js | tail -1
git check-ignore -v apps/web/title-town/vendor/x apps/web/title-town/models/x apps/web/public/town/x
git status --porcelain | grep -c '_pf.mjs\|title-town/vendor\|title-town/models'    # 0
bash prototypes/studio-v0/tools/deploy.sh; echo exit=$?                              # 1
pnpm --filter @ogm/web build && pnpm --filter @ogm/web test:e2e -- --grep title
```
Evidence to paste: both bundle hashes (equal), the first-commit line from `git log --follow`, the `check-ignore` lines, the `0`, the `exit=1`, the title e2e summary.

## 5. Deferred to implementation

- three.js source for the town build after OGM-070 pins three in `apps/web`: default keep the vendored r170 copy path from the studio (the town is written against r170, E04-19) until someone upgrades the town; do not upgrade here.
- Whether `clips_page.py`, `ness_sprite.py`, `ufo_sprite.py`, `sounds.sh` move with the directory: default yes (one `git mv`), with the superseded header where it applies.
- Banner wording: default as in U3.

## 6. Scope boundaries

- Title route, sound and tap relay, `public/town/` copy convention: OGM-071. Deploy script and `_headers`: OGM-070. Capture tool replacements: OGM-090. `.gitignore` ownership: OGM-001 (two anchored lines accepted here if needed).

## 7. Risks

- Bundle hash differs after the move (path-dependent output from esbuild): compare with `--sourcemap=false` and `minify` as in `bundle.mjs`; if the only difference is a path string in a comment, record it and accept.
- `assets-local/` absent on a worker: the build script is operator-only; the agent that cannot run it says so in `## Local tests` and the Executor runs U1's hash comparison on this machine before merge.
- Breaking the live title between this merge and the next deploy: nothing deploys automatically (R114); the next `apps/web/tools/deploy.sh` run rebuilds the town from the new path.
