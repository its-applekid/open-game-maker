---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/procedural-gen/SKILL.md
modified: true
name: procedural-gen
description: >
  Generate game content procedurally — seeded deterministic RNG, value/Perlin/
  Simplex noise for terrain and heightmaps, grid dungeon generation (rooms +
  corridors, BSP, random walk, wave function collapse), and weighted loot/drop
  tables. Engine-neutral algorithms. Use when the user mentions procedural
  generation, perlin/simplex noise, random seed, dungeon generator, WFC,
  heightmap/terrain, or loot tables.
---

# Procedural generation

Generate levels, terrain, and loot from compact rules and a seed. The throughline
of good procgen is **determinism**: a single seed reproduces the same world, so
bugs are repeatable and players can share seeds. This skill owns the core
algorithms — noise, seeded RNG, dungeon layout, weighted tables; genres like
`roguelike` and `survival-crafting` consume it.

## When to use

- Use to generate maps, dungeons, terrain heightmaps, item drops, or any content
  you do not want to author by hand.
- Use when results must be **reproducible from a seed** (debugging, daily
  challenges, shareable worlds).
- Use to pick weighted random outcomes (loot rarity, spawn tables).

**When *not* to use:** for the engine's tile API to *paint* the result, use
the vendored Phaser `tilemaps` skill (`putTileAt`, `putTilesAt`). For carefully hand-paced levels, use `level-design` — procgen and
authored design are complementary, not interchangeable.

## Core workflow

1. **Own your randomness.** Create one seeded RNG instance and pass it
   everywhere. Never call the global/static random in generation code — it makes
   results irreproducible and order-dependent.
2. **Pick the technique for the content.** Continuous terrain/heightmaps → noise.
   Discrete rooms/corridors → space partitioning or agent-based carving.
   Outcomes with rarities → weighted tables.
3. **Generate into a plain data grid/array first**, decoupled from rendering.
   Generation fills a `number[][]` or a `Map`; a separate pass draws it.
4. **Validate before shipping the result to the player.** Is every room
   reachable? Is the spawn safe? Is there a path to the exit? Reject or repair
   layouts that fail; do not hand the player a broken map.
5. **Tune with the seed fixed** so each parameter change is visible in isolation,
   then sweep seeds to check the distribution, not just one lucky map.

## Patterns

### 1. Seeded, deterministic RNG (the foundation)

```ts
import Phaser from 'phaser';

function generate(seed: string): number {
  const rng = new Phaser.Math.RandomDataGenerator([seed]);   // a dedicated instance — NOT Math.random
  const roomCount = rng.integerInRange(5, 12);               // same seed -> same sequence, every run
  return roomCount;
}
// RIGHT: thread `rng` through every function that makes a choice.
// WRONG: calling Math.random() or Phaser.Math.Between (global state) — order-dependent, unseedable.
```

`Phaser.Math.RND` is the game-wide generator that every other system also draws
from; avoid it for generation. Save `rng.state()` to resume a sequence mid-way
(`rng.state(saved)` restores it). Store the seed in the save file so a world can
be regenerated.

### 2. Fractal (fBm) noise for heightmaps

```ts
type Noise2D = (x: number, y: number) => number;   // returns ~0..1

// Sum several octaves: each higher octave has higher frequency, lower amplitude.
function fbm(noise: Noise2D, x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let total = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += amp * noise(x * freq, y * freq);
    norm += amp;          // track total amplitude
    amp *= gain;          // each octave contributes less
    freq *= lacunarity;   // ...at a higher frequency
  }
  return total / norm;    // normalize back into 0..1
}

// Redistribute to carve flat valleys / sharpen peaks: higher exp -> more lowland.
function elevation(noise: Noise2D, nx: number, ny: number): number {
  return Math.pow(fbm(noise, nx, ny), 2.2);
}
```

Use a real noise library (`simplex-noise`, or FastNoiseLite's JS port) — do not
implement gradient noise yourself. Seed **elevation and moisture with different
seeds** so a biome lookup over both fields isn't perfectly correlated. Full biome
lookup and island shaping are in `references/noise.md`.

### 3. Weighted loot table (rarity-correct selection)

```ts
import Phaser from 'phaser';

// Roll proportional to weight: common drops far more often than legendary.
function weightedPick<T>(rng: Phaser.Math.RandomDataGenerator, table: [T, number][]): T {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  const roll = rng.realInRange(0, total);   // a point on the cumulative line
  let upto = 0;
  for (const [item, w] of table) {
    upto += w;
    if (roll < upto) return item;           // first bucket the roll falls into
  }
  return [...table].reverse().find(([, w]) => w > 0)![0];   // roll == total (float edge)
}

const rng = new Phaser.Math.RandomDataGenerator(['loot-42']);
const loot = weightedPick(rng, [['common', 70], ['rare', 25], ['legendary', 5]]);
```

Weights need not sum to 100 — they are relative, and a weight of 0 never drops.
Phaser's `rng.weightedPick(array)` is *not* this: it biases toward the start of
the array rather than taking weights. To prevent bad streaks, use a "pity"/bag
system (see `references/dungeon-generation.md` notes on distributions).

### 4. Rooms-and-corridors dungeon (sketch)

```ts
import Phaser from 'phaser';

const W = 60, H = 40;
const rng = new Phaser.Math.RandomDataGenerator(['dungeon-7']);
const grid: number[][] = Array.from({ length: H }, () => Array<number>(W).fill(1));   // 1 = wall

// 1. Place non-overlapping rooms; 2. connect them; 3. carve into the grid.
const rooms: Phaser.Geom.Rectangle[] = [];
for (let attempt = 0; attempt < 200; attempt++) {
  const w = rng.between(4, 10), h = rng.between(4, 8);
  const r = new Phaser.Geom.Rectangle(rng.between(1, W - w - 1), rng.between(1, H - h - 1), w, h);
  const padded = (o: Phaser.Geom.Rectangle) => new Phaser.Geom.Rectangle(o.x - 1, o.y - 1, o.width + 2, o.height + 2);
  if (!rooms.some((o) => Phaser.Geom.Intersects.RectangleToRectangle(r, padded(o)))) rooms.push(r);   // keep a 1-tile gap
}

function carveLCorridor(g: number[][], a: Phaser.Math.Vector2, b: Phaser.Math.Vector2): void {
  const ax = Math.floor(a.x), ay = Math.floor(a.y), bx = Math.floor(b.x), by = Math.floor(b.y);
  for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) g[ay][x] = 0;   // horizontal then vertical
  for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) g[y][bx] = 0;
}
for (let i = 1; i < rooms.length; i++) {      // connect each room to the next
  carveLCorridor(grid, Phaser.Geom.Rectangle.GetCenter(rooms[i - 1]), Phaser.Geom.Rectangle.GetCenter(rooms[i]));
}
```

The complete generator (BSP partitioning, L-corridors, reachability check, and
random-walk caves) is in `references/dungeon-generation.md`.

## Pitfalls

- **Using the global RNG** inside generation makes worlds unreproducible and
  breaks the moment call order changes. Always pass a seeded instance.
- **Correlated noise fields**: sampling elevation and moisture from the *same*
  seed/offset produces biomes that line up in bands. Offset or reseed each field.
- **Octave artifacts**: adding octaves without renormalizing pushes values out of
  `0..1`; divide by the summed amplitude (and beware library output ranges — some
  return `-1..1`, some `0..1`).
- **No connectivity check**: rooms or caves can end up isolated. Flood-fill from
  the spawn and discard/reconnect unreachable regions before play.
- **Unbounded placement loops**: "keep trying until N rooms fit" can spin forever
  on a small grid. Cap attempts and accept fewer rooms.
- **Seeding once globally, then relying on frame timing**: any non-deterministic
  input (time, physics, hash randomization) leaking into generation destroys
  reproducibility. A common hidden one: iterating a `Set` or object keys
  whose insertion order depends on earlier random choices. Sort first.
- **Seeds that stop matching after an update.** Library RNGs promise the same
  sequence only on the same version: Phaser's `RandomDataGenerator` or a
  noise package can change its algorithm in an update.
  If shared seeds, daily challenges or seed-only saves must survive updates,
  ship your own small PRNG (mulberry32, xorshift, SplitMix64) with a test that pins
  its first outputs — or save the generated result instead of the seed.
- **Flat noise at integer coordinates**: Perlin noise is 0 at every integer
  lattice point, so sampling raw `noise(x, y)` at
  whole tile coordinates returns the same value everywhere. Scale by a
  non-integer frequency (`x / width * f`); libraries with a frequency setting
  apply it for you.

## References

- `references/noise.md` — octaves/lacunarity/gain, redistribution, island
  shaping, two-axis biome lookup, blue-noise object scatter.
- `references/dungeon-generation.md` — BSP, rooms+corridors, random-walk caves,
  cellular-automata smoothing, wave function collapse, connectivity validation,
  distribution/pity tables.

## Related skills

- Phaser `tilemaps` (vendored) — paint the generated grid into the engine.
- `level-design` — pacing and hand-authored structure that procgen complements.
- `save-systems` — store the seed (or the result) in the save.
