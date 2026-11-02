import { createHmac, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';

import type { ActiveRepository } from './api-client.js';
import type { BoundaryCheck, BoundaryCheckRequest } from './poller.js';

type Payload = {
  action?: string;
  repository?: { name?: string; private?: boolean; owner?: { login?: string } };
  pull_request?: { number?: number; draft?: boolean; head?: { sha?: string } };
};

function validSignature(body: Uint8Array, secret: string, signature: string | undefined): boolean {
  if (signature === undefined) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function requestOf(payload: Payload, active: ActiveRepository): BoundaryCheckRequest | undefined {
  const pull = payload.pull_request;
  if (pull?.number === undefined || pull.draft === undefined || pull.head?.sha === undefined) return undefined;
  return {
    gameId: active.gameId,
    repository: { owner: active.owner, name: active.name, visibility: active.visibility },
    pull: { number: pull.number, draft: pull.draft, headSha: pull.head.sha },
  };
}

export function registerBoundaryWebhook(
  app: Hono,
  options: {
    secret: string | undefined;
    resolveRepository(owner: string, name: string): Promise<ActiveRepository | undefined>;
    run: BoundaryCheck;
  },
): void {
  app.post('/internal/github/webhook', async (c) => {
    if (options.secret === undefined) return c.json({ error: 'webhook unavailable' }, 503);
    const raw = new Uint8Array(await c.req.raw.arrayBuffer());
    if (!validSignature(raw, options.secret, c.req.header('x-hub-signature-256'))) {
      return c.json({ error: 'invalid signature' }, 401);
    }
    if (c.req.header('x-github-event') !== 'pull_request') return c.body(null, 202);
    let payload: Payload;
    try {
      payload = JSON.parse(Buffer.from(raw).toString('utf8')) as Payload;
    } catch {
      return c.json({ error: 'invalid payload' }, 422);
    }
    if (!['opened', 'synchronize', 'reopened'].includes(payload.action ?? '')) return c.body(null, 202);
    const owner = payload.repository?.owner?.login;
    const name = payload.repository?.name;
    if (owner === undefined || name === undefined) return c.json({ error: 'invalid payload' }, 422);
    const active = await options.resolveRepository(owner, name);
    if (active === undefined) return c.body(null, 202);
    const request = requestOf(payload, active);
    if (request === undefined) return c.json({ error: 'invalid payload' }, 422);
    await options.run(request);
    return c.body(null, 202);
  });
}
