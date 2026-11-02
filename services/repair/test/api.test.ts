import { describe, expect, it, vi } from 'vitest';

import { createRepairApi } from '../src/api.js';

describe('repair API client', () => {
  it('puts a wall-clock deadline on every request', async () => {
    const request = vi.fn(async () => Response.json({ report: null }));
    const api = createRepairApi({
      baseUrl: 'http://127.0.0.1:4300',
      token: 'private-token',
      wallClockMinutes: 10,
      fetch: request,
      now: () => new Date('2026-11-01T18:00:00.000Z'),
    });

    await expect(api.claim()).resolves.toBeNull();
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:4300/api/v1/reports/triage/claim',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
