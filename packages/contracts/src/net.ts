import { z } from 'zod';

import { InputFrameSchema } from './room.js';

/*
 * Net protocol v2 (`docs/plans/netcode-platform.md`, N2). One contract family: the authority modes a manifest may
 * declare, the wire messages of a per-seat match, and the seat/start records the room hands each client.
 * `InputFrameSchema` is room.ts's, imported rather than copied: the frame the SDK emits is the frame the room
 * validates, and a copy is a drift source (the copy rule in `bridge.ts` is about keeping engine packages free of
 * room code, which does not apply inside this package).
 */

export const NET_LIMITS = {
  inputBatchBytes: 512,
  inputPerSec: 45,
  seatStateBytes: 8_192,
  seatStatePerSec: 10,
  recoveryBytes: 65_536,
  recoveryPerSec: 4,
  checksumBytes: 128,
  checksumPerSec: 4,
  signalBytes: 4_096,
  maxSeats: 8,
  maxBatchMessages: 32,
} as const;

export const AUTHORITY_MODES = ['per-seat', 'host', 'rollback'] as const;
export type AuthorityMode = (typeof AUTHORITY_MODES)[number];

export const authorityModeSchema = z.enum(AUTHORITY_MODES);

/** Absent means `'host'`, which keeps every build written before v2 on today's code path. */
export const netManifestSchema = z.strictObject({
  authority: authorityModeSchema.optional(),
  maxSeats: z
    .number()
    .int()
    .min(1)
    .max(NET_LIMITS.maxSeats),
  inputDelayTicks: z.number().int().min(2).max(8).optional(),
  seatStateHz: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional(),
  spectators: z.enum(['off', 'on']).optional(),
  forfeit: z.enum(['continue', 'skip', 'surrender']).optional(),
});
export type NetManifest = z.infer<typeof netManifestSchema>;

export const netSeatSchema = z.strictObject({
  seat: z
    .number()
    .int()
    .min(0)
    .max(NET_LIMITS.maxSeats - 1),
  userId: z.string().min(1).max(64),
  name: z.string().min(1).max(40),
  team: z
    .number()
    .int()
    .min(0)
    .max(NET_LIMITS.maxSeats - 1),
  connected: z.boolean(),
  ready: z.boolean(),
  forfeited: z.boolean(),
  spectator: z.boolean(),
});
export type NetSeat = z.infer<typeof netSeatSchema>;

export type NetTime = { serverMs: number; tick: number; offsetMs: number; rttMs: number; jitterMs: number };

const epoch = z.string().min(1).max(64);
const seatIndex = z
  .number()
  .int()
  .min(0)
  .max(NET_LIMITS.maxSeats - 1);
const tick = z.number().int().min(0);
/**
 * A base64 payload of at most `bytes`. The wire is JSON, so the cap is the encoded character count of the byte cap.
 */
const netData = (bytes: number) => z.string().max(Math.ceil(bytes / 3) * 4);

/** Client → room → peers: the sender's frames for the last `redundancy` ticks. */
export const netInputsPayloadSchema = z.strictObject({
  epoch,
  seat: seatIndex,
  firstTick: tick,
  frames: z.array(InputFrameSchema).min(1).max(3),
});
export type NetInputsPayload = z.infer<typeof netInputsPayloadSchema>;

/** A seat's owned-state slice, or a filtered copy addressed to one recipient. */
export const netStatePayloadSchema = z.strictObject({
  epoch,
  seat: seatIndex,
  seq: tick,
  tick,
  to: seatIndex.optional(),
  data: netData(NET_LIMITS.seatStateBytes),
});
export type NetStatePayload = z.infer<typeof netStatePayloadSchema>;

export const netChecksumPayloadSchema = z.strictObject({
  epoch,
  scope: z.enum(['shared', 'seat']),
  tick,
  sum: z.number().int().min(0),
});
export type NetChecksumPayload = z.infer<typeof netChecksumPayloadSchema>;

export const netRecoveryRequestPayloadSchema = z.strictObject({
  epoch,
  scope: z.enum(['shared', 'seat', 'events']),
  tick,
  seat: seatIndex.optional(),
});
export type NetRecoveryRequestPayload = z.infer<typeof netRecoveryRequestPayloadSchema>;

export const netRecoveryPayloadSchema = z.strictObject({
  epoch,
  scope: z.enum(['shared', 'seat', 'events']),
  tick,
  seat: seatIndex.optional(),
  snapshot: netData(NET_LIMITS.recoveryBytes).optional(),
  events: z.array(z.string()).max(NET_LIMITS.maxBatchMessages).optional(),
});
export type NetRecoveryPayload = z.infer<typeof netRecoveryPayloadSchema>;

export const netInputsMessageSchema = netInputsPayloadSchema.extend({ t: z.literal('net.inputs') });
export const netStateMessageSchema = netStatePayloadSchema.extend({ t: z.literal('net.state') });
export const netChecksumMessageSchema = netChecksumPayloadSchema.extend({ t: z.literal('net.checksum') });
export const netRecoveryRequestMessageSchema = netRecoveryRequestPayloadSchema.extend({
  t: z.literal('net.recovery.request'),
});
export const netRecoveryMessageSchema = netRecoveryPayloadSchema.extend({ t: z.literal('net.recovery') });

export type NetInputsMessage = z.infer<typeof netInputsMessageSchema>;
export type NetStateMessage = z.infer<typeof netStateMessageSchema>;
export type NetChecksumMessage = z.infer<typeof netChecksumMessageSchema>;
export type NetRecoveryRequest = z.infer<typeof netRecoveryRequestMessageSchema>;
export type NetRecoveryMessage = z.infer<typeof netRecoveryMessageSchema>;

/** One client→room or room→client message. Batches travel as an array; see `netMessagesSchema`. */
export const netMessageSchema = z.discriminatedUnion('t', [
  netInputsMessageSchema,
  netStateMessageSchema,
  netChecksumMessageSchema,
  netRecoveryRequestMessageSchema,
  netRecoveryMessageSchema,
]);
export type NetMessage = z.infer<typeof netMessageSchema>;

export const netMessagesSchema = z.array(netMessageSchema).max(NET_LIMITS.maxBatchMessages);

/** The room's `net.start`: the epoch, the shared seed, tick 0's server time and every seat. */
export const netStartSchema = z.strictObject({
  epoch,
  seed: z.number().int(),
  startAt: z.number().int(),
  tick,
  primary: seatIndex,
  seats: z.array(netSeatSchema).min(1).max(NET_LIMITS.maxSeats),
  /** Present only in the per-seat copy of `net.start`. */
  privateSeed: z.number().int().optional(),
});
export type NetStart = z.infer<typeof netStartSchema>;

export const netSchemas = {
  'net.messages.v2': netMessagesSchema,
  'net.seat.v2': netSeatSchema,
  'net.start.v2': netStartSchema,
} satisfies Record<string, z.ZodType>;
