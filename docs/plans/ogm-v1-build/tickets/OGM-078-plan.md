# OGM-078 — Multiplayer screens: implementation plan

## 1. Problem frame

The room server, the protocol, the grant routes and the host-app client all exist by phase 7. What is missing is what people see: an Invite button, a join landing that becomes the room, a watcher mode that mirrors the owner's edits without leaking private panels, phase transitions, and the host-left end state. Everything here is presentation over OGM-053's observable client, with a fake session so the screens are testable without a rooms service.

Requirements trace:
- R70 → the UI reflects the relay model: owner controls phase, members only observe and play (U1, U4).
- R73 → watcher mode renders the accepted transaction stream, catch-up and `resync` states, version badge (U3).
- R77 → `pausedForHost` countdown and `ended: host-left` screens (U4).

## 2. Patterns to follow

- OGM-053's `apps/web/src/net/room-client.ts` (at pickup): the client's subscribe/send API; `session.ts` wraps it, never re-implements it.
- OGM-075's `apps/web/src/routes/game/extras.ts` and `GameScreen.tsx`: how an extra is registered and what props it receives.
- OGM-052's `apps/web/src/routes/join/route.tsx`: the point after which the grant and pin exist; `RoomEntry` mounts there.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T07-multiplayer.md` §4.1: the `RoomState` and `Presence` field list; the overlay reads exactly those.
- `/home/orangekid/github/aiur/website/tests/visual.spec.ts`: the viewport matrix for the e2e.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added; no QR library); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Session adapter, fake session, Invite button and members

Goal: one observable session shape, a fake for tests, and the owner's invite and member controls.
Files: Create `apps/web/src/features/room/{session.ts,testing/fake-session.ts,InviteButton.tsx,MembersPopover.tsx,RoomBadge.tsx,share.ts,index.ts}`; Test `share.test.ts`, `session.test.ts`, `InviteButton.test.tsx`; Modify `apps/web/src/routes/game/extras.ts` (append two entries).
Approach: `session.ts` exports `RoomSession` and `fromRoomClient(client)` adapting OGM-053's client: `state` (the latest `RoomState`), `you` (from `welcome`), `subscribe(listener)`, `send(ClientMessage)`, `leave()`; a React hook `useRoomSession()` reading a context the game screen provides when a room is active. `fake-session.ts`: `fakeSession(initial)` with `emit(ServerMessage)` so tests script `welcome`, `design.tx`, phase changes and `ended`; installed on `window.__ogmHost.room.fake` when `?test`. `share.ts`: `shareInvite(url)` → `navigator.share` if `navigator.canShare?.({ url })`, else `navigator.clipboard.writeText` → `{ method: 'share' | 'copy' }`. `InviteButton`: on press, `POST /api/games/:g/rooms` once (cached in the session), then `POST /api/rooms/:id/invites`, then `shareInvite`; 2 s "Copied" state. `MembersPopover`: rows from `state.members` with name, connected dot, `playerIndex`; Kick → `send({ t: 'kick', userId })` + `POST /api/rooms/:id/revoke { userId }`; End room → `leave()` after `send({ t: 'phase', to: 'editing' })` is not needed; the server ends on owner close (`owner-closed`). `RoomBadge`: member count, opens the popover.
Interface sketch:
```ts
export interface RoomSession { state: RoomState | null; you: { userId: string; playerIndex: number; sessionId: string } | null; subscribe(fn: (s: RoomState, last?: ServerMessage) => void): () => void; send(m: ClientMessage): void; leave(): void }
export function shareInvite(url: string): Promise<{ method: 'share' | 'copy' }>;
```
Test scenarios:
- Given `navigator.share` exists and accepts the URL, when sharing, then `{ method: 'share' }` and no clipboard write.
- Given no `navigator.share`, then the clipboard holds the URL and `{ method: 'copy' }`.
- Given the owner presses Invite twice, then one room is created and two invites requested.
- Given a member row for a non-owner viewer, then no Kick button.

### U2 — RoomEntry: from grant to room

Goal: the join landing becomes the room or explains why not.
Files: Create `apps/web/src/features/room/RoomEntry.tsx`; Test `RoomEntry.test.tsx`; Modify `apps/web/src/routes/join/route.tsx` (one line mounting `RoomEntry` with `{ grant, pin, roomsUrl }`).
Approach: `RoomEntry` calls OGM-053's `joinRoom({ grant, buildId: pin.buildId, roomsUrl })`; while pending shows "Joining <game>…"; on `welcome` provides the session context and renders OGM-075's `GameScreen` for `pin.gameId` with `?v=pin.branchId` and the mode derived from phase; on `JoinRejection`: `BUILD_MISMATCH` → a Reload button, `ROOM_FULL` → "Room is full (N)", `GRANT_INVALID | GRANT_EXPIRED | GRANT_REVOKED` → "Ask for a new link", `PROTOCOL_MISMATCH` → Reload. Age and sign-in are already done by the route (OGM-052/072).
Interface sketch: `export function RoomEntry(props: { grant: string; pin: RoomPin; roomsUrl: string }): JSX.Element`.
Test scenarios:
- Given a `welcome`, when received, then the game screen mounts with the pin's branch.
- Given `ROOM_FULL` with `max: 4`, then the text contains "4" and a Leave link to `/games`.
- Given `GRANT_EXPIRED`, then no retry loop runs (one attempt).

### U3 — Watcher overlay

Goal: watchers see edits, the version, camera follow, and the builder status without private data.
Files: Create `apps/web/src/features/room/WatcherOverlay.tsx`, `apps/web/src/features/room/camera.ts`; Test `WatcherOverlay.test.tsx`, `camera.test.ts`.
Approach: rendered as a `gameExtras` overlay when `session.you.userId !== state.ownerId && state.phase === 'editing'`. Version badge: `pin.branchId` resolved to the branch name and derived version by `GET /api/games/:g/branches/:b` (OGM-043), falling back to the id. Camera toggle (44 px): Follow applies `state.presence.camera` to the frame through the editor camera message OGM-020 provides (deferred item if absent); Free sends nothing. Selection: `state.presence.selection` → `editor.select` on the watcher's frame (read-only highlight). `privateMode: true` → "talking to the builder…" and the selection cleared; `presence.building` → "building… <label> <pct>%". `resync` from OGM-053's sync state → "catching up" for its duration. Edits themselves arrive through OGM-053's watcher-sync applying `design.apply`; the overlay only displays.
Interface sketch:
```ts
export function cameraMessageFor(p: NonNullable<Presence['camera']>): HostToGame | null;   // null when the contract has no camera message
```
Test scenarios:
- Given `privateMode: true` with a selection, when rendered, then the builder line shows and no selection highlight is sent.
- Given `presence.building = { jobId, label: 'Placing the world', pct: 40 }`, then the text has the label and "40%" and never the jobId.
- Given Follow with a camera, then one message per presence change, none in Free.
- Given the branch route fails, then the badge shows the branch id.

### U4 — Phase screens and end states

Goal: every phase and end reason has one screen, for owner and members.
Files: Create `apps/web/src/features/room/PhaseScreens.tsx`; Test `PhaseScreens.test.tsx`.
Approach: a table `screenFor(phase, ended?)`: `editing` → none (overlay handles it); `migrating` → "Loading the new build" until the local `draft.ready` is sent by OGM-053; `playing` → none, but on transition call the game screen's `setMode('play')` immediately on the message (E07-10); `pausedForHost` → "<owner>'s connection dropped" with a countdown from `phaseAt + 120 s`; `ended` → by reason: `host-left` "<owner> left", `owner-closed` "<owner> ended the game", `idle` "The room closed", `revoked` "Your invite was revoked"; each with the member's last autosave time when `__ogmHost.game.lastSaveAt` exists and a 64 px Leave to `/games`. Owner on `pausedForHost` is impossible (they are the one dropped) but the table still covers it.
Interface sketch:
```ts
export function screenFor(state: RoomState, ended?: Extract<ServerMessage, { t: 'ended' }>): { kind: 'none' | 'migrating' | 'paused' | 'ended'; title: string; countdownUntil?: number };
```
Test scenarios (table):
- for each `Phase` and each `ended.reason`, the expected `kind` and that `title` contains the owner's name where the design says so.
- Given `pausedForHost` with `phaseAt` now, then `countdownUntil = phaseAt + 120_000`.
- Given `playing`, when the message arrives, then `setMode('play')` was called synchronously.

### U5 — Playwright e2e with the fake session

Goal: the screens behave end to end without a rooms service.
Files: Create `apps/web/e2e/room.spec.ts`.
Approach: open `/g/g1?test` with mocked API routes and OGM-075's fixture game; install the fake session through `__ogmHost.room.fake` as a watcher; script `welcome` (pin at rev 5), three `design.tx` (rev 6–8), `privateMode` on and off, `phase: 'playing'`, `pausedForHost`, `ended: host-left`; assert through `__ogmHost.game` and the DOM. A second test as the owner with `navigator.share` deleted asserts the copied link.
Test scenarios:
- Given three `design.tx`, then `__ogmHost.game.headRev === 8`.
- Given `playing` emitted at `t0`, then `__ogmHost.game.mode === 'play'` by `t0 + 500 ms`.
- Given `ended: host-left`, then the Leave button exists and is ≥ 64 px on 390×844.
- Given Invite without share, then the clipboard holds a `/join/` URL.

## 4. Verification

```
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/web test -- features/room
pnpm --filter @ogm/web e2e -- room
pnpm --filter @ogm/web build
```
Paste into `## Local tests`: Vitest counts, Playwright summary (three viewports, renderer string), head SHA, base.

## 5. Deferred to implementation

- Editor camera message: default, if OGM-020's bridge has no host→game camera message, ship Free look only and hide the Follow toggle; file one additive `editor.camera { pos, target, zoom }` request on OGM-020's owner in the PR (unknown types are dropped by old games, so it is safe to add later).
- Where the room context lives: default, a React context provided by `RoomEntry` (joiners) and by `InviteButton`'s room creation (owner), read by the extras.
- End room for the owner: default, `leave()`; the server records `owner-closed`.
- Branch name lookup for the badge: default, one query, cached for the room's life.
- Members who are the owner's second device: default, shown once by `userId` with `sessions.length`.

## 6. Scope boundaries

- No routes, grant exchange, allowlist or age gating (OGM-052); no Colyseus client, forwarding, catch-up or `resync` logic (OGM-053).
- No room server rules (OGM-051), protocol (OGM-050), SDK net layer (OGM-054), two-client verify (OGM-055).
- No game screen or editor changes beyond the `extras.ts` entries (OGM-075); no version screens (OGM-077).

## 7. Risks

- Wire privacy depends on this UI never sending chat text to the room: default, `send` is called only from `InviteButton`, `MembersPopover`, `PhaseScreens` (owner Play) with literal message shapes; a unit test greps the feature for `send(` call sites and asserts the allowlist.
- OGM-053's client API differs from the sketch: default, adapt in `session.ts` only.
- Follow camera without a contract message: default above; the outcome's "follow camera" lands when the message exists.
- Phone layout with overlay plus HUD plus dock: default, the overlay is a single top strip under the Play/Edit bar; everything else stays where OGM-075 put it.
