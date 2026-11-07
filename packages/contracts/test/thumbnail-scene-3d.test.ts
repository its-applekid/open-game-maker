import { describe, expect, it } from 'vitest';

import { thumbnailScene3dSchema } from '../src/thumbnail-scene-3d.js';

const card = (pack: string, key: string) => `t1:${pack}/${key}@1.0`;

const item = (index: number, extra: Record<string, unknown> = {}) => ({
  id: `item-${index}`,
  kind: 'prop',
  card_id: card('kenney-mini-dungeon', `props/prop-${index}`),
  position: [index, 0, 0],
  rotation_y: 0,
  scale: 1,
  ...extra,
});

const scene = (overrides: Record<string, unknown> = {}) => ({
  schema: 'ogm.thumbnail-scene-3d/1.0',
  set_id: 'kaykit',
  target: { kind: 'pack', id: 'kenney-mini-dungeon' },
  canvas: { width: 1024, height: 1024, background: '#e9e1cc' },
  camera: {
    projection: 'perspective',
    fov_deg: 35,
    position: [6, 4, 6],
    target: [0, 1, 0],
    orbit_deg: 360,
  },
  lighting: { mode: 'scene', intensity: 1 },
  duration_ms: 4000,
  fps: 24,
  ground: { size_m: [12, 12], position: [0, 0, 0], colour: '#c8c3b8' },
  items: [item(0), item(1), item(2)],
  ...overrides,
});

describe('3D thumbnail scene contract', () => {
  it('accepts a square 1024 px pack scene with three cards on a ground plane', () => {
    expect(thumbnailScene3dSchema.parse(scene()).items).toHaveLength(3);
  });

  it('rejects fewer than three or more than six cards', () => {
    expect(thumbnailScene3dSchema.safeParse(scene({ items: [item(0), item(1)] })).success).toBe(false);
    expect(
      thumbnailScene3dSchema.safeParse(scene({ items: Array.from({ length: 7 }, (_, index) => item(index)) })).success,
    ).toBe(false);
  });

  it('rejects duplicate item ids and repeated cards', () => {
    expect(thumbnailScene3dSchema.safeParse(scene({ items: [item(0), item(0), item(2)] })).success).toBe(false);
    const repeated = [item(0), item(1, { card_id: item(0).card_id }), item(2)];
    expect(thumbnailScene3dSchema.safeParse(scene({ items: repeated })).success).toBe(false);
  });

  it('rejects a card from another pack in a pack scene', () => {
    const foreign = [item(0), item(1), item(2, { card_id: card('kenney-mini-forest', 'trees/pine') })];
    const result = thumbnailScene3dSchema.safeParse(scene({ items: foreign }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'every pack scene card must belong to the target pack',
    );
  });

  it('allows a set scene to mix packs from the set', () => {
    const mixed = [item(0), item(1), item(2, { card_id: card('kenney-mini-forest', 'trees/pine') })];
    expect(
      thumbnailScene3dSchema.safeParse(scene({ target: { kind: 'set', id: 'kaykit' }, items: mixed })).success,
    ).toBe(true);
  });

  it('rejects a duration that is not a whole number of frames', () => {
    expect(thumbnailScene3dSchema.safeParse(scene({ duration_ms: 1001, fps: 24 })).success).toBe(false);
    expect(thumbnailScene3dSchema.safeParse(scene({ duration_ms: 3000, fps: 12 })).success).toBe(true);
    expect(thumbnailScene3dSchema.safeParse(scene({ duration_ms: 1500, fps: 7 })).success).toBe(false);
  });

  it('rejects a role on anything but a character', () => {
    expect(
      thumbnailScene3dSchema.safeParse(scene({ items: [item(0, { role: 'hero' }), item(1), item(2)] })).success,
    ).toBe(false);
  });

  it('fixes the canvas to a square 1024 px frame', () => {
    expect(
      thumbnailScene3dSchema.safeParse(scene({ canvas: { width: 1024, height: 512, background: '#e9e1cc' } })).success,
    ).toBe(false);
  });
});
