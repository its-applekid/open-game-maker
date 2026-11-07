import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assertNoSymlinks, generatedPath, sha256, stableJson, writeIfChanged } from './files.js';
import type { BuildItem, BuildJob, CacheIdentity, FreshJobResult, JobResult } from './types.js';

/**
 * One item's digest: a single-file item keeps the plain file digest it always had, so existing cache keys stay valid;
 * a card with sheets folds every file's lock path and sha256 in, so a changed companion invalidates the build too.
 */
async function itemDigest(item: BuildItem, refresh: boolean): Promise<string> {
  const files = item.files;
  if (files === undefined || files.length <= 1) {
    return !refresh && item.sourceHash ? item.sourceHash : sha256(await readFile(item.source));
  }
  const digests: Array<{ path: string; sha256: string }> = [];
  for (const file of files) {
    digests.push({ path: file.path, sha256: refresh ? sha256(await readFile(file.absolute)) : file.sha256 });
  }
  return sha256(stableJson(digests));
}

export async function sourceDigest(job: BuildJob, refresh = false): Promise<string> {
  const sources: Array<{ id: string; sha256: string }> = [];
  for (const item of job.items) {
    sources.push({ id: item.entry.id, sha256: await itemDigest(item, refresh) });
  }
  return sha256(stableJson(sources));
}

export async function cacheIdentity(job: BuildJob): Promise<CacheIdentity> {
  const sourceHash = await sourceDigest(job);
  return { sourceHash, key: `${sourceHash}-${sha256(stableJson(job.recipe))}` };
}

function validateGeneratedNames(result: JobResult): void {
  for (const name of Object.keys(result.files)) generatedPath('.', name);
  for (const asset of Object.values(result.assets)) {
    for (const name of Object.values(asset.file)) if (name) generatedPath('.', name);
  }
  for (const names of Object.values(result.companions ?? {})) {
    for (const name of names) generatedPath('.', name);
  }
}

export async function loadCached(identity: CacheIdentity, cwd: string, outDir: string): Promise<JobResult | null> {
  const directory = join(cwd, '.gm/cache/assets', identity.key);
  let result: JobResult;
  try {
    await assertNoSymlinks(cwd, directory);
    result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')) as JobResult;
    validateGeneratedNames(result);
    const cachedFiles: Array<{ name: string; bytes: Buffer }> = [];
    for (const name of Object.keys(result.files)) {
      const cachedPath = generatedPath(join(directory, 'files'), name);
      await assertNoSymlinks(cwd, cachedPath);
      const bytes = await readFile(cachedPath);
      const address = /^([0-9a-f]{64})\.[a-z0-9]+$/.exec(name)?.[1];
      if (address !== sha256(bytes) || result.files[name]?.bytes !== bytes.length) return null;
      cachedFiles.push({ name, bytes });
    }
    for (const { name, bytes } of cachedFiles) await writeIfChanged(generatedPath(outDir, name), bytes, cwd);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
  return result;
}

export async function saveBuilt(
  identity: CacheIdentity,
  cwd: string,
  outDir: string,
  result: FreshJobResult,
  cache: boolean,
): Promise<JobResult> {
  const { buffers, ...metadata } = result;
  validateGeneratedNames(metadata);
  for (const [name, bytes] of Object.entries(buffers)) {
    await writeIfChanged(generatedPath(outDir, name), bytes, cwd);
  }
  if (cache) {
    const directory = join(cwd, '.gm/cache/assets', identity.key);
    for (const [name, bytes] of Object.entries(buffers)) {
      await writeIfChanged(generatedPath(join(directory, 'files'), name), bytes, cwd);
    }
    await writeIfChanged(join(directory, 'result.json'), `${JSON.stringify(metadata, null, 2)}\n`, cwd);
  }
  return metadata;
}
