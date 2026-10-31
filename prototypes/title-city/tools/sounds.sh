#!/usr/bin/env bash
# The title scenes' sound effects (kaiju and EarthBound), all Kenney CC0 (Sci-Fi, Impact, Retro 2, Foley, RPG Audio), as MP3 because iPhone
# Safari can't decode Ogg. Writes models/sounds/<name>.mp3 (models/ is gitignored); earthbound.js cues them by name.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; K="${K:-$ROOT/assets-local/packs}"; O="$ROOT/prototypes/title-city/models/sounds"; mkdir -p "$O"
put() { ffmpeg -loglevel error -y -i "$1" -ac 1 -codec:a libmp3lame -q:a 5 "$O/$(basename "${1%.ogg}").mp3"; }
S="$K/kenney-sci-fi-sounds/1.0/extracted/Audio"; I="$K/kenney-impact-sounds/1.0/extracted/Audio"
R2="$K/kenney-retro-sounds-2/1.0/extracted/Audio"; F="$K/kenney-foley-sounds/1.0/extracted/Audio"; RPG="$K/kenney-rpg-audio/1.0/extracted/Audio"
for n in spaceEngineLow_000 lowFrequency_explosion_000 lowFrequency_explosion_001 laserRetro_000 impactMetal_000; do put "$S/$n.ogg"; done
for b in laserLarge explosionCrunch forceField laserSmall; do for i in 0 1 2 3 4; do put "$S/${b}_00$i.ogg"; done; done
for i in 0 1 2; do put "$S/thrusterFire_00$i.ogg"; put "$I/impactSoft_heavy_00$i.ogg"; put "$I/impactMetal_heavy_00$i.ogg"; done
for b in footstep_concrete impactWood_heavy impactWood_light impactPlank_medium; do for i in 0 1 2 3 4; do put "$I/${b}_00$i.ogg"; done; done
put "$I/impactPunch_heavy_000.ogg"; put "$I/impactPlate_heavy_000.ogg"
for n in hurt1 hurt2 jump1 fall1 secret1; do put "$R2/$n.ogg"; done
R1="$K/kenney-retro-sounds-1/1.0/extracted/Audio"; for i in 1 2 3 4 5; do put "$R1/creature$i.ogg"; done
for n in Rocks/stoneHit1 Rocks/stoneHit2 Rocks/stoneHit3 Swords/hitHelmet1 Water/drip1 Water/drip2 Water/drip3 Water/drip4 Water/sinkWater1 Water/sinkWater2 Woosh/woosh1 Woosh/woosh3; do put "$F/$n.ogg"; done
put "$RPG/chop.ogg"
ls "$O" | wc -l
