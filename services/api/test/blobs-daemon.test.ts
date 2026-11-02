import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app/app.js';
import { daemonBlobRoutes } from '../src/blobs/daemon.js';
import { makeApp, makeDeps } from './helpers.js';

const SECRET = 'hook-secret-of-daemon-a';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

// The blob route a sandboxed game daemon uses to store and fetch tier-3 asset bytes; makeDeps caps puts at 1024 bytes.
function setup() {
  const deps = makeDeps();
  const app = createApp(deps);
  app.route(
    '/blobs/daemon',
    daemonBlobRoutes({ daemonForSecret: async (secret) => (secret === SECRET ? 'everdred-games/gm-g1' : null) }),
  );
  const call = (method: string, hex: string, opts: { secret?: string; body?: string; mime?: string } = {}) =>
    app.request(`http://127.0.0.1:4000/blobs/daemon/sha256/${hex}`, {
      method,
      headers: {
        ...(opts.secret ? { authorization: `Bearer ${opts.secret}` } : {}),
        ...(opts.mime ? { 'content-type': opts.mime } : {}),
      },
      ...(opts.body === undefined ? {} : { body: opts.body }),
    });
  return { deps, call };
}

describe('daemon blob route', () => {
  it('is mounted on the API under /blobs/daemon and needs a hook secret there', async () => {
    const { app } = await makeApp();
    const response = await app.request(`/blobs/daemon/sha256/${sha('x')}`, { method: 'PUT', body: 'x' });
    expect(response.status).toBe(401);
  });

  it('refuses a caller without a daemon hook secret, for put and get', async () => {
    const { deps, call } = setup();
    expect((await call('PUT', sha('x'), { body: 'x' })).status).toBe(401);
    expect((await call('PUT', sha('x'), { body: 'x', secret: 'not-a-daemon' })).status).toBe(401);
    expect(await deps.blobStore.head(`sha256:${sha('x')}`)).toBeNull();
    expect((await call('GET', sha('x'))).status).toBe(401);
  });

  it('stores bytes under their sha, dedups a second put, and serves them back', async () => {
    const { call } = setup();
    const hex = sha('door-bytes');
    const first = await call('PUT', hex, { secret: SECRET, body: 'door-bytes', mime: 'model/gltf-binary' });
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ hash: `sha256:${hex}`, bytes: 10, mime: 'model/gltf-binary' });
    expect((await call('PUT', hex, { secret: SECRET, body: 'door-bytes' })).status).toBe(200);

    const got = await call('GET', hex, { secret: SECRET });
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('model/gltf-binary');
    expect(await got.text()).toBe('door-bytes');
  });

  it('refuses bytes that do not hash to the named sha', async () => {
    const { deps, call } = setup();
    const response = await call('PUT', sha('expected'), { secret: SECRET, body: 'other' });
    expect(response.status).toBe(400);
    expect(await deps.blobStore.head(`sha256:${sha('expected')}`)).toBeNull();
    expect(await deps.blobStore.head(`sha256:${sha('other')}`)).toBeNull();
  });

  it('refuses a body over the configured size cap', async () => {
    const { deps, call } = setup();
    const big = 'x'.repeat(deps.config.blobPutMaxBytes + 1);
    const response = await call('PUT', sha(big), { secret: SECRET, body: big });
    expect(response.status).toBe(413);
    expect(await deps.blobStore.head(`sha256:${sha(big)}`)).toBeNull();
  });

  it('answers 404 for an unknown or malformed sha', async () => {
    const { call } = setup();
    expect((await call('GET', sha('missing'), { secret: SECRET })).status).toBe(404);
    expect((await call('GET', 'not-a-sha', { secret: SECRET })).status).toBe(404);
  });
});
