import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { speak } from '../src/speak.js';

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  lang = '';
  rate = 1;

  constructor(readonly text: string) {}
}

describe('speak', () => {
  const utterances: FakeUtterance[] = [];
  const synthesis = {
    speak: vi.fn((utterance: FakeUtterance) => utterances.push(utterance)),
    cancel: vi.fn(),
  };

  beforeEach(() => {
    utterances.length = 0;
    synthesis.speak.mockClear();
    synthesis.cancel.mockClear();
    Object.assign(globalThis, {
      SpeechSynthesisUtterance: FakeUtterance,
      speechSynthesis: synthesis,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
    Reflect.deleteProperty(globalThis, 'speechSynthesis');
  });

  it('speaks and highlights sentences sequentially', () => {
    const onSentence = vi.fn();
    const onEnd = vi.fn();
    speak('One. Two! Three?', { lang: 'en-GB', rate: 1.2, onSentence, onEnd });

    expect(onSentence).toHaveBeenNthCalledWith(1, 0, 'One.');
    expect(utterances[0]).toMatchObject({ text: 'One.', lang: 'en-GB', rate: 1.2 });
    utterances[0]?.onend?.();
    utterances[1]?.onend?.();
    utterances[2]?.onend?.();

    expect(onSentence.mock.calls).toEqual([
      [0, 'One.'],
      [1, 'Two!'],
      [2, 'Three?'],
    ]);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('cancels the active sentence and does not start another', () => {
    const onSentence = vi.fn();
    const handle = speak('One. Two.', { onSentence });

    handle.cancel();
    utterances[0]?.onend?.();

    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(onSentence).toHaveBeenCalledTimes(1);
  });
});
