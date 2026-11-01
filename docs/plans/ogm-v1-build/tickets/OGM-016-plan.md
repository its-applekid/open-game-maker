# OGM-016 plan — Web Push, SSE feed, three triggers

## 1. Problem frame

A creator on a phone should learn that a build finished, that a queued change started, or that an asset drop was processed, without a vendor and without polling (R67, spec §5.22). Web Push with self-generated VAPID keys costs nothing; an SSE feed covers the open tab; both are driven by one typed trigger that other tickets emit. This ticket is the server half; the browser half is OGM-071.

Requirements trace: R67 → VAPID keys generated locally; `push_subscriptions`; `notifications` with `read_at`; `GET /api/v1/notifications/stream`; the three triggers delivered to rows, streams and push.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-010-plan.md` U5 (`AppEvents` subscription), U4 (service principal) and U3 (mounting). The scanner only loads `src/<context>/routes.ts`, so this context's one router exports `prefix = '/'` and writes absolute paths: the four `/api/v1/push/*` and `/api/v1/notifications/*` routes and the `/internal/notifications/emit` route live in the same file.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T11-hosting-and-ops.md` E11-10 (0600 files under `~/.config/ogm`, never log values): `vapid.ts` follows the same handling as any secret file.
- Hono's streaming helper (`hono/streaming` `streamSSE`) for the feed; copy the keepalive comment pattern (`: ping`) every 25 s, the same period aiur's events channel uses (E02-6).

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest; API binds `127.0.0.1`; secrets only from `packages/config` names (the VAPID file path is a name; the keys are generated, never pasted); `web-push` is the one new dependency (≈4.6k stars); PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — tables and migration

Goal: subscriptions and notification rows.

Files: Create `packages/db/src/schema/notify.ts`, `packages/db/migrations/<ts>_notify.sql`. Modify `packages/db/src/schema/index.ts`.

Approach: the two tables from the ticket; `notifications` indexes `(user_id, created_at)`, `(user_id, read_at)`; `data_json` text; `push_subscriptions.endpoint UNIQUE`.

Test scenarios: Given two subscriptions with one endpoint, then the second insert fails and the upsert path (U3) updates instead.

### U2 — VAPID key file

Goal: keys exist after first boot, generated once, mode 0600.

Files: Create `services/api/src/notify/vapid.ts`. Test `services/api/test/notify-vapid.test.ts`.

Approach: `loadOrCreateVapid(path, subject)`: if the file exists, parse `{ publicKey, privateKey }`; else `webpush.generateVAPIDKeys()`, `mkdir -p dirname (0700)`, write JSON with `{ mode: 0o600, flag: 'wx' }` (so a race cannot overwrite), then read back. Returns `{ publicKey, privateKey, subject }` and calls `webpush.setVapidDetails(subject, publicKey, privateKey)` once. Log `vapid: loaded|generated <path>` with no key material.

Interface sketch:
```ts
export function loadOrCreateVapid(path: string, subject: string): { publicKey: string; privateKey: string; subject: string };
```

Test scenarios: Given an empty temp dir, when called, then the file exists with mode `0600` and the dir `0700`. Given the file, when called again, then the same public key. Given an unreadable file, then a thrown error naming the path, not its content.

### U3 — routes

Goal: the public surface for the browser and the internal emit.

Files: Create `services/api/src/notify/routes.ts`, `services/api/src/notify/store.ts`. Test `services/api/test/notify-routes.test.ts`.

Approach: `GET /api/v1/push/vapid-public-key` → `{ publicKey }` (any principal). `POST /api/v1/push/subscriptions` → user principal; `PushSubscriptionInput`; upsert by endpoint (`ON CONFLICT(endpoint) DO UPDATE SET user_id, p256dh, auth, failures = 0`); 201. `DELETE /api/v1/push/subscriptions { endpoint }` → own rows only. `GET /api/v1/notifications?unread=1&limit=50` → own rows newest first. `POST /api/v1/notifications/:id/read` → sets `read_at` if own; 204. `POST /internal/notifications/emit` → `requirePrincipal(['service'])`, parse `NotificationTrigger`, call `deliver`, 202 `{ delivered: n }`. The scanner mounts the context at `/api/v1/notify` by default; export `prefix = '/'` and write absolute paths in this router so both `/api/v1/...` and `/internal/...` live here.

Interface sketch: route list above; `store.ts` exposes `insertNotification`, `listNotifications`, `markRead`, `upsertSubscription`, `deleteSubscription`, `subscriptionsFor(userId)`.

Test scenarios: Given a user, when subscribing twice with one endpoint, then one row with `failures = 0`. Given another user's notification id, when marking read, then 404. Given a user principal on the internal route, then 401; given the service token, then 202 and rows exist.

### U4 — render and deliver

Goal: one trigger → rows, streams, pushes.

Files: Create `services/api/src/notify/render.ts`, `services/api/src/notify/deliver.ts`. Test `services/api/test/notify-deliver.test.ts`.

Approach: `render(trigger)` returns `{ title, body, url }` per the ticket's fixed strings; `body` for `build.done` uses `registry.gameResolver`'s title when OGM-012 exposes one (refresh at pickup; default the `gameId`). `deliver(deps, trigger)`: for each `userId`: insert a row; `stream.publish(userId, row)` (U5); for each subscription of the user: `webpush.sendNotification(sub, JSON.stringify({ id, kind, title, body, url }), { TTL: 3600, urgency: 'normal' })` inside `try`; on `statusCode` 404/410 delete; on other errors `failures += 1`, delete at 5; on success `last_ok_at = now`, `failures = 0`. Pushes run with `Promise.allSettled`, concurrency 8 (a small in-file semaphore). Register `events.on('notify', t => void deliver(deps, t))` in `routes.ts` at mount.

Interface sketch:
```ts
export function render(t: NotificationTrigger, ctx: { gameTitle?: string }): { title: string; body: string; url: string };
export async function deliver(deps: { db; stream; push: Pick<typeof webpush,'sendNotification'> }, t: NotificationTrigger): Promise<{ delivered: number }>;
```

Test scenarios: Given the three fixtures, then the fixed titles. Given two `userIds` and three subscriptions across them, then two rows and three `sendNotification` calls with the minimal payload. Given a 410 from the mock, then that subscription is deleted. Given five 500s over five deliveries, then deleted on the fifth. Given a throwing `sendNotification`, then `deliver` still resolves and the row exists.

Execution note: test-first on `render` (pure) and `deliver` with a mocked `push`.

### U5 — SSE stream

Goal: open tabs get frames at once and can resume.

Files: Create `services/api/src/notify/stream.ts`. Test `services/api/test/notify-stream.test.ts`.

Approach: `createStreamHub()` keeps `Map<userId, Set<writer>>`; `publish(userId, row)` writes a frame to each writer; `GET /api/v1/notifications/stream` → user principal; `streamSSE(c, async s => { replay rows with id > Last-Event-ID (by created_at of that row) ; register writer; keepalive `: ping` every 25 s; unregister on abort })`. Cap 5 streams per user (close the oldest) and 500 total (503 `too_many_streams`). Frame fields exactly as the ticket: `id`, `event`, `data`.

Interface sketch:
```ts
export interface StreamHub { publish(userId: string, n: Notification): void; attach(userId: string, w: SSEWriter): () => void; size(): number }
```

Test scenarios: Given an open stream (test harness reads the Response body), when a row is delivered, then one frame with `event: build.done` arrives within 100 ms. Given `Last-Event-ID` = the first of three rows, then the two newer rows replay in order and the first does not. Given six streams for one user, then the first is closed. Given an aborted request, then the hub size decreases.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- notify
pnpm -r typecheck && pnpm -r lint
ls -l ~/.config/ogm/env/ogm-api.vapid.json   # -rw------- after first boot
curl -N -H "cookie: $SESSION" http://127.0.0.1:$OGM_API_PORT/api/v1/notifications/stream &
curl -s -X POST http://127.0.0.1:$OGM_API_PORT/internal/notifications/emit -H "authorization: Bearer $OGM_INTERNAL_TOKEN" -H 'x-ogm-service: intake' -H 'content-type: application/json' -d @packages/contracts/fixtures/notifications/trigger.intake-report.json
```
Paste into `## Local tests`: test counts, the `ls -l` mode line, and the SSE frame received for the intake fixture.

## 5. Deferred to implementation

- Hub placement: a module singleton on `AppDeps` (default) so tests can construct a fresh one.
- Keepalive period: 25 s (matches aiur's events channel).
- Replay bound: at most 100 rows on reconnect.
- Whether `intake.report` goes to `userIds` or "all admins": `userIds` (the emitter resolves admins); no family lookup here.

## 6. Scope boundaries

- Browser subscribe, service worker, permission UX, list UI: OGM-071. Trigger emission: OGM-013, OGM-032/045, OGM-064. Admin intake page: OGM-079. Email/SMS: none in V1.

## 7. Risks

- The Netlify proxy may buffer or time out SSE (E11-6): default: keep the stream, rely on push for closed tabs, and let OGM-071 reconnect with `Last-Event-ID`; OGM-080's chat stream faces the same and may move to a direct WebSocket.
- iOS requires home-screen install for push: accepted (spec §5.22); the human check records the iOS version.
- `web-push` star count is below some thresholds: named exception; it is the reference Node implementation and has no runtime network dependency beyond the push endpoints.
