/** Kept equal to the room protocol limits without importing room code into browser bundles. */
export const NET_LIMITS = {
  inputBytes: 256,
  snapshotBytes: 65_536,
  eventBytes: 16_384,
} as const;

export class NetPayloadTooLargeError extends RangeError {
  constructor(label: string, byteLength: number, maximum: number) {
    super(`${label} payload is ${byteLength} bytes; maximum is ${maximum}`);
    this.name = 'NetPayloadTooLargeError';
  }
}

export function assertByteLength(bytes: Uint8Array, maximum: number, label: string): void {
  if (bytes.byteLength > maximum) {
    throw new NetPayloadTooLargeError(label, bytes.byteLength, maximum);
  }
}

export function packJson(value: unknown, maximum: number, label: string): Uint8Array {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError(`${label} payload must be JSON-serializable`);
  const bytes = new TextEncoder().encode(json);
  assertByteLength(bytes, maximum, label);
  return bytes;
}

export function unpackJson<T = unknown>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TypeError('Invalid base64 data');
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
