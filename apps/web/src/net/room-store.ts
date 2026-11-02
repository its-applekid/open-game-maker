import type {
  ClientMessage,
  DesignTx,
  JoinRejection,
  Membership,
  Phase,
  Presence,
  RoomPin,
  RoomState,
  ServerMessage,
} from '@ogm/contracts';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'rejected' | 'desynced' | 'ended';
export type RoomRole = 'host' | 'peer';
export type RoomIdentity = Extract<ServerMessage, { t: 'welcome' }>['you'];
export type RoomEndedReason = Extract<ServerMessage, { t: 'ended' }>['reason'];

export type RoomController = {
  send(message: ClientMessage): void;
};

export type RoomStore = {
  status: RoomStatus;
  rejection?: JoinRejection;
  you?: RoomIdentity;
  role?: RoomRole;
  phase?: Phase;
  phaseAt?: number;
  playRev?: number;
  lastRev?: number;
  members: Record<string, Membership>;
  presence?: Presence;
  pin?: RoomPin;
  draft?: RoomState['draft'];
  ended?: RoomEndedReason;
  rttMs?: number;
  bind(controller: RoomController): void;
  connection(status: RoomStatus): void;
  reject(rejection: JoinRejection): void;
  welcome(you: RoomIdentity, state: RoomState): void;
  sync(state: RoomState): void;
  setRtt(rttMs: number): void;
  end(reason: RoomEndedReason): void;
  play(): void;
  edit(): void;
  kick(userId: string): void;
  setPresence(presence: Partial<Presence>): void;
  loadDraft(buildId: string, url: string): void;
  publishTransaction(tx: DesignTx): void;
};

export type RoomStoreApi = UseBoundStore<StoreApi<RoomStore>>;

export function createRoomStore(): RoomStoreApi {
  let controller: RoomController | undefined;
  return create<RoomStore>()((set, get) => ({
    status: 'idle',
    members: {},
    bind(next) {
      controller = next;
    },
    connection(status) {
      set({ status, ...(status === 'connecting' ? { rejection: undefined, ended: undefined } : {}) });
    },
    reject(rejection) {
      set({ status: 'rejected', rejection });
    },
    welcome(you, state) {
      set({ you, status: 'connected', rejection: undefined, ended: undefined, ...stateFields(state, you) });
    },
    sync(state) {
      set(stateFields(state, get().you));
    },
    setRtt(rttMs) {
      set({ rttMs });
    },
    end(ended) {
      set({ ended, phase: 'ended', status: 'ended' });
    },
    play() {
      controller?.send({ t: 'phase', to: 'playing' });
    },
    edit() {
      controller?.send({ t: 'phase', to: 'editing' });
    },
    kick(userId) {
      controller?.send({ t: 'kick', userId });
    },
    setPresence(p) {
      controller?.send({ t: 'presence', p });
    },
    loadDraft(buildId, url) {
      controller?.send({ t: 'draft.load', buildId, url });
    },
    publishTransaction(tx) {
      controller?.send({ t: 'design.tx', tx });
    },
  }));
}

function stateFields(state: RoomState, you?: RoomIdentity) {
  return {
    role:
      you === undefined ? undefined : state.editorSessionId === you.sessionId ? ('host' as const) : ('peer' as const),
    phase: state.phase,
    phaseAt: state.phaseAt,
    playRev: state.playRev,
    lastRev: state.lastRev,
    members: state.members,
    presence: state.presence,
    pin: state.pin,
    draft: state.draft,
  };
}

export const useRoom = createRoomStore();
