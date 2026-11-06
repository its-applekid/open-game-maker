# sand3d prop programs and the lineup renderer (#546)

The evidence behind `docs/research/sand3d-props.md`. Three props written from sand3d's `docs/api.md` alone, plus the
renderer that put each beside the nearest KayKit Dungeon Remastered pieces at true scale.

## Run a prop

```bash
python3 -m venv sand3d-venv && . sand3d-venv/bin/activate
pip download --only-binary=:all: --dest wheelhouse sand3d==1.6.3   # 410 MB, mostly the bpy 5.2.3 wheel
pip install --no-index --find-links wheelhouse sand3d==1.6.3
cd docs/research/sand3d-props && python well.py                    # writes well.glb beside the program
```

`python hatch.py` and `python stall.py` likewise. Each takes 2.3–2.7 s including bpy start-up and is deterministic: the
same program produces the same bytes. Check an export with the repository's kit gate:

```bash
python3 -I scripts/assets/check_glb.py --budget low docs/research/sand3d-props/*.glb
```

The well fails that gate's centring test by design (its crank handle is on one side); KayKit's own chest and keg fail
it too. See the verdict document for what that means.

## Render a lineup

The renderer is a plain three.js page — no build step. It needs three's own files, which are not committed:

```bash
# three 0.186.1, the version templates/game-3d pins
curl -sSL -o three.tgz https://registry.npmjs.org/three/-/three-0.186.1.tgz && tar xzf three.tgz
mkdir -p site/build site/examples/jsm/{loaders,utils} site/assets
cp package/build/three.module.js package/build/three.core.js site/build/
cp package/examples/jsm/loaders/GLTFLoader.js site/examples/jsm/loaders/
cp package/examples/jsm/utils/{BufferGeometryUtils,SkeletonUtils}.js site/examples/jsm/utils/
cp tools/lineup.html tools/sets.json site/
# KayKit Dungeon Remastered (CC0) from its GitHub repo, into the gitignored assets-local/
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered.git \
  assets-local/kaykit-dungeon
K=assets-local/kaykit-dungeon/addons/kaykit_dungeon_remastered/Assets/gltf
cp "$K/barrel_large.gltf.glb" site/assets/kaykit_barrel_large.glb
# ...the other pieces named in sets.json, and the exported props as site/assets/sand3d_<name>.glb
python3 -m http.server 43190 --bind 127.0.0.1 -d site &
python3 tools/shot.py "http://127.0.0.1:43190/lineup.html?set=well" well.png
```

`shot.py` drives headless Chromium through the DevTools protocol: it polls `document.title` for `READY` and then
captures the screenshot. Chromium's own `--screenshot` fires on load, which is before the GLBs finish loading — and
`--virtual-time-budget` never resolves three's texture decode, so the page renders empty. It also needs a short
`TMPDIR` and its own `--user-data-dir`, or Chromium aborts on its own socket path.

`?set=<key>` picks a row from `sets.json`; `?view=front|threequarter`; `?pose=<degrees>` drives every joint in the set
from the extras (compose the rotation *after* the node's rest rotation — see the verdict document).

## Reading a render without eyes

`png_view.py <png> [cols rows]` prints a coarse luminance map plus a hue-classified map and the dominant colours, so a
text-only agent can read silhouette and palette. `item_palette.py <png> <cam_l> <cam_r> <label>:<x>:<width> ...` crops
each item's band and prints the colours it actually shows — that is how the palette comparison in the verdict was made.
`dump_glb.py <file.glb>` prints a GLB's nodes, extras, materials and animations.
