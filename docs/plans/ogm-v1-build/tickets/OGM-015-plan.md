# OGM-015 plan — report intake, signatures, deterministic routing, repair admission

## 1. Problem frame

A player presses one button; the platform must decide, by rules alone, whether that is a game crash worth an agent, a platform bug for the operator, a tuning complaint the editor can fix for free, or something to count and keep. It is the only path where a player can cause spend, so the rules and the admission call are the guard (R68, B8 §6). Bundles are private; GitHub sees redacted metadata only; platform issues never carry `agent:todo`.

Requirements trace: R68 → one `POST /reports`; private bundle through `BlobStore`; signature dedupe; deterministic routing; repair via `admit({ kind: 'repair' })` sharing edit slots; reproducible crashes only; `REPAIR_ATTEMPTS` in the plan's acceptance criteria for the promise test; platform route through `IssueWriter` without `agent:todo`.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B8-aiur-integration-budgets-bugs.md` lines 136–170: classification order, dedupe, game and platform routes, retry policy. The rule table in `classify.ts` follows that order.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-013-plan.md` U4 (`admit` signature, 402 shape) and U1 (`repair` size-class rows).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T05-asset-pipeline.md` line 223 (`FsBlobStore` keys `private/...`) and OGM-005's `BlobStore` interface (refresh from `packages/blob-store/src/index.ts` at pickup).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-010-plan.md` U3 (context mounting), U6 (fixtures).

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest; API binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — tables and migration

Goal: reports, signatures and the operator queue.

Files: Create `packages/db/src/schema/reports.ts`, `packages/db/migrations/<ts>_reports.sql`. Modify `packages/db/src/schema/index.ts`.

Approach: the three tables from the ticket; `reports.error_json` holds the validated `ReportError`; `reports.text` ≤ 2000; indexes `reports(game_id, created_at)`, `reports(signature)`; `report_signatures` keyed by signature with `scope` and nullable `game_id`.

Test scenarios: Given the migration, then inserting two `report_signatures` with the same signature fails.

### U2 — signature

Goal: a stable hash for "the same bug".

Files: Create `services/api/src/reports/signature.ts`. Test `services/api/test/reports-signature.test.ts`.

Approach: `normaliseMessage(s)`: lower-case, collapse whitespace, replace `[0-9a-f]{8,}` with `#`, then digits with `#`, trim to 300. `frameKey(f)`: strip origin and `/g/<gameId>/<buildId>/` prefix from `file`, append `:` + lower-cased `fn` or `?`. `signature({ error, gameId, scope })`: `sha256(type.toLowerCase() + '|' + normalised + '|' + top3.map(frameKey).join(',') + (scope === 'game' ? '|' + gameId : ''))` hex. `textSignature({ gameId, releaseId, text })` for no-error reports: `sha256(gameId|releaseId|normaliseMessage(text))`.

Interface sketch:
```ts
export function signature(input: { error: ReportError; gameId: string; scope: 'game'|'platform' }): string;
export function textSignature(input: { gameId: string; releaseId?: string; text: string }): string;
```

Test scenarios: Given messages differing only in a number or a hex id, then equal signatures. Given the same error in two games with `scope: 'game'`, then different; with `scope: 'platform'`, then equal. Given frames in a different build path, then equal (build id stripped).

Execution note: test-first.

### U3 — classifier

Goal: the rule table, pure.

Files: Create `services/api/src/reports/classify.ts`, `services/api/src/reports/policy.ts`. Test `services/api/test/reports-classify.test.ts`.

Approach: `classify(input: { report: CreateReport; gameId; existing: { gameScopedSeenInOtherGame: boolean; openSignature?: { jobId?: string } ; wrongBehaviourCount: number } })` returns `{ route, reproduction, reason, attach?: { jobId } }` applying rules 1–6 from the ticket. `isPlatformFrame(file, gameId)` with the regex from the ticket plus "not under `/g/<gameId>/`". `EDITOR_HINT_PATTERNS` in `policy.ts` with the three regexes; the hint route also returns `hint: { control?: string }` guessed only from an exact keyword map (`speed`, `volume`, `size`, `count`), else absent.

Interface sketch:
```ts
export type Classification = { route: ReportRoute; reproduction: 'crash_with_error'|'wrong_behaviour'|'not_reproducible'; reason: string; attachJobId?: string };
export function classify(input: ClassifyInput): Classification;
```

Test scenarios: one `it` per rule with a minimal input, plus: a host frame first and game frames after → `platform`; game frames only → `game_repair`; `existing.openSignature.jobId` → `attachJobId` set and route `game_repair`; "too fast" → `editor_hint`; `wrongBehaviourCount: 2` (this is the third) → `game_repair` with reproduction `wrong_behaviour`; empty text and no error → `stored`.

### U4 — store, route, bundle

Goal: the HTTP surface and persistence.

Files: Create `services/api/src/reports/store.ts`, `services/api/src/reports/routes.ts`. Test `services/api/test/reports-route.test.ts`.

Approach: `POST /` (prefix `/api/v1/reports`): `requirePrincipal(['user'])`, `resolveGame` → 404; `authorize(actor, 'report.file', { gameId, familyId, visibility, granted })`; compute the game-scoped and platform-scoped signatures; load `existing` from `report_signatures` (another game's row with the platform signature's game-scoped twin; cheapest: store both `game_sig` and `platform_sig` on `reports` and query by `platform_sig` where `game_id != this`); `classify`; insert the report; upsert `report_signatures` (`count + 1`, `last_at`); if `game_repair` and no `attachJobId` → U5; if `platform` → U6; respond `CreateReportResponse` plus `pendingBudget?: true` when admission returned 402 (an additive field; document in the PR, do not change the contract file's required set). `POST /:id/bundle`: reporter only, `content-length` ≤ `OGM_REPORT_BUNDLE_MAX_BYTES`, `blobStore.put('private/reports/' + id, bytes, { contentType })`, store `bundle_key`. `GET /?gameId=` under `report.view`; `GET /:id/bundle` admin → `blobStore.signedGet(key)` → 302. `GET /platform-queue` admin.

Interface sketch:
```ts
// POST /api/v1/reports → 201 CreateReportResponse & { pendingBudget?: true }
// POST /api/v1/reports/:id/bundle (octet-stream ≤ 2 MB) → 204
```

Test scenarios: the worked example twice → one job, `count: 2`. A player without play access → 403. Bundle 3 MB → 413 and no blob. `GET /:id/bundle` as owner → 403, as admin → 302 to a signed URL (fake store returns a URL). Rate limit: the 21st report in an hour → 429.

### U5 — repair admission

Goal: a repair job that cannot leak and cannot overspend.

Files: Create `services/api/src/reports/repair.ts`. Test `services/api/test/reports-repair.test.ts`.

Approach: `admitRepair(deps, report, classification)`: owner actor from `resolveGame().ownerId` and the owner's membership (via `actorFromPrincipal`-style helper over `family_members`); `plan = { title: 'Repair: <signature[0:8]>', summary: 'Crash in release <releaseId ?? draft>. Reproduction: crash_with_error. Report <reportId>.', scope: { included: ['fix the crash', 'add a failing promise test that passes after the fix'], excluded: ['new features'] }, tickets: [{ key: 'repair', skills: ['gm-repair','gm-verify'], dependsOn: [], acceptanceCriteria: ['gm test green', 'promise test present', `at most ${REPAIR_ATTEMPTS} attempts`] }] }`; `admit(deps, { gameId, branchId: 'main', kind: 'repair', complexity: 2, plan, start: 'now', idempotencyKey: 'repair:' + signature }, ownerActor)`; on 202 set `report_signatures.open_job_id`, `reports.job_id`; on 402 return `{ pendingBudget: true }` and leave the signature `open` without a job (a later report retries). Diagnostics never enter the plan; OGM-031's `after_create` bundle (T02 §4) is where `reportId` → bundle is resolved for the agent, through this ticket's `GET /internal/reports/:id/diagnostics` (service principal `builder`) returning the signed bundle URL and the frames.

Interface sketch:
```ts
export async function admitRepair(deps, report: ReportRow, sig: string): Promise<{ jobId?: string; pendingBudget?: true }>;
```

Test scenarios: Given a free edit slot and allowance, then a job with `kind: 'repair'`, `reservation.sizeClass: 'medium'` and amount = `repair/medium` p80. Given the plan, then it contains no `text`, no frames, no bundle key. Given 402 from `admit`, then `pendingBudget` and `open_job_id` null. Given `GET /internal/reports/:id/diagnostics` with a user principal, then 401; with the builder service token, then the frames and a signed URL.

### U6 — `IssueWriter` seam

Goal: platform reports reach the operator without a daemon.

Files: Create `services/api/src/reports/issue-writer.ts`. Test (in `reports-route.test.ts`).

Approach: `StoredIssueWriter(db).file({ title, body, labels })` inserts `platform_issue_queue` with `status: 'pending'` and returns `{ ref: 'queue:<id>' }`; `body` = `Signature <sig>\nType <type>\nMessage <normalised>\nFrames <frameKeys>\nGames affected <n>`; labels `['bug','source:report']` and never `agent:todo`. `selectIssueWriter(env)`: `CommitServiceIssueWriter` only when `packages/contracts/commit.ts` exports a `file_issue` member of `CommitOp` (check at pickup; default absent → stored). `report_signatures.platform_ref` stores `ref`.

Test scenarios: Given a platform report, then one queue row whose body contains the normalised message and no raw `text`, and labels exclude `agent:todo`. Given the same platform signature again, then no second row and `count: 2`.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- reports
pnpm -r typecheck && pnpm -r lint
curl -s -X POST http://127.0.0.1:$OGM_API_PORT/api/v1/reports -H "cookie: $SESSION" -H 'content-type: application/json' -d @packages/contracts/fixtures/reports/create.request.json
```
Paste into `## Local tests`: test counts, the worked example's 201 body twice (same signature, one `jobId`), and the platform-queue row body.

## 5. Deferred to implementation

- `WRONG_BEHAVIOUR_REPAIR_AT`: 3. `REPAIR_ATTEMPTS`: 2. Fraction: through OGM-013's `repair` rows (one third).
- Whether `editor_hint` carries a guessed control name: only from the exact keyword map; otherwise absent.
- Platform frame detection list: the regex in the ticket only; `@gm/sdk` frames are deliberately not platform frames, because SDK-only frames are "ambiguous" and go to game repair first (B8 rule 4).
- Bundle content type allow-list: `application/octet-stream`, `application/json`, `application/gzip`.

## 6. Scope boundaries

- Button, bundle builder, redaction inside the bundle: OGM-071, OGM-022. Repair skill, promise test, attempts handling: OGM-096 (skill) and OGM-031/aiur (dispatches). GitHub platform issue identity and `file_issue` op: OGM-035/OGM-039. Operator UI: OGM-079. Running-job attach of a new report to an in-flight ticket (comment on the issue): OGM-031's `after_create` reads the queue; this ticket only records `attachJobId`.

## 7. Risks

- Source-mapped frames may not be available in the bundle: default: classify on the raw `file` strings; the rule "outside `/g/<gameId>/`" still works for host frames.
- The owner pays for a player's report: default per R68 ("sharing edit slots") and A2 (family only); the `pendingBudget` path prevents overspend; a per-user hourly cap prevents floods.
- No GitHub filing in V1 for platform bugs: default: stored queue + admin route; flagged for the Executor as a gap to close with a `file_issue` commit op.
