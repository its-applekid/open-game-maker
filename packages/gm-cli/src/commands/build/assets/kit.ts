import { Document, type Scene } from '@gltf-transform/core';
import {
  dedup,
  center,
  flatten,
  join,
  mergeDocuments,
  meshopt,
  prune,
  textureCompress,
  unpartition,
  unweld,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

import { gltfIo, readyMeshopt, sceneBounds, setAssetLicense, textureMeasurements, triangles } from './gltf.js';
import { outputName } from './files.js';
import { licenseFor, manifestAsset, type BuildJob, type FreshJobResult } from './types.js';

async function snapUvsToTexels(document: Document): Promise<void> {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const uv = primitive.getAttribute('TEXCOORD_0');
      const image = primitive.getMaterial()?.getBaseColorTexture()?.getImage();
      const array = uv?.getArray();
      if (!uv || !array || !image || primitive.getMode() !== 4) continue;
      const metadata = await sharp(image).metadata();
      if (!metadata.width || !metadata.height) continue;
      const snapped = new Float32Array(array.length);
      for (let offset = 0; offset < array.length; offset += 6) {
        const u = (Number(array[offset]) + Number(array[offset + 2]) + Number(array[offset + 4])) / 3;
        const v = (Number(array[offset + 1]) + Number(array[offset + 3]) + Number(array[offset + 5])) / 3;
        const x = Math.min(metadata.width - 1, Math.max(0, Math.floor(u * metadata.width)));
        const y = Math.min(metadata.height - 1, Math.max(0, Math.floor(v * metadata.height)));
        for (let vertex = 0; vertex < 3; vertex += 1) {
          snapped[offset + vertex * 2] = (x + 0.5) / metadata.width;
          snapped[offset + vertex * 2 + 1] = (y + 0.5) / metadata.height;
        }
      }
      uv.setArray(snapped);
    }
  }
}

export async function buildKit(job: BuildJob): Promise<FreshJobResult> {
  await readyMeshopt();
  const io = gltfIo();
  const target = new Document();
  const targetScene = target.createScene('Scene');
  const boundsById = new Map<string, [number, number, number]>();

  for (const item of job.items) {
    const source = await io.read(item.source);
    await source.transform(dedup(), prune(), weld(), flatten(), join(), center({ pivot: 'below' }), flatten());
    for (const mesh of source.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        for (const semantic of primitive.listSemantics()) {
          if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(semantic)) primitive.setAttribute(semantic, null);
        }
      }
    }
    await source.transform(unweld());
    await snapUvsToTexels(source);
    await source.transform(weld(), prune());
    const sourceScene = source.getRoot().listScenes()[0];
    if (!sourceScene) throw new Error(`${item.entry.id}: glTF has no scene`);
    const bounds = sceneBounds(sourceScene);
    const sourceMeshes = [...source.getRoot().listMeshes()];
    const combined = source.createMesh(item.entry.id).setExtras({ bounds });
    for (const mesh of sourceMeshes) {
      for (const primitive of mesh.listPrimitives()) combined.addPrimitive(primitive.clone());
    }
    for (const scene of source.getRoot().listScenes()) scene.dispose();
    const packedScene = source.createScene('Scene').addChild(source.createNode(item.entry.id).setMesh(combined));
    await source.transform(prune());

    const mapped = mergeDocuments(target, source);
    const mappedScene = mapped.get(packedScene) as Scene | undefined;
    if (!mappedScene) throw new Error(`${item.entry.id}: could not merge scene`);
    for (const child of mappedScene.listChildren()) {
      mappedScene.removeChild(child);
      targetScene.addChild(child);
    }
    mappedScene.dispose();
    boundsById.set(item.entry.id, bounds);
  }

  setAssetLicense(
    target,
    job.items.map((item) => licenseFor(item.entry)),
  );
  await target.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', lossless: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
    unpartition(),
  );
  const measurement = await textureMeasurements(target);
  const bytes = Buffer.from(await io.writeBinary(target));
  const name = outputName(job.slug, '*', bytes, 'glb');
  return {
    files: {
      [name]: {
        bytes: bytes.length,
        tris: triangles(target),
        gpuTexMB: measurement.gpuTexMB,
        maxTexture: measurement.maxTexture,
        decoders: ['meshopt'],
      },
    },
    assets: Object.fromEntries(
      job.items.map((item) => [
        item.entry.id,
        manifestAsset(item, { '*': name }, { mesh: item.entry.id, bounds: boundsById.get(item.entry.id) }),
      ]),
    ),
    buffers: { [name]: bytes },
  };
}
