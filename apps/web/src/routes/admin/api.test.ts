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

  it('loads the complete family build list from the admin endpoint', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ builds: [], games: [], members: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', request);

    await expect(fetchAdminBuilds()).resolves.toEqual({ builds: [], games: [], members: [] });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/admin/builds');
  });
});
