import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateGame } from './useCreateGame';

beforeEach(() => {
  localStorage.setItem('ogm.repoVisibility', 'public');
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('useCreateGame', () => {
  it('forces a private repository for a licensed style choice', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'g_1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useCreateGame());

    await act(async () => {
      await result.current({ genre: { picks: ['adventure'] }, vibe: { picks: ['cozy'] } }, true);
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({ repoVisibility: 'private' });
  });

  it('creates only once when the talk step renders again', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'g_1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useCreateGame());

    await act(async () => {
      await Promise.all([result.current({}, false), result.current({}, false)]);
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries after a failed creation request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'g_2' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useCreateGame());

    await act(async () => {
      await expect(result.current({}, false)).rejects.toThrow('api 503');
    });
    await act(async () => {
      await expect(result.current({}, false)).resolves.toBe('g_2');
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
