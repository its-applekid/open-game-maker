export interface DictationTranscript {
  kind: 'partial' | 'final';
  text: string;
}

export interface DictationError {
  code: string;
  message: string;
}

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => RecognitionLike;
type DictationEventMap = {
  transcript: DictationTranscript;
  error: DictationError;
};

const recognitionGlobal = () =>
  globalThis as typeof globalThis & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };

function browserLanguage(): string {
  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en-US';
}

export class Dictation {
  static readonly vendorNote = 'Browser dictation may send microphone audio to your browser vendor for transcription.';

  static isSupported(): boolean {
    const browser = recognitionGlobal();
    return Boolean(browser.SpeechRecognition ?? browser.webkitSpeechRecognition);
  }

  private recognition: RecognitionLike | undefined;
  private readonly listeners = new Map<keyof DictationEventMap, Set<(value: never) => void>>();
  private finalParts: string[] = [];
  private started = false;
  private ended = false;
  private endRequested = false;
  private finalEmitted = false;

  constructor(private readonly lang = browserLanguage()) {}

  on<K extends keyof DictationEventMap>(event: K, listener: (value: DictationEventMap[K]) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as (value: never) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as (value: never) => void);
  }

  pressStart(): void {
    if (this.recognition) return;
    const browser = recognitionGlobal();
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) {
      this.emit('error', { code: 'unsupported', message: 'Browser dictation is unavailable.' });
      return;
    }

    this.finalParts = [];
    this.started = true;
    this.ended = false;
    this.endRequested = false;
    this.finalEmitted = false;

    const recognition = new Constructor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = this.lang;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => this.handleError(event.error);
    recognition.onend = () => {
      this.ended = true;
      this.recognition = undefined;
      if (this.endRequested) this.emitFinal();
    };
    this.recognition = recognition;
    recognition.start();
  }

  pressEnd(): void {
    if (!this.started || this.finalEmitted) return;
    this.endRequested = true;
    if (this.recognition) this.recognition.stop();
    else if (this.ended) this.emitFinal();
  }

  private handleResult(event: RecognitionEventLike) {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result) continue;
      const text = result[0].transcript.trim();
      if (result.isFinal) this.finalParts.push(text);
      else this.emit('transcript', { kind: 'partial', text });
    }
  }

  private handleError(error: string) {
    if (error === 'no-speech') return;
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      this.emit('error', { code: 'mic_denied', message: 'Microphone permission denied.' });
      return;
    }
    this.emit('error', { code: 'dictation_error', message: `Dictation failed: ${error}` });
  }

  private emitFinal() {
    if (this.finalEmitted) return;
    this.finalEmitted = true;
    this.emit('transcript', { kind: 'final', text: this.finalParts.filter(Boolean).join(' ') });
  }

  private emit<K extends keyof DictationEventMap>(event: K, value: DictationEventMap[K]) {
    for (const listener of this.listeners.get(event) ?? []) listener(value as never);
  }
}
