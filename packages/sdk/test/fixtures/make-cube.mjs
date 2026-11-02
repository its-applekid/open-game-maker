import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { TextEncoder } from 'node:util';

import { MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;

const positions = new Float32Array([
  -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
]);
const indices = new Uint16Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);

const positionBytes = new Uint8Array(positions.buffer);
const indexBytes = new Uint8Array(indices.buffer);
const compressedPositions = MeshoptEncoder.encodeGltfBuffer(positionBytes, positions.length / 3, 12, 'ATTRIBUTES');
const compressedIndices = MeshoptEncoder.encodeGltfBuffer(indexBytes, indices.length, 2, 'TRIANGLES');
const indexOffset = (compressedPositions.byteLength + 3) & ~3;
const binaryLength = (indexOffset + compressedIndices.byteLength + 3) & ~3;
const binary = new Uint8Array(binaryLength);
binary.set(compressedPositions);
binary.set(compressedIndices, indexOffset);

const gltf = {
  asset: { version: '2.0', generator: 'Open Game Maker 2000 test fixture' },
  extensionsUsed: ['EXT_meshopt_compression'],
  extensionsRequired: ['EXT_meshopt_compression'],
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] },
    { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
  bufferViews: [
    {
      buffer: 0,
      byteLength: positionBytes.byteLength,
      byteStride: 12,
      target: 34962,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset: 0,
          byteLength: compressedPositions.byteLength,
          byteStride: 12,
          count: 8,
          mode: 'ATTRIBUTES',
          filter: 'NONE',
        },
      },
    },
    {
      buffer: 0,
      byteLength: indexBytes.byteLength,
      target: 34963,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset: indexOffset,
          byteLength: compressedIndices.byteLength,
          byteStride: 2,
          count: 36,
          mode: 'TRIANGLES',
          filter: 'NONE',
        },
      },
    },
  ],
  buffers: [{ byteLength: binary.byteLength }],
};

const json = new TextEncoder().encode(JSON.stringify(gltf));
const paddedJsonLength = (json.byteLength + 3) & ~3;
const totalLength = 12 + 8 + paddedJsonLength + 8 + binary.byteLength;
const glb = new Uint8Array(totalLength);
const view = new DataView(glb.buffer);
view.setUint32(0, 0x46546c67, true);
view.setUint32(4, 2, true);
view.setUint32(8, totalLength, true);
view.setUint32(12, paddedJsonLength, true);
view.setUint32(16, 0x4e4f534a, true);
glb.fill(0x20, 20, 20 + paddedJsonLength);
glb.set(json, 20);
const binaryHeader = 20 + paddedJsonLength;
view.setUint32(binaryHeader, binary.byteLength, true);
view.setUint32(binaryHeader + 4, 0x004e4942, true);
glb.set(binary, binaryHeader + 8);

await writeFile(new URL('./cube.meshopt.glb', import.meta.url), glb);
