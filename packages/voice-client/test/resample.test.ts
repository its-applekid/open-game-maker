import { describe, expect, it, vi } from 'vitest';

import { PcmPlayer } from '../src/audio/playback.js';
import { resamplePcm16 } from '../src/audio/capture.js';

describe('audio conversion', () => {
  it('resamples 48 kHz floats to bounded 16 kHz PCM16', () => {
    const samples = Float32Array.from({ length: 4_800 }, (_, i) => Math.sin((i / 48_000) * Math.PI * 2 * 440));
    const output = resamplePcm16(samples, 48_000, 16_000);

    expect(output).toHaveLength(1_600);
    expect(Math.max(...output)).toBeLessThanOrEqual(32_767);
    expect(Math.min(...output)).toBeGreaterThanOrEqual(-32_768);
  });

  it('ignores unsupported playback formats without creating an audio context', () => {
    const contextFactory = vi.fn();
    const player = new PcmPlayer(contextFactory);

    player.enqueue({ format: 'opus', data_b64: 'AA==' });

    expect(contextFactory).not.toHaveBeenCalled();
  });

  it('ignores malformed PCM without throwing or creating an audio context', () => {
    const contextFactory = vi.fn();
    const player = new PcmPlayer(contextFactory);

    expect(() => player.enqueue({ format: 'pcm_16000', data_b64: '%%%' })).not.toThrow();
    expect(contextFactory).not.toHaveBeenCalled();
  });
});
