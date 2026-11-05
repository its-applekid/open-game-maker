import { afterEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '../../app/query';
import { buildChatJob } from './test-fixtures';
import { fetchMyJobs, myJobsQueryKey, refreshJobsForNotification } from './jobs';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('build chat jobs', () => {
  it('invalidates the jobs query once for a build notification', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    refreshJobsForNotification('build.done');
    refreshJobsForNotification('intake.report');

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: myJobsQueryKey });
  });

  it('keeps successful game jobs when another game request fails', async () => {
    const job = buildChatJob();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/v1/games') {
          return json({
            games: [
              { id: 'g_good', title: 'Good game' },
              { id: 'g_bad', title: 'Bad game' },
            ],
          });
        }
        if (url.endsWith('gameId=g_good')) return json({ jobs: [job] });
        return json({ error: 'unavailable' }, 503);
      }),
    );

    await expect(fetchMyJobs(job.creatorId)).resolves.toEqual({
      games: [
        { id: 'g_good', title: 'Good game' },
        { id: 'g_bad', title: 'Bad game' },
      ],
      jobs: [job],
    });
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
