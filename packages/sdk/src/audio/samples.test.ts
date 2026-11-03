import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAudio } from './index.js';
import { SampleBank } from './samples.js';
import {
  FakeAudioBuffer,
  FakeAudioContext,
  FakeWindow,
  asAudioBuffer,
  asWindow,
  contextConstructor,
} from './test/fake-audio.js';

function setup(values: number[]) {
  const context = new FakeAudioContext();
  context.state = 'running';
  const rng = vi.fn(() => values.shift() ?? 0.5);
  const loader = { audio: vi.fn(async () => asAudioBuffer(new FakeAudioBuffer())) };
  const audio = createAudio({
    rng,
    loader,
    win: asWindow(new FakeWindow()),
    AudioContextCtor: contextConstructor(context),
  });
  return { audio, context, loader, rng };
}

describe('sample playback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses only the injected RNG for pitch variation', async () => {
    const { audio, context } = setup([0.25, 0.75]);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });

    audio.play('hit', { pitch: 0.1 });
    audio.play('hit', { pitch: 0.1 });
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));

    expect(context.sources.map((source) => source.playbackRate.value)).toEqual([0.95, 1.05]);
    random.mockRestore();
  });

  it('chooses playOneOf with the injected RNG', async () => {
    const { audio, loader } = setup([0.75, 0.5]);
    audio.playOneOf(['a', 'b'], { pitch: 0 });
    await vi.waitFor(() => expect(loader.audio).toHaveBeenCalled());
    expect(loader.audio).toHaveBeenCalledWith('b');
  });

  it('refuses playback before unlock', () => {
    const { audio, context, loader } = setup([]);
    context.state = 'suspended';
    expect(audio.play('hit')).toBeNull();
    expect(loader.audio).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);
  });

  it('warns once and no-ops when decoding fails', async () => {
    const context = new FakeAudioContext();
    context.state = 'running';
    const logger = { warn: vi.fn() };
    const loader = { audio: vi.fn(async () => Promise.reject(new Error('bad mp3'))) };
    const audio = createAudio({
      rng: () => 0.5,
      loader,
      logger,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });

    audio.play('bad');
    audio.play('bad');
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledOnce());
    expect(logger.warn).toHaveBeenCalledWith('audio', 'bad', expect.any(Error));
    expect(context.sources).toHaveLength(0);
  });

  it('decodes offline renders without calling the live-context loader', async () => {
    const context = new FakeAudioContext();
    const buffer = asAudioBuffer(new FakeAudioBuffer());
    const loader = {
      audio: vi.fn(async () => Promise.reject(new Error('live decoder must not run'))),
      resolve: vi.fn(() => ({ url: '/resolved/hit.mp3' })),
    };
    const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as Response);
    const decoder = { decodeAudioData: vi.fn(async () => buffer) } as unknown as BaseAudioContext;
    const bank = new SampleBank({
      context: context as unknown as AudioContext,
      loader,
      fetch: fetcher as typeof globalThis.fetch,
      resolveUrl: (id) => id,
      logger: console,
    });

    await expect(bank.loadForRender('hit', decoder)).resolves.toBe(buffer);
    expect(loader.audio).not.toHaveBeenCalled();
    expect(loader.resolve).toHaveBeenCalledWith('hit');
    expect(fetcher).toHaveBeenCalledWith('/resolved/hit.mp3');
    expect(decoder.decodeAudioData).toHaveBeenCalledOnce();
  });

  it('reads offline render samples from gm-blobs-v1 before the network', async () => {
    const context = new FakeAudioContext();
    const buffer = asAudioBuffer(new FakeAudioBuffer());
    const digest = 'a'.repeat(64);
    const url = `https://game.test/a/${digest}.mp3`;
    const loader = {
      audio: vi.fn(async () => Promise.reject(new Error('live decoder must not run'))),
      resolve: vi.fn(() => ({ url })),
    };
    const fetcher = vi.fn(async () => Promise.reject(new Error('network must not run')));
    const match = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match })) });
    const decoder = { decodeAudioData: vi.fn(async () => buffer) } as unknown as BaseAudioContext;
    const bank = new SampleBank({
      context: context as unknown as AudioContext,
      loader,
      fetch: fetcher as typeof globalThis.fetch,
      resolveUrl: (id) => id,
      logger: console,
    });

    await expect(bank.loadForRender('hit', decoder)).resolves.toBe(buffer);
    expect(match).toHaveBeenCalledWith(url);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
