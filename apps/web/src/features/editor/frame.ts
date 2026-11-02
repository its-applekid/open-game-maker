import { createGameFrame, type GameFrame, type GameFrameOptions } from '@gm/host';
import type {
  DesignDoc,
  GameManifest,
  Patch,
  PlacementResult,
  PlayerSettings,
  Pose,
  SaveData,
  TargetRef,
} from '@ogm/contracts';

type FrameLike = Pick<GameFrame, 'dispose' | 'on' | 'send' | 'setMode' | 'setSettings'> & {
  bridge: Pick<GameFrame['bridge'], 'dropped'>;
};

export type GameFrameState = {
  bridgeState: 'connecting' | 'ready' | 'error';
  dropped: number;
  manifest?: GameManifest;
  error?: string;
};

export type GameFrameController = {
  state(): GameFrameState;
  setMode(mode: 'play' | 'edit'): void;
  setSettings(settings: PlayerSettings): void;
  applyDesign(rev: number, doc: DesignDoc, patches: readonly Patch[]): void;
  pick(x: number, y: number): void;
  select(ids: readonly string[]): void;
  validatePlacement(prefab: string, pose: Pose): void;
  onPicked(callback: (targets: TargetRef[]) => void): () => void;
  onPlacement(callback: (result: PlacementResult) => void): () => void;
  onScreen(
    callback: (position: { id: string; x: number; y: number } | { id: string; offscreen: true }) => void,
  ): () => void;
  pause(): void;
  resume(): void;
  restoreSave(save: SaveData<unknown>): void;
  onSaveWrite(callback: (save: SaveData<unknown>) => void): () => void;
  onEvent(callback: (kind: 'achievement' | 'analytics' | 'checkpoint', payload: unknown) => void): () => void;
  dispose(): void;
};

export type MountGameFrameOptions = {
  container: HTMLElement;
  gamesOrigin: string;
  gameId: string;
  buildId: string;
  mode: 'play' | 'edit';
  design: { rev: number; doc: DesignDoc };
  build?: 'draft' | 'test' | 'published';
  create?(options: GameFrameOptions): FrameLike;
  onState?(state: GameFrameState): void;
  onSaveWrite?(payload: { saveSchemaVersion: number; data: unknown }): void;
  onEvent?(kind: 'achievement' | 'analytics' | 'checkpoint', payload: unknown): void;
};

export function mountGameFrame(options: MountGameFrameOptions): GameFrameController {
  const trustedOrigin = new URL(options.gamesOrigin).origin;
  let wrongOriginDrops = 0;
  let disposed = false;
  let current: Omit<GameFrameState, 'dropped'> = { bridgeState: 'connecting' };
  let frame!: FrameLike;

  const snapshot = (): GameFrameState => ({ ...current, dropped: frame.bridge.dropped + wrongOriginDrops });
  const publish = () => options.onState?.(snapshot());
  const observeOrigin = (event: MessageEvent) => {
    if (event.origin === trustedOrigin) return;
    wrongOriginDrops += 1;
    publish();
  };
  window.addEventListener('message', observeOrigin);

  try {
    frame = (options.create ?? createGameFrame)({
      container: options.container,
      gamesOrigin: trustedOrigin,
      gameId: options.gameId,
      buildId: options.buildId,
      build: options.build ?? 'draft',
      mode: options.mode,
      playerIndex: 0,
      capabilities: [],
      role: () => 'owner',
      readyTimeoutMs: 10_000,
      onReady: (manifest) => {
        current = { bridgeState: 'ready', manifest };
        frame.send('design.apply', { rev: options.design.rev, doc: options.design.doc, patches: [] });
        publish();
      },
      onSaveWrite: options.onSaveWrite,
      onEvent: options.onEvent,
      onError: (failure) => {
        current = { bridgeState: 'error', error: failure.message };
        publish();
      },
    });
  } catch (error) {
    window.removeEventListener('message', observeOrigin);
    throw error;
  }

  return {
    state: snapshot,
    setMode: (mode) => frame.setMode(mode),
    setSettings: (settings) => frame.setSettings(settings),
    applyDesign: (rev, doc, patches) => {
      frame.send('design.apply', { rev, doc, patches: [...patches] });
    },
    pick: (x, y) => {
      frame.send('editor.pick', { x, y });
    },
    select: (ids) => {
      frame.send('editor.select', { ids: [...ids] });
    },
    validatePlacement: (prefab, pose) => {
      frame.send('editor.validatePlacement', { prefab, pose });
    },
    onPicked: (callback) => frame.on('editor.picked', ({ targets }) => callback(targets)),
    onPlacement: (callback) => frame.on('editor.placement', callback),
    onScreen: (callback) => frame.on('editor.screen', callback),
    pause: () => {
      frame.send('lifecycle.pause', {});
    },
    resume: () => {
      frame.send('lifecycle.resume', {});
    },
    restoreSave: (save) => {
      frame.send('save.restore', save);
    },
    onSaveWrite: (callback) => frame.on('save.write', callback),
    onEvent: (callback) => frame.on('event', ({ kind, payload }) => callback(kind, payload)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('message', observeOrigin);
      frame.dispose();
    },
  };
}
