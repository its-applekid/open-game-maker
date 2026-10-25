# A5: releases, saves, achievements, analytics and rewind (R08, R09, R10, R11, R14)

**Status:** Research report. Everything here is **Proposed** unless the spec already marks it Decided. Accessed 2026-10-21.
**Scope:** This report covers platform capabilities that plug into the Engine SDK. The SDK and editor contract itself belongs to A4. Where a capability needs something from the SDK, it is marked **[SDK hook]** and not designed further here.
**Spec anchors:** §5.12–5.17, §7.6, §9.4, §11.4 (R08/R09/R10/R11/R14), §15.4.

> **Version scope (2026-10-25):** Releases (R08), saves (R09), basic achievements (R10) and aggregate creator analytics (R11) are **V1**. Gameplay rewind (R14, §6) is **V2** (Decided), as are multiplayer upgrades, friends' achievements and cross-game analytics. Child saves, the child column of the analytics matrix, supervisor views and COPPA retention are **V3**, tagged inline.
> The kid-first framing is superseded: V1 players and creators are all adults (18+). Since this report, Kevin decided cloud autosave plus three manual slots (D2) and creator-only forks that copy the design but no runtime data (D5).
> Superseded in part: build storage, `assetManifest` and retention (D3) by **B6**; §2.9 overrides while builds run by **B7**; child analytics, saves and retention by **B3** (now V3).
> Canonical scope: `docs/spec/release-plan.md`.

---

## 0. Summary of recommendations

| Spike | Recommendation | MVP slice | Later |
|---|---|---|---|
| R08 Releases | Build once into an **immutable build**. Keep a **published-release pointer** in Postgres, separate from Git `main`. The release log is append-only and monotonic, so a rollback is published as a **new release**. The platform shell checks the pointer and shows an update badge with the changelog. | Builds, pointer, Publish button, suggested semver bump, changelog assembled without a model call, update badge, refresh loads latest, rollback | Coordinated upgrades for multiplayer rooms, shared draft previews, offline service worker |
| R09 Saves | Each slot is a sequence of **revisions**. Writes are **optimistic-concurrency (OCC)** compare-and-set on a revision number, plus a **device lease** per user and game. An **IndexedDB outbox** queues saves locally. Migration is **lazy, one step, at load time**, and runs only from the previous release's save schema. The raw pre-migration revision is kept. | Autosave plus N manual slots, If-Match revisions, lease takeover, "Saved on this device" vs "Saved to cloud" status, previous-release migration with fixture tests, rollback marks saves incompatible but deletes nothing | Long offline play, export, conflict-merge UI |
| R10 Achievements | **Permanent account-level awards** (Steam, Xbox and PlayStation model). Keys are stable slugs declared in a game manifest. Awards are idempotent through a unique key. The client reports an award and the server validates it against the published catalog. | Manifest, award API, per-game catalog UI, award toast, no awards in drafts | Browsing friends' achievements, progress achievements, room-authoritative awards in multiplayer, global unlock percentages |
| R11 Analytics | **Plain Postgres event table plus daily rollups.** The platform emits session, time and version events automatically. The SDK adds a small `attempt`/`marker` vocabulary that works across genres. Do not use PostHog. | Automatic platform events, attempt/marker API, one creator dashboard | Admin cross-game views, comparing releases, cohort charts |
| R14 Rewind | **Ring buffer of state snapshots** of the SDK's logical state, plus a Rapier `takeSnapshot()` when Rapier is used. Do not rely on input replay, because agent-generated games will not be deterministic. | V2 (Decided). In the MVP, only reserve the hooks: seeded RNG, fixed timestep, explicit logical state. | The whole feature |

---

## 1. Prior art: what was checked

| Source | Verified fact (accessed 2026-10-21) | What it means for us |
|---|---|---|
| Nakama storage docs (heroiclabs.com/docs/nakama/concepts/storage/collections) | Every object has a `version`. A write that passes the last-seen version is conditional. Version `"*"` means "writes the object only if none already exists". A mismatch fails with "Storage write rejected - version check failed" and the **whole batch** is rejected. Versioning covers the whole object, so the docs advise splitting hot keys. `StorageWriteRetry` retries up to 10 times. | This is the OCC model to copy. Keep each slot its own object so slots never conflict with each other. |
| Roblox DataStore docs (create.roblox.com …/data-stores, …/versioning-listing-and-caching) | `UpdateAsync` takes a transform callback, and returning nil cancels the write. It reads the latest value before writing. Versions are kept **per key per UTC hour**: "Successive writes to a key in the same UTC hour permanently overwrite the previous data." Overwritten versions expire after 30 days, and the latest never expires. `GetAsync` can be stale because of caching. | Hourly backup versions are a cheap way to get "recovery copies". A server-side transform doesn't fit us, because the game state comes from the client. Session locking is a community pattern (ProfileService/ProfileStore), **not covered on the official page; unverified here**. |
| PlayFab GetUserData (learn.microsoft.com, API version 260922) | `DataVersion` "is incremented with every set call". `IfChangedFromDataVersion` is a **read filter**. | It detects change but is not a conditional write. I found no expected-version parameter on UpdateUserData (**unverified negative**). This is weaker than Nakama, and shows why we need real compare-and-set. |
| Steamworks Achievements (partner.steamgames.com/doc/features/achievements) | `SetAchievement` for each unlock, then `StoreStats` to upload. Set calls "only modify Steam's in-memory state and are very cheap". `IndicateAchievementProgress` shows a progress popup. Global unlock percentages are available. There is a `ResetAllStats(bAchievementsToo)` call and a dev console `achievement_clear`. | This is the shape to copy: client sets the award, it is batched and stored, and there are progress pings. The page **does not cover** idempotency or deletion semantics. "Achievements are permanent" comes from general knowledge (**unverified**). |
| Steam Cloud (partner.steamgames.com/doc/features/cloud) | Syncs "before and after every session". Changed files upload after the session. Dynamic Cloud Sync uploads at suspend. The docs advise small files split by how often they change. | Sync at session boundaries is too coarse for a browser tab that can be killed at any time, so we sync more often. The conflict dialog with timestamps is **not on this page; from memory, unverified**. |
| Xbox and PlayStation trophies | **Not fetched** (the Xbox docs URL returned 404). From general knowledge: unlocks are permanent and not revoked in retail. Xbox also has stat- or event-based unlocks evaluated by the service. | Supports permanent awards. A server evaluating events is the later upgrade path for multiplayer. |
| Super Mario Maker 2 (Guinness record, Gigazine 2019) | Course pages show attempts and clears (e.g. 35 clears in 19,569,423 attempts), clear rate, fastest clear time, and likes. Other players' death spots appear as crosses. | Attempts, clears, clear rate and **where people fail** are what Kevin liked. That maps onto `attempt` plus `marker`. |
| Braid (GDC Vault session 1012210, 2010) | The design required rewinding 30–60 minutes in about 40 MB on consoles. **The keyframe/delta method itself was not verified** because the talk video wasn't accessed. | Our 10-second window is tiny by comparison, and naive snapshots fit easily. |
| GGPO (`pond3r/ggpo` @7ddadef, MIT, 3.6k★, last push 2024-06) | The callback contract is `save_game_state(buffer,len,checksum,frame)`, `load_game_state`, `advance_frame`, `free_buffer`. | Even input-replay rollback needs save and load of state. So **state capture is needed no matter which rewind approach we pick**. Determinism is what makes replay possible, and our games won't have it. |
| Rapier (`dimforge/rapier` @475caa3, Apache-2.0, 5.9k★) | The JS repo `dimforge/rapier.js` is **archived** and moved to `rapier/bindings/typescript`. `World.takeSnapshot(): Uint8Array` and `static World.restoreSnapshot(data): World`, which returns a **new** World. The docs say Rapier is "locally deterministic" by default, and cross-platform deterministic only with the `enhanced-determinism` build plus IEEE-754 targets. | Snapshots work. When a world is restored, the game must re-bind its references to the new World and free the old one. |
| vite-plugin-pwa prompt-for-update docs | Prompting is the default `registerType`. `onNeedRefresh` shows the prompt, `updateSW()` applies it, and the docs say keep `cleanupOutdatedCaches` on. | Copy the UX ("new version, see what changed, update"). We don't need a service worker to get it (§2.4). |
| PostHog self-host docs, LICENSE | The code is MIT except `ee/`. The hobby deploy needs "4 vCPU, 16GB RAM, >30GB" and runs ClickHouse, Kafka, ZooKeeper, Redis, Postgres and MinIO. It is "officially unsupported". | Too heavy for an invite-only Railway project. PostHog Cloud would send gameplay data to a new vendor, which needs separate approval (for children's data, §10 forbids it: V3). |

**Libraries checked (via `gh api` and `npm view`, 2026-10-21)**

| Library | Version | License | Stars | Note |
|---|---|---|---|---|
| idb | 8.0.4 | ISC | 7.4k | Thin promise wrapper over IndexedDB. **Pick this for the save outbox.** |
| Dexie | 4.4.6 | Apache-2.0 | 14.7k | Heavier alternative. |
| @dimforge/rapier2d/3d-compat | 0.21.0 (2025-09-25) | Apache-2.0 | 5.9k | Has snapshot support. A `-deterministic-compat` variant also exists. |
| planck | 1.5.1 | MIT | 5.3k | Has `src/serializer`. |
| matter-js | 0.20.0 (last change 2024-06) | MIT | — | No serializer found in core. If a game uses it, the SDK must capture body state by hand. |
| phaser | 4.2.1 | MIT | 40.5k | — |
| three | 0.186.1 | MIT | 116.7k | — |
| immer | — | MIT | 29k | Optional, for structural sharing in rewind. |
| vite-plugin-pwa | 2.0.0 | MIT | 4.3k | — |
| workbox-window | 7.4.1 | MIT | — | — |
| @changesets/cli | 3.0.3 | MIT | 12.5k | — |
| semantic-release | 25.0.9 | MIT | 24.1k | — |
| posthog-js | 1.438.13 | Apache-2.0 AND MIT | — | — |
| Umami | v3.4.0 | MIT | 39.5k | Built for page views, not gameplay. |
| Plausible | — | AGPL-3.0 | — | — |
| pg-boss | 12.38.0 | MIT | 4.1k | For the rollup and retention jobs, unless A-infra picks another job runner. |
| graphile-worker | 0.18.0 | MIT | 2.4k | Alternative to pg-boss. |

All of these clear the ≥1k-star rule except the `rapier.js` repo itself (698★, archived). Its parent repo `dimforge/rapier` has 5.9k★, so that is the one to cite.

---

## 2. R08: draft, publish, live updates, release metadata

### 2.1 Requirement
- Players stay on the published release while the creator tests a draft.
- Publish is an explicit action.
- Players see a live update badge without refreshing, and the update is opt-in.
- Refreshing loads the latest published release, never a draft.
- Releases have semver numbers and changelogs.
- A creator can roll back to any earlier published release, and it costs no tokens.
- Old builds are not supported forever.

### 2.2 Mapping Git, builds and the pointer (three alternatives)

| | A. `main` = published | B. **`main` = accepted draft line; pointer = published (recommended)** | C. Release branches |
|---|---|---|---|
| Publish | Merge the draft branch into `main`, then deploy `main`. | Atomically update `games.published_release_id` to a release row that references an already-built, already-tested immutable build. Add a Git tag `gm/<gameId>/v1.4.0`. | Cut a `release/x` branch. |
| Draft isolation | Fragile. Any merge to `main` from agent automation goes live. | Strong. Agents merge freely to `main` and the pointer doesn't move. | Strong. |
| Rollback | Revert commits (non-deterministic, may conflict). | Point a **new release row** at the old build. If that build was garbage-collected, rebuild it from the tag. | Check out the old branch. |
| Kevin's "refresh loads main" | Matches literally. | Matches what he meant (refresh loads the latest *published* release). §9.4 explicitly allows this. | Same as B. |
| Fits aiur (scripted PR and merge) | — | Fits well. aiur's PR and merge flow stays the same, and publishing is a separate deterministic step. | Adds branch sprawl. |

**Recommendation: B.** Option B separates "code was accepted" from "players see it". The published state is then one row change that can be audited, so publish and rollback cannot conflict at merge time.

### 2.3 Data model (illustrative)

```ts
// One build per tested commit. Immutable. Served at /g/{gameId}/b/{buildId}/...
type Build = {
  id: string; gameId: string; gitSha: string;
  sdkVersion: string;          // pinned SDK, so a rebuild is reproducible
  saveSchemaVersion: number;   // declared by the game, separate from semver
  migratesFromSchema?: number; // exactly one step, or none
  achievementCatalogHash: string;
  assetManifest: { path: string; sha256: string; bytes: number }[];
  status: 'building' | 'tested' | 'failed';
  artifactState: 'present' | 'gc' ; // gc: can be rebuilt from gitSha
  createdAt: Date;
};

type Release = {               // append-only; never edited or deleted
  id: string; gameId: string; seq: number; // seq is monotonic per game
  semver: string;              // unique per game
  buildId: string;
  kind: 'publish' | 'rollback';
  restoresReleaseId?: string;  // set when kind = 'rollback'
  predecessorReleaseId?: string; // the release that was live just before; defines "previous" for migration
  changelog: { summary: string; items: { kind: 'fix'|'add'|'change'|'remove'; text: string }[] };
  publishedBy: string; publishedAt: Date;
};

// games.published_release_id: the only thing "refresh" and "update available" ever read.
```

Drafts are builds that no release references. A preview is an authenticated URL `/play/{gameId}?build={buildId}`, restricted to the owner, and to the owner's guests later (§5.16).

### 2.4 Live updates and active sessions
- **Discovery.** The platform shell, not the sandboxed game iframe, checks `GET /games/:id/published` every 60 s and on `visibilitychange`. Railway supports a long-lived SSE stream, but this is **unverified**. Polling an ETag'd endpoint with no-cache is simpler and good enough. It needs no service worker. A service worker inside a cross-origin sandboxed iframe brings its own scope and storage-partitioning trouble (**unverified, coordinate with A-hosting**).
- **UX.** The pattern copies vite-plugin-pwa's `needRefresh`. A badge says "Version 1.4.0 available". Tapping it shows the changelog and two buttons, Update now and Later. **Update now** does three things in order. First it calls **[SDK hook] `serialize()`** and saves to the cloud as the old schema. Then it loads the new build. Finally it migrates the save at load (§3).
- **Assets.** Build paths are content-addressed with `Cache-Control: immutable`, so an old tab can keep fetching its own build's assets. **Retention policy proposal:** keep artifacts for the current release, the previous two releases, and any build less than 14 days old. Everything else becomes `gc`, still rebuildable from the tag and pinned SDK. Generated games are small, so storage cost is negligible. Reproducible rebuilds depend on the lockfile and the pinned SDK, which R17 must verify.
- **Long-running or offline tabs.** A tab on a GC'd build keeps working for assets it has already loaded. If a lazy-loaded asset fails, the shell shows a forced "This version is no longer available, so save and update". If the save outbox is not empty it saves first.
- **Multiplayer (post-MVP, R12).** A room is pinned to one build. When the owner accepts an update, everyone saves at a safe point and the room reloads together. Guests on the old build cannot join a room on the new one.

### 2.5 Semver and changelogs
- **Semver rule:**
  - **patch**: fixes only, and `saveSchemaVersion` unchanged.
  - **minor**: additions, and the schema is unchanged *or* there is a tested one-step migration.
  - **major**: the previous release's saves are **not** supported, *or* the creator marks the release as disruptive.
  - The publish service suggests the bump from the build metadata, and the creator can override it upward but not downward past a schema break.
- **Changelog without a model call.** Each agent job, or each deterministic action, writes a change note at the end of the job. The format follows changesets, e.g. `.gm/changes/<jobId>.md` with frontmatter `{bump, kind}` and one sentence for players. At publish time the notes since the last release's commit are concatenated, de-duplicated and dropped into an editable textarea. An optional "Polish with AI" button shows its cost (§8.3).
- **Why not use changesets or semantic-release directly.** Both are built around npm packages and commit conventions (MIT, 12.5k★ and 24.1k★). We copy changesets' *file-per-change* idea, which takes about 50 lines of code, and skip the tool itself.

### 2.6 Rollback
- **Rollback publishes a new release.** For example, rolling back to the code of 1.2.0 while 1.4.0 is live creates **2.0.0, "restores 1.2.0"**. Old saves stop working, which is exactly the major-bump condition. The release log stays monotonic, so "previous release" is always just the predecessor, which here is 1.4.0.
- **Saves after rollback.** The migration source is predecessor 1.4.0, whose saves 1.2.0 code cannot read. Saves therefore show as incompatible (§3.6).
- **Confirmation dialog.** It is deterministic and costs no tokens. It shows how many saves and players are affected (e.g. "23 saves from 5 players were made in 1.3.0–1.4.0 and may not load").
- **Alternative.** Moving the pointer back to the old release row keeps the number 1.2.0. That is simpler, but the version number then goes backwards and "previous release" becomes ambiguous. **Decision for Kevin (D1).**

### 2.7 Failure modes

| Failure | Mitigation |
|---|---|
| Agent merge to `main` goes live by accident | Impossible under B. Only the publish service writes the pointer, and it requires a `tested` build. |
| Publish happens mid-session | The badge appears and nothing is forced. |
| Two publishes race | Compare-and-set on `games.published_release_id` with the expected previous id. |
| Rollback target was GC'd | Rebuild from the tag and pinned SDK, then re-run the smoke test before switching the pointer. If the rebuild fails, block the rollback. |
| New release crashes on load | The bug button and error telemetry (R11) catch it. The creator can roll back with one confirm. |
| Old tab loses an asset | The forced save-and-update path above. |

### 2.8 Tests
- A pointer-isolation test: merge to `main` and assert the published build is unchanged.
- An old-tab test: Playwright opens release N, publishes N+1, asserts the badge appears and the old assets still load, then accepts the update and asserts the save migrated.
- A test that a rollback rebuild matches the artifact hash, or at least passes the smoke test.

### 2.9 Editor overrides while builds run (Kevin's decision, 2026-10-21)

**The decision.** While a feature is building, the creator can keep playing and editing. Their manual editor changes are stored in the database as overrides, keyed to stable control IDs, and re-applied to each new build. If a new build makes some edits invalid, the creator still has the newest build and the latest published release until they publish. A4 owns how overrides are applied (control-ID stability, value validation, apply order). This section covers how overrides relate to releases.

**Model: one working set per draft line, frozen into a snapshot at Publish.**

```ts
type OverrideEntry = {
  gameId: string; controlId: string;       // stable ID declared by the game's editor manifest (A4)
  value: unknown;                          // validated against the control's schema in the target build
  madeOnBuildId: string; author: string; seq: number; updatedAt: Date;
};
// A mutable working set: the draft overlay. One per game, edited only by its owner.
type WorkingOverrides = { gameId: string; entries: OverrideEntry[]; revision: number }; // OCC, as with saves
// Immutable. Created at Publish. Content-hashed and referenced by the release.
type OverrideSnapshot = { id: string; gameId: string; entries: OverrideEntry[]; sha256: string };
// Release gains a field: overrideSnapshotId. What players run is the pair (buildId, overrideSnapshotId).
type OverrideApplyResult = { buildId: string; applied: string[];
  orphaned: { controlId: string; reason: 'control_removed'|'value_invalid'|'superseded_by_job' }[] };
```

| Question | Proposed answer |
|---|---|
| Per draft, per release, or snapshotted? | **There is one working set per game.** The creator edits it on top of whichever draft build is newest, and it moves forward with every new build. **At Publish, the working set is validated against the chosen build, frozen into an immutable `OverrideSnapshot`, and recorded on the release.** A published release is therefore always the pair (build, snapshot), so later draft edits can never leak to players. This keeps the pointer isolation of §2.2. |
| A new build invalidates an edit | The entry is marked `orphaned` with a reason. It is **kept, not deleted**, and listed to the creator ("2 edits no longer apply: *Enemy speed* control was removed"). The creator can still play the newest build with the edits that do apply, the previous draft build with every edit, or the published release. |
| The agent job deliberately changed a control the creator had overridden | Proposed: if the job's request named that control (e.g. "make enemies faster"), the job marks the override `superseded_by_job`. Otherwise the creator's override wins. Kevin decides this (D10). |
| Should overrides also live in Git? | Recommended: at Publish, the publish service also commits the snapshot to `gm/overrides.json` on the release tag. No agent is involved. Rollback, rebuild and fork then work from source alone, and the database row stays the fast path. Choosing DB-only is simpler, but then Git no longer describes the whole release. |
| Rollback | Rollback restores the **release pair**: old build plus *its* snapshot. The working set is **not** touched, because the creator's in-progress edits are not lost. Optionally the creator can choose "Also reset my draft edits to this release" (D11). |
| Forks | A fork copies the **snapshot of the release being forked**. Overrides are game content, not personal data. It never copies the source owner's working set, since unpublished edits are private draft work. The exception is forking your own game: there the user may opt to include the working set. |
| Saves | Overrides are parameters. They do not change save schema. Controls that do change save semantics (e.g. one that adds or removes an entity) must be flagged `affectsSaves` in the control manifest (A4). Such a change in a snapshot counts as a schema-relevant change for the semver suggestion and the migration gate (§2.5, §3.5). Saves record `releaseId`, which already identifies (build, snapshot), so no separate field is needed. |
| Analytics and achievements | Events and awards carry `releaseId`, which covers the snapshot. Playing a draft with working overrides counts as draft play: no awards and `env='draft'`. |
| Concurrent editing (two of the creator's tabs, or creator and agent) | The working set uses the same If-Match revision as saves (§3.2). The agent never writes to it except through the `superseded_by_job` marker. |

**Failure modes.**

| Failure | Behavior |
|---|---|
| Override value fails the new build's schema validation | Marked `orphaned: value_invalid`. The control keeps the build's default. |
| Publish of a snapshot with orphaned entries | Allowed, with a warning that lists them. Orphaned entries are not included in the snapshot. |
| Rollback target predates the snapshot feature | The snapshot is empty and the build's defaults apply. |

**Tests.**
- Edit during a build, finish the build, and assert the override was applied.
- Remove the control in the next build, and assert the entry is orphaned and kept.
- Publish, edit again, and assert players still see the published snapshot.
- Roll back, and assert the old snapshot is live and the working set is unchanged.
- Fork, and assert the fork has the release snapshot and none of the working entries.

---

## 3. R09: cloud saves, slots, migration, destructive rollback

### 3.1 Requirement
- Autosave is the default, and each user has multiple slots per game.
- Cross-device resume works.
- A stale tab must not overwrite newer progress.
- The UI distinguishes "saved locally" from "saved to cloud".
- Offline and interrupted uploads are handled.
- Migration covers only the previous published release.
- Rollback may make saves unusable, and nothing promises reverse migration.

### 3.2 Concurrency: three alternatives

| | A. Last write wins (timestamps) | B. **OCC revision plus device lease (recommended)** | C. Server-side transform (Roblox UpdateAsync) |
|---|---|---|---|
| Stale tab overwrites newer save | Yes, which is the bug the spec warns about | No. A stale `If-Match` returns 409, and a lost lease makes the tab read-only. | Not applicable. State comes from the client, so a transform has nothing to merge. |
| Two devices at once | Silent loss | The new device takes the lease: "Playing on iPad, continue here?". The old device stops autosaving and shows "Continued on another device". | — |
| Complexity | Trivial | About 150 lines on server and client | — |

Nakama shows the OCC half. The lease half follows the ProfileService-style session lock used on Roblox, a community pattern that is **unverified**. Having both means a stale tab is blocked twice: once by its lost lease, and again by the version check on write.

### 3.3 Data model (illustrative)

```ts
type SaveSlot = {
  userId: string; gameId: string; slotId: string;      // PK (userId, gameId, slotId)
  kind: 'auto' | 'manual' | 'checkpoint';
  label?: string;                                      // "Dungeon 3, Lv 12" from the [SDK hook] describeSave()
  headRevision: number;                                // OCC token
  status: 'ok' | 'needs_migration' | 'unsupported_old' | 'incompatible_after_rollback';
};
type SaveRevision = {                                  // keep the last K = 5 per slot, plus every pre-migration original
  slotId: string; revision: number;
  releaseId: string; buildId: string; saveSchemaVersion: number;
  payload: Buffer /* gzip JSON, ≤ 512 KB cap */; sha256: string;
  deviceId: string; clientSeq: number;                 // de-dupe retried uploads
  reason: 'pause'|'checkpoint'|'interval'|'hidden'|'manual'|'migration'|'update';
  migratedFromRevision?: number;
  createdAt: Date;
};
type PlayLease = { userId: string; gameId: string; deviceId: string; tabId: string; expiresAt: Date }; // 30 s heartbeat
```

**API**
- `PUT /saves/:game/:slot` with `If-Match: <headRevision>` and `Idempotency-Key: deviceId:clientSeq`. A version mismatch returns 409, and a lost lease returns 423.
- `POST /lease` takes or renews the lease. Taking it from another device needs explicit confirmation.
- `GET /saves/:game` lists slots, with labels and compatibility status.

Payload is opaque to the platform. The server validates only the envelope, size, auth and schema number. Postgres `bytea` with TOAST is enough. At the proposed caps the worst case is 100 users × 10 slots × 6 revisions × 512 KB ≈ 3 GB, and realistic RPG saves are about 5–50 KB.

### 3.4 Client state machine (one slot)

```
idle ──dirty──▶ pending_local ──IndexedDB write ok──▶ saved_local ("Saved on this device")
                                                          │ upload (If-Match r)
                                   ┌──────────────────────┼─────────────────────────┐
                                 200 r+1                409 conflict             network err / offline
                                   ▼                      ▼                         ▼
                         saved_cloud ("Saved ✓")   conflict: keep both →     queued (retry with backoff,
                                                   cloud stays head; local   on 'online' and on next launch)
                                                   becomes slot "Copy from
                                                   <device>, <time>"
                       lease lost (423) at any point ─▶ read_only ("Continued on another device")
```

- **Autosave triggers [SDK hook].**
  - Pause.
  - A checkpoint or scene change the game declares.
  - `visibilitychange→hidden`, which writes to IndexedDB synchronously-ish and then tries the upload. `fetch(..., {keepalive:true})` has a body limit of about 64 KB, **unverified**, so a larger save waits in the outbox until the next launch.
  - An interval of at most one save per 30 s, and only when state is dirty.
- **Mid-battle saves.** The game exposes `canSaveNow()`. If saving is unsafe, the SDK reuses the last safe snapshot. It never serializes half an animation.
- **Never auto-pick a winner in a conflict.** Steam's timestamp dialog points to the same principle, though that is **unverified** (§1).

### 3.5 Bounded forward migration
- **The game supplies it [SDK hook].** A build declares `saveSchemaVersion: N` and, optionally, `migrate(fromN_1): N`, where N-1 is the predecessor release's schema. Semver and schema are independent, so a patch release keeps the same schema and needs no migration.
- **What load does:**
  - The schema matches the current one: load it.
  - The schema matches the predecessor's: run `migrate`. Write the result as a new revision with `reason: 'migration'`, and keep the original revision outside the K window as the recovery copy. Then load.
  - Anything else becomes `unsupported_old`: "This save is from 1.1.0. This version can't continue it. [Keep it] [Start new]". The raw save is kept.
- **Lazy, not background.** Migration runs only when the user opens the slot. The spec warns against silent background migration, and lazy migration also keeps dormant slots untouched. A slot that is two or more schemas behind becomes `unsupported_old` when it is next opened. If the creator later rolls forward again, it may load. That is a harmless side effect of never deleting anything.
- **Fallbacks for removed content.** These are conventions the agent must follow:
  - Unknown item ids go into a "Lost & found" item or become currency.
  - A removed location becomes the nearest declared `safeSpawn`.
  - A removed quest becomes `completed` if the player passed its last checkpoint, otherwise it is reset.
  - Every migration must leave the game in a state `validateState()` accepts.

**Migration test fixtures.** These are a required gate on the agent's publish checklist (coordinate with R17):

| Fixture (recorded on the *predecessor* build by the playtest harness at golden points) | Change in the new build | Assertion |
|---|---|---|
| `inv_full.json`: inventory holds the item being removed | Item `sword_old` removed | It lands in lost-and-found or is converted, and no id dangles |
| `quest_mid.json`: mid-quest, step 3 of 5 | Quest steps re-ordered or removed | Quest state is valid and the player isn't soft-locked (a reachability check if the game exposes one) |
| `loc_removed.json`: player standing in a deleted room | Map changed | Player is at a valid `safeSpawn` |
| `inv_shape.json`: inventory stored as an array | Inventory becomes a keyed map with stacks | Item counts are preserved |
| `fresh.json`: a new game | Any change | It loads, so the migration is a no-op on an empty state |
| `two_back.json`: schema N-2 | — | Status is `unsupported_old` and no crash occurs |
| Every fixture | — | `restore(migrate(f))` then `serialize()` round-trips, and `validateState()` passes |

### 3.6 Rollback and saves
A rollback (§2.6) does not delete or reverse-migrate anything. On load, any slot whose head schema the restored build doesn't recognize becomes `incompatible_after_rollback`. The player is offered three options: an earlier revision of the slot that matches the restored schema if one exists, keeping the save, or starting new. Showing "an older copy may exist" uses the K revisions already kept, so it costs nothing extra. Promising one-click recovery would be wrong (§5.16).

### 3.7 Failure modes

| Failure | Behavior |
|---|---|
| Tab killed mid-upload | IndexedDB holds the save, and it uploads on next launch with the same idempotency key, so no duplicate is created. |
| Laptop offline for an hour, phone played meanwhile | On reconnect: 409, then both are kept, with the cloud copy as head and the laptop's as a "Copy" slot. |
| Old tab wakes from sleep | Lease expired, so the tab is read-only. The write would also fail with 409. |
| Server accepts but the ack is lost | Retry with the same idempotency key returns the original revision. |
| Corrupt or oversized payload | 413/422 from the server. The local copy is kept, the error is reported, and the bug button is pre-filled. |
| Migration throws | Not saved. The original revision is untouched, the status becomes `unsupported_old`, and an error event is sent to R11. |
| Child account (V3) | Saves are private to the user and their supervisor (§10). They are never copied on fork. |

---

## 4. R10: achievements

### 4.1 Requirement
- A standard way for a game to define and award achievements.
- Per-user, per-game catalogs, for single-player and multiplayer.
- Friends can browse them.
- Answers needed for: stable ids, repeat-safe awards, deletion and revision, forks, saves, and rewind.

### 4.2 Semantics: two alternatives

| | **A. Permanent account accomplishment (recommended)** | B. Save-scoped state |
|---|---|---|
| Model | Steam, Xbox and PlayStation. Once earned, kept. | Reverts when the save is reloaded, migrated or rewound. |
| Rewind, reload, rollback | No effect on awards. | Complex, and achievements become confusing ("I lost my trophy"). |
| Cheating | Possible, and it doesn't matter much for an invite-only product. | — |
| Per-save progress ("3 of 5 shrines") | Lives in game save state. The SDK can mirror the *max* progress to the platform. | Native |

### 4.3 Model and API

```ts
// achievements.json in game source, validated by the publish lint
{ "achievements": [
  { "key": "first-dungeon", "title": "Into the Dark", "description": "Finish the first dungeon",
    "icon": "assets/ach/dungeon.png", "hidden": false, "progress": null },
  { "key": "shrines", "title": "Pilgrim", "description": "Visit 5 shrines", "progress": { "target": 5 } } ] }

// [SDK hook] game-facing
sdk.achievements.award('first-dungeon');           // safe to call every frame; deduped client-side and server-side
sdk.achievements.progress('shrines', 3);           // monotonic max; awards automatically at target
```

```sql
achievement_defs(game_id, key, title, description, icon_path, hidden, target,
                 first_release_id, retired_release_id NULL, PRIMARY KEY(game_id, key));
achievement_awards(user_id, game_id, key, release_id, source /*client|room|admin*/,
                   awarded_at, PRIMARY KEY(user_id, game_id, key));   -- INSERT ... ON CONFLICT DO NOTHING
achievement_progress(user_id, game_id, key, value, PRIMARY KEY(user_id, game_id, key)); -- value = GREATEST(old,new)
```

- **Award flow.** The client SDK queues awards in IndexedDB, using the same outbox as saves. A POST sends the award. The server checks that the user's lease or session is on a **published** release, and that the key exists and is not retired in that release's catalog. The unique key makes the write idempotent. The server returns `newlyAwarded: bool`, and the shell shows its toast only when that is true.
- **Drafts and previews.** No awards are recorded, and the toast shows "(test)" so creators can check them. This keeps creator test runs out of real catalogs.
- **Revision rules:**
  - The key is the identity.
  - Changing a title or icon keeps existing awards.
  - Removing a key requires `retired: true`. Awards are kept and shown as "Retired". The publish lint blocks a key that silently disappears.
  - Re-using a retired key is blocked.
- **Forks.** A fork gets a new `game_id`, and its definitions are copied with the source recorded. **No awards, progress, saves or analytics are copied** (§5.13 safeguard). This is the recommendation, and Kevin decides it (D5).
- **Multiplayer (later).** The room server is the awarding authority (`source: 'room'`). Each participant receives their own award.
- **Trust.** The client is trusted, plus validation of key, catalog and published release, a rate limit, and admin revoke (`DELETE`, with an audit row). There is no anti-cheat. For an invite-only product that is proportionate. Upgrading later to server-evaluated, event-based unlocks (Xbox-style, **unverified**) needs no schema change.
- **Visibility.** A user sees their own awards. Friends see them if the friend relationship (R12/R04) allows it (and, for child accounts, parental controls: V3). Hidden achievements show "???" until earned.

**MVP vs later.** The MVP needs the manifest, award/progress API, catalog page in game info, toast and lint. Friends' views, global unlock percentages (Steam's `GetAchievementAchievedPercent` idea) and room awards come later.

**Tests.**
- Award the same key 1,000 times concurrently and expect exactly one row and one `newlyAwarded=true`.
- An award against a retired or unknown key returns 422.
- Fork copies definitions and zero awards.
- Draft play writes nothing.
- Rewinding past the award point leaves the award in place.

---

## 5. R11: analytics and admin visibility

### 5.1 Requirement
- Mario Maker-style creator insight: attempts, time spent, completions, drop-off and stuck points.
- Admins see activity for the people they invited.
- Child and adult rules are separate (child rules: V3).
- Data is minimized and retention is defined.
- Gameplay analytics are separate from billing and from social presence.
- The deliverable is a dashboard information model.

### 5.2 Event vocabulary that works across genres
**Emitted by the platform automatically, with no game code:**
- `session_start` and `session_end`, carrying release, device class and input type.
- `active_heartbeat`, every 30 s while visible and not paused. Active time is derived from it.
- `game_load_failed`, `error` and `bug_report`.
- `update_offered` and `update_accepted`.
- `save` and `load`, carrying reason and migration result.
- `rewind_used`, later.

**Emitted by the game [SDK hook].** The vocabulary is deliberately tiny:

```ts
sdk.analytics.attemptStart(scope: string)              // 'level-3', 'boss-ogre', 'puzzle-7'
sdk.analytics.attemptEnd(scope, outcome: 'complete'|'fail'|'quit', markerId?)
sdk.analytics.marker(markerId: string)                 // declared progress points, e.g. 'castle-gate'
sdk.analytics.complete()                               // the game's own "finished" definition
```

| Genre | attempt scope | marker | complete |
|---|---|---|---|
| Platformer | level try (start → death/clear) | checkpoints. A death spot is the marker plus a coarse tile bucket, which gives Mario Maker crosses. | final level clear |
| RPG | battle, dungeon run | quest steps, areas entered | credits |
| Puzzle | puzzle | hint used | all puzzles |
| Sandbox / toy | none (session-only) | first use of each tool | optional / none |

**Derived metrics (in rollups, never stored in the client):**
- **Plays**: sessions.
- **Players**: distinct users.
- **Attempts per scope.**
- **Clear rate**: complete ÷ attempts.
- **Median active time.**
- **Completion rate**: players with `complete` ÷ players.
- **Drop-off**: for players who never complete, the furthest marker reached.
- **Stuck**: a scope with at least 5 fails by the same player, or more than 10 active minutes since the last marker.
- **Version adoption**: sessions by release.

Raw position traces and replays are **not collected**. §5.15 asks whether replay is needed, and markers answer it without one.

### 5.3 Storage: three alternatives

| | **A. Postgres events plus rollups (recommended)** | B. PostHog Cloud | C. PostHog self-host / Umami |
|---|---|---|---|
| Fit | A table partitioned by month, `analytics_events(id, ts, game_id, release_id, pseudo_user_id, session_id, name, scope, marker, outcome, props jsonb≤1KB)`, plus a nightly `analytics_daily` rollup job | Feature-rich | PostHog: 4 vCPU and 16 GB, ClickHouse and Kafka, unsupported. Umami counts page views, not attempts. |
| Player data (children's: V3) | Stays in our DB | Sent to a new vendor. Not allowed without separate authorization (§10). | Stays local |
| Volume | 50 users × 5 sessions × ~150 events ≈ 40k rows a day (estimate), which is trivial | — | — |
| Cost | Same Railway Postgres | Free tier up to a point (**unverified**) | A large extra service |

### 5.4 Access and minimization model (proposal. Decision D7 is Kevin's.)

| Viewer | Adult player of my game (V1) | Child player of my game (V3) |
|---|---|---|
| Game owner (creator) | Per-player rows are *proposed* to show display names when both are friends or in the same household. Otherwise, aggregates only. | **Aggregates only, with at least 3 distinct players per cell** (small-cell suppression). There is no per-child drill-down unless the creator is that child's supervisor. |
| Admin (inviter) | Activity of people *they invited*: sessions, games played, time | Same, plus anything the supervisor role grants |
| Child's supervisor (V3) | — | Full activity for their child across games |
| Platform maintainer (Kevin) | All of it, as a privileged and audited capability (§4.1) | Same |

- **Minimization.**
  - `pseudo_user_id` is an HMAC of the user id with a rotating per-game salt, so the event table doesn't join to accounts without the key.
  - No IPs, no free text and no user-agent strings. Only a coarse device class is stored.
  - Draft and preview sessions are tagged `env='draft'` and excluded from the creator's player dashboard. A separate creator-testing view can show them.
- **Retention proposal.** Raw events are kept 90 days and rollups indefinitely. Deleting an account deletes its raw events, and rollups are already aggregates.
- **Separation.** Billing and cost telemetry lives in R15's tables. Social presence lives in R12. Analytics never feeds the public "playing now" display.

### 5.5 Dashboard information model (creator, per game)
1. **Overview.**
   - Shown for the last 7 or 30 days: plays, players, median active time, completion rate, open bug reports.
   - Each number shows its sample size.
   - Playtime is not framed as success (§5.15).
2. **Progress funnel.** Markers in their declared order, showing the percentage of players who reached each one. The biggest drop is highlighted with the hint "players stop here".
3. **Attempts table.** Per scope: attempts, clear rate, median attempts until the first clear, and "stuck" players. A Mario Maker-style death-spot overlay comes later.
4. **Releases.** Metrics per release side by side, with crash and error counts. This fits the "compare versions" intent without A/B cohorts (§5.16).
5. **Players.** Gated by §5.4.

**Admin view.** For each invited person: last active, games played, sessions, time. **Supervisor view (V3).** The same for each child, plus links into parental controls (R04).

**SDK overhead.** Events are batched to the outbox and flushed every 10 s or on hide. The budget is under 1 KB per event and under 20 events a minute in steady state, enforced by a client-side cap with a counter for dropped events.

**Tests.**
- Run a scripted playthrough on a fixture game and assert the rollup values.
- A small-cell test (V3): a child cohort of 2 renders as suppressed.
- A test that draft sessions are excluded.

---

## 6. R14: local ephemeral rewind (post-MVP; V2)

### 6.1 Requirement
- Hold to rewind through about 10 s of local history, and release to resume.
- No server sync, and the buffer doesn't need to survive a refresh.
- Must work with physics, randomness, audio, saves, awards, analytics and code changes.
- Multiplayer stays unresolved.

### 6.2 Three alternatives

| | **A. Snapshot ring buffer (recommended)** | B. Input recording plus deterministic replay | C. Keyframes plus replay (Braid-ish or GGPO-ish hybrid) |
|---|---|---|---|
| Needs determinism | No | **Yes**, strictly: fixed timestep, seeded RNG, no `Date.now`/`Math.random`/`dt` drift, deterministic physics (Rapier only with the `deterministic` build) | Yes, between keyframes |
| Memory | Snapshot size × rate × 10 s | Tiny | Small |
| Scrub smoothness | Direct: each frame is a snapshot | Must re-simulate forward from the start for every scrub position | Re-simulate from the nearest keyframe |
| Agent-generated game risk | Low. It only needs `capture` and `restore` to be correct. | High. One nondeterministic line breaks it silently. | Medium-high |

GGPO's API shows that even replay-based rollback is built on `save_game_state`/`load_game_state`, so the capture and restore hooks are needed whichever option we pick. Option A needs nothing more.

### 6.3 Design (A)
- **[SDK hook]** `rewind.capture(): Serializable` and `rewind.restore(s)`. The default implementation is the save `serialize` and `restore`, which is often too coarse because projectiles and enemy AI timers are missing. Games opt in with `rewindable: true` once they capture transient state.
- **Physics:**
  - Rapier: `world.takeSnapshot()` returns a Uint8Array per sample. `World.restoreSnapshot` returns a new World, so the SDK swaps the reference, calls `free()` on the old world, and re-binds the body and collider handles the game holds. Rapier's serializer keeps handles. That is inferred from its being a full-state serialize, so **verify it with a spike**.
  - Phaser Arcade: the SDK captures body position and velocity.
  - Planck: use its serializer.
  - Matter: hand capture.
- **Rate and memory.**
  - Sample at 20 Hz and interpolate rendering between samples while scrubbing. 10 s gives 200 entries.
  - Budget is **at most 32 MB per tab**. If an entry exceeds `budget/200`, the rate halves automatically and a dev warning fires.
  - Optional structural sharing with immer for large and mostly static state.
  - Snapshot size is **unmeasured**. Benchmark it in the spike with a 100-body Rapier scene and a typical RPG state.
- **Randomness and time.** The SDK provides `sdk.random()` with captured state, and lints `Math.random` in gameplay code. The game uses the SDK's fixed-step clock. Option A doesn't require any of this, but it keeps the door open for B or C and for multiplayer.
- **Audio and visual.** While held: a desaturate filter, music pitch-down or reverse effect, and no one-shot SFX triggered. On release, one-shot sounds are not replayed.
- **Interactions:**
  - **Autosave**: suspended while held. The next normal trigger saves the restored state.
  - **Achievements**: permanent, never revoked (§4.2).
  - **Analytics**: only `rewind_used{seconds}`. An attempt that was rewound counts as continued, not failed. Whether rewinds count toward "stuck" is open (D9).
  - **Draft hot-reload or update**: clear the buffer.
  - **Pause or edit mode**: the buffer is frozen.
  - **Storage**: in memory only. IndexedDB buys nothing because a refresh doesn't need to survive.
- **Multiplayer.** Disabled, and the button is hidden. Any shared rewind needs a new decision (§5.17).

**What the MVP must do now.** Even though rewind is deferred, put seeded RNG, the fixed-step clock and an explicit logical state into the SDK at MVP. Retrofitting them into dozens of generated games costs far more.

**Tests.**
- Capture, then restore, then capture again must give byte-equal snapshots (or deep-equal for JSON).
- Rewind 5 s, release, and assert the game is playable with no dangling physics handles.
- A memory-cap test with an oversized state.
- Award earned, rewind, award still present.

---

## 7. Stack integration and costs

- **TypeScript everywhere.**
  - Shared contract types in the SDK package: `SaveEnvelope`, `ReleaseInfo`, `AchievementManifest`, `AnalyticsEvent`.
  - The server is the platform API on Railway.
  - All persistence is in one Postgres: builds, releases, saves (bytea), awards, events.
  - Build artifacts live in object storage or a static host. The asset host is A-infra's choice. Paths are content-addressed and immutable.
- **Background jobs.** Rollups, retention and build GC run on whichever Postgres job runner A-infra/R06 picks (pg-boss or graphile-worker, both MIT).
- **Model and token cost.** Zero for publish, rollback, migration execution, awards and analytics. Writing migrations and fixtures is part of the coding agent's existing job, which adds an estimated 10–20% to release jobs that change the schema (**estimate**). Changelog polishing is optional and shows its cost.
- **Infrastructure cost.** Marginal at invite-only scale: a few GB of Postgres and negligible egress. Railway prices are **not verified here**, and R19 owns them.

## 8. Licensing and data-handling questions
- Every library proposed is MIT, ISC or Apache-2.0. PostHog `ee/` is proprietary, which is moot since we don't use it. Plausible is AGPL, which is avoided.
- **(V3)** Saves, awards and analytics for child accounts are personal data. Retention, deletion on account removal, and supervisor access need legal review under COPPA (R19). This report does **not** settle them.
- Pseudonymized events are still personal data while we hold the key.
- Saves are never exposed in the open-source game repo (§10.4). Release changelogs *are* public game metadata, so the agent's change notes must not include prompts or personal details. Add a publish lint for that.

## 9. Next steps
1. A4 places the hooks named here: `serialize/restore/validateState/describeSave/canSaveNow/migrate`, `achievements.*`, `analytics.*`, `rewind.capture/restore`, seeded RNG and clock.
2. Prototype spike, about 1 day and no paid services: build the save outbox (idb) plus the OCC/lease endpoints. Run a Playwright test with two browser contexts for a stale tab and offline-then-reconnect.
3. Rapier spike: snapshot size and timing for 100 and 500 bodies, and confirm handles are kept across `restoreSnapshot`.
4. Write the fixture-recording mode in the playtest harness (R17) and the migration gate.
5. Draft the analytics access matrix (V1: adult rows; the R04 supervision part: V3).

## 10. Decisions for Kevin
- **D1.** Should rollback publish a **new, higher version number** ("2.0.0 restores 1.2.0")? The alternative is to move the pointer back to the old number. The recommendation is a new number.
- **D2.** Slots: one rolling autosave plus how many manual slots (3?). Should a separate "checkpoint" autosave be kept as well?
- **D3.** How long builds that are no longer published stay available to open tabs. The proposal is the current release plus the two before it, plus anything newer than 14 days.
- **D4.** Should achievements be permanent account awards that rewind, reload and rollback never remove? (Recommended.)
- **D5.** Forks copy achievement definitions but **no** awards, saves or analytics. Confirm.
- **D6.** Should creators get "(test)" toasts with no record in drafts, or should draft play record real awards?
- **D7.** The analytics visibility matrix (§5.4). V1 needs only the adult column. In particular (V3): may a creator ever see a named child's play data if they are not that child's supervisor? (The proposal is no, aggregates only, with at least 3 players per cell.)
- **D8.** Retention: raw gameplay events 90 days and rollups indefinitely? Should there be any opt-out for adults?
- **D9.** Rewind (V2): does using rewind count toward "stuck" analytics, and should creators be able to turn rewind off per game?
- **D10.** If an agent job changes a control the creator has manually overridden, which wins? The proposal is that the creator's override wins, unless the job's request explicitly targeted that control.
- **D11.** On rollback, should the creator's in-progress draft edits be kept (proposed) or reset to the restored release?
- **D12.** Should forks of someone else's game get only the published override snapshot (proposed)? Should the published snapshot also be committed to Git so source alone reproduces a release (proposed)?

**Unverified items:**
- Steam Cloud's conflict dialog.
- Xbox and PlayStation permanence and event-based unlocks.
- The Roblox session-lock pattern.
- The `fetch keepalive` 64 KB limit.
- Railway SSE support and prices.
- Rapier handle preservation across `restoreSnapshot`.
- Braid's actual technique.
- Snapshot sizes.
- PostHog's free tier.
- The absence of a PlayFab conditional write.
