import { createAudio, SpokenText, type GmAudio } from '../index.js';

declare global {
  interface Window {
    __audio: GmAudio;
    __playNarration(): Promise<string[]>;
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
  return new Promise((resolve) => {
    spoken.play({
      onSentence: (_index, sentence) => sentences.push(sentence),
      onEnd: () => resolve(sentences),
    });
  });
};
