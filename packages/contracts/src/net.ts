import { z } from 'zod';

import { base64Schema, bytesSchema, type Binary } from './binary.js';
import { ClientMessageSchema, InputFrameSchema, LIMITS_V2, RoomStateSchema, ServerMessageSchema } from './room.js';

/*
 * Protocol 2 (#497, N1 `docs/plans/netcode-platform.md` §7/§9.2/§9.3). A v2 room has a seat table,
 * teams, an epoch the room mints and a tick it derives from `startAt`; everything else is relayed
 * untouched. The room never reads `data`, `snapshot`, `events` or `frames`.
 *
 * The emitted family is `net`, not `room.v2`: `scripts/check-fixtures.mjs` pairs an emitted schema with
 * `fixtures/<family>/<name>.json`, so a second `room.*` version would share v1's fixture (#497 §3.10).
 */

const id = z.string().min(1);
const eventId = z.string().min(1).max(64);
const int = z.number().int();
const nonNegativeInt = int.nonnegative();
const seatIndex = nonNegativeInt.max(LIMITS_V2.maxPlayersCeiling - 1);
const teamIndex = nonNegativeInt.max(7);
const uint32 = nonNegativeInt.max(4_294_967_295);
const epochId = id;
/** `'host' | 'per-seat' | …` — `AuthorityMode` from N1 §3.1, opaque to the room. */
const authorityMode = z.string().min(1).max(32);

export const TeamPolicySchema = z.enum(['none', 'alternate']);
export type TeamPolicy = z.infer<typeof TeamPolicySchema>;

export const ChecksumScopeSchema = z.enum(['shared', 'seat']);
export const RecoveryScopeSchema = z.enum(['shared', 'seat', 'events']);
export const EventTargetSchema = z.enum(['all', 'seat', 'team']);
export const SeatEventSchema = z.enum(['net.seat.online', 'net.seat.offline', 'net.seat.forfeit']);

/** One row of the room's seat table. `userId: ''` means an unassigned seat; `seat` always equals its index. */
export const SeatSchema = z
  .object({
    seat: seatIndex,
    userId: z.string(),
    name: z.string().max(40),
    team: teamIndex,
    connected: z.boolean(),
    ready: z.boolean(),
    forfeited: z.boolean(),
  })
  .strict();
export type Seat = z.infer<typeof SeatSchema>;

/**
 * A v2 `welcome.state`. `RoomStateSchema` is `.strict()` and is what the web validates `welcome.state`
 * with, so a v2 room needs its own shape or the client drops the welcome silently (#497 §3.10 trap 2).
 */
export const RoomStateV2Schema = RoomStateSchema.extend({
  seats: z.array(SeatSchema).max(LIMITS_V2.maxPlayersCeiling),
  spectators: z.array(id),
  epoch: z.string(),
  startAt: nonNegativeInt,
  pausedAt: nonNegativeInt,
  primarySeat: seatIndex,
  seed: uint32,
  rulesetHash: z.string().max(64),
}).strict();
export type RoomStateV2 = z.infer<typeof RoomStateV2Schema>;

/** `welcome.you`; `seat` is `null` and `playerIndex` `-1` for a spectator. */
export const NetWelcomeYouSchema = z
  .object({
    userId: id,
    seat: seatIndex.nullable(),
    playerIndex: int,
    sessionId: id,
    spectator: z.boolean(),
    team: teamIndex,
  })
  .strict();

export const NetStartSchema = z
  .object({
    t: z.literal('net.start'),
    epoch: epochId,
    mode: authorityMode,
    startAt: nonNegativeInt,
    seed: uint32,
    primarySeat: seatIndex,
    seats: z.array(SeatSchema).max(LIMITS_V2.maxPlayersCeiling),
    privateSeed: uint32.optional(),
  })
  .strict();

function netMessageSchemas<B extends Binary>(binary: B) {
  const data = (maxBytes: number) => binary(maxBytes) as ReturnType<B>;
  const msg = <T extends string, S extends z.ZodRawShape>(t: T, shape: S) =>
    z.object({ t: z.literal(t), ...shape }).strict();
  const seatEvent = msg('net.seat', { event: SeatEventSchema, epoch: epochId, seat: seatIndex });
  const relayed = {
    inputs: msg('net.inputs', {
      epoch: epochId,
      seat: seatIndex,
      firstTick: nonNegativeInt,
      frames: z.array(InputFrameSchema).min(1).max(LIMITS_V2.inputFramesPerMessage),
    }),
    state: msg('net.state', {
      epoch: epochId,
      seat: seatIndex,
      seq: nonNegativeInt,
      tick: nonNegativeInt,
      data: data(LIMITS_V2.stateBytes),
    }),
    event: msg('net.event', {
      epoch: epochId,
      id: eventId,
      seq: nonNegativeInt,
      from: seatIndex,
      target: EventTargetSchema,
      to: seatIndex.optional(),
      team: teamIndex.optional(),
      round: nonNegativeInt.optional(),
      data: data(LIMITS_V2.eventBytes),
    }),
    checksum: msg('net.checksum', { epoch: epochId, scope: ChecksumScopeSchema, tick: nonNegativeInt, sum: uint32 }),
    signal: msg('net.signal', { epoch: epochId, to: seatIndex, data: data(LIMITS_V2.signalBytes) }),
    recovery: msg('net.recovery', {
      epoch: epochId,
      scope: RecoveryScopeSchema,
      tick: nonNegativeInt,
      seat: seatIndex.optional(),
      snapshot: data(LIMITS_V2.stateBytes).optional(),
      events: data(LIMITS_V2.recoveryBytes).optional(),
    }),
    recoveryRequest: msg('net.recovery.request', {
      epoch: epochId,
      scope: RecoveryScopeSchema,
      tick: nonNegativeInt,
      seat: seatIndex.optional(),
    }),
  };

  return {
    client: z.discriminatedUnion('t', [
      relayed.inputs,
      relayed.state,
      relayed.event,
      relayed.checksum,
      relayed.recoveryRequest,
      relayed.recovery,
      relayed.signal,
      msg('net.ready', { ready: z.boolean() }),
      msg('net.start.request', { force: z.boolean().optional() }),
      msg('net.end.request', { epoch: epochId }),
      msg('net.seat.request', { seat: seatIndex }),
    ]),
    server: z.discriminatedUnion('t', [
      msg('welcome', { you: NetWelcomeYouSchema, epoch: epochId.optional(), state: RoomStateV2Schema }),
      NetStartSchema,
      msg('net.start.cancel', { reason: z.enum(['seat-offline', 'not-ready']) }),
      msg('net.tick', { epoch: epochId, serverTime: nonNegativeInt, tick: nonNegativeInt }),
      msg('net.primary', { epoch: epochId, seat: seatIndex }),
      msg('net.seats', {
        epoch: z.string(),
        seats: z.array(SeatSchema).max(LIMITS_V2.maxPlayersCeiling),
        spectators: z.array(id),
      }),
      seatEvent,
      msg('net.pause', { epoch: epochId, tick: nonNegativeInt, startAt: nonNegativeInt }),
      msg('net.resume', { epoch: epochId, tick: nonNegativeInt, startAt: nonNegativeInt }),
      msg('net.epoch.end', { epoch: epochId, tick: nonNegativeInt }),
      relayed.inputs,
      relayed.state,
      relayed.event,
      relayed.checksum,
      relayed.signal,
      relayed.recovery,
      msg('ended', { reason: z.enum(['host-left', 'owner-closed', 'idle', 'revoked', 'abandoned']) }),
    ]),
  };
}

const wire = netMessageSchemas(bytesSchema);
const json = netMessageSchemas(base64Schema);

/** Client → room, protocol 2. */
export const NetClientMessageSchema = wire.client;
export type NetClientMessage = z.infer<typeof NetClientMessageSchema>;
/** Room → client, protocol 2. */
export const NetServerMessageSchema = wire.server;
export type NetServerMessage = z.infer<typeof NetServerMessageSchema>;

export const NetClientMessageJsonSchema = json.client;
export const NetServerMessageJsonSchema = json.server;

/** Either protocol's client messages: the room's single validation call (v1 ∪ v2). */
export const netSchemas = {
  'net.client-messages.v1': z.array(NetClientMessageJsonSchema),
  'net.server-messages.v1': z.array(NetServerMessageJsonSchema),
  'net.room-state.v1': RoomStateV2Schema,
  'net.start.v1': NetStartSchema,
} satisfies Record<string, z.ZodType>;

/**
 * One room serves one protocol, but the process serves both: the handler, the bridge and the web
 * client each validate with one schema over the union of the shipped v1 shapes and the v2 family.
 */
export const RoomClientMessageSchema = z.union([ClientMessageSchema, NetClientMessageSchema]);
export type RoomClientMessage = z.infer<typeof RoomClientMessageSchema>;
export const RoomServerMessageSchema = z.union([ServerMessageSchema, NetServerMessageSchema]);
export type RoomServerMessage = z.infer<typeof RoomServerMessageSchema>;
