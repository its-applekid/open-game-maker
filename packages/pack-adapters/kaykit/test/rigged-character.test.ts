import { createGltf } from '@gm/sdk/three';
import type { Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { conventions } from '../src/conventions.js';
import { createRiggedCharacter, type RiggedCharacter } from '../src/rigged-character.js';
import { fixtureLoader } from './fixtures/manifest.js';
import { makeRig, toGlb } from './fixtures/make-rig.js';

const SHARED = conventions.rigs.value.shared;
const rigMeta = (rig_id = SHARED) => ({ rig: { rig_type: 'humanoid', rig_id, joint_count: 3 } });
const CLIPS = [
  { name: 'Idle_A', duration: 2, angle: 0.8 },
  { name: 'Hit_A', duration: 1, angle: -0.6 },
  { name: 'Walking_A', duration: 2, angle: -0.8 },
];

/** Spine angle about Z, read off the posed character. */
function spine(character: RiggedCharacter): number {
  const bone = character.root.getObjectByName('spine') as Object3D;
  return 2 * Math.atan2(bone.quaternion.z, bone.quaternion.w);
}

async function setup(
  options: { characterJoints?: string[]; libraryBody?: string; rigId?: string; crossFade?: number } = {},
) {
  const files = {
    'hero.glb': await toGlb(makeRig({ joints: options.characterJoints })),
    'lib.glb': await toGlb(makeRig({ body: options.libraryBody, clips: CLIPS })),
  };
  const { loader, fetch } = await fixtureLoader(
    { hero: { file: 'hero.glb', meta: rigMeta(options.rigId) }, lib: { file: 'lib.glb' } },
    files,
  );
  const gltf = createGltf();
  const make = () =>
    createRiggedCharacter(loader, gltf, 'hero', {
      clipLibraryIds: ['lib'],
      crossFade: options.crossFade ?? 0.2,
    });
  return { make, fetch };
}

afterEach(() => vi.unstubAllGlobals());

describe('createRiggedCharacter', () => {
  it('plays a library clip on a character whose joints share its names', async () => {
    const character = await (await setup()).make();
    expect(character.clips).toEqual(['Idle_A', 'Hit_A', 'Walking_A']);

    character.sync({ pos: [1, 0, 2], yaw: Math.PI / 2, action: 'idle', t: 1 });
    expect(spine(character)).toBeCloseTo(0.4);
    expect(character.root.position.toArray()).toEqual([1, 0, 2]);
    expect(character.root.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('repeats loop clips and holds the last pose of one-shots', async () => {
    const character = await (await setup()).make();
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'Idle_A', t: 3 });
    expect(spine(character)).toBeCloseTo(0.4);

    const held = await (await setup()).make();
    held.sync({ pos: [0, 0, 0], yaw: 0, action: 'hit', t: 5 });
    expect(spine(held)).toBeCloseTo(-0.6);
  });

  it('cross-fades from the last action over the given seconds', async () => {
    const character = await (await setup()).make();
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'idle', t: 1 });
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'hit', t: 0 });
    expect(spine(character)).toBeCloseTo(0.4);
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'hit', t: 0.1 });
    // half idle (still running: 1.1 s → 0.44) and half hit (0.1 s → -0.06)
    expect(spine(character)).toBeCloseTo((0.44 - 0.06) / 2, 2);
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'hit', t: 0.5 });
    expect(spine(character)).toBeCloseTo(-0.3);
  });

  it('cuts straight to the new action when the cross-fade is 0', async () => {
    const character = await (await setup({ crossFade: 0 })).make();
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'idle', t: 1 });
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'hit', t: 0.5 });
    expect(spine(character)).toBeCloseTo(-0.3);
  });

  it('keeps fading out the clip that showed more when a fade is interrupted', async () => {
    const character = await (await setup()).make();
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'idle', t: 1 });
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'hit', t: 0.05 });
    // idle still weighs 0.75 here, so the walk fades in over idle (1.05 s → 0.42), not over the barely-shown hit
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'walk', t: 0 });
    expect(spine(character)).toBeCloseTo(0.42);
  });

  it('refuses a library whose clips drive a joint the character lacks, naming it', async () => {
    const { make } = await setup({ characterJoints: ['root', 'hips', 'chest'] });
    await expect(make()).rejects.toThrow(/clip Idle_A drives joint spine/);
  });

  it('refuses a character on a rig no library targets', async () => {
    const { make } = await setup({ rigId: 'rig:a83c5e75e523' });
    await expect(make()).rejects.toThrow(`hero is on rig:a83c5e75e523; KayKit clip libraries target ${SHARED}`);
  });

  it('refuses a library made for the other body', async () => {
    const { make } = await setup({ libraryBody: 'Rig_Large' });
    await expect(make()).rejects.toThrow('Clip library lib is for Rig_Large; hero is Rig_Medium');
  });

  it('refuses a role the set has no clip for', async () => {
    const character = await (await setup()).make();
    expect(() => character.sync({ pos: [0, 0, 0], yaw: 0, action: 'attack.run', t: 0 })).toThrow(
      /no clip for attack.run/,
    );
  });

  it('loads each file once and poses each character on its own', async () => {
    const { make, fetch } = await setup();
    const [a, b] = await Promise.all([make(), make()]);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('lib.glb'))).toHaveLength(1);

    a.sync({ pos: [0, 0, 0], yaw: 0, action: 'hit', t: 5 });
    b.sync({ pos: [0, 0, 0], yaw: 0, action: 'idle', t: 0 });
    expect(spine(a)).toBeCloseTo(-0.6);
    expect(spine(b)).toBeCloseTo(0);
  });

  it('has no contact frame until a still verifies one', async () => {
    const character = await (await setup()).make();
    expect(character.contactFrame('hit')).toBeUndefined();
  });
});
