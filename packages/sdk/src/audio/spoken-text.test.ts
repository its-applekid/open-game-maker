import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAudio, SpokenText } from './index.js';
import { FakeAudioContext, FakeWindow, asWindow, contextConstructor } from './test/fake-audio.js';

const alignment = {
  key: 'fixture',
  text: 'Hello there little fox. Good luck!',
  voice: 'default',
  engine: 'fake',
  lang: 'en',
  duration_ms: 1_500,
  format: 'opus',
  alignment: [
    { text: 'Hello', start_ms: 0, end_ms: 250 },
    { text: 'there', start_ms: 250, end_ms: 500 },
    { text: 'little', start_ms: 500, end_ms: 750 },
    { text: 'fox.', start_ms: 750, end_ms: 1_000 },
    { text: 'Good', start_ms: 1_000, end_ms: 1_250 },
    { text: 'luck!', start_ms: 1_250, end_ms: 1_500 },
  ],
};

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  lang = '';

  constructor(readonly text: string) {}
}

describe('SpokenText', () => {
  const utterances: FakeUtterance[] = [];
  const synthesis = {
    speak: vi.fn((utterance: FakeUtterance) => utterances.push(utterance)),
    cancel: vi.fn(),
  };

  beforeEach(() => {
    utterances.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).endsWith('.json')
          ? Response.json(alignment)
          : new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
      ),
    );
    Object.assign(globalThis, { SpeechSynthesisUtterance: FakeUtterance, speechSynthesis: synthesis });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
    Reflect.deleteProperty(globalThis, 'speechSynthesis');
  });

  it('loads alignment and groups it into punctuated sentences', async () => {
    const spoken = await SpokenText.load({
      key: 'fixture',
      audioUrl: '/hello.opus',
      alignmentUrl: '/hello.alignment.json',
    });
    expect(spoken.sentences()).toEqual(['Hello there little fox.', 'Good luck!']);
  });

  it('plays through the voice bus and schedules sentence callbacks', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext();
    const audio = createAudio({
      rng: () => 0.5,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });
    await audio.unlock();
    const spoken = await SpokenText.load({
      key: 'fixture',
      audioUrl: '/hello.opus',
      alignmentUrl: '/hello.alignment.json',
    });
    const onSentence = vi.fn();
    const onEnd = vi.fn();
    spoken.play({ onSentence, onEnd, bus: 'voice' });
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));

    const source = context.sources[1]!;
    expect(source.connections[0]).toBe(audio.buses.voice);
    await vi.advanceTimersByTimeAsync(0);
    expect(onSentence).toHaveBeenNthCalledWith(1, 0, 'Hello there little fox.');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSentence).toHaveBeenNthCalledWith(2, 1, 'Good luck!');
    (source as unknown as { onended: () => void }).onended();
    expect(onEnd).toHaveBeenCalledOnce();
    audio.dispose();
  });

  it('cancels rendered callbacks that have not fired', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext();
    const audio = createAudio({
      rng: () => 0.5,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });
    await audio.unlock();
    const spoken = await SpokenText.load({
      key: 'fixture',
      audioUrl: '/hello.opus',
      alignmentUrl: '/hello.alignment.json',
    });
    const onSentence = vi.fn();
    const handle = spoken.play({ onSentence });
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(500);
    handle.cancel();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSentence).toHaveBeenCalledTimes(1);
    expect(context.sources[1]!.stops).toHaveLength(1);
    audio.dispose();
  });

  it('does not decode rendered audio before the SDK is unlocked', async () => {
    const context = new FakeAudioContext();
    const audio = createAudio({
      rng: () => 0.5,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });
    const spoken = await SpokenText.load({
      key: 'fixture',
      audioUrl: '/hello.opus',
      alignmentUrl: '/hello.alignment.json',
    });
    spoken.play();
    await Promise.resolve();
    expect(context.sources).toHaveLength(0);
    audio.dispose();
  });

  it('ends cleanly when the browser rejects rendered audio', async () => {
    const context = new FakeAudioContext();
    context.decodeAudioData = vi.fn().mockRejectedValue(new DOMException('unsupported', 'EncodingError'));
    const audio = createAudio({
      rng: () => 0.5,
      win: asWindow(new FakeWindow()),
      AudioContextCtor: contextConstructor(context),
    });
    await audio.unlock();
    const spoken = await SpokenText.load({
      key: 'fixture',
      audioUrl: '/hello.opus',
      alignmentUrl: '/hello.alignment.json',
    });
    const onEnd = vi.fn();
    spoken.play({ onEnd });

    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
    expect(context.sources).toHaveLength(1);
    audio.dispose();
  });

  it('falls back to speechSynthesis one sentence at a time', () => {
    const onSentence = vi.fn();
    const onEnd = vi.fn();
    const spoken = SpokenText.fromText('One. Two!', 'en-GB');
    spoken.play({ onSentence, onEnd });
    expect(utterances[0]).toMatchObject({ text: 'One.', lang: 'en-GB' });
    utterances[0]!.onend?.();
    utterances[1]!.onend?.();
    expect(onSentence.mock.calls).toEqual([
      [0, 'One.'],
      [1, 'Two!'],
    ]);
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
