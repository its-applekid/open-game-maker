export type Grid = ArrayLike<number> | ArrayLike<ArrayLike<number>>;
export type GridPoint = [x: number, y: number];

export interface FindPathOptions {
  diagonal?: boolean;
  cutCorners?: boolean;
}

const DX = [0, -1, 1, 0, -1, 1, -1, 1] as const;
const DY = [-1, 0, 0, 1, -1, -1, 1, 1] as const;

function inBounds(point: GridPoint, width: number, height: number): boolean {
  return (
    Number.isInteger(point[0]) &&
    Number.isInteger(point[1]) &&
    point[0] >= 0 &&
    point[1] >= 0 &&
    point[0] < width &&
    point[1] < height
  );
}

function octileHeuristic(x: number, y: number, target: GridPoint): number {
  const dx = Math.abs(target[0] - x);
  const dy = Math.abs(target[1] - y);
  return 14 * Math.min(dx, dy) + 10 * Math.abs(dx - dy);
}

function manhattanHeuristic(x: number, y: number, target: GridPoint): number {
  return 10 * (Math.abs(target[0] - x) + Math.abs(target[1] - y));
}

function pathFrom(parents: Int32Array, target: number, width: number): GridPoint[] {
  const path: GridPoint[] = [];
  for (let index = target; index !== -1; index = parents[index]!) {
    path.push([index % width, Math.floor(index / width)]);
  }
  return path.reverse();
}

class MinHeap {
  private readonly values: number[] = [];

  constructor(private readonly stride: number) {}

  get size(): number {
    return this.values.length;
  }

  push(index: number, priority: number): void {
    const value = priority * this.stride + index;
    let child = this.values.length;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const parentValue = this.values[parent]!;
      if (value >= parentValue) break;
      this.values[child] = parentValue;
      child = parent;
    }
    this.values[child] = value;
  }

  pop(): number {
    const root = this.values[0]!;
    const tail = this.values.pop()!;
    if (this.values.length > 0) {
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1;
        if (left >= this.values.length) break;
        const right = left + 1;
        const child = right < this.values.length && this.values[right]! < this.values[left]! ? right : left;
        const childValue = this.values[child]!;
        if (childValue >= tail) break;
        this.values[parent] = childValue;
        parent = child;
      }
      this.values[parent] = tail;
    }
    return root % this.stride;
  }
}

export function findPath(
  grid: Grid,
  width: number,
  height: number,
  from: GridPoint,
  to: GridPoint,
  options: FindPathOptions = {},
): GridPoint[] | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (!inBounds(from, width, height) || !inBounds(to, width, height)) return null;

  const diagonal = options.diagonal ?? false;
  const size = width * height;
  const cells = grid instanceof Uint8Array && grid.length >= size ? grid : new Uint8Array(size);
  if (cells !== grid && typeof grid[0] === 'number') {
    const flat = grid as ArrayLike<number>;
    for (let index = 0; index < size; index += 1) cells[index] = flat[index] === 0 ? 0 : 1;
  } else if (cells !== grid) {
    const rows = grid as ArrayLike<ArrayLike<number>>;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) cells[y * width + x] = rows[y]?.[x] === 0 ? 0 : 1;
    }
  }
  const start = from[1] * width + from[0];
  const target = to[1] * width + to[0];
  if (cells[start] || cells[target]) return null;

  const heuristic = diagonal ? octileHeuristic : manhattanHeuristic;
  const scores = new Int32Array(size).fill(0x7fffffff);
  const parents = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new MinHeap(size);
  scores[start] = 0;
  open.push(start, heuristic(from[0], from[1], to));

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    if (current === target) {
      return pathFrom(parents, target, width);
    }
    closed[current] = 1;
    const x = current % width;
    const y = Math.floor(current / width);
    for (let direction = 0; direction < (diagonal ? 8 : 4); direction += 1) {
      const dx = DX[direction]!;
      const dy = DY[direction]!;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || cells[ny * width + nx]) continue;
      if (dx !== 0 && dy !== 0 && !options.cutCorners && (cells[y * width + x + dx] || cells[(y + dy) * width + x]))
        continue;
      const next = ny * width + nx;
      if (closed[next]) continue;
      const nextScore = scores[current]! + (dx !== 0 && dy !== 0 ? 14 : 10);
      if (nextScore >= scores[next]!) continue;
      scores[next] = nextScore;
      parents[next] = current;
      open.push(next, nextScore + heuristic(nx, ny, to));
    }
  }
  return null;
}
