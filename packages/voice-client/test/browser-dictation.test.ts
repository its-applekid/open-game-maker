import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserDictation } from '../src/browser-dictation.js';

type Result = { isFinal: boolean; 0: { transcript: string } };

class FakeRecognition {
  static current: FakeRecognition | undefined;
  continuous = true;
  interimResults = false;
  lang = '';
  onresult: ((event: { resultIndex: number; results: ArrayLike<Result> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());

  constructor() {
    FakeRecognition.current = this;
  }

  result(...results: Result[]) {
    this.onresult?.({ resultIndex: 0, results });
  }
}

function result(text: string, isFinal: boolean): Result {
  return { isFinal, 0: { transcript: text } };
}

describe('BrowserDictation', () => {
  beforeEach(() => {
    Object.assign(globalThis, { SpeechRecognition: FakeRecognition });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'SpeechRecognition');
    Reflect.deleteProperty(globalThis, 'webkitSpeechRecognition');
  });

  it('preserves editable pre-target dictation without a server token', () => {
    const dictation = new BrowserDictation();
    const transcripts: Array<{ kind: string; text: string }> = [];
    dictation.on('transcript', (frame) => transcripts.push(frame));

    dictation.pressStart();
    FakeRecognition.current?.result(result('moon', false), result('moonlit and cozy', true));
    dictation.pressEnd();

    expect(transcripts).toEqual([
      { kind: 'partial', text: 'moon' },
      { kind: 'final', text: 'moonlit and cozy' },
    ]);
  });
});
