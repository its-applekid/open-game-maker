# @ogm/contracts

Shared runtime contracts for Open Game Maker 2000. C3 asset cards and map
layouts remain JSON-Schema-first; newer families are authored in Zod and emit
committed JSON Schema.

Each new family owns one `src/<family>.ts` file, exports a `<family>Schemas`
record (camelCase, so `design-log.ts` exports `designLogSchemas`), and
adds one line to the append-only `src/index.ts` barrel. Its schema and golden
fixture use the same `<family>.vN` stem.

```sh
pnpm --filter @ogm/contracts build
pnpm --filter @ogm/contracts generate
pnpm --filter @ogm/contracts emit
pnpm --filter @ogm/contracts check
pnpm --filter @ogm/contracts test
```

`check` rejects stale generated types, stale emitted schemas, and fixtures that
do not validate against their matching schema.

| Schema and fixture stem | Producer                           | Contract                                  |
| ----------------------- | ---------------------------------- | ----------------------------------------- |
| `health.v1`             | service health routes              | `HealthResponse`                          |
| `bridge.v1`             | host app and game iframe (OGM-021) | `HostToGame` / `GameToHost` under `$defs` |
| `game.v1`               | each game template                 | `GameManifest`                            |
| `input.v1`              | host input and SDK (OGM-022)       | `ActionFrame`                             |
| `assets.v1`             | `gm build assets` (OGM-063)        | `AssetManifest`                           |
| `assets-lock.v1`        | `gm assets use` (OGM-062)          | `AssetsLock`                              |

Extra bridge fixtures (`bridge-*.v1.json`) and the negatives in `fixtures/negative/` are checked by the
Vitest suite, which also fails when a committed engine schema drifts from its Zod source.
