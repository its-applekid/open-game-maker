import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** A minimal, deterministic GLB box: one mesh, one material, no textures. */
export function boxGlb({ size = 1, colour = [0.8, 0.3, 0.2, 1] } = {}) {
  const half = size / 2;
  const faces = [
    {
      normal: [0, 0, 1],
      corners: [
        [-half, -half, half],
        [half, -half, half],
        [half, half, half],
        [-half, half, half],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [half, -half, -half],
        [-half, -half, -half],
        [-half, half, -half],
        [half, half, -half],
      ],
    },
    {
      normal: [1, 0, 0],
      corners: [
        [half, -half, half],
        [half, -half, -half],
        [half, half, -half],
        [half, half, half],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [-half, -half, -half],
        [-half, -half, half],
        [-half, half, half],
        [-half, half, -half],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [-half, half, half],
        [half, half, half],
        [half, half, -half],
        [-half, half, -half],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [-half, -half, -half],
        [half, -half, -half],
        [half, -half, half],
        [-half, -half, half],
      ],
    },
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const [face, { normal, corners }] of faces.entries()) {
    const base = face * 4;
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const normalBytes = Buffer.from(new Float32Array(normals).buffer);
  const indexBytes = Buffer.from(new Uint16Array(indices).buffer);
  const paddedIndexBytes = Buffer.concat([indexBytes, Buffer.alloc((4 - (indexBytes.length % 4)) % 4)]);
  const binary = Buffer.concat([positionBytes, normalBytes, paddedIndexBytes]);

  const document = {
    asset: { version: '2.0', generator: 'ogm-test-fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: colour, metallicFactor: 0, roughnessFactor: 0.9 } }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-half, -half, -half],
        max: [half, half, half],
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length, byteLength: normalBytes.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionBytes.length + normalBytes.length,
        byteLength: indexBytes.length,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: binary.length }],
  };

  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.write('BIN\0', 4, 'ascii');
  return Buffer.concat([header, jsonHeader, paddedJson, binHeader, binary]);
}

export async function writeBox(file, options) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, boxGlb(options));
}

export async function json(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * A two-pack 3D library: each pack ships three box models, a public collection card, and the
 * canonical glTF the pipeline resolves. Returns the root and the cards it wrote.
 */
export async function buildSceneFixture(root) {
  const packs = ['fixture-pack-a', 'fixture-pack-b'];
  const cards = [];
  for (const [packIndex, pack] of packs.entries()) {
    const extracted = join(root, 'packs', pack, 'v1', 'extracted');
    await json(join(root, 'packs', pack, 'pack.json'), { id: pack, current: 'v1', title: pack });
    await json(join(root, 'packs', pack, 'collection.card.json'), {
      schema: 'ogm.asset-card/1.0',
      id: `t1:${pack}@1.0`,
      card_type: 'collection',
      rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', basis: [] },
    });
    const models = [
      { key: 'characters/hero', subkind: 'character', colour: [0.2, 0.4, 0.9, 1] },
      { key: 'props/crate', subkind: 'prop', colour: [0.7, 0.5, 0.2, 1] },
      { key: 'nature/tree', subkind: 'nature', colour: [0.2, 0.7, 0.3, 1] },
    ];
    for (const [modelIndex, model] of models.entries()) {
      const file = `${model.key}.glb`;
      await writeBox(join(extracted, file), { size: 1 + modelIndex * 0.2, colour: model.colour });
      const card = {
        schema: 'ogm.asset-card/1.0',
        id: `t1:${pack}/${model.key}@1.0`,
        card_type: 'asset',
        kind: 'model',
        subkind: model.subkind,
        collection: `t1:${pack}@1.0`,
        describe: { set: 'fixture-set', style_family: 'chunky-low-poly' },
        source: { files: [{ path: file, role: 'primary', format: 'glb' }] },
        ...(model.subkind === 'character'
          ? { rig: { rig_type: 'humanoid', rig_id: 'rig:fixture', joint_count: 0, bones: [], clips: [] } }
          : {}),
      };
      await json(join(root, 'packs', pack, 'cards', `${model.key}.card.json`), card);
      cards.push(card);
    }
    void packIndex;
  }
  return { root, cards };
}
