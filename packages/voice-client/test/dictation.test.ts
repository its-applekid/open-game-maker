import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dictation } from '../src/dictation.js';

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

describe('Dictation', () => {
  beforeEach(() => {
    Object.assign(globalThis, { SpeechRecognition: FakeRecognition });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'SpeechRecognition');
    Reflect.deleteProperty(globalThis, 'webkitSpeechRecognition');
  });

  it('emits interim text immediately but holds final text until pressEnd', () => {
    const dictation = new Dictation();
    const transcripts: Array<{ kind: string; text: string }> = [];
    dictation.on('transcript', (frame) => transcripts.push(frame));

    dictation.pressStart();
    FakeRecognition.current?.result(result('mak', false));
    FakeRecognition.current?.result(result('make the', false));
    FakeRecognition.current?.result(result('make the door', true));

    expect(transcripts).toEqual([
      { kind: 'partial', text: 'mak' },
      { kind: 'partial', text: 'make the' },
    ]);

    dictation.pressEnd();
    expect(transcripts.at(-1)).toEqual({ kind: 'final', text: 'make the door' });
  });

  it('emits one empty final transcript when push-to-talk ends without speech', () => {
    const dictation = new Dictation();
    const transcripts: Array<{ kind: string; text: string }> = [];
    dictation.on('transcript', (frame) => transcripts.push(frame));

    dictation.pressStart();
    dictation.pressEnd();

    expect(transcripts).toEqual([{ kind: 'final', text: '' }]);
  });

  it('maps denied browser permission to mic_denied', () => {
    const dictation = new Dictation();
    const errors: Array<{ code: string }> = [];
    dictation.on('error', (error) => errors.push(error));

    dictation.pressStart();
    FakeRecognition.current?.onerror?.({ error: 'not-allowed' });

    expect(errors).toEqual([{ code: 'mic_denied', message: 'Microphone permission denied.' }]);
  });
});
