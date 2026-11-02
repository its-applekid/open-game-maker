import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Mesh, WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';

import { createGltf } from './gltf.js';

describe('createGltf meshopt integration', () => {
  it('decodes the checked-in meshopt-compressed cube', async () => {
    const fixture = await readFile(resolve('src/test/fixtures/cube.meshopt.glb'));
    const bytes = Uint8Array.from(fixture).buffer;

    const gltf = await createGltf({} as WebGLRenderer).decode(bytes, 'cube.meshopt.glb');
    const mesh = gltf.scene.children[0] as Mesh;

    expect(mesh.isMesh).toBe(true);
    expect(mesh.geometry.index?.count).toBe(36);
  });
});
