# SmallScaleInt sampler

This deterministic Phaser sampler stages six four-second SmallScaleInt scenes: village arrival, knight/orc fight,
desert chest, rural zombie chase, interior ambush, and creature charge. The checked-in game remains runnable without
the licensed media by drawing geometry fallbacks. Private builds use only assets copied from an authorized local
library after their card ids and SHA-256 digests have been verified.

From the repository root, install and build the verifier:

```sh
pnpm install --offline --frozen-lockfile
pnpm --filter @ogm/gm-cli build
```

Then run these commands from this directory:

```sh
pnpm prepare:assets -- --assets-root <authorized-assets-root>
pnpm exec vite build --mode test
pnpm exec vite preview --host 127.0.0.1
```

With the preview running, capture the six native 3x, 60 fps clips:

```sh
for scene in village fight loot rural interior creatures; do
  GM_VERIFY_SOFTWARE_GL=1 node ../../../packages/gm-cli/dist/index.js run \
    --url "http://127.0.0.1:4173/?scene=$scene" \
    --viewport desktop --record 4s --record-fps 60 --record-native \
    --out "../../../assets-local/sets/smallscaleint/raw/$scene"
done
pnpm trailer -- --out ../../../assets-local/sets/smallscaleint
```

The trailer builder makes six hard-cut clips and a 24-second H.264 trailer with game SFX cues and no music or text.
All copied media and rendered outputs stay under ignored `assets-local/` paths. Do not commit them or attach them to a
public issue or pull request.

Run `pnpm test`, `pnpm typecheck`, and `pnpm test:browser` for the sampler's automated checks.
