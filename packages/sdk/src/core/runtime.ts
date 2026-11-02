import type { ActionFrame, GameInstance, HostApi } from '@ogm/contracts';

import { FixedClock, type Clock, type StepListener } from './clock.js';
import { EventRing } from './events.js';
import type { SdkHostApi } from './host-api.js';
import { SeededRng, type Rng } from './rng.js';
import type { RuntimeHooks } from '../test/hooks.js';
import { InputMerger, type InputMergerOptions } from '../input/merger.js';

export type BuildKind = 'draft' | 'test' | 'published';
export type GameMode = 'play' | 'edit';
export type RenderInfo = ReturnType<RuntimeHooks['renderInfo']>;

export interface Runtime<D, S> {
  readonly instance: GameInstance<D, S>;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly hooks: RuntimeHooks;
  readonly host: HostApi;
  readonly build: BuildKind;
  readonly mode: GameMode;
  readonly localPlayerIndex: number;
  onFrame(callback: (dt: number) => void): () => void;
  onStep(callback: StepListener): () => void;
  onNet(callback: (type: string, payload: unknown) => void): () => void;
  attachInput(options: RuntimeInputOptions): InputMerger;
  setRenderInfoProvider(provider: () => RenderInfo): void;
  dispose(): void;
}

export type RuntimeInputOptions = Omit<InputMergerOptions, 'bridge' | 'localPlayerIndex'> & {
  localPlayerIndex?: number;
};

const zeroRenderInfo = (): RenderInfo => ({
  calls: 0,
  triangles: 0,
  frameMs: 0,
  textureBytes: 0,
  backend: 'headless',
});

export class RuntimeImpl<D, S> implements Runtime<D, S> {
  readonly clock: FixedClock;
  readonly rng: SeededRng;
  hooks!: RuntimeHooks;
  readonly players: unknown[] = [];
  private currentMode: GameMode;
  private readonly frameListeners = new Set<(dt: number) => void>();
  private readonly netListeners = new Set<(type: string, payload: unknown) => void>();
  private readonly cleanupCallbacks = new Set<() => void>();
  private renderInfoProvider: () => RenderInfo = zeroRenderInfo;
  private liveFrame: number | undefined;
  private lastFrameMs: number | undefined;
  private inputMerger: InputMerger | undefined;
  private replayingInput = false;
  private currentLocalPlayerIndex = 0;
  private readonly pendingHostFrames: ActionFrame[] = [];
  private disposed = false;

  constructor(
    readonly instance: GameInstance<D, S>,
    readonly host: SdkHostApi<S>,
    readonly build: BuildKind,
    mode: GameMode,
    readonly events: EventRing,
    private readonly closeBridge: () => void,
    clock = new FixedClock(),
    rng = new SeededRng(),
  ) {
    this.clock = clock;
    this.rng = rng;
    this.currentMode = mode;
    this.clock.onStep((_dt, frames) => {
      if (this.inputMerger && !this.replayingInput) {
        for (const frame of this.pendingHostFrames.splice(0)) this.inputMerger.acceptHostFrame(frame);
        for (const frame of frames.splice(0)) this.inputMerger.inject(frame);
        frames.push(...this.inputMerger.sample(this.clock.tick));
      } else if (!this.replayingInput) {
        frames.push(...this.pendingHostFrames.splice(0));
      }
      this.host.dispatchInput(frames);
    });
  }

  get mode(): GameMode {
    return this.currentMode;
  }

  get localPlayerIndex(): number {
    return this.currentLocalPlayerIndex;
  }

  attachHooks(hooks: RuntimeHooks): void {
    this.hooks = hooks;
  }

  setMode(mode: GameMode): void {
    this.currentMode = mode;
  }

  onFrame(callback: (dt: number) => void): () => void {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }

  onStep(callback: StepListener): () => void {
    return this.clock.onStep(callback);
  }

  onNet(callback: (type: string, payload: unknown) => void): () => void {
    this.netListeners.add(callback);
    return () => this.netListeners.delete(callback);
  }

  attachInput(options: RuntimeInputOptions): InputMerger {
    this.inputMerger?.dispose();
    const merger = new InputMerger({
      ...options,
      localPlayerIndex: options.localPlayerIndex ?? this.currentLocalPlayerIndex,
      bridge: {
        send: (_type, payload) => this.host.sendRawKey(payload),
      },
    });
    this.inputMerger = merger;
    return merger;
  }

  acceptHostFrame(frame: ActionFrame): void {
    this.pendingHostFrames.push(frame);
  }

  setLocalPlayerIndex(playerIndex: number): void {
    this.currentLocalPlayerIndex = playerIndex;
    this.inputMerger?.setLocalPlayerIndex(playerIndex);
  }

  setInputReplay(replaying: boolean): void {
    this.replayingInput = replaying;
  }

  emitNet(type: string, payload: unknown): void {
    for (const listener of this.netListeners) listener(type, payload);
  }

  inject(frame: ActionFrame): void {
    this.clock.inject(frame);
  }

  advance(ms: number, render = true): number {
    const steps = this.clock.advance(ms);
    if (render && steps > 0) this.render();
    return steps;
  }

  render(): void {
    for (const listener of this.frameListeners) listener(this.clock.dt);
  }

  setRenderInfoProvider(provider: () => RenderInfo): void {
    this.renderInfoProvider = provider;
  }

  renderInfo(): RenderInfo {
    return this.renderInfoProvider();
  }

  addCleanup(callback: () => void): void {
    this.cleanupCallbacks.add(callback);
  }

  startLiveLoop(): void {
    if (typeof requestAnimationFrame !== 'function' || this.liveFrame !== undefined) return;
    const frame = (nowMs: number) => {
      if (this.disposed) return;
      if (this.lastFrameMs === undefined) this.lastFrameMs = nowMs;
      const elapsed = Math.min(50, Math.max(0, nowMs - this.lastFrameMs));
      this.lastFrameMs = nowMs;
      this.clock.advance(elapsed);
      this.render();
      this.liveFrame = requestAnimationFrame(frame);
    };
    this.liveFrame = requestAnimationFrame(frame);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.liveFrame !== undefined && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this.liveFrame);
    this.liveFrame = undefined;
    this.clock.pause();

    let firstFailure: unknown;
    let failed = false;
    const attempt = (callback: () => void) => {
      try {
        callback();
      } catch (error) {
        if (failed) return;
        failed = true;
        firstFailure = error;
      }
    };

    attempt(() => this.instance.dispose());
    attempt(() => this.inputMerger?.dispose());
    this.inputMerger = undefined;
    this.pendingHostFrames.length = 0;
    for (const cleanup of this.cleanupCallbacks) attempt(cleanup);
    this.cleanupCallbacks.clear();
    attempt(this.closeBridge);
    if (failed) throw firstFailure;
  }
}
