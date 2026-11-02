import sharp from 'sharp';

import { outputName } from './files.js';
import { manifestAsset, type BuildJob, type FreshJobResult } from './types.js';

export async function buildImage(job: BuildJob): Promise<FreshJobResult> {
  const item = job.items[0]!;
  const source = sharp(item.source, { limitInputPixels: 268_402_689 });
  const input = await source.metadata();
  if (!input.width || !input.height) throw new Error(`${item.entry.id}: image dimensions are unavailable`);
  let pipeline = source.clone();
  if (item.meta?.sprite === undefined && Math.max(input.width, input.height) > 2_048) {
    pipeline = pipeline.resize(2_048, 2_048, { fit: 'inside', withoutEnlargement: true });
  }
  const bytes = await pipeline.webp(job.pixelArt ? { lossless: true } : { quality: 85 }).toBuffer();
  const output = await sharp(bytes).metadata();
  const width = output.width ?? input.width;
  const height = output.height ?? input.height;
  const name = outputName(job.slug, '*', bytes, 'webp');
  return {
    files: {
      [name]: {
        bytes: bytes.length,
        gpuTexMB: (width * height * 4 * 1.33) / (1024 * 1024),
        maxTexture: Math.max(width, height),
        decoders: [],
      },
    },
    assets: { [item.entry.id]: manifestAsset(item, { '*': name }) },
    buffers: { [name]: bytes },
  };
}
