# OGM-036 plan — Game-repo provisioning template

## 1. Problem frame

Every game is a repo in the creator's GitHub (A11) that an aiur daemon on this host builds in. `aiur init` would set a repo up by hand (E02-14); OGM must do it from code, deterministically, for every new game: the CI workflow and check name aiur's merge policy expects, the labels aiur routes on, a ruleset so nothing lands without `ci / required` and `ogm/boundary`, the `gm-*` skills with the Codex and `.agents` links aiur will not write for us (E02-9, E10-6), and the daemon's `.aiur/{config,hooks,prompt.md}`. The `after_create` hook is the one channel that gives a worker its job bundle (skills version, game context, repair diagnostics) without putting any of it in an issue body (E02-10, R65).

**Requirements trace**
- R62 → `renderRepoTemplate` produces labels, `ci.yml` with `ci / required`, `.claude/skills/gm-*`, `.codex/skills` and `.agents/skills` links, `AGENTS.md`, `skills.lock`; `renderDaemonFiles` produces `.aiur/hooks` and `.aiur/prompt.md`; `.aiur/config` comes from OGM-037.
- R65 → the hook fetches the bundle with a per-daemon secret; the bundle carries no provider keys; the route is scoped to the daemon's repo.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/examples/workflows/github-codex.yaml:238-245` — the `after_create` clone+branch hook to extend.
- `/home/orangekid/github/aiur/src/examples/workflows/github-codex.prompt.md:1-36` — the Liquid prompt skeleton (`issue.*`, `attempt`) to keep and append OGM rules to.
- `/home/orangekid/github/aiur/src/lib/aiur/workspace/hooks.ex:357-388` — env vars the hook can use (`AIUR_HOOK_TICKET_IDENTIFIER`, `THIS_REPOSITORY_URL`, `THIS_BASE_BRANCH`, `AIUR_TICKET_BRANCH`); the hook runs in an empty staging dir with `hooks.timeout_ms` 600000.
- `/home/orangekid/github/aiur/src/lib/aiur/github/labels.ex:25-26,47-48,82-93,160-171,212` — the label groups `aiur init` creates.
- `/home/orangekid/github/aiur/src/lib/aiur/agent_skills.ex:116-128` — install never clobbers existing paths, so repo-shipped `gm-*` survive; aiur's own `aiur-agent` skill still lands beside them.
- `/home/orangekid/games/open-game-maker-2000/.github/workflows/ci.yml` (working tree, untracked) — the `required` job shape with `pnpm -r --if-present run …`.
- `/home/orangekid/games/open-game-maker-2000/.aiur/prompt.md` (working tree, untracked) — the tone and rule list of the platform prompt; the game prompt is shorter and names `gm` commands.
- T10 §4 "Skill pack in a game repo" — exact paths and the `skills.lock` shape.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Template package and repo renderer
- Goal: one function that returns every file, label and required check of a new game repo.
- Files: Create `packages/game-repo-template/package.json` (`@ogm/game-repo-template`), `tsconfig.json`, `src/index.ts`, `src/repo.ts`, `src/labels.ts`, `src/skills.ts`, `templates/ci.yml`, `templates/AGENTS.md`, `templates/README.md`, `templates/gitignore`. Test `packages/game-repo-template/test/repo.test.ts`, fixture `test/fixtures/repo-files.json`.
- Approach: `renderRepoTemplate(ref, ctx)`: parse `ref` as `<engine>@<n>` (`game-2d`, `game-3d`, `game-multiplayer`); files = static templates (with `{{gameId}}`, `{{title}}` substitution, no templating engine needed) + engine scaffold files read from `templates/<engine>/` in the workspace when the directory exists, else a placeholder `package.json` with scripts `check: gm check`, `test: gm test`, `build: gm build` and a `.npmrc` (`store-dir`, `offline=true`, from OGM-038's convention) + skills from `skills.ts`. `skills.ts`: read `skills/gm-*/` from the workspace root (OGM-091) — until it exists, ship a minimal `gm-core/SKILL.md` placeholder inside `templates/skills/` and mark `skills.lock.pack: "0.0.0-placeholder"`; emit for each skill `.claude/skills/<name>/**`, `.codex/skills/<name>` as `{path, symlinkTo: "../../.claude/skills/<name>"}`, `.agents/skills/<name>` likewise; `skills.lock` from `skills/skills.lock` when present. `labels.ts`: the aiur groups with colors and descriptions (`agent:todo` etc.). `requiredChecks = ["ci / required", "ogm/boundary"]`. Output file entries are `{path, content, mode?: "100644"|"100755"|"120000", symlinkTo?}` so OGM-035 writes symlinks as mode-120000 blobs whose content is the target.
- Interface sketch:
  ```ts
  export type TemplateFile = { path: string; content: string; mode?: '100644'|'100755'|'120000' };
  export type RepoTemplate = { files: TemplateFile[]; labels: { name: string; color: string; description: string }[]; requiredChecks: string[] };
  export function renderRepoTemplate(ref: string, ctx: TemplateCtx): RepoTemplate;
  ```
- Test scenarios:
  - Given `game-3d@1` then the file set equals the fixture.
  - Given any render then every `120000` entry's target resolves to a file in the set.
  - Given `ctx.visibility: 'public'` then `README.md` has no owner name.
  - Given the same ctx twice then deep-equal output.
  - Given `skills/gm-core` present in the workspace then its `SKILL.md` content is used and `skills.lock.pack` is the real version.
- Execution note: write the fixture from T10 §4's path list first; the renderer is made to match.

### U2 — Daemon files: hooks and prompt
- Goal: the `after_create` hook and the prompt, byte-stable, host-path-free.
- Files: Create `packages/game-repo-template/src/daemon-files.ts`, `templates/hooks.sh`, `templates/prompt.md.liquid`. Test `packages/game-repo-template/test/daemon-files.test.ts`, fixtures `test/fixtures/hooks.expected`, `prompt.expected.md`.
- Approach: `renderDaemonFiles(ctx)` returns `{hooks, prompt}`. `hooks` YAML:
  ```yaml
  after_create: |
    set -eu
    git clone "$THIS_REPOSITORY_URL" .
    issue_id="$(basename "$PWD")"
    git checkout -b "aiur/${issue_id}" "origin/$THIS_BASE_BRANCH"
    mkdir -p .gm/context
    secret="$(cat "${OGM_HOOK_SECRET_FILE:?}")"
    if curl -fsS --max-time 20 -H "Authorization: Bearer ${secret}" \
         "${OGM_INTERNAL_URL:?}/internal/jobs/by-ticket/${AIUR_HOOK_TICKET_IDENTIFIER:?}/bundle" -o .gm/context/bundle.json; then
      want="$(node -p "require('./.gm/context/bundle.json').skillPackVersion")"
      have="$(node -p "require('./skills.lock').pack" 2>/dev/null || echo none)"
      if [ "$want" != "$have" ]; then
        url="$(node -p "require('./.gm/context/bundle.json').skillPackUrl")"
        curl -fsS -H "Authorization: Bearer ${secret}" "$url" | tar -xz -C .claude/skills
      fi
    else
      echo "bundle unavailable" > .gm/context/bundle.missing
    fi
  before_remove: |
    git status --short
  ```
  (`node` is on the daemon's PATH via nvm; the hook runs outside the sandbox so `curl` to loopback works, E02-9.) `prompt` = the aiur starter template followed by OGM rules: read `AGENTS.md`; load the skills named under "Load skills"; `.gm/context/bundle.json` is your brief; never edit `.gm/`, `assets.lock.json` by hand (use `gm assets use`), or `.github/`; post a still after every `gm run` with `gm chat post`; done means `gm check`, `gm test`, `gm run` green; open the PR with `Closes #<issue>` and `## Local tests`.
- Interface sketch: `export function renderDaemonFiles(ctx: { gameId: string; repo: string }): { hooks: string; prompt: string }`.
- Test scenarios:
  - Given ctx then `hooks` equals the fixture.
  - Given the hooks text then it contains no `/home/` and no literal secret.
  - Given the prompt rendered with `liquidjs` (3k+ stars, dev dependency) against a sample issue then the title and description appear and the `attempt` block is absent when `attempt` is nil.

### U3 — Provisioning orchestrator
- Goal: one call from the API's game-creation flow that leaves the repo and the daemon directory ready.
- Files: Create `services/builder/src/provision.ts`; Modify `services/builder/src/index.ts` (append one export). Test `services/builder/test/provision.test.ts`.
- Approach: `provisionGameRepo(input, deps)`: `templateRef = \`game-${input.engine}@1\``; `POST ${OGM_COMMIT_URL}/internal/commit` with `{kind:'create_repo', gameId, owner, visibility, templateRef}` (OGM-035; the commit service calls `renderRepoTemplate` through its `TemplateSource` — register `@ogm/game-repo-template` there in this ticket, one line in `services/commit/src/template-source.ts`, called out in the PR); on `{ok:true}` write `games.repo = "<owner>/gm-<gameId>"`; call OGM-034's `materialize`-equivalent through `fleet.prepareDaemonDir(repo, renderDaemonFiles(ctx))` so the dir exists before the first job (the unit starts only in OGM-031's path); on `{ok:false}` return the verdict unchanged. Paid-pack assets force `visibility: 'private'` (R6): the API enforces it before calling (OGM-012); this function refuses `public` when `ctx.family` is a Synty family as defense in depth (list from `style-families.json`, OGM-066; until then a constant).
- Interface sketch: `export async function provisionGameRepo(input: { gameId: string; owner: string; visibility: 'public'|'private'; engine: '2d'|'3d'|'multiplayer'; ctx: TemplateCtx }, deps: { fetch; db; fleet; env }): Promise<{ ok: true; repo: string; sha: string } | { ok: false; verdict: BoundaryVerdict }>`.
- Test scenarios:
  - Given a fake commit service answering `{ok:true, sha}` then one POST with the expected op and the game row updated.
  - Given `{ok:false}` then no row update and the verdict returned.
  - Given a Synty family and `public` then refused before any POST.

### U4 — Bundle route
- Goal: the hook's one HTTP call, scoped and secret-free.
- Files: Create `services/api/src/internal/bundle.ts` (and `services/api/src/internal/routes.ts` if OGM-010's directory scan mounts per-context `routes.ts`; otherwise `bundle.ts` exports the router and the mount is one line called out in the PR). Test `services/api/test/internal/bundle.test.ts`.
- Approach: middleware: bearer → `sha256` → lookup in `game_daemons` via the hook-secret file hash cached at daemon start (OGM-034 stores `hook_secret_hash` on the row; add that column in this ticket's timestamped migration if OGM-034 did not) → `daemon.repo`. `GET /internal/jobs/by-ticket/:identifier/bundle`: find the job with `aiurRepo === daemon.repo && aiurIssueNumber === identifier` (OGM-013's columns); 404 otherwise; build `JobBundle` from the game row (`title, family, pov, genre, multiplayer`), `skillPackVersion` from `skills/skills.lock` at API start, `skillPackUrl = ${OGM_INTERNAL_URL}/internal/skills/${version}.tgz`, `diagnostics` only for `kind: 'repair'` from the report row (OGM-015). `GET /internal/skills/:version.tgz`: streams a tar.gz of `skills/gm-*` built once at startup into `${OGM_DATA_DIR}/skills/<version>.tgz`. A response filter asserts no string matches `/(aiur_|ghp_|github_pat_|sk-|whsec_)[A-Za-z0-9_-]{8,}/` and no `@` (emails), else 500 and a log line.
- Interface sketch: `GET /internal/jobs/by-ticket/:identifier/bundle` → `200 JobBundle | 401 | 404`; `GET /internal/skills/:version.tgz` → `200 application/gzip | 404`.
- Test scenarios:
  - Given no bearer then 401.
  - Given daemon A's secret and a ticket from repo B then 404.
  - Given a matching ticket then the bundle with the game's family and no `diagnostics`.
  - Given a repair job then `diagnostics.bundleKey` present.
  - Given a bundle that would contain `ghp_…` (seeded title) then 500.

## 4. Verification

```
pnpm --filter @ogm/game-repo-template test
pnpm --filter @ogm/builder test
pnpm --filter @ogm/api test
pnpm -r typecheck && pnpm -r lint
# dry render for the PR:
node -e "import('@ogm/game-repo-template').then(m => console.log(m.renderRepoTemplate('game-3d@1', {...}).files.map(f => f.path + (f.mode === '120000' ? ' -> ' + f.content : '')).join('\n')))"
```
Paste into `## Local tests`: Vitest counts; the rendered path list; the hooks text (it contains no secret or host path by construction).

## 5. Deferred to implementation

- Where the skills tarball is built (startup vs on demand): default at API startup, cached by version.
- Liquid engine for the prompt test only (`liquidjs`): default dev dependency; production rendering is aiur's.
- Whether OGM-035's `create_repo` or this orchestrator creates labels: default `create_repo` (it holds the App token); this ticket only supplies the list.
- Engine scaffold placeholder content before OGM-023/024 exist: default `package.json` + `README` naming `gm new` as the real scaffold.

## 6. Scope boundaries

- Skill contents, `gm new`, `gm skills` (OGM-091); vendored reference layer (OGM-092).
- `.aiur/config` text and the Codex profile (OGM-037); daemon start/stop (OGM-034).
- Filing issues and `feature:gm-<jobId>` labels (OGM-031).
- GitHub writes (OGM-035); boundary rules (OGM-039); repair diagnostics assembly (OGM-096).

## 7. Risks

- Codex may not discover `.codex/skills` symlinks the repo ships (E10-6 [I]) — default: links are committed anyway; the human dry run decides; fallback: the hook appends a "skills live in `.claude/skills/`" line to `AGENTS.md`.
- `after_create` may run after the first prompt in warm-base workspaces (B8 §8 [I]) — default: the pack is already in the repo, so the hook only refreshes; the bundle is also fetchable later by `gm` if the worker finds `bundle.missing`.
- Hook secret readable via `/proc/<daemon>/environ` by same-uid processes — the secret is in a file, not the daemon env; only `OGM_HOOK_SECRET_FILE` (a path) is in env; the file is under `~/.config/ogm` which OGM-037 denies to sandboxed commands.
- Suggested-after OGM-091 not merged at pickup — default: ship the placeholder `gm-core` and `0.0.0-placeholder` lock; OGM-091 bumps the version, nothing structural changes.
