import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Document, NodeIO } from '@gltf-transform/core';
import { afterEach, describe, expect, it } from 'vitest';

import { measureGltf } from '../src/index.js';

const temporary: string[] = [];

async function fixture(name: string, rigged: boolean, mode = 4): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'asset-measure-gltf-'));
  temporary.push(dir);
  const file = join(dir, `${name}.glb`);
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor('positions')
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const indices = document.createAccessor('indices').setType('SCALAR').setArray(new Uint16Array([0, 1, 2])).setBuffer(buffer);
  const primitive = document.createPrimitive().setMode(mode).setAttribute('POSITION', positions).setIndices(indices);
  const meshNode = document.createNode('Wall').setMesh(document.createMesh('Wall').addPrimitive(primitive));
  const scene = document.createScene('Scene').addChild(meshNode);

  if (rigged) {
    const hips = document.createNode('Hips');
    const spine = document.createNode('Spine');
    const head = document.createNode('Head');
    hips.addChild(spine);
    spine.addChild(head);
    document.createNode(`${name}-wrapper`).addChild(hips);
    scene.addChild(hips.getParentNode()!);
    meshNode.setSkin(document.createSkin('Rig').addJoint(hips).addJoint(spine).addJoint(head));

    const times = document
      .createAccessor('times')
      .setType('SCALAR')
      .setArray(new Float32Array([0, 1]))
      .setBuffer(buffer);
    const values = document
      .createAccessor('values')
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 0, 0, 0]))
      .setBuffer(buffer);
    const sampler = document.createAnimationSampler().setInput(times).setOutput(values).setInterpolation('LINEAR');
    const channel = document.createAnimationChannel().setSampler(sampler).setTargetNode(hips).setTargetPath('translation');
    document.createAnimation('Death').addSampler(sampler).addChannel(channel);
  }

  await new NodeIO().write(file, document);
  return file;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('measureGltf', () => {
  it('measures geometry, stable humanoid rigs, and canonical clips', async () => {
    const orc = await measureGltf(await fixture('orc', true));
    const human = await measureGltf(await fixture('human', true));

    expect(orc.geometry.triangles).toBe(1);
    expect(orc.geometry.bounds_m.max).toEqual([1, 1, 0]);
    expect(orc.rig?.rig_id).toBe(human.rig?.rig_id);
    expect(orc.rig?.rig_type).toBe('humanoid');
    expect(orc.clips).toContainEqual(expect.objectContaining({ name: 'Death', canonical: 'die', duration_s: 1 }));
  });

  it('omits rig data for a static model', async () => {
    const measured = await measureGltf(await fixture('wall', false));
    expect(measured.rig).toBeUndefined();
    expect(measured.geometry.normalized).toBe(false);
  });

  it('does not count line primitives as triangles', async () => {
    const measured = await measureGltf(await fixture('lines', false, 1));
    expect(measured.geometry.triangles).toBe(0);
  });
});
