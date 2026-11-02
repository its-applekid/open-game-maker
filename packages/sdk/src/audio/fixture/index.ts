import { createAudio, type GmAudio } from '../index.js';

declare global {
  interface Window {
    __audio: GmAudio;
  }
}

window.__audio = createAudio({
  rng: () => 0.5,
  resolveUrl: (id) => `/${id}.mp3`,
});
