# `@ogm/api`

The platform API: Hono on `127.0.0.1:$OGM_API_PORT`, the only process that opens the SQLite database
(`$OGM_DATA_DIR/ogm.sqlite3`). Boot runs the `@ogm/db` migrations, then mounts every context.

Env (through `@ogm/config`): `OGM_API_PORT`, `OGM_DATA_DIR`, `OGM_INTERNAL_TOKEN`, `OGM_JOB_TOKEN_SECRET`,
`OGM_BLOB_ROOT`, `OGM_BLOB_SIGNING_KEY`, `OGM_PUBLIC_ORIGIN`, `OGM_APP_ORIGIN`,
`OGM_COMMIT_INTERNAL_URL`, `OGM_COMMIT_SERVICE_TOKEN`, and `OGM_GAME_TEMPLATE_REF` (defaults to
`templates/game-2d@main`).

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
