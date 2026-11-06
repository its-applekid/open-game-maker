# Core packages: publishing and instance installs

Prepared for CP-01 (#490) by #545. **Nothing is published, and this document creates no token.** It describes the
switch that is already in the repository and the steps only Kevin can take to turn it on.

The first instance game (the `open-games` repository, ticket #2 there) vendors release tarballs of the core packages
today. This page is how that stops being necessary: one decision, one workflow run, one pull request in the instance
repository.

## What already exists

| Piece | Where | What it does |
| --- | --- | --- |
| Release workflow | `.github/workflows/publish-core-packages.yml` | `workflow_dispatch` only. Takes the registry URL and scope as inputs and **defaults to a dry run**. |
| Release tool | `packages/core-release` | Stages and packs the core dependency closure, leaves first, and publishes it. `--dry-run` unless `--apply`. |
| Switch tool | `packages/core-release` (`core-release switch`) | Plans the move of an instance repository from vendored tarballs to registry versions, dry run by default. |
| CI dry run | `.github/workflows/ci.yml`, "Core package publish dry run" | Runs the same dry run after every workspace build, so the release stays packable. |

The closure comes from the workspace graph, not a hand-written list: the roots in `packages/core-release/src/roots.ts`
(`@gm/sdk`, `@ogm/contracts`, and the three `@gm/pack-*` adapters `gm new --set` can pin) plus everything they import.
Today that is six packages in this order:

1. `@ogm/contracts`
2. `@ogm/iframe-bridge`
3. `@gm/sdk`
4. `@gm/pack-kaykit`, `@gm/pack-limezu-modern`, `@gm/pack-smallscaleint`

Each release version is `<the package's manifest version>-core.<first 12 characters of the core commit>`, for example
`0.0.0-core.3cef9ec65caa`. The core commit is the same pin an instance repository keeps in `vendor/core.json`
(`core.sha`), the file `services/core-bump` reads. So one pin produces exactly one set of versions, a new pin produces
new versions, and an old version stays installable. A version that already exists is never overwritten: a re-run skips a
package whose published bytes match and stops on one whose bytes differ.

## The decision (#490)

Pick one destination and record it on #490. The workflow only needs inputs, so all three are the same command with
different flags.

| Option | Registry | Scope | Who can install |
| --- | --- | --- | --- |
| **(a) GitHub Packages**, recommended | `https://npm.pkg.github.com` | `@<repository owner>` | Repositories with a read token; private or public per package visibility |
| (b) Public npm | `https://registry.npmjs.org` | an npm scope the owner controls (`@gm`, `@ogm`, or one owned scope) | Everyone |
| (c) A registry on the host | e.g. `http://<tailnet-host>:<port>` | `@gm` | Only machines that can reach the host — instance CI cannot today |

GitHub Packages refuses a package whose scope is not the repository owner. With option (a) the releases therefore
publish as `@<owner>/sdk`, `@<owner>/contracts`, and so on, and games keep importing `@gm/sdk` because the switch writes
an `npm:` alias in the game's manifest (`"@gm/sdk": "npm:@<owner>/sdk@0.0.0-core.<sha12>"`). With options (b) and (c)
the original names can stay when the registry accepts them, and the alias disappears.

## Steps to unblock

Only Kevin does these. No agent creates the token, the secret, or the registry, and none of this is committed.

1. **Choose the destination** on #490. Note the registry URL and scope it implies.
2. **Create the publisher token** in the destination's own console and name it clearly, e.g.
   `open-game-maker core release`:
   - GitHub Packages: a fine-grained personal access token on the owning account with `read:packages` and
     `write:packages` (no repository content permissions).
   - Public npm: an automation token for the scope's owner.
   - Host feed: whatever the feed's configuration requires; if it is unauthenticated, skip steps 2 and 3.
3. **Store it as the repository secret `CORE_PACKAGES_PUBLISH_TOKEN`** on this repository (Settings → Secrets and
   variables → Actions). Never paste it into an issue, a file, or a pull request.
4. **Create the read-only token** for the instance repository's CI: a separate token with `read:packages` only, stored in
   the instance repository as `CORE_PACKAGES_READ_TOKEN`. The read and publish credentials stay distinct so a game
   build can never publish.
5. **Run the workflow once as a dry run** (Actions → "publish core packages" → Run workflow, `dry_run` checked) and read
   the printed plan. It names every package, its published name, version, files, size, and integrity, in publish order.
6. **Publish**: run the same workflow with `dry_run` unchecked and `core_sha` set to the commit Open-Games pins in its
   `vendor/core.json`. Leave `core_sha` empty only when the dispatched branch head *is* the pin.
7. **Switch Open-Games in one pull request** (see below).

The equivalent commands, from a checkout of this repository after `pnpm install --frozen-lockfile && pnpm -r build`:

```
# dry run: stages and packs everything, publishes nothing, needs no token
node packages/core-release/dist/bin.js publish --root . --registry https://npm.pkg.github.com \
  --scope "@<owner>" --core-sha <pin> --dry-run

# publish: same command with --apply and CORE_PACKAGES_PUBLISH_TOKEN in the environment
CORE_PACKAGES_PUBLISH_TOKEN=... node packages/core-release/dist/bin.js publish --root . \
  --registry https://npm.pkg.github.com --scope "@<owner>" --core-sha <pin> --apply
```

`--access restricted|public` (default `restricted`) sets package visibility. The dist-tag defaults to `core`; games pin
exact versions, so the tag only matters for people installing by name.

## Switching an instance repository (Open-Games)

`core-release switch` reads the instance repository's pin, rewrites every `file:` or `workspace:` reference to a core
package into the published version, writes a managed registry block into `.npmrc`, and removes the tarballs nothing
points at any more. It keeps `vendor/core.json` (the pin `services/core-bump` maintains) and changes no import in any
source file.

```
node packages/core-release/dist/bin.js switch --dir <instance-repo> --root . \
  --registry https://npm.pkg.github.com --scope "@<owner>"        # dry run: prints the diff
node packages/core-release/dist/bin.js switch --dir <instance-repo> --root . \
  --registry https://npm.pkg.github.com --scope "@<owner>" --apply # writes it
```

The `.npmrc` block the switch writes holds no secret:

```
@<owner>:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

The instance repository's CI supplies `NODE_AUTH_TOKEN` from its own secret (`CORE_PACKAGES_READ_TOKEN`). If the
repository's `.npmrc` says `offline=true`, the switch comments that line out and says so in the plan: a registry install
cannot be offline.

Review the diff the dry run prints, commit it as the one switch pull request, and let the instance repository's own
checks gate the merge. The game's dependencies then install from the registry with lockfile integrity, and no tarball is
carried in git.

## What stays off until the decision

- No package is published, and no release is curated into the catalog (that is CP-01's own acceptance, after this
  preparation).
- No token, secret, or credential is created or committed here.
- The `gm new` scaffolding and the instance template keep their `workspace:*` dependencies until the destination is
  chosen; #444 owns that scaffolding change.
