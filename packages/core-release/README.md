# @ogm/core-release

Preparation for CP-01: publish the core packages an instance game needs as immutable registry versions, without
publishing anything until the destination is approved. Operator steps live in
[docs/ops/core-packages.md](../../docs/ops/core-packages.md).

Two commands, both dry runs unless `--apply` is passed:

- `core-release publish` — computes the core dependency closure from the workspace graph (`@gm/sdk`, `@ogm/contracts`
  and the `@gm/pack-*` adapters, plus everything they import), stages each package's published surface, rewrites its
  manifest for the destination registry, packs it, and publishes leaves first. Version = `<manifest version>-core.<core
  sha, 12 characters>`. `--verify-oidc` proves the npm trusted publisher per package with `npm publish --dry-run` and
  still publishes nothing.
- `core-release switch --dir <instance-repo>` — plans the move of an instance repository from vendored core tarballs to
  registry versions: manifest specifiers, a managed `.npmrc` block, and the tarballs nothing references. Keeps
  `vendor/core.json` and every source import.

`core-release publish --root . --dry-run` prints the plan and touches no network and no credential. Registry, scope and
access default to `https://registry.npmjs.org`, `@open-game-maker` and `public`. A publish run authenticates with npm
OIDC trusted publishing: no token, no secret. See the command help for every flag.

Why the alias: npm scopes are owned permanently and `@gm` / `@ogm` belong to other accounts on npm, so `@gm/sdk`
publishes as `@open-game-maker/sdk`. The manifest keeps the source name as the dependency key and points its value at
`npm:@open-game-maker/sdk@<version>`, so `import ... from '@gm/sdk'` in game source is unchanged. A registry that
accepts the original scope (an instance-local feed) needs no alias.
