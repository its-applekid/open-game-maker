---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/procedural-gen/references/dungeon-generation.md
modified: true
---

# Dungeon and level generation

Four families cover most 2D level generation. All write into a plain grid
(`0 = wall`, `1 = floor`, or tile ids for WFC) that a tile pass renders later.
All take a seeded RNG (`Phaser.Math.RandomDataGenerator` satisfies the small
`Rng` interface used below).

## A. Rooms and corridors

Simple, readable, gives recognizable rooms. Place rectangles, then connect.

```ts
interface Rng { between(min: number, max: number): number }
type Room = { x: number; y: number; w: number; h: number };

const overlap = (a: Room, b: Room, pad: number): boolean =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
const center = (r: Room): [number, number] => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];

function generate(W: number, H: number, rng: Rng, attempts = 200, rmin = 4, rmax = 9): { grid: number[][]; rooms: Room[] } {
  const grid = Array.from({ length: H }, () => Array<number>(W).fill(0));   // 0 = wall
  const rooms: Room[] = [];
  for (let i = 0; i < attempts; i++) {
    const w = rng.between(rmin, rmax), h = rng.between(rmin, rmax);
    const room = { x: rng.between(1, W - w - 1), y: rng.between(1, H - h - 1), w, h };
    if (rooms.some((o) => overlap(room, o, 1))) continue;   // keep at least one tile between rooms
    for (let y = room.y; y < room.y + h; y++) for (let x = room.x; x < room.x + w; x++) grid[y][x] = 1;
    if (rooms.length > 0) {                                 // connect to the previously placed room
      const [cx, cy] = center(room), [px, py] = center(rooms[rooms.length - 1]);
      for (let x = Math.min(px, cx); x <= Math.max(px, cx); x++) grid[py][x] = 1;   // horizontal leg
      for (let y = Math.min(py, cy); y <= Math.max(py, cy); y++) grid[y][cx] = 1;   // vertical leg -> L
    }
    rooms.push(room);
  }
  return { grid, rooms };
}
```

For more interesting connectivity than "chain the rooms", connect rooms via a
minimum spanning tree of their centers, then add a few extra edges for loops.

## B. BSP (binary space partitioning)

Splits space recursively, guaranteeing rooms never overlap and tile the map. Good
for structured, building-like dungeons.

```ts
interface Rng { between(min: number, max: number): number }
type Rect = { x: number; y: number; w: number; h: number };
interface BspNode extends Rect { room?: Rect; children?: [BspNode, BspNode] }

function randomRoomInside(n: Rect, rng: Rng): Rect {
  const w = rng.between(3, n.w - 2), h = rng.between(3, n.h - 2);
  return { x: n.x + rng.between(1, n.w - w - 1), y: n.y + rng.between(1, n.h - h - 1), w, h };
}
function anyRoom(n: BspNode): Rect {
  return n.room ?? anyRoom(n.children![0]);
}

function bsp(node: BspNode, rng: Rng, depth: number, connect: (a: Rect, b: Rect) => void, minSize = 8): void {
  if (depth === 0 || (node.w < minSize * 2 && node.h < minSize * 2)) {
    node.room = randomRoomInside(node, rng);   // leaf: place one room
    return;
  }
  let left: BspNode, right: BspNode;
  if (node.w > node.h) {                       // split the longer axis
    const cut = rng.between(minSize, node.w - minSize);
    left = { x: node.x, y: node.y, w: cut, h: node.h };
    right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h };
  } else {
    const cut = rng.between(minSize, node.h - minSize);
    left = { x: node.x, y: node.y, w: node.w, h: cut };
    right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut };
  }
  bsp(left, rng, depth - 1, connect, minSize);
  bsp(right, rng, depth - 1, connect, minSize);
  node.children = [left, right];
  connect(anyRoom(left), anyRoom(right));      // join siblings
}
```

Connect siblings as the recursion unwinds, so every region links to its sibling
and the whole tree stays connected.

## C. Random-walk / cellular caves

Organic caverns. Either carve with a drunkard's walk, or seed noise then smooth
with cellular automata.

```ts
interface Rng { pick<T>(items: T[]): T }
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Drunkard's walk: a digger wanders, carving floor, until enough is open.
function drunkard(W: number, H: number, rng: Rng, targetRatio = 0.45): number[][] {
  const grid = Array.from({ length: H }, () => Array<number>(W).fill(0));
  let x = Math.floor(W / 2), y = Math.floor(H / 2), carved = 0;
  const goal = Math.floor(W * H * targetRatio);
  while (carved < goal) {
    if (grid[y][x] === 0) { grid[y][x] = 1; carved += 1; }
    x = clamp(x + rng.pick([-1, 0, 1]), 1, W - 2);   // random step, stay in bounds
    y = clamp(y + rng.pick([-1, 0, 1]), 1, H - 2);
  }
  return grid;
}

// Cellular automata smoothing: a cell becomes wall if most neighbors are walls.
function smooth(grid: number[][], W: number, H: number, steps = 4): number[][] {
  for (let s = 0; s < steps; s++) {
    const next = grid.map((row) => [...row]);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[y + dy][x + dx] === 0) walls++;
        next[y][x] = walls >= 5 ? 0 : 1;   // 5/9 majority rule
      }
    }
    grid = next;
  }
  return grid;
}
```

## D. Wave function collapse (tile adjacency rules)

WFC fills a grid so every pair of neighbours obeys adjacency rules you give it
(simple-tiled model). Each cell starts with every tile possible; repeat:
**observe** the undecided cell with the fewest options, **collapse** it to one
tile by weight, then **propagate** — shrink neighbours to tiles still compatible,
spreading until nothing changes. An empty cell is a contradiction: restart (or
backtrack).

```ts
interface Rng { pick<T>(items: T[]): T; frac(): number }
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // +x, -x, +y, -y

/** weights: tile -> weight; allowed.get(`${tile}:${d}`): tiles that may sit in DIRS[d] of tile. */
function wfc(W: number, H: number, weights: Map<string, number>, allowed: Map<string, Set<string>>, rng: Rng, maxRestarts = 20): string[][] {
  const pickWeighted = (opts: string[]): string => {
    let roll = rng.frac() * opts.reduce((s, t) => s + weights.get(t)!, 0);
    for (const t of opts) { roll -= weights.get(t)!; if (roll < 0) return t; }
    return opts[opts.length - 1];
  };
  for (let attempt = 0; attempt < maxRestarts; attempt++) {
    const cells = Array.from({ length: H }, () => Array.from({ length: W }, () => new Set(weights.keys())));
    let failed = false;
    while (!failed) {
      // Observe: an undecided cell with the fewest options; break ties with the rng.
      const open: [number, number, number][] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cells[y][x].size > 1) open.push([cells[y][x].size, x, y]);
      if (open.length === 0) return cells.map((row) => row.map((c) => [...c][0]));
      const fewest = Math.min(...open.map(([n]) => n));
      const [, x, y] = rng.pick(open.filter(([n]) => n === fewest));
      const opts = [...cells[y][x]].sort();              // sorted: Set order follows insertion
      cells[y][x] = new Set([pickWeighted(opts)]);
      // Propagate: shrink neighbours to tiles some remaining option still allows.
      const stack: [number, number][] = [[x, y]];
      while (stack.length > 0 && !failed) {
        const [cx, cy] = stack.pop()!;
        for (let d = 0; d < DIRS.length; d++) {
          const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const support = new Set<string>();
          for (const t of cells[cy][cx]) for (const s of allowed.get(`${t}:${d}`) ?? []) support.add(s);
          const narrowed = new Set([...cells[ny][nx]].filter((t) => support.has(t)));
          if (narrowed.size !== cells[ny][nx].size) {
            if (narrowed.size === 0) { failed = true; break; }   // contradiction: restart
            cells[ny][nx] = narrowed;
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  throw new Error('no solution within maxRestarts');
}
```

- Rules must be symmetric: if B may sit east of A, A must be allowed west of B.
  One-sided rules are only enforced when propagation happens to run from that
  side, so the finished grid can break them.
- Option count is the simplest "entropy"; the weighted Shannon entropy of the
  remaining options is the usual refinement. Either way the grid grows outward
  from the first collapse, so tile **weights** decide the overall mix.
- Pre-collapse fixed cells (border = wall, an entrance tile) and propagate from
  them before the loop to steer layouts.
- WFC guarantees local rules only. Run the connectivity check below on the
  result like any other generator.

## Connectivity validation (do this every time)

Generation can isolate regions. Flood-fill from the spawn; if floor tiles remain
unreached, either discard the map, dig a tunnel to the nearest reached tile, or
keep only the largest region.

```ts
// Assumes a solid wall border (no bounds checks).
function reachableFloor(grid: number[][], start: [number, number]): Set<string> {
  const seen = new Set<string>();
  const stack: [number, number][] = [start];
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (seen.has(`${x},${y}`) || grid[y][x] === 0) continue;
    seen.add(`${x},${y}`);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;   // compare seen.size to total floor count; reconnect the rest
}
```

Also validate: a path from spawn to exit exists (a breadth-first search over the grid is enough), the spawn
tile is safe, and key items aren't behind locks they themselves gate.

## Distribution control for loot/spawns

Pure weighted rolls produce streaks (ten commons in a row). Two fixes:

- **Bag / deck**: fill a bag with items in proportion to weights, shuffle, draw
  without replacement, refill when empty. Guarantees the rate over a window.
- **Pity timer**: track rolls since the last rare; once a threshold is passed,
  force or boost the rare's chance. Common in gacha/loot systems.

Keep these in the seeded RNG too, so drop sequences stay reproducible.
