import { createGameFrame, type GameFrame, type GameFrameOptions } from '@gm/host';
import type {
  DesignDoc,
  Envelope,
  GameManifest,
  GameToHost,
  HostToGame,
  Patch,
  PlacementResult,
  PlayerSettings,
  Pose,
  SaveData,
  TargetRef,
} from '@ogm/contracts/browser';
import { hostToGameSchema, SDK_PROTOCOL } from '@ogm/contracts/browser';

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
  camera(mode: 'follow' | 'free', target?: string): void;
  validatePlacement(prefab: string, pose: Pose, timeoutMs?: number): Promise<PlacementResult>;
  onPicked(callback: (targets: TargetRef[]) => void): () => void;
  onScreen(
    callback: (position: { id: string; x: number; y: number } | { id: string; offscreen: true }) => void,
  ): () => void;
  pause(): void;
  resume(): void;
  restoreSave(save: SaveData<unknown>): void;
  sendRoomMessage(envelope: Envelope<string, unknown>): void;
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
  onRoomMessage?(envelope: Envelope<string, unknown>): void;
};

export function mountGameFrame(options: MountGameFrameOptions): GameFrameController {
  const trustedOrigin = new URL(options.gamesOrigin).origin;
  let wrongOriginDrops = 0;
  let disposed = false;
  let current: Omit<GameFrameState, 'dropped'> = { bridgeState: 'connecting' };
  let frame!: FrameLike;
  type PlacementRequest = {
    prefab: string;
    pose: Pose;
    timeoutMs: number;
    resolve(result: PlacementResult): void;
  };
  const placementQueue: PlacementRequest[] = [];
  let activePlacement: (PlacementRequest & { timer: ReturnType<typeof setTimeout>; settled: boolean }) | undefined;
  let stopPlacement: () => void = () => undefined;
  let roomMessageSequence = 0;
  const emitRoomMessage = (type: GameToHost['t'], payload: unknown) => {
    roomMessageSequence += 1;
    options.onRoomMessage?.({ v: 1, id: `game-room-${roomMessageSequence}`, t: type, payload });
  };

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
      onReady: (manifest, marks) => {
        current = { bridgeState: 'ready', manifest };
        frame.send('design.apply', { rev: options.design.rev, doc: options.design.doc, patches: [] });
        emitRoomMessage('ready', { protocol: SDK_PROTOCOL, manifest, marks });
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

  const finishPlacement = (result: PlacementResult) => {
    const request = activePlacement;
    if (request === undefined) return;
    clearTimeout(request.timer);
    activePlacement = undefined;
    if (!request.settled) request.resolve(result);
    sendNextPlacement();
  };
  const sendNextPlacement = () => {
    if (disposed || activePlacement !== undefined) return;
    const request = placementQueue.shift();
    if (request === undefined) return;
    const timer = setTimeout(() => {
      if (activePlacement === undefined || activePlacement.resolve !== request.resolve) return;
      activePlacement.settled = true;
      request.resolve({ ok: false, reason: 'Placement validation timed out.' });
    }, request.timeoutMs);
    activePlacement = { ...request, timer, settled: false };
    frame.send('editor.validatePlacement', { prefab: request.prefab, pose: request.pose });
  };
  stopPlacement = frame.on('editor.placement', finishPlacement);
  const stopRoomMessages = (['net.input', 'net.snapshot', 'net.event'] as const).map((type) =>
    frame.on(type, (payload) => emitRoomMessage(type, payload)),
  );

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
    camera: (mode, target) => {
      frame.send('editor.camera', target === undefined ? { mode } : { mode, target });
    },
    validatePlacement: (prefab, pose, timeoutMs = 3_000) =>
      new Promise((resolve) => {
        placementQueue.push({ prefab, pose, timeoutMs, resolve });
        sendNextPlacement();
      }),
    onPicked: (callback) => frame.on('editor.picked', ({ targets }) => callback(targets)),
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
    sendRoomMessage: (envelope) => {
      const parsed = hostToGameSchema.safeParse(envelope);
      if (!parsed.success || parsed.data.t === 'hello') return;
      const message = parsed.data;
      const send = frame.send as (type: Exclude<HostToGame['t'], 'hello'>, payload: unknown) => void;
      send(message.t, message.payload);
    },
    onSaveWrite: (callback) => frame.on('save.write', callback),
    onEvent: (callback) => frame.on('event', ({ kind, payload }) => callback(kind, payload)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('message', observeOrigin);
      stopPlacement();
      for (const stop of stopRoomMessages) stop();
      if (activePlacement !== undefined) {
        clearTimeout(activePlacement.timer);
        if (!activePlacement.settled) activePlacement.resolve({ ok: false, reason: 'Game closed.' });
        activePlacement = undefined;
      }
      for (const request of placementQueue.splice(0)) {
        request.resolve({ ok: false, reason: 'Game closed.' });
      }
      frame.dispose();
    },
  };
}
