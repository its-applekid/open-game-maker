# Commit service

The only OGM process that writes to GitHub. The API sends it one operation at a time on
`POST http://127.0.0.1:$OGM_COMMIT_PORT/internal/commit` (loopback only, `Bearer $OGM_COMMIT_SERVICE_TOKEN`), and it
runs that operation as the OGM GitHub App: add a game's folder `games/<slug>/` in the instance repository from its
template, fold a design transaction onto `main`, fork, merge, tag a release, create a branch, change visibility, or file
a platform bug report (`src/ops/registry.ts`). Every operation is appended to `$OGM_DATA_DIR/commit/audit.jsonl`.

Every game in an instance lives in ONE implementation repository (`OGM_INSTANCE_REPO`), under `games/<slug>/`; components
the instance's games share live under `packages/`. The service never creates a repository. A change for one game may touch only that game's folder, and
`packages/` only through a promotion the executor approved — the `gameFolderRule` in
`src/boundary/rules/game-folder.ts` refuses anything else.

A game's folder stays fixed for the life of the game, so renaming a game never moves its history; release tags are
namespaced by folder (`<slug>/v<version>`) so two games can each have v1.0.0. No production instance has per-game
`gm-<gameId>` repositories to migrate: the instance monorepo was the first layout that shipped, so there is nothing to
read read-only and no migration step. A fork still copies a folder from another repository when its source predates the
monorepo.

It also runs the `ogm/boundary` check on pull requests in the instance repository (path, size, secret, PII, rights and
blocklist rules in `src/boundary/`), and the same checks gate any change to public visibility
(`src/publish-gate/gate.ts`).

It runs as `ogm-commit.service`, installed by `ops/bin/ogm-host-setup.sh` and started through `ops/bin/ogm-run commit`.
Build it with `pnpm build`; until `services/commit/dist/index.js` exists the unit logs `PLACEHOLDER commit`.

## GitHub App

Create it at `https://github.com/settings/apps/new` (or under the organization that will own the instance
repository), generate a private key, and install the App on the instance repository only — every game in the instance
lives there — plus the owner of `OGM_PLATFORM_ISSUE_REPO` for platform bug reports. Creators never connect GitHub
themselves. Webhook can stay inactive (see Events). For Connect GitHub, set the App's Setup URL to
`<app-origin>/connect/github` with Redirect on update ticked; the API then asks
`GET /internal/installations/:id` which account an installation id belongs to (`src/server.ts:105`).

Repository permissions, each with the calls that need it:

| Permission | Access | Calls |
| --- | --- | --- |
| Contents | Read and write | git blobs, trees, commits (`src/ops/git-data.ts`); refs `POST /repos/{owner}/{repo}/git/refs` (`src/ops/create-game.ts`, `src/ops/create-branch.ts`, `src/ops/release.ts`); move `main` `PATCH .../git/refs/{ref}` (`src/ops/fold-design.ts`, `src/ops/restore-game.ts`); tags `POST .../git/tags` (`src/ops/release.ts`); a retried release reads its existing tag `GET .../git/ref/{ref}`, `GET .../git/tags/{tag_sha}` (`src/ops/release.ts`); reads for the boundary check (`src/boundary/inputs.ts`) |
| Pull requests | Read and write | open a game's pull request and merge it `POST .../pulls`, `PUT .../pulls/{pull_number}/merge` (`src/ops/create-game.ts`, `src/ops/merge.ts`); list open pulls (`src/boundary/poller.ts`); one pull (`src/ops/merge.ts`, `src/boundary/inputs.ts`); its files (`src/boundary/inputs.ts`) |
| Checks | Read and write | read `ogm/boundary` runs (`src/boundary/check-run.ts:54`); create them (`src/boundary/check-run.ts:91`) |
| Issues | Read and write | platform bug reports and per-game reports `POST /repos/{owner}/{repo}/issues` (`src/ops/file-issue.ts`); a game's label `POST /repos/{owner}/{repo}/labels` (`src/ops/create-game.ts`) |
| Metadata | Read | mandatory; GitHub requires it for every other permission. |

No organization or account permissions: the service never creates a repository or changes one's visibility, because the
instance repository already exists and its visibility belongs to the operator. `GET /app/installations`,
`GET /app/installations/{installation_id}` and `GET /app` are signed with the App's JWT and need none
(`src/auth/app.ts:63`, `:119`, `:108`).

### Events

Optional. With a webhook secret set, `POST /internal/github/webhook` accepts `pull_request` events (`opened`,
`synchronize`, `reopened`) and starts a boundary check (`src/boundary/webhook.ts:77`, `:84`). The service binds to
loopback, so GitHub reaches it only if you route that path to it yourself. Without it, the poller checks open pulls in
active repos every 60 seconds (`src/boundary/poller.ts:87`).

### Installation id

Not configured. For each owner the service lists the App's installations, picks the one whose account login matches
the owner (case-insensitive), and caches it for 10 minutes; installation tokens are cached until 5 minutes before they
expire (`src/auth/app.ts:56`, `:79`). An owner without an installation fails the operation with
`GitHub App is not installed for <owner>`. `GITHUB_APP_INSTALLATION_ID` in `.env.example` is read by nothing.

## Env

`~/.config/ogm/env/ogm-commit.env` (mode 0600). The unit reads that name, not `commit.env`, so copy the example
instead of running `ogm-env-init commit`:

```sh
install -m 600 services/commit/ops/ogm-commit.env.example ~/.config/ogm/env/ogm-commit.env
```

| Name | Value |
| --- | --- |
| `OGM_COMMIT_PORT` | loopback port, `4301` |
| `OGM_COMMIT_SERVICE_TOKEN` | shared with `api.env`, at least 32 bytes |
| `OGM_INTERNAL_TOKEN` | shared with `api.env` |
| `OGM_DATA_DIR` | absolute path, same as `api.env` |
| `OGM_BLOCKLIST_FILE` | optional, defaults to `$OGM_DATA_DIR/blocklist.txt` |
| `OGM_API_INTERNAL_URL` | `http://127.0.0.1:<OGM_API_PORT>` |
| `OGM_PLATFORM_ISSUE_REPO` | `owner/repo` that receives bug reports; the App must be installed on its owner |
| `GITHUB_APP_ID` | the App id |
| `GITHUB_APP_PRIVATE_KEY_PATH` | absolute path to the PEM, mode 0600, outside the repo |
| `OGM_GITHUB_WEBHOOK_SECRET` | optional, see Events |
| `OGM_BUILDER_BOT_LOGIN` | same as `api.env`; invited to the instance repository with push |

### Shared tokens

`OGM_COMMIT_SERVICE_TOKEN` and `OGM_INTERNAL_TOKEN` must be byte-identical in `api.env` and `ogm-commit.env`. The
first authenticates the API to this service and this service's repo lookups back to the API (`src/server.ts:98`,
`src/repo-resolver.ts:21`); the second authenticates boundary reads from the API's `/internal/games/*` routes with
`X-Ogm-Service: commit` (`src/boundary/api-client.ts:38`). `ogm-env-init api` generates both; copy the values into
`ogm-commit.env` without printing them, then restart both units.
