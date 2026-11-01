# `@ogm/api`

The platform API: Hono on `127.0.0.1:$OGM_API_PORT`, the only process that opens the SQLite database
(`$OGM_DATA_DIR/ogm.sqlite3`). Boot runs the `@ogm/db` migrations, then mounts every context.

Env (through `@ogm/config`): `OGM_API_PORT`, `OGM_ANALYTICS_RETENTION_DAYS` (default `90`), `OGM_DATA_DIR`,
`OGM_GAMES_ROOT` (optional; defaults to the `games` directory beside `OGM_DATA_DIR`),
`OGM_GAMES_ORIGIN`, `OGM_INTERNAL_TOKEN`, `OGM_JOB_TOKEN_SECRET`, `OGM_BLOB_ROOT`, `OGM_BLOB_SIGNING_KEY`,
`OGM_PUBLIC_ORIGIN`; the auth
context adds `OGM_APP_ORIGIN`, `OGM_SESSION_SECRET`, `OGM_AGE_COOKIE_SECRET`, `OGM_WS_TOKEN_SECRET` and the optional
`OGM_MAINTAINER_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_URL`, `SMTP_FROM` (see
`docs/ops/netlify-proxy.md`), plus `OGM_COMMIT_INTERNAL_URL`, `OGM_COMMIT_SERVICE_TOKEN`, `OGM_GAME_TEMPLATE_REF`
(defaults to `game-2d@1`), `OGM_VAPID_KEY_FILE`, `OGM_VAPID_SUBJECT`, `OGM_BUILDER_WORKSPACES_ROOT` (optional), and
`OGM_CHAT_POLL_MS` (default `10000`).
Optional `OGM_ASSETS_ROOT` (the `assets-local/` library) gives `GET /api/catalog/style-families` its pack titles and
thumbnails; without it packs are named by id.

`OGM_VAPID_KEY_FILE` defaults to `~/.config/ogm/env/ogm-api.vapid.json`; the API creates the key pair with mode
`0600` on first boot. Set `OGM_VAPID_SUBJECT` to the contact email used for the Web Push `mailto:` subject.
Push requests use a 10-second socket timeout. Expired subscriptions are removed immediately; other failures are
removed after five consecutive attempts without failing the notification emitter.

The build chat (`/api/v1/jobs/:jobId/chat`) relays agent posts from `<workspace>/.gm/outbox/*.jsonl` under
`OGM_BUILDER_WORKSPACES_ROOT`; without it the relay stays off and the API logs the missing name. Lines of other types
go to a context's `src/<context>/outbox.ts`, which exports `type` and `handle(line, ctx)`. Production wires
`deps.registry.chatJobs` to the jobs table and `deps.registry.aiurClientFor` to the daemon directory; both stay
injectable for focused tests. Without an aiur client creator posts stay pending and nothing is polled. The trusted job
launcher must call `registerWorkspace(sqlite, jobId, workspaceRoot)` before sandbox output is accepted; unregistered
workspaces and lines naming another job are rejected.

```sh
pnpm --filter @ogm/api build && pnpm --filter @ogm/api start   # or: pnpm --filter @ogm/api dev
curl -s http://127.0.0.1:$OGM_API_PORT/healthz
```

## Adding a context

Create `src/<context>/routes.ts` whose default export is a `new Hono<ApiBindings>()`. It mounts at
`/api/v1/<context>` unless it exports `prefix`; an exported `setup(deps)` runs before mounting (push a resolver onto
`deps.registry.principalResolvers`, set `deps.registry.gameResolver`, subscribe to `deps.events`). Never edit
`src/app/`. Throw `HttpError(status, code)` for errors, use `parseBody`/`parseQuery` with `@ogm/contracts` schemas, and
read the caller with `requirePrincipal(c, kinds)`.

Contexts may share an exported prefix when they own distinct routes. Auth registers the mail sender and user directory
seams; games registers its resolver and uses the injected repository provisioner.

A context that needs tables adds `packages/db/src/schema/<context>.ts`, one line in `schema/index.ts`, and a
`packages/db/migrations/<YYYYMMDDHHmmss>_<name>.sql` (hand-written, or `pnpm --filter @ogm/db generate --name <name>`).
Applied migrations are never edited.
