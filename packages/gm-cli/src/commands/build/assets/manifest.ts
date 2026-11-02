import { join } from 'node:path';

import { ASSETS_SCHEMA_MINOR, assetManifestSchema, type AssetManifest, type Tier } from '@ogm/contracts';

import { stableJson, writeIfChanged } from './files.js';
import type { BuiltFileInfo, JobResult, ManifestAssetEntry } from './types.js';

export function assembleManifest(
  tiers: Tier[],
  results: JobResult[],
  expectedIds: string[],
): { manifest: AssetManifest; details: Record<string, BuiltFileInfo> } {
  const details: Record<string, BuiltFileInfo> = {};
  const assets: Record<string, ManifestAssetEntry> = {};
  for (const result of results) {
    for (const [name, file] of Object.entries(result.files)) {
      if (details[name] && stableJson(details[name]) !== stableJson(file)) {
        throw new Error(`generated file name collision: ${name}`);
      }
      details[name] = file;
    }
    for (const [id, asset] of Object.entries(result.assets)) {
      if (assets[id]) throw new Error(`asset built more than once: ${id}`);
      assets[id] = asset;
    }
  }
  for (const id of expectedIds) {
    const asset = assets[id];
    if (!asset) throw new Error(`asset was not built: ${id}`);
    for (const tier of tiers) {
      const name = asset.file[tier] ?? asset.file['*'];
      if (!name) throw new Error(`asset ${id} has no file for ${tier}`);
      if (!details[name]) throw new Error(`asset ${id} references missing generated file ${name}`);
    }
  }
  const files = Object.fromEntries(
    Object.entries(details)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, file]) => [
        name,
        {
          bytes: file.bytes,
          ...(file.tris === undefined ? {} : { tris: file.tris }),
          ...(file.gpuTexMB === undefined ? {} : { gpuTexMB: file.gpuTexMB }),
          decoders: file.decoders,
        },
      ]),
  );
  const manifest = assetManifestSchema.parse({
    version: 1,
    minor: ASSETS_SCHEMA_MINOR,
    tiers,
    files,
    assets: Object.fromEntries(Object.entries(assets).sort(([left], [right]) => left.localeCompare(right))),
  });
  return { manifest, details };
}

export async function writeManifest(cwd: string, outDir: string, manifest: AssetManifest): Promise<void> {
  await writeIfChanged(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, cwd);
}
