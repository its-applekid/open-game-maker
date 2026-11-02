import { readFile } from 'node:fs/promises';

import { FsBlobStore } from '@ogm/blob-store';

import { CommandError, UsageError, type GmContext } from './command.js';

/**
 * Puts bytes into the instance blob store, deduplicated by sha256: directly under `OGM_BLOB_ROOT`, or, inside a
 * sandboxed game daemon, through the API's daemon blob route.
 */
export async function putBlob(ctx: GmContext, bytes: Uint8Array, sha256: string, mime: string): Promise<void> {
  if (ctx.blobRoot !== null) {
    await new FsBlobStore({ root: ctx.blobRoot, signingKey: 'unused', publicOrigin: 'http://127.0.0.1' }).put(
      bytes,
      mime,
    );
    return;
  }
  if (!ctx.blobApi) {
    throw new UsageError(
      'no blob store: OGM_BLOB_ROOT, or OGM_INTERNAL_URL with OGM_HOOK_SECRET_FILE, must be set',
      'OGM_BLOB_ROOT=~/.local/share/ogm/blobs gm assets register <path> --made-by-agent',
    );
  }
  const secret = (await readFile(ctx.blobApi.secretFile, 'utf8')).trim();
  const response = await fetch(new URL(`/blobs/daemon/sha256/${sha256}`, ctx.blobApi.url), {
    method: 'PUT',
    headers: { authorization: `Bearer ${secret}`, 'content-type': mime },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) throw new CommandError(`blob store refused the asset (HTTP ${response.status})`);
}
