import { describe, expect, it, vi } from 'vitest';

import { createAudio } from './index.js';
import {
  FakeAudioBuffer,
  FakeAudioContext,
  FakeWindow,
  asAudioBuffer,
  asWindow,
  contextConstructor,
} from './test/fake-audio.js';

function setup() {
  const context = new FakeAudioContext();
  context.state = 'running';
  const loader = { audio: vi.fn(async () => asAudioBuffer(new FakeAudioBuffer())) };
  const audio = createAudio({
    rng: () => 0.5,
    loader,
    win: asWindow(new FakeWindow()),
    AudioContextCtor: contextConstructor(context),
  });
  return { audio, context };
}

describe('music playback', () => {
  it('crossfades the old track and fades in the new one', async () => {
    const { audio, context } = setup();
    audio.music('a');
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    const oldGain = context.gains.at(-1)!;

    audio.music('b');
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));

    expect(oldGain.gain.targets.at(-1)).toEqual([0, 4, 0.3]);
    expect(context.sources[0]!.stops).toEqual([6.4]);
    expect(context.gains.at(-1)!.gain.targets.at(-1)).toEqual([1, 4, 0.3]);
  });

  it('starts after the intro on a repeated loop-point track', async () => {
    const { audio, context } = setup();
    audio.music('theme', { loop: [55.9, 133.9] });
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    audio.music(null);
    audio.music('theme', { loop: [55.9, 133.9] });
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    expect(context.sources[1]!.starts).toEqual([[0, 55.9]]);
  });

  it('starts wanted music when the context becomes running', async () => {
    const { audio, context } = setup();
    context.state = 'suspended';
    audio.music('theme');
    expect(context.sources).toHaveLength(0);

    await context.resume();
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));

    context.state = 'suspended';
    await context.resume();
    expect(context.sources).toHaveLength(1);
  });
});
