import type { InputFrame } from '@ogm/contracts/browser';

/**
 * On-wire framing for the transport seam (N4, #498 §4.2).
 *
 * `input` and `state` share one WebRTC data channel because both are latest-wins and neither may head-of-line block
 * the other's sending, so every frame starts with a tag byte that names its channel. The relay maps each channel onto
 * its own room message and keeps the same bytes, so a payload encoded for one transport is readable by a debug log
 * written for the other.
 */

export const FRAME_INPUT = 0x01;
export const FRAME_STATE = 0x02;
export const FRAME_EVENT = 0x03;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type StateFrame = { seq: number; tick: number; data: Uint8Array<ArrayBuffer> };
export type EventFrame = { seq: number; data: Uint8Array<ArrayBuffer> };

export function encodeInputFrame(frame: InputFrame): Uint8Array {
  const body = textEncoder.encode(JSON.stringify(frame));
  const bytes = new Uint8Array(body.byteLength + 1);
  bytes[0] = FRAME_INPUT;
  bytes.set(body, 1);
  return bytes;
}

export function decodeInputFrame(bytes: Uint8Array): InputFrame | undefined {
  if (bytes[0] !== FRAME_INPUT) return undefined;
  try {
    const parsed: unknown = JSON.parse(textDecoder.decode(bytes.subarray(1)));
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const frame = parsed as Partial<InputFrame>;
    if (
      !Number.isInteger(frame.seq) ||
      !Number.isInteger(frame.tick) ||
      !Array.isArray(frame.axes) ||
      !Number.isInteger(frame.buttons)
    ) {
      return undefined;
    }
    return { seq: frame.seq as number, tick: frame.tick as number, axes: frame.axes, buttons: frame.buttons as number };
  } catch {
    return undefined;
  }
}

export function encodeStateFrame(seq: number, tick: number, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.byteLength + 9);
  bytes[0] = FRAME_STATE;
  const view = new DataView(bytes.buffer);
  view.setUint32(1, seq >>> 0);
  view.setUint32(5, tick >>> 0);
  bytes.set(data, 9);
  return bytes;
}

export function decodeStateFrame(bytes: Uint8Array): StateFrame | undefined {
  if (bytes[0] !== FRAME_STATE || bytes.byteLength < 9) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { seq: view.getUint32(1), tick: view.getUint32(5), data: copy(bytes.subarray(9)) };
}

export function encodeEventFrame(seq: number, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.byteLength + 5);
  bytes[0] = FRAME_EVENT;
  new DataView(bytes.buffer).setUint32(1, seq >>> 0);
  bytes.set(data, 5);
  return bytes;
}

export function decodeEventFrame(bytes: Uint8Array): EventFrame | undefined {
  if (bytes[0] !== FRAME_EVENT || bytes.byteLength < 5) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { seq: view.getUint32(1), data: copy(bytes.subarray(5)) };
}

/** An `ArrayBuffer`-backed copy: room messages are typed `Uint8Array<ArrayBuffer>` and a slice is not. */
function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out;
}
