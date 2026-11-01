import { CloseCode, Room, ServerError, type Client } from '@colyseus/core';
import {
  ClientMessageSchema,
  JoinOptionsSchema,
  LIMITS,
  PROTOCOL_VERSION,
  PresenceSchema as ContractPresenceSchema,
  type ClientMessage,
  type RoomGrant,
} from '@ogm/contracts';
import { RateTable, validateDesignTx, validateInputFrame, verifyGrant, zeroPrivatePresence } from '@ogm/room-protocol';

import { type EndReason, postEnded, roomTimings, type RoomTimings } from './lifecycle.js';
import { recordDropped } from './metrics.js';
import { DraftState, GameRoomState, MembershipState, createRoomState, roomStateJson, setPresence } from './state.js';

const liveRooms = new Map<string, GameRoom>();

export type RuntimeOptions = {
  grantSecret: string;
  internalSecret: string;
  apiInternalUrl: string;
  gamesOrigin: string;
  timings: RoomTimings;
  fetchFn: typeof fetch;
};

export type GameRoomOptions = {
  gameId: string;
  branchId: string;
  buildId: string;
  ownerId: string;
  maxPlayers: number;
  timings?: Partial<RoomTimings>;
  runtime?: RuntimeOptions;
};

type ForcedLeave = 'kick' | 'rate' | 'revoked';
type ViolationWindow = { count: number; startedAt: number };

const RATE_LIMITS = {
  input: 60,
  snapshot: LIMITS.snapshotPerSec,
  event: LIMITS.eventPerSec,
  'design.tx': LIMITS.designTxPerSec,
  presence: LIMITS.presencePerSec,
  phase: 10,
  'draft.load': 5,
  'draft.ready': 10,
  kick: 10,
  ping: 10,
} satisfies Record<ClientMessage['t'], number>;

function rejection(code: object, status: number): never {
  throw new ServerError(status, JSON.stringify(code));
}

function clientGrant(client: Client): RoomGrant {
  return client.auth as RoomGrant;
}

export class GameRoom extends Room<{ state: GameRoomState }> {
  readonly droppedCounts: Record<string, number> = Object.create(null) as Record<string, number>;

  private runtime!: RuntimeOptions;
  private timings!: RoomTimings;
  private readonly rates = new RateTable();
  private readonly violations = new Map<string, ViolationWindow>();
  private readonly revokedJtis = new Set<string>();
  private readonly revokedUsers = new Set<string>();
  private readonly forcedLeaves = new Map<string, ForcedLeave>();
  private readonly lastSeenRev = new Map<string, number>();
  private readonly readyUsers = new Set<string>();
  private previousPhase: GameRoomState['phase'] = 'editing';
  private idleTimer?: { clear(): void };
  private ending = false;

  async onAuth(_client: Client, rawOptions: unknown): Promise<RoomGrant> {
    const options = JoinOptionsSchema.safeParse(rawOptions);
    if (!options.success) rejection({ code: 'GRANT_INVALID' }, 401);

    const tokenResult = await verifyGrant(options.data.grant, this.runtime.grantSecret);
    if (!tokenResult.ok) rejection({ code: tokenResult.code }, 401);
    const grant = tokenResult.grant;
    if (
      grant.roomId !== this.roomId ||
      grant.gameId !== this.state.pin.gameId ||
      (grant.sub === this.state.ownerId) !== (grant.role === 'owner')
    ) {
      rejection({ code: 'GRANT_INVALID' }, 401);
    }
    if (options.data.protocol !== PROTOCOL_VERSION) rejection({ code: 'PROTOCOL_MISMATCH' }, 409);
    if (this.isRevoked(grant)) rejection({ code: 'GRANT_REVOKED' }, 403);
    if (options.data.buildId !== this.state.pin.buildId && options.data.buildId !== this.state.draft?.buildId) {
      rejection(
        {
          code: 'BUILD_MISMATCH',
          expected: this.state.pin.toJSON(),
        },
        409,
      );
    }
    if (!this.state.members.has(grant.sub) && this.state.members.size >= this.state.maxPlayers) {
      rejection({ code: 'ROOM_FULL', max: this.state.maxPlayers }, 429);
    }
    return grant;
  }

  onCreate(options: GameRoomOptions): void {
    if (options.runtime === undefined) throw new Error('rooms runtime options are required');
    this.runtime = options.runtime;
    this.timings = roomTimings({ ...options.runtime.timings, ...options.timings });
    const maxPlayers = Math.min(Math.max(Math.floor(options.maxPlayers), 1), LIMITS.maxPlayersCeiling);
    this.autoDispose = false;
    this.maxClients = 128;
    this.patchRate = 20;
    this.setState(
      createRoomState({
        pin: { gameId: options.gameId, branchId: options.branchId, buildId: options.buildId },
        ownerId: options.ownerId,
        maxPlayers,
      }),
    );
    liveRooms.set(this.roomId, this);
    this.armIdleTimer();
    this.registerHandlers();
  }

  onJoin(client: Client, _options: unknown, auth?: RoomGrant): void {
    const grant = auth ?? clientGrant(client);
    client.auth = grant;
    this.cancelIdleTimer();

    let member = this.state.members.get(grant.sub);
    if (member === undefined) {
      member = new MembershipState();
      member.userId = grant.sub;
      member.name = grant.name;
      member.role = grant.role;
      member.playerIndex = grant.role === 'owner' ? 0 : this.lowestFreePlayerIndex();
      this.state.members.set(grant.sub, member);
    }
    if (!member.sessions.includes(client.sessionId)) member.sessions.push(client.sessionId);
    member.connected = true;
    this.lastSeenRev.set(grant.sub, this.lastSeenRev.get(grant.sub) ?? this.state.lastRev);

    if (grant.role === 'owner') this.state.editorSessionId = client.sessionId;
    this.clock.setTimeout(() => {
      client.send('welcome', {
        you: { userId: grant.sub, playerIndex: member.playerIndex, sessionId: client.sessionId },
        state: roomStateJson(this.state),
      });
    }, 0);
  }

  onDrop(client: Client): void {
    if (this.forcedLeaves.has(client.sessionId)) return;
    const grant = clientGrant(client);
    const member = this.state.members.get(grant.sub);
    if (member !== undefined) member.connected = this.hasConnectedSession(grant.sub);

    this.handleEditorDeparture(client);
    if (this.clients.length === 0) this.armIdleTimer();
    this.allowReconnection(
      client,
      grant.role === 'owner' ? this.timings.ownerReconnectSec : this.timings.playerReconnectSec,
    );
  }

  onReconnect(client: Client): void {
    const grant = clientGrant(client);
    if (this.isRevoked(grant)) {
      this.forcedLeaves.set(client.sessionId, 'revoked');
      client.send('ended', { reason: 'revoked' });
      client.leave(4001);
      return;
    }
    const member = this.state.members.get(grant.sub);
    if (member !== undefined) member.connected = true;
    this.cancelIdleTimer();
    if (grant.role === 'owner') {
      this.state.editorSessionId = client.sessionId;
      if (this.state.phase === 'pausedForHost') this.setPhase(this.previousPhase);
    }
    client.send('resync', { fromRev: (this.lastSeenRev.get(grant.sub) ?? 0) + 1 }, { afterNextPatch: true });
  }

  async onLeave(client: Client, code?: number): Promise<void> {
    const grant = clientGrant(client);
    const forced = this.forcedLeaves.get(client.sessionId);
    this.forcedLeaves.delete(client.sessionId);
    this.violations.delete(client.sessionId);
    this.rates.prune(Date.now() - 60_000);
    this.handleEditorDeparture(client);
    this.removeSession(grant.sub, client.sessionId);
    if (this.clients.length === 0) this.armIdleTimer();
    if (this.ending) return;

    const hasRemainingOwnerSession = (this.state.members.get(grant.sub)?.sessions.length ?? 0) > 0;
    if (grant.role === 'owner' && !hasRemainingOwnerSession) {
      if (forced === 'revoked') await this.end('revoked');
      else if (code === CloseCode.CONSENTED) await this.end('owner-closed');
      else if (forced === undefined) await this.end('host-left');
    }
  }

  onDispose(): void {
    this.cancelIdleTimer();
    liveRooms.delete(this.roomId);
  }

  revoke(input: { jti?: string; userId?: string }): void {
    if (input.jti) this.revokedJtis.add(input.jti);
    if (input.userId) this.revokedUsers.add(input.userId);
    for (const client of [...this.clients]) {
      const grant = clientGrant(client);
      if ((input.jti && grant.jti === input.jti) || (input.userId && grant.sub === input.userId)) {
        this.forcedLeaves.set(client.sessionId, 'revoked');
        client.send('ended', { reason: 'revoked' });
        client.leave(4001);
      }
    }
  }

  private registerHandlers(): void {
    this.onMessage('*', (client, type, payload) => {
      if (typeof type !== 'string') return this.drop(client, String(type));
      const parsed = ClientMessageSchema.safeParse({ t: type, ...normalizePayload(type, payload) });
      if (!parsed.success) return this.drop(client, type);
      if (!this.allowRate(client, parsed.data.t)) return;
      this.handleMessage(client, parsed.data);
    });
  }

  private handleMessage(client: Client, message: ClientMessage): void {
    switch (message.t) {
      case 'input': {
        const result = validateInputFrame(message.f);
        const editor = this.editorClient();
        const member = this.state.members.get(clientGrant(client).sub);
        if (!result.ok || editor === undefined || member === undefined) return this.drop(client, message.t);
        editor.send('input', { f: { ...result.frame, playerIndex: member.playerIndex, from: member.userId } });
        return;
      }
      case 'snapshot':
      case 'event':
        if (!this.requireEditor(client, message.t)) return;
        this.broadcast(message.t, withoutType(message), { except: client });
        return;
      case 'design.tx': {
        if (!this.requireEditor(client, message.t)) return;
        const result = validateDesignTx(message.tx, this.state.pin);
        if (!result.ok) return this.drop(client, message.t);
        this.state.lastRev = Math.max(this.state.lastRev, result.tx.rev);
        this.broadcast(message.t, { tx: result.tx }, { except: client });
        for (const peer of this.clients) this.lastSeenRev.set(clientGrant(peer).sub, result.tx.rev);
        return;
      }
      case 'presence': {
        if (!this.requireEditor(client, message.t)) return;
        const current = this.state.presence.toJSON();
        const merged = ContractPresenceSchema.safeParse({ ...current, ...message.p });
        if (!merged.success) return this.drop(client, message.t);
        setPresence(this.state.presence, zeroPrivatePresence(merged.data));
        return;
      }
      case 'phase':
        if (!this.requireEditor(client, message.t)) return;
        this.setPhase(message.to);
        if (message.to === 'playing') this.state.playRev = this.state.lastRev;
        return;
      case 'draft.load':
        if (!this.requireEditor(client, message.t)) return;
        if (!this.isGamesUrl(message.url)) return this.drop(client, message.t);
        this.state.draft = Object.assign(new DraftState(), {
          buildId: message.buildId,
          url: message.url,
          expiresAt: Date.now() + 5 * 60_000,
        });
        this.readyUsers.clear();
        this.setPhase('migrating');
        return;
      case 'draft.ready': {
        const draft = this.state.draft;
        if (draft === undefined || draft.buildId !== message.buildId) return this.drop(client, message.t);
        this.readyUsers.add(clientGrant(client).sub);
        const connectedUsers = new Set(this.clients.map((peer) => clientGrant(peer).sub));
        if ([...connectedUsers].every((userId) => this.readyUsers.has(userId))) {
          this.state.pin.buildId = draft.buildId;
          this.state.draft = undefined;
          this.readyUsers.clear();
          this.setPhase('editing');
        }
        return;
      }
      case 'kick':
        if (!this.requireEditor(client, message.t)) return;
        for (const peer of [...this.clients]) {
          if (clientGrant(peer).sub === message.userId) {
            this.forcedLeaves.set(peer.sessionId, 'kick');
            peer.leave(4003);
          }
        }
        return;
      case 'ping':
        client.send('pong', { c: message.c, s: Date.now() });
        return;
    }
  }

  private requireEditor(client: Client, type: string): boolean {
    if (client.sessionId === this.state.editorSessionId) return true;
    this.drop(client, type);
    return false;
  }

  private allowRate(client: Client, type: ClientMessage['t']): boolean {
    const limit = RATE_LIMITS[type];
    if (this.rates.allow(`${client.sessionId}:${type}`, limit)) return true;
    this.drop(client, type);
    return false;
  }

  private drop(client: Client, type: string): void {
    const metric = Object.hasOwn(RATE_LIMITS, type) ? type : 'invalid';
    this.droppedCounts[metric] = (this.droppedCounts[metric] ?? 0) + 1;
    recordDropped(metric);
    const now = Date.now();
    const previous = this.violations.get(client.sessionId);
    const window =
      previous === undefined || now - previous.startedAt >= 60_000
        ? { count: 1, startedAt: now }
        : { count: previous.count + 1, startedAt: previous.startedAt };
    this.violations.set(client.sessionId, window);
    if (window.count >= 1_000) {
      this.forcedLeaves.set(client.sessionId, 'rate');
      client.leave(4002);
    }
  }

  private lowestFreePlayerIndex(): number {
    const used = new Set([...this.state.members.values()].map((member) => member.playerIndex));
    for (let index = 1; index < this.state.maxPlayers; index += 1) if (!used.has(index)) return index;
    rejection({ code: 'ROOM_FULL', max: this.state.maxPlayers }, 429);
  }

  private editorClient(): Client | undefined {
    return this.clients.find((client) => client.sessionId === this.state.editorSessionId);
  }

  private connectedOwnerSessions(): Client[] {
    return this.clients.filter((client) => clientGrant(client).sub === this.state.ownerId);
  }

  private handleEditorDeparture(client: Client): void {
    if (client.sessionId !== this.state.editorSessionId) return;
    const replacement = this.connectedOwnerSessions().at(-1);
    if (replacement) {
      this.state.editorSessionId = replacement.sessionId;
      return;
    }
    this.previousPhase = this.state.phase === 'pausedForHost' ? this.previousPhase : this.state.phase;
    this.state.editorSessionId = undefined;
    this.setPhase('pausedForHost');
  }

  private isRevoked(grant: RoomGrant): boolean {
    return this.revokedJtis.has(grant.jti) || this.revokedUsers.has(grant.sub);
  }

  private hasConnectedSession(userId: string): boolean {
    return this.clients.some((client) => clientGrant(client).sub === userId);
  }

  private removeSession(userId: string, sessionId: string): void {
    const member = this.state.members.get(userId);
    if (member === undefined) return;
    const index = member.sessions.indexOf(sessionId);
    if (index >= 0) member.sessions.splice(index, 1);
    member.connected = this.hasConnectedSession(userId);
    if (member.sessions.length === 0) {
      this.state.members.delete(userId);
      this.lastSeenRev.delete(userId);
      this.readyUsers.delete(userId);
    }
  }

  private setPhase(phase: GameRoomState['phase']): void {
    this.state.phase = phase;
    this.state.phaseAt = Date.now();
  }

  private isGamesUrl(value: string): boolean {
    try {
      const url = new URL(value);
      const origin = new URL(this.runtime.gamesOrigin);
      return url.origin === origin.origin && value.startsWith(this.runtime.gamesOrigin.replace(/\/$/, ''));
    } catch {
      return false;
    }
  }

  private armIdleTimer(): void {
    this.cancelIdleTimer();
    this.idleTimer = this.clock.setTimeout(() => void this.end('idle'), this.timings.idleDisposeSec * 1_000);
  }

  private cancelIdleTimer(): void {
    this.idleTimer?.clear();
    this.idleTimer = undefined;
  }

  private async end(reason: EndReason): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    this.cancelIdleTimer();
    this.setPhase('ended');
    this.broadcast('ended', { reason });
    const callback = await postEnded({
      apiInternalUrl: this.runtime.apiInternalUrl,
      fetchFn: this.runtime.fetchFn,
      internalSecret: this.runtime.internalSecret,
      reason,
      retryMs: this.timings.callbackRetryMs,
      roomId: this.roomId,
      timeoutMs: this.timings.callbackTimeoutMs,
    });
    if (!callback.ok) {
      console.error(JSON.stringify({ event: 'ended-callback-failed', service: 'rooms', roomId: this.roomId, reason }));
    }
    this.clock.setTimeout(() => void this.disconnect(), 0);
  }
}

function normalizePayload(type: string, payload: unknown): object {
  if (type !== 'input' || payload === null || typeof payload !== 'object') return payload as object;
  const frame = (payload as { f?: unknown }).f;
  if (frame === null || typeof frame !== 'object') return payload as object;
  const source = frame as Record<string, unknown>;
  return {
    f: {
      seq: source.seq,
      tick: source.tick,
      axes: source.axes,
      buttons: source.buttons,
    },
  };
}

function withoutType(message: Extract<ClientMessage, { t: 'snapshot' | 'event' }>): object {
  return message.t === 'snapshot'
    ? { seq: message.seq, tick: message.tick, data: message.data }
    : { seq: message.seq, data: message.data };
}

export function roomCount(): number {
  return liveRooms.size;
}
