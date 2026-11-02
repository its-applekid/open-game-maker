export interface SamplerState {
  tick: number;
  elapsedMs: number;
}

export interface SerializedSamplerState {
  tick: number;
  elapsedMs: number;
}

export function createSimulation(): SamplerState {
  return { tick: 0, elapsedMs: 0 };
}

export function stepSimulation(state: SamplerState, dt: number): void {
  state.tick += 1;
  state.elapsedMs += dt * 1_000;
}

export function serializeSimulation(state: SamplerState): SerializedSamplerState {
  return { tick: state.tick, elapsedMs: state.elapsedMs };
}

export function restoreSimulation(saved: SerializedSamplerState): SamplerState {
  return structuredClone(saved);
}
