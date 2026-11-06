/**
 * Four-seat multi-client harness page (N6, research #499 §4.5).
 *
 * One room client per page on protocol 2, the game mounted through `@gm/host`, and the v2 `net.*` envelopes forwarded
 * both ways the way `apps/web`'s bridge forwarding does. The link simulator wraps *this page's* own room socket, so an
 * impairment is applied once, by the sender, and the room's membership and schema-sync frames are never touched.
 *
 * Driven from Playwright through `window.__harness`; grants arrive by `join()`, never in the URL or the game iframe.
 */
import { Client, type Room } from '@colyseus/sdk';
import { createGameFrame, type GameFrame } from '@gm/host';
import type { ChannelName, Transport, TransportHandlers, TransportStats } from '@ogm/contracts';
import { PROTOCOL_VERSION, type ActionFrame, type DesignDoc, type Patch } from '@ogm/contracts/browser';
import { apply } from '@ogm/design-log/browser';

import { CLEAN_LINK, type LinkConfig } from '../../src/link/schedule.js';
import { LinkTransport } from '../../src/link/transport.js';

/** `ALL_SEATS` from `@ogm/contracts`: the relay is not keyed to one peer. Restated so the page bundle stays small. */
const RELAY_SEAT = -1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Phase = 'editing' | 'migrating' | 'playing' | 'ended';
type Tx = { branchId: string; rev: number; baseRev: number; actor: string; kind: 'manual'; patches: Patch[] };
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
  phase: Phase;
  lastRev: number;
  members: Record<string, { userId: string; name: string; playerIndex: number; connected: boolean }>;
  seats?: Seat[];
  epoch?: string;
  primarySeat?: number;
  rulesetHash?: string;
  draft?: { buildId: string; url: string };
};

export type JoinInput = {
  roomsUrl: string;
  roomId: string;
  grant: string;
  buildId: string;
  gamesOrigin: string;
};

/** What one page can honestly report about its own seat: its metrics, the room facts, and the path it measured. */
export type HarnessSnapshot = {
  seat: number | null;
  mode: 'host' | 'per-seat' | 'rollback';
  epoch: string;
  tick: number;
  buildId: string;
  rulesetHash?: string;
  rttMs: number;
  jitterMs: number;
  lossPct: number;
  clockOffsetMs: number;
  lateStartTicks: number;
  inputDelayTicks: number;
  inputGaps: number;
  localResponseMs: number;
  remoteUpdateMs: number;
  eventDelayMs: number;
  desyncs: number;
  recoveries: number;
  hardResyncs: number;
  droppedBytes: number;
  oversized: number;
};

/** The two channels the simulator delays only (design §6.1); everything else is relayed untouched. */
const CHANNELS: Record<string, ChannelName> = {
  'net.inputs': 'input',
  'net.state': 'state',
  'net.event': 'event',
};

/** Game → room messages the link simulator carries. */
const OUTBOUND = new Set([
  'net.inputs',
  'net.state',
  'net.event',
  'net.checksum',
  'net.recovery.request',
  'net.recovery',
  'net.signal',
]);
/** Room → game messages the harness forwards into the frame. */
const INBOUND = new Set([
  'net.start',
  'net.start.cancel',
  'net.seats',
  'net.seat',
  'net.primary',
  'net.tick',
  'net.pause',
  'net.resume',
  'net.epoch.end',
  'net.inputs',
  'net.state',
  'net.event',
  'net.checksum',
  'net.signal',
  'net.recovery',
]);

const EMPTY_DOC: DesignDoc = { schemaVersion: 1, globals: {}, entities: {} };

class Harness {
  readonly docs = new Map<number, DesignDoc>();
  readonly draftReadySent: string[] = [];
  /** Every `net.seat.*` this page saw, so the scenario can assert offline/forfeit without reading another page. */
  readonly seatEvents: { event: string; seat: number; at: number }[] = [];
  ended: string | undefined;
  welcomeMs: number | undefined;
  gameReady = 0;
  doc: DesignDoc = structuredClone(EMPTY_DOC);
  rev = 0;
  /** How many times this page had to rejoin after its socket went away: the seat's own recovery count. */
  recoveries = 0;
  private room: Room | undefined;
  private frame: GameFrame | undefined;
  private link: LinkTransport | undefined;
  private handlers: TransportHandlers | undefined;
  private input: JoinInput | undefined;
  private state: RoomStateJson | undefined;
  private frameBuildId: string | undefined;
  private config: LinkConfig = CLEAN_LINK;
  private joins = 0;
  private playersKey = '';

  async join(input: JoinInput): Promise<void> {
    this.input = input;
    const startedAt = performance.now();
    await this.connect(input.grant);
    this.welcomeMs ??= performance.now() - startedAt;
    this.mountGame(input.buildId);
  }

  get phase(): Phase | undefined {
    return this.state?.phase;
  }

  get pinBuildId(): string | undefined {
    return this.state?.pin.buildId;
  }

  get seats(): Seat[] {
    return this.seatsFromRoom.length > 0 ? this.seatsFromRoom : (this.state?.seats ?? []);
  }

  get epoch(): string | undefined {
    return this.epochFromRoom ?? this.state?.epoch;
  }

  get primarySeat(): number | undefined {
    return this.primaryFromRoom ?? this.state?.primarySeat;
  }

  /** The simulator's profile, echoed into the report so a failing run reproduces from its seed. */
  linkConfig(): LinkConfig {
    return this.config;
  }

  /** Applies a profile to *new* sends; the solver keeps the applied counters from here on. */
  setLink(config: LinkConfig): void {
    this.config = config;
    this.link = this.buildLink();
  }

  /** The scheduled disconnect: close this seat's socket, then rejoin the same seat after `downMs`. */
  drop(downMs: number): void {
    this.link?.drop(downMs);
  }

  ready(ready = true): void {
    this.send('net.ready', { ready });
  }

  start(force = true): void {
    this.send('net.start.request', force ? { force: true } : {});
  }

  /** Applies the patches locally, then sends them as the next design revision. */
  sendTx(patches: Patch[]): number {
    const tx: Tx = {
      branchId: this.requireState().pin.branchId,
      rev: this.rev + 1,
      baseRev: this.rev,
      actor: 'creator',
      kind: 'manual',
      patches,
    };
    this.doc = apply(this.doc, patches);
    this.rev = tx.rev;
    this.docs.set(tx.rev, structuredClone(this.doc));
    this.send('design.tx', { tx });
    return tx.rev;
  }

  /** Sends a raw room message, bypassing local checks, so the room's own validation is what gets exercised. */
  send(type: string, payload: unknown): void {
    this.requireRoom().send(type, payload);
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

  /** This page's own view of its seat: the game's diagnostics plus the room facts and the measured path. */
  async netMetrics(): Promise<HarnessSnapshot> {
    const reply = (await this.frame?.request('test.renderInfo', {}).catch(() => undefined)) as
      { net?: Record<string, unknown> } | undefined;
    const net = reply?.net ?? {};
    const number = (key: string, fallback = 0): number => {
      const value = net[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    };
    const stats = this.link?.stats();
    const mode = net.mode;

    return {
      seat: this.seat,
      mode: mode === 'per-seat' || mode === 'rollback' || mode === 'host' ? mode : 'host',
      epoch: typeof net.epoch === 'string' && net.epoch !== '' ? net.epoch : (this.epoch ?? ''),
      tick: number('tick'),
      buildId: this.pinBuildId ?? '',
      ...(this.state?.rulesetHash === undefined ? {} : { rulesetHash: this.state.rulesetHash }),
      rttMs: stats?.rttMs ?? 0,
      jitterMs: stats?.jitterMs ?? 0,
      lossPct: stats?.lossPct ?? 0,
      clockOffsetMs: number('clockOffsetMs'),
      lateStartTicks: number('lateStartTicks'),
      inputDelayTicks: number('inputDelayTicks'),
      inputGaps: number('inputGaps'),
      localResponseMs: number('localResponseMs'),
      remoteUpdateMs: number('remoteUpdateMs'),
      eventDelayMs: number('eventDelayMs'),
      desyncs: number('desyncs'),
      recoveries: Math.max(number('recoveries'), this.recoveries),
      hardResyncs: number('hardResyncs'),
      droppedBytes: number('droppedBytes'),
      oversized: number('oversized'),
    };
  }

  private get seat(): number | null {
    const row = this.seats.find((candidate) => candidate.userId === this.youId);
    return row?.seat ?? null;
  }

  private youId: string | undefined;
  private seatsFromRoom: Seat[] = [];
  private epochFromRoom: string | undefined;
  private primaryFromRoom: number | undefined;

  private seatsFromRoomUpdate(rows: Seat[], epoch?: string): void {
    this.seatsFromRoom = rows.map((row) => ({ ...row }));
    if (epoch !== undefined) this.epochFromRoom = epoch;
  }

  private async connect(grant: string): Promise<void> {
    const input = this.requireInput();
    const client = new Client(input.roomsUrl);
    const room = await client.joinById(input.roomId, {
      grant,
      buildId: input.buildId,
      protocol: PROTOCOL_VERSION,
    });
    this.room = room;
    this.joins += 1;
    if (this.joins > 1) this.recoveries += 1;
    room.onMessage('*', (type, payload) => this.dispatch(String(type), payload as Record<string, unknown>));
    room.onStateChange((raw) => this.sync((raw as { toJSON(): RoomStateJson }).toJSON()));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no welcome within 10 s')), 10_000);
      const poll = setInterval(() => {
        if (this.welcomeMs !== undefined || this.youId === undefined) return;
        clearTimeout(timer);
        clearInterval(poll);
        resolve();
      }, 5);
    });
    this.link = this.buildLink();
    await this.link.open(this.requireHandlers());
  }

  private buildLink(): LinkTransport {
    /**
     * The inner transport is this page's room socket, mapped onto the three channels. A `close` really closes the
     * socket, and `open` after it is an ordinary authenticated rejoin — the room never reserves a v2 seat (D-N3-3).
     */
    const inner: Transport = {
      kind: 'ws-relay',
      seat: RELAY_SEAT,
      open: async (handlers) => {
        await this.attachRelay(handlers);
      },
      send: (_channel, bytes) => {
        const message = JSON.parse(decoder.decode(bytes)) as { t: string; p: unknown };
        this.requireRoom().send(message.t, message.p);
      },
      stats: (): TransportStats => ({
        kind: 'ws-relay',
        rttMs: 0,
        jitterMs: 0,
        lossPct: 0,
        bytesOut: 0,
        bytesIn: 0,
        drops: 0,
        connectedMs: 0,
      }),
      close: () => {
        void this.requireRoom().leave(true);
      },
    };

    return new LinkTransport({
      inner,
      config: this.config,
      clock: { now: () => performance.now(), later: scheduleLater },
    });
  }

  /** The link is open: keep its inbound handlers, and the room handler installed at join keeps feeding them. */
  private async attachRelay(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
  }

  /**
   * Room → page for every message, in one handler. A message on one of the three game channels is wrapped as bytes and
   * handed to the simulator (which forwards it to this page's own handlers); a control message goes straight to the
   * game, because the simulator impairs the game's channels and never the room's own control traffic.
   */
  private dispatch(type: string, payload: Record<string, unknown>): void {
    this.receive(type, payload);
    const channel = CHANNELS[type];
    if (channel !== undefined) {
      this.handlers?.message(channel, RELAY_SEAT, encoder.encode(JSON.stringify({ t: type, p: payload })));
      return;
    }
    if (INBOUND.has(type)) {
      this.frame?.send(type as never, payload as never);
    }
  }

  private requireHandlers(): TransportHandlers {
    return {
      message: (_channel, _seat, bytes) => {
        const message = JSON.parse(decoder.decode(bytes)) as { t: string; p: unknown };
        if (!INBOUND.has(message.t)) return;
        this.frame?.send(message.t as never, message.p as never);
      },
      stats: () => undefined,
      closed: () => undefined,
    };
  }

  private receive(type: string, payload: Record<string, unknown>): void {
    switch (type) {
      case 'welcome':
        this.youId = (payload.you as { userId?: string } | undefined)?.userId;
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
      case 'net.seats': {
        /* The seat table arrives as its own broadcast, so keep a copy beside the room state the sync handler holds. */
        const rows = payload.seats as Seat[] | undefined;
        if (rows !== undefined) this.seatsFromRoomUpdate(rows, payload.epoch as string | undefined);
        return;
      }
      case 'net.start': {
        const rows = payload.seats as Seat[] | undefined;
        if (rows !== undefined) this.seatsFromRoomUpdate(rows, String(payload.epoch));
        this.primaryFromRoom = Number(payload.primarySeat);
        return;
      }
      case 'net.primary':
        this.primaryFromRoom = Number(payload.seat);
        return;
      case 'net.seat':
        this.seatEvents.push({
          event: String(payload.event),
          seat: Number(payload.seat),
          at: Date.now(),
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
      this.frame?.send('phase' as never, { phase: state.phase } as never);
      if (state.phase === 'playing') this.frame?.send('lifecycle.resume', {});
    }
    if (state.seats !== undefined) this.frame?.send('net.seats' as never, { seats: state.seats } as never);
    this.forwardPlayers();
    if (state.draft && state.draft.buildId !== this.frameBuildId) this.mountGame(state.draft.buildId);
  }

  private forwardPlayers(): void {
    if (!this.frame || !this.state) return;
    const players = Object.values(this.state.members)
      .map(({ playerIndex, name, connected }) => ({ playerIndex, name, connected }))
      .sort((left, right) => left.playerIndex - right.playerIndex);
    const key = JSON.stringify([this.seat, players]);
    if (key === this.playersKey) return;
    this.playersKey = key;
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
      playerIndex: this.seat ?? 0,
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
      frame.on(type as never, (payload: unknown) => {
        const channel = CHANNELS[type];
        if (channel === undefined) {
          this.send(type, payload);
          return;
        }
        this.link?.send(channel, encoder.encode(JSON.stringify({ t: type, p: payload })));
      });
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

/** The browser equivalents of the injected clock the decorator takes. */
function scheduleLater(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}

export type HarnessApi = Harness;

/**
 * A distinct handle from the two-client harness's `__harness`: both pages can be bundled in one TypeScript project, and
 * one `Window` slot cannot carry two shapes.
 */
declare global {
  interface Window {
    __multiHarness: HarnessApi;
  }
}

window.__multiHarness = new Harness();
