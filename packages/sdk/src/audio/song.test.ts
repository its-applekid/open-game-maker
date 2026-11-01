import { describe, expect, it, vi } from 'vitest';

import { createAudio, songSchema } from './index.js';
import { FakeAudioContext, FakeWindow, asWindow, contextConstructor } from './test/fake-audio.js';

const validSong = {
  version: 1,
  bpm: 120,
  loopBars: 2,
  tracks: [{ id: 'lead', instrument: 'synth', pattern: [{ t: '0:0:0', n: 'C4', d: '8n' }] }],
};

describe('song.json', () => {
  it('accepts the v1 example and rejects notes beyond the loop', () => {
    expect(songSchema.parse(validSong)).toEqual(validSong);
    expect(() =>
      songSchema.parse({
        ...validSong,
        tracks: [{ ...validSong.tracks[0], pattern: [{ t: '2:0:0', n: 'C4', d: '8n' }] }],
      }),
    ).toThrow(/tracks/);
  });

  it('rejects too many tracks before importing Tone', async () => {
    const context = new FakeAudioContext();
    const loadTone = vi.fn();
    const audio = createAudio({
      rng: () => 0.5,
      loadTone,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    await expect(
      audio.song({ ...validSong, tracks: Array.from({ length: 17 }, () => validSong.tracks[0]) }),
    ).rejects.toThrow(/tracks/);
    expect(loadTone).not.toHaveBeenCalled();
  });

  it('resolves sampler asset ids before constructing Tone sampler', async () => {
    const context = new FakeAudioContext();
    const samplerOptions: unknown[] = [];
    const instrument = {
      connect: vi.fn(),
      triggerAttackRelease: vi.fn(),
      volume: { value: 0 },
      dispose: vi.fn(),
    };
    class Sampler {
      constructor(options: unknown) {
        samplerOptions.push(options);
        return instrument;
      }
    }
    class Part {
      start() {
        return this;
      }
      dispose() {}
    }
    const transport = { bpm: { value: 0 }, loop: false, loopEnd: '', start: vi.fn(), stop: vi.fn(), cancel: vi.fn() };
    const tone = { setContext: vi.fn(), getTransport: () => transport, Sampler, Part };
    const audio = createAudio({
      rng: () => 0.5,
      loadTone: async () => tone as unknown as typeof import('tone'),
      resolveUrl: (id) => `/assets/${id}.mp3`,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    const handle = await audio.song({
      ...validSong,
      tracks: [
        {
          id: 'drums',
          instrument: 'sampler',
          sampler: { C2: 'kick' },
          pattern: [{ t: '0:0:0', n: 'C2', d: '8n' }],
        },
      ],
    });

    expect(samplerOptions).toEqual([{ urls: { C2: '/assets/kick.mp3' } }]);
    handle.stop();
    expect(instrument.dispose).toHaveBeenCalledOnce();
  });

  it('cancels a song whose Tone import is still pending', async () => {
    const context = new FakeAudioContext();
    let finishImport!: (tone: typeof import('tone')) => void;
    const importPending = new Promise<typeof import('tone')>((resolve) => {
      finishImport = resolve;
    });
    const instrument = {
      connect: vi.fn(),
      triggerAttackRelease: vi.fn(),
      volume: { value: 0 },
      dispose: vi.fn(),
    };
    class Synth {
      constructor() {
        return instrument;
      }
    }
    class Part {
      start() {
        return this;
      }
      dispose() {}
    }
    const transport = { bpm: { value: 0 }, loop: false, loopEnd: '', start: vi.fn(), stop: vi.fn(), cancel: vi.fn() };
    const tone = { setContext: vi.fn(), getTransport: () => transport, Synth, Part };
    const audio = createAudio({
      rng: () => 0.5,
      loadTone: () => importPending,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    const pending = audio.song(validSong);
    audio.stop();
    finishImport(tone as unknown as typeof import('tone'));
    const handle = await pending;

    expect(transport.start).not.toHaveBeenCalled();
    handle.stop();
    expect(transport.stop).not.toHaveBeenCalled();
  });

  it('does not let a stale song handle stop its replacement', async () => {
    const context = new FakeAudioContext();
    const instruments: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
    class Synth {
      constructor() {
        const instrument = {
          connect: vi.fn(),
          triggerAttackRelease: vi.fn(),
          volume: { value: 0 },
          dispose: vi.fn(),
        };
        instruments.push(instrument);
        return instrument;
      }
    }
    class Part {
      start() {
        return this;
      }
      dispose() {}
    }
    const transport = { bpm: { value: 0 }, loop: false, loopEnd: '', start: vi.fn(), stop: vi.fn(), cancel: vi.fn() };
    const tone = { setContext: vi.fn(), getTransport: () => transport, Synth, Part };
    const audio = createAudio({
      rng: () => 0.5,
      loadTone: async () => tone as unknown as typeof import('tone'),
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    const first = await audio.song(validSong);
    await audio.song(validSong);
    expect(transport.stop).toHaveBeenCalledOnce();
    first.stop();

    expect(transport.stop).toHaveBeenCalledOnce();
    expect(instruments[1]!.dispose).not.toHaveBeenCalled();
  });
});
