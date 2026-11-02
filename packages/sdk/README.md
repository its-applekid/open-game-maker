# Game SDK

## Narration

Narration manifest entries use this shape:

```ts
type NarrationManifestEntry = {
  kind: 'narration';
  key: string;
  audio: string;
  alignment: string;
};
```

Load the two signed asset URLs after creating the SDK audio instance, unlock audio from a user gesture, and play on
the voice bus:

```ts
import { createAudio, SpokenText } from '@gm/sdk/audio';

const audio = createAudio({ rng });
await audio.unlock(); // Call from a user gesture.
const line = await SpokenText.load({ key, audioUrl, alignmentUrl });
line.play({ onSentence: (_index, sentence) => showCaption(sentence) });
```

Use `SpokenText.fromText(text, lang)` when rendered audio is unavailable. It keeps sentence callbacks and uses the
browser's `speechSynthesis` voice.
