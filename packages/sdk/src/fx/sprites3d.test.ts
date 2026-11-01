import { Color, InstancedMesh, Matrix4, PerspectiveCamera, Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';

import { SeededRng } from '../core/rng.js';
import { FX_KINDS, Fx3d, type FxKind, type ParticleInput } from './sprites3d.js';

const particle: ParticleInput = {
  born: 1,
  life: 1,
  p: [1, 2, 3],
  v: [2, 1, -1],
  size: 2,
  grow: 0.5,
  rot: 0.25,
  color: '#ffffff',
  alpha: 1,
};

function fixture(seed = 7) {
  const texture = new Texture();
  const textures = Object.fromEntries(FX_KINDS.map((kind) => [kind, [texture]])) as Record<FxKind, Texture[]>;
  const scene = new Scene();
  const fx = new Fx3d(
    scene,
    new PerspectiveCamera(),
    textures,
    {
      night: { value: 0 },
      fogC: { value: new Color('#000000') },
      fogN: { value: 10 },
      fogF: { value: 100 },
    },
    new SeededRng(seed),
  );
  return { fx, scene };
}

function firstMatrix(scene: Scene): number[] {
  const mesh = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);
  if (!mesh) throw new Error('fixture did not build an instanced mesh');
  const matrix = new Matrix4();
  mesh.getMatrixAt(0, matrix);
  return matrix.toArray();
}

describe('Fx3d', () => {
  it('draws live particles and zeroes particles outside their lifetime', () => {
    const { fx, scene } = fixture();
    fx.add('flash', particle);
    fx.build();

    fx.update(1.1);
    expect(firstMatrix(scene)).not.toEqual(new Matrix4().makeScale(0, 0, 0).toArray());

    fx.update(2.1);
    expect(firstMatrix(scene)).toEqual(new Matrix4().makeScale(0, 0, 0).toArray());
  });

  it('computes a frame from scene time rather than the previous update', () => {
    const first = fixture();
    const fresh = fixture();
    first.fx.add('puff', particle);
    fresh.fx.add('puff', particle);
    first.fx.build();
    fresh.fx.build();

    first.fx.update(9);
    first.fx.update(1.5);
    fresh.fx.update(1.5);

    expect(firstMatrix(first.scene)).toEqual(firstMatrix(fresh.scene));
  });

  it('replays generated particles after reseeding', () => {
    const first = fixture(1).fx;
    const second = fixture(99).fx;
    first.reseed(17);
    second.reseed(17);

    first.dust(0, [0, 0, 0]);
    second.dust(0, [0, 0, 0]);

    const withoutTexture = (value: (typeof first.parts)[number]) => {
      const { texture, ...rest } = value;
      void texture;
      return rest;
    };
    expect(first.parts.map(withoutTexture)).toEqual(second.parts.map(withoutTexture));
  });

  it('hides particles whose event tag is dead', () => {
    const { fx, scene } = fixture();
    fx.tag = 'cancelled-event';
    fx.dead = (tag) => tag === 'cancelled-event';
    fx.add('ring', particle);
    fx.build();
    fx.update(1.5);

    expect(firstMatrix(scene)).toEqual(new Matrix4().makeScale(0, 0, 0).toArray());
  });
});
