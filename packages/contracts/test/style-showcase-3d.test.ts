import { describe, expect, it } from 'vitest';

import { setShowcase3dMediaSchema, setShowcase3dSchema } from '../src/style-showcase-3d.js';

const sequence = (overrides: Record<string, unknown> = {}) => ({
  schema: 'ogm.set-showcase-3d/1',
  set: 'kaykit',
  style_family: 'chunky-low-poly',
  fps: 12,
  loop_seconds: 4,
  layout: {
    viewport: [1024, 1024],
    background: '#28332a',
    camera: { fov_deg: 35, height_m: 1.6, distance_m: 4 },
  },
  runner: {
    ref: 't1:kaykit-adventurers/characters/knight@1.0',
    action: 'walk',
    clip: 'walk',
    path: {
      points: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    },
    speed: 2,
    scale: 1,
  },
  world: 'scenes/world.json',
  stops: [
    { id: 'plaza', start_time: 0, sheet: 'sheets/plaza.json' },
    { id: 'market', start_time: 1, sheet: 'sheets/market.json' },
    { id: 'gate', start_time: 2, sheet: 'sheets/gate.json' },
    { id: 'well', start_time: 3, sheet: 'sheets/well.json' },
  ],
  required_packs: ['kaykit-adventurers', 'kaykit-city-builder-bits'],
  ...overrides,
});

const track = (id: string) => ({
  mp4: `${id}.mp4`,
  gif: `${id}.gif`,
  poster: `${id}.png`,
});

describe('3D set showcase contract', () => {
  it('accepts a closed route with one point per stop plus the return point', () => {
    expect(setShowcase3dSchema.parse(sequence()).stops).toHaveLength(4);
  });

  it('rejects an open route that does not return to its start', () => {
    const open = sequence({
      runner: {
        ...sequence().runner,
        path: {
          points: [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [1, 1],
          ],
        },
      },
    });
    const result = setShowcase3dSchema.safeParse(open);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'the continuous route must end exactly where it starts',
    );
  });

  it('rejects a route with the wrong number of points', () => {
    const short = sequence({
      runner: {
        ...sequence().runner,
        path: {
          points: [
            [0, 0],
            [2, 0],
            [0, 0],
          ],
        },
      },
    });
    expect(setShowcase3dSchema.safeParse(short).success).toBe(false);
  });

  it('rejects stop times that do not increase from zero inside the loop', () => {
    const stops = sequence().stops;
    expect(
      setShowcase3dSchema.safeParse(sequence({ stops: [{ ...stops[0], start_time: 0.5 }, stops[1], stops[2]] }))
        .success,
    ).toBe(false);
    expect(
      setShowcase3dSchema.safeParse(sequence({ stops: [stops[0], { ...stops[1], start_time: 0 }, stops[2]] })).success,
    ).toBe(false);
    expect(
      setShowcase3dSchema.safeParse(sequence({ stops: [stops[0], stops[1], { ...stops[2], start_time: 4 }] })).success,
    ).toBe(false);
  });

  it('rejects an interval whose length disagrees with the declared speed by more than 2%', () => {
    const stops = sequence().stops;
    const result = setShowcase3dSchema.safeParse(
      sequence({ stops: [stops[0], stops[1], { ...stops[2], start_time: 2.5 }, stops[3]] }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes('more than 2%'))).toBe(true);
  });

  it('rejects duplicate stop ids', () => {
    const stops = sequence().stops;
    expect(
      setShowcase3dSchema.safeParse(sequence({ stops: [stops[0], stops[1], { ...stops[2], id: 'plaza' }] })).success,
    ).toBe(false);
  });

  it('requires a 1024 px square viewport and a card-backed runner', () => {
    expect(
      setShowcase3dSchema.safeParse(sequence({ layout: { ...sequence().layout, viewport: [1024, 512] } })).success,
    ).toBe(false);
    expect(setShowcase3dSchema.safeParse(sequence({ runner: { ...sequence().runner, action: 'run' } })).success).toBe(
      false,
    );
  });

  it('validates a baked media manifest with both shared tracks and posters', () => {
    const manifest = {
      schema: 'ogm.set-showcase-media/3',
      set: 'kaykit',
      client_rendering: false,
      duration: 4,
      video: { codec: 'h264', pixel_format: 'yuv420p', faststart: true },
      tracks: { region: track('showcase.region'), sheet: track('showcase.sheet') },
      stops: [
        { id: 'plaza', start_time: 0, region: { poster: 'plaza.region.png' }, sheet: { poster: 'plaza.sheet.png' } },
      ],
      qa: { timeline_fps: 1, timeline: ['timeline-000.png'] },
    };
    expect(setShowcase3dMediaSchema.parse(manifest).stops).toHaveLength(1);
    expect(
      setShowcase3dMediaSchema.safeParse({ ...manifest, video: { ...manifest.video, faststart: false } }).success,
    ).toBe(false);
  });
});
