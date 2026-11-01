import type {
  ActionValue,
  GameInstance,
  GameModule,
  HostApi,
  Patch,
  PlayerSettings,
  SaveData,
  Viewport,
} from '@ogm/contracts';
import { z } from 'zod';

export interface CounterDesign {
  speed: number;
  entities: Record<string, { x: number; y: number }>;
}

export interface CounterSave {
  counter: number;
  entities: Record<string, { x: number; y: number }>;
  padding?: string;
  players: { playerIndex: number; playerId: string }[];
}

export interface CounterMetrics {
  applyCalls: number;
  disposed: number;
  lastSettings?: PlayerSettings;
  lastViewport?: Viewport;
  restoreCalls: SaveData<CounterSave>[];
}

const designSchema = z.object({
  speed: z.number().min(1).max(10).default(1),
  entities: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
});

const manifest = {
  id: 'counter',
  sdk: '*',
  title: 'Counter',
  inputs: { actions: { go: 'button' as const } },
  presentation: { orientation: 'any' as const, minLogical: { w: 320, h: 180 }, fit: 'responsive' as const },
  view: 'topdown' as const,
  dimension: '2d' as const,
  capabilities: [],
  palette: { categories: [], items: [] },
  tools: [],
  gizmos: {},
  saves: true,
  overrides: { aliases: {}, retired: [] },
};

export function createCounterGame(options: { migrate?: boolean } = {}): {
  metrics: CounterMetrics;
  module: GameModule<CounterDesign, CounterSave>;
} {
  const metrics: CounterMetrics = { applyCalls: 0, disposed: 0, restoreCalls: [] };

  const module: GameModule<CounterDesign, CounterSave> = {
    manifest,
    designSchema,
    controls: [
      {
        id: 'player.speed',
        label: 'Speed',
        scope: 'global',
        path: '/speed',
        widget: { kind: 'slider', min: 1, max: 10 },
        default: 1,
      },
      {
        id: 'entity.place',
        label: 'Entity',
        scope: 'global',
        path: '/entities',
        widget: { kind: 'place', prefab: 'counter' },
        default: {},
      },
    ],
    async mount(host: HostApi, design: CounterDesign, save?: SaveData<CounterSave>) {
      let currentDesign = structuredClone(design);
      let state: CounterSave = save?.data
        ? structuredClone(save.data)
        : { counter: 0, entities: structuredClone(design.entities), players: [] };

      host.input.on('go', (value: ActionValue) => {
        if (value === true) state.counter += currentDesign.speed;
      });
      host.viewport.onChange((viewport) => {
        metrics.lastViewport = viewport;
      });
      host.settings.onChange((settings) => {
        metrics.lastSettings = settings;
      });

      const instance: GameInstance<CounterDesign, CounterSave> & { probes(): Record<string, number> } = {
        pause() {},
        resume() {},
        dispose() {
          metrics.disposed += 1;
        },
        applyDesign(next: CounterDesign, patches: Patch[]) {
          metrics.applyCalls += 1;
          currentDesign = structuredClone(next);
          state.entities = structuredClone(next.entities);
          return patches.every(({ path }) => path[0] === 'speed') ? 'live' : 'restart-scene';
        },
        serialize() {
          return { saveSchemaVersion: 1, data: structuredClone(state) };
        },
        restore(saveData: SaveData<CounterSave>) {
          metrics.restoreCalls.push(structuredClone(saveData));
          state = structuredClone(saveData.data);
        },
        pick(nx: number, ny: number) {
          return nx === 0.5 && ny === 0.5 ? [{ id: 'counter-1', kind: 'entity' as const }] : [];
        },
        probes() {
          return { counter: state.counter };
        },
        net: {
          spawn(playerIndex: number, playerId: string) {
            state.players.push({ playerIndex, playerId });
          },
          despawn(playerId: string) {
            state.players = state.players.filter((player) => player.playerId !== playerId);
          },
          snapshot() {
            return { tick: state.counter, state: structuredClone(state) };
          },
          applySnapshot(snapshot: { tick: number; state: unknown }) {
            state = structuredClone(snapshot.state as CounterSave);
          },
          hud() {
            return { counter: state.counter };
          },
        },
      };

      if (options.migrate !== false) {
        instance.migrate = (previous) => ({
          saveSchemaVersion: 1,
          data: {
            counter: Number((previous.data as { counter?: unknown }).counter ?? 0),
            entities: {},
            players: [],
          },
        });
      }
      return instance;
    },
  };

  return { metrics, module };
}
