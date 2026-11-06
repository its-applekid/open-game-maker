import { z } from 'zod';

import { base64Schema, bytesSchema, type Binary } from './binary.js';

/*
 * Room protocol v1 (T07 §4.1) and the protocol-2 additions of #497 (N1 §7). The room relays; a seat's
 * browser simulates. Binary fields are `Uint8Array` at runtime (an `ArrayBuffer` is accepted and copied
 * into one); JSON fixtures and the emitted schemas carry them as base64 strings (`*JsonSchema`).
 * A protocol family lives beside v1 rather than inside it: see `net.ts` for every protocol-2 message.
 * v1 is `PROTOCOL_VERSION_V1` and its schemas never change in place.
 */

/** The newest protocol this package speaks. A room stores its own copy (per-room protocol, #497 D-N3-17). */
export const PROTOCOL_VERSION = 2;
/** Protocol 1, kept exported so a v1 room, a v1 test helper and the v1 verify scenario stay expressible. */
export const PROTOCOL_VERSION_V1 = 1;

export const LIMITS = {
  inputBytes: 256,
  snapshotBytes: 65536,
  snapshotPerSec: 30,
  eventBytes: 16384,
  eventPerSec: 30,
  designTxBytes: 65536,
  designTxPerSec: 30,
  presencePerSec: 15,
  grantTtlSec: 600,
  ownerReconnectSec: 120,
  playerReconnectSec: 60,
  idleDisposeSec: 300,
  maxPlayersDefault: 4,
  maxPlayersCeiling: 8,
} as const;

/** Protocol-2 caps (#497 §4.4/§4.5). `eventBytes` and the rate caps are v1's; the rest bound new messages. */
export const LIMITS_V2 = {
  ...LIMITS,
  inputsBytes: 512,
  inputsPerSec: 45,
  inputFramesPerMessage: 8,
  stateBytes: 8_192,
  statePerSec: 10,
  checksumBytes: 128,
  checksumPerSec: 4,
  recoveryRequestBytes: 128,
  recoveryPerSec: 4,
  recoveryBytes: 65_536,
  controlBytes: 32,
  readyPerSec: 5,
  startRequestPerSec: 2,
  endRequestPerSec: 1,
  seatRequestPerSec: 2,
  signalBytes: 4_096,
  signalPerSec: 20,
  /** A forfeited seat's rejoin window, for every seat including the creator's. */
  seatReconnectSec: 30,
  /** Fixed lead between `net.start` and tick 0; the room cannot measure RTT (D-N3-5). */
  startLeadMs: 1_000,
  /** Per-sender sequence window the client-side inbox keeps for gap detection. */
  eventHistory: 256,
} as const;

/** Simulation rate the epoch mapping converts milliseconds into ticks with (a constant, never a loop). */
export const SIM_TICK_HZ = 60;

/** First segment of every design patch path (T08 `DesignDoc` roots). */
export const DESIGN_ROOTS = ['globals', 'entities'] as const;

const id = z.string().min(1);
const int = z.number().int();
const nonNegativeInt = int.nonnegative();

export const RoleSchema = z.enum(['owner', 'player']);
export type Role = z.infer<typeof RoleSchema>;

export const PhaseSchema = z.enum(['editing', 'migrating', 'playing', 'pausedForHost', 'ended']);
export type Phase = z.infer<typeof PhaseSchema>;

export const RoomPinSchema = z.object({ gameId: id, branchId: id, buildId: id }).strict();
export type RoomPin = z.infer<typeof RoomPinSchema>;

/** HS256 claims, signed with OGM_WS_TOKEN_SECRET. `iat` is optional here; when present, `exp` is at most 10 min later. */
export const RoomGrantSchema = z
  .object({
    sub: id,
    roomId: id,
    gameId: id,
    role: RoleSchema,
    name: z.string().min(1).max(40),
    iat: int.optional(),
    exp: int,
    jti: id,
  })
  .refine((grant) => grant.iat === undefined || grant.exp - grant.iat <= LIMITS.grantTtlSec, {
    message: `exp must be at most ${LIMITS.grantTtlSec} s after iat`,
    path: ['exp'],
  });
export type RoomGrant = z.infer<typeof RoomGrantSchema>;

export const JoinOptionsSchema = z
  .object({
    grant: z.string().min(1),
    buildId: id,
    protocol: int,
    /** A claim about the joining user's own seat, never an allocation (#497 D-N3-2). Optional. */
    seat: nonNegativeInt.max(LIMITS.maxPlayersCeiling - 1).optional(),
    /** Client-computed ruleset pin; compared opaquely, `''`/absent disables the comparison. */
    rulesetHash: z.string().max(64).optional(),
  })
  .strict();
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

export const JoinRejectionSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('BUILD_MISMATCH'), expected: RoomPinSchema }).strict(),
  z.object({ code: z.literal('ROOM_FULL'), max: int.min(1) }).strict(),
  z.object({ code: z.enum(['GRANT_INVALID', 'GRANT_EXPIRED', 'GRANT_REVOKED', 'PROTOCOL_MISMATCH']) }).strict(),
  z.object({ code: z.literal('SEAT_TAKEN'), seat: nonNegativeInt }).strict(),
  z.object({ code: z.literal('RULESET_MISMATCH'), expected: z.string().min(1).max(64) }).strict(),
]);
export type JoinRejection = z.infer<typeof JoinRejectionSchema>;

export const MembershipSchema = z
  .object({
    userId: id,
    name: z.string().min(1).max(40),
    role: RoleSchema,
    playerIndex: nonNegativeInt.max(LIMITS.maxPlayersCeiling - 1),
    connected: z.boolean(),
    sessions: z.array(id),
  })
  .strict();
export type Membership = z.infer<typeof MembershipSchema>;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** Ephemeral and never persisted. While `privateMode` is on the server zeroes everything but `building`. */
export const PresenceSchema = z
  .object({
    cursor: z.object({ x: z.number(), y: z.number() }).strict().optional(),
    selection: z.array(id),
    focusControlId: id.optional(),
    camera: z.object({ pos: vec3, target: vec3, zoom: z.number() }).strict().optional(),
    privateMode: z.boolean(),
    building: z
      .object({ jobId: id, label: z.string(), pct: z.number().min(0).max(100) })
      .strict()
      .optional(),
  })
  .strict();
export type Presence = z.infer<typeof PresenceSchema>;

export const RoomStateSchema = z
  .object({
    protocol: int,
    pin: RoomPinSchema,
    ownerId: id,
    editorSessionId: id.optional(),
    phase: PhaseSchema,
    phaseAt: nonNegativeInt,
    playRev: nonNegativeInt,
    lastRev: nonNegativeInt,
    maxPlayers: int.min(1).max(LIMITS.maxPlayersCeiling),
    members: z.record(z.string(), MembershipSchema),
    presence: PresenceSchema,
    draft: z.object({ buildId: id, url: z.url(), expiresAt: nonNegativeInt }).strict().optional(),
  })
  .strict();
export type RoomState = z.infer<typeof RoomStateSchema>;

/** `text` is rejected by construction: free text never rides the input channel. */
export const InputFrameSchema = z
  .object({
    seq: nonNegativeInt,
    tick: nonNegativeInt,
    axes: z.array(z.number()).max(8),
    buttons: nonNegativeInt,
  })
  .strict();
export type InputFrame = z.infer<typeof InputFrameSchema>;

/** A JSON pointer (`/entities/e1`) or an array path (`['entities', 'e1']`) that starts at a design root. */
export const DesignPathSchema = z.union([
  z.string().regex(new RegExp(`^/(?:${DESIGN_ROOTS.join('|')})(?:/.*)?$`)),
  /* an open tuple would emit prefixItems, which strict Ajv rejects, so the array root is a refinement */
  z
    .array(z.union([z.string(), nonNegativeInt]))
    .min(1)
    .refine((path) => (DESIGN_ROOTS as readonly unknown[]).includes(path[0]), {
      message: `path must start at a design root (${DESIGN_ROOTS.join(', ')})`,
    }),
]);

export const PatchSchema = z
  .object({
    op: z.enum(['add', 'replace', 'remove']),
    path: DesignPathSchema,
    value: z.unknown().optional(),
  })
  .passthrough();
export type Patch = z.infer<typeof PatchSchema>;

/** A view of T08's `Transaction` (OGM-040 owns it). Unknown fields pass through so the full transaction relays unchanged. */
export const DesignTxSchema = z
  .object({
    branchId: id,
    rev: nonNegativeInt,
    baseRev: nonNegativeInt,
    actor: id,
    kind: z.enum(['manual', 'system', 'merge']),
    patches: z.array(PatchSchema),
  })
  .passthrough();
export type DesignTx = z.infer<typeof DesignTxSchema>;

function messageSchemas<B extends Binary>(binary: B) {
  const snapshot = { seq: nonNegativeInt, tick: nonNegativeInt, data: binary(LIMITS.snapshotBytes) as ReturnType<B> };
  const event = { seq: nonNegativeInt, data: binary(LIMITS.eventBytes) as ReturnType<B> };
  const stampedInput = InputFrameSchema.extend({ playerIndex: nonNegativeInt, from: id });
  const msg = <T extends string, S extends z.ZodRawShape>(t: T, shape: S) =>
    z.object({ t: z.literal(t), ...shape }).strict();

  return {
    client: z.discriminatedUnion('t', [
      msg('input', { f: InputFrameSchema }),
      msg('snapshot', snapshot),
      msg('event', event),
      msg('design.tx', { tx: DesignTxSchema }),
      msg('presence', { p: PresenceSchema.partial() }),
      msg('phase', { to: z.enum(['editing', 'playing']) }),
      msg('draft.load', { buildId: id, url: z.url() }),
      msg('draft.ready', { buildId: id }),
      msg('kick', { userId: id }),
      msg('ping', { c: z.number() }),
    ]),
    server: z.discriminatedUnion('t', [
      msg('welcome', {
        you: z.object({ userId: id, playerIndex: nonNegativeInt, sessionId: id }).strict(),
        state: RoomStateSchema,
      }),
      msg('input', { f: stampedInput }),
      msg('snapshot', snapshot),
      msg('event', event),
      msg('design.tx', { tx: DesignTxSchema }),
      msg('resync', { fromRev: nonNegativeInt }),
      msg('ended', { reason: z.enum(['host-left', 'owner-closed', 'idle', 'revoked']) }),
      msg('pong', { c: z.number(), s: z.number() }),
    ]),
    netHostToGame: z.discriminatedUnion('t', [
      msg('net.players', {
        local: nonNegativeInt,
        players: z.array(z.object({ playerIndex: nonNegativeInt, name: z.string(), connected: z.boolean() }).strict()),
      }),
      msg('net.role', { role: z.enum(['host', 'peer']) }),
      msg('net.input', { f: InputFrameSchema.extend({ playerIndex: nonNegativeInt }) }),
      msg('net.snapshot', snapshot),
      msg('net.event', event),
      msg('phase', { phase: PhaseSchema }),
    ]),
    netGameToHost: z.discriminatedUnion('t', [
      msg('net.input', { f: InputFrameSchema }),
      msg('net.snapshot', snapshot),
      msg('net.event', event),
    ]),
  };
}

const wire = messageSchemas(bytesSchema);
const json = messageSchemas(base64Schema);

/** Client → room. */
export const ClientMessageSchema = wire.client;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
/** Room → client. */
export const ServerMessageSchema = wire.server;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
/** Host app → game iframe `net.*` payloads (T07 §4.3); OGM-020 owns the bridge envelope that carries them. */
export const NetHostToGameSchema = wire.netHostToGame;
export type NetHostToGame = z.infer<typeof NetHostToGameSchema>;
/** Game iframe → host app `net.*` payloads. */
export const NetGameToHostSchema = wire.netGameToHost;
export type NetGameToHost = z.infer<typeof NetGameToHostSchema>;

/** JSON forms with binary fields as base64, for fixtures and the emitted schemas. */
export const ClientMessageJsonSchema = json.client;
export const ServerMessageJsonSchema = json.server;

export const roomSchemas = {
  'room.grant.v1': RoomGrantSchema,
  'room.state.v1': RoomStateSchema,
  'room.design-tx.v1': DesignTxSchema,
  'room.client-messages.v1': z.array(ClientMessageJsonSchema),
  'room.server-messages.v1': z.array(ServerMessageJsonSchema),
} satisfies Record<string, z.ZodType>;
