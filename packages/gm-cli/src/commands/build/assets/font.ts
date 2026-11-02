import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { outputName } from './files.js';
import { manifestAsset, type BuildJob, type FreshJobResult } from './types.js';

export async function buildFont(job: BuildJob): Promise<FreshJobResult> {
  const item = job.items[0]!;
  const bytes = await readFile(item.source);
  const extension = extname(item.entry.path).slice(1).toLowerCase();
  const name = outputName(job.slug, '*', bytes, extension);
  return {
    files: { [name]: { bytes: bytes.length, decoders: [] } },
    assets: { [item.entry.id]: manifestAsset(item, { '*': name }) },
    buffers: { [name]: bytes },
  };
}
