# Core packages: publishing and instance installs

Prepared for CP-01 (#490) by #545. **Nothing is published, and this document creates no token.** It describes the
switch that is already in the repository and the steps only Kevin can take to turn it on.

The first instance game (the `open-games` repository, ticket #2 there) vendors release tarballs of the core packages
today. This page is how that stops being necessary: one decision, one workflow run, one pull request in the instance
repository.

The destination is decided (Kevin, 2026-11-06, on #545: "we use npm.js for all aiur packages, use that"): the **public
npm registry**, `https://registry.npmjs.org`, publishing with **npm OIDC trusted publishing** so no npm token exists at
all. The releases are public packages under one npm org scope.

## What already exists

| Piece | Where | What it does |
| --- | --- | --- |
| Release workflow | `.github/workflows/publish-core-packages.yml` | `workflow_dispatch` only. Takes the registry URL and scope as inputs and **defaults to a dry run**. |
| Release tool | `packages/core-release` | Stages and packs the core dependency closure, leaves first, and publishes it. `--dry-run` unless `--apply`. |
| Switch tool | `packages/core-release` (`core-release switch`) | Plans the move of an instance repository from vendored tarballs to registry versions and records the released version set. Dry run by default. |
| Diagnosis tool | `packages/core-release` (`core-release diagnose`) | Read-only report of what would stop a game install in an instance or standalone game repository; exits 1 on an error. |
| Scaffolding | `packages/gm-cli` (`gm new`) | Replaces a template's local core dependencies with the release set's specifiers when the game lands in an instance repository. |
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

## The destination and the scope

| Field | Value | Why |
| --- | --- | --- |
| Registry | `https://registry.npmjs.org` | Kevin's decision on #545/#490. |
| Access | `public` | The packages are already in this public repository; a game installed from an instance repo needs no npm credential. |
| dist-tag | `core` | Consumers pin exact versions; the tag only matters for people installing by name. |
| Scope | `@open-game-maker` | See the scope check below. |

### Which scope is free (checked 2026-11-06)

npm scopes are owned by an account or an org and are never released. `npm view` only proves that a *package name* is
unpublished, not that its scope is unowned, so each candidate was checked against the registry's org lookup
(`https://registry.npmjs.org/-/org/<scope>/user`, which answers `{"error":"Scope not found"}` for a name nobody owns):

| Scope | Registry answer | Usable |
| --- | --- | --- |
| `@gm` | owned by another account | no |
| `@ogm` | owned by another account | no |
| `@aiur` | an existing org with no visible members or packages | risky |
| `@open-game-maker` | `Scope not found` | **yes — recommended** |
| `@open-game-maker-2000` | `Scope not found` | yes, fallback |

`@gm` and `@ogm` are taken, so the releases cannot keep their source names. They publish under the destination scope
with the basename kept — `@gm/sdk` → `@open-game-maker/sdk`, `@ogm/contracts` → `@open-game-maker/contracts` — and games
keep importing `@gm/sdk` because the switch writes an `npm:` alias in the game's manifest
(`"@gm/sdk": "npm:@open-game-maker/sdk@0.0.0-core.<sha12>"`). A different scope only changes the input.

## Steps to unblock

Only Kevin does these. No agent creates the org, the trusted publisher or a token, and none of this is committed.

1. **Create the npm org** on [npmjs.com](https://www.npmjs.com) → your avatar → Organizations → Create organization,
   named `open-game-maker` (the scope becomes `@open-game-maker`). You must be an owner of it. This is the only account
   action the release needs; there is no npm token to create, store or rotate.
2. **Create each package's trusted publisher.** On npmjs.com → Packages → the package → Settings → Trusted Publisher →
   Add trusted publisher → GitHub Actions, with:
   - Organization or user: `<owner>` (the GitHub account that owns this repository)
   - Repository: `open-game-maker`
   - Workflow filename: `publish-core-packages.yml` (the filename only, no path; case-sensitive, `.yml` included)
   - Environment name: leave empty unless you add a GitHub environment to the workflow
   - Allowed actions: `npm publish`

   The package page only exists once the name does. For the first release of a name that has never been published,
   either publish that first version once from your own machine with a granular access token (delete the token right
   afterwards) or use npm's trusted-publisher form for an unpublished package if your org's page offers it. Every
   later version comes from the workflow with no token.

   npm does **not** validate the configuration when you save it; a wrong repository or filename only shows up at publish
   time. Each package needs its own entry, so this is six entries today: `sdk`, `contracts`, `iframe-bridge`,
   `pack-kaykit`, `pack-limezu-modern`, `pack-smallscaleint`.

   A new trusted publisher must complete its first successful publish within **2 days** or it expires and cannot be
   edited — delete it and create a new one.
3. **Run the workflow as a dry run** (Actions → "publish core packages" → Run workflow, `dry_run` checked, and
   `verify_oidc` checked once step 2 is done). It prints the plan — every package, its published name, version, files,
   size and integrity, in publish order — and with `verify_oidc` it also runs `npm publish --dry-run` per package and
   reports whether the trusted publisher answered. Nothing is published either way.
4. **Publish**: run the same workflow with `dry_run` unchecked and `core_sha` set to the commit Open-Games pins in its
   `vendor/core.json`. Leave `core_sha` empty only when the dispatched branch head *is* the pin.
5. **Tighten afterwards** (recommended, optional): on each package's Settings → Publishing access choose "Require
   two-factor authentication and disallow tokens". Trusted publishers keep working; only long-lived tokens stop.
6. **Switch Open-Games in one pull request** (see below).

The equivalent commands, from a checkout of this repository after `pnpm install --frozen-lockfile && pnpm -r build`:

```
# dry run: stages and packs everything, publishes nothing, needs no credential
node packages/core-release/dist/bin.js publish --root . --dry-run

# prove the trusted publisher for every package; still publishes nothing
node packages/core-release/dist/bin.js publish --root . --verify-oidc --dry-run

# publish: same command with --apply. Run it in the workflow, not on a laptop: OIDC only works from CI.
node packages/core-release/dist/bin.js publish --root . --core-sha <pin> --apply
```

Registry, scope and access default to `https://registry.npmjs.org`, `@open-game-maker` and `public`; `--registry`,
`--scope` and `--access public|restricted` override them. A publish run reads no token when the registry is npmjs.org:
the npm CLI exchanges this workflow's OIDC token for a short-lived credential, which is why the publish job carries
`id-token: write` and no secret. A token in `CORE_PACKAGES_PUBLISH_TOKEN` is only used for a registry without a trusted
publisher. The tarballs set `repository.url` from `GITHUB_REPOSITORY`, because npm compares it with the repository the
trusted publisher names.

Two npm details the workflow already handles: npm must be 11.5.1 or newer for trusted publishing (the workflow asserts
it), and `actions/setup-node` must not be given `registry-url` — that writes an empty `_authToken` into `.npmrc`, npm
then believes auth is already configured, skips the exchange and fails with a misleading `ENEEDAUTH`
(actions/setup-node#1551).

## Switching an instance repository (Open-Games)

`core-release switch` reads the instance repository's pin, rewrites every `file:` or `workspace:` reference to a core
package into the published version, writes a managed registry block into `.npmrc`, records the released version set in
`vendor/core-packages.json`, and removes the tarballs nothing points at any more. It keeps `vendor/core.json` (the pin
`services/core-bump` maintains) and changes no import in any source file.

```
node packages/core-release/dist/bin.js switch --dir <instance-repo> --root .          # dry run: prints the diff
node packages/core-release/dist/bin.js switch --dir <instance-repo> --root . --apply # writes it
```

The `.npmrc` block the switch writes holds no secret — the release packages are public, so an install needs no
credential:

```
@open-game-maker:registry=https://registry.npmjs.org
```

A `--access restricted` switch adds `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` for a private destination.
The token line stays out of a public switch on purpose: pnpm cannot substitute an unset variable, and when it cannot it
skips the rest of the file — including the scoped registry line — so the install silently falls back to the default
registry. If the repository's `.npmrc` says `offline=true`, the switch comments that line out and says so in the plan: a
registry install cannot be offline.

Review the diff the dry run prints, commit it as the one switch pull request, and let the instance repository's own
checks gate the merge. The game's dependencies then install from the registry with lockfile integrity, and no tarball is
carried in git.

### The released version set

`vendor/core-packages.json` records, per core package, the exact specifier a game installs at that pin:

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

Its `core.sha` must equal the pin in `vendor/core.json`; a set from another commit is stale. The values are what a
game's manifest installs, so `gm new` needs no destination scope of its own. When the pin moves — `services/core-bump`
updates `vendor/core.json` — re-run the switch so the set follows the pin; `core-release diagnose` reports the stale
pair until you do.

### Scaffolding a game

`gm new <template> <slug>` in an instance repository replaces a template's local core dependencies with the set's
specifiers and leaves instance-owned `workspace:*` links (`@game/*`, `packages/*`) untouched. It also records the core
commit and registry in the game's `gm.lock.json`. An instance repository that has no set yet keeps the template's
`workspace:*` core links and `gm new` prints how to get the released ones; a set that does not list a core dependency
the template needs refuses rather than scaffolding a game that cannot install.

The core repository's own templates keep `workspace:*`: its tests and browser runs link the core sources, and the
substitution happens when a game lands in an instance repository.

### Diagnosing a repository

```
node packages/core-release/dist/bin.js diagnose --dir <instance-repo>            # read-only, exits 1 on an error
node packages/core-release/dist/bin.js diagnose --dir <instance-repo> --online   # also asks the registry
```

It reports a core dependency still using `file:`/`workspace:`, a missing, malformed or stale version set, a specifier
that drifted from the set, a core package the set does not list, an `.npmrc` without the registry block or with
`offline=true`, tarballs nothing references, and lockfile entries without the destination name or its integrity. Run it
in the instance repository's CI so a game that cannot install fails there instead of at a builder's first install.

### Migrating a legacy standalone game

A game repository that keeps its game at the root and has no `vendor/core.json` switches once on an explicit commit:

```
node packages/core-release/dist/bin.js switch --dir <standalone-game> --core-sha <40-hex>          # prints the diff
node packages/core-release/dist/bin.js switch --dir <standalone-game> --core-sha <40-hex> --apply  # writes it
```

The switch reads the root `package.json` as well as one level under `games/` and `packages/`, so the same command
migrates both layouts. The standalone repository gets the same `vendor/core-packages.json`, which is then its only
record of the core commit.

### Seeding the builder's offline store

Sandboxed game commands have no network, so a game's install comes from the seeded pnpm store. After a release, add the
published core packages to it once on the host:

```
bash scripts/sandbox/seed-store.sh --core <instance-repo>
```

It reads that repository's release set and adds each destination name at its exact version, so a sandboxed
`pnpm install --offline` resolves the game's core dependencies without network. Re-run it after every core release.

## What stays off until the trusted publishers exist

- No package is published, and no release is curated into the catalog (that is CP-01's own acceptance, after this
  preparation).
- No npm token, GitHub secret or credential is created or committed here. The only credential in play is the OIDC token
  GitHub Actions issues for the workflow run itself.
- The core repository's own templates keep their `workspace:*` dependencies, because its tests and browser runs link the
  core sources. An instance repository's games get the released specifiers from `vendor/core-packages.json` as soon as
  the switch runs there.
