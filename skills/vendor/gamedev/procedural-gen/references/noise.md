---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/procedural-gen/references/noise.md
modified: true
---

# Noise for terrain, biomes, and scatter

Gradient noise (Perlin, Simplex, OpenSimplex) is the workhorse of procedural
terrain. A noise function maps a continuous 2D/3D coordinate to a smooth value;
sampling it across a grid gives a coherent heightfield. **Use a library** —
implementing correct gradient noise is fiddly and rarely worth it.

For TypeScript: `simplex-noise` (`createNoise2D(rng)` takes a seeded `() => number`
and returns about `-1..1`) or FastNoiseLite's JS port. Rescale to a known range
before combining. A noise function without a seed parameter can be seeded by
adding a large per-seed offset to the coordinates.

## Frequency and wavelength

Sampling `noise(freq * x, freq * y)` zooms the pattern. Higher frequency = more,
smaller features; `wavelength = map_size / frequency`. Always normalize the input
coordinate (e.g. `nx = x / width`) so the same frequency means the same thing
across map sizes.

## Octaves (fractal Brownian motion)

Real terrain mixes large landforms with small detail. Sum octaves: each octave
multiplies frequency by **lacunarity** (commonly 2.0) and amplitude by **gain**
(a.k.a. persistence, commonly 0.5).

```ts
type Noise2D = (x: number, y: number) => number;

function fbm(noise: Noise2D, x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let total = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return total / norm;   // divide by summed amplitude -> stays in 0..1
}
```

To keep octaves independent (avoid correlation artifacts near the origin), give
each octave its own seed, or add a per-octave offset like
`noise(2*x + 5.3, 2*y + 9.1)`.

## Redistribution: shaping the elevation curve

Raw fBm is "all hills". Reshape it with a function `e = f(e)`:

- **Valleys/plateaus**: `e = pow(e, exponent)` with `exponent > 1` pushes mid
  elevations down into flats; `< 1` pulls them up toward peaks.
- **Ridges (mountain spines)**: `r = 1 - abs(2*noise - 1)` (a "ridged" transform)
  before summing octaves.
- **Terraces**: `e = round(e * levels) / levels` snaps to discrete bands.

These are the same image-filter ideas as a photo "curves" tool; experiment and
keep a fudge factor near 1.0 (`pow(e * 1.2, exponent)`).

## Biome lookup from two fields

One noise value bands the map; two decorrelated values give variety. Sample
**elevation** and **moisture** from different seeds, then table-lookup:

```ts
type Biome = 'OCEAN' | 'BEACH' | 'SNOW' | 'TUNDRA' | 'TAIGA' | 'SHRUBLAND' | 'DESERT' | 'GRASSLAND' | 'FOREST';

function biome(e: number, m: number): Biome {
  if (e < 0.1) return 'OCEAN';
  if (e < 0.12) return 'BEACH';
  if (e > 0.8) return m > 0.5 ? 'SNOW' : 'TUNDRA';
  if (e > 0.6) return m > 0.66 ? 'TAIGA' : 'SHRUBLAND';
  if (m < 0.16) return 'DESERT';
  if (m < 0.5) return 'GRASSLAND';
  return 'FOREST';
}
// These thresholds are starting points — every generator needs its own tuning.
```

## Island shaping

To force water at the map borders, blend the elevation toward a distance-based
shape. With `nx, ny` in `-1..+1` from center:

```ts
// Square-bump distance: 0 at center, ~1 at edges.
function islandShape(e: number, nx: number, ny: number, mix: number): number {
  const d = 1 - (1 - nx * nx) * (1 - ny * ny);
  return e + (1 - d - e) * mix;   // mix=0 -> original; mix~0.5 -> island
}
```

Round islands: `d = min(1, (nx*nx + ny*ny) / sqrt(2))`. Apply island shaping only
to low-frequency octaves to keep coastline detail.

## Object scatter (trees, rocks)

For natural spacing, do **not** threshold high-frequency noise. Prefer **Poisson
disc sampling** or a **jittered grid**, which guarantee a minimum spacing and
avoid clumping. Vary the minimum radius per biome for variable density (dense
forest vs sparse desert).

## Wraparound (seamless) maps

For a map whose east edge tiles with its west edge, sample noise on a cylinder:
map `x` to an angle and feed `cos/sin` into 3D noise. Tiling both axes uses 4D
noise on a torus. The value distribution changes with the dimension, so measure
the min/max you actually get over the map and rescale afterward.

## Determinism checklist

- One seeded noise generator per field, stored in the save.
- No time-, frame-, or hash-randomized input feeding generation.
- Same library version = same output (note: switching noise
  libraries changes results even with the same seed).
