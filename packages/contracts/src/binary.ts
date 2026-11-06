import { z } from 'zod';

/*
 * Binary field helpers shared by every wire family that carries bytes: the `Uint8Array` form the
 * socket sees and the base64 form the JSON fixtures and emitted schemas see. `room.ts` owned these
 * inline until protocol 2 needed them in `net.ts` too; one copy keeps the two families equal.
 */

export type Binary = (maxBytes: number) => z.ZodType<unknown>;

/** Bytes at runtime; an `ArrayBuffer` is accepted and copied so callers can pass either. */
export function bytesSchema(maxBytes: number): z.ZodType<Uint8Array> {
  return z
    .union([z.instanceof(Uint8Array), z.instanceof(ArrayBuffer)])
    .transform((data) => (data instanceof Uint8Array ? data : new Uint8Array(data)))
    .refine((data) => data.byteLength <= maxBytes, { message: `at most ${maxBytes} bytes` });
}

export function base64Schema(maxBytes: number): z.ZodType<string> {
  return z
    .string()
    .max(Math.ceil(maxBytes / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
}
