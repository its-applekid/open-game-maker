# @ogm/contracts

Shared runtime contracts for Open Game Maker 2000. C3 asset cards and map
layouts remain JSON-Schema-first; newer families are authored in Zod and emit
committed JSON Schema.

Each new family owns one `src/<family>.ts` file, exports a `schemas` record, and
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
