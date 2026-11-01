import { splitSentences } from './sentences.js';

export interface SpeakOptions {
  lang?: string;
  rate?: number;
  onSentence?: (index: number, sentence: string) => void;
  onEnd?: () => void;
}

export interface SpeakHandle {
  cancel(): void;
}

export function isSpeechSupported(): boolean {
  return (
    typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined'
  );
}

export const isSupported = isSpeechSupported;

export function speak(text: string, options: SpeakOptions = {}): SpeakHandle {
  const sentences = splitSentences(text);
  let cancelled = false;
  let index = 0;

  const next = () => {
    if (cancelled) return;
    const sentence = sentences[index];
    if (sentence === undefined) {
      options.onEnd?.();
      return;
    }

    options.onSentence?.(index, sentence);
    const utterance = new SpeechSynthesisUtterance(sentence);
    if (options.lang) utterance.lang = options.lang;
    if (options.rate !== undefined) utterance.rate = options.rate;
    utterance.onend = () => {
      index += 1;
      next();
    };
    utterance.onerror = () => {
      index += 1;
      next();
    };
    speechSynthesis.speak(utterance);
  };

  if (isSpeechSupported()) {
    next();
  } else {
    queueMicrotask(() => {
      if (!cancelled) options.onEnd?.();
    });
  }

  return {
    cancel() {
      cancelled = true;
      if (isSpeechSupported()) speechSynthesis.cancel();
    },
  };
}
