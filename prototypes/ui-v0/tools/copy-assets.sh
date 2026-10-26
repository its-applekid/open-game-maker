#!/usr/bin/env bash
# Rebuild prototypes/ui-v0/site/assets/ from assets-local/ (gitignored, licensed files never committed).
# Goblins are baked separately: serve the repo on :8765, then
#   node tools/bake.mjs GoblinFighters/GoblinFighter_01 GoblinFighters/GoblinFighter_02 GoblinFighters/GoblinFighter_03
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
K="$ROOT/assets-local/packs"
A="$ROOT/prototypes/ui-v0/site/assets"
UP="${UPLOADS:?set UPLOADS to the folder holding the four reference images}"
mkdir -p "$A/models/kenney/Textures" "$A/audio" "$A/img"
cp "$K/kenney-mini-dungeon/2.0/extracted/Models/GLB format/"*.glb "$A/models/kenney/"
cp "$K/kenney-mini-dungeon/2.0/extracted/Models/GLB format/Textures/colormap.png" "$A/models/kenney/Textures/"
cp "$UP/26b6e4f2-image.png" "$A/img/paper-bg.png"; cp "$UP/4d4fe99d-image.png" "$A/img/logo.png"
find_ogg() { find "$K/$1" -name "$2.ogg" | head -1; }
for n in creak1 metalLatch handleCoins doorOpen_1; do cp "$(find_ogg kenney-rpg-audio $n)" "$A/audio/"; done
for n in woosh1 woosh3 drip1 drip2 drip3 setDown1 pickup1 swordMetal1; do cp "$(find_ogg kenney-foley-sounds $n)" "$A/audio/"; done
for n in impactPunch_heavy_000 impactPunch_medium_002 impactSoft_heavy_001 footstep_concrete_000 footstep_concrete_001; do cp "$(find_ogg kenney-impact-sounds $n)" "$A/audio/"; done
for n in click_001 select_001 confirmation_001 drop_001 back_001; do cp "$(find_ogg kenney-interface-sounds $n)" "$A/audio/"; done
for n in 00 03 10; do cp "$(find_ogg kenney-music-jingles jingles-pizzicato_$n)" "$A/audio/"; done
cp "$(find_ogg kenney-music-loops 'Farm Frolics')" "$A/audio/music-home.ogg"
cp "$(find_ogg kenney-music-loops 'Mishief Stroll')" "$A/audio/music-play.ogg"
# iPhone Safari can't decode Ogg Vorbis, so ship MP3 (plays everywhere)
for f in "$A"/audio/*.ogg; do ffmpeg -loglevel error -y -i "$f" -codec:a libmp3lame -q:a 4 "${f%.ogg}.mp3" && rm "$f"; done
echo "assets ready in $A"
