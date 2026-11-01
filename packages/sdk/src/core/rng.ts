export interface Rng {
  next(): number;
  int(n: number): number;
  seed(): number;
  setSeed(seed: number): void;
}

export interface RngState {
  seed: number;
  state: number;
}

export class SeededRng implements Rng {
  private initialSeed = 1;
  private state = 1;

  constructor(seed = 1) {
    this.setSeed(seed);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError('rng bound must be a positive integer');
    return Math.floor(this.next() * n);
  }

  seed(): number {
    return this.initialSeed;
  }

  setSeed(seed: number): void {
    if (!Number.isFinite(seed)) throw new RangeError('rng seed must be finite');
    this.initialSeed = seed >>> 0 || 1;
    this.state = this.initialSeed;
  }

  snapshot(): RngState {
    return { seed: this.initialSeed, state: this.state };
  }

  restore(snapshot: RngState): void {
    this.initialSeed = snapshot.seed >>> 0;
    this.state = snapshot.state >>> 0;
  }
}
