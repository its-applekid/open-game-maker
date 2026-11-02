import type { ActionFrame, GameInstance, GameModule, Patch, SaveData } from '@ogm/contracts';
import { z } from 'zod';

import {
  createSimulation,
  restoreSimulation,
  serializeSimulation,
  stepSimulation,
  type SamplerState,
  type SerializedSamplerState,
} from './state.js';

export const designSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  globals: z
    .object({
      'sampler.seed': z.number().int().nonnegative().default(15_601),
    })
    .default({ 'sampler.seed': 15_601 }),
});

export type SamplerDesign = z.infer<typeof designSchema>;
export type SamplerSave = SerializedSamplerState;

export const defaultDesign: SamplerDesign = designSchema.parse({});

export interface SamplerContext {
  design: SamplerDesign;
  state: SamplerState;
  paused: boolean;
  disposed: boolean;
  lifecycle?: {
    pause(): void;
    resume(): void;
    dispose(): void;
    restartScene(data?: unknown): void;
  };
  advance(dt: number, frames: ActionFrame[]): void;
}

let activeContext: SamplerContext | undefined;

export function getGameContext(): SamplerContext {
  if (!activeContext) throw new Error('game context is not mounted');
  return activeContext;
}

export function connectPhaserLifecycle(lifecycle: SamplerContext['lifecycle']): void {
  getGameContext().lifecycle = lifecycle;
}

export const game: GameModule<SamplerDesign, SamplerSave> = {
  manifest: {
    id: 'smallscaleint-sampler',
    sdk: '*',
    title: 'SmallScaleInt Sampler',
    inputs: { actions: {} },
    presentation: { orientation: 'landscape', minLogical: { w: 480, h: 300 }, fit: 'fixed' },
    view: 'iso',
    dimension: '2d',
    capabilities: [],
    palette: { categories: [], items: [] },
    tools: ['select'],
    gizmos: {},
    grid: { size: 32, units: 'px' },
    saves: true,
    overrides: { aliases: {}, retired: [] },
  },
  designSchema,
  controls: [],
  async mount(_host, initialDesign, save): Promise<GameInstance<SamplerDesign, SamplerSave>> {
    const context: SamplerContext = {
      design: structuredClone(initialDesign),
      state: save ? restoreSimulation(save.data) : createSimulation(),
      paused: false,
      disposed: false,
      advance(dt) {
        if (context.paused || context.disposed) return;
        stepSimulation(context.state, dt);
      },
    };
    activeContext = context;

    return {
      pause() {
        context.paused = true;
        context.lifecycle?.pause();
      },
      resume() {
        context.paused = false;
        context.lifecycle?.resume();
      },
      dispose() {
        if (context.disposed) return;
        context.disposed = true;
        context.lifecycle?.dispose();
        if (activeContext === context) activeContext = undefined;
      },
      applyDesign(next: SamplerDesign, patches: Patch[]) {
        context.design = structuredClone(next);
        const restart = patches.some(({ path }) => path[0] === 'globals');
        if (restart) context.lifecycle?.restartScene();
        return restart ? 'restart-scene' : 'live';
      },
      serialize(): SaveData<SamplerSave> {
        return { saveSchemaVersion: 1, data: serializeSimulation(context.state) };
      },
      restore(saved) {
        context.state = restoreSimulation(saved.data);
      },
      migrate(previous) {
        const data = previous.data as Partial<SerializedSamplerState>;
        return {
          saveSchemaVersion: 1,
          data: {
            tick: Number.isInteger(data.tick) && Number(data.tick) >= 0 ? Number(data.tick) : 0,
            elapsedMs: Number.isFinite(data.elapsedMs) && Number(data.elapsedMs) >= 0 ? Number(data.elapsedMs) : 0,
          },
        };
      },
      net: {
        spawn() {},
        despawn() {},
        snapshot() {
          return { tick: context.state.tick, state: serializeSimulation(context.state) };
        },
        applySnapshot(snapshot) {
          context.state = restoreSimulation(snapshot.state as SerializedSamplerState);
        },
        hud() {
          return { tick: context.state.tick, elapsedMs: context.state.elapsedMs };
        },
      },
    };
  },
};
