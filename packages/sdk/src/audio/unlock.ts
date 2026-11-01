export type AudioStatus = 'tap' | 'on' | 'off';

type AudioNavigator = Navigator & { audioSession?: { type: string } };

interface UnlockOptions {
  context: AudioContext;
  win: Window;
  isMuted: () => boolean;
  onRunning: () => void;
}

const UNLOCK_EVENTS = ['pointerup', 'touchend', 'keydown', 'click'] as const;

export class AudioUnlock {
  private readonly listeners = new Set<(status: AudioStatus) => void>();
  private managesVisibilityState = false;
  private pending: Promise<void> | null = null;
  private visibilityTransition = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: UnlockOptions) {
    for (const event of UNLOCK_EVENTS) options.win.addEventListener(event, this.unlock, { capture: true });
    options.context.addEventListener('statechange', this.stateChanged);
    options.win.document.addEventListener('visibilitychange', this.visibilityChanged);
  }

  readonly unlock = (): Promise<void> => {
    const { context, win } = this.options;
    try {
      const audioSession = (win.navigator as AudioNavigator).audioSession;
      if (audioSession) audioSession.type = 'playback';
    } catch {
      // Audio Session is a Safari extension and can reject assignment.
    }
    if (context.state === 'running' || win.document.hidden) return Promise.resolve();
    if (this.pending) return this.pending;

    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, 22_050);
    source.connect(context.destination);
    source.start(0);
    this.pending = context
      .resume()
      .catch(() => {
        // A later user gesture or statechange can retry the unlock.
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  };

  status(): AudioStatus {
    if (this.options.isMuted()) return 'off';
    return this.options.context.state === 'running' ? 'on' : 'tap';
  }

  onStatus(callback: (status: AudioStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  refresh(): void {
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    for (const event of UNLOCK_EVENTS) this.options.win.removeEventListener(event, this.unlock, true);
    this.options.context.removeEventListener('statechange', this.stateChanged);
    this.options.win.document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.listeners.clear();
  }

  private readonly stateChanged = (): void => {
    if (this.options.context.state === 'running') this.options.onRunning();
    this.notify();
  };

  private readonly visibilityChanged = (): void => {
    const { context, win } = this.options;
    if (win.document.hidden && !this.managesVisibilityState && context.state === 'running') {
      this.managesVisibilityState = true;
    }
    if (!this.managesVisibilityState) return;

    this.visibilityTransition = this.visibilityTransition
      .catch(() => {})
      .then(async () => {
        if (this.disposed || !this.managesVisibilityState) return;
        if (win.document.hidden) {
          if (context.state === 'running') await context.suspend();
          return;
        }
        if (context.state !== 'running') await context.resume();
        if (!win.document.hidden) this.managesVisibilityState = false;
      })
      .catch(() => {
        // A later visibility event can retry after a browser lifecycle rejection.
      });
  };

  private notify(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }
}
