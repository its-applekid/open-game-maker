import { afterEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '../../app/query';
import { adminRequest, fetchAdminBuilds } from './api';

describe('admin requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invalidates the role query when an admin request is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await expect(adminRequest('/admin/members')).rejects.toMatchObject({ status: 403 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'me'] });
  });

  it('joins the family build list with every family game and member, not only those with builds', async () => {
    const game = (id: string) => ({ id, title: id, ownerId: 'u1', visibility: 'private', delistedAt: null });
    const builds = [{ job: { id: 'j1' }, game: game('g1'), member: { userId: 'u2', email: null }, retries: 0 }];
    const games = [game('g1'), { ...game('g2'), delistedAt: '2026-11-01T00:00:00.000Z' }];
    const members = [
      { userId: 'u1', email: 'owner@example.test' },
      { userId: 'u2', email: 'kid@example.test' },
    ];
    const bodies: Record<string, unknown> = {
      '/api/v1/admin/builds': { builds },
      '/api/v1/admin/games?includeDelisted=1': { games },
      '/api/v1/admin/members': { members },
    };
    const request = vi.fn((path: string) =>
      Promise.resolve(
        new Response(JSON.stringify(bodies[path] ?? {}), {
          status: path in bodies ? 200 : 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', request);

    await expect(fetchAdminBuilds()).resolves.toEqual({ builds, games, members });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
