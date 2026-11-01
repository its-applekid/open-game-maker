# OGM-012 plan — policy module, families, games, invitations

## 1. Problem frame

Authorization is one tested module every route calls (R5); families have an owner and admins who manage members and invites but can never take over an adult's game (R3); invitations are single-use hashed tokens bound to an email with kinds member/play/room, family-only unless an admin flips the switch (R4); each creator's games live in their own GitHub, one repo per game, created by the platform (R6). The rules exist in A7 and the release plan; this ticket turns them into code and tables with no UI.

Requirements trace: R3 → `families`, `family_members`, owner rules, `admin.*` actions. R4 → `invitations` table, `tokens.ts`, `friends_allowed`. R5 → `packages/policy` with the matrix as a test table. R6 → `games`, `github_connections`, `RepoProvisioner`.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.3/A7-infra-auth-git-multiplayer.md` lines 153–181 (the matrix) and 193–200 (invitation implementation). Copy each row into `test/matrix.test.ts` as `{ actor, action, resource, expect }`, dropping Guardian, Accountless guest and "Mark invitee as child".
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs` lines 30–40 (`effective()`: ceiling then forbids, deny-wins reduction). Copy the "compute allows, then apply denies, deny wins" structure for `authorize`.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-010-plan.md` U3 (context mounting), U4 (`registry.gameResolver`), U1 (schema file + timestamped migration).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T03-sandbox-and-commit.md` lines 193–203 (`CommitOp.create_repo`, `POST /internal/commit`). Copy the request shape into `repo-provisioner.ts`.

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest; API binds `127.0.0.1`; secrets only from `packages/config` names; no dependency below 1k stars (this ticket adds none); PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — `packages/policy`

Goal: a pure function with the matrix as its test.

Files: Create `packages/policy/package.json` (`@ogm/policy`, no runtime deps), `tsconfig.json`, `src/index.ts`, `src/authorize.ts`, `src/types.ts`, `test/matrix.test.ts`, `test/precedence.test.ts`.

Approach: `authorize(actor, action, resource)` evaluates, in order: (1) `resource.familyId && resource.familyId !== actor.familyId` → deny `cross_family` (maintainer included unless `resource.audit`); (2) maintainer → allow, with `reason: 'audited'` when the action is an owner action on another's game and `resource.audit === true`, else deny `audit_required`; (3) owner actions (`game.edit`, `game.publish`, `job.create`, `job.cancel`) → allow iff `resource.ownerId === actor.userId` and, for `game.create`/`job.create`, `actor.capability === 'creator'`; (4) admin actions (`admin.*`, `game.delist`, `report.view`) → allow iff `actor.platformRole === 'admin'`; (5) `member.invite` → admin any kind; creator `play`/`room` only; player never; (6) `game.play` → listed → allow; private → owner or `resource.granted === true`; (7) `game.fork` → creator, listed or own; (8) `report.file` → any user; (9) default deny `not_allowed`. Return `{ ok: false, reason }` with stable snake_case reasons. No I/O. Export the `Action` list as a const array so routes can type-check names.

Interface sketch:
```ts
export type Actor = { userId: string; platformRole: 'maintainer'|'admin'|'none'; capability: 'creator'|'player'; familyId: string };
export type Action = /* T01 list */ | 'admin.members.manage' | 'admin.settings.set' | 'admin.analytics.read' | 'game.delist' | 'report.view';
export type Resource = { gameId?: string; ownerId?: string; familyId?: string; visibility?: 'listed'|'private'; inviteKind?: 'member'|'play'|'room'; targetRole?: 'owner'|'admin'|'member'; granted?: boolean; audit?: boolean };
export function authorize(actor: Actor, action: Action, resource: Resource): { ok: true; reason?: 'audited' } | { ok: false; reason: string };
```

Test scenarios: Given the matrix rows, when each is evaluated, then the expectation holds (table test, one `it` per row with the row in the name). Given an admin and `game.edit` on another member's game, then `{ ok: false, reason: 'not_owner' }`. Given a maintainer editing another's game without `audit`, then denied `audit_required`; with it, ok `audited`. Given any actor and a resource from another family, then `cross_family`. Given a creator inviting `member`, then denied.

Execution note: test-first; the matrix file is written before `authorize.ts`.

### U2 — tables and migration

Goal: the five tables exist with the constraints the rules need.

Files: Create `packages/db/src/schema/accounts.ts`, `packages/db/migrations/<ts>_accounts.sql`. Modify `packages/db/src/schema/index.ts` (append one line).

Approach: Drizzle `sqliteTable` definitions mirroring the ticket's table list; `families.owner_user_id` and `family_members` foreign keys to OGM-011's `user.id`; `UNIQUE(invitations.token_hash)`; index `invitations(family_id, email)`; `CHECK` on the enum columns. The migration SQL is hand-written from the Drizzle definitions (or `pnpm --filter @ogm/db generate --name accounts`), reviewed for SQLite syntax.

Test scenarios: Given a fresh DB, when migrated, then inserting a second `owner` for the same family is rejected by application code (not SQL; one owner is enforced in `families.ts`). Given a duplicate `token_hash`, then SQLite rejects it.

### U3 — accounts context

Goal: `me`, family creation, member listing; owner invariants.

Files: Create `services/api/src/accounts/routes.ts`, `services/api/src/accounts/families.ts`. Test `services/api/test/accounts.test.ts`.

Approach: `GET /api/v1/me` → `{ user: { id, email }, family: { id, name, role, capability } | null, platformRole }` from the principal. `POST /api/v1/families { name }` → creates the family, inserts the caller as `owner`/`creator`, 201; a user already in a family gets 409 `already_in_family` (V1: one family per user). `GET /api/v1/families/:id/members` → policy `admin.members.manage` or own family read (members see names and roles only). `families.ts` exports `removeMember(familyId, userId)` (409 `owner_immutable` for the owner), `setRole`, `setCapability` for OGM-017.

Interface sketch:
```ts
export function actorFromPrincipal(p: Principal & { kind: 'user' }): Actor;
export function removeMember(db, familyId: string, userId: string): void;   // throws HttpError(409,'owner_immutable')
```

Test scenarios: Given a fresh user, when `POST /families`, then 201 and the user is owner. Given the owner, when `removeMember(owner)`, then 409. Given a member of family A, when `GET /families/B/members`, then 403 `cross_family`.

### U4 — games context and repo provisioning

Goal: a creator makes a game row and gets a repo in their GitHub through the commit service.

Files: Create `services/api/src/games/routes.ts`, `services/api/src/games/games.ts`, `services/api/src/games/repo-provisioner.ts`. Test `services/api/test/games.test.ts`.

Approach: `POST /api/v1/github/connect { login, installationId }` stores the creator's connection (the App installation on their account; the OAuth/App install UI is OGM-072). `POST /api/v1/games { title, repoVisibility }` → `authorize(actor,'game.create',{familyId})`; requires a `github_connections` row (409 `github_not_connected`); inserts the game with `visibility: 'private'` by default and `repo_url NULL`; calls `provisioner.provision(...)`; on success updates `github_owner/repo/repo_url`; on failure 502 and the row stays for `POST /games/:id/provision` retry. `CommitServiceRepoProvisioner` posts `{ kind: 'create_repo', gameId, owner: login, visibility, templateRef }` to `OGM_COMMIT_INTERNAL_URL + '/internal/commit'` with `Authorization: Bearer OGM_COMMIT_SERVICE_TOKEN`, 30 s timeout; `templateRef` from env `OGM_GAME_TEMPLATE_REF` (default `templates/game-2d@main`, refreshed when OGM-036 lands). `GET /api/v1/games` lists family games with `delisted_at IS NULL` and the caller's own private ones; `PATCH` allows `title` and `visibility` for the owner only. Register `registry.gameResolver = (id) => select family_id, owner_id, visibility`.

Interface sketch:
```ts
export interface RepoProvisioner { provision(input: { gameId: string; title: string; owner: { login: string; installationId: string }; visibility: 'public'|'private' }): Promise<{ owner: string; repo: string; url: string }> }
```

Test scenarios: Given a creator with a connection, when `POST /games`, then 201, the provisioner was called once with the game id, and the row has `repo_url`. Given no connection, then 409. Given a player, then 403. Given the provisioner throws, then 502 and `repo_url` is null; a retry succeeds. Given an admin, when `PATCH` another's game, then 403 `not_owner`. Given `resolveGame(id)`, then `{ familyId, ownerId, visibility }`.

### U5 — invitations context

Goal: hashed single-use tokens with the allowlist switch and rate limit.

Files: Create `services/api/src/invites/routes.ts`, `services/api/src/invites/tokens.ts`, `services/api/src/invites/invites.ts`. Test `services/api/test/invites.test.ts`.

Approach: `tokens.ts`: `mint()` → `{ token: base64url(randomBytes(16)), hash: sha256hex(token) }`; `hashOf(token)`. `createInvitation({ familyId, kind, email, capability?, gameId?, roomId?, inviterId })`: policy `member.invite` with `inviteKind`; if the email is not a family member's and `kind !== 'member'` and `families.friends_allowed = 0` → 403 `friends_not_allowed`; rate limit 10 per inviter per 24 h (count rows) → 429; expiry 72 h; sends mail through OGM-011's `MailSender` with `${OGM_APP_ORIGIN}/join/${token}` (`member` kind: `/invite/${token}`; OGM-072/052 own the pages). `accept(token, session)`: lookup by hash; 404 unknown, 410 used/expired/revoked, 403 email mismatch; `member` → insert `family_members` with the stored capability; `play` → insert a `game_grants(game_id, user_id)` row (add to the migration: `game_grants(game_id, user_id, source_invite_id, PRIMARY KEY(game_id,user_id))`); `room` → returns `{ kind: 'room', roomId, gameId }` for OGM-052 to mint the grant. `DELETE /invites/:id` sets `revoked_at` (inviter or admin).

Interface sketch:
```ts
export function createInvitation(db, mail, input: CreateInvitationInput): Promise<{ id: string; expiresAt: string }>;
export function acceptInvitation(db, token: string, session: { userId: string; email: string }): Promise<AcceptResult>;
```

Test scenarios: Given an admin, when inviting `member`, then 201 and one outbox row with the link. Given a creator inviting `member`, then 403. Given `friends_allowed = 0` and a `play` invite to an outsider, then 403; with it on, 201. Given the token accepted twice, then 410 on the second. Given 11 invites in a day, then 429 on the 11th. Given acceptance by a session with another email, then 403.

## 4. Verification

```
pnpm --filter @ogm/policy test
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- accounts games invites
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: the policy row count and pass count, the API test counts, and the migration name applied.

## 5. Deferred to implementation

- One family per user in V1 (default yes; a second family is 409).
- `templateRef` value before OGM-036 exists: `templates/game-2d@main`.
- Whether `GET /games` includes delisted games for admins: yes with `?includeDelisted=1` under `game.delist`.
- Invite mail wording: one line with the link; no tagline.
- Name of the explicit grant table: `game_grants` (default) unless OGM-052 already named one at pickup.

## 6. Scope boundaries

- Sessions, mail sending, age gate: OGM-011. Admin member/allowance/allowlist routes: OGM-017. Room creation, grants, `/join` page: OGM-052. Repo creation on GitHub: OGM-035. Publish-time rights enforcement (forcing private): OGM-062/OGM-045. Screens: OGM-072, OGM-073.

## 7. Risks

- OGM-035's `commit.ts` may not be merged when this starts (same phase window): default: code `CommitServiceRepoProvisioner` against the quoted T03 §4 shape and keep `NullRepoProvisioner` as the test default; the PR notes which was verified.
- A7 rows marked "Kevin decides" (player fork, admin activity scope): default: player fork denied; admin sees own-family analytics (A12 drops suppression for adults).
- Matrix drift when OGM-017 or OGM-052 need a new action: default: append to `Action` and add rows; never change an existing row without the Executor.
