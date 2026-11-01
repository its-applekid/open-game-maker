import { roundExpiry } from '@ogm/blob-store';
import { describe, expect, it } from 'vitest';

import { makeApp } from './helpers.js';

describe('GET /blobs/sha256/:hex', () => {
  it('serves a signed blob from the loopback API and refuses a bad signature', async () => {
    const { app, deps } = await makeApp();
    const ref = await deps.blobStore.put(new TextEncoder().encode('blob bytes'), 'text/plain');
    const { url } = await deps.blobStore.signedGet(ref.hash, new Date(Date.now() + 60_000));
    const { pathname, search } = new URL(url);

    const response = await app.request(`${pathname}${search}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe('blob bytes');

    const exp = roundExpiry(new Date());
    const forged = await app.request(`${pathname}?exp=${exp}&sig=${'0'.repeat(64)}`);
    expect(forged.status).toBe(403);
  });
});
