# Composable versioned packages, discovery, and promotion

**Status:** implementation plan

**Issue:** #391

**Repository evidence:** `main` at `827068e2e85404dfedbb8d8f531438fd7cc7e571`

**Architecture evidence:** `research` at `ef849601a275b730ad42dbc3c9ce0eb697712db2`

## Outcome

Keep the working boundaries already in the repository, make them consumable from the game repositories the platform actually creates, and add one catalog that can describe core, implementation-shared, game-local, and asset-pack components.

The smallest viable shape is:

1. publish immutable TypeScript packages for reusable code instead of copying that code into games;
2. keep raw asset bytes in the host asset library and pin pack snapshots by collection ID and content hash rather than wrapping bytes in npm packages;
3. keep the existing per-game repositories and add an implementation-shared component repository, instead of migrating every game into a new monorepo;
4. make `gm components search` the discovery front door for both core and implementation scopes;
5. use the existing Aiur Command, pull-request, review, and human merge gates for curation and promotion; and
6. preserve the existing showcase output while moving pack interpretation into reusable presentation code, then add a bounded adapter-backed renderer as a later step.

This is a plan only. It does not authorize an external package publication. The first implementation ticket must record the operator-approved package destination before publishing anything.

## Sources and fixed decisions

The comparison target is `docs/plans/2026-11-02-architecture-handoff.md` on `research`, especially §§3–17. The existing decisions not reopened here are:

- `docs/plans/ogm-v1-build/decisions.md` on `research`: D-ASSETS-REFERENCE and D-COMPOSABLE-DEPENDENCIES.
- `docs/research/engine-layering-2026-11-01.md` on `research`: L1 engine, L2 pack adapter, L3 game, and the rule of two.
- `docs/plans/2026-11-02-scope-and-engine-layers-brief.md` on `research`: shared pure showcase core now, adapter-backed browser/headless rendering later.
- The checked-in prototype remains the visual and interaction authority. This plan adds no UI chrome and does not redesign the showcase.
- Aiur remains the orchestration and merge authority. Game Maker gets no second ticket runner, approval store, or merge path.

## Current repository inventory

| Boundary | Current owner | How it is consumed now | Assessment |
| --- | --- | --- | --- |
| Engine API | `packages/sdk` (`@gm/sdk`) | Workspace dependency; subpath exports for core, assets, audio, camera, FX, input, navigation, procedural helpers, saves, Phaser, Three, and others | Broad and useful, but `0.0.0`, private, and not consumable by a copied game repository |
| Shared contracts and bridge | `packages/contracts` (`@ogm/contracts`) and `packages/iframe-bridge` (`@ogm/iframe-bridge`) | Workspace dependencies used by the SDK, CLI, adapters, templates, apps, and services | Real reusable boundaries, but both are `0.0.0` and private; the SDK depends on both |
| Pack presentation | `packages/pack-adapters/{smallscaleint,kaykit,limezu-modern}` | `gm new --set` adds an exact adapter version read from its package manifest | Correct package-per-set boundary; current version is `0.0.0` and all packages still depend on workspaces |
| Optional capabilities | Mostly SDK subpaths; multiplayer behavior also lives in `templates/game-multiplayer` | Template copy plus imports from `@gm/sdk` | No independently versioned capability package or component record |
| Gameplay systems | Game/template source | Copied with the game | No implementation-shared or core gameplay-system package exists |
| Game scaffolds | `templates/game-2d`, `templates/game-3d`, `templates/game-multiplayer` | `packages/gm-cli/src/commands/new/index.ts` copies a template and writes `gm.lock.json` | Good scaffolding boundary, but copied manifests retain unresolved `workspace:*` dependencies |
| Game repositories | `packages/game-repo-template/src/repo.ts`, `services/commit/src/ops/create-repo.ts` | One GitHub repository per game, populated from a template; commit service is the writer | Established V1 model; there is no implementation-wide component repository |
| Asset references | `packages/contracts/src/assets.ts`, `packages/gm-cli/src/commands/assets`, `packages/gm-cli/src/packs` | A game commits `assets.lock.json`; host library stores immutable pack versions and raw files | Strong D-ASSETS-REFERENCE implementation; games do not pin the pack snapshot they were authored against |
| Showcases | `scripts/assets/showcase`, `skills/gm-asset-showcase/SKILL.md` | Node compositor creates baked media; the skill asks the agent to inspect and repair it | Working output path, but pack interpretation is separate from adapters and repair attempts are not bounded by a machine-readable result |
| Component discovery | CLI directory scanner under `packages/gm-cli/src/commands` | Assets, maps, docs, skills, and templates are discoverable through separate commands | No package/component catalog, search, registration, or upgrade command |
| Promotion guidance | `skills/gm-pack-adapter/SKILL.md`, `skills/gm-core/SKILL.md` | Human-readable rule-of-two guidance and PR `## Promote` evidence | Good policy seed, but no cross-repository promotion transaction or migration record |
| Aiur governance | Aiur `website/docs-app/concepts/{executor,commands}.md`, `reference/cli-decisions.md`, `reference/merge-policy.md`, and `docs/security/human-only-merge-gate.md` | Durable Commands, Executor routing, PR review states, CI gates, merge queue, and `aiur pr merge` | Exists; current policy keeps merge authority human-only and should be reused unchanged |

### The immediate break in the handoff

`packages/game-repo-template/src/repo.ts` copies a template out of this monorepo, but every template still declares `@gm/sdk` and `@ogm/contracts` as `workspace:*`. The SDK also declares `@ogm/iframe-bridge` as `workspace:*`. The pack adapters, SDK, contracts, and iframe bridge are private `0.0.0` packages. A standalone game repository therefore has neither an addressable release nor workspace sources for the direct and transitive dependencies.

Package transport and exact game-repository pins are the first dependency. Catalog, promotion, and upgrade work would otherwise describe artifacts that games still cannot install.

## Handoff §§3–15 gap analysis

| Handoff section | Status | Repository evidence | Gap and smallest adjustment |
| --- | --- | --- | --- |
| §3 Asset ingestion spectrum | **Needs adjustment** | `packages/gm-cli/src/packs`, `packages/asset-cards`, three `packages/pack-adapters`, and `scripts/assets/showcase` already separate bytes, metadata, presentation, and games | Formalize the choice: a small pack may stop at cards and a catalog entry; a rich pack may add `@gm/pack-*`; neither needs gameplay. Record the selected level in component metadata. |
| §4 Metadata preservation and enrichment | **Needs adjustment** | Import keeps originals and hashes; cards carry `source`, collection data, and field provenance in `packages/gm-cli/src/packs/cards.ts` | Provenance says who wrote the current normalized field, but an enrichment can replace a normalized source value. Preserve immutable source facts beside derived facts, with conflict state and confidence, before adding new enrichment writers. |
| §5 Automated visual understanding | **Needs adjustment** | `scripts/assets/showcase/verify.mjs` performs structural media checks; `skills/gm-asset-showcase/SKILL.md` requires visual inspection and repair | Keep the existing diorama forms. Add a three-attempt render/inspect/repair budget, a per-attempt result, retained key frames, and successful regression fixtures. Exhaustion is a clear failure, not an unbounded loop. |
| §6 Capability layers | **Needs adjustment** | SDK subpaths and pack adapters exist; templates and games own the rest | Name capability kinds and thresholds. Keep mandatory engine APIs in `@gm/sdk`; split an optional platform capability only when it has an independent lifecycle or heavy dependency; promote renderer-neutral gameplay after two real consumers; keep single-game behavior local. |
| §7 Real package dependencies | **Missing** | Workspace packages are private `0.0.0`; copied game manifests retain `workspace:*`; `gm new --set` can pin only the adapter version it reads locally | Publish immutable artifacts, rewrite scaffolds to exact versions, and make the builder seed those releases. Templates remain scaffolds, not copied capability ownership. Ejection remains an explicit fork, never the default install path. |
| §8 Versioning and upgrades | **Missing** | There is no release cadence, compatibility record, outdated command, migration descriptor, or rollback command for core/adapter packages | Use semantic versions and immutable releases. Games pin exact versions. `gm components outdated` reports compatible targets; `gm components update --to` changes one dependency and records a reversible migration. No automatic upgrades in V1. |
| §9 Asset packs as versioned dependencies | **Needs adjustment** | Pack import rejects changed bytes at an existing version and creates `t<tier>:<pack>@<version>` collection IDs; `assets.lock.json` hashes selected files | Add an exact game-level pack-snapshot map with collection ID plus hash-manifest digest. A wizard update creates a new pack version; the game changes only when an explicit update selects it. Raw bytes stay out of git and npm. |
| §10 Aiur ownership | **Exists** | Aiur Executor, Commands, ticket states, CI policy, merge queue, and human merge command already cover orchestration and authority | Reuse these surfaces. Component work may create tickets, Commands, and PRs, but must not introduce a second queue, daemon, review state, or merge credential. |
| §11 Command requests | **Exists** for governance; **needs adjustment** in `gm` | Aiur supports durable blocking/nonblocking Commands, reversible Executor answers, human-only product/publication/security decisions, and deadlines | `gm components register/promote` should raise or attach an Aiur Command with evidence. Routine catalog curation is reversible and Executor-eligible; package publication destination and product-scope changes remain human-owned. |
| §12 `gm` CLI discovery | **Missing** | CLI has asset, map, pattern, skill, and scaffold discovery, but no component manifest or component commands | Add a federated catalog and `gm components search/info/add/outdated/update/register/promote`. Search core and implementation scopes by default, show compatibility and examples, and require search evidence before creating a reusable package. |
| §13 Core versus implementation repositories | **Needs adjustment** | Core monorepo and per-game repos exist; commit service deliberately provisions one repo per game | Preserve per-game repos. Add one implementation-shared components repository and catalog. Treat that repository plus its consumer game repos as the implementation scope; do not migrate all games into a monorepo merely to match the handoff wording. |
| §14 Upstream contribution without core write | **Needs adjustment** | Rule-of-two skills and normal PR review exist; Aiur prevents self-merge | Add a promotion proposal containing consumers, compatibility, ownership, tests, and migration. The proposing agent opens destination work through normal credentials; it never assumes direct core write or merge authority. After merge, consumers update deliberately and the old record becomes a redirect/deprecation. |
| §15 Skill guidance | **Needs adjustment** | `gm-core`, `gm-pack-adapter`, the three `gm-set-*` skills, `gm-asset-showcase`, and `gm-verify` cover much of the desired policy | Add discovery/version/promotion instructions after commands exist. Fix current per-set skill examples whose export names differ from their actual adapter `src/index.ts` exports. Pin compatibility and migration guidance in the skills. |

## Package and catalog model

### Code packages

| Kind | Naming and scope | Split threshold | Dependency rule |
| --- | --- | --- | --- |
| Mandatory engine | `@gm/sdk`, plus its released `@ogm/contracts` and `@ogm/iframe-bridge` dependencies while those names remain public contracts | Stays together unless an area needs independent releases or materially heavy optional dependencies | Games and released package manifests pin exact versions; supported compatibility ranges live in catalog metadata, while the lock resolves exact artifacts |
| Optional platform capability | `@gm/cap-<capability>` in core scope | Independent lifecycle, permissions, or heavy dependency; multiplayer is the first candidate, not a mandate to split every SDK subpath | May depend on SDK/contracts, never on a game or pack adapter |
| Pack presentation adapter | Existing `@gm/pack-<set>` | A pack needs reusable interpretation, bindings, or presentation beyond cards | May depend on SDK/contracts and renderer peers; no gameplay, UI, narrative, or raw asset bytes |
| Gameplay system | `@gm/system-<capability>` in core; an implementation-owned namespace in implementation scope | Two real games share the same renderer-neutral behavior and API | No Phaser, Three, pack-specific vocabulary, game content, or UI; renderer bindings remain in consumers or thin bindings packages |
| Game-local component | Inside one game repository | Default for exceptional or unproven behavior | Can depend on released components; cannot be discovered outside the game until registered or proposed |

Subpath exports are API organization, not separate versions. Do not split every `@gm/sdk/*` export into a package. A split must buy independent compatibility, upgrade, or dependency behavior.

### Asset packs

An asset pack is a catalog component and immutable host-library snapshot, not an npm package. Its identity is the existing collection ID such as `t1:<pack>@<version>` plus the hash-manifest digest. `assets.lock.json` continues to pin every selected asset and file hash. `gm.lock.json` should gain an additive `assetPacks` map so the authoring context is reproducible even before an individual asset selection changes.

This gives a wizard pack a new version without changing an old game's bytes, and avoids pretending that multi-gigabyte licensed source archives are ordinary code dependencies.

### Component manifest

Use one versioned JSON schema, stored with each authoritative catalog and merged at read time. Each record contains:

- stable ID, display name, kind, and authority scope (`core`, `implementation`, or `game`);
- package name and exact current version for code, or collection ID and digest for an asset pack;
- supported `@gm/sdk` and contract ranges, runtime/renderer requirements, and dependencies;
- capability tags, purpose, constraints, examples, and known consumers;
- owner, source repository, lifecycle (`candidate`, `curated`, `deprecated`), and provenance;
- promotion evidence, replacement/redirect, migrations, and rollback notes.

Core records live in this repository. Implementation records live in the implementation-shared repository. Game-local records are read from the current game only. Search merges the three sources but never changes authority: an implementation record cannot masquerade as core.

Core catalog snapshots ship with the matching `gm` release. An explicit `gm components sync` reads the one implementation repository configured through `@ogm/config`, validates its approved repository identity and commit, and materializes a content-hashed snapshot in the host-local cache used by builders and offline agents. A missing implementation catalog is a valid empty scope; a stale or invalid snapshot produces a visible search warning and cannot replace the last valid snapshot.

Only `curated` records from the two approved catalogs are installable. `candidate` records may appear in search with their status but cannot resolve through `add` or `update`. Package names must match the namespace allowed for their authority scope, and every install verifies the exact version and lockfile integrity. A game cannot supply a catalog URL or elevate its own record to a reusable scope.

### Package transport recommendation

Use an npm-compatible GitHub Packages feed for V1 because the system already depends on GitHub identity, repositories, Actions, and pnpm. Publish from reviewed tags, seed the builder's offline pnpm store, and pin lockfile integrity. This adds no new long-running service.

External publication is a human-owned decision. CP-01 must obtain and record approval of the package owner, visibility, retention, and credential path before enabling publication. If that destination is declined, the fallback is an instance-local npm-compatible feed with the same immutable package contract; do not hide host `file:` paths in game manifests or commit tarballs to game repositories.

Release the exact dependency closure from leaves to consumers: contracts, iframe bridge, SDK, adapters, then catalog metadata. Use a read-only package credential for games and builders and a separate publisher credential available only to the reviewed release workflow; both stay in the existing host/Actions secret stores and are never logged. A catalog version becomes `curated` only after a clean standalone install/build smoke, so a partial publish remains undiscoverable and old catalog snapshots keep working.

## Discovery, registration, and promotion workflow

1. `gm components search <need>` searches core, implementation, and current-game records. Filters include kind, renderer, pack, SDK range, lifecycle, and scope.
2. `gm components sync` refreshes the configured implementation snapshot; `info <id>` shows exact versions, compatibility, dependencies, examples, consumers, provenance, and migration status.
3. `gm components add <id>@<version>` resolves compatibility, changes the game manifest and lock only, and runs the component's focused conformance check. Code delegates to pnpm; an asset-pack record delegates to the existing pack/asset resolver behind the same component command.
4. If no result fits, the agent keeps the behavior game-local and may run `gm components register --scope implementation`. The command writes a proposal, not a catalog record directly.
5. Aiur carries the proposal as a normal ticket/PR and, when a decision is needed, a durable Command. Executor curation may accept reversible catalog changes. External publication, product scope, spend, and security stay human-owned.
6. After two demonstrated implementation consumers, `gm components promote <id> --to core` prepares an upstream proposal with consumer evidence, compatibility, ownership, tests, migration, and rollback. It does not assume core write or merge access.
7. Destination maintainers merge through the existing human review and `aiur pr merge` path. A successful promotion publishes a maintained release, adds a replacement record, and leaves the old implementation version installable.
8. Consumers choose when to run `gm components update`. No promotion or new release silently edits a game.

## Showcase evolution without losing the dioramas

The current Node compositor is a proven authoring path and must remain until parity is demonstrated.

### Stage A — shared presentation capability

Move reusable pack interpretation—vocabulary, roles, animation timing, palette/grouping, scale, camera hints, and scene facts—behind the existing pack adapter exports or a small pure presentation module owned by that adapter. Make `scripts/assets/showcase` consume those public exports and require every scene to name an exact collection version and hash instead of resolving `pack.json.current`. Keep its deterministic stories, layouts, baked GIF/MP4 outputs, and existing visual design.

This makes a rich pack present beautifully without requiring a game, while a tiny pack can remain cards-only.

### Stage B — adapter-backed renderer

Define a renderer-neutral presentation-scene contract and execute it through thin Phaser or Three bindings in a headless browser. Reuse the same adapter facts as games. Keep the Node compositor as the reference/fallback until key-frame and output checks pass for all three current packs.

Every render uses at most three attempts:

1. render and run structural/media checks;
2. inspect named start, contact, reaction, seam, and end frames at desktop and phone sizes;
3. apply a categorized repair and rerender.

Each attempt retains the scene input, tool versions, frames, findings, and result. Three unsuccessful attempts fail with the evidence bundle. Successful bundles become regression fixtures. This bounds repair without changing the number or form of dioramas.

## Five architecture tests

| Test | Expected composition | Proof of success |
| --- | --- | --- |
| Tiny sprite pack stays lightweight | Raw files + collection/cards; optionally a few data-only presentation facts. No adapter, gameplay system, or renderer dependency unless repeated interpretation appears | Importing and cataloging the pack installs no code package. A game pins only its pack snapshot and selected assets. Search still finds it as an asset pack. |
| Rich pack gets excellent presentation without becoming a game | Asset snapshot + `@gm/pack-*` presentation adapter + showcase scene; no game repo and no game rules | The adapter and showcase render the pack's actions, palette, scale, and roles. Package boundary checks reject gameplay/UI/content, and baked outputs pass the bounded visual loop. |
| Wizard pack gains a version without unrelated churn | New immutable collection version and hash; explicit game pack update | An old game rebuilds from the old snapshot. Updating one game changes its `assetPacks` entry and only asset locks affected by actual selections; SDK, unrelated packages, and other games do not move. |
| 2D and 3D RPGs share gameplay without sharing rendering | One renderer-neutral `@gm/system-*`; separate Phaser/Three bindings in the consumers | The system package imports neither renderer nor pack adapter. Contract tests run once, each consumer has a focused integration fixture, and both can pin the same system version. |
| Chess changes without rebuilding unrelated systems | Chess remains game-local until a second real consumer justifies a system package; if promoted, dependencies are explicit | A chess-only change selects the chess repo/tests. A promoted chess-system change selects that package and known consumers, not unrelated SDK, pack, shooter, or RPG tests. The catalog dependency closure explains the selection. |

## Handoff §16 recommendations

| Open item | Recommendation |
| --- | --- |
| Package implementation | TypeScript packages published as immutable npm artifacts for reusable code. Keep mandatory SDK together, adapters per pack, optional capabilities and gameplay systems separate only at the stated thresholds. Asset packs are versioned catalog snapshots, not npm byte bundles. |
| Compatibility assurance | Put SDK/contracts/renderer ranges and dependencies in the component manifest. Enforce them in `gm components add/update`, package conformance CI, and focused consumer fixtures. Test the changed dependency closure rather than every game. |
| Upgrade automation | Provide report-first `outdated` and explicit `update --to`; include migrations, dry-run diff, focused checks, and a lockfile rollback. Do not schedule or auto-apply upgrades in V1. |
| Asset version integrity | Keep immutable pack versions, collection IDs, file hashes, and raw-byte separation. Add exact pack snapshot and hash-manifest pins to the game lock; never reinterpret `current` as a game's dependency. |
| Metadata enrichment | Preserve original files and normalized source facts immutably. Store derived facts separately with field provenance, confidence, tool version, and conflict status; require an explicit resolution to replace an authoritative value. |
| CLI discovery | Add federated `gm components search/info/add` across core, implementation, and current-game scopes. Include code, presentation adapters, and asset packs in one query model while preserving their different install mechanisms. |
| Exceptional game needs | Default to game-local code. Let an agent register an implementation candidate only after searching and recording why existing components do not fit. No core write is assumed. |
| Promotion workflow | Use rule-of-two evidence, an Aiur ticket/Command, a destination PR, human merge, a maintained release, and explicit consumer migration. Preserve the old version and publish a redirect/deprecation instead of deleting it. |
| Existing implementation | Fix package transport first; retain SDK/contracts, three adapter packages, asset library, showcase, per-game repos, commit service, and Aiur governance. Add an implementation-shared repository and catalog rather than replacing those working systems. |

## Dependency-ordered ticket drafts

The IDs below are planning identifiers, not assigned GitHub issue numbers. Each draft follows the repository ticket shape and should be copied into an issue only when scheduled.

### CP-01 — Publish versioned core packages to standalone games

**Kind:** platform contract

**Complexity:** 3

**Risk:** high

**Depends on:** operator approval of external package destination (human-owned publication decision)

**Outcome:** `@gm/sdk`, `@ogm/contracts`, `@ogm/iframe-bridge`, and current `@gm/pack-*` releases are immutable and installable by the standalone repositories the commit service creates.

**Scope:** choose and document the approved npm-compatible destination; add leaf-to-consumer reviewed-tag publishing for the complete reusable dependency closure; replace template and released-package `workspace:*` dependencies with exact released versions; teach `gm new` and the game-repo copier to resolve exact versions; diagnose and migrate any existing game manifest that still carries a workspace pin; seed the builder's pnpm store. Do not publish raw assets or redesign package APIs.

**Acceptance:** a freshly provisioned 2D game and 3D game install, typecheck, test, and build outside the monorepo with no workspace link; a legacy workspace-pinned game migrates once; dependencies publish before consumers and the catalog updates only after the standalone smoke; an old version remains installable; lockfiles contain integrity; publisher and read-only credentials are distinct and no token is committed or logged.

**Surfaces:** package manifests, release workflow, `packages/gm-cli/src/commands/new`, `packages/game-repo-template`, builder store seeding, setup docs.

### CP-02 — Define the component catalog contract

**Kind:** shared contract

**Complexity:** 2

**Risk:** medium

**Depends on:** none; coordinate release fields with CP-01

**Outcome:** one schema represents core, implementation, game-local, and asset-pack components without conflating code installation with asset resolution.

**Scope:** add a contract family for the fields in “Component manifest”; add core catalog records for SDK, contracts, iframe bridge, and three adapters; validate ownership, stable IDs, compatibility, dependency cycles, examples, replacements, and asset digests. Keep `packages/contracts/src/index.ts` append-only.

**Acceptance:** valid core and asset records parse; wrong authority, cycles, missing compatibility, and mutable asset references fail focused tests; catalogs have deterministic ordering and a schema version.

**Surfaces:** `packages/contracts`, a core catalog directory, synthetic fixtures, contract documentation.

### CP-03 — Establish the implementation-shared component repository

**Kind:** repository boundary

**Complexity:** 3

**Risk:** high

**Depends on:** CP-01, CP-02

**Outcome:** implementation-owned packages and catalog records have a maintained home without moving or copying existing game repositories.

**Scope:** bootstrap one `<implementation-components-repo>` through an operator-approved GitHub provisioning path with a pnpm workspace, catalog, package template, CI, CODEOWNERS, and release policy. Reuse normal Aiur PR/review/merge flow. Configure the host to sync its read-only catalog snapshot; the commit service continues to own game repositories and does not become the component-repository writer. Do not create another daemon or give game agents core write access.

**Acceptance:** a synthetic implementation package publishes, is read by a standalone game, and cannot edit the core catalog; per-game repo creation and release behavior remain unchanged.

**Surfaces:** implementation repo template, host catalog configuration/cache, builder package credentials, operator docs; commit-service game-repo behavior is regression coverage only.

### CP-04 — Add federated `gm components` discovery and install

**Kind:** CLI capability

**Complexity:** 3

**Risk:** medium

**Depends on:** CP-01, CP-02, CP-03

**Outcome:** agents search before building and can add a compatible released component from either reusable scope.

**Scope:** implement `sync`, `search`, `info`, and `add`; bundle the core snapshot, validate and cache one configured implementation snapshot, and merge those with current-game records; filter by kind/scope/renderer/pack/SDK; show provenance, lifecycle, versions, dependencies, examples, and migrations; install only curated code through pnpm and curated asset packs through the asset resolver.

**Acceptance:** absent implementation scope behaves as empty; failed sync retains the last valid snapshot with a warning; unapproved origins, namespace/scope mismatches, candidate installs, and duplicate IDs fail closed; incompatible results explain why; `add` produces a minimal manifest/lock diff and runs the component check; offline seeded search works.

**Surfaces:** `packages/gm-cli/src/commands/components`, catalog readers, fixtures, CLI reference.

### CP-05 — Pin asset-pack snapshots in game locks

**Kind:** asset integrity

**Complexity:** 2

**Risk:** medium

**Depends on:** CP-02; command integration follows CP-04

**Outcome:** games explicitly retain the pack version and hash manifest used during authoring, alongside the existing per-asset hashes.

**Scope:** add an additive `assetPacks` map to `gm.lock.json`; add asset-pack handling behind `gm components add/outdated/update`; resolve collection IDs rather than `pack.json.current`; keep operator-facing pack intake commands, `assets.lock.json`, and D-ASSETS-REFERENCE intact.

**Acceptance:** two wizard versions coexist; an old game resolves the old version; an explicit update changes only the selected pack entry and genuinely changed asset selections; missing or mismatched hashes fail before build.

**Surfaces:** contracts, packs/assets CLI, build-assets resolver, game lock fixtures and docs.

### CP-06 — Preserve source and enrichment metadata separately

**Kind:** metadata integrity

**Complexity:** 2

**Risk:** medium

**Depends on:** CP-02

**Outcome:** enrichment can improve discovery without erasing what the imported pack actually said.

**Scope:** define immutable normalized source facts and derived facts with provenance, confidence, tool version, timestamp, and conflict state; migrate card generation additively; define deterministic resolution precedence. Do not rewrite raw originals or silently accept conflicts.

**Acceptance:** fixtures retain both disagreeing values; readers can select the authoritative value and explain it; re-running the same enrichment is idempotent; legacy cards still parse.

**Surfaces:** asset-card/contracts schemas, `packages/gm-cli/src/packs/cards.ts`, enrichment tools, fixtures and docs.

### CP-07 — Add compatibility reports and deliberate upgrades

**Kind:** lifecycle tooling

**Complexity:** 3

**Risk:** medium

**Depends on:** CP-01, CP-02, CP-04, CP-05

**Outcome:** games see compatible releases and choose a reversible update instead of receiving silent churn.

**Scope:** implement `gm components outdated`, `update --to`, and `update --dry-run`; evaluate SDK/contracts/renderer/dependency ranges; apply declared migrations; run dependency-closure checks; retain a one-command lockfile rollback. No scheduled or automatic update.

**Acceptance:** incompatible targets are refused with a dependency explanation; a compatible update changes only its closure; rollback restores the prior build; wizard-pack updates use CP-05 rather than npm.

**Surfaces:** gm CLI, component resolver, migration fixtures, game check selection, CLI docs.

### CP-08 — Share pack presentation with the existing showcase

**Kind:** adapter refactor

**Complexity:** 3

**Risk:** medium

**Depends on:** CP-01, CP-02

**Outcome:** the three existing showcases and games consume the same public pack interpretation while their current baked appearance remains unchanged.

**Scope:** expose pure presentation facts from each adapter; remove duplicate pack knowledge from the Node showcase; replace its `pack.json.current` lookup with exact collection versions and hashes in scene inputs; retain story/layout/render code and current GIF/MP4 pipeline; add snapshot/key-frame parity fixtures. Do not introduce gameplay or browser rendering yet.

**Acceptance:** all three showcase outputs rebuild from pinned pack versions and pass current structural and visual checks even after a newer pack becomes current; adapter boundary tests remain themeless and gameplay-free; a cards-only tiny pack still needs no adapter.

**Surfaces:** three adapter packages, `scripts/assets/showcase`, showcase fixtures, adapter READMEs.

### CP-09 — Add bounded adapter-backed showcase rendering

**Kind:** visual verification

**Complexity:** 3

**Risk:** high

**Depends on:** CP-08

**Outcome:** rich packs can render reusable presentation scenes through real engine bindings without becoming games, and repair always terminates with evidence.

**Scope:** add the renderer-neutral scene contract, headless Phaser/Three executors, three-attempt controller, retained key frames/findings, and successful regression bundles. Keep Node rendering as fallback until each current pack reaches parity; baked media remains the client artifact.

**Acceptance:** one 2D and one 3D pack render through adapters; forced defects show repair then success or deterministic exhaustion; attempt four cannot run; outputs retain the fixed diorama design.

**Surfaces:** showcase contract/runtime, adapter bindings, `gm-verify` integration, browser tests and fixtures.

### CP-10 — Register and promote components through Aiur

**Kind:** governance workflow

**Complexity:** 3

**Risk:** high

**Depends on:** CP-03, CP-04, CP-07

**Outcome:** an exceptional game capability can become implementation-shared and later core without assuming core write or merge authority.

**Scope:** implement `register` and `promote`; generate evidence packets with search results, consumers, compatibility, ownership, tests, migration, and rollback; create normal Aiur work and Commands; open destination PRs; publish replacement/deprecation records after merge. Reuse current human-only merge gates.

**Acceptance:** a synthetic game-local component reaches implementation scope after review; a two-consumer candidate creates a core proposal but cannot merge itself; rejected promotion leaves the old component installable; accepted promotion guides explicit consumer updates.

**Surfaces:** gm CLI, Aiur event/Command adapter, catalog proposal schema, PR templates and governance docs.

### CP-11 — Align skills and prove the five architecture tests

**Kind:** guidance and capstone

**Complexity:** 2

**Risk:** low

**Depends on:** CP-05 through CP-10

**Outcome:** agent guidance matches the shipped commands and exports, and the five tests in this plan are executable evidence rather than prose.

**Scope:** update `gm-core`, `gm-pack-adapter`, `gm-asset-showcase`, `gm-verify`, and the three `gm-set-*` skills; correct stale adapter export examples; require search-before-build, exact pins, bounded repair, upgrade review, and promotion evidence; add synthetic tiny/rich/wizard/2D+3D/chess fixtures.

**Acceptance:** each skill command/example resolves; the five architecture tests pass from clean standalone fixtures; reverting the relevant capability makes each test fail; skill validation rejects an undocumented new reusable package.

**Surfaces:** `skills/`, `.claude/skills/` mirrors where applicable, component fixtures, package/CLI conformance checks.

## Delivery order and gates

1. Run CP-01 and CP-02 as the foundation. CP-01 waits only on the external-publication destination; CP-02 can proceed independently.
2. Add the implementation scope in CP-03, then discovery in CP-04.
3. Run CP-05, CP-06, and CP-08 once their listed contracts exist; their files and concerns are independent.
4. Build upgrade behavior in CP-07 and browser/headless presentation in CP-09.
5. Add cross-scope promotion in CP-10 only after install, compatibility, and rollback are real.
6. Finish with CP-11 so skills describe shipped interfaces and the five architecture tests cover the final graph.

The plan is done when standalone games consume exact released packages, both catalogs are searchable, asset snapshots are reproducible, upgrades and promotion are explicit and reversible, the showcase shares adapter facts with a bounded repair loop, and all five tests pass without adding another orchestration or merge system.
