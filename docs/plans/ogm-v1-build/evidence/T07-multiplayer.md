# T07 multiplayer: evidence packet

Researched at `9508c1c46735e442a2e07a1bffad2bb9f190da8d` (branch `research`), 2026-10-31. Sources read: A7 R12, B7 §6 and §9, C2 §4, §6, §8 and "For ticketing", spec v0.4 §5.12 and §7.5, the v0.5 decision log, the release plan, the architecture doc FEATURES array, B4 §5, A4 §4, B14 gaps, `prototypes/ui-v0/site/js/dungeon.js`, `prototypes/studio-v0/app.js`, `.claude/skills/gm-verify/SKILL.md`, and the host. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

A generic, platform-owned, host-authoritative Colyseus room running on this machine: membership, roles, edit pause, version pin, editor transaction and presence stream, input and snapshot relay, invite links with room-scoped grants, join-on-Play, reconnection and host-leaves behaviour, room size 4.
This track defines the room wire protocol (TypeScript types below) and the grant it verifies; T04 defines the in-game SDK API that consumes it; T01 issues grants and invite links; T08 owns the design transaction shape the room relays; T10 writes `gm-multiplayer-ready` and the two-client verify scenario; T11 exposes the service publicly.
Out of scope (release plan V2): split screen, more than one editor at once, server-authoritative rooms, public matchmaking, player voice chat (V3).

## 2. Evidence packets

### E07-1: Multiplayer is first-class V1 and supersedes the spec's "plan in V1, implement V2"
- Claim / current behavior: the decision log row "Multiplayer" says V1 first-class, convertible at creation, invite links, watchers, own controller and view; spec v0.4 §5.12 and §7.5 still say "architecture V1, implementation V2".
- Source and exact locus: `docs/spec/game-maker-2000-v0.5-decisions.md` line 40; `docs/spec/release-plan.md` line 56; `docs/spec/game-maker-2000-spec-v0.4.md` lines 539–553 and 812.
- Why it matters: every V2 label on multiplayer in A7, B7 §9, B14 (`gm-multiplayer-ready` "rules only") and spec v0.4 is stale; tickets must not carry it forward.
- Confidence and freshness: [V], as of 9508c1c.
- Contradiction or open question: spec v0.4 §5.12 also says "Kevin accepted no fixed product-wide hard player cap", while assumption A5 sets room size 4. Resolve as a configurable `maxClients` with default 4, not a constant.
- Suggested requirement/decision impact: requirement "online multiplayer, host-authoritative, V1"; decision "room size is a per-game setting, default 4, platform ceiling 8".

### E07-2: The recommended authority model is a host-authoritative relay with no game code on the server
- Claim / current behavior: A7 R12 option A: a generic room owns membership, roles, pause, version pin, editor stream and input/state relay; the simulation runs in the owner's sandboxed iframe; other clients send inputs and receive snapshots; Colyseus Predict is not used. C2 §6 and the architecture doc adopt it.
- Source and exact locus: `docs/research/v0.3/A7-infra-auth-git-multiplayer.md` lines 319–345; `docs/research/v0.5/C2-v1-scope-additions.md` lines 253–258; `docs/architecture/architecture-scope.html` line 254 and 389.
- Why it matters: it is the only option compatible with "untrusted code never runs in a platform service" (B4) at zero cost; it fixes the room as a relay with schema-validated envelopes whose payloads the server never interprets.
- Confidence and freshness: [V] that the research says so; [O] that it is the right V1 choice.
- Contradiction or open question: B14's `add-multiplayer` source (`docs/research/v0.4/B14-skills/gaps.md` line 123) teaches "the server is authoritative". `gm-multiplayer-ready` must say host-authoritative, or agents will build server logic the room cannot run.
- Suggested requirement/decision impact: decision "V1 rooms are relay-only; the host's browser is the simulation authority; cheating among invitees is accepted".

### E07-3: Colyseus 0.18 is the decided library and is not present on this machine
- Claim / current behavior: A7 verified `colyseus` 0.18.9, `@colyseus/core` 0.18.21, `@colyseus/schema` 5.0.42, MIT, 7.4k stars (2026-10-21). The release plan "Stack" row names Colyseus. No `colyseus` package exists in any `node_modules` or the npm cache on this host.
- Source and exact locus: A7 lines 302–317; `docs/spec/release-plan.md` line 30 (constraints) and line 56; host check `find /home/orangekid -path '*node_modules*' -name colyseus` → nothing; `~/.npm/_cacache/index-v5` has no colyseus entry [M].
- Why it matters: the first ticket must install it (allowed: npm install at implementation time is not spending); nothing can be type-checked against it in this research. Version numbers are as of 2026-10-21, not re-verified (no network).
- Confidence and freshness: [V] for the research figures; [M] for absence on host.
- Contradiction or open question: none. 7.4k stars satisfies the 1k rule.
- Suggested requirement/decision impact: pin `colyseus@^0.18` in the rooms service; the single-process defaults (`LocalPresence`, `LocalDriver`) mean no Redis, which is also absent here (`which redis-server` → none [M]).

### E07-4: The Colyseus client belongs in the host app, not in the game iframe
- Claim / current behavior: A4 §4 and B4 §5: the game iframe holds no credentials, no account data; all host→game traffic crosses a schema-validated MessageChannel bridge. The only host→iframe message in the prototype today is `{ ogm: 'edit'|'play' }`.
- Source and exact locus: `docs/research/v0.3/A4-engine-sdk-editor.md` lines 63–90 (rule 1, 2, 5); `docs/research/v0.4/B4-sandboxing.md` lines 150–160 and 181; `prototypes/studio-v0/app.js` lines 256–259 [V].
- Why it matters: the room grant (a bearer token) must never reach game code; so the host app owns the socket and forwards `input`/`snapshot`/`players`/`phase` over the bridge. This adds one postMessage hop per snapshot (sub-millisecond [I]) and means the games domain needs no WebSocket or CORS rules.
- Confidence and freshness: [V] for the rules; [I] for the hop cost.
- Contradiction or open question: none.
- Suggested requirement/decision impact: T04's bridge schema gains four message kinds (§4 below); T07's client adapter lives in the host app package.

### E07-5: The design transaction stream is already serializable and is the watcher feed
- Claim / current behavior: B7 §9 reserves `{actor, rev, patches}` as broadcastable; C2 §6 says watchers receive "the same design transaction stream the editor saves"; C2 §8 adds `branchId` on every transaction and pins rooms to `(branch, build)`.
- Source and exact locus: `docs/research/v0.4/B7-editor-sdk-input.md` lines 205–213; C2 lines 273, 375, 388, 411–413.
- Why it matters: the room must not become a second store of design state. Design: the editor writes a transaction to the backend (T08, fenced by the lease token), and on ack re-sends it to the room as `design.tx`; the room relays and remembers only `lastRev`. A watcher joining later fetches the design snapshot at `rev ≤ lastRev` from the backend and applies room transactions with `rev > snapshotRev`. Gaps (a missed rev) trigger a re-fetch, never a guess.
- Confidence and freshness: [V] for the sources; [O] for the catch-up design.
- Contradiction or open question: T08 must expose `GET .../design?rev=` (snapshot at a revision) for catch-up; if it does not, watchers can only join at room creation.
- Suggested requirement/decision impact: requirement "a watcher's design state equals the editor's at every rev (two-client test asserts equality of the effective design document)".

### E07-6: Private panels are kept off the wire by construction, and a wire test must prove it
- Claim / current behavior: A7 says prompt text, costs and admin data never enter room state and spectators see "typing a request…"; C2 §6 constraint 6 and the architecture doc repeat it; A7's evaluation asks to "assert on the wire".
- Source and exact locus: A7 lines 333–336 and 364; C2 line 283; `docs/architecture/architecture-scope.html` line 393.
- Why it matters: with the relay design, the server never sees prompts unless a client sends them. So the guarantee is (a) the room schema has no field that could hold them, (b) `design.tx` patches are validated server-side to JSON Pointer paths under the design document only, (c) presence has a `privateMode` flag; while it is true the server zeroes cursor, selection and focus before broadcast, and (d) the verify scenario records every message a watcher client receives and asserts the type allowlist and that no string in any payload matches a canary prompt typed by the host.
- Confidence and freshness: [V] for the requirement; [O] for the mechanism.
- Contradiction or open question: whether friends may hear the build-agent voice conversation: A5 assumption "friends don't hear the build agent" settles V1.
- Suggested requirement/decision impact: acceptance test "canary string typed in the build chat never appears in any watcher-received frame".

### E07-7: Invite links replace A7's anonymous guest codes; every joiner is a signed-in adult
- Claim / current behavior: A7 §R04 designed accountless room guests via Better Auth anonymous sessions; C2 §6 replaces that with a link carrying a room-scoped, expiring, revocable grant, and the friend signs in (passkey, Google or email) and lands in the room; every friend passes the 18+ age screen; outside-family invites wait for the lawyer review (A2: family only, allowlist is an admin setting).
- Source and exact locus: A7 lines 200–205; C2 lines 272, 278–279; `docs/plans/ogm-v1-build/questions-or-commands.md` A2; architecture doc line 391.
- Why it matters: the room's `onAuth` needs one thing: a grant signed by the backend binding `{userId, roomId, role, exp}`. No anonymous plugin, no guest role in V1 (the `guest` role in A7's schema is dropped).
- Confidence and freshness: [V].
- Contradiction or open question: whether a link may be opened by anyone who signs in (link = capability) or only by a pre-named account. Default [O]: capability link, family-allowlist enforced at sign-in, owner sees "X joined" and can kick.
- Suggested requirement/decision impact: T01 route set in §4; roles in V1 are `owner | player` only, with `watcher` a phase-derived state, not a role.

### E07-8: Host leaves → the session ends with progress saved (assumption A5), implemented through cloud autosave, not a room checkpoint
- Claim / current behavior: A7 leaves host-drop to Kevin (end and save, or migrate host); C2 and the architecture doc recommend end-and-save; A5 takes it as the assumption.
- Source and exact locus: A7 line 344; C2 line 280 and 306; architecture doc line 160; questions-or-commands A5.
- Why it matters: when the host's browser is gone, its state is gone with it, so "progress saved" can only mean the host's last cloud autosave (release plan "Saves": cloud autosave, V1). The room needs no state checkpoint relay: on owner drop it sets `phase: 'pausedForHost'`, waits `allowReconnection(owner, 120 s)`, then ends with `reason: 'host-left'` and tells the backend; clients show "Kevin left; progress saved at HH:MM".
- Confidence and freshness: [V] for the sources; [O] for the mechanism.
- Contradiction or open question: autosave cadence belongs to T08/A5; if it is only "at safe points", a crash can lose minutes. Default: the host SDK autosaves every 60 s while a room is live [O].
- Suggested requirement/decision impact: decision "no host migration in V1"; requirement "owner reconnection window 120 s, players 60 s" (A7 numbers).

### E07-9: Rooms are pinned to `(gameId, branchId, buildId)`; version change is explicit
- Claim / current behavior: A7 pins to `releaseId + buildHash`, rejects mismatched joins with "reload to join", and offers an owner-driven "update room" (pause, serialise, load, resume); C2 §8 pins to `(branch, build)` and says watchers see which version is open; draft previews load a draft build into the room by signed URL.
- Source and exact locus: A7 lines 337–343; C2 lines 388, 405; C2 line 622.
- Why it matters: `buildId` is a content hash of the build (T05/T08 define it); branches are first-class (A1 assumption), so the pin needs `branchId`.
- Confidence and freshness: [V].
- Contradiction or open question: A7's "host serialises state (R09 bounded migration)" on update is heavier than V1 needs; default [O]: V1 draft load always restarts gameplay from the design document (phase `migrating` → `editing`), no state carry-over.
- Suggested requirement/decision impact: `RoomPin` type below; join rejects `BUILD_MISMATCH`.

### E07-10: Join-on-Play cannot be "the same frame"; it is "on receipt of one message"
- Claim / current behavior: C2 says "they are in gameplay on the same frame" and "Pressing Play drops everyone into gameplay at once".
- Source and exact locus: C2 line 274; architecture doc line 393.
- Why it matters: clients have different RTTs. The room broadcasts `phase` with a server timestamp and `playRev`; each client switches on receipt and the host starts simulating at once. The first snapshot carries the initial spawn set so non-hosts render it within one RTT. Late joiners connect in `playing`, load the pinned build and design at `playRev`, and the host spawns them on `members` change.
- Confidence and freshness: [I].
- Contradiction or open question: none; it is a wording fix.
- Suggested requirement/decision impact: acceptance "a second client is in play mode within 500 ms of the host pressing Play on localhost" (measurable in the verify scenario).

### E07-11: The prototype play loop already separates input, simulation and render, which is what `gm-multiplayer-ready` needs
- Claim / current behavior: `dungeon.js` keeps input in `keys`/`stick`, steps the world in `updatePlay(dt)`, renders in `frame()`, and `tick(sec)` steps `updatePlay` in fixed 1/60 s without rendering. Nothing is keyed by player: `player` is a singleton, foes read `P` directly.
- Source and exact locus: `prototypes/ui-v0/site/js/dungeon.js` lines 560, 755–842, 847–865 [V].
- Why it matters: the rules C2 lists (input separate from simulation, per-player state keyed by player id, host-minted ids, spawn points, a HUD per player) are one step beyond the prototype: `players: Map<playerIndex, PlayerState>` and `applyInput(playerIndex, frame)`. That is the conversion job's whole shape.
- Confidence and freshness: [V].
- Contradiction or open question: `.claude/skills/` has no `gm-multiplayer-ready` [M: `ls` shows six skills], although the architecture doc (line 434) lists it as if it existed. It must be written (T10 owns skills; the rules come from this track, §4).
- Suggested requirement/decision impact: ticket "gm-multiplayer-ready rules + multiplayer template + conversion job".

### E07-12: Per-player controller, camera and HUD are SDK (T04) obligations, with `playerIndex` stamped by the room
- Claim / current behavior: C2: each client reads only its own devices, has its own camera rig (C2 §4 rigs: iso, topdown, side, follow, fps, orbit, fixed), a per-player HUD, and never sees other players' input; B7 §9: input carries `playerIndex`, the host gamepad layer assigns devices.
- Source and exact locus: C2 lines 251, 275, 195; B7 lines 210.
- Why it matters: the room assigns `playerIndex` at join (lowest free 0..maxPlayers-1, stable across reconnection) and stamps it on every relayed input, so the host cannot be spoofed by a client claiming another index. The SDK derives "my camera follows my avatar" from `localPlayerIndex`.
- Confidence and freshness: [V] for sources; [O] for stamping.
- Contradiction or open question: the editor camera and the watcher "follow the editor" camera are presence, not design state (B7 §9 item 3).
- Suggested requirement/decision impact: `Membership.playerIndex` is server-assigned; `InputFrame.playerIndex` is set by the server, not trusted from the client.

### E07-13: The A7 evaluation can run free on this machine, but only measures LAN latency
- Claim / current behavior: A7's evaluation (p50/p95 relay RTT with 4 clients at 20 Hz, pause/resume, kill the owner tab, release swap, wire privacy) was budgeted against Railway Hobby; C2 says no spending is approved.
- Source and exact locus: A7 lines 358–365; C2 line 282; handoff-2026-10-26 line 110.
- Why it matters: with the service on this host, all of it runs with Playwright (1.64.1 and Chromium 1248 are installed under `prototypes/ui-v0/tools/node_modules` and `~/.cache/ms-playwright` [M]) at no cost. WAN numbers need a real remote client; adding `tc netem` delay needs root [I].
- Confidence and freshness: [M] for the tooling; [I] for netem.
- Contradiction or open question: none.
- Suggested requirement/decision impact: the evaluation becomes the verify scenario (ticket 8), not a spend request.

### E07-14: The edit lease stays in the backend; the room only mirrors who is editing
- Claim / current behavior: B7 §6 is a single-writer lease with a fencing token checked on every override write; B7 §9 item 2 says "lease = editor authority in a room"; V1 has owner-only editing (release plan: admins cannot take over another adult's game).
- Source and exact locus: B7 lines 160–172 and 208; release plan line 29.
- Why it matters: the room does not need the lease token. It accepts `design.tx`, `presence` and `phase` only from `client.auth.userId === ownerId` (A7 line 331), and transactions reach the room after the backend accepted them, so a stale tab is already rejected upstream.
- Confidence and freshness: [V].
- Contradiction or open question: same owner on two devices (silent takeover, B7 §6): the room must allow a second owner session and treat the newest as the editor; the old socket becomes a watcher.
- Suggested requirement/decision impact: `Membership.sessions` is a list, `editorSessionId` names the active editing device.

### E07-15: One process, one machine: no Redis, no scale-out, a public hostname is required
- Claim / current behavior: A7 says one Colyseus process carries many relay rooms, scale-out needs Redis plus per-process public address, and builds must not share the process. On this host: Node 24.14.0, 12 cores, 31 GB, systemd user session running with `Linger=yes`, Tailscale installed and listening on 80/443 (tailnet only), no redis, no caddy/nginx/cloudflared [M].
- Source and exact locus: A7 lines 353–356; host checks `node --version`, `nproc`, `free -g`, `systemctl --user is-system-running`, `loginctl show-user $USER -p Linger`, `ss -ltn`, `which redis-server caddy nginx cloudflared` [M].
- Why it matters: load is small (4 clients × 20 Hz × a few KB) [I]; the rooms service is a `systemd --user` unit like `scripts/drive-sync/ogm-drive-sync.service`. Friends are off the tailnet, so T11 must provide a public hostname with WebSocket upgrade (Caddy handles it by default) for `rooms.<domain>`.
- Confidence and freshness: [M].
- Contradiction or open question: the aiur coding agents also run here; T11 must bound their CPU so room tick timing (A7 R05 D1) is not starved. Default [O]: rooms unit `Nice=-5`, agents `Nice=10` under a `CPUWeight` slice.
- Suggested requirement/decision impact: self-hosting notes §7.

### E07-16: Nothing multiplayer exists in code today; every reuse target is a contract, not code
- Claim / current behavior: grep for `colyseus|multiplayer|websocket` across `prototypes/`, `scripts/`, `.claude/skills/` finds nothing; aiur has WebSocket sockets (`src/lib/aiur_web/sockets/*.ex`) for its dashboard and voice, unrelated to game rooms.
- Source and exact locus: grep results [M]; `/home/orangekid/github/aiur/src/lib/aiur_web/sockets/{events,voice,streamdeck,live_view}.ex` [V].
- Why it matters: T07 tickets are greenfield TypeScript; the only things to reuse are the hooks in `dungeon.js` (E07-11), Playwright tooling, and the bridge design in A4.
- Confidence and freshness: [M].
- Contradiction or open question: none.
- Suggested requirement/decision impact: no port work; all tickets are "write new".

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Room server, relay, membership, pin | Nothing (E07-16) | Write new, TypeScript, `services/rooms/` | Greenfield |
| Room protocol types and grant verification | Nothing; shapes only in A7 line 330 (prose) | Write new, `packages/room-protocol/` | Shared by rooms service, host app, verify scenario |
| Design transaction shape `{actor, rev, patches, branchId}` | Prose in B7 §4/§9 and C2 §8; no code | T08 writes; T07 consumes | Watcher feed |
| Host↔iframe bridge | `prototypes/studio-v0/app.js` lines 256–259: one `postMessage({ogm: mode})`, no validation (JS, tests: no) | Replace (T04 writes the validated bridge, A4 §4) | Prototype is throwaway |
| Fixed-step test hook `tick(sec)` and `window.__ogm` | `prototypes/ui-v0/site/js/dungeon.js` lines 861–865 (JS, tests: `tools/e2e.mjs` drives it, no assertions framework) | Port the pattern into the SDK (T04); reuse in the two-client scenario | Proven on the prototype |
| Headless two-browser testing | `prototypes/ui-v0/tools/e2e.mjs`, `shot.mjs` (Playwright 1.64.1, JS, tests: no) | Keep the tooling; write the scenario new under `skills/gm-verify/` (T10) | Browsers already installed |
| Process supervision pattern | `scripts/drive-sync/ogm-drive-sync.service` (systemd user unit) | Keep as the template for `ogm-rooms.service` (T11) | Existing convention |
| `gm-multiplayer-ready` skill | Does not exist (`ls .claude/skills/`) | Write new (T10, rules from §4 below) | Architecture doc lists it; defect |
| Invite links, grants, allowlist | Nothing | T01 writes routes; T07 verifies grants | Auth is T01's |

## 4. Interfaces and contracts

### 4.1 Room protocol (owner: T07) — `packages/room-protocol/src/index.ts`

```ts
export const PROTOCOL_VERSION = 1;

export type Role = 'owner' | 'player';                       // watcher is phase-derived, not a role
export type Phase = 'editing' | 'migrating' | 'playing' | 'pausedForHost' | 'ended';

export interface RoomPin { gameId: string; branchId: string; buildId: string }   // buildId: content hash (T05/T08)

/** Signed by the backend (T01), HS256 with ROOMS_GRANT_SECRET shared by env; verified in onAuth, no network. */
export interface RoomGrant {
  sub: string;            // userId
  roomId: string;
  gameId: string;
  role: Role;
  name: string;           // display name shown to others; no email
  exp: number;            // unix seconds, ≤ 10 min after issue
  jti: string;            // revocation id; the backend can POST a revocation list to the room
}

export interface JoinOptions { grant: string; buildId: string; protocol: number }

export type JoinRejection =
  | { code: 'BUILD_MISMATCH'; expected: RoomPin }
  | { code: 'ROOM_FULL'; max: number }
  | { code: 'GRANT_INVALID' | 'GRANT_EXPIRED' | 'GRANT_REVOKED' | 'PROTOCOL_MISMATCH' };

/* ---- Room state (Colyseus Schema in the service; this is the plain view clients see) ---- */
export interface Membership {
  userId: string; name: string; role: Role;
  playerIndex: number;        // server-assigned 0..maxPlayers-1, stable across reconnection
  connected: boolean;
  sessions: string[];         // Colyseus sessionIds for this user (same user, second device)
}
export interface Presence {   // ephemeral, never persisted or undoable (B7 §9.3)
  cursor?: { x: number; y: number };          // normalized editor canvas coords
  selection: string[];                        // entity ids (host-minted, B7 §4.1)
  focusControlId?: string;
  camera?: { pos: [number, number, number]; target: [number, number, number]; zoom: number };
  privateMode: boolean;       // true while owner is in prompt/budget/admin panels: server zeroes the fields above
  building?: { jobId: string; label: string; pct: number };   // "building…" for watchers, no prompt text
}
export interface RoomState {
  protocol: number; pin: RoomPin; ownerId: string;
  editorSessionId?: string;   // the owner device currently editing
  phase: Phase; phaseAt: number; playRev: number;             // playRev: design rev gameplay started from
  lastRev: number;            // highest design.tx relayed
  maxPlayers: number;         // default 4, per-game setting, ceiling 8
  members: Record<string, Membership>;                         // by userId
  presence: Presence;
  draft?: { buildId: string; url: string; expiresAt: number }; // signed URL, room-lifetime (A7 draft preview)
}

/* ---- Messages: client → room ---- */
export type ClientMessage =
  | { t: 'input';     f: InputFrame }                               // any player, during playing; relayed to host only
  | { t: 'snapshot';  seq: number; tick: number; data: ArrayBuffer } // host only; ≤ 64 KiB, ≤ 30/s; broadcast to all but host
  | { t: 'event';     seq: number; data: ArrayBuffer }              // host only; reliable, ordered; HUD/achievement events
  | { t: 'design.tx'; tx: DesignTx }                                // owner only; after backend ack; relayed to all but sender
  | { t: 'presence';  p: Partial<Presence> }                        // owner only; ≤ 15/s
  | { t: 'phase';     to: 'editing' | 'playing' }                   // owner only
  | { t: 'draft.load'; buildId: string; url: string }               // owner only → phase 'migrating'
  | { t: 'draft.ready'; buildId: string }                           // every client after loading the draft
  | { t: 'kick';      userId: string }                              // owner only
  | { t: 'ping';      c: number };

/* ---- Messages: room → client ---- */
export type ServerMessage =
  | { t: 'welcome';   you: { userId: string; playerIndex: number; sessionId: string }; state: RoomState }
  | { t: 'input';     f: InputFrame & { playerIndex: number; from: string } }  // to host; playerIndex stamped by server
  | { t: 'snapshot';  seq: number; tick: number; data: ArrayBuffer }
  | { t: 'event';     seq: number; data: ArrayBuffer }
  | { t: 'design.tx'; tx: DesignTx }
  | { t: 'resync';    fromRev: number }                              // you missed revs; fetch snapshot ≥ fromRev from the API
  | { t: 'ended';     reason: 'host-left' | 'owner-closed' | 'idle' | 'revoked' }
  | { t: 'pong';      c: number; s: number };

/* ---- Payload shapes the server validates (contents it never interprets stay opaque) ---- */
export interface InputFrame { seq: number; tick: number; axes: number[]; buttons: number; text?: never }  // ≤ 256 B
export interface DesignTx {   // T08 owns this; the room validates only paths and size
  branchId: string; rev: number; baseRev: number; actor: string; kind: 'manual' | 'system';
  patches: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }>;   // path must start with /design/
}
```

Server rules (enforced in `GameRoom`): `onAuth` verifies the grant, `ownerId` comes from the backend's room record at creation, never from a client; every owner-only message from a non-owner is dropped and counted; rate and size caps per type as annotated; `presence` fields are zeroed while `privateMode`; `allowReconnection(client, role === 'owner' ? 120 : 60)`; owner drop → `pausedForHost`; timeout → `ended: host-left` and `POST /internal/rooms/:id/ended`; room idle (no members) 5 min → dispose.

### 4.2 Backend routes (owner: T01; T09 calls them; T07 consumes the grant)

```
POST /api/games/:gameId/rooms            {branchId, buildId, maxPlayers?}  → {roomId, grant}       owner only; creates the room via the rooms service internal API
POST /api/rooms/:roomId/invites          {}                                 → {url}                 url = https://app.<host>/join/<inviteToken>, 7-day expiry, revocable
GET  /api/join/:inviteToken               (signed-in, age-screened, allowlisted) → {roomId, grant, pin, roomsUrl}
POST /api/rooms/:roomId/revoke           {jti | userId}                     → 204                   pushes to the room's revocation list
POST /internal/rooms/:roomId/ended       {reason, endedAt}   (rooms → api, shared secret)           records the session; triggers nothing else in V1
GET  /api/games/:gameId/branches/:branchId/design?rev=N     (T08)           → design snapshot at rev ≤ N, with its rev
```

### 4.3 Host app ↔ game iframe bridge additions (owner: T04; T07 states what it needs)

```ts
// host → game
{ t: 'net.players',  local: number; players: Array<{ playerIndex: number; name: string; connected: boolean }> }
{ t: 'net.role',     role: 'host' | 'peer' }
{ t: 'net.input',    f: InputFrame & { playerIndex: number } }   // host only: peers' inputs
{ t: 'net.snapshot', seq: number; tick: number; data: ArrayBuffer }   // peers only
{ t: 'net.event',    seq: number; data: ArrayBuffer }
{ t: 'phase',        phase: Phase }
// game → host
{ t: 'net.input',    f: InputFrame }                                   // peer: its own input
{ t: 'net.snapshot', seq: number; tick: number; data: ArrayBuffer }   // host: the authoritative snapshot
{ t: 'net.event',    seq: number; data: ArrayBuffer }
```

What the SDK must expose to game code (T04 defines names; these are the obligations): `net.role`, `net.localPlayerIndex`, `net.players`, `onPlayerJoined/Left(playerIndex)` (host spawns/despawns), `onInput(playerIndex, frame)` on the host, `sendSnapshot(bytes)` from the host at a fixed rate, `applySnapshot(bytes)` with SDK-owned interpolation on peers, `sendEvent/onEvent`, a seeded RNG and clock the host owns, camera rig bound to `localPlayerIndex`, and a per-player HUD slice. Single-player is the same game with `players.length === 1` and `role === 'host'`.

### 4.4 `gm-multiplayer-ready` rules (owner: T10 writes the skill; T07 supplies the rules)

1. Input never mutates the world directly: it becomes an `InputFrame` consumed by `applyInput(playerIndex, frame)` in the fixed step.
2. All per-player state lives in `players: Map<playerIndex, PlayerState>`; no singleton `player`.
3. Entity ids are host-minted, globally unique strings; never array positions or per-session counters.
4. Spawn points are design data (`design/spawns.json`), at least `maxPlayers` of them.
5. The host is authoritative; peers render snapshots and send inputs only; game logic never assumes a server.
6. `serializeSnapshot()/applySnapshot()` cover everything visible; transient effects are derived, not synced.
7. HUD reads `players.get(localPlayerIndex)`; camera rig follows the local avatar.
8. `tick(seconds)` and `render_game_to_text()` work with `players.length ≥ 2`.

### 4.5 Two-client verify scenario (owner: T10; T07 defines the assertions)

Two Playwright contexts against the local rooms service: (1) create room, invite, sign in as a second user, join, assert `welcome` within 2 s; (2) host places three entities, assert watcher's effective design equals host's at each rev; (3) host types a canary string in the build chat, assert it appears in no frame the watcher received; (4) Play, assert the peer is in `playing` within 500 ms; (5) peer sends input for 1 s, assert its avatar moved in the host's snapshot; (6) close the host context, assert `pausedForHost` then `ended: host-left` after the window (shortened by test config); (7) load a draft, assert both clients report `draft.ready` and the pin changed.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| T07-1 | Rooms service skeleton | Colyseus 0.18 server on this machine as a `systemd --user` unit with `/healthz`, env-only config, internal create-room API with shared secret | `services/rooms/` (server.ts, config.ts, internal.ts), `ops/systemd/ogm-rooms.service` | 2 | Monorepo layout (T12); hostname and proxy (T11) for public access only | The reverse proxy, TLS, DNS (T11) |
| T07-2 | Room protocol package | The types in §4.1 as TS plus Zod schemas, grant verify/sign helpers, message size and rate tables, published to the workspace | `packages/room-protocol/` | 3 | None (defines the contract) | Design transaction semantics (T08) |
| T07-3 | GameRoom: membership, roles, phase, pin, relay | `GameRoom` implementing §4.1 rules with `@colyseus/testing` unit tests for every rejection, cap and owner-only check | `services/rooms/src/game-room.ts`, `services/rooms/test/` | 3 | T07-1, T07-2 | Invite UI, backend routes |
| T07-4 | Room lifecycle edge cases | Reconnection windows, owner second device, host-leave end-and-record, draft load/ready round trip, idle dispose, revocation list | `services/rooms/src/game-room.ts`, `lifecycle.ts`, tests | 2 | T07-3; `/internal/rooms/:id/ended` route (T01) | Host migration (V2) |
| T07-5 | Invite links and room grants | Routes in §4.2, allowlist check, age-screen gate, `/join/<token>` page that signs in and lands in the room | `services/api/src/routes/rooms.ts`, `apps/web/src/routes/join.tsx`, `packages/room-protocol` (sign) | 3 | T01 auth and policy module; T07-2 | Family admin UI for the allowlist (T01/T09) |
| T07-6 | Host-app room client and bridge forwarding | Colyseus client in the host app; forwards §4.3 messages; phase UI (Play/Edit, "building…", "Kevin left"); watcher catch-up via `resync` and design snapshot | `apps/web/src/net/room-client.ts`, `apps/web/src/net/watcher-sync.ts`, bridge schema additions in `packages/sdk-bridge` | 4 | T07-2, T04 bridge, T08 design snapshot route and `DesignTx` | Snapshot interpolation (lives in the SDK, T07-7) |
| T07-7 | SDK net layer | `gm.net` per §4.3 obligations: host/peer roles, `playerIndex`, input frames, fixed-rate snapshots, interpolation buffer, per-player HUD/camera binding, single-player = one host | `packages/sdk/src/net/*` | 4 | T04 SDK core and camera rigs; T07-2 | The room server; game-specific snapshot contents |
| T07-8 | gm-multiplayer-ready, template, conversion job | The skill with §4.4 rules and a checker, a multiplayer game template (2 spawns, 2 HUDs), and the single→multiplayer edit-job recipe ending in the two-client verify | `skills/gm-multiplayer-ready/`, `packages/templates/multiplayer-*/`, `skills/gm-verify/scenarios/two-client.mjs` | 3 | T07-7, T10 skill conventions, T07-1 running locally | Scope-chat UI for the single/multi choice (T09) |

## 6. Risks and unknowns

- **Colyseus 0.18 API drift since 2026-10-21** (no network to confirm). Default: pin to the version found at install, write `GameRoom` against `@colyseus/core` only, keep `@colyseus/schema` fields flat. [I]
- **Design snapshot-at-rev route** may not be in T08's plan. Default: require it; without it, watchers can only join at room creation. [O]
- **Snapshot payload size on phones** (WebSocket over mobile data at 20 Hz). Default: 20 Hz, cap 64 KiB, SDK delta-encodes later if measured necessary; measure in the verify scenario with a 4× CPU-throttled context. [I]
- **"Same frame" wording** (E07-10). Default: define as within one RTT of the `phase` message; record the measured number. [I]
- **Autosave cadence for "progress saved" on host-leave** (E07-8). Default: host autosaves every 60 s while a room is live; T08 decides. [O]
- **Capability link vs named invite** (E07-7). Default: capability link gated by the family allowlist at sign-in, owner can kick and revoke. [O]
- **Room size** (E07-1). Default: 4, per-game setting, ceiling 8; watchers count as members because they become players at Play. [O]
- **Agents starving the rooms process** (E07-15). Default: cgroup weights set by T11; verify scenario runs while one aiur job is active. [O]
- **Wire-privacy proof** depends on the host app never sending prompt text to the room; `privateMode` zeroing and the canary test are the guard, not the server knowing what is private. [I]
- **Owner on two devices**: Colyseus gives one `sessionId` per socket; the room must map `userId → sessions[]` itself. Spike inside T07-3. [I]

## 7. Self-hosting notes

- The `mp` service moves from Railway (one replica) to one Node process here, unchanged in shape: Colyseus single-process defaults need no Redis; `redis-server` is absent [M] and must not be added.
- Checked on the host [M]: `node --version` v24.14.0; `nproc` 12; `free -g` 31 GB total; `systemctl --user is-system-running` → running; `loginctl show-user $USER -p Linger` → yes (user units survive logout); `which tailscale` → `/usr/bin/tailscale`, listening on 80/443 on the tailnet address only; `which caddy nginx cloudflared redis-server` → none; `/usr/bin/chromium` present; Playwright 1.64.1 with chromium-1248 under `~/.cache/ms-playwright`; no `colyseus` anywhere in `node_modules` or the npm cache.
- Friends are not on the tailnet, so the rooms service needs the public hostname and WebSocket-upgrade proxy T11 chooses; the games domain needs nothing extra because the socket lives in the host app (E07-4).
- Service unit modelled on `scripts/drive-sync/ogm-drive-sync.service`: `services/rooms` started by `systemd --user`, env file `~/.config/ogm/rooms.env` (mode 600) holding `ROOMS_GRANT_SECRET` and `ROOMS_INTERNAL_SECRET`, both shared only with the API service on this machine. No secret reaches a browser or a coding agent.
- The A7 latency evaluation runs for free here (E07-13) but measures loopback; the first real-WAN number comes from Kevin's phone off Wi-Fi.
- Load bound: 4 rooms-worth of 4 clients at 20 Hz × a few KB is negligible next to the coding agents; the risk is the other way round (agents starving the event loop), owned by T11's resource limits.
