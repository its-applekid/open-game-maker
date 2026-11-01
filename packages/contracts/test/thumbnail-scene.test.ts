import { describe, expect, it } from 'vitest';

import { thumbnailSceneSchema } from '../src/thumbnail-scene.js';
import { loadJson } from './helpers.js';
import { emittedValidator } from './json-schema.js';

type Scene = {
  layers: Array<{
    id: string;
    kind: string;
    role?: string;
    card_id: string;
    position: { grid: [number, number, number]; offset_px: [number, number]; scale: number };
  }>;
};

const fixture = (): Scene => loadJson<Scene>('fixtures/thumbnail-scene.v1.json');

describe('thumbnail scene contract', () => {
  it('accepts the golden scene through Zod and emitted JSON Schema', () => {
    const scene = fixture();

    expect(thumbnailSceneSchema.safeParse(scene).success).toBe(true);
    expect(emittedValidator('thumbnail-scene.v1')(scene)).toBe(true);
  });

  it.each(['https://example.com/sprite.png', '/tmp/sprite.png', 't1:pack/../../sprite@1.0']) (
    'rejects a non-card source reference: %s',
    (cardId) => {
      const scene = fixture();
      scene.layers[0]!.card_id = cardId;

      expect(thumbnailSceneSchema.safeParse(scene).success).toBe(false);
    },
  );

  it('requires unique layer ids', () => {
    const scene = fixture();
    scene.layers[1]!.id = scene.layers[0]!.id;

    expect(thumbnailSceneSchema.safeParse(scene).error?.issues[0]?.message).toContain('layer id');
  });

  it.each([
    ['one ground layer', (scene: Scene) => scene.layers.splice(0, 1)],
    ['three to six props', (scene: Scene) => scene.layers.splice(1, 1)],
    ['two to three characters', (scene: Scene) => scene.layers.splice(-1, 1)],
    ['one hero', (scene: Scene) => delete scene.layers.find((layer) => layer.role === 'hero')!.role],
    ['an enemy', (scene: Scene) => delete scene.layers.find((layer) => layer.role === 'enemy')!.role],
  ])('requires %s', (_description, mutate) => {
    const scene = fixture();
    mutate(scene);

    expect(thumbnailSceneSchema.safeParse(scene).success).toBe(false);
  });

  it('requires the hero anchor to project to the canvas centre', () => {
    const scene = fixture();
    scene.layers.find((layer) => layer.role === 'hero')!.position.grid = [3, 3, 0];

    expect(thumbnailSceneSchema.safeParse(scene).error?.issues[0]?.message).toContain('canvas centre');
  });
});
