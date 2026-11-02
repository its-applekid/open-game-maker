import { describe, expect, it, vi } from 'vitest';

import { createAudio } from './index.js';
import { FakeAudioContext, FakeWindow, asWindow, contextConstructor } from './test/fake-audio.js';

describe('audio relay', () => {
  it('relays samples and music without creating local sources', () => {
    const context = new FakeAudioContext();
    context.state = 'running';
    const bridge = { send: vi.fn() };
    const audio = createAudio({
      bridge,
      rng: () => 0.5,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    audio.relay(true);
    audio.play('hit', { vol: 0.6, rate: 1.2 });
    audio.music('theme');
    audio.music(null);

    expect(bridge.send.mock.calls).toEqual([
      ['audio.relay', { cue: 'hit', vol: 0.6, rate: 1.2 }],
      ['audio.relay', { loop: 'theme', gain: 1 }],
      ['audio.relay', { loop: 'theme', gain: 0 }],
    ]);
    expect(context.sources).toHaveLength(0);
    expect(context.gains[0]!.gain.targets.at(-1)?.[0]).toBe(0);

    audio.music('again');
    audio.relay(false);
    expect(bridge.send).toHaveBeenLastCalledWith('audio.relay', { loop: 'again', gain: 0 });
  });
});
