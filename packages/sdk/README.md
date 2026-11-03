# Game SDK

## Trusted host origin

Set the optional game-manifest `hostOrigin` to the exact HTTP(S) origin allowed to frame a build. `boot` prefers an
explicit `BootOptions.hostOrigin`, then the manifest value, and otherwise keeps the referrer-derived fallback for
existing builds. Paths, credentials, query strings, and fragments are not valid origins.

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

## Editor camera

The host sends `editor.camera { mode: 'follow' | 'free', target?: entityId }` (a room watcher's Follow/Free toggle).
Any role may send it: the camera is presence, not design state. `boot` hands it to `GameInstance.setCamera(mode, target)`
and answers `error { code: 'unsupported' }` when the game has none; throw for an unknown `target`.

- `follow`: the camera tracks `target`, or the game's default player when it is absent.
- `free`: the editor pan/zoom (`EditorCamera` in 3D, `PhaserEditorCamera` in 2D): wheel zoom (and pinch in 3D),
  middle/right-button or touch drag to pan.

Obey it only in edit mode; play mode keeps the manifest rig. `templates/game-2d` and `templates/game-3d` show both.
