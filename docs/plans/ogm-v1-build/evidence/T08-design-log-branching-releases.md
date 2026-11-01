# T08: design log, branching, releases, saves, forks, achievements, analytics

Researched at `9508c1c` (research branch), aiur `main` `0f692a45b`, 2026-10-31. Tags: [M] measured, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

The editor transaction log (`{actor, rev, patches}` against stable ids), the override layer on top of builds and its re-application, Publish (pin, fold into `design/*.json`), branches ("versions": Git branch plus a fork point in the log), the three-way design merge with voice-guided conflicts, releases (drafts, semver, changelog, update indicator, rollback), saves (autosave plus three slots, cross-device), forks, achievements and creator analytics aggregates.
Not this track: the manifest and `applyDesign` wire contract (T04), the room protocol that carries the transaction stream (T07), the commit service that writes Git (T03), build analytics for admins (T01), the voice tool runtime (T06).
Everything here is new TypeScript; no prototype code is reusable (E08-15).

## 2. Evidence packets

### E08-1: The transaction is the unit of editor change; its shape is settled across A4, B7 and C2 except for three field changes
- Claim / current behavior: A4 defines `Transaction {id, label, origin, commands, patches, inverse, baseRev}` with Immer `produceWithPatches` on a JSON design doc. B7 replaces `origin` with `actor` (userId) plus `kind: "manual" | "system"`, repurposes `baseRev` as the edit-lease fencing check, and keeps one transaction per intent (a drag or stroke coalesces). C2 adds `branchId` to every transaction.
- Source and exact locus: `docs/research/v0.3/A4-engine-sdk-editor.md` lines 179–200; `docs/research/v0.4/B7-editor-sdk-input.md` §2 rows "Transaction.origin" and "baseRev", §6; `docs/research/v0.5/C2-v1-scope-additions.md` §8 "Recommendation".
- Why it matters: the same record is persisted (override layer), replayed (branches), broadcast (T07 watchers) and undone. One type, four consumers.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: none on the shape. A4 §7 item 9 requires entities as `Record<id, Entity>`, never arrays, or Immer index paths break under concurrent edits and merges; the SDK's design schema (T04) must enforce that.
- Suggested requirement/decision impact: adopt the `Transaction` type in §4 verbatim as a shared contract; add `kind: "merge"` for E08-9.

### E08-2: Two incompatible persistence models exist in the research: a transaction log (A4/B7/C2) and a per-key working set (A5 §2.9)
- Claim / current behavior: A4 §7a and A5 §2.9 store overrides as a mutable value-per-key working set (`OverrideEntry {controlId, targetId, value, baseValueAtEdit, ...}`, "one working set per game"). C2 §8 stores the log itself ("a branch is a fork point plus its own later transactions, with nothing copied"; "reads replay the parent up to the fork point").
- Source and exact locus: A4 lines 213–230; A5 lines 168–181 and 185; C2 §8 "Model" table row "Design state".
- Why it matters: a fork point into a log is cheap; a fork point into a mutable working set is not possible. Branching (A1 in `questions-or-commands.md`) decides it.
- Confidence and freshness: [V] both texts; the resolution is [O].
- Contradiction or open question: A5's "one working set per game" contradicts C2's per-branch state.
- Suggested requirement/decision impact: the append-only transaction log per branch is the source of truth; the working set is a derived, cached reduction (`reduce(log) → WorkingSet`) rebuilt per branch and per build. A5's `OverrideEntry` survives as the reduction's element, with `status` from the reapply classification (E08-4). Record as a decision.

### E08-3: Effective design = build's base doc ⊕ reduced overrides, and overrides never touch source until Publish
- Claim / current behavior: the base doc ships in `design/*.json` per build (immutable, agent-authored); creator edits go to the DB layer at once; fold into source only at Publish, by a bot author, no agent, no tokens.
- Source and exact locus: A4 §7 item 6 and §7a "Where overrides live"; spec v0.4 §5.8 (`Effective draft design = build's base design document + creator's database overrides`); B7 §4.1 "Fold on Publish".
- Why it matters: it fixes who writes Git (only the commit service, T03) and why a slider nudge never triggers a build.
- Confidence and freshness: [V] 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: the fold is a deterministic function `fold(baseDoc, workingSet) → design/*.json` with canonical JSON serialization so two folds of the same input are byte-identical (needed for the content-hash on the snapshot and for E08-12 forks).

### E08-4: Re-application to a new build is deterministic host code with a fixed classification and manifest-supplied hints
- Claim / current behavior: on switching to a new build, apply entity creates, then deletes, then property sets in stable key order; classify each entry as carried / renamed (via `aliases`) / needs a choice (fails new validation; never clamp silently) / conflict (new base value ≠ `baseValueAtEdit`; creator wins) / dropped (control or target removed, or `migrateOverride` threw). A build may mark `superseded` only for controls listed in the scoped request's `targetControls[]`; the host enforces it.
- Source and exact locus: A4 §7a steps 1–4 and the classification table; B7 §4.1 rows "Builder vs creator conflict", "Out-of-range", "Removed control/target"; spec v0.4 §5.8 table.
- Why it matters: it is the contract between a finished aiur job (T02) and the editor, and the content of the "Your 23 changes: 20 kept, 1 needs a choice, 2 couldn't carry over" card (T09).
- Confidence and freshness: [V].
- Contradiction or open question: spec §5.8 says "archive affected overrides; 30 days was proposed, not expressly adopted". Dropped entries stay in the log anyway (it is append-only); only the reduction drops them. No separate archive is needed.
- Suggested requirement/decision impact: `ReapplyReport` (§4) is produced by the backend when a build reaches `tested`, before the creator switches; the manifest hints `aliases`, `retired`, `migrateOverride` are a T04 manifest field this track consumes; `targetControls[]` is a field of the structured request T06 produces and T02 passes to the job.

### E08-5: Publish pins `(buildId, overrideSnapshotId)`, moves one pointer, and the pointer is separate from Git `main`
- Claim / current behavior: A5 option B: `main` is the accepted draft line, `games.published_release_id` is what players load; builds are immutable and content-addressed; releases are append-only with a monotonic `seq`; a Git tag `gm/<gameId>/v1.4.0` marks each; publish needs a `tested` build; two publishes race on compare-and-set of the pointer. The snapshot is also committed (`gm/overrides.json` → in this plan the fold into `design/*.json`) so source alone reproduces a release.
- Source and exact locus: A5 §2.2–2.3, §2.7, §2.9 "Should overrides also live in Git?"; spec §5.20 and §9.3 ("Latest on refresh means the latest published game, not whatever commit most recently reached a branch").
- Why it matters: agent merges to `main` never go live by accident; rollback is a row, not a revert.
- Confidence and freshness: [V]; A5 marks the Git commit of the snapshot as D12 (Kevin undecided).
- Contradiction or open question: `questions-or-commands.md` A3 assumes publish only from `main` after a merge; C2 §8 offered "any branch publishable" as the alternative. Keep A3.
- Suggested requirement/decision impact: `Release` and `Build` types in §4; the fold commit lands on `main` at the release tag through T03's commit service, behind B7's publication content gate.

### E08-6: Rollback publishes a new release; the draft working set is untouched
- Claim / current behavior: rolling back to 1.2.0 while 1.4.0 is live creates a new release "restores 1.2.0" pointing at the old `(build, snapshot)`; saves made on newer schemas become `incompatible_after_rollback` and nothing is deleted; the confirm dialog counts affected saves; a GC'd build is rebuilt from the tag before the pointer moves.
- Source and exact locus: A5 §2.6, §2.9 "Rollback" row, §3.6; spec §5.20 ("Rollback is a deterministic workflow, not inherently a model job"); architecture doc row "Releases" ("Rollback republishes an older manifest").
- Why it matters: no tokens, no Git revert, one audited row.
- Confidence and freshness: [V]; the numbering (A5 D1) and "also reset my draft edits" (D11) are open.
- Contradiction or open question: D1 interacts with E08-7's numbering scheme.
- Suggested requirement/decision impact: default D1 = new release with a new number; D11 = keep the working set (offer the reset as a checkbox).

### E08-7: The semver rule is contradicted by a later Kevin note recorded only in the architecture doc
- Claim / current behavior: A5 §2.5: patch = fixes with unchanged `saveSchemaVersion`; minor = additions with no schema change or a tested one-step migration; major = previous saves unsupported or creator marks disruptive; the publish service suggests the bump. The architecture doc "Version numbers" row (source "Kevin 2026-10-29", status "considering"): minor goes up for each build the voice agent makes, patch counts hand edits since the last voice build and resets when minor rises, major on a deliberate publish (first publish 1.0.0), shown on the game card.
- Source and exact locus: A5 lines 131–136; `docs/architecture/architecture-scope.html` line 379–380; `prototypes/studio-v0/data.js` shows `version: '1.12.5'` strings on cards as the intended display [V].
- Why it matters: the two schemes assign different meanings to the same three numbers; the migration gate keys on "previous release's schema", not on the number, so either scheme works for saves.
- Confidence and freshness: [V] both texts; neither is in the decision log or release plan, which say only "semver".
- Contradiction or open question: Kevin's note is more recent and his own; A5's is the research recommendation. Precedence puts Kevin's words first.
- Suggested requirement/decision impact: [O] adopt Kevin's scheme as a derived display number per branch: `major` = count of publishes on `main`, `minor` = count of tested builds on the branch since the fork, `patch` = transactions since the branch's latest build. Store nothing; compute from counts. Keep `saveSchemaVersion` as the only compatibility signal (A5 already decouples them). Flag for Kevin in `questions-or-commands.md`.

### E08-8: A branch ("version") is a Git branch plus a fork point `(parentBranchId, parentRev)`; builds, saves, rooms, analytics and budget are keyed by branch
- Claim / current behavior: Code on `branch/<id>` off the parent's head; design state is the parent log up to the fork plus the branch's own transactions; each branch has its own draft builds; saves are not branched but tagged with branch and build and only load on a compatible branch; rooms pin `(branch, build)`; cap 5 active versions, archive not delete; product word is "version".
- Source and exact locus: C2 §8 "Model" table, "UX", "Recommendation"; release plan §2 "Branching" (Working); `questions-or-commands.md` A1 (in: data model plus basic screens).
- Why it matters: every other table in this track gets a `branchId` column from day one; retrofitting touches every subsystem (C2 §8).
- Confidence and freshness: [V] text; A1 is an assumption awaiting Kevin.
- Contradiction or open question: C2 §8 itself flags "whether aiur supports a non-default base branch per ticket needs checking [I]". Checked in E08-9: it does not.
- Suggested requirement/decision impact: `Branch` type in §4; `main` is a `Branch` row with `forkPoint: null` so there is one code path.

### E08-9: aiur `main` has one base branch per repository config and repairs any PR back to it; per-ticket base branches are a gap
- Claim / current behavior: `tracker.base_branch` is a single required string; an unset value raises (`Aiur.Config.TrackerSettings.base_branch/2`). `Aiur.GitHub.PullRequests.BaseBranch.ensure_base_branch/3` compares a PR's `base.ref` with the configured base and PATCHes the PR to the configured base when they differ, journaling first. `Aiur.Issue` carries `branch_name` and `pr_head_ref` (the agent's working head), not a base. Workers are told `AIUR_BASE_BRANCH` is "the integration branch" from `tracker.base_branch`, "not GitHub's repository default".
- Source and exact locus: `/home/orangekid/github/aiur/src/lib/aiur/config/tracker_settings.ex` lines 12–55; `.../config/schema/tracker.ex` lines 302–305; `.../github/pull_requests/base_branch.ex` (whole module); `.../issue.ex` lines 19–23, 78–82; `.agents/skills/aiur-agent/dev-loop.md` lines 32–33; `website/docs-app/reference/configuration-tracker.md` line 10.
- Why it matters: C2 §8 step "aiur jobs targeting a game branch" cannot be done on current main: a job on `branch/<id>` would have its PR repaired to `main`, merging branch work into the published line.
- Confidence and freshness: [V] aiur 0f692a45b.
- Contradiction or open question: contradicts C2 §8 "Agent jobs would target the game branch, not main" and its ticketing line "aiur jobs targeting a game branch (check base-branch support)".
- Suggested requirement/decision impact: [O] V1 default: branches carry design-state divergence plus a Git ref that moves only by the commit service (fork, fold, merge); aiur code jobs run on `main` only; a feature request made while a branch is open is queued against `main` and reaches the branch through "Bring changes in" (E08-10 in the other direction). File the per-ticket base branch upstream (decision log: "work around for V1, then file upstream"). T02 owns the upstream request; this track owns the UI copy ("Builders work on the main version").

### E08-10: The three-way design merge is per stable id and per field, with three conflict kinds, resolved as one merge transaction and previewed before landing
- Claim / current behavior: base = fork point, ours, theirs; different entities or fields merge automatically; same field to the same value merges; conflicts are same field changed differently, delete-vs-edit, or a code change that removed a control the other side tuned; the voice agent walks only real conflicts with side-by-side previews; choices per conflict or "keep all of mine"; the result is one undoable transaction with `actor`; built as a temporary draft; lands on confirm; rollback is a revert of the merge. Code merges are a Git merge; a conflict becomes an agent job plus `gm-verify`.
- Source and exact locus: C2 §8 "Merging" 1–4; B7 §4.1 orphan rules; A4 §7 item 9 (map keys, not arrays).
- Why it matters: this is the one piece of V1 branching that is an algorithm rather than a schema; it also serves A4's "Builder also changed this: keep yours / use new" case (E08-4) with the same classification.
- Confidence and freshness: [V] text; the algorithm in §4 is [O] derived from it.
- Contradiction or open question: Immer patch paths are positional under `add`/`remove` on arrays; with `entities: Record<id, …>` every path is `['entities', id, ...field]`, so last-write-per-path reduction is exact. Heightfield or tilemap strokes produce large patches (B7 §3 row "Undoable stroke"); merge them per chunk key, not per cell.
- Suggested requirement/decision impact: `MergePlan`/`MergeConflict` types and the three-line algorithm in §4; T06 gets a `resolve_conflict` tool shape from this track.

### E08-11: Saves are OCC revisions with a device lease and an IndexedDB outbox; three manual slots plus one autosave is decided; migration is lazy, one step, from the predecessor release only
- Claim / current behavior: `PUT /saves/:game/:slot` with `If-Match: <headRevision>` and `Idempotency-Key: deviceId:clientSeq`; 409 on mismatch, 423 on lost lease; conflicts keep both ("Copy from <device>"); autosave triggers on pause, declared checkpoints, `visibilitychange`, and a 30 s dirty interval; `canSaveNow()` guards mid-battle; payload opaque, ≤512 KB, last K=5 revisions kept plus every pre-migration original; load migrates only from the predecessor release's schema, else `unsupported_old`; rollback marks `incompatible_after_rollback` and deletes nothing.
- Source and exact locus: A5 §3.2–3.7; spec §5.16 ("one rolling autosave plus three manual slots" accepted); release plan §2 "Saves" (Decided); C2 §8 (saves tagged with branch and build).
- Why it matters: it is the only place a stale tab can destroy progress; two independent guards (lease, revision) are the design.
- Confidence and freshness: [V]; the `fetch keepalive` 64 KB limit is unverified in A5.
- Contradiction or open question: A5 says saves record `releaseId`; with branches a draft save on a branch has no release. Record `branchId`, `buildId` and `releaseId?`.
- Suggested requirement/decision impact: `SaveSlot`, `SaveRevision`, `PlayLease` in §4; `idb` 8 (ISC, 7.4k stars) for the outbox; the SDK hooks `serialize/restore/validateState/describeSave/canSaveNow/migrate` are T04's to expose and this track's to call.

### E08-12: A fork copies the published release pair and achievement definitions into a new game and repo; no runtime data
- Claim / current behavior: creator-only, forkable by default; copies the design (base doc plus the release's override snapshot), reusable assets, achievement definitions, editor configuration; never saves, awards, analytics or the source owner's working set (own-game forks may opt in); forks keep their copy of uploads; a fork is an independent game with new identity and provenance, "not necessarily a separate GitHub repository fork"; deterministic Git ops, no reasoning agent.
- Source and exact locus: spec §5.17 and §9.4; A5 §2.9 "Forks" row and §4.3 "Forks"; release plan §2 "Forks" (Decided); decision log "Deleted uploads that forks reuse: forks keep their copy".
- Why it matters: because the fold makes `design/*.json` complete at a release tag, a fork is `clone tag → new repo in the creator's GitHub (A11) → copy snapshot row and achievement defs → re-run usage-rights check`.
- Confidence and freshness: [V].
- Contradiction or open question: paid-pack assets need private repos (release plan "Repos") and usage rights are enforced "at search, build and publish"; a fork of a public game into a private one is fine, the reverse must re-check rights (T05's check, called here).
- Suggested requirement/decision impact: `fork(gameId, releaseId, newOwner)` is a backend job that calls T03 (new repo, push tag) and T05 (rights check); no new data shape beyond `games.forkedFrom {gameId, releaseId}`.

### E08-13: Achievements are permanent account awards keyed by stable slugs in `achievements.json`, idempotent on `(user, game, key)`, never awarded in drafts
- Claim / current behavior: manifest with `key, title, description, icon, hidden, progress.target`; `sdk.achievements.award(key)` and `.progress(key, n)` (monotonic max); server validates the key against the catalog of the session's published release and inserts `ON CONFLICT DO NOTHING`; returns `newlyAwarded`; removing a key needs `retired: true` (lint); retired keys cannot be reused; drafts show "(test)" toasts and record nothing.
- Source and exact locus: A5 §4.3 (schema and SQL); spec §5.18 ("earned achievements are permanent across reload, rollback, and eventual rewind; draft testing may show test notifications but does not award real progress" accepted).
- Why it matters: small, closed, independent of branching except that drafts (any branch) never award.
- Confidence and freshness: [V]; A5 D4/D6 are confirmed by spec §5.18.
- Contradiction or open question: multiplayer rooms as awarding authority (`source: 'room'`) was "later" in A5; T07 makes rooms V1. Keep client-reported awards in V1; the `source` column already allows `room`.
- Suggested requirement/decision impact: tables as in A5 §4.3 plus `branch_id` on nothing (awards are per game, not per branch).

### E08-14: Creator analytics are first-party Postgres-style events plus daily rollups with a four-call SDK vocabulary; draft sessions are excluded; 90-day raw retention
- Claim / current behavior: platform-emitted `session_start/end`, `active_heartbeat` (30 s), `game_load_failed`, `error`, `bug_report`, `update_offered/accepted`, `save`, `load`; game-emitted `attemptStart/attemptEnd/marker/complete`; derived plays, players, clear rate, completion, drop-off, stuck, version adoption; `pseudo_user_id` = HMAC with a rotating per-game salt; no IPs, free text or UA; `env='draft'` excluded from the creator dashboard; raw 90 days, rollups indefinitely; no PostHog.
- Source and exact locus: A5 §5.2–5.5; spec §5.19 (aggregates, 90-day default accepted as planning default); release plan §2 "Achievements and analytics" (Working V1); A12 drops cell suppression from V1 tickets.
- Why it matters: separate from T01's build analytics (aiur phases, cost) and from T07 presence; joins only on `releaseId`/`branchId`.
- Confidence and freshness: [V].
- Contradiction or open question: A5 assumes Postgres partitioning and pg-boss/graphile-worker; T01 decides the database and job runner. Rollups are a nightly SQL job in either case.
- Suggested requirement/decision impact: `AnalyticsEvent` in §4; the dashboard information model (overview, funnel, attempts, releases) is T09's screen built on this track's query endpoints.

### E08-15: Nothing in the prototypes implements a transaction log, override layer, release, save or branch; all are new code
- Claim / current behavior: `prototypes/ui-v0/site/js/dungeon.js` keeps `map {tiles[][], objects[]}` in `localStorage['ogm-map']` and undoes by pushing `JSON.stringify(map)` onto an 80-entry stack (`commit()`, `undo()`, `redo()`); objects have integer ids from a counter (`nextId = 100`). `prototypes/studio-v0/data.js` holds version strings (`'1.12.5'`) as card copy only. No patches, no actor, no rev, no server.
- Source and exact locus: `prototypes/ui-v0/site/js/dungeon.js` lines 60–79; `prototypes/studio-v0/data.js` lines 5–68; `prototypes/studio-v0/app.js` line 169 (`<dt>Version</dt>`).
- Why it matters: the planner should not look for reuse here; the prototype does show that objects-as-array with counter ids is what agents write by default, so the SDK schema rule (map keyed by id) needs lint, not just docs.
- Confidence and freshness: [V] 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: a `gm-sdk check` rule "entities are a map keyed by stable id; placed-entity ids are host-minted" (T10/T04).

### E08-16: The edit lease is a single writer per branch draft, fenced by `(leaseToken, baseRev)`; builds hold no lease; V1 takeover is only between the owner's own devices
- Claim / current behavior: `editLease {gameId, holderUserId, sessionId, token, expiresAt}` with a 15 s heartbeat and 2–3 min expiry; every write carries the token and `baseRev`; the server rejects stale tokens; takeover discards the old session's undo stack; same user on a second device takes over silently; admins cannot take over another adult's game in V1.
- Source and exact locus: B7 §6; release plan §6 Q5; decision log "Edit takeover: either side takes over instantly" (V3 with child accounts).
- Why it matters: the lease is per draft; with branches it must be per `(gameId, branchId)` or a creator cannot edit "Spooky monsters" on the iPad while the laptop idles on `main`.
- Confidence and freshness: [V]; per-branch scoping is [I].
- Contradiction or open question: none.
- Suggested requirement/decision impact: lease key `(gameId, branchId)`; `Transaction.leaseToken` in §4.

### E08-17: Watchers receive the same transaction stream the log persists; presence is a separate, unpersisted channel; `applyDesign` must be deterministic
- Claim / current behavior: B7 §9 reserves: the `{actor, rev, patches}` stream is broadcastable; lease = editor authority in a room; presence (cursor, reticle, selection) is ephemeral and filtered; globally unique host-minted entity ids; `applyDesign` deterministic given the doc. C2 §6 makes this V1 ("the design transaction stream and presence sent to watchers, matching the editor exactly").
- Source and exact locus: B7 §9 items 1–6; C2 "For ticketing" → Multiplayer bullet 9; decision log "Multiplayer".
- Why it matters: T07's room relays this track's `Transaction` records unchanged; the room must pin `(branchId, buildId)` and reject a transaction whose `branchId` differs.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: the backend exposes `GET /games/:g/branches/:b/transactions?after=<rev>` as SSE; the room subscribes once and fans out (T07's choice whether to proxy or let clients subscribe directly).

### E08-18: Changelogs are assembled without a model call from per-job change notes plus transaction labels
- Claim / current behavior: each aiur job writes `.gm/changes/<jobId>.md` with frontmatter `{bump, kind}` and one player-facing sentence; Publish concatenates notes since the last release's commit into an editable textarea; transaction labels are changelog inputs; a lint keeps prompts and personal details out of public changelogs.
- Source and exact locus: A5 §2.5 "Changelog without a model call", §8; A4 §7 item 6 ("Transaction labels feed changelog inputs"); spec §5.20 ("Assemble release notes from actual request/change summaries deterministically where possible").
- Why it matters: the note file is a contract with the coding agents' skills (T10): the skill must write it at job end.
- Confidence and freshness: [V].
- Contradiction or open question: with E08-7's counter scheme, `bump` in the frontmatter is unused; keep `kind` and `text` only.
- Suggested requirement/decision impact: `ChangeNote` in §4; a `gm changes add` CLI subcommand (T05) is the simplest way for skills to write it.

### E08-19: Drafts on a public repo are public from the first merge to `main`; the publication gate runs at merge and at fold
- Claim / current behavior: B7 §4.2 recommends option C, one deterministic content gate over every write to the public repo, and Q3 prefers keeping drafts on an unpublished branch "if aiur's branch model allows it". E08-9 shows aiur merges to the single base branch.
- Source and exact locus: B7 §4.2 table and Q3; A5 §2.2 option B (`main` = accepted draft line).
- Why it matters: with the release pointer model, "unpublished" means "not pointed at", not "not in Git".
- Confidence and freshness: [V] texts; the consequence is [I].
- Contradiction or open question: B7 Q3(b) is not achievable on aiur main without per-ticket base branches; (a) is what V1 gets. Creators who pick a public repo see their drafts' source in Git.
- Suggested requirement/decision impact: the fold passes the gate (T03 owns the gate; this track calls it and shows "these words will be public" at Publish); the repo-visibility explanation at creation (T09) must say drafts are in the repo.

### E08-20: The host has no database client installed; artifacts and GC become simpler when self-hosted
- Claim / current behavior: `which psql postgres sqlite3` finds nothing; `node` v24.14.0, `pnpm` present [M]. 2.8 TB free (brief).
- Source and exact locus: host check 2026-10-31; A5 §2.4 retention proposal (current plus two previous plus <14 days, GC'd builds rebuilt from the tag).
- Why it matters: A5's GC-and-rebuild path exists to save Railway storage; here it is not worth its failure mode ("rollback target was GC'd").
- Confidence and freshness: [M] host; [O] recommendation.
- Contradiction or open question: T01 picks the database; this track's tables are listed in §4 as types, not DDL.
- Suggested requirement/decision impact: V1 keeps every `tested` build artifact (`artifact: 'present'` always); drop the rebuild-from-tag path from the rollback ticket; keep `gc` in the enum for later.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Editor undo | `prototypes/ui-v0/site/js/dungeon.js` lines 70–79: whole-map JSON snapshot stack, 80 entries, localStorage; JS; tests: no | Replace | No patches, no attribution, no server; the design is A4's Immer transaction (E08-1) |
| Design doc shape | `dungeon.js` `map {tiles, objects[]}` with counter ids; JS; tests: no | Replace | Arrays with counter ids break patch merging (A4 §7 item 9) |
| Version display | `prototypes/studio-v0/data.js` `version` strings, `app.js` line 169; JS; tests: no | Keep as UI reference only | Card copy, not logic (E08-7) |
| Transaction / override / branch / release / save / achievement / analytics logic | none in repo | New TypeScript | E08-15 |
| Patch generation | immer 11.2.7 (MIT, 29k stars) per A4 §1 table | Adopt | `produceWithPatches` gives patches and inverse; meets the 1k rule |
| Save outbox | idb 8.0.4 (ISC, 7.4k stars) per A5 §1 | Adopt | Thin IndexedDB wrapper |
| Base-branch per ticket | aiur `tracker.base_branch` single value, `ensure_base_branch` repair; Elixir; tests: aiur's own | Gap, file upstream | E08-9 |
| Git writes (fold, branch, tag, fork) | T03 commit service (planned) | Consume | Only Git writer |
| Build artifacts, bucket paths | T05/T11 bucket (planned) | Consume | Content-addressed `/g/{gameId}/b/{buildId}/` |

## 4. Interfaces and contracts

Owner is this track unless stated. All ids are ULIDs; times are ISO strings.

```ts
// ---- Design log (shared package: this track; consumed by T04 host, T07 rooms, T09 editor) ----
export type Patch = { op: 'replace' | 'add' | 'remove'; path: (string | number)[]; value?: unknown }; // immer Patch
export type DesignDoc = {
  schemaVersion: number;
  globals: Record<string, unknown>;                 // scope:'global' control targets
  entities: Record<string, Entity>;                 // stable ids as keys, never arrays (A4 §7 item 9)
};
export type Entity = { id: string; prefab: string; level: string; origin: 'build' | 'creator'; props: Record<string, unknown> };

export type EditorCommand =                           // owner T04 (manifest); repeated here for completeness
  | { op: 'set'; control: string; targets: string[] | 'global'; value: unknown }
  | { op: 'invoke'; command: string; args: unknown; targets?: string[] }
  | { op: 'reset'; control: string; targets: string[] | 'global' };

export type Transaction = {
  id: string; gameId: string; branchId: string;
  rev: number;                                        // server-assigned, monotonic per branch
  baseRev: number;                                    // what the client applied against; must equal branch head
  leaseToken: number;                                 // B7 §6 fencing; 0 for kind:'system'
  actor: string;                                      // userId; the bot id for system/merge
  kind: 'manual' | 'system' | 'merge';                // system: re-apply, fold, switch-build, reset
  label: string;                                      // "Moved skeleton", "Switched to build 14"
  baseBuildId: string;                                // build whose base doc the patches were computed against
  commands: EditorCommand[];
  patches: Patch[]; inverse: Patch[];
  createdAt: string;
};
// POST /games/:g/branches/:b/transactions  body: Omit<Transaction,'id'|'rev'|'createdAt'>  → 200 {rev} | 409 {headRev} | 423 {lease}
// GET  /games/:g/branches/:b/transactions?after=<rev>   SSE of Transaction (T07 consumes)

// ---- Overrides as a reduction of the log ----
export type OverrideKey = `${string}@${string}`;      // `${controlId}@${entityId | 'global'}`
export type OverrideEntry = {
  key: OverrideKey; controlId: string; targetId: string | 'global';
  value: unknown; baseValueAtEdit: unknown; txId: string; rev: number;
  status: 'carried' | 'renamed' | 'needs_choice' | 'conflict' | 'dropped';
  reason?: 'value_invalid' | 'control_removed' | 'target_removed' | 'superseded_by_job' | 'builder_changed' | 'migration_failed';
};
export type EntityOverride =
  | { kind: 'create'; entityId: string; parent: string; prefab: string; props: Record<string, unknown>; txId: string }
  | { kind: 'delete'; entityId: string; txId: string };
export type WorkingSet = { gameId: string; branchId: string; buildId: string; headRev: number;
  entries: Record<OverrideKey, OverrideEntry>; entityOps: Record<string, EntityOverride> };
export type ReapplyReport = { gameId: string; branchId: string; fromBuildId: string; toBuildId: string;
  carried: OverrideKey[]; renamed: { from: OverrideKey; to: OverrideKey }[];
  needsChoice: { key: OverrideKey; mine: unknown; allowed: unknown }[];
  conflicts: { key: OverrideKey; mine: unknown; builder: unknown }[];
  dropped: { key: OverrideKey; reason: OverrideEntry['reason'] }[] };
// Manifest hints consumed (owner T04): manifest.overrides { aliases: Record<string,string>; retired: string[]; migrateOverride?(controlId, value): unknown | 'drop' }
// Structured request field consumed (owner T06, passed by T02): request.targetControls: string[]

// ---- Branches ----
export type Branch = {
  id: string; gameId: string; name: string;           // "Spooky monsters"; main is name:'main'
  gitRef: string;                                     // 'main' | `branch/${id}`
  forkPoint: { parentBranchId: string; parentRev: number; gitSha: string } | null;  // null on main
  headRev: number; latestBuildId: string | null;
  status: 'active' | 'archived' | 'merged'; createdBy: string; createdAt: string;
};
// replay(branch): fold(parent chain to forkPoint.parentRev) then branch transactions in rev order
// cap: 5 active per game (C2 §8 default); archive, never delete

// ---- Merge ----
export type FieldChange = { path: string; before: unknown; after: unknown; txId: string };   // path = JSON pointer
export type SideDelta = Record<string, FieldChange | 'deleted'>;                             // last write per path since fork
export type MergeConflict = { id: string; path: string; entityId?: string; controlId?: string;
  kind: 'both_changed' | 'delete_vs_edit' | 'control_removed';
  ours: FieldChange | 'deleted' | 'removed_by_build'; theirs: FieldChange | 'deleted' | 'removed_by_build';
  resolution?: 'ours' | 'theirs' | 'both' | { value: unknown } };
export type MergePlan = { id: string; gameId: string; sourceBranchId: string; targetBranchId: string;
  baseRev: number; auto: Patch[]; conflicts: MergeConflict[];
  code: 'clean' | 'fast_forward' | { conflictJobId: string };
  previewBuildId?: string; status: 'planned' | 'resolving' | 'previewing' | 'landed' | 'abandoned' };
// Algorithm: (1) base = replay(target) at forkPoint; ours = reduce(source txs since fork) and theirs = reduce(target txs since fork) to SideDelta, entity create/delete as tombstones, stroke patches reduced per chunk key.
// (2) per path: only one side changed → take it; both changed to deep-equal values → take it; otherwise MergeConflict (both_changed, delete_vs_edit, or control_removed when the other side's build retired the control).
// (3) auto patches + resolved conflicts become one Transaction{kind:'merge'} on the target; preview-build it; land on confirm; rollback applies its inverse.
// Voice tool shape for T06: resolve_conflict(planId, conflictId, resolution) and resolve_all(planId, 'ours'|'theirs'); read-only list_conflicts(planId) with side-by-side preview urls.

// ---- Builds and releases ----
export type Build = { id: string; gameId: string; branchId: string; gitSha: string; jobId?: string;   // aiur run id (T02)
  sdkVersion: string; saveSchemaVersion: number; migratesFromSchema?: number; achievementCatalogHash: string;
  status: 'building' | 'tested' | 'failed'; artifact: 'present' | 'gc'; createdAt: string };
export type OverrideSnapshot = { id: string; gameId: string; branchId: string; buildId: string; headRev: number;
  sha256: string; entries: OverrideEntry[] /* status carried|renamed only */; entityOps: EntityOverride[] };
export type Release = { id: string; gameId: string; seq: number; version: string;            // display number, E08-7
  buildId: string; snapshotId: string; gitTag: string;                                       // gm/<gameId>/v<version>
  kind: 'publish' | 'rollback'; restoresReleaseId?: string; predecessorReleaseId?: string;
  changelog: { summary: string; items: ChangeNote[] }; publishedBy: string; publishedAt: string };
export type ChangeNote = { jobId?: string; txId?: string; kind: 'fix' | 'add' | 'change' | 'remove'; text: string }; // .gm/changes/<jobId>.md
// games.publishedReleaseId: compare-and-set on publish and rollback
// GET /games/:g/published → { releaseId, version, buildUrl, changelog } with ETag; shell polls 60 s and on visibilitychange (A5 §2.4)
// POST /games/:g/publish {buildId, version?, changelog} → folds WorkingSet(main, buildId) into design/*.json via T03 (gate), tags, inserts Release, moves pointer
// POST /games/:g/rollback {releaseId} → new Release{kind:'rollback'} with counts of affected saves in the confirm payload

// ---- Saves ----
export type SaveSlot = { userId: string; gameId: string; slotId: 'auto' | '1' | '2' | '3'; kind: 'auto' | 'manual';
  label?: string; headRevision: number; status: 'ok' | 'needs_migration' | 'unsupported_old' | 'incompatible_after_rollback' };
export type SaveRevision = { userId: string; gameId: string; slotId: string; revision: number;
  branchId: string; buildId: string; releaseId?: string; saveSchemaVersion: number;
  payload: Uint8Array /* gzip JSON ≤ 512 KB */; sha256: string; deviceId: string; clientSeq: number;
  reason: 'pause' | 'checkpoint' | 'interval' | 'hidden' | 'manual' | 'migration' | 'update'; migratedFromRevision?: number; createdAt: string };
export type PlayLease = { userId: string; gameId: string; deviceId: string; tabId: string; expiresAt: string }; // 30 s heartbeat
// PUT /saves/:g/:slot  If-Match: <headRevision>  Idempotency-Key: <deviceId>:<clientSeq>  → 200 {revision} | 409 | 423 | 413
// SDK hooks consumed (owner T04): serialize(), restore(s), validateState(), describeSave(), canSaveNow(), migrate(prev)

// ---- Achievements and analytics ----
export type AchievementDef = { key: string; title: string; description: string; icon: string; hidden: boolean; progress?: { target: number }; retired?: boolean }; // achievements.json
// achievement_awards PK (userId, gameId, key), source 'client'|'room'|'admin', releaseId; INSERT ... ON CONFLICT DO NOTHING; drafts never write
export type AnalyticsEvent = { ts: string; gameId: string; branchId: string; releaseId?: string; env: 'draft' | 'published';
  pseudoUserId: string; sessionId: string; name: string; scope?: string; marker?: string; outcome?: 'complete' | 'fail' | 'quit'; props?: Record<string, unknown> /* ≤1 KB */ };
// SDK (owner T04 surface, this track's semantics): analytics.attemptStart(scope), attemptEnd(scope, outcome, markerId?), marker(id), complete()
```

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| T08-a | Design-log core package | `Transaction`, `Patch`, `DesignDoc` types; `apply/invert` with immer; `replay(branch)` with fork points; `reduce(log) → WorkingSet`; validation against manifest controls; property tests (replay(apply) round-trips, reduce is order-stable) | `packages/design-log/src/{types,apply,replay,reduce,validate}.ts` (layout per T12) | 3 | T04 manifest/`ControlDecl` types | The wire bridge to the iframe (T04); any UI |
| T08-b | Design-log API, lease and watcher stream | Tables for transactions, branches, leases; `POST/GET transactions` with `baseRev` and lease fencing (409/423); SSE stream; lease acquire/heartbeat/takeover | `services/api/src/design/{routes,store,lease}.ts`; migrations | 3 | T01 database, auth and session; T08-a | Room relay (T07); presence |
| T08-c | Re-apply overrides across builds | On `Build.status='tested'`: compute `ReapplyReport` with hints and `targetControls` supersession; expose `GET /branches/:b/reapply/:buildId`; "needs a choice" answers as system transactions | `services/api/src/design/reapply.ts`; `packages/design-log/src/reapply.ts` | 3 | T08-a; T02 build record with manifest; T06 `targetControls[]` field | The card UI (T09); manifest hint authoring rules (T10) |
| T08-d | Branches: create, switch, archive, per-branch builds | `Branch` rows, fork point capture, `branch/<id>` Git ref via T03, cap 5, archive; builds keyed by branch; version-number derivation (E08-7) | `services/api/src/branches/*`; `packages/design-log/src/version.ts` | 3 | T08-b; T03 commit service (create branch, tag) | aiur jobs on branches (gap, E08-9); merge |
| T08-e | Three-way design merge with voice-guided conflicts | `MergePlan` computation, conflict classification, resolution endpoints, merge transaction, preview build request, land/abandon, inverse on rollback; the T06 tool contract | `packages/design-log/src/merge.ts`; `services/api/src/branches/merge.ts` | 4 | T08-d; T02 "build this ref" call; T06 tool registration | Code-merge conflict jobs (T02); side-by-side preview rendering (T09/T10 `gm-verify`) |
| T08-f | Builds, releases, publish, fold, rollback, update indicator | `Build`, `OverrideSnapshot`, `Release`; deterministic fold to `design/*.json` through T03 behind the gate; `.gm/changes` assembly; `GET /published` with ETag; CAS pointer; rollback with affected-save counts; keep all artifacts (E08-20) | `services/api/src/releases/{publish,fold,rollback,changelog}.ts`; `packages/design-log/src/fold.ts` | 4 | T08-b; T03 commit service and content gate; T05 bucket paths for build artifacts | Build execution and `gm-verify` (T02/T10); the Publish screen (T09) |
| T08-g | Cloud saves: OCC, lease, outbox, migration gate | Save tables and endpoints (409/423/413, idempotency); SDK-side outbox (idb) and state machine; lazy one-step migration at load; rollback status marking; fixture test harness contract | `services/api/src/saves/*`; `packages/sdk/src/saves/{outbox,client}.ts` | 3 | T01 database; T04 save hooks | The slot UI (T09); recording fixtures in playtests (T10) |
| T08-h | Achievements | `achievements.json` lint, award/progress endpoints, catalog query, draft no-op with test toast flag, retired-key rules | `services/api/src/achievements/*`; `packages/sdk/src/achievements.ts`; `gm-sdk check` rule | 2 | T01 database; T04 SDK event path | Friends' views; room-authoritative awards |
| T08-i | Creator analytics events and rollups | Event ingestion with HMAC pseudonymisation and caps, nightly rollup job, creator query endpoints (overview, funnel, attempts, by release), draft exclusion, 90-day retention | `services/api/src/analytics/*`; `packages/sdk/src/analytics.ts` | 3 | T01 database and job runner | Build analytics (T01); dashboard screens (T09) |
| T08-j | Forks | `POST /games/:g/fork {releaseId}`: new game row with provenance, new repo and tag push via T03, snapshot and achievement-def copy, uploads copy, T05 rights check; nothing from saves/awards/analytics | `services/api/src/forks.ts` | 3 | T08-f; T03 repo creation; T05 rights check | Suggest-back / PR between forks |

## 6. Risks and unknowns

1. **aiur base branch per ticket (E08-9).** Decision: V1 code jobs run on `main` only; branches diverge in design state and in Git only through fold/merge. Default: yes; file upstream through T02. Alternative (a second aiur config per branch) is not worth it [O].
2. **Version-number scheme (E08-7).** Kevin's 2026-10-29 counter scheme vs A5 semver. Default: Kevin's, derived not stored; `saveSchemaVersion` stays the compatibility signal. Add to `questions-or-commands.md`.
3. **Branching in V1 at all (A1).** Default: data model plus basic screens. If Kevin says data model only, T08-e drops and T08-d shrinks to "main is a Branch row".
4. **Log reduction vs working set (E08-2).** Decision recorded here: log is truth, working set is cache. Spike (half a day): reduce 10k transactions with 2k entities in under 100 ms in Node; if not, persist the reduction incrementally per rev.
5. **Large stroke patches** (tilemap, heightfield). Default: the design schema stores terrain per chunk key (`chunks: Record<chunkId, …>`), so patches and merges are per chunk; T04 owns the schema rule.
6. **Public drafts (E08-19).** Default: accept; the gate runs at merge and fold; creation copy says drafts are in the repo.
7. **Rollback numbering (A5 D1) and draft reset (D11).** Default: new release with a new number; keep the working set, offer a reset checkbox.
8. **Fork rights on paid packs (E08-12).** Default: T05's check blocks forking into a public repo when the lockfile has non-redistributable assets.
9. **Database and job runner** are T01's; this track lists types only. If SQLite is chosen, `payload bytea` becomes `BLOB` and the nightly rollup is a `node` cron under systemd (T11).
10. **`fetch keepalive` 64 KB** for saves on hide (A5 unverified). Default: outbox first, upload on next launch if the body exceeds 60 KB.

## 7. Self-hosting notes

- Checked on the host (read-only, 2026-10-31): `node` v24.14.0 and `pnpm` at `~/.nvm/versions/node/v24.14.0/bin`; `psql`, `postgres`, `sqlite3` not on PATH [M]. T01 decides the store; nothing in this track needs a specific one.
- Build artifacts: keep every `tested` build on the local bucket (2.8 TB free); drop A5's GC-and-rebuild path from V1 (E08-20). `artifact: 'gc'` stays in the enum.
- Update discovery: A5 chose polling because Railway SSE was unverified; here SSE through the local reverse proxy (T11) is fine, but polling `GET /published` with an ETag every 60 s is still the simpler default and costs nothing [O].
- The fold, branch, tag and fork writes all go through the local commit service (T03) with the creator's GitHub repo (A11) as the remote; no GitHub Actions minutes are spent by this track.
- Rollups, retention and lease expiry are periodic jobs: one `node` process under a systemd user unit (T11 pattern from `scripts/drive-sync/ogm-drive-sync.service`) rather than a queue product.
- Nothing in this track talks to a paid service; no keys.
