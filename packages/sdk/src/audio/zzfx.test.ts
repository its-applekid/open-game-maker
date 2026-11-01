import { describe, expect, it } from 'vitest';

import { createAudio } from './index.js';
import { FakeAudioContext, FakeWindow, asWindow, contextConstructor } from './test/fake-audio.js';

describe('ZzFX playback', () => {
  it('generates a cached buffer once for identical parameters', () => {
    const context = new FakeAudioContext();
    context.state = 'running';
    const audio = createAudio({
      rng: () => 0.5,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    audio.zzfx([1, 0, 440]);
    audio.zzfx([1, 0, 440]);

    expect(context.buffers).toHaveLength(1);
    expect(context.sources).toHaveLength(2);
  });

  it('preserves ZzFX square-duty and filter parameters', () => {
    const context = new FakeAudioContext();
    context.state = 'running';
    const audio = createAudio({
      rng: () => 0.5,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    audio.zzfx([1, 0, 440, 0, 0, 0.02, 4, 0.25]);
    audio.zzfx([1, 0, 440, 0, 0, 0.02, 5, 0.25]);
    audio.zzfx([1, 0, 440, 0, 0, 0.02, 0, 1]);
    audio.zzfx([1, 0, 440, 0, 0, 0.02, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1_000]);

    expect(context.buffers[0]!.channels[0]).not.toEqual(context.buffers[1]!.channels[0]);
    expect(context.buffers[2]!.channels[0]).not.toEqual(context.buffers[3]!.channels[0]);
  });
});
