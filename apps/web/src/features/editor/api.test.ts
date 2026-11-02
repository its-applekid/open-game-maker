import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DesignDoc } from '@ogm/contracts';

import { getOptionalSaves, postTransaction, type TransactionBody } from './api';

const gameId = 'g_00000000-0000-4000-8000-000000000001';
const buildId = 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ';

function body(): TransactionBody {
  return {
    baseRev: 4,
    leaseToken: 2,
    kind: 'manual',
    label: 'Move skeleton',
    baseBuildId: buildId,
    commands: [],
    patches: [],
    inverse: [],
    sessionId: 'session-a',
  };
}

function response(status: number, value?: unknown): Response {
  return new Response(value === undefined ? undefined : JSON.stringify(value), {
    status,
    headers: value === undefined ? undefined : { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editor API classifications', () => {
  it('reports 409 as a conflict with the authoritative head revision', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(409, { headRev: 9 })));

    await expect(postTransaction(gameId, 'main', body())).resolves.toEqual({ ok: false, kind: 'conflict', headRev: 9 });
  });

  it('reports 423 as lease loss', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(423, { holder: 'other-session' })));

    await expect(postTransaction(gameId, 'main', body())).resolves.toEqual({
      ok: false,
      kind: 'lease-lost',
      holder: 'other-session',
    });
  });

  it('reports a transport failure as retryable without claiming the write saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(postTransaction(gameId, 'main', body())).resolves.toMatchObject({
      ok: false,
      kind: 'retryable',
      message: 'offline',
    });
  });

  it('treats only an exact 404 as an absent optional capability', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(404, { error: 'not_found' }))
      .mockResolvedValueOnce(response(500, { error: 'broken' }));
    vi.stubGlobal('fetch', fetch);

    await expect(getOptionalSaves(gameId)).resolves.toEqual({ available: false });
    await expect(getOptionalSaves(gameId)).rejects.toMatchObject({ status: 500 });
  });

  it('refuses an over-cap transaction before calling fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const hugeDoc = { blob: 'x'.repeat(300_000) } satisfies Partial<DesignDoc>;

    await expect(
      postTransaction(gameId, 'main', {
        ...body(),
        patches: [{ op: 'add', path: ['globals', 'huge'], value: hugeDoc }],
      }),
    ).resolves.toEqual({ ok: false, kind: 'invalid', reason: 'patch_too_large' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
