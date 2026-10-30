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
echo "built $HERE"
