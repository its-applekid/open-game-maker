import { LIMITS, LIMITS_V2 } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { assertByteLength, decodeBase64, encodeBase64, NET_LIMITS, packJson, unpackJson } from './codec.js';
import { DEFAULT_SEAT_STATE_HZ, RECOVERY_BUDGET, SEAT_STATE_BUDGET } from './modes/per-seat.js';

describe('net JSON codec', () => {
  it('stays aligned with the room protocol byte limits', () => {
    expect(NET_LIMITS).toEqual({
      inputBytes: LIMITS.inputBytes,
      snapshotBytes: LIMITS.snapshotBytes,
      eventBytes: LIMITS.eventBytes,
    });
  });

  it('keeps the v2 wire budget equal to the contract family it shares', () => {
    /* the mode packs against these locally so a browser bundle never pulls room code; a drift is a wire rejection */
    expect(SEAT_STATE_BUDGET).toBe(LIMITS_V2.stateBytes);
    expect(RECOVERY_BUDGET).toBe(LIMITS_V2.recoveryBytes);
    expect(DEFAULT_SEAT_STATE_HZ).toBe(LIMITS_V2.statePerSec);
    expect(LIMITS_V2.inputsBytes).toBeGreaterThan(NET_LIMITS.inputBytes);
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
