import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app/app.js';
import { signJobToken } from '../src/app/job-token.js';
import { requirePrincipal } from '../src/app/principal.js';
import type { ApiBindings } from '../src/app/types.js';
import { INTERNAL_TOKEN, JOB_SECRET, makeDeps } from './helpers.js';

const ids = {
  jobId: 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
  gameId: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e01',
  familyId: 'f_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e02',
};

function setup() {
  const deps = makeDeps();
  const app = createApp(deps);
  app.route(
    '/api/v1/who',
    new Hono<ApiBindings>()
      .get('/', (c) => c.json(c.get('principal')))
      .get('/service-only', (c) => c.json(requirePrincipal(c, ['service']))),
  );
  return { app, deps };
}

const who = async (app: Hono<ApiBindings>, headers: Record<string, string>, path = '/api/v1/who') =>
  app.request(path, { headers });

describe('principal seam', () => {
  it('resolves the internal token with a known service name to that service', async () => {
    const response = await who(setup().app, { authorization: `Bearer ${INTERNAL_TOKEN}`, 'x-ogm-service': 'intake' });
    expect(await response.json()).toEqual({ kind: 'service', service: 'intake' });
  });

  it('refuses the internal token with an unknown service name', async () => {
    const response = await who(setup().app, { authorization: `Bearer ${INTERNAL_TOKEN}`, 'x-ogm-service': 'evil' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_service' });
  });

  it('treats a wrong token as anonymous', async () => {
    const response = await who(setup().app, { authorization: `Bearer ${INTERNAL_TOKEN}x`, 'x-ogm-service': 'intake' });
    expect(await response.json()).toEqual({ kind: 'anonymous' });
  });

  it('resolves a valid job token to its job', async () => {
    const response = await who(setup().app, { authorization: `Bearer ${signJobToken(ids, JOB_SECRET)}` });
    expect(await response.json()).toEqual({ kind: 'job', ...ids });
  });

  it('treats a job token signed with another secret as anonymous', async () => {
    const token = signJobToken(ids, 'some-other-secret-0123456789');
    expect(await (await who(setup().app, { authorization: `Bearer ${token}` })).json()).toEqual({ kind: 'anonymous' });
  });

  it('lets a registered resolver name the caller and keeps anonymous as the fallback', async () => {
    const { app, deps } = setup();
    expect(await (await who(app, {})).json()).toEqual({ kind: 'anonymous' });
    const user = {
      kind: 'user',
      userId: 'u1',
      displayName: 'User One',
      familyId: 'f1',
      platformRole: 'none',
      capability: 'creator',
    } as const;
    deps.registry.principalResolvers.push(
      async () => null,
      async (c) => (c.req.header('cookie') ? user : null),
    );
    expect(await (await who(app, { cookie: 's=1' })).json()).toEqual(user);
  });

  it('requirePrincipal answers 401 for anonymous and 403 for the wrong kind', async () => {
    const { app } = setup();
    expect((await who(app, {}, '/api/v1/who/service-only')).status).toBe(401);
    const job = { authorization: `Bearer ${signJobToken(ids, JOB_SECRET)}` };
    expect((await who(app, job, '/api/v1/who/service-only')).status).toBe(403);
    const service = { authorization: `Bearer ${INTERNAL_TOKEN}`, 'x-ogm-service': 'rooms' };
    expect(await (await who(app, service, '/api/v1/who/service-only')).json()).toEqual({
      kind: 'service',
      service: 'rooms',
    });
  });
});
