# OGM-091 plan — Skill pack scaffold, gm-core and gm new

## 1. Problem frame

Coding agents inside a creator's repo need a short operating manual (`gm-core`), a way to build with no network (`gm-build`) and a committed skill layout that both Codex and Claude discover without aiur's help. Nothing of that exists: the six skills in `.claude/skills` are written for Claude working with Kevin on this machine, aiur links only its own bundle for Codex, and there is no `gm` binary. This ticket writes the two skills, the layout contract, and the two commands that create and refresh it.

Requirements trace: R100 → the pack ships inside each game repo with the three install paths and `skills.lock`; R101 → `gm-core` is the router with tier order, cheat sheet, done rule, show-as-you-go, anti-sameness rules, taxonomy; R104 → `gm new` scaffolds boot, hooks, input map, grey-box level and the pack (cards themselves are OGM-094).

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur/agent_skills.ex` (lines 116–200): install per skill atomically (write to a temp dir, rename), never clobber an existing path, link `.codex/skills/<name>` → `../../.claude/skills/<name>`; mirror this in TypeScript.
- `/home/orangekid/github/aiur/.claude/skills/aiur-agent/SKILL.md`: the "When to use what" router table shape (one row per reference, load only what the step needs).
- `/home/orangekid/github/aiur/.claude/skills/compound-engineering.{skills,version,LICENSE}`: the manifest + version + licence trio for a vendored set; `skills.lock` generalises it.
- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-design-loop/SKILL.md`: steps 2–5 are the loop `gm-core` keeps (assets first, options before the final build, build, verify by looking); step 4's "Show as you go" becomes the `gm chat post` rule.
- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-assets/SKILL.md` line 8: the tier order sentence, rewritten against `gm assets`.
- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-asset-variants/SKILL.md` "Hard rules": clone, never edit originals; one line in `gm-core`.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B15-open-source-games/reference-builds-and-homogenization.md` §6 item 4: the three rules, about 300 tokens.
- OGM-060's `packages/gm-cli/src/commands/assets/search.ts`: command module shape.

## 3. Implementation units

### U1 gm-core

Goal: the router every build loads first, ≤120 lines.
Files: Create `skills/gm-core/SKILL.md`; Test `packages/gm-cli/test/gm-core.test.ts`.
Approach: front matter `name: gm-core`, `description:` ("Load first in every Game Maker build…"). Sections in order: (1) The job: `gm scope` is the WHAT; cards and templates are HOW (B15 rule 1). (2) Before coding: a 5-line plan and "defaults I'd reach for", each dropped or justified against the scope (rule 2); no mechanic the scope doesn't list, suggest it in the chat instead (rule 3). (3) Assets: installed packs → mirrors (`--tier 2`) → variants (`gm assets register --from`) → made from scratch, and say so; one style family per game; lineups (`gm assets sheet`) before picking; clone, never edit an original. (4) Loop: options before a big visible decision (`gm checkpoint`, ≤3 per creation build), build, `gm run`, then one `gm chat post` with the still or clip after every `gm run`. (5) Done = `gm check`, `gm test`, `gm run` green and the PR's binary checklist answered from the sheet. (6) Activities: the nine names and `gm progress`-free markers: `gm events mark <activity> start|end` is not in V1; write `<!-- gm-activity: gameplay_code start -->` lines in the Agent Workpad instead (OGM-014 ingests from the gm CLI; skill markers are text). (7) Cheat sheet: one line per command (`gm assets search|facets|info|sheet|use|register|list|why`, `gm maps search`, `gm build assets`, `gm check`, `gm test`, `gm run`, `gm shot`, `gm perf`, `gm docs pattern`, `gm chat post`, `gm checkpoint open|wait`, `gm changes`). (8) Load when…: a table routing to `gm-build`, `gm-verify`, `gm-genre-*`, `gm-input`, `gm-ui-hud`, `gm-audio`, `gm-multiplayer-ready`, `gm-scope-options`, `gm-editor-tuning`, `gm-repair`, and `vendor/phaser`, `vendor/threejs`, `vendor/gamedev`. No Kevin, no `assets-local/`, no Python paths, no artifact pages.
Test scenarios: Given the file when counted then ≤120 lines; Given the router table when compared with `ls skills/` then every `gm-*` directory present at test time has a row; Given the text when grepped then it contains none of `assets-local`, `scripts/assets`, `meta-improve`, `claude.ai`.
Execution note: write the test first with the directory listing so adding a skill without a row fails CI.

### U2 gm-build

Goal: offline install and build rules.
Files: Create `skills/gm-build/SKILL.md` (≤60 lines).
Approach: `pnpm install --offline --frozen-lockfile` (store seeded by OGM-038); `pnpm build` then `gm build assets --tier mobile,desktop`; never `npm install`/`pnpm add` in a sandbox: raise an aiur question naming the package, version and why (approval `on-request`, E03-15); where `dist/` and `assets/manifest.json` land; what a store miss looks like (`ERR_PNPM_NO_OFFLINE_META`) and the one fix (ask). Points at OGM-038's `docs/ops/sandbox.md` for the operator side.
Test scenarios: Given the file then ≤60 lines and contains `--offline`.

### U3 Pack locator and SkillsLock

Goal: one module finds the pack and writes/reads the lock.
Files: Create `packages/gm-cli/src/skills/pack.ts`, `packages/gm-cli/src/skills/lock.ts`; Test `packages/gm-cli/test/skills-lock.test.ts`.
Approach: `locatePack()` returns the first existing of `process.env.GM_SKILLS_DIR`, `new URL('../../../../skills', import.meta.url)`, `skills.lock`'s recorded `packDir`; `listPack(dir)` returns every `gm-*` directory plus `vendor/`; `hashTree(dir)` sha256 per file; `readVendorLock(dir)` parses `skills/vendor/skills.lock` (OGM-092; tolerate absence with `vendored: {}`).
Interface sketch: see the ticket's `SkillsLock`; `writeLock(repo, lock)`, `readLock(repo)`, `diffLock(repo, pack): { added, changed, localEdits }`.
Test scenarios: Given a fixture pack with two skills when hashed then the lock lists each file; Given a locally edited file when diffed then it appears in `localEdits`.

### U4 Install and link

Goal: write `.claude/skills`, `.codex/skills`, `.agents/skills` atomically.
Files: Create `packages/gm-cli/src/skills/install.ts`; Test `packages/gm-cli/test/skills-install.test.ts`.
Approach: for each skill: copy to `.claude/skills/.gm-tmp-<name>` then `renameSync` into place; `symlinkSync('../../.claude/skills/<name>', '.codex/skills/<name>')` and the same for `.agents/skills/<name>`; on `EPERM`/`EXDEV` copy instead and set `linkMode: 'copy'`; vendored sets go under `.claude/skills/vendor/<set>/` with the same links per skill directory. Never remove a path it did not create (compare against the lock).
Test scenarios: Given an empty repo when installed then `readlinkSync('.codex/skills/gm-core')` equals `../../.claude/skills/gm-core`; Given an existing `.claude/skills/gm-core` with a local edit when installed without `--force` then it is kept and reported; Given a crash mid-copy (simulated by a thrown error in the copy callback) then no half-installed skill directory remains.

### U5 gm new

Goal: scaffold a game repo.
Files: Create `packages/gm-cli/src/commands/new/index.ts`, `packages/gm-cli/src/commands/new/agents-md.ts`; Test `packages/gm-cli/test/new.test.ts` with `packages/gm-cli/fixtures/template-min/` (3 files: `package.json`, `src/main.ts`, `index.html`).
Approach: `gm new <game-2d|game-3d|game-multiplayer> <dir> [--family id] [--pov id] [--name title]`: refuse a non-empty dir (exit 2); copy `templates/<template>` (OGM-023/024/055; the fixture in tests); U4 install; write `skills.lock`; write `AGENTS.md` from the template string (first line `Load .claude/skills/gm-core/SKILL.md first.`, then the done rule and the commands, ≤25 lines); write `gm.lock.json` `{ v: 1, template, family, pov, createdAt, gmVersion }` (R20 records the creation choices; `assets.lock.json` is OGM-062's and is not written here); validate `--family` against `style-families.json` when OGM-066's file is present, else accept any id with a warning. Output one line: the path and the next command (`pnpm install --offline`).
Interface sketch: `gm new game-2d ./my-game --family kenney-pixel --pov side`.
Test scenarios: Given the fixture template when scaffolded then the tree matches a snapshot (links, lock, AGENTS.md); Given a non-empty dir then exit 2 with the one-line cause; Given `--family x` with no families file then a warning and the lockfile records `x`.

### U6 gm skills sync and list

Goal: refresh an existing repo's pack.
Files: Create `packages/gm-cli/src/commands/skills/{index,sync,list}.ts`; Test `packages/gm-cli/test/skills-sync.test.ts`.
Approach: `sync` = U3 diff + U4 install of `added`/`changed`, keep `localEdits` unless `--force`, rewrite the lock, print one line per action; `--check` prints the diff and exits 1 on any drift, 0 otherwise (the `after_create` hook in OGM-036 calls `gm skills sync`; CI in game repos may call `--check`). `list` prints the installed skills with versions from the lock.
Test scenarios: Given a repo at pack v1 when the pack gains `gm-x` then sync adds it and the lock grows; Given no change then sync prints `up to date` and writes nothing (mtime unchanged); Given `--check` with drift then exit 1.

### U7 Codex discovery dry run

Goal: answer E10-6's open question with one transcript.
Files: none committed beyond the PR text.
Approach: `gm new game-2d /tmp/g`; `cd /tmp/g && codex exec --sandbox read-only "List the skills available to you by name and path"`; paste the first 20 lines. If `gm-core` is absent, also try after appending the `AGENTS.md` pointer with the full relative path, and record which worked for OGM-036.

## 4. Verification

```
pnpm --filter @ogm/gm-cli test
pnpm -r typecheck && pnpm -r lint
wc -l skills/gm-core/SKILL.md skills/gm-build/SKILL.md
node packages/gm-cli/dist/gm.js new game-2d /tmp/g --family kenney-pixel --pov side && ls -la /tmp/g/.codex/skills /tmp/g/.agents/skills && cat /tmp/g/skills.lock | head -20
node packages/gm-cli/dist/gm.js skills sync --check   # in /tmp/g → "up to date", exit 0
grep -rl 'sprite-forge\|landing-page' /tmp/g/.claude/skills || echo "no operator skills leaked"
```
Evidence to paste: the `ls -la` of the link dirs, the lock head, the line counts, the Codex dry-run transcript head.

## 5. Deferred to implementation

- How `gm` reaches a sandbox (global install from the seeded store vs a template devDependency): OGM-038's; default here is "the pack is located from the CLI package", nothing else assumed.
- Whether `gm new` runs `pnpm install --offline` itself: default no (prints the command), so tests need no store.
- `AGENTS.md` length: default ≤25 lines; the rest lives in `gm-core`.
- Activity markers: default the Workpad comment form above; if OGM-014 ships a `gm events` command first, `gm-core` names it instead (one-line change).
- `gm.lock.json` name: default as above; if OGM-062 already defines a creation-choices file, use its name.

## 6. Scope boundaries

- `skills/vendor/*`, `skills/vendor/skills.lock`, the checker: OGM-092.
- `skills/gm-verify`: OGM-093. `skills/gm-genre-platformer` and `gm docs pattern`: OGM-094. Five wave-2 skills: OGM-095. `skills/gm-repair`: OGM-096. `skills/gm-multiplayer-ready`: OGM-055.
- Template contents: OGM-023/024/055. `.aiur/*`, labels, `ci.yml`, hook body: OGM-036. Offline store: OGM-038.

## 7. Risks

- Codex may not discover repo-shipped `.codex/skills` links (E10-6, [I]): default U7 records the answer; fallback is the `AGENTS.md` pointer and OGM-036's hook.
- Templates land after this ticket (suggested-after only): default fixture template in tests; wiring is a one-line path change.
- Pack drift between the platform repo and game repos: `skills.lock` sha256 per file plus `gm skills sync --check` make drift visible; refresh is OGM-036's hook.
- Local edits in a game repo's skills (an agent "improving" `gm-core`): kept and reported, never silently overwritten; the eval (OGM-097) runs on the platform copy.
