/** Engine-free part compositor (Canvas 2D). Shared need with other creator kits; see README. */

import { conventions } from './conventions.js';

export interface LayeredSpriteLayer {
  image: CanvasImageSource & { width: number; height: number };
  /** Draw order: lower first, so higher orders cover lower ones. */
  order: number;
  dx?: number;
  dy?: number;
}

export interface Canvas2D {
  width: number;
  height: number;
  getContext(kind: '2d'): Pick<CanvasRenderingContext2D, 'drawImage' | 'imageSmoothingEnabled'> | null;
}

function defaultCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height) as unknown as Canvas2D;
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Draws the layers into one sheet as big as the largest layer (plus its offset), lowest `order` first; equal
 * orders keep their array order. Pixel art stays unsmoothed.
 */
export function composeLayers<C extends Canvas2D>(
  layers: readonly LayeredSpriteLayer[],
  createCanvas: (width: number, height: number) => C = defaultCanvas as (w: number, h: number) => C,
): C {
  if (layers.length === 0) throw new Error('composeLayers needs at least one layer');
  const width = Math.max(...layers.map((l) => l.image.width + (l.dx ?? 0)));
  const height = Math.max(...layers.map((l) => l.image.height + (l.dy ?? 0)));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context is unavailable');
  context.imageSmoothingEnabled = false;
  const sorted = layers.map((layer, i) => ({ layer, i })).sort((a, b) => a.layer.order - b.layer.order || a.i - b.i);
  for (const { layer } of sorted) context.drawImage(layer.image, layer.dx ?? 0, layer.dy ?? 0);
  return canvas;
}

export type FarmerLayer = (typeof conventions.farmerPieces.value.layers)[number];

/** Farmer generator pieces as layers in the pack's order (body at the bottom, accessory on top). */
export function farmerLayers(pieces: Partial<Record<FarmerLayer, LayeredSpriteLayer['image']>>): LayeredSpriteLayer[] {
  const order: readonly string[] = conventions.farmerPieces.value.layers;
  return Object.entries(pieces).flatMap(([name, image]) => {
    const index = order.indexOf(name);
    if (index < 0) throw new Error(`"${name}" is not a farmer piece layer (${order.join(', ')})`);
    return image ? [{ image, order: index }] : [];
  });
}
