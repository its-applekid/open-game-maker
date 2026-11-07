import { describe, expect, it } from 'vitest';

import { CommitServiceInstallationLookup, GitHubOAuthUnavailableError } from '../src/github/installations.js';

// A 404 means "no such installation for this user" (the route answers 404 and stores nothing); a 503 saying the App
// has no OAuth client means ownership can never be proven; anything else that is not a login must fail loudly so a
// broken commit service is never mistaken for a missing installation.

type Seen = {
  method?: string;
  url?: string;
  authorization?: string | null;
  contentType?: string | null;
  body?: string;
};

function lookupAnswering(status: number, body: string, seen: Seen = {}) {
  return new CommitServiceInstallationLookup({
    baseUrl: 'http://127.0.0.1:4301/',
    token: 'commit-service-token-for-tests',
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      seen.method = init?.method ?? 'GET';
      seen.url = String(input);
      seen.authorization = headers.get('authorization');
      seen.contentType = headers.get('content-type');
      seen.body = typeof init?.body === 'string' ? init.body : undefined;
      return new Response(body, { status, headers: { 'content-type': 'application/json' } });
    },
  });
}

describe('CommitServiceInstallationLookup', () => {
  it('proves ownership by posting the code with the service bearer', async () => {
    const seen: Seen = {};
    await expect(
      lookupAnswering(200, JSON.stringify({ login: 'octocat' }), seen).loginFor('4242', 'code-abc_123'),
    ).resolves.toBe('octocat');
    expect(seen).toEqual({
      method: 'POST',
      url: 'http://127.0.0.1:4301/internal/installations/4242/ownership',
      authorization: 'Bearer commit-service-token-for-tests',
      contentType: 'application/json',
      body: JSON.stringify({ code: 'code-abc_123' }),
    });
  });

  it('revalidates a stored installation with the service bearer', async () => {
    const seen: Seen = {};
    await expect(lookupAnswering(200, JSON.stringify({ login: 'octocat' }), seen).revalidate('4242')).resolves.toBe(
      'octocat',
    );
    expect(seen).toEqual({
      method: 'GET',
      url: 'http://127.0.0.1:4301/internal/installations/4242',
      authorization: 'Bearer commit-service-token-for-tests',
      contentType: null,
      body: undefined,
    });
  });

  it('maps 404 to null for both reads', async () => {
    const missing = '{"error":"installation_not_found"}';
    await expect(lookupAnswering(404, missing).loginFor('9', 'code')).resolves.toBeNull();
    await expect(lookupAnswering(404, missing).revalidate('9')).resolves.toBeNull();
  });

  it('reports an App with no OAuth client as unavailable rather than missing', async () => {
    const unavailable = lookupAnswering(503, '{"error":"github_oauth_unavailable"}');
    await expect(unavailable.loginFor('9', 'code')).rejects.toBeInstanceOf(GitHubOAuthUnavailableError);
    await expect(lookupAnswering(503, '{"error":"installations unavailable"}').loginFor('9', 'code')).rejects.toThrow(
      '503',
    );
  });

  it('rejects a failed or malformed answer', async () => {
    await expect(lookupAnswering(502, '{"error":"installation lookup failed"}').loginFor('9', 'c')).rejects.toThrow(
      '502',
    );
    await expect(lookupAnswering(200, '{}').loginFor('9', 'c')).rejects.toThrow('200');
    await expect(lookupAnswering(200, 'not json').loginFor('9', 'c')).rejects.toThrow('200');
  });
});
