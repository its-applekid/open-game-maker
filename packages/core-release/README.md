# @ogm/core-release

CP-01: publish the core packages an instance game needs as immutable registry versions, and keep an instance
repository's games installable from them. Operator steps live in
[docs/ops/core-packages.md](../../docs/ops/core-packages.md).

Three commands. `publish` and `switch` are dry runs unless `--apply` is passed; `diagnose` never writes.

- `core-release publish` — computes the core dependency closure from the workspace graph (`@gm/sdk`, `@ogm/contracts`
  and the `@gm/pack-*` adapters, plus everything they import), stages each package's published surface, rewrites its
  manifest for the destination registry, packs it, and publishes leaves first. Version = `<manifest version>-core.<core
  sha, 12 characters>`. `--verify-oidc` proves the npm trusted publisher per package with `npm publish --dry-run` and
  still publishes nothing.
- `core-release switch --dir <instance-repo>` — plans the move of an instance repository from vendored core tarballs to
  registry versions: manifest specifiers, a managed `.npmrc` block, the tarballs nothing references, and
  `vendor/core-packages.json` — the released version set `gm new` reads. Keeps `vendor/core.json` and every source
  import. A standalone game repository that has no `vendor/core.json` switches on an explicit `--core-sha`.
- `core-release diagnose --dir <repo>` — read-only. Reports what would stop a game install: a core dependency still
  using `file:`/`workspace:`, a missing/malformed/stale version set, a specifier that drifted from the set, a core
  package the set does not list, an `.npmrc` without the registry block or with `offline=true`, orphaned tarballs, and
  lockfile entries without integrity. Exits 1 when it reports an error, so an instance repository's CI can gate on it.
  `--online` also asks the registry whether each version is published.

`core-release publish --root . --dry-run` prints the plan and touches no network and no credential. Registry, scope and
access default to `https://registry.npmjs.org`, `@open-game-maker` and `public`. A publish run authenticates with npm
OIDC trusted publishing: no token, no secret. See the command help for every flag.

## The released version set

`vendor/core-packages.json` is the bridge between "this core commit is published" and "this game installs it":

```json
{
  "v": 1,
  "core": {
    "sha": "<40-character core commit id>",
    "registry": "https://registry.npmjs.org",
    "scope": "@open-game-maker",
    "packages": {
      "@gm/sdk": "npm:@open-game-maker/sdk@0.0.0-core.3cef9ec65caa",
      "@ogm/contracts": "npm:@open-game-maker/contracts@0.0.0-core.3cef9ec65caa"
    }
  }
}
```

`core.sha` must equal the repository's `vendor/core.json` pin; a set that came from another commit is stale and
`diagnose` says so. Each value is exactly what a game's manifest installs, so `gm new` copies it without knowing the
destination scope. Sorted keys mean a re-run of the same pin is byte-identical, so a switch pull request shows a diff
only when the pin moved.

Why the alias: npm scopes are owned permanently and `@gm` / `@ogm` belong to other accounts on npm, so `@gm/sdk`
publishes as `@open-game-maker/sdk`. The manifest keeps the source name as the dependency key and points its value at
`npm:@open-game-maker/sdk@<version>`, so `import ... from '@gm/sdk'` in game source is unchanged. A registry that
accepts the original scope (an instance-local feed) needs no alias and its set holds the bare version.

## Scaffolding and the offline store

`gm new` in an instance repository replaces a template's local core dependencies with the set's specifiers and leaves
instance-owned `workspace:*` links alone. The core repository's own templates keep `workspace:*` so its tests link the
core sources; the substitution happens when the game lands in an instance repository.

After a release, seed the builder's offline pnpm store so sandboxed installs find the published packages without
network:

```
bash scripts/sandbox/seed-store.sh --core <instance-repo>
```

It reads that repository's release set and adds each destination name at its exact version.
