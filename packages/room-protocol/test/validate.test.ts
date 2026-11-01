import { describe, expect, it } from 'vitest';

import { validateDesignTx, validateInputFrame } from '../src/validate.js';

const pin = { branchId: 'b_01J' };
const tx = (patch: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  branchId: 'b_01J',
  rev: 2,
  baseRev: 1,
  actor: 'u_01J',
  kind: 'manual',
  patches: [{ op: 'replace', ...patch }],
  ...extra,
});

describe('validateDesignTx', () => {
  it('accepts a design-root path and keeps T08 fields', () => {
    const result = validateDesignTx(tx({ path: '/entities/e1/props/x', value: 1 }, { leaseToken: 'l' }), pin);
    expect(result).toMatchObject({ ok: true, tx: { leaseToken: 'l' } });
  });

  it.each([[['prompt', 'text']], ['/prompt/text']])('rejects non-design path %j', (path) => {
    expect(validateDesignTx(tx({ path, value: 1 }), pin)).toEqual({ ok: false, reason: 'path' });
  });

  it('rejects a transaction for another branch', () => {
    expect(validateDesignTx(tx({ path: '/globals/g', value: 1 }, { branchId: 'b_other' }), pin)).toEqual({
      ok: false,
      reason: 'branch',
    });
  });

  it('rejects a transaction over 64 KiB', () => {
    expect(validateDesignTx(tx({ path: '/globals/g', value: 'x'.repeat(70 * 1024) }), pin)).toEqual({
      ok: false,
      reason: 'size',
    });
  });

  it('rejects a malformed transaction', () => {
    expect(validateDesignTx({ ...tx({ path: '/globals/g' }), rev: -1 }, pin)).toEqual({ ok: false, reason: 'schema' });
  });
});

describe('validateInputFrame', () => {
  it('accepts a small frame', () => {
    expect(validateInputFrame({ seq: 1, tick: 2, axes: [0.5], buttons: 3 }).ok).toBe(true);
  });

  it('rejects a frame over 256 bytes', () => {
    const axes = Array.from({ length: 8 }, () => 0.123456789012345);
    const frame = { seq: 1, tick: 2, axes: [...axes, ...axes, ...axes], buttons: 0 };
    expect(validateInputFrame(frame)).toEqual({ ok: false, reason: 'size' });
  });

  it('rejects text riding the input channel', () => {
    expect(validateInputFrame({ seq: 1, tick: 2, axes: [], buttons: 0, text: 'hi' })).toEqual({
      ok: false,
      reason: 'schema',
    });
  });
});
