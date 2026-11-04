import { describe, expect, it, vi } from 'vitest';

import { createTownReadyGate, formatHttpError, loadWindowMilliseconds } from '../tools/loadrec.mjs';

describe('deploy load recorder', () => {
  it('accepts a positive readiness window in seconds', () => {
    expect(loadWindowMilliseconds('60')).toBe(60_000);
    expect(() => loadWindowMilliseconds('0')).toThrow(/positive number/);
    expect(() => loadWindowMilliseconds('later')).toThrow(/positive number/);
  });

  it('stops waiting as soon as town-ready arrives', async () => {
    const gate = createTownReadyGate();
    const deadline = vi.fn(() => new Promise<void>(() => undefined));
    const waiting = gate.wait(60_000, deadline);

    gate.mark('msg unrelated');
    expect(deadline).toHaveBeenCalledOnce();
    gate.mark('msg town-ready');

    await expect(waiting).resolves.toBeUndefined();
  });

  it('prints the status and URL for failed HTTP responses only', () => {
    expect(formatHttpError({ ok: () => false, status: () => 500, url: () => 'https://app.example/api/me' })).toBe(
      'http 500 https://app.example/api/me',
    );
    expect(formatHttpError({ ok: () => true, status: () => 200, url: () => 'https://app.example/' })).toBeUndefined();
  });
});
