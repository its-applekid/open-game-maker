# Narration assets

The narration renderer stores one Opus file and one alignment document for each content key. The asset build pipeline
can expose those files in `assets/manifest.json` with this entry shape:

```ts
type NarrationManifestEntry = {
  kind: 'narration';
  key: string;
  audio: string;
  alignment: string;
};
```

`audio` and `alignment` are the content-hashed asset paths emitted by the build pipeline. The SDK turns their signed
URLs into a playable line with `SpokenText.load({ key, audioUrl, alignmentUrl })`.
