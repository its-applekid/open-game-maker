import { createHmac, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';

import type { ActiveRepository } from './api-client.js';
import type { BoundaryCheck, BoundaryCheckRequest } from './poller.js';

type Payload = {
  action?: string;
  repository?: { name?: string; private?: boolean; owner?: { login?: string } };
  pull_request?: { number?: number; draft?: boolean; head?: { sha?: string } };
};

const MAX_WEBHOOK_BYTES = 1024 * 1024;

class WebhookBodyTooLarge extends Error {}

async function readBody(request: Request): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) throw new WebhookBodyTooLarge();
  if (request.body === null) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      throw new WebhookBodyTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

function validSignature(body: Uint8Array, secret: string, signature: string | undefined): boolean {
  if (signature === undefined) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function requestOf(payload: Payload, games: ActiveRepository[]): BoundaryCheckRequest | undefined {
  const pull = payload.pull_request;
  const first = games[0];
  if (pull?.number === undefined || pull.draft === undefined || pull.head?.sha === undefined || first === undefined) {
    return undefined;
  }
  return {
    repository: { owner: first.owner, name: first.name, visibility: first.visibility },
    pull: { number: pull.number, draft: pull.draft, headSha: pull.head.sha },
    games: games.map((game) => ({ gameId: game.gameId, path: game.path })),
  };
}

export function registerBoundaryWebhook(
  app: Hono,
  options: {
    secret: string | undefined;
    resolveRepository(owner: string, name: string): Promise<ActiveRepository[]>;
    run: BoundaryCheck;
    onError?(error: unknown): void;
  },
): void {
  app.post('/internal/github/webhook', async (c) => {
    if (options.secret === undefined) return c.json({ error: 'webhook unavailable' }, 503);
    let raw: Uint8Array;
    try {
      raw = await readBody(c.req.raw);
    } catch (error) {
      if (error instanceof WebhookBodyTooLarge) return c.json({ error: 'payload too large' }, 413);
      throw error;
    }
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
    const games = await options.resolveRepository(owner, name);
    if (games.length === 0) return c.body(null, 202);
    const request = requestOf(payload, games);
    if (request === undefined) return c.json({ error: 'invalid payload' }, 422);
    void options.run(request).catch((error: unknown) => options.onError?.(error));
    return c.body(null, 202);
  });
}
