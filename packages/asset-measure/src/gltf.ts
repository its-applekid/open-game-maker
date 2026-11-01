import { createHash } from 'node:crypto';

import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import type { Clip, Geometry, Rig } from '@ogm/contracts';

import { measureClips } from './clips.js';
import { measureRig } from './rig.js';

export type GltfMeasurement = { geometry: Geometry; rig?: Rig; clips: Clip[] };

export async function measureGltf(file: string): Promise<GltfMeasurement> {
  const document = await new NodeIO().read(file);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  if (!scene) throw new Error(`${file}: glTF has no scene`);
  const bounds = getBounds(scene);
  let triangles = 0;
  let vertices = 0;
  const materials = new Set<string>();

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      const count = primitive.getIndices()?.getCount() ?? positions?.getCount() ?? 0;
      triangles += Math.floor(count / 3);
      vertices += positions?.getCount() ?? 0;
      const material = primitive.getMaterial()?.getName();
      if (material) materials.add(material);
    }
  }

  const textureKeys = root.listTextures().flatMap((texture) => {
    const image = texture.getImage();
    return image ? [`sha256:${createHash('sha256').update(image).digest('hex')}`] : [];
  });
  const centered = Math.abs((bounds.min[0] + bounds.max[0]) / 2) < 1e-4 && Math.abs((bounds.min[2] + bounds.max[2]) / 2) < 1e-4;
  const atBase = Math.abs(bounds.min[1]) < 1e-4;
  const geometry: Geometry = {
    bounds_m: { min: [...bounds.min], max: [...bounds.max] },
    pivot: atBase && centered ? 'base-center' : 'center',
    triangles,
    vertices,
    ...(materials.size > 0 ? { materials: [...materials].sort() } : {}),
    ...(textureKeys.length > 0 ? { texture_keys: textureKeys.sort() } : {}),
    normalized: false,
  };
  const clips = measureClips(root.listAnimations());
  const skin = root.listSkins()[0];
  const rig = skin ? { ...measureRig(skin), ...(clips.length > 0 ? { clips } : {}) } : undefined;
  return { geometry, ...(rig ? { rig } : {}), clips };
}
