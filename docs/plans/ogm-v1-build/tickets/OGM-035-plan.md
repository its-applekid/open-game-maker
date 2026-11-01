# OGM-035 plan — Commit service with GitHub App auth

## 1. Problem frame

Creators' games live in their own GitHub repos (A11). aiur workers push branches and open PRs themselves and nothing upstream returns a patch to an orchestrator (E03-12), so the write boundary OGM can enforce is "nothing lands on `main`, a tag, a fork or a visibility change except through one service that holds the only GitHub App credential" (D-COMMIT). This ticket builds that service: App installation tokens (the shape aiur already implements in Elixir, E03-11), six deterministic operations over the Git Data API with fast-forward-only ref updates (A7 R07), an audit line per op, a loopback-only route with a service token, and a `BoundaryGate` seam that OGM-039 fills. It is a phase-2 spine: OGM-036 (provisioning), OGM-039 (gate), OGM-043/045/048 (branches, publish, forks) all call it.

**Requirements trace**
- R64 → the commit service is the only writer to `main`, tags, branches created by fold/fork, repo creation, visibility and PR merges for creators' games; it runs the content gate (interface here, rules in OGM-039) and holds the GitHub App credential alone.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur/github/app_credentials.ex:1-30` — env names and the rule "path takes precedence over the inline key; only one source is read".
- `/home/orangekid/github/aiur/src/lib/aiur/github/app_token.ex:1-50` — JWT claims (`iat` backdated 60 s, `exp = iat + 600`, `iss = app_id`), the 5-minute refresh margin; `@octokit/auth-app` does the same, the test asserts it.
- `/home/orangekid/github/aiur/src/lib/aiur/github/issue_creation.ex` — the shape of a pure GitHub write with an injectable `request_fun` and `outcome_unknown` on an ambiguous 2xx; copy that injection style for testability.
- `/home/orangekid/github/aiur/src/lib/aiur/github/access/wrapper_token.ex:55-72` — why the App token must never reach agents; the daemons get a PAT, this service gets the App.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/ogm-drive-sync.service` — unit hardening lines (`Restart=on-failure`, `UMask=0077`, `NoNewPrivileges=yes`, `WantedBy=default.target`).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.3/A7-infra-auth-git-multiplayer.md:237-252` — CAS on the ref SHA with retry on 422; deterministic fork steps 1–7.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (`@octokit/auth-app` is named by D-COMMIT and lives in the Octokit org whose umbrella `octokit/octokit.js` has 7k+ stars); PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Contract file
- Goal: the verbatim types exist in `packages/contracts` with zod schemas and emitted fixtures.
- Files: Create `packages/contracts/src/commit.ts`; Modify `packages/contracts/src/index.ts` (append `export * from "./commit.js";`). Test `packages/contracts/test/commit.test.ts`.
- Approach: zod discriminated union on `kind` matching the T03 §4 block exactly; `BoundaryVerdict.reasons[].code` enum of the six codes; `CommitResult` union. Emit JSON Schema and one fixture per op kind through the contracts package's existing emitter (OGM-004 defines it; copy its pattern).
- Interface sketch: `export const CommitOp = z.discriminatedUnion("kind", [...]); export type CommitOp = z.infer<typeof CommitOp>;` plus `CommitResult`, `BoundaryVerdict`.
- Test scenarios:
  - Given each fixture when parsed then ok.
  - Given `kind: "push"` then rejected.
  - Given `visibility: "internal"` then rejected.

### U2 — Service skeleton, auth, audit
- Goal: a Hono server on loopback that authenticates the API and writes audit lines.
- Files: Create `services/commit/package.json` (`@ogm/commit`), `tsconfig.json`, `src/index.ts`, `src/server.ts`, `src/audit.ts`, `src/config.ts`, `ops/ogm-commit.service`, `ops/ogm-commit.env.example`. Test `services/commit/test/server.test.ts`, `test/audit.test.ts`.
- Approach: `createServer(deps)` returns a Hono app with `GET /healthz` → `{ok:true, service:"commit", version, uptimeSec}` and `POST /internal/commit`. Middleware: reject unless `c.env.remoteAddr` is `127.0.0.1`/`::1`; reject unless bearer equals `OGM_COMMIT_SERVICE_TOKEN` (constant-time compare). Body → `CommitOp.parse` → `registry[kind](op, ctx)` → write audit → respond. `audit.ts` appends `JSON.stringify({at, kind, gameId, repo, ok, sha?, verdict?, actor:"api"}) + "\n"` to `${OGM_DATA_DIR}/commit/audit.jsonl` with `O_APPEND` and `mode 0600`. Config via `packages/config` names; the service exits non-zero naming any missing variable (never its value). Unit: `ExecStart=%h/games/open-game-maker-2000/node_modules/.bin/tsx services/commit/src/index.ts` (or the built `dist/index.js`, whichever OGM-001's build emits), `EnvironmentFile=%h/.config/ogm/env/ogm-commit.env`, `Slice=ogm.slice`.
- Interface sketch: `POST /internal/commit` body `CommitOp` → 200 `CommitResult`; 401 without token; 403 from a non-loopback peer; 422 on schema failure `{error:{code:"invalid_op", issues}}`.
- `ops/ogm-commit.env.example` (names only, values never in the repo):
  ```
  OGM_COMMIT_PORT=4301
  OGM_COMMIT_SERVICE_TOKEN=            # openssl rand -base64 32; same value in ogm-api.env
  OGM_DATA_DIR=/home/orangekid/.local/share/ogm/data
  OGM_API_INTERNAL_URL=http://127.0.0.1:4300
  GITHUB_APP_ID=                       # App settings page
  GITHUB_APP_PRIVATE_KEY_PATH=/home/orangekid/.config/ogm/env/ogm-github-app.pem   # chmod 600
  OGM_BUILDER_BOT_LOGIN=ogm-builder    # collaborator invited on every game repo
  ```
- Test scenarios:
  - Given no bearer then 401.
  - Given a wrong bearer then 401.
  - Given `remoteAddr` 192.168.1.5 then 403.
  - Given a valid `release` op with a stub registry then 200 and one audit line.
  - Given `OGM_COMMIT_SERVICE_TOKEN` of 8 bytes then startup throws.

### U3 — GitHub App auth and installation resolution
- Goal: an Octokit per repo owner, authenticated as that owner's installation, with tokens cached and never logged.
- Files: Create `services/commit/src/auth/app.ts`. Test `services/commit/test/auth.test.ts`.
- Approach: `createAppAuth({appId, privateKey: readFileSync(GITHUB_APP_PRIVATE_KEY_PATH)})`; `installationFor(owner)`: list `GET /app/installations` with the App JWT, find `account.login === owner`, cache `{installationId, fetchedAt}` for 10 min; `octokitFor(owner)` → `new Octokit({authStrategy: createAppAuth, auth: {appId, privateKey, installationId}})`; `@octokit/auth-app` caches installation tokens itself. Wrap the Octokit `request` hook to redact `authorization` from any thrown error. Expose `appSlug()` from `GET /app` for the commit identity.
- Interface sketch: `export type AppAuth = { octokitFor(owner: string): Promise<Octokit>; appSlug(): Promise<string> }; export function createGitHubAppAuth(cfg: { appId: string; privateKeyPath: string; fetch?: typeof fetch }): AppAuth`.
- Test scenarios:
  - Given a fake transport listing two installations when `octokitFor("alice")` then the request carried `installations/<alice id>/access_tokens`.
  - Given an unknown owner then `AppNotInstalledError` naming the owner.
  - Given a thrown 401 then its message contains no token.

### U4 — Git Data operations
- Goal: the six ops, each pure over an injected Octokit, with fast-forward CAS.
- Files: Create `services/commit/src/ops/{registry,create-repo,fold-design,fork,release,merge,set-visibility}.ts`, `src/template-source.ts`, `src/paths.ts`. Test `services/commit/test/ops/*.test.ts` with recorded responses.
- Approach:
  - `paths.ts`: `assertSafePath(p)` rejects `..`, leading `/`, `\0`, `.git/` prefix; returns the normalized POSIX path.
  - `fold_design`: for each file `POST git/blobs` (base64), `POST git/trees {base_tree: baseTreeSha, tree:[...]}` where `baseTreeSha` is the tree of `op.base`, `POST git/commits {message:"design: fold <gameId>", tree, parents:[op.base], author/committer: app bot}`, `PATCH git/refs/heads/main {sha, force:false}`. On 422 "not a fast forward": `GET git/ref/heads/main`, verify the new head's tree contains the previous design state the API intended (return `{ok:false, code:'denylist', detail:'base moved'}` and let the API re-fold; the API owns the merge of design state, OGM-045), retry at most 3× only when the API passed `base` as `"HEAD"`.
  - `release`: `POST git/refs {ref:"refs/tags/gm/<gameId>/v<semver>", sha}`; 422 "already exists" with a different sha → `{ok:false, denylist, 'tag exists'}`; `changelog` goes into an annotated tag object (`POST git/tags`) so the text is in Git, never a release note on GitHub's UI.
  - `merge`: `GET pulls/:n` → head sha; gate; `PUT pulls/:n/merge {sha: head, merge_method:"squash", commit_title:"<pr title> (#n)"}`; 405/409 → `{ok:false, denylist, 'not mergeable: <reason>'}`.
  - `set_visibility`: gate (default refuses public); `PATCH repos/:o/:r {private: visibility==='private'}`.
  - `create_repo`: `POST user/repos` or `POST orgs/:o/repos` via the installation (owner decides), `{name: "gm-" + gameId, private, auto_init:false, has_issues:true}`; render `TemplateSource.render(op.templateRef, {gameId, owner, visibility})` → `{files, labels, requiredChecks}`; blobs → tree → commit (no parent) → `POST git/refs {ref:"refs/heads/main"}`; create labels (`POST labels`, 422 "already_exists" ignored); `POST repos/:o/:r/rulesets` requiring status checks `requiredChecks` (`["ci / required", "ogm/boundary"]`) on `refs/heads/main` with pull-request requirement; `PUT repos/:o/:r/collaborators/:bot {permission:"push"}` for `OGM_BUILDER_BOT_LOGIN`. Default `TemplateSource` (until OGM-036): `README.md` + `.gitignore` + `.github/workflows/ci.yml` copied from this repo's working-tree `.github/workflows/ci.yml` shape (job name `required`), labels from aiur's list (`src/lib/aiur/github/labels.ex:25-26,212`: `agent:<state>` for `todo in-progress ci-wait human-review rework merging done error cancelled canceled budget-exhausted`, `agent:<reason>` for `merge-queued ci-red body-fix paused-usage-limit paused-decision paused-agent retrying blocked handed-off`, `agent:watch`, `agent:paused`, `complexity:1..5`, `flake`).
  - `fork`: `GET git/trees/:sourceSha?recursive=1` on the source repo; for each blob `GET git/blobs/:sha` → `POST git/blobs` in the new repo (content-addressed, skip when the sha already exists there); build the tree; commit with message `fork` and trailer `Forked-From: <sourceGameId>@<sha>`; `POST git/refs/heads/main`. The new repo is created first through `create_repo` by the caller (OGM-048) so this op only writes the tree. Never copies `.gm/`, `saves/`, anything matching the OGM-039 denylist once it exists.
- Interface sketch: `export type OpHandler<K extends CommitOp["kind"]> = (op: Extract<CommitOp, {kind: K}>, ctx: { octokit: Octokit; repo: {owner: string; name: string}; gate: BoundaryGate; appSlug: string }) => Promise<CommitResult>;`
- Test scenarios:
  - Given `fold_design` and a transport that answers 422 once then 200 then two `PATCH refs` calls.
  - Given three 422s then `{ok:false}`.
  - Given a file path `../secrets` then `{ok:false, code:'path'}` and no blob call.
  - Given `merge` with head `abc` then the PUT body has `sha: "abc"`.
  - Given `set_visibility: public` with the default gate then `{ok:false, code:'denylist'}` and no PATCH.
  - Given `create_repo` then labels, ruleset and collaborator calls happen after the initial commit.
  - Given `fork` with a tree containing `.gm/context/bundle.json` then that path is not written.

### U5 — Gate seam
- Goal: one interface OGM-039 implements, with a fail-closed default for public exposure.
- Files: Create `services/commit/src/gate.ts`. Test `services/commit/test/gate.test.ts`.
- Approach: `interface BoundaryGate { evaluate(input: GateInput): Promise<BoundaryVerdict> }` where `GateInput = { kind: CommitOp["kind"]; repo; visibility: 'public'|'private'; files?: {path, bytes}[]; prNumber?; sha? }`. `defaultGate`: `allowed: false` with `denylist` reason when `kind` is `set_visibility` to public, or `release`/`fold_design`/`merge` on a repo that is currently public; otherwise `allowed: true`. The server reads the repo's current visibility from `GET repos/:o/:r` once per op.
- Interface sketch: as above.
- Test scenarios:
  - Given a public repo and `release` then refused.
  - Given a private repo and `release` then allowed.
  - Given `set_visibility: private` then allowed.

## 4. Verification

```
pnpm --filter @ogm/contracts test && pnpm --filter @ogm/contracts build
pnpm --filter @ogm/commit test
pnpm -r typecheck && pnpm -r lint
# manual, after GATE-GITHUB-APP:
OGM_COMMIT_PORT=4301 pnpm --filter @ogm/commit dev &
curl -s -X POST http://127.0.0.1:4301/internal/commit -H "Authorization: Bearer $OGM_COMMIT_SERVICE_TOKEN" -H 'content-type: application/json' -d '{"kind":"create_repo","gameId":"g_test","owner":"its-everdred","visibility":"private","templateRef":"default"}'
```
Paste into `## Local tests`: Vitest counts per file; typecheck/lint exit codes; if the App exists, the three audit lines from the scratch repo run (token values never appear in them).

## 5. Deferred to implementation

- Unit `ExecStart` form (tsx vs built dist): default whatever OGM-001's package `build` emits.
- Whether `POST user/repos` is allowed for an installation token on a user account (it may need `POST /repos/{template}/generate` or the user's own OAuth): default try `user/repos`; if GitHub refuses, record it and have OGM-012's GitHub-connect flow create the empty repo with the creator's OAuth token while this service does everything after.
- Ruleset vs classic branch protection on Free plans for public repos: default rulesets (A7: ordinary branch rulesets work on public Free repos); fall back to `PUT branches/main/protection`.
- Squash vs merge commit: default squash (aiur's PR body lands in the commit).

## 6. Scope boundaries

- Path, size, rights, secret/PII and blocklist rules, and the `ogm/boundary` check run (OGM-039).
- Design fold computation, release rows, version numbers, rollback (OGM-045); fork bookkeeping (OGM-048); branch creation semantics (OGM-043).
- Template files, labels list, skills links, hooks (OGM-036 via `TemplateSource`).
- Issue filing (OGM-031, intake machine-user PAT).

## 7. Risks

- GATE-GITHUB-APP lands late — default: every test runs on the fake transport; the real run moves to OGM-100's proof.
- Installation token scope cannot be narrowed to one path (A7) — accepted: the service's own path checks are the boundary.
- `fork` of a large tree is slow (one blob POST per file) — default: skip blobs that already exist (content-addressed), parallelism 8; family-scale repos are small.
- The API moving `main` concurrently (two folds) — default: CAS + 3 retries; the API serializes folds per game (OGM-045 owns that lock).
