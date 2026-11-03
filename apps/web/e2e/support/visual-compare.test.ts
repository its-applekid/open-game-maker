import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { compareScreenshots, prototypeThresholds } from './visual-compare';

const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const states = ['title', 'games', 'creation-option', 'creation-talk', 'editor'] as const;

describe('visual comparison', () => {
  for (const state of states) {
    for (const viewport of viewports) {
      it(`detects an injected ${state} shell delta at ${viewport.width}x${viewport.height}`, async () => {
        const reference = await image(viewport.width, viewport.height, false);
        const shifted = await image(viewport.width, viewport.height, true);

        expect((await compareScreenshots(reference, reference)).score).toBe(0);
        expect((await compareScreenshots(reference, shifted)).score).toBeGreaterThan(prototypeThresholds[state]);
      });
    }
  }
});

function image(width: number, height: number, shifted: boolean): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#fdf1d8' } })
    .composite([
      {
        input: {
          create: {
            width: Math.round(width * 0.3),
            height: Math.round(height * 0.4),
            channels: 3,
            background: '#3a2a20',
          },
        },
        left: shifted ? Math.round(width * 0.5) : Math.round(width * 0.1),
        top: Math.round(height * 0.2),
      },
    ])
    .png()
    .toBuffer();
}
