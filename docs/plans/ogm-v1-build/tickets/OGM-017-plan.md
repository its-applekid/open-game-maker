# OGM-017 plan — admin routes over existing functions

## 1. Problem frame

Admins need one place to run the family: members, admins, invites, allowances, reset zone, slots, the platform cap, oversight of games, intake status and the admin mail inbox (R3, R84). The semantics already live in OGM-011/012/013; this ticket is the authorization-checked surface over them plus a tolerant reader of the intake files. Its value is the policy table test: every route against four actors.

Requirements trace: R3 → members, peer admins, invites, allowances, concurrency, oversight (delist), owner immutability. R84 → `GET /intake` read-only from the files; folder id never exposed.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-012-plan.md` U1 (matrix table test) and U3/U5 (`removeMember`, `setRole`, `createInvitation` signatures).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-013-plan.md` U3 (`settings.ts`, `allowance.ts`, `remaining`).
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/drive_sync.py` and `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/README.md` (the producer of `queue.jsonl` and the quarantine layout; verify the exact file names at pickup against `drive_sync.py`'s constants) and T05 §4 line 225 (the intake job contract).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-011-plan.md` U3 (`listOutbox`, `markOpened`).

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest; API binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — route skeleton and the policy table

Goal: every admin route exists and is denied correctly before any logic.

Files: Create `services/api/src/admin/routes.ts`, `services/api/src/admin/shapes.ts`. Test `services/api/test/admin-policy-table.test.ts`.

Approach: `routes.ts` exports `prefix = '/api/v1/admin'`; a middleware resolves `actor = actorFromPrincipal(user)` and attaches `familyId`; each handler starts with `const a = authorize(actor, ACTION, { familyId }); if (!a.ok) throw new HttpError(403, a.reason)`. Routes and actions as in the ticket's Scope. `shapes.ts` holds `MemberRow`, `BudgetOverview`, `IntakeDrop` and the request bodies. The table test seeds two families (X: owner, admin, member creator, member player; Y: admin) and asserts the status of every route for each actor (`200/204` vs `403`, owner cases `409`), one `it` per row named `<method> <path> as <actor>`.

Interface sketch:
```ts
// GET|PATCH|DELETE /api/v1/admin/members[/:userId]   GET|DELETE /invites[/:id]   GET|PATCH /settings   GET /allowances  PUT /allowances/:userId
// GET /budget   GET /games  POST /games/:id/delist|relist   GET /intake   GET /mail  POST /mail/:id/opened
```

Test scenarios: the table (≥ 40 rows). Family Y's admin on any X route → 403 `cross_family` (the route uses the principal's family, so Y's admin simply sees Y; the test asserts X's ids are not visible and X-scoped ids 404).

Execution note: test-first; the table is written before handlers.

### U2 — members, admins, invites, mail

Goal: delegate to OGM-012 and OGM-011 with the owner rules.

Files: Modify `services/api/src/admin/routes.ts`. Test `services/api/test/admin-members.test.ts`.

Approach: `GET /members` joins `family_members` with `user` (email) and `allowances`, adding `remainingMicroUsd` from OGM-013's `remaining()`. `PATCH /members/:userId`: target owner → 409 `owner_immutable`; `role: 'admin'`/`'member'` requires the caller to be the owner when the target is an admin (peer-admin demotion rule) else 403 `owner_only`; `capability` any admin; implemented through `setRole`/`setCapability`. `DELETE /members/:userId` → `removeMember` (409 for the owner); in-flight jobs of a removed creator are cancelled through OGM-013's queued cancel and flagged for OGM-033 (`job.changed` with `state: 'cancelled'` only for `queued`; running ones are left to OGM-033's cancel, called if its export exists at pickup). `GET /invites` → family invites; `DELETE /invites/:id` → revoke. `GET /mail?unopened=1` → `listOutbox`; `POST /mail/:id/opened` → `markOpened`.

Test scenarios: Given the owner, when demoting an admin, then 200; given an admin doing it, then 403. Given `DELETE` of the owner, then 409. Given an invite created by a creator, when the admin revokes, then 204 and acceptance → 410. Given a magic link in the outbox, when listed unopened, then present; after `opened`, absent.

### U3 — settings, allowances, budget overview

Goal: the money settings, visible and validated.

Files: Modify `services/api/src/admin/routes.ts`. Test `services/api/test/admin-settings.test.ts`.

Approach: `GET /settings` → `FamilyBudgetSettings` merged with defaults plus `friendsAllowed`. `PATCH /settings`: Zod partial; `resetZone` must be in `Intl.supportedValuesOf('timeZone')`; `microUsdPerUnit ≥ 1`; `slots` integers 0–8; `platformCapMicroUsd ≥ 0`; writes through OGM-013's `settings.ts` (`upsertSettings`) and OGM-012's `families.friends_allowed`; emits `budget.changed` for the family (every member) so OGM-018 refreshes briefings. `PUT /allowances/:userId { dailyMicroUsd }` → `upsertAllowance`; emits `budget.changed`. `GET /budget` → `BudgetOverview` from `remaining()` per member, `familyDayTotal`, counts of slot-holding jobs by slot, queued job ids.

Test scenarios: Given `resetZone: 'Mars/Olympus'`, then 400. Given a new allowance, then `remaining` reflects it. Given one running `new_game` and two running edits, then `inUse: { new_game: 1, edit: 2 }`. Given the platform cap set, then both `GET /settings` and `GET /budget` return it.

### U4 — games oversight

Goal: list, delist, relist without editing.

Files: Modify `services/api/src/admin/routes.ts`. Test (in `admin-policy-table.test.ts` plus two cases in `admin-settings.test.ts`).

Approach: `GET /games?includeDelisted=1` → family games with `delistedAt`; `POST /games/:id/delist` → `game.delist` → sets `delisted_at` (the owner may still open it; it disappears from the picker, OGM-073); `relist` clears it. No field of the game other than `delisted_at` is writable here (R3: admins never edit another adult's game).

Test scenarios: Given an admin, when delisting another member's game, then 200 and `GET /api/v1/games` (OGM-012) omits it while the owner's `GET /games/:id` still works. Given an admin `PATCH /api/v1/games/:id` (OGM-012 route), then 403 (regression guard that this ticket adds no edit path).

### U5 — intake status reader

Goal: R84 without touching the Drive worker.

Files: Create `services/api/src/admin/intake-status.ts`. Test `services/api/test/admin-intake.test.ts` with `services/api/test/fixtures/intake/*`.

Approach: `readIntake(dir)`: if `dir/queue.jsonl` is absent → `{ drops: [], parseErrors: 0 }`; read lines, `safeParse` each as `{ drop_id, name, manifest, time }`; for each, resolve `manifest` under `dir` (`path.resolve` + `realpath` must start with `realpath(dir)`, else skip and count); read sibling `intake.json` if present (`status`, `collection`, `license`, `confirmed_by`, `date`) else `status: 'queued'`; read `manifest.json` `problems.length` if present. Return `IntakeDrop[]` newest first. Route `GET /intake` → `{ drops, parseErrors }`.

Interface sketch:
```ts
export function readIntake(dir: string): { drops: IntakeDrop[]; parseErrors: number };
```

Test scenarios: Given the fixture dir, then two drops, one `imported` with `problems: 2`, one `queued`. Given a `manifest` path pointing outside the dir, then it is skipped and counted. Given no dir, then empty. Given a corrupt line, then `parseErrors: 1` and the rest parsed.

## 4. Verification

```
pnpm --filter @ogm/api test -- admin
pnpm -r typecheck && pnpm -r lint
curl -s http://127.0.0.1:$OGM_API_PORT/api/v1/admin/budget -H "cookie: $ADMIN_SESSION"
curl -s http://127.0.0.1:$OGM_API_PORT/api/v1/admin/intake -H "cookie: $ADMIN_SESSION"
```
Paste into `## Local tests`: the policy-table row count and result, the `GET /budget` JSON (abbreviated), and the intake fixture output.

## 5. Deferred to implementation

- Whether removing a creator cancels running jobs here: only queued ones here; running cancel is OGM-033's export when present (default: emit and leave).
- `slots` upper bound: 8.
- Whether `GET /members` includes `platformRole`: yes, derived (maintainer allow-list is env, shown read-only).
- Intake file names: verify against `drive_sync.py` constants at pickup (default from T05 §4: `queue.jsonl`, `manifest.json`, `intake.json`).

## 6. Scope boundaries

- Screens: OGM-079. Analytics reads: OGM-014. Job controls: OGM-013/OGM-033. Intake processing: OGM-064. Member and invite semantics: OGM-012. Mail store: OGM-011. Cross-family operator console: none in V1 (maintainer uses `audit`).

## 7. Risks

- Route count makes the table test long: default: generate rows from a route manifest in the test file; one assertion per row.
- Intake layout may change when OGM-064 lands: default: the reader is tolerant and the fixture is updated by OGM-064's PR if names move (named in its ticket's sibling section by reference to this reader).
- Demoting the last admin besides the owner: allowed (the owner remains an admin by definition).
