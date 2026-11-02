import type { ClientMessage } from '@ogm/contracts';

import type { RoomStore, RoomStoreApi } from '../../net/room-store';

type RoomClientLike = {
  store: RoomStoreApi;
  send(message: ClientMessage): void;
  leave(consented?: boolean): Promise<void>;
};

export type RoomSessionSnapshot = Pick<
  RoomStore,
  | 'status'
  | 'rejection'
  | 'you'
  | 'role'
  | 'ownerId'
  | 'phase'
  | 'phaseAt'
  | 'playRev'
  | 'lastRev'
  | 'members'
  | 'presence'
  | 'pin'
  | 'draft'
  | 'maxPlayers'
  | 'ended'
  | 'rttMs'
>;

export type RoomSession = {
  readonly roomId: string;
  snapshot(): RoomSessionSnapshot;
  subscribe(listener: () => void): () => void;
  send(message: ClientMessage): void;
  leave(): Promise<void>;
};

export function fromRoomClient(roomId: string, client: RoomClientLike): RoomSession {
  return {
    roomId,
    snapshot: () => roomSnapshot(client.store.getState()),
    subscribe: (listener) => client.store.subscribe(listener),
    send: (message) => client.send(message),
    leave: () => client.leave(true),
  };
}

export function roomSnapshot(store: RoomStore): RoomSessionSnapshot {
  const {
    status,
    rejection,
    you,
    role,
    ownerId,
    phase,
    phaseAt,
    playRev,
    lastRev,
    members,
    presence,
    pin,
    draft,
    maxPlayers,
    ended,
    rttMs,
  } = store;
  return {
    status,
    rejection,
    you,
    role,
    ownerId,
    phase,
    phaseAt,
    playRev,
    lastRev,
    members,
    presence,
    pin,
    draft,
    maxPlayers,
    ended,
    rttMs,
  };
}
