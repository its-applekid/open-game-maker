import type { Tier } from '@ogm/contracts';

export const FRAME_SAMPLE_COUNT = 60;
export const SLOW_FRAME_MEDIAN_MS = 22;
export const ADAPTED_TIER_STORAGE_KEY = 'gm.tier.adapted';

const DPR_STEPS = [2, 1.5, 1.25, 1] as const;

export interface FrameGovernorState {
  tier: Tier;
  dpr: number;
  effects: boolean;
}

export interface FrameGovernorOptions {
  tier: Tier;
  dpr: number;
  storage?: Storage;
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function restoredState(storage: Storage | undefined): { dpr: number; effects: boolean } | undefined {
  try {
    if (!storage) return undefined;
    const raw = storage.getItem(ADAPTED_TIER_STORAGE_KEY);
    if (!raw) return undefined;

    const value = JSON.parse(raw) as { dpr?: unknown; effects?: unknown };
    if (typeof value.dpr !== 'number' || !Number.isFinite(value.dpr) || value.dpr < 1) return undefined;
    if (typeof value.effects !== 'boolean') return undefined;
    return { dpr: value.dpr, effects: value.effects };
  } catch {
    return undefined;
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = sorted.length / 2;
  return (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function lowerDpr(current: number): number | undefined {
  return DPR_STEPS.find((step) => step < current);
}

export class FrameGovernor {
  readonly #samples: number[] = [];
  readonly #listeners = new Set<(state: FrameGovernorState) => void>();
  readonly #storage: Storage | undefined;
  #state: FrameGovernorState;

  constructor(options: FrameGovernorOptions) {
    this.#storage = options.storage ?? browserStorage();
    const restored = restoredState(this.#storage);
    this.#state = {
      tier: options.tier,
      dpr: Math.min(options.dpr, restored?.dpr ?? options.dpr),
      effects: restored?.effects ?? true,
    };
  }

  get state(): FrameGovernorState {
    return { ...this.#state };
  }

  onChange(listener: (state: FrameGovernorState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  observe(frameMs: number): void {
    if (!this.#state.effects) return;

    this.#samples.push(frameMs);
    if (this.#samples.length < FRAME_SAMPLE_COUNT) return;

    const sampleMedian = median(this.#samples);
    this.#samples.length = 0;
    if (sampleMedian <= SLOW_FRAME_MEDIAN_MS) return;

    const dpr = lowerDpr(this.#state.dpr);
    this.#state = dpr ? { ...this.#state, dpr } : { ...this.#state, effects: false };
    this.#persist();
    for (const listener of this.#listeners) listener(this.state);
  }

  #persist(): void {
    try {
      this.#storage?.setItem(
        ADAPTED_TIER_STORAGE_KEY,
        JSON.stringify({ dpr: this.#state.dpr, effects: this.#state.effects }),
      );
    } catch {
      // Adaptation still applies for the session when storage is unavailable.
    }
  }
}
