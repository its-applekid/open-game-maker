import type { Dirent } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { blobPath, getFsBlobRoot, type FsBlobStore } from './fs-store.js';
import { assertBlobHash, type BlobHash } from './hash.js';

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function removeStaleTemporaryFiles(root: string, cutoff: number, dryRun: boolean): Promise<void> {
  const temporaryRoot = join(root, 'tmp');
  let entries: Dirent[];
  try {
    entries = await readdir(temporaryRoot, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(temporaryRoot, entry.name);
    try {
      if ((await stat(path)).mtimeMs < cutoff && !dryRun) await unlink(path);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

export async function gc(
  store: FsBlobStore,
  roots: Iterable<BlobHash> | AsyncIterable<BlobHash>,
  opts: { graceMs: number; nowMs?: number; dryRun?: boolean },
): Promise<{ scanned: number; kept: number; deleted: BlobHash[] }> {
  if (!Number.isFinite(opts.graceMs) || opts.graceMs < 0) {
    throw new RangeError('Invalid GC grace period');
  }
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) throw new RangeError('Invalid GC clock');

  const rootSet = new Set<BlobHash>();
  for await (const hash of roots) {
    assertBlobHash(hash);
    rootSet.add(hash);
  }

  const root = getFsBlobRoot(store);
  const blobRoot = join(root, 'blobs', 'sha256');
  const cutoff = nowMs - opts.graceMs;
  const deleted: BlobHash[] = [];
  let scanned = 0;
  let kept = 0;
  let entries: Dirent[];
  try {
    entries = await readdir(blobRoot, { withFileTypes: true });
  } catch (error) {
    if (!isNotFound(error)) throw error;
    entries = [];
  }

  for (const entry of entries) {
    if (!entry.isFile() || !/^[0-9a-f]{64}$/.test(entry.name)) continue;
    const hash = `sha256:${entry.name}` as BlobHash;
    let modified: number;
    try {
      modified = (await stat(blobPath(root, hash))).mtimeMs;
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }

    scanned += 1;
    if (rootSet.has(hash) || modified >= cutoff) {
      kept += 1;
      continue;
    }

    deleted.push(hash);
    if (!opts.dryRun) await store.delete(hash);
  }

  await removeStaleTemporaryFiles(root, cutoff, opts.dryRun ?? false);
  return { scanned, kept, deleted };
}
