import { homedir } from 'node:os';
import { Readable } from 'node:stream';

import { Hono } from 'hono';

import { serveBlob } from '@ogm/blob-store';

import type { ApiBindings } from '../app/types.js';
import { hookSecretFiles } from '../internal/bundle.js';
import { daemonBlobRoutes } from './daemon.js';

export const prefix = '/blobs';

// Signed GETs (`?exp=&sig=`) resolve on the API's loopback port; no principal needed.
export default new Hono<ApiBindings>()
  .get('/sha256/:hex', async (c) => {
    const { blobStore, config } = c.get('deps');
    const result = await serveBlob(blobStore, config.blobSigningKey, new URL(c.req.url));
    const body = result.stream ? (Readable.toWeb(result.stream as Readable) as ReadableStream) : null;
    return new Response(body, { status: result.status, headers: result.headers });
  })
  .route('/daemon', daemonBlobRoutes({ daemonForSecret: hookSecretFiles(homedir()) }));
