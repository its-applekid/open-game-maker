import type { CommitOp } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { CommitUnavailable, HttpCommitClient } from '../src/releases/commit-client.js';

const operation: CommitOp = {
  kind: 'release',
  gameId: 'g_1',
  sha: 'a'.repeat(40),
  semver: '1.0.0',
  changelog: 'Updates',
};

describe('release commit client', () => {
  it('posts a validated operation with the service token', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, sha: 'b'.repeat(40) }));
    const client = new HttpCommitClient('http://127.0.0.1:4301', 'secret-token', fetcher);

    await expect(client.execute(operation)).resolves.toEqual({ ok: true, sha: 'b'.repeat(40) });
    const [url, request] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:4301/internal/commit');
    expect(request.headers).toMatchObject({ authorization: 'Bearer secret-token' });
    expect(JSON.parse(request.body as string)).toEqual(operation);
  });

  it('turns transport failures into an unavailable error', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const client = new HttpCommitClient('http://127.0.0.1:4301', 'secret-token', fetcher);

    await expect(client.execute(operation)).rejects.toBeInstanceOf(CommitUnavailable);
  });
});
