import { describe, expect, it, vi } from 'vitest';

import { GitHubRateLimitError, GitHubRequestError, withSafeGitHubRequests } from '../src/github-request.js';
import type { GitHubRequest } from '../src/types.js';

function failure(status: number, headers: Record<string, string> = {}, message = 'failed') {
  return Object.assign(new Error(message), { status, response: { headers } });
}

describe('withSafeGitHubRequests', () => {
  it('honors Retry-After once', async () => {
    const request = vi
      .fn<GitHubRequest>()
      .mockRejectedValueOnce(failure(429, { 'retry-after': '2' }))
      .mockResolvedValueOnce({ data: { ok: true } });
    const delay = vi.fn(async () => undefined);
    const safe = withSafeGitHubRequests(request, delay);
    await expect(safe('GET /app')).resolves.toEqual({ data: { ok: true } });
    expect(delay).toHaveBeenCalledWith(2_000);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('fails closed after the single rate-limit retry', async () => {
    const request = vi.fn<GitHubRequest>().mockRejectedValue(
      failure(403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '101',
      }),
    );
    const safe = withSafeGitHubRequests(
      request,
      async () => undefined,
      () => 100_000,
    );
    await expect(safe('GET /app')).rejects.toBeInstanceOf(GitHubRateLimitError);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('redacts the upstream message and response data', async () => {
    const request = vi
      .fn<GitHubRequest>()
      .mockRejectedValue(failure(401, {}, 'bad credentials for token secret-installation-token'));
    await expect(withSafeGitHubRequests(request)('GET /app')).rejects.toEqual(
      new GitHubRequestError('github request failed', 401),
    );
  });
});
