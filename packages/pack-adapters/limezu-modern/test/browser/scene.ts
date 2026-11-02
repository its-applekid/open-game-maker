import Phaser from 'phaser';

import { NEIGHBOUR_BITS, TopdownMap, conventions } from '../../src/index.js';
import { fixtureMap } from '../fixtures/map-6x6.js';

const SCALE = 16;
const THIRD = SCALE / 4;
const { N, NE, E, SE, S, SW, W, NW } = NEIGHBOUR_BITS;

/**
 * A generated GameMaker autotile block: each cell paints the terrain its mask says (centre, edges, corners),
 * so a correctly painted map shows one seamless shape per mask region.
 */
function autotileSheet(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 12 * SCALE;
  canvas.height = 4 * SCALE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#5fbf4a';
  for (const [mask, cell] of Object.entries(conventions.autotile.value.layouts.gamemaker.index)) {
    const bits = Number(mask);
    const x0 = (cell % 12) * SCALE;
    const y0 = Math.floor(cell / 12) * SCALE;
    const box = (x: number, y: number, w: number, h: number) => g.fillRect(x0 + x, y0 + y, w, h);
    const inner = SCALE - 2 * THIRD;
    box(THIRD, THIRD, inner, inner);
    if (bits & N) box(THIRD, 0, inner, THIRD);
    if (bits & S) box(THIRD, SCALE - THIRD, inner, THIRD);
    if (bits & W) box(0, THIRD, THIRD, inner);
    if (bits & E) box(SCALE - THIRD, THIRD, THIRD, inner);
    if (bits & NW) box(0, 0, THIRD, THIRD);
    if (bits & NE) box(SCALE - THIRD, 0, THIRD, THIRD);
    if (bits & SW) box(0, SCALE - THIRD, THIRD, THIRD);
    if (bits & SE) box(SCALE - THIRD, SCALE - THIRD, THIRD, THIRD);
  }
  return canvas;
}

function plainSheet(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2 * SCALE;
  canvas.height = SCALE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#8a5a35';
  g.fillRect(0, 0, SCALE, SCALE);
  g.fillStyle = '#6d6d78';
  g.fillRect(SCALE, 0, SCALE, SCALE);
  return canvas;
}

class Fixture extends Phaser.Scene {
  create() {
    this.textures.addCanvas('auto', autotileSheet());
    this.textures.addCanvas('plain', plainSheet());
    const map = new TopdownMap(fixtureMap(SCALE), SCALE);
    map.render(this, { autotiles: 'auto', plain: 'plain' });
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      (window as unknown as { fixture: unknown }).fixture = { renderer: this.game.renderer.type };
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
