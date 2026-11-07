/**
 * Two-client harness page. Stands in for `apps/web` when the scenario runs without the app: one room client per page,
 * the game mounted through `@gm/host`, and the protocol-2 `net.*` envelopes forwarded both ways the way the app's bridge
 * forwarding does. Driven from Playwright through `window.__harness`; grants arrive by `join()`, never in the URL.
 *
 * The template declares `net.authority: 'per-seat'`, so the match is a protocol-2 room: a v1 room relays snapshots the
 * per-seat controller never reads, which is what left both clients without a peer avatar (#544).
 */
import { Client, type Room } from '@colyseus/sdk';
import { createGameFrame, type GameFrame } from '@gm/host';
import { PROTOCOL_VERSION, type ActionFrame, type DesignDoc, type Patch } from '@ogm/contracts/browser';
import { apply } from '@ogm/design-log/browser';

type Phase = 'editing' | 'migrating' | 'playing' | 'ended';
type Member = { userId: string; name: string; playerIndex: number; connected: boolean };
type Seat = {
  seat: number;
  userId: string;
  name: string;
  team: number;
  connected: boolean;
  ready: boolean;
  forfeited: boolean;
};
type RoomStateJson = {
  pin: { gameId: string; branchId: string; buildId: string };
  editorSessionId?: string;
  phase: Phase;
  lastRev: number;
  members: Record<string, Member>;
  presence: Record<string, unknown>;
  seats?: Seat[];
  epoch?: string;
  primarySeat?: number;
  draft?: { buildId: string; url: string };
};
type Tx = { branchId: string; rev: number; baseRev: number; actor: string; kind: 'manual'; patches: Patch[] };

export type JoinInput = {
  roomsUrl: string;
  roomId: string;
  grant: string;
  buildId: string;
  gamesOrigin: string;
};

const EMPTY_DOC: DesignDoc = { schemaVersion: 1, globals: {}, entities: {} };

/**
 * Room → game messages forwarded into the frame. `net.seat` and `ended` are not here: the seat table broadcast that
 * follows every seat event is what the SDK's per-seat mode reads, and this page records the event for its own
 * assertions.
 */
const INBOUND = new Set([
  'net.start',
  'net.start.cancel',
  'net.seats',
  'net.primary',
  'net.tick',
  'net.pause',
  'net.resume',
  'net.inputs',
  'net.state',
  'net.event',
  'net.checksum',
  'net.signal',
  'net.recovery',
]);

/** Game → room messages the page relays. The rest are the room's own control messages. */
const OUTBOUND = new Set([
  'net.inputs',
  'net.state',
  'net.event',
  'net.checksum',
  'net.recovery.request',
  'net.recovery',
  'net.signal',
]);

class Harness {
  readonly phases: { phase: Phase; at: number }[] = [];
  readonly docs = new Map<number, DesignDoc>();
  /** Every `net.seat.*` this page saw, so the scenario can assert offline and forfeit without reading another page. */
  readonly seatEvents: { event: string; seat: number; at: number }[] = [];
  readonly draftReadySent: string[] = [];
  ended: string | undefined;
  welcomeMs: number | undefined;
  you: { userId: string; playerIndex: number; seat: number | null; sessionId: string } | undefined;
  doc: DesignDoc = structuredClone(EMPTY_DOC);
  rev = 0;
  gameReady = 0;
  private room: Room | undefined;
  private frame: GameFrame | undefined;
  private frameBuildId: string | undefined;
  private input: JoinInput | undefined;
  private state: RoomStateJson | undefined;
  private seatsFromRoom: Seat[] = [];
  private startedAt = 0;

  async join(input: JoinInput): Promise<void> {
    this.input = input;
    this.startedAt = performance.now();
    const client = new Client(input.roomsUrl);
    const room = await client.joinById(input.roomId, {
      grant: input.grant,
      buildId: input.buildId,
      protocol: PROTOCOL_VERSION,
    });
    this.room = room;
    room.onMessage('*', (type, payload) => this.receive(String(type), payload as Record<string, unknown>));
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

  get seats(): Seat[] {
    return this.seatsFromRoom.length > 0 ? this.seatsFromRoom : (this.state?.seats ?? []);
  }

  /** This page's seat, or `null` when the room seated it nowhere (a spectator or a not-yet-seated joiner). */
  get seat(): number | null {
    const row = this.seats.find((candidate) => candidate.userId === this.you?.userId);
    return row?.seat ?? this.you?.seat ?? null;
  }

  /** Applies the patches locally, then sends them as the next design revision. */
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

  /** Declares this seat ready for the start check. */
  ready(ready = true): void {
    this.send('net.ready', { ready });
  }

  /** Asks the room to start the epoch; only the primary seat's request is accepted. */
  play(): number {
    const at = Date.now();
    this.send('net.start.request', { force: true });
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
    const playerIndex = this.seat ?? 0;
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

  private receive(type: string, payload: Record<string, unknown>): void {
    switch (type) {
      case 'welcome': {
        this.welcomeMs ??= performance.now() - this.startedAt;
        this.you = payload.you as Harness['you'];
        this.sync(payload.state as RoomStateJson);
        return;
      }
      case 'design.tx': {
        const tx = payload.tx as Tx;
        if (tx.rev !== this.rev + 1) return;
        this.doc = apply(this.doc, tx.patches);
        this.rev = tx.rev;
        this.docs.set(tx.rev, structuredClone(this.doc));
        return;
      }
      case 'net.seats':
      case 'net.start': {
        const rows = payload.seats as Seat[] | undefined;
        if (rows !== undefined) this.setSeatsFromRoom(rows);
        /* The seat table and the start are the controller's to act on: a page that only recorded them would leave
         * its game waiting for a match nobody told it had begun. */
        this.forward(type, payload);
        return;
      }
      case 'net.seat':
        this.seatEvents.push({ event: String(payload.event), seat: Number(payload.seat), at: Date.now() });
        return;
      case 'ended':
        this.ended = String(payload.reason);
        return;
      default:
        /* Everything the game's per-seat controller consumes goes into the frame as the bridge would carry it. */
        if (INBOUND.has(type)) this.forward(type, payload);
        return;
    }
  }

  private setSeatsFromRoom(rows: Seat[]): void {
    this.seatsFromRoom = rows.map((row) => ({ ...row }));
  }

  /**
   * Room message → game. The bridge's envelopes differ from the room's wire in two places: the room stamps a clock
   * reading as `serverTime` where the bridge calls it `serverMs`, and pause/resume carry the room's clock on the wire
   * while their bridge envelope is empty. A refused envelope is a page error, so it is counted instead.
   */
  private forward(type: string, payload: Record<string, unknown>): void {
    let mapped: unknown = payload;
    if (type === 'net.tick') {
      const tick = Number(payload.tick);
      const serverMs = Number(payload.serverTime);
      if (!Number.isFinite(tick) || !Number.isFinite(serverMs)) return;
      mapped = { tick: Math.round(tick), serverMs };
    } else if (type === 'net.pause' || type === 'net.resume') {
      mapped = {};
    }
    try {
      this.frame?.send(type as never, mapped as never);
    } catch {
      /* A bridge refusal would colour the verdict as a page error; the scenario's assertions read the room instead. */
    }
  }

  private sync(state: RoomStateJson): void {
    const previous = this.state;
    this.state = state;
    if (state.phase !== previous?.phase) {
      this.phases.push({ phase: state.phase, at: Date.now() });
      this.frame?.send('phase' as never, { phase: state.phase } as never);
      if (state.phase === 'playing') this.frame?.send('lifecycle.resume', {});
      if (state.phase === 'ended') this.frame?.send('lifecycle.pause', {});
    }
    /* The room document carries the seat table on every change; the per-seat controller reads it from here and from
     * the `net.seats` broadcast, and the two agree. `net.players` is not sent: a per-seat match learns who is playing
     * from the seat table, and a second spawn path beside it would reset an avatar at a second moment. */
    if (state.seats !== undefined) this.frame?.send('net.seats' as never, { seats: state.seats } as never);
    if (state.draft && state.draft.buildId !== this.frameBuildId) this.mountGame(state.draft.buildId);
  }

  private mountGame(buildId: string): void {
    const input = this.requireInput();
    this.frame?.dispose();
    this.frameBuildId = buildId;
    const container = document.querySelector<HTMLElement>('#game')!;
    const frame = createGameFrame({
      container,
      gamesOrigin: input.gamesOrigin,
      gameId: this.requireState().pin.gameId,
      buildId,
      build: 'draft',
      mode: 'play',
      playerIndex: this.seat ?? this.you?.playerIndex ?? 0,
      capabilities: ['multiplayer'],
      role: () => 'player',
      onReady: () => {
        this.gameReady += 1;
        if (this.state?.seats !== undefined) frame.send('net.seats' as never, { seats: this.state.seats } as never);
        if (this.state?.draft?.buildId === buildId) {
          this.send('draft.ready', { buildId });
          this.draftReadySent.push(buildId);
        }
      },
      onError: (failure) => console.error(`game frame: ${failure.code} ${failure.message}`),
    });
    for (const type of OUTBOUND) {
      frame.on(type as never, (payload: unknown) => this.send(type, payload));
    }
    frame.on('net.ready' as never, (payload: never) => this.send('net.ready', payload));
    frame.on('net.start.request' as never, (payload: never) => this.send('net.start.request', payload));
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

export type HarnessApi = Harness;

declare global {
  interface Window {
    __harness: HarnessApi;
  }
}

window.__harness = new Harness();
