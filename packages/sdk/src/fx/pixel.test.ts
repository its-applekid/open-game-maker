import { afterEach, describe, expect, it, vi } from 'vitest';

import { listEffects, loadEffect, renderEffect, toPhaserTexture, type PixelFxModule } from './pixel.js';

describe('pixelfx adapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists and loads every vendored effect', async () => {
    const names = listEffects();

    expect(names.length).toBeGreaterThanOrEqual(200);
    expect(names).toContain('fire/torch');
    expect(names).toContain('explosions/dirt-explosion');
    await expect(loadEffect('fire/torch')).resolves.toMatchObject({ meta: { name: 'Torch' } });
    await expect(loadEffect('missing/effect')).rejects.toThrow('Unknown pixelfx effect');
  });

  it('renders byte-identical frames for the same seed and different frames for another seed', async () => {
    const torch = await loadEffect('fire/torch');
    const first = renderEffect(torch, { seed: 3, frames: 8 });
    const replay = renderEffect(torch, { seed: 3, frames: 8 });
    const changed = renderEffect(torch, { seed: 4, frames: 8 });

    expect(first).toMatchObject({ fps: 30, loop: true, w: 72, h: 120 });
    first.frames.forEach((frame, index) => {
      expect(Buffer.from(frame.data).equals(Buffer.from(replay.frames[index]!.data))).toBe(true);
    });
    expect(
      changed.frames.some((frame, index) => !Buffer.from(frame.data).equals(Buffer.from(first.frames[index]!.data))),
    ).toBe(true);
  }, 15_000);

  it('turns rendered frames into one horizontal Phaser sprite sheet', () => {
    const rendered = {
      frames: [
        { data: new Uint8ClampedArray(4 * 2 * 3), width: 2, height: 3 } as ImageData,
        { data: new Uint8ClampedArray(4 * 2 * 3), width: 2, height: 3 } as ImageData,
      ],
      fps: 12,
      loop: false,
      w: 2,
      h: 3,
    };
    const putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);
    const addSpriteSheet = vi.fn();

    expect(toPhaserTexture({ textures: { addSpriteSheet } }, 'fx/torch', rendered)).toBe('fx/torch');
    expect(putImageData).toHaveBeenNthCalledWith(1, rendered.frames[0], 0, 0);
    expect(putImageData).toHaveBeenNthCalledWith(2, rendered.frames[1], 2, 0);
    expect(addSpriteSheet).toHaveBeenCalledWith('fx/torch', expect.objectContaining({ width: 4, height: 3 }), {
      frameWidth: 2,
      frameHeight: 3,
      endFrame: 1,
    });
  });

  it('names a failing effect in the render error', () => {
    const broken: PixelFxModule = {
      meta: { name: 'Broken Sparks', size: [1, 1], fps: 1, duration: 1 },
      draw() {
        throw new Error('boom');
      },
    };

    expect(() => renderEffect(broken, { seed: 1, frames: 1 })).toThrow('Broken Sparks');
  });
});
