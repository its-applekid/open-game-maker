import type { RoomState } from '@ogm/contracts/browser';
import type { Bridge } from '@ogm/iframe-bridge';

import { api } from '../lib/api/client';
import { attachBridgeForwarding, type BridgeForwarding } from './bridge-forwarding';
import { RoomClient, type RoomClientOptions, type RoomGrant } from './room-client';
import { createRoomStore, type RoomStoreApi } from './room-store';
import { installRoomTestHandle, type RoomTestHandle } from './test-handle';
import {
  createSwitchboard,
  WsRelayTransport,
  type ChannelName,
  type SignalSink,
  type TransportNotice,
  type TransportSwitchboard,
} from './transport';
import { WatcherSync, type DesignSnapshot, type SnapshotFetcher } from './watcher-sync';

export * from './bridge-forwarding';
export * from './room-client';
export * from './room-store';
export * from './test-handle';
export * from './transport';
export * from './watcher-sync';

/** The room protocol that carries `net.signal` and therefore can negotiate a pair; v1 rooms are relay-only. */
export const TRANSPORT_PROTOCOL = 2;

export type RoomTransportOptions = {
  /** Public STUN resolvers (`VITE_ICE_URLS`, comma separated). Empty means host candidates only. */
  iceUrls?: readonly string[];
  /** N3's `net.signal`; without it no pair is ever attempted. */
  signal?: SignalSink;
  /** Every transport transition, for N3's `net.transport` notice and for the diagnostics harness. */
  announce?: (notice: TransportNotice) => void;
  /** Inbound frames from a promoted pair. */
  onMessage?: (channel: ChannelName, seat: number, bytes: Uint8Array) => void;
};

export type RoomConnection = {
  client: RoomClient;
  store: RoomStoreApi;
  watcher: WatcherSync;
  forwarding: BridgeForwarding;
  testHandle?: RoomTestHandle;
  /** Present only on a `protocol >= 2` room; today's v1 rooms never construct it. */
  transport?: TransportSwitchboard;
  destroy(): Promise<void>;
};

export type CreateRoomConnectionOptions = {
  roomsUrl: string;
  bridge: Pick<Bridge, 'send'>;
  store?: RoomStoreApi;
  fetchGrant?: (roomId: string) => Promise<RoomGrant>;
  fetchSnapshot?: SnapshotFetcher;
  clientFactory?: RoomClientOptions['clientFactory'];
  transport?: RoomTransportOptions;
};

export function createRoomConnection(options: CreateRoomConnectionOptions): RoomConnection {
  const store = options.store ?? createRoomStore();
  const watcher = new WatcherSync({
    bridge: options.bridge,
    fetchSnapshot: options.fetchSnapshot ?? fetchDesignSnapshot,
    store,
  });
  const client = new RoomClient({
    roomsUrl: options.roomsUrl,
    store,
    fetchGrant: options.fetchGrant,
    clientFactory: options.clientFactory,
  });
  let switchboard: TransportSwitchboard | undefined;
  const connectTransport = (state: RoomState) => {
    if (switchboard !== undefined || options.transport === undefined) return;
    if (state.protocol < TRANSPORT_PROTOCOL) return;
    // §4.5: without a signalling sink there is no way to negotiate a pair, so the switchboard is not constructed at all.
    if (options.transport.signal === undefined) return;
    const you = store.getState().you;
    if (you === undefined) return;
    switchboard = createSwitchboard({
      relay: new WsRelayTransport({ client }),
      localSeat: you.playerIndex,
      peers: Object.values(state.members).map((member) => member.playerIndex),
      ...(options.transport.signal === undefined ? {} : { signal: options.transport.signal }),
      iceUrls: options.transport.iceUrls ?? envIceUrls(),
      ...(options.transport.announce === undefined ? {} : { announce: options.transport.announce }),
      ...(options.transport.onMessage === undefined ? {} : { onMessage: options.transport.onMessage }),
    });
  };
  const removeWatcherMessages = client.subscribe((message) => {
    if (message.t === 'welcome') connectTransport(message.state);
    if (store.getState().role !== 'peer') return;
    if (message.t === 'welcome') void watcher.onWelcome(message.state);
    if (message.t === 'design.tx') watcher.onTransaction(message.tx);
    if (message.t === 'resync') void watcher.onResync(message.fromRev);
  });
  const forwarding = attachBridgeForwarding({ bridge: options.bridge, client, store, watcher });
  const testHandle = typeof window === 'undefined' ? undefined : installRoomTestHandle(client, store);

  return {
    client,
    store,
    watcher,
    forwarding,
    testHandle,
    get transport() {
      return switchboard;
    },
    async destroy() {
      removeWatcherMessages();
      forwarding.detach();
      watcher.stop();
      switchboard?.close('connection closed');
      switchboard = undefined;
      await client.leave(true);
    },
  };
}

/**
 * Public STUN resolvers from `VITE_ICE_URLS` (comma separated). Empty means host candidates only, which covers one LAN;
 * a symmetric NAT needs a TURN relay, and that is an operator decision this build does not take (see the PR).
 */
export function envIceUrls(): readonly string[] {
  const raw = import.meta.env.VITE_ICE_URLS;
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.startsWith('stun:') || url.startsWith('turn:') || url.startsWith('turns:'));
}

async function fetchDesignSnapshot(pin: Parameters<SnapshotFetcher>[0], rev: number): Promise<DesignSnapshot> {
  return api<DesignSnapshot>(
    `/games/${encodeURIComponent(pin.gameId)}/branches/${encodeURIComponent(pin.branchId)}/design?rev=${rev}`,
  );
}
