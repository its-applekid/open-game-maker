import { extname } from 'node:path';

import sharp from 'sharp';

import { outputName } from './files.js';
import { resolveSheetSources, rewriteSpriteSheets, type SheetSource } from './sheets.js';
import { manifestAsset, type BuildItem, type BuildJob, type BuiltFileInfo, type FreshJobResult } from './types.js';

/** Formats sharp reads and this build re-encodes; a companion in another format keeps the path the card wrote. */
const ENCODABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

async function encodeWebp(
  file: SheetSource,
  item: BuildItem,
  job: BuildJob,
): Promise<{ name: string; info: BuiltFileInfo; bytes: Buffer }> {
  const source = sharp(file.absolute, { limitInputPixels: 268_402_689 });
  const input = await source.metadata();
  if (!input.width || !input.height) throw new Error(`${item.entry.id}: image dimensions are unavailable`);
  let pipeline = source.clone();
  // Scaling a pixel-art image destroys its pixel grid, so it keeps its size like a sprite sheet does.
  if (!job.pixelArt && item.meta?.sprite === undefined && Math.max(input.width, input.height) > 2_048) {
    pipeline = pipeline.resize(2_048, 2_048, { fit: 'inside', withoutEnlargement: true });
  }
  const bytes = await pipeline.webp(job.pixelArt ? { lossless: true } : { quality: 85 }).toBuffer();
  const output = await sharp(bytes).metadata();
  const width = output.width ?? input.width;
  const height = output.height ?? input.height;
  return {
    name: outputName(bytes, 'webp'),
    info: {
      bytes: bytes.length,
      gpuTexMB: (width * height * 4 * 1.33) / (1024 * 1024),
      maxTexture: Math.max(width, height),
      decoders: [],
    },
    bytes,
  };
}

/**
 * Builds an image and every sprite sheet its card points at. A multi-sheet character keeps all its action sheets
 * (`meta.sprite.animations[].sheets[].path`) as first-class outputs; the manifest's sheet paths are rewritten to the
 * generated names so a game resolves each one beside the asset's file, in a dev server and in a built game.
 */
export async function buildImage(job: BuildJob): Promise<FreshJobResult> {
  const item = job.items[0]!;
  const sources: SheetSource[] =
    item.files === undefined || item.files.length === 0
      ? [{ path: item.entry.path, absolute: item.source }]
      : item.files;
  const sheets = resolveSheetSources(item.meta, sources);
  const targets = [sources[0]!, ...new Set([...sheets.values()].filter((file) => file !== sources[0]))];

  const files: Record<string, BuiltFileInfo> = {};
  const buffers: Record<string, Buffer> = {};
  const generatedBySource = new Map<SheetSource, string>();
  for (const target of targets) {
    if (!ENCODABLE.has(extname(target.path).toLowerCase())) continue;
    const { name, info, bytes } = await encodeWebp(target, item, job);
    files[name] = info;
    buffers[name] = bytes;
    generatedBySource.set(target, name);
  }
  const primary = generatedBySource.get(sources[0]!);
  if (primary === undefined) throw new Error(`${item.entry.id}: no encodable primary file`);

  const generated = new Map<string, string>();
  for (const [sheetPath, file] of sheets) {
    const name = generatedBySource.get(file);
    if (name !== undefined) generated.set(sheetPath, name);
  }
  const companions = [...new Set([...generated.values()].filter((name) => name !== primary))];
  return {
    files,
    assets: {
      [item.entry.id]: manifestAsset({ ...item, meta: rewriteSpriteSheets(item.meta, generated) }, { '*': primary }),
    },
    buffers,
    ...(companions.length === 0 ? {} : { companions: { [item.entry.id]: companions } }),
  };
}
