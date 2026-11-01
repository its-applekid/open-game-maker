# OGM-050 plan — Room protocol package

## 1. Problem frame

Five rooms tickets (server, invites, host client, SDK net layer, verify) and three other lanes need one reviewed definition of what crosses the room wire and what a grant is. Nothing exists in code (E07-16). This ticket turns T07 §4.1 into Zod schemas with fixtures in `@ogm/contracts` and a small runtime package `@ogm/room-protocol` (grant sign/verify, validators, limits) so every consumer copies instead of redefining.

Requirements trace:
- R71 → `RoomState`, `Membership`, `Presence`, `RoomPin` schemas; `maxPlayers` default 4 / ceiling 8 as schema refinements and `LIMITS`.
- R72 → `RoomGrant` schema; `signGrant`/`verifyGrant` HS256 with `exp` ≤ 10 min and `jti`; verifiable with no network call.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/aiur-contracts/` (dirs `src/`, `schemas/`, `fixtures/`, `test/`, verified): one family per file, JSON Schema beside fixtures, tests that load every fixture; copy the layout, not the generator.
- `packages/contracts/src/index.ts` and the emit script as merged by OGM-004 (new at 9508c1c): append-only barrel, Zod → JSON Schema emit with `--check`.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T06-voice-and-build-chat.md` line 192 (verified): the `vct1.` HMAC token recipe, if `node:crypto` is chosen over `jose`.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not used here); every service binds `127.0.0.1` (not applicable here); secrets only by `packages/config` names; no dependency under 1k stars without a named exception; PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands, results.

## 3. Implementation units

### U1 — `packages/contracts/src/room.ts`

Goal: the §4.1 types as Zod schemas, plus `LIMITS`, `DESIGN_ROOTS` and the `net.*` payload shapes.
Files: Create `packages/contracts/src/room.ts`; Modify `packages/contracts/src/index.ts` (append `export * from './room'`); Test `packages/contracts/test/room.test.ts`.
Approach:
- `RoleSchema = z.enum(['owner','player'])`, `PhaseSchema = z.enum(['editing','migrating','playing','pausedForHost','ended'])`.
- `RoomPinSchema`, `RoomGrantSchema` (`exp: z.number().int()`, `name: z.string().min(1).max(40)`, `jti: z.string().min(8)`), `JoinOptionsSchema`.
- `JoinRejectionSchema` discriminated on `code`; `MembershipSchema`; `PresenceSchema`; `RoomStateSchema` with `maxPlayers: z.number().int().min(1).max(8)`.
- `InputFrameSchema = z.object({seq, tick, axes: z.array(z.number()).max(8), buttons: z.number().int().nonnegative()}).strict()` so a `text` key fails.
- `PatchSchema` with `path: z.union([z.string(), z.array(z.union([z.string(), z.number()]))])`; `DesignTxSchema` `.passthrough()` with `kind: z.enum(['manual','system','merge'])`.
- `ClientMessageSchema` and `ServerMessageSchema` discriminated on `t`; binary fields as `z.instanceof(Uint8Array)` with a preprocess accepting `ArrayBuffer`.
- `NetHostToGamePayloads` / `NetGameToHostPayloads` for `net.players`, `net.role`, `net.input`, `net.snapshot`, `net.event`, `phase` (T07 §4.3).
- `LIMITS` and `DESIGN_ROOTS` exported as `const`; every type via `z.infer` with the §4.1 names.
Interface sketch:
```ts
export const LIMITS = { inputBytes: 256, snapshotBytes: 65536, snapshotPerSec: 30, eventBytes: 16384, eventPerSec: 30,
  designTxBytes: 65536, designTxPerSec: 30, presencePerSec: 15, grantTtlSec: 600, ownerReconnectSec: 120,
  playerReconnectSec: 60, idleDisposeSec: 300, maxPlayersDefault: 4, maxPlayersCeiling: 8 } as const;
export const DESIGN_ROOTS = ['globals', 'entities'] as const;
```
Test scenarios:
- Given each fixture file, when parsed by its schema, then it round-trips deep-equal.
- Given `role: 'guest'`, when parsed with `RoomGrantSchema`, then it fails.
- Given a `RoomState` with `maxPlayers: 9`, when parsed, then it fails; with `8`, then it passes.
- Given an `InputFrame` with `text: 'hi'`, when parsed, then it fails (strict).
- Given a `DesignTx` carrying T08 extras (`leaseToken`, `inverse`, array `path`), when parsed, then the extras survive (`passthrough`).
- Given a `ClientMessage` `{t:'presence', p:{privateMode:true}}`, when parsed, then `p` is a valid `Partial<Presence>`.
- Given the emitted `schemas/room.v1.json`, when `generate --check` runs, then it reports no drift.
- Given `LIMITS`, when read, then every value equals the number annotated in the §4.1 quote (guards against silent edits).

### U2 — Fixtures and emitted schema

Goal: golden fixtures and the JSON Schema consumers read.
Files: Create `packages/contracts/fixtures/room.grant.v1.json`, `room.state.v1.json`, `room.client-messages.v1.json` (array, one per `t`), `room.server-messages.v1.json`, `room.design-tx.v1.json`; Create (generated) `packages/contracts/schemas/room.v1.json`.
Approach:
- Hand-write fixtures with ULID-looking ids (`u_01J…`, `r_01J…`, `g_01J…`); the `state` fixture has an owner at index 0 and a player at index 1.
- Binary fields as base64 strings under a `__b64` key the test loader decodes to `Uint8Array`.
- The `design-tx` fixture is a T08-shaped transaction (array `path`, `leaseToken`, `inverse`) to prove passthrough.
- Run OGM-004's emit (`pnpm --filter @ogm/contracts generate`); commit `schemas/room.v1.json`.
Test scenarios:
- Given the fixture dir, when the test globs `room.*.v1.json`, then every file parses with the schema named in its filename.
- Given a fixture edited to break a schema, when the test runs, then the failure names the file and the Zod path.
- Given the `client-messages` fixture, when iterated, then every `ClientMessage['t']` value appears exactly once.

### U3 — `@ogm/room-protocol` runtime helpers

Goal: grant sign/verify, validators, presence zeroing, rate table.
Files: Create `packages/room-protocol/package.json` (`"name": "@ogm/room-protocol"`, `"type": "module"`, deps `@ogm/contracts: workspace:*`, `jose` pinned), `tsconfig.json` (references `../contracts`), `src/index.ts`, `src/grant.ts`, `src/validate.ts`, `src/presence.ts`, `src/rate.ts`, `test/grant.test.ts`, `test/validate.test.ts`, `test/presence.test.ts`, `test/rate.test.ts`, `test/fixtures/secret.ts`.
Approach:
- `grant.ts`: `signGrant(claims, secret)` with `jose` `SignJWT`, `alg: 'HS256'`, `jti = crypto.randomUUID()`, `exp = now + min(ttlSec ?? 600, 600)`.
- `verifyGrant(token, secret, nowMs)`: `jwtVerify` with `clockTolerance: 30`, then `RoomGrantSchema.safeParse(payload)`; map `JWTExpired` → `GRANT_EXPIRED`, anything else → `GRANT_INVALID`.
- `validate.ts`: `validateDesignTx(tx, pin)` = schema → `branchId === pin.branchId` → every patch first segment ∈ `DESIGN_ROOTS` (string pointer `'/entities/…'` or array `['entities', …]`) → `byteLength(JSON) ≤ LIMITS.designTxBytes`; `validateInputFrame(f)`; `byteLength(data)`.
- `presence.ts`: `zeroPrivatePresence(p)` returns `p` unchanged when `!privateMode`; else drops `cursor`, `focusControlId`, `camera`, sets `selection: []`, keeps `building`.
- `rate.ts`: `class RateTable { allow(key, perSec, nowMs): boolean }` token bucket with burst = `perSec`, `prune(olderThanMs)`.
- `index.ts` re-exports everything plus `LIMITS` from contracts for convenience.
Interface sketch:
```ts
export declare function signGrant(c: {sub:string; roomId:string; gameId:string; role:Role; name:string; ttlSec?:number}, secret: Uint8Array): Promise<string>;
export declare function verifyGrant(token: string, secret: Uint8Array, nowMs?: number): Promise<{ok:true; grant: RoomGrant} | {ok:false; code:'GRANT_INVALID'|'GRANT_EXPIRED'}>;
export declare function validateDesignTx(tx: unknown, pin: RoomPin): {ok:true; tx: DesignTx} | {ok:false; reason: 'schema'|'branch'|'path'|'size'};
export declare function zeroPrivatePresence(p: Presence): Presence;
```
Test scenarios:
- Given claims and the fixture secret, when signed then verified, then `grant` equals the claims plus `exp` and a `jti`.
- Given a token signed with another secret, when verified, then `GRANT_INVALID`.
- Given a token with one character of the signature changed, when verified, then `GRANT_INVALID`.
- Given `now = exp + 31 s`, when verified, then `GRANT_EXPIRED`; given `exp + 29 s`, then ok.
- Given `ttlSec: 3600`, when signed, then `exp - iat === 600`.
- Given a tx whose patch path is `['prompt','text']`, when validated, then `reason: 'path'`.
- Given a tx whose patch path is `'/entities/e1/props/x'`, when validated, then ok.
- Given `branchId !== pin.branchId`, when validated, then `reason: 'branch'`.
- Given a 70 KiB `value`, when validated, then `reason: 'size'`.
- Given `privateMode: true` with a cursor and `building`, when zeroed, then no cursor, `selection: []`, `building` intact.
- Given 30 `allow` calls in one second, when the 31st arrives, then it returns false; one second later, then true again.
Execution note: test-first for `verifyGrant` failure codes (they are the `JoinRejection` codes OGM-051 maps).

## 4. Verification

```
pnpm --filter @ogm/contracts generate && git diff --exit-code packages/contracts/schemas
pnpm --filter @ogm/contracts test
pnpm --filter @ogm/room-protocol test
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: the four commands, Vitest summary lines (file counts, pass counts), the head SHA and base `main`.

## 5. Deferred to implementation

- `jose` vs `node:crypto` hand-rolled compact JWS: default `jose` (pinned major at install); if the workspace already forbids it, hand-roll HS256 with `timingSafeEqual` and keep the same signatures.
- Binary field representation in fixtures: default base64 under a `__b64` key handled by the test loader.
- Zod major: whatever OGM-004 pinned; do not add a second Zod.
- Whether `LIMITS` lives in contracts or room-protocol: default contracts (pure data) so the SDK can read caps without importing `jose`.
- `name` length cap 40: default 40, matching display-name limits in OGM-012 if they differ.

## 6. Scope boundaries

- No server (OGM-051), no routes or DB (OGM-052), no host app code (OGM-053), no SDK (OGM-054), no scenario (OGM-055).
- `bridge.ts` unions stay OGM-020's; `Transaction` stays OGM-040's.
- No `.env` names added beyond reading `OGM_WS_TOKEN_SECRET` by name in docs (OGM-003 owns the loader).

## 7. Risks

- OGM-004's emit script shape unknown at research time: default, read its README at pickup and follow it; if absent, emit with `zod-to-json-schema` (pinned) and note it.
- T08's `Patch.path` is an array while T07's quote shows a string pointer: default, accept both forms and validate the first segment.
- `ArrayBuffer` in Zod and msgpack: default `Uint8Array` on the wire with an accept-both preprocess; document in `room.ts`.
- Zod discriminated unions with binary preprocess may not emit clean JSON Schema: default emit binary fields as `{type: 'string', contentEncoding: 'base64'}` and document.
