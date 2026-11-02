import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { Hono, type Context } from 'hono';

import type { BlobHash } from '@ogm/blob-store';

import type { ApiBindings } from '../app/types.js';
import { readBoundedBody } from '../app/read-body.js';
import type { HookDaemonResolver } from '../internal/bundle.js';

const HEX = /^[0-9a-f]{64}$/;

// A sandboxed game daemon's only way to the blob store: put and get tier-3 asset bytes by sha256, with its hook secret.
export function daemonBlobRoutes(opts: { daemonForSecret: HookDaemonResolver }) {
  async function authorized(c: Context<ApiBindings>): Promise<boolean> {
    const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
    return match !== null && (await opts.daemonForSecret(match[1], c.get('deps'))) !== null;
  }

  return new Hono<ApiBindings>()
    .put('/sha256/:hex', async (c) => {
      if (!(await authorized(c))) return c.json({ error: 'unauthenticated' }, 401);
      const hex = c.req.param('hex');
      if (!HEX.test(hex)) return c.json({ error: 'not_found' }, 404);
      const { blobStore, config } = c.get('deps');
      const hash: BlobHash = `sha256:${hex}`;
      const existing = await blobStore.head(hash);
      if (existing) return c.json(existing, 200);

      const bytes = await readBoundedBody(c.req.raw, config.blobPutMaxBytes, 'blob_too_large');
      if (createHash('sha256').update(bytes).digest('hex') !== hex) return c.json({ error: 'sha_mismatch' }, 400);
      const mime = c.req.header('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
      return c.json(await blobStore.put(bytes, mime), 201);
    })
    .get('/sha256/:hex', async (c) => {
      if (!(await authorized(c))) return c.json({ error: 'unauthenticated' }, 401);
      const hex = c.req.param('hex');
      if (!HEX.test(hex)) return c.json({ error: 'not_found' }, 404);
      const opened = await c.get('deps').blobStore.open(`sha256:${hex}`);
      if (!opened) return c.json({ error: 'not_found' }, 404);
      return new Response(Readable.toWeb(opened.stream as Readable) as ReadableStream, {
        status: 200,
        headers: { 'Content-Type': opened.ref.mime, 'Content-Length': String(opened.ref.bytes) },
      });
    });
}
