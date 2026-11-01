import { clearFrame, composite, createFrame, createFx } from 'pixelfx/core/index.js';

import { EFFECT_NAMES, loadGeneratedEffect } from './effects.generated.js';

export interface PixelFxMeta {
  name?: string;
  size: [width: number, height: number];
  origin?: [x: number, y: number];
  duration?: number;
  loop?: boolean;
  fps?: number;
  options?: Record<string, unknown>;
}

export interface PixelFxModule {
  meta: PixelFxMeta;
  create?: (options: Record<string, unknown>) => Record<string, unknown>;
  draw?: (...args: unknown[]) => void;
  drawBack?: (...args: unknown[]) => void;
  update?: (...args: unknown[]) => void;
}

export interface RenderEffectOptions {
  palette?: string | string[];
  seed: number;
  frames?: number;
}

export interface RenderedEffect {
  frames: ImageData[];
  fps: number;
  loop: boolean;
  w: number;
  h: number;
}

export interface PhaserTextureScene {
  textures: {
    addSpriteSheet(
      key: string,
      source: HTMLCanvasElement,
      config: { frameWidth: number; frameHeight: number; endFrame: number },
    ): unknown;
  };
}

export function listEffects(): string[] {
  return [...EFFECT_NAMES];
}

export async function loadEffect(name: string): Promise<PixelFxModule> {
  return (await loadGeneratedEffect(name)) as PixelFxModule;
}

function imageData(bytes: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): ImageData {
  if (typeof globalThis.ImageData === 'function') return new ImageData(bytes, width, height);
  return { data: bytes, width, height, colorSpace: 'srgb' } as ImageData;
}

export function renderEffect(effect: PixelFxModule, options: RenderEffectOptions): RenderedEffect {
  const name = effect.meta?.name ?? 'unnamed effect';
  try {
    const [w, h] = effect.meta.size;
    const [originX, originY] = effect.meta.origin ?? [0, 0];
    const fps = effect.meta.fps ?? 60;
    const frameCount = options.frames ?? Math.max(1, Math.ceil((effect.meta.duration ?? 1) * fps));
    if (!Number.isInteger(frameCount) || frameCount < 1) throw new RangeError('frames must be a positive integer');
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('effect fps must be positive');

    const palette = typeof options.palette === 'string' ? [options.palette] : options.palette;
    const fx = createFx(effect, { ...(palette ? { palette } : {}), seed: options.seed });
    const frame = createFrame(w, h, -originX, -originY);
    const frames: ImageData[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      if (index > 0) fx.update(1 / fps);
      clearFrame(frame);
      fx.draw(frame);
      const bytes = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
      composite(frame, bytes, null);
      frames.push(imageData(bytes, w, h));
    }
    return { frames, fps, loop: effect.meta.loop ?? false, w, h };
  } catch (cause) {
    throw new Error(`Failed to render pixelfx effect ${name}`, { cause });
  }
}

export function toPhaserTexture(scene: PhaserTextureScene, key: string, rendered: RenderedEffect): string {
  if (typeof document === 'undefined') throw new Error('toPhaserTexture requires a browser document');
  const canvas = document.createElement('canvas');
  canvas.width = rendered.w * rendered.frames.length;
  canvas.height = rendered.h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('toPhaserTexture requires a 2D canvas context');
  rendered.frames.forEach((frame, index) => context.putImageData(frame, index * rendered.w, 0));
  scene.textures.addSpriteSheet(key, canvas, {
    frameWidth: rendered.w,
    frameHeight: rendered.h,
    endFrame: rendered.frames.length - 1,
  });
  return key;
}
