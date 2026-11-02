import Phaser from 'phaser';

import { TopdownMap } from '../../src/index.js';
import { DRAWN } from '../fixtures/autotile-oracle.js';
import { TERRAIN, WALLS, fixtureMap } from '../fixtures/map-6x6.js';

const SCALE = 16;
const EDGE = SCALE / 4;
const TERRAIN_RGB = [0x5f, 0xbf, 0x4a];
const GROUND_RGB = [0x8a, 0x5a, 0x35];

/** Sample points in a cell (centre, edges, corners) and the neighbours that must all be terrain for each to be. */
const SAMPLES: [number, number, [number, number][]][] = [
  [8, 8, []],
  [8, 1, [[0, -1]]],
  [8, 14, [[0, 1]]],
  [1, 8, [[-1, 0]]],
  [14, 8, [[1, 0]]],
  [
    1,
    1,
    [
      [0, -1],
      [-1, 0],
      [-1, -1],
    ],
  ],
  [
    14,
    1,
    [
      [0, -1],
      [1, 0],
      [1, -1],
    ],
  ],
  [
    1,
    14,
    [
      [0, 1],
      [-1, 0],
      [-1, 1],
    ],
  ],
  [
    14,
    14,
    [
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  ],
];

/**
 * A generated GameMaker block drawn from what the pack draws in each cell (the measured oracle, not the
 * adapter's table): centre always, an edge or corner band where that neighbour is terrain.
 */
function autotileSheet(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 12 * SCALE;
  canvas.height = 4 * SCALE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = `rgb(${TERRAIN_RGB.join(',')})`;
  DRAWN.gamemaker.forEach((names, cell) => {
    if (names === null) return;
    const has = new Set(names.split(' '));
    const x0 = (cell % 12) * SCALE;
    const y0 = Math.floor(cell / 12) * SCALE;
    const band = (on: boolean, x: number, y: number, w: number, h: number) => on && g.fillRect(x0 + x, y0 + y, w, h);
    const inner = SCALE - 2 * EDGE;
    band(true, EDGE, EDGE, inner, inner);
    band(has.has('N'), EDGE, 0, inner, EDGE);
    band(has.has('S'), EDGE, SCALE - EDGE, inner, EDGE);
    band(has.has('W'), 0, EDGE, EDGE, inner);
    band(has.has('E'), SCALE - EDGE, EDGE, EDGE, inner);
    band(has.has('NW'), 0, 0, EDGE, EDGE);
    band(has.has('NE'), SCALE - EDGE, 0, EDGE, EDGE);
    band(has.has('SW'), 0, SCALE - EDGE, EDGE, EDGE);
    band(has.has('SE'), SCALE - EDGE, SCALE - EDGE, EDGE, EDGE);
  });
  return canvas;
}

function plainSheet(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2 * SCALE;
  canvas.height = SCALE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = `rgb(${GROUND_RGB.join(',')})`;
  g.fillRect(0, 0, SCALE, SCALE);
  g.fillStyle = '#6d6d78';
  g.fillRect(SCALE, 0, SCALE, SCALE);
  return canvas;
}

/** Points where the rendered map differs from the terrain mask itself (wall cells skipped). */
function mismatches(pixels: Uint8ClampedArray, width: number): string[] {
  const terrain = (x: number, y: number) => TERRAIN[y]?.[x] === 1;
  const out: string[] = [];
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      if (WALLS[y]![x]) continue;
      for (const [px, py, needs] of SAMPLES) {
        const expected = terrain(x, y) && needs.every(([dx, dy]) => terrain(x + dx, y + dy));
        const i = ((y * SCALE + py) * width + x * SCALE + px) * 4;
        const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
        const want = expected ? TERRAIN_RGB : GROUND_RGB;
        if (rgb.some((v, k) => Math.abs(v! - want[k]!) > 8))
          out.push(`cell ${x},${y} at ${px},${py}: ${rgb.join(',')}`);
      }
    }
  }
  return out;
}

class Fixture extends Phaser.Scene {
  create() {
    this.textures.addCanvas('auto', autotileSheet());
    this.textures.addCanvas('plain', plainSheet());
    new TopdownMap(fixtureMap(SCALE), SCALE).render(this, { autotiles: 'auto', plain: 'plain' });
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.game.renderer.snapshot((image) => {
        const img = image as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const g = canvas.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const { data } = g.getImageData(0, 0, img.width, img.height);
        (window as unknown as { fixture: unknown }).fixture = {
          renderer: this.game.renderer.type,
          size: [img.width, img.height],
          mismatches: mismatches(data, img.width),
        };
      });
    });
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  width: 6 * SCALE,
  height: 6 * SCALE,
  zoom: 8,
  pixelArt: true,
  backgroundColor: '#000000',
  scene: Fixture,
});
