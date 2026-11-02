import { dedup, meshopt, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

import { gltfIo, readyMeshopt, sceneBounds, setAssetLicense, textureMeasurements, triangles } from './gltf.js';
import { outputName } from './files.js';
import { licenseFor, manifestAsset, type BuildJob, type BuiltFileInfo, type FreshJobResult } from './types.js';
import type { Tier } from '@ogm/contracts';

const RECIPES: Record<Tier, { ratio: number; error: number; texture: number }> = {
  desktop: { ratio: 1, error: 0.0001, texture: 2_048 },
  mobile: { ratio: 0.5, error: 0.001, texture: 1_024 },
  low: { ratio: 0.25, error: 0.01, texture: 512 },
};

export async function buildModel(job: BuildJob): Promise<FreshJobResult> {
  await readyMeshopt();
  const item = job.items[0]!;
  const io = gltfIo();
  const files: Record<string, BuiltFileInfo> = {};
  const buffers: Record<string, Buffer> = {};
  const assetFiles: Partial<Record<Tier, string>> = {};
  let bounds: [number, number, number] | undefined;

  for (const tier of job.tiers) {
    const document = await io.read(item.source);
    const scene = document.getRoot().listScenes()[0];
    if (!scene) throw new Error(`${item.entry.id}: glTF has no scene`);
    bounds ??= sceneBounds(scene);
    const meshes = document.getRoot().listMeshes();
    if (meshes.length === 1) meshes[0]!.setName(item.entry.id);
    setAssetLicense(document, licenseFor(item.entry));
    await document.transform(dedup(), prune(), weld());
    const recipe = RECIPES[tier];
    if (recipe.ratio < 1) {
      await document.transform(
        simplify({ simplifier: MeshoptSimplifier, ratio: recipe.ratio, error: recipe.error, lockBorder: true }),
      );
    }
    if (document.getRoot().listTextures().length > 0) {
      await document.transform(
        textureCompress({
          encoder: sharp,
          targetFormat: 'webp',
          resize: [recipe.texture, recipe.texture],
          quality: 85,
        }),
      );
    }
    await document.transform(resample(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    const measurement = await textureMeasurements(document);
    const bytes = Buffer.from(await io.writeBinary(document));
    const name = outputName(bytes, 'glb');
    files[name] = {
      bytes: bytes.length,
      tris: triangles(document),
      gpuTexMB: measurement.gpuTexMB,
      maxTexture: measurement.maxTexture,
      decoders: ['meshopt'],
    };
    buffers[name] = bytes;
    assetFiles[tier] = name;
  }

  return {
    files,
    assets: {
      [item.entry.id]: manifestAsset(item, assetFiles, { mesh: item.entry.id, ...(bounds ? { bounds } : {}) }),
    },
    buffers,
  };
}
