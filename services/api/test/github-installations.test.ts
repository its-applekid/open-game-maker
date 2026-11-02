import { describe, expect, it } from 'vitest';

import { CommitServiceInstallationLookup } from '../src/github/installations.js';

// A 404 means "no such installation" (the route answers 404 and stores nothing); anything else that is
// not a login must fail loudly so a broken commit service is never mistaken for a missing installation.

function lookupAnswering(status: number, body: string, seen: { url?: string; authorization?: string | null } = {}) {
  return new CommitServiceInstallationLookup({
    baseUrl: 'http://127.0.0.1:4301/',
    token: 'commit-service-token-for-tests',
    fetch: async (input, init) => {
      seen.url = String(input);
      seen.authorization = new Headers(init?.headers).get('authorization');
      return new Response(body, { status, headers: { 'content-type': 'application/json' } });
    },
  });
}

describe('CommitServiceInstallationLookup', () => {
  it('reads the login with the service bearer', async () => {
    const seen: { url?: string; authorization?: string | null } = {};
    await expect(lookupAnswering(200, JSON.stringify({ login: 'octocat' }), seen).loginFor('4242')).resolves.toBe(
      'octocat',
    );
    expect(seen).toEqual({
      url: 'http://127.0.0.1:4301/internal/installations/4242',
      authorization: 'Bearer commit-service-token-for-tests',
    });
  });

  it('maps 404 to null', async () => {
    await expect(lookupAnswering(404, '{"error":"installation_not_found"}').loginFor('9')).resolves.toBeNull();
  });

  it('rejects a failed or malformed answer', async () => {
    await expect(lookupAnswering(502, '{"error":"installation lookup failed"}').loginFor('9')).rejects.toThrow('502');
    await expect(lookupAnswering(200, '{}').loginFor('9')).rejects.toThrow('200');
    await expect(lookupAnswering(200, 'not json').loginFor('9')).rejects.toThrow('200');
  });
});
