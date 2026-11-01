# OGM-001 plan — Monorepo scaffold and CI

## 1. Problem frame

The repository is research, three throwaway prototypes and tested Python; it has no TypeScript toolchain, no workspace and a placeholder CI job (E12-1, E04-19, PR #7). Thirteen tickets fan out from this one (graph.md), so the deliverable is a frozen spine: workspace globs that let packages be added without root edits, root scripts with fixed names, a CI job whose check name aiur already waits on, an ignore file that keeps licensed bytes and secrets out, and an `AGENTS.md` that tells a coding agent the commands and rules without re-reading the pack.

Requirements trace: R120 → pnpm workspace, TS base config, Vitest, ESLint, Prettier, one `ci / required` aggregate job. R123 → `AGENTS.md` names the commands, the "tests fail without the change" rule and the `## Local tests` PR section.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/aiur-contracts/tsconfig.json`: strict, `NodeNext`, `declaration`, `rootDir`/`outDir`; copy into `tsconfig.base.json` minus the paths.
- `/home/orangekid/github/aiur/.github/workflows/aiur-contracts.yml`: small single-job workflow with `permissions: contents: read` and `runs-on: ubuntu-24.04`; copy the shape.
- `/home/orangekid/games/open-game-maker-2000/.github/workflows/ci.yml` (on `main`, `e8ac897`): keep `name: ci`, job id and `name: required`, the `pull_request`/`push` triggers on `main`.
- `/home/orangekid/github/aiur/AGENTS.md`: short operating notes with a table of "which change needs what"; copy the register, not the content.
- `/home/orangekid/games/open-game-maker-2000/.gitignore`: every existing line survives verbatim.

## 3. Implementation units

### U1 Workspace root

Goal: `pnpm install` on a clean clone produces a lockfile and the four root scripts run on zero packages.

Files: Create `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`, `vitest.workspace.ts`.

Approach:
- `package.json`: `{"name":"ogm","private":true,"packageManager":"pnpm@10.33.0","engines":{"node":">=24"},"scripts":{"build":"pnpm -r --if-present run build","test":"pnpm -r --if-present run test","typecheck":"pnpm -r --if-present run typecheck","lint":"pnpm -r --if-present run lint && prettier --check . && node .github/scripts/check-ignore.mjs","format":"prettier --write ."},"devDependencies":{…}}`. Install with `pnpm add -Dw -E typescript vitest eslint @eslint/js typescript-eslint prettier @types/node` (exact pins land in the lockfile; record them in the PR).
- `pnpm-workspace.yaml`: the five globs from the ticket's contract block.
- `.npmrc`: `auto-install-peers=true`, `strict-peer-dependencies=false`, `save-exact=true`.
- `tsconfig.base.json`: `{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","strict":true,"declaration":true,"declarationMap":true,"sourceMap":true,"composite":true,"skipLibCheck":true,"isolatedModules":true,"verbatimModuleSyntax":true,"types":["node"]}}`. No `paths`; packages resolve each other through workspace `dependencies` and `references`.
- `vitest.workspace.ts`: `export default ['apps/*', 'packages/*', 'services/*']` so `pnpm exec vitest run` at the root also works; the canonical path stays `pnpm test` (per package).

Interface sketch (per-package convention every later ticket copies):

```json
{ "name": "@ogm/<dir>", "private": true, "type": "module", "version": "0.0.0",
  "scripts": { "build": "tsc -b", "typecheck": "tsc -b --noEmit false --emitDeclarationOnly false || tsc -p tsconfig.json --noEmit",
               "test": "vitest run", "lint": "eslint src" },
  "devDependencies": { "typescript": "<pinned>", "vitest": "<pinned>" } }
```
(`typecheck` = `tsc -p tsconfig.json --noEmit`; the package `tsconfig.json` extends `../../tsconfig.base.json`, sets `rootDir: src`, `outDir: dist`, and lists `references` to workspace deps.)

Test scenarios:
- Given a clean clone, when `pnpm install --frozen-lockfile` runs, then it exits 0 and creates no untracked file outside `node_modules/`.
- Given zero packages, when `pnpm test`/`pnpm typecheck`/`pnpm build` run, then each exits 0 (pnpm prints "None of the selected packages has a … script").
- Given a package added under `packages/_smoke` (U3), when `pnpm -r --if-present run test` runs, then its Vitest suite runs without any root edit.

### U2 Lint and format

Goal: one ESLint flat config and one Prettier config at the root; packages run `eslint src` with no config of their own.

Files: Create `eslint.config.js`, `.prettierrc`, `.prettierignore`.

Approach: `eslint.config.js` exports `[js.configs.recommended, ...tseslint.configs.recommended, {files:['**/*.{ts,tsx}'], rules:{'no-restricted-properties':[ 'error', {object:'process', property:'env', message:'Read env through @ogm/config'} ]}}, {ignores:['**/dist/**','**/node_modules/**','prototypes/**','third_party/**','docs/**','assets-local/**','.claude/**','.aiur/**','scripts/**']}]`. The `process.env` rule is the lint half of OGM-003's invariant; `packages/config` will override it for its own `src/` with a per-package config entry (`/* eslint-disable no-restricted-properties */` at file top is acceptable). `.prettierrc`: `{"printWidth":120,"singleQuote":true,"semi":true,"trailingComma":"all"}`. `.prettierignore`: `node_modules`, `dist`, `pnpm-lock.yaml`, `docs/`, `prototypes/`, `third_party/`, `assets-local/`, `.claude/`, `.aiur/`, `scripts/`, `*.md`.

Test scenarios:
- Given the scaffold, when `pnpm lint` runs, then `prettier --check .` passes on `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/workflows/*.yml`.
- Given a `.ts` file with `process.env.X` outside `packages/config`, when `eslint` runs on it, then it reports `no-restricted-properties`.

### U3 Workspace smoke script

Goal: a test that fails without the scaffold and proves typecheck and test wiring end to end.

Files: Create `.github/scripts/smoke-workspace.mjs`, `.github/scripts/check-ignore.mjs`.

Approach: `smoke-workspace.mjs` writes `packages/_smoke/{package.json,tsconfig.json,src/add.ts,src/add.test.ts}` (the package convention from U1; `add.test.ts` asserts `add(2,2)===4`), runs `pnpm install --offline --no-frozen-lockfile` is NOT allowed (it would change the lockfile), so instead it runs `pnpm --filter @ogm/_smoke exec vitest run` and `pnpm --filter @ogm/_smoke exec tsc -p tsconfig.json --noEmit` using the root-hoisted binaries; then appends `export const bad: number = 'x';` to `add.ts`, asserts `tsc` now exits non-zero, and removes the directory in `finally`. `check-ignore.mjs` runs `git check-ignore -q` over the must-ignore list (`assets-local/x`, `prototypes/ui-v0/tools/_pf.mjs`, `.claude/worktrees/x`, `node_modules/x`, `scripts/audio/.venv/x`, `scripts/py/audio/.venv/x`, `.env`, `.netlify/x`) and asserts `AGENTS.md`, `.env.example`, `.github/workflows/ci.yml` are not ignored.

Test scenarios:
- Given the scaffold, when `node .github/scripts/smoke-workspace.mjs` runs, then it prints `smoke: test ok, typecheck fails on type error ok` and leaves `git status --porcelain` empty.
- Given `tsconfig.base.json` deleted, when the script runs, then it fails (the test fails without the production change).
- Given `.gitignore` missing `assets-local/`, when `check-ignore.mjs` runs, then it exits 1 naming the path.

Execution note: write U3 first, run it to see it fail, then U1.

### U4 CI workflow and ignore file

Goal: `ci / required` runs the real pipeline; `.gitignore` is the superset.

Files: Modify `.github/workflows/ci.yml`, `.gitignore`.

Interface sketch (`.github/workflows/ci.yml`, whole file):

```yaml
name: ci
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
env:
  GM_VERIFY_SOFTWARE_GL: "1"
jobs:
  required:
    name: required
    runs-on: ubuntu-24.04
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Enable pnpm
        run: corepack enable || npm i -g pnpm@10.33.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - name: Browser tests (packages that declare test:browser)
        run: |
          if grep -rls '"test:browser"' --include=package.json apps packages services 2>/dev/null | grep -q .; then
            pnpm exec playwright install --with-deps chromium
            pnpm -r --if-present run test:browser
          else
            echo "no browser tests"
          fi
      - name: Ops shell tests (ops/test/*.sh, added by OGM-002/006/008)
        run: |
          shopt -s nullglob; rc=0
          for t in ops/test/*.sh; do echo "== $t"; bash "$t" || rc=1; done
          exit $rc
      - run: node .github/scripts/smoke-workspace.mjs
```

The ops step is guarded by `nullglob` so it is a no-op until `ops/test/` exists; it lets the platform lane add shell tests without editing this frozen file.

`.gitignore` (whole file; the first eight lines are today's, unchanged):

```
# Purchased/licensed asset packs: personal licenses, never commit
assets-local/

# prototype copies of licensed assets
prototypes/*/site/assets/
prototypes/*/.netlify/

# drive-sync virtualenv
scripts/drive-sync/.venv/
__pycache__/
docs/research/v0.5/schemas/tools/node_modules/
scripts/audio/.venv/

# workspace
node_modules/
dist/
*.tsbuildinfo
coverage/
test-results/
playwright-report/
.turbo/
*.local
.env
.env.*
!.env.example

# python workers (OGM-009 layout)
scripts/py/*/.venv/
.pytest_cache/

# host and tool state
.netlify/
**/.netlify/
.claude/worktrees/
prototypes/ui-v0/tools/_pf.mjs
```

Test scenarios:
- Given the workflow, when a PR opens, then exactly one check named `ci / required` appears (`grep -c 'name: required'` = 1; no other `jobs:` entry).
- Given `pnpm-lock.yaml` edited by hand, when `pnpm install --frozen-lockfile` runs in CI, then the job fails (lockfile discipline).
- Given `check-ignore.mjs`, when run, then every must-ignore path is ignored and `AGENTS.md` is not.

### U5 AGENTS.md

Goal: an agent starting any ticket finds the commands and rules in one file under 70 lines.

Files: Create `AGENTS.md`.

Interface sketch (section list and the load-bearing lines):

```markdown
# Open Game Maker 2000: operating notes for coding agents
## Commands
pnpm install --frozen-lockfile · pnpm lint · pnpm typecheck · pnpm test · pnpm build
pnpm --filter @ogm/<pkg> test (one package) · make test (Python workers; OGM-009)
Browser tests: Playwright on Chromium with `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist`; set GM_VERIFY_SOFTWARE_GL=1 for SwiftShader (CI does).
## Layout
apps/* packages/* services/* skills/* templates/* scripts/py/* ops/ (architecture.md §2). Package names @ogm/<dir>; engine side @gm/sdk, @gm/host.
## Write-surface rules
No root package.json edits except a workspace script. One file per contract family in packages/contracts/src; src/index.ts is append-only.
Commands, routes and screens are directory-scanned; migrations are timestamped files. .aiur/config, CODEOWNERS, .gitignore, ci.yml: Executor only.
## Services
Bind 127.0.0.1 only. Env only through @ogm/config by name; never log a value. Secrets live in ~/.config/ogm/env/<unit>.env (0600). No provider API keys, no spending.
## Dependencies
Exact pins. A new dependency under 1k GitHub stars needs the exception named in the PR.
## Tests
Vitest for units. Every new test must fail without the production change. Browser tests as above.
## Pull requests
First line `Closes #<issue>`. A `## Local tests` section with Policy, Tested head (40-char SHA), Base (ref + SHA), Selection, and one bullet per command with its result. Update it after every push.
## Never commit
assets-local/, keys, download links, serials, prototypes/ui-v0/tools/_pf.mjs. Prototypes are frozen. Deploys are manual (Netlify credits).
```

Test scenarios:
- Given `AGENTS.md`, when `grep -c` for each of `pnpm lint`, `pnpm typecheck`, `pnpm test`, `Closes #`, `## Local tests`, `127.0.0.1`, `GM_VERIFY_SOFTWARE_GL` runs, then each is ≥1 (add to `check-ignore.mjs` as a second assertion block so it runs under `pnpm lint`).

## 4. Verification

```
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node .github/scripts/smoke-workspace.mjs
node .github/scripts/check-ignore.mjs
git status --porcelain            # empty after the smoke script
```

Paste into `## Local tests`: policy `partial` (full suite is the whole scaffold here), tested head SHA, base `main` + SHA, selection "all root scripts + smoke", and one bullet per command with exit code and the pnpm summary lines.

## 5. Deferred to implementation

- Exact dependency versions: whatever `pnpm add -E` resolves on the day; record them in the PR body.
- Pin GitHub actions by SHA (aiur style) or by major tag: default major tag (`@v4`), the repo has no supply-chain policy yet.
- Whether `.aiur/model-usage.json` (untracked, written by aiur) should be ignored: default not ignored; ask the Executor in the PR.
- `vitest.workspace.ts` vs per-package only: default ship it (zero cost) but document `pnpm test` as canonical.

## 6. Scope boundaries

- `packages/config`, `.env.example`: OGM-003. `packages/contracts`: OGM-004. `packages/blob-store`: OGM-005.
- `Makefile`, `scripts/py/*`, `ci-python.yml`: OGM-009.
- `apps/web`, Netlify files and deploy script: OGM-070.
- `ops/*`: OGM-002, OGM-006, OGM-008.
- `.aiur/config`, `CODEOWNERS`: Executor.

## 7. Risks

- Node 24 on the runner may ship without corepack: fallback `npm i -g pnpm@10.33.0` is in the workflow.
- An over-broad `.prettierignore` or ESLint `ignores` hides real files later: defaults ignore only non-workspace trees; packages are always covered.
- The `process.env` lint rule blocks OGM-003 itself: it disables the rule in `packages/config/src` (documented in U2).
- Smoke script leaving `packages/_smoke` behind on failure: `finally` removes it and CI runs it last so a leftover cannot affect earlier steps.
