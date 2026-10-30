#!/usr/bin/env bash
# Assemble the publishable folder: page code + Kenney CC0 sprites (art/) + a copy of the ui-v0 dungeon (demo/) with its
# GLB models re-saved as glTF JSON (artifacts don't serve .glb). art/ and demo/ are gitignored; rebuild them with this script.
# Goblin Cellar covers (art/goblin-*.webp) come from ui-v0's tools/e2e.mjs screenshots: OUT=<dir> W=1280 H=720 node e2e.mjs,
# then crop the stage and save 960 px webp (see README).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; HERE="$ROOT/prototypes/studio-v0"; K="$ROOT/assets-local/packs"
PY="${PY:-$ROOT/scripts/audio/.venv/bin/python}"
A="$HERE/art"; mkdir -p "$A/packs"
cp "$K/kenney-pixel-platformer/1.2/extracted/Tilemap/tilemap_packed.png" "$A/pp-tiles.png"
cp "$K/kenney-pixel-platformer/1.2/extracted/Tilemap/tilemap-characters_packed.png" "$A/pp-chars.png"
cp "$K/kenney-tiny-town/1.1/extracted/Tilemap/tilemap_packed.png" "$A/town.png"
cp "$K/kenney-tiny-dungeon/1.0/extracted/Tilemap/tilemap_packed.png" "$A/dungeon.png"
cp "$K/kenney-pixel-shmup/1.1/extracted/Tilemap/tiles_packed.png" "$A/shmup-tiles.png"
cp "$K/kenney-pixel-shmup/1.1/extracted/Tilemap/ships_packed.png" "$A/shmup-ships.png"
cp "$K/kenney-tiny-ski/1.0/extracted/Tilemap/tilemap_packed.png" "$A/ski.png"
cp "$K/kenney-tiny-battle/1.0/extracted/Tilemap/tilemap_packed.png" "$A/battle.png"
SP="$K/kenney-space-shooter-remastered/1.0/extracted"
for f in PNG/playerShip1_blue PNG/Enemies/enemyRed1 PNG/Enemies/enemyBlack3 PNG/Enemies/enemyGreen2 PNG/Meteors/meteorBrown_big1 PNG/Meteors/meteorGrey_med1 PNG/Lasers/laserBlue01 PNG/Lasers/laserRed01; do cp "$SP/$f.png" "$A/space-$(basename $f).png"; done
cp "$SP/Backgrounds/darkPurple.png" "$A/space-bg.png"
RP="$K/kenney-racing-pack/1.0/extracted/PNG"
for f in Cars/car_red_1 Cars/car_blue_1 Cars/car_yellow_1 Cars/car_green_1 Objects/tribune_full Objects/tree_large Objects/tires_red Objects/cone_straight; do cp "$RP/$f.png" "$A/race-$(basename $f).png"; done
PZ="$K/kenney-puzzle-pack-1/1.1/extracted/PNG/Default"
for f in element_red_rectangle_glossy element_blue_rectangle_glossy element_green_rectangle_glossy element_yellow_rectangle_glossy element_purple_rectangle_glossy paddleBlu ballBlue particleStar; do cp "$PZ/$f.png" "$A/puz-$f.png"; done
"$PY" -I -c "import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.thumbnail((400, 400)); im.save(sys.argv[2], quality=90)" "$ROOT/prototypes/ui-v0/site/assets/img/logo.png" "$A/logo.webp"
# paint splats for the spotlight's footage edge (Kenney Splat Pack, CC0)
mkdir -p "$A/splats"; cp "$K/kenney-splat-pack/1.0/extracted/PNG/Default (256px)/splat"{00,01,02,03,05,07,10,11,14,16,17,18,19,20,21,24,27,28,29,30,31,33,34,35}.png "$A/splats/"
"$PY" -I "$HERE/tools/previews.py" "$K" "$A/packs" kenney-1-bit-pack kenney-1-bit-platformer-pack kenney-monochrome-rpg-tileset kenney-pico-8-platformer \
  kenney-micro-roguelike kenney-tiny-town kenney-pixel-platformer kenney-tiny-dungeon kenney-toon-characters kenney-space-shooter-remastered kenney-shape-characters \
  kenney-scribble-platformer kenney-sketch-town kenney-scribble-dungeons kenney-isometric-miniature-dungeon kenney-isometric-medieval-town kenney-isometric-nature \
  kenney-mini-dungeon kenney-castle-kit kenney-nature-kit kenney-voxel-pack kenney-voxel-expansion-pack kenney-retro-fantasy-kit kenney-retro-urban-kit \
  synty-polygon-viking-realm synty-polygon-nature-biomes-alpine-mountain synty-polygon-goblin-war-camp
U="$ROOT/prototypes/ui-v0/site"; D="$HERE/demo"; rm -rf "$D"; mkdir -p "$D/assets/img" "$D/assets/models/kenney/Textures"
cp -r "$U/index.html" "$U/style.css" "$U/js" "$D/"; sed -i '/favicon\|apple-touch-icon\|rel="manifest"/d' "$D/index.html"
cp "$U/assets/img/logo.png" "$U/assets/img/paper-bg.png" "$D/assets/img/"; cp -r "$U/assets/audio" "$D/assets/"; rm -f "$D/assets/audio/music-alt.mp3"
cp "$U/assets/models/kenney/Textures/colormap.png" "$D/assets/models/kenney/Textures/"
cp "$U/assets/models/kenney/"*.glb "$D/assets/models/kenney/"; python3 -I "$HERE/tools/glb2json.py" "$D/assets/models/kenney/"*.glb >/dev/null; rm "$D/assets/models/kenney/"*.glb
# the artifact viewer won't run the CDN import map inside the game frame: ship the three.js files the game imports next to it
for f in build/three.module.js examples/jsm/loaders/GLTFLoader.js examples/jsm/utils/BufferGeometryUtils.js examples/jsm/utils/SkeletonUtils.js; do
  mkdir -p "$D/vendor/three/$(dirname $f)"; curl -sfL "https://cdn.jsdelivr.net/npm/three@0.170.0/$f" -o "$D/vendor/three/$f"; done
sed -i 's#https://cdn.jsdelivr.net/npm/three@0.170.0/#./vendor/three/#' "$D/index.html"
echo "built $HERE (publish index.html with every other file under it)"
