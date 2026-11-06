/**
 * Two-client harness page. Stands in for `apps/web` when the scenario runs without the app: one room client per page,
 * the game mounted through `@gm/host`, and the same `net.*` forwarding the app does. Driven from Playwright through
 * `window.__harness`; grants arrive by `join()`, never in the URL.
 */
import { Client, type Room } from '@colyseus/sdk';
import { createGameFrame, type GameFrame } from '@gm/host';
import { PROTOCOL_VERSION_V1, type ActionFrame, type DesignDoc, type Patch } from '@ogm/contracts/browser';
import { apply } from '@ogm/design-log/browser';

type Phase = 'editing' | 'migrating' | 'playing' | 'pausedForHost' | 'ended';
type Member = { userId: string; name: string; playerIndex: number; connected: boolean };
type RoomStateJson = {
  pin: { gameId: string; branchId: string; buildId: string };
  editorSessionId?: string;
  phase: Phase;
  lastRev: number;
  members: Record<string, Member>;
  presence: Record<string, unknown>;
  draft?: { buildId: string; url: string };
};
type Tx = { branchId: string; rev: number; baseRev: number; actor: string; kind: 'manual'; patches: Patch[] };

export type JoinInput = {
  roomsUrl: string;
  roomId: string;
  grant: string;
  buildId: string;
  gamesOrigin: string;
  /** Omitted = v1, the protocol this scenario's seven assertions were written for. */
  protocol?: number;
};

const EMPTY_DOC: DesignDoc = { schemaVersion: 1, globals: {}, entities: {} };

class Harness {
  readonly phases: { phase: Phase; at: number }[] = [];
  readonly docs = new Map<number, DesignDoc>();
  ended: string | undefined;
  welcomeMs: number | undefined;
  you: { userId: string; playerIndex: number; sessionId: string } | undefined;
  doc: DesignDoc = structuredClone(EMPTY_DOC);
  rev = 0;
  draftReadySent: string[] = [];
  gameReady = 0;
  private room: Room | undefined;
  private frame: GameFrame | undefined;
  private frameBuildId: string | undefined;
  private input: JoinInput | undefined;
  private state: RoomStateJson | undefined;
  private role: 'host' | 'peer' | undefined;
  private playersKey = '';
  inputsForwarded = 0;

  async join(input: JoinInput): Promise<void> {
    this.input = input;
    const startedAt = performance.now();
    const client = new Client(input.roomsUrl);
    const room = await client.joinById(input.roomId, {
      grant: input.grant,
      buildId: input.buildId,
      /* Pinned to v1: this scenario asserts the v1 relay and its `host-left` ending until N6 replaces it. */
      protocol: input.protocol ?? PROTOCOL_VERSION_V1,
    });
    this.room = room;
    room.onMessage('*', (type, payload) => this.receive(String(type), payload as Record<string, unknown>, startedAt));
    room.onStateChange((raw) => this.sync((raw as { toJSON(): RoomStateJson }).toJSON()));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no welcome within 10 s')), 10_000);
      const poll = setInterval(() => {
        if (this.welcomeMs === undefined) return;
        clearTimeout(timer);
        clearInterval(poll);
        resolve();
      }, 5);
    });
    this.mountGame(input.buildId);
  }

  get phase(): Phase | undefined {
    return this.state?.phase;
  }

  get pinBuildId(): string | undefined {
    return this.state?.pin.buildId;
  }

  get presence(): Record<string, unknown> | undefined {
    return this.state?.presence;
  }

  get netRole(): 'host' | 'peer' | undefined {
    return this.role;
  }

  /** Host only: applies the patches locally, then sends them as the next revision. */
  sendTx(patches: Patch[]): number {
    const pin = this.requireState().pin;
    const tx: Tx = {
      branchId: pin.branchId,
      rev: this.rev + 1,
      baseRev: this.rev,
      actor: this.you?.userId ?? 'owner',
      kind: 'manual',
      patches,
    };
    this.doc = apply(this.doc, patches);
    this.rev = tx.rev;
    this.docs.set(tx.rev, structuredClone(this.doc));
    this.send('design.tx', { tx });
    return tx.rev;
  }

  /** Sends a raw message, bypassing local checks, so the room's own validation is what gets exercised. */
  send(type: string, payload: unknown): void {
    this.requireRoom().send(type, payload);
  }

  play(): number {
    const at = Date.now();
    this.send('phase', { to: 'playing' });
    return at;
  }

  loadDraft(buildId: string): void {
    const url = `${this.requireInput().gamesOrigin}/g/${encodeURIComponent(this.requireState().pin.gameId)}/${encodeURIComponent(buildId)}/index.html`;
    this.send('draft.load', { buildId, url });
  }

  async renderGameToText(): Promise<unknown> {
    return this.requireFrame().request('test.renderGameToText', {});
  }

  /** Feeds this client's game a held move for `ms`, the way the touch overlay would. */
  async hold(actions: ActionFrame['actions'], ms: number): Promise<number> {
    const frame = this.requireFrame();
    const playerIndex = this.you?.playerIndex ?? 0;
    const until = performance.now() + ms;
    let sent = 0;
    while (performance.now() < until) {
      frame.send('input.frame', { playerIndex, tick: 0, source: 'touch', actions });
      sent += 1;
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    frame.send('input.frame', { playerIndex, tick: 0, source: 'touch', actions: { move: 0 } });
    return sent;
  }

  async leave(): Promise<void> {
    await this.room?.leave(true);
  }

  private receive(type: string, payload: Record<string, unknown>, startedAt: number): void {
    switch (type) {
      case 'welcome':
        this.welcomeMs ??= performance.now() - startedAt;
        this.you = payload.you as Harness['you'];
        this.sync(payload.state as RoomStateJson);
        return;
      case 'design.tx': {
        const tx = payload.tx as Tx;
        if (tx.rev !== this.rev + 1) return;
        this.doc = apply(this.doc, tx.patches);
        this.rev = tx.rev;
        this.docs.set(tx.rev, structuredClone(this.doc));
        return;
      }
      case 'input':
        if (this.role !== 'host') return;
        this.frame?.send('net.input', { f: pickInput(payload.f as Record<string, unknown>) } as never);
        return;
      case 'snapshot':
        if (this.role !== 'peer') return;
        this.frame?.send('net.snapshot', {
          seq: payload.seq as number,
          tick: payload.tick as number,
          data: toBase64(payload.data as Uint8Array),
        });
        return;
      case 'ended':
        this.ended = String(payload.reason);
        return;
      default:
        return;
    }
  }

  private sync(state: RoomStateJson): void {
    const previous = this.state;
    this.state = state;
    if (state.phase !== previous?.phase) {
      this.phases.push({ phase: state.phase, at: Date.now() });
      this.frame?.send('phase', { phase: state.phase });
      if (state.phase === 'pausedForHost' || state.phase === 'ended') this.frame?.send('lifecycle.pause', {});
      if (state.phase === 'playing') this.frame?.send('lifecycle.resume', {});
    }
    if (this.room) {
      const role = state.editorSessionId === this.room.sessionId ? 'host' : 'peer';
      if (role !== this.role && state.editorSessionId !== undefined) {
        this.role = role;
        this.frame?.send('net.role', { role });
      }
    }
    this.forwardPlayers();
    if (state.draft && state.draft.buildId !== this.frameBuildId) this.mountGame(state.draft.buildId);
  }

  private forwardPlayers(): void {
    if (!this.frame || !this.state || !this.you) return;
    const players = Object.values(this.state.members)
      .map(({ playerIndex, name, connected }) => ({ playerIndex, name, connected }))
      .sort((left, right) => left.playerIndex - right.playerIndex);
    const key = JSON.stringify([this.you.playerIndex, players]);
    if (key === this.playersKey) return;
    this.playersKey = key;
    this.frame.send('net.players', { local: this.you.playerIndex, players });
  }

  private mountGame(buildId: string): void {
    const input = this.requireInput();
    this.frame?.dispose();
    this.frameBuildId = buildId;
    this.playersKey = '';
    const container = document.querySelector<HTMLElement>('#game')!;
    const frame = createGameFrame({
      container,
      gamesOrigin: input.gamesOrigin,
      gameId: this.requireState().pin.gameId,
      buildId,
      build: 'draft',
      mode: 'play',
      playerIndex: this.you?.playerIndex ?? 0,
      capabilities: ['multiplayer'],
      role: () => (this.role === 'host' ? 'owner' : 'player'),
      onReady: () => {
        this.gameReady += 1;
        if (this.role) frame.send('net.role', { role: this.role });
        this.forwardPlayers();
        if (this.state?.draft?.buildId === buildId) {
          this.send('draft.ready', { buildId });
          this.draftReadySent.push(buildId);
        }
      },
      onError: (failure) => console.error(`game frame: ${failure.code} ${failure.message}`),
    });
    frame.on('net.input', ({ f }) => {
      if (this.role !== 'peer') return;
      this.inputsForwarded += 1;
      this.send('input', { f });
    });
    frame.on('net.snapshot', ({ seq, tick, data }) => {
      if (this.role !== 'host') return;
      this.send('snapshot', { seq, tick, data: fromBase64(data) });
    });
    this.frame = frame;
  }

  private requireRoom(): Room {
    if (!this.room) throw new Error('not joined');
    return this.room;
  }

  private requireState(): RoomStateJson {
    if (!this.state) throw new Error('no room state yet');
    return this.state;
  }

  private requireInput(): JoinInput {
    if (!this.input) throw new Error('not joined');
    return this.input;
  }

  private requireFrame(): GameFrame {
    if (!this.frame) throw new Error('no game frame');
    return this.frame;
  }
}

function pickInput(frame: Record<string, unknown>) {
  const { seq, tick, axes, buttons, playerIndex } = frame;
  return { seq, tick, axes, buttons, playerIndex };
}

function toBase64(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export type HarnessApi = Harness;

declare global {
  interface Window {
    __harness: HarnessApi;
  }
}

window.__harness = new Harness();
