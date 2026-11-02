import { LIMITS } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { assertByteLength, decodeBase64, encodeBase64, NET_LIMITS, packJson, unpackJson } from './codec.js';

describe('net JSON codec', () => {
  it('stays aligned with the room protocol byte limits', () => {
    expect(NET_LIMITS).toEqual({
      inputBytes: LIMITS.inputBytes,
      snapshotBytes: LIMITS.snapshotBytes,
      eventBytes: LIMITS.eventBytes,
    });
  });

  it('round-trips Unicode through bytes and bridge base64', () => {
    const value = { label: 'Café 🎮', nested: { ready: true } };
    const bytes = packJson(value, 256, 'fixture');

    expect(unpackJson(decodeBase64(encodeBase64(bytes)))).toEqual(value);
  });

  it('rejects a payload one byte over its cap', () => {
    expect(() => assertByteLength(new Uint8Array(257), 256, 'input')).toThrow(
      'input payload is 257 bytes; maximum is 256',
    );
  });

  it('rejects invalid base64 data', () => {
    expect(() => decodeBase64('not base64!')).toThrow(TypeError);
  });
});
