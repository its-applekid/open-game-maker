#!/usr/bin/env bash
# Copy what the city title prototype loads: three.js r170 (from the studio prototype's vendored copy) and the Kenney city and car
# models (CC0). vendor/ and models/ are gitignored; rebuild them with this script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; HERE="$ROOT/prototypes/title-city"; K="$ROOT/assets-local/packs"
rm -rf "$HERE/vendor" "$HERE/models"; mkdir -p "$HERE/vendor" "$HERE/models/city" "$HERE/models/cars"
cp -r "$ROOT/prototypes/studio-v0/demo/vendor/three" "$HERE/vendor/"
mkdir -p "$HERE/vendor/three/examples/jsm/exporters"; curl -sfL https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/exporters/GLTFExporter.js -o "$HERE/vendor/three/examples/jsm/exporters/GLTFExporter.js"
cp -r "$K/kenney-city-kit-commercial/2.1/extracted/Models/GLB format/"{*.glb,Textures} "$HERE/models/city/"
C="$(ls -d "$K"/kenney-car-kit/*/extracted/Models/GLB\ format)"
cp -r "$C/"{sedan,taxi,police,delivery,suv,van,truck,hatchback-sports,garbage-truck}.glb "$C/Textures" "$HERE/models/cars/" 2>/dev/null || true

# street tiles, suburban houses and the train (all Kenney CC0)
mkdir -p "$HERE/models/roads" "$HERE/models/suburb" "$HERE/models/train"
cp -r "$K/kenney-city-kit-roads/"*/extracted/Models/GLB\ format/* "$HERE/models/roads/"
cp -r "$K/kenney-city-kit-suburban/"*/extracted/Models/GLB\ format/* "$HERE/models/suburb/"
cp -r "$K/kenney-train-kit/"*/extracted/Models/GLB\ format/* "$HERE/models/train/"
mkdir -p "$HERE/models/industrial"; cp -r "$K/kenney-city-kit-industrial/"*/extracted/Models/GLB\ format/* "$HERE/models/industrial/"
# castle town: Kenney Castle Kit and Mini Dungeon (CC0); then rebuild the cloned variants: node tools/variants.mjs (needs the prototype served on :8792)
mkdir -p "$HERE/models/castle" "$HERE/models/minidungeon"
cp -r "$K/kenney-castle-kit/"*/extracted/Models/GLB\ format/* "$HERE/models/castle/"
cp -r "$K/kenney-mini-dungeon/"*/extracted/Models/GLB\ format/* "$HERE/models/minidungeon/"
# rampage monsters: Quaternius Ultimate Monsters (CC0, assets-local/packs/quaternius-ultimate-monsters)
UM="$K/quaternius-ultimate-monsters/1.0/extracted/glb"; mkdir -p "$HERE/models/monsters"
cp "$UM/Yeti-ceRHr.glb" "$HERE/models/monsters/yeti.glb"; cp "$UM/Dino.glb" "$HERE/models/monsters/dino.glb"; cp "$UM/Blue-Demon.glb" "$HERE/models/monsters/blue-demon.glb"
# effect textures: Kenney Smoke Particles, Kenney Particle Pack (CC0), Synty Particle FX (personal licence)
mkdir -p "$HERE/models/fx"; SM="$(ls -d "$K"/kenney-smoke-particles/*/extracted | head -1)"; PP="$(ls -d "$K"/kenney-particle-pack/*/extracted | head -1)"
for f in whitePuff00 whitePuff03 whitePuff07 whitePuff12 blackSmoke02 blackSmoke07 blackSmoke12 flash00 flash03 explosion02; do cp "$(find "$SM" -name "$f.png" | head -1)" "$HERE/models/fx/"; done
for f in flame_02 flame_04 flame_05 fire_01 fire_02 spark_02 spark_05 dirt_01 dirt_02 scorch_01 scorch_02; do cp "$(find "$PP" -name "$f.png" | head -1)" "$HERE/models/fx/"; done
for f in PolygonParticles_GroundBreak_01 PolygonParticles_Ring_01; do cp "$(find "$K/synty-polygon-particle-fx" -name "$f.png" | head -1)" "$HERE/models/fx/"; done
echo "built $HERE"
