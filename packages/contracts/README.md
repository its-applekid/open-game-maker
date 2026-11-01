# @ogm/contracts

Shared runtime contracts for Open Game Maker 2000. C3 asset cards and map
layouts remain JSON-Schema-first; newer families are authored in Zod and emit
committed JSON Schema.

Each new family owns one `src/<family>.ts` file, exports a `<family>Schemas`
record (`health.ts` keeps its original `schemas`), and adds one line to the
append-only `src/index.ts` barrel. A `<family>.vN` stem pairs with
`fixtures/<family>.vN.json`; a `<family>.<shape>.vN` stem pairs with
`fixtures/<family>/<shape>.json`, or with every file in `fixtures/<family>/<shape>/`.
Negative fixtures live in `fixtures/<family>-negative/`.

```sh
pnpm --filter @ogm/contracts build
pnpm --filter @ogm/contracts generate
pnpm --filter @ogm/contracts emit
pnpm --filter @ogm/contracts check
pnpm --filter @ogm/contracts test
```

`check` rejects stale generated types, stale emitted schemas, and fixtures that
do not validate against their matching schema.
