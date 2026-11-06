# @ogm/core-release

Preparation for CP-01: publish the core packages an instance game needs as immutable registry versions, without
publishing anything until the destination is approved. Operator steps live in
[docs/ops/core-packages.md](../../docs/ops/core-packages.md).

Two commands, both dry runs unless `--apply` is passed:

- `core-release publish` — computes the core dependency closure from the workspace graph (`@gm/sdk`, `@ogm/contracts`
  and the `@gm/pack-*` adapters, plus everything they import), stages each package's published surface, rewrites its
  manifest for the destination registry, packs it, and publishes leaves first. Version = `<manifest version>-core.<core
  sha, 12 characters>`.
- `core-release switch --dir <instance-repo>` — plans the move of an instance repository from vendored core tarballs to
  registry versions: manifest specifiers, a managed `.npmrc` block, and the tarballs nothing references. Keeps
  `vendor/core.json` and every source import.

`core-release publish --root . --scope "@<owner>" --dry-run` prints the plan and touches no network and no token. See
the command help for every flag.

Why the alias: GitHub Packages only accepts packages scoped to the repository owner, so `@gm/sdk` publishes as
`@<owner>/sdk`. The manifest keeps the source name as the dependency key and points its value at
`npm:@<owner>/sdk@<version>`, so `import ... from '@gm/sdk'` in game source is unchanged. A registry that accepts the
original scope (an instance-local feed) needs no alias.
