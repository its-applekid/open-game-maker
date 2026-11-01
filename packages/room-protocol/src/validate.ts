import { DesignTxSchema, InputFrameSchema, LIMITS, type DesignTx, type InputFrame, type RoomPin } from '@ogm/contracts';

const encoder = new TextEncoder();

/** UTF-8 byte length of a value's JSON form. */
export function byteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value) ?? '').byteLength;
}

export type DesignTxResult = { ok: true; tx: DesignTx } | { ok: false; reason: 'schema' | 'branch' | 'path' | 'size' };

/** The room checks only the branch pin, design-root paths and size; T08 owns what a transaction means. */
export function validateDesignTx(tx: unknown, pin: Pick<RoomPin, 'branchId'>): DesignTxResult {
  const parsed = DesignTxSchema.safeParse(tx);
  if (!parsed.success) {
    const badPath = parsed.error.issues.some((issue) => issue.path[0] === 'patches' && issue.path.at(-1) === 'path');
    return { ok: false, reason: badPath ? 'path' : 'schema' };
  }
  if (parsed.data.branchId !== pin.branchId) return { ok: false, reason: 'branch' };
  if (byteLength(parsed.data) > LIMITS.designTxBytes) return { ok: false, reason: 'size' };
  return { ok: true, tx: parsed.data };
}

export type InputFrameResult = { ok: true; frame: InputFrame } | { ok: false; reason: 'schema' | 'size' };

export function validateInputFrame(frame: unknown): InputFrameResult {
  if (byteLength(frame) > LIMITS.inputBytes) return { ok: false, reason: 'size' };
  const parsed = InputFrameSchema.safeParse(frame);
  return parsed.success ? { ok: true, frame: parsed.data } : { ok: false, reason: 'schema' };
}
