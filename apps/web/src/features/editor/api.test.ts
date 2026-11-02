import { afterEach, describe, expect, it, vi } from 'vitest';

import { savesPath, type DesignDoc } from '@ogm/contracts/browser';

import { getOptionalPublished, getOptionalSaves, postTransaction, putSave, type TransactionBody } from './api';

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

  it('writes an identity-free save with the selected slot concurrency revision', async () => {
    const fetch = vi.fn().mockResolvedValue(response(204));
    vi.stubGlobal('fetch', fetch);

    await putSave(gameId, '2', { saveSchemaVersion: 1, data: { room: 'crypt' } }, 7);

    const [path, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/v1${savesPath(gameId, '2')}`);
    expect(path).toBe(`/api/v1/games/${gameId}/saves/2`);
    expect(new Headers(init.headers).get('if-match')).toBe('"7"');
    expect(JSON.parse(String(init.body))).toEqual({ saveSchemaVersion: 1, data: { room: 'crypt' } });
  });

  it('uses a conditional published request and preserves the ETag on 304', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(undefined, {
        status: 304,
        headers: { etag: '"release-2"' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(getOptionalPublished(gameId, '"release-2"')).resolves.toEqual({
      available: true,
      modified: false,
      etag: '"release-2"',
    });
    expect(new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers).get('if-none-match')).toBe('"release-2"');
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
