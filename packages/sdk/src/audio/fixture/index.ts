import { createAudio, SpokenText, type GmAudio } from '../index.js';

declare global {
  interface Window {
    __audio: GmAudio;
    __playNarration(): Promise<{ sentences: string[]; audioMs: number }>;
  }
}

window.__audio = createAudio({
  rng: () => 0.5,
  resolveUrl: (id) => `/audio/${id}.mp3`,
});

window.__playNarration = async () => {
  const sentences: string[] = [];
  const spoken = await SpokenText.load({
    key: 'fixture',
    audioUrl: '/audio/hello.opus',
    alignmentUrl: '/audio/hello.alignment.json',
  });
  const clock = window.__audio.context;
  return new Promise((resolve) => {
    let started = clock.currentTime;
    spoken.play({
      onSentence: (index, sentence) => {
        if (index === 0) started = clock.currentTime;
        sentences.push(sentence);
      },
      onEnd: () => resolve({ sentences, audioMs: (clock.currentTime - started) * 1000 }),
    });
  });
};
