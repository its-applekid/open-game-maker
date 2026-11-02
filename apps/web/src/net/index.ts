import type { Bridge } from '@ogm/iframe-bridge';

import { api } from '../lib/api/client';
import { attachBridgeForwarding, type BridgeForwarding } from './bridge-forwarding';
import { RoomClient, type RoomClientOptions, type RoomGrant } from './room-client';
import { createRoomStore, type RoomStoreApi } from './room-store';
import { installRoomTestHandle, type RoomTestHandle } from './test-handle';
import { WatcherSync, type DesignSnapshot, type SnapshotFetcher } from './watcher-sync';

export * from './bridge-forwarding';
export * from './room-client';
export * from './room-store';
export * from './test-handle';
export * from './watcher-sync';

export type RoomConnection = {
  client: RoomClient;
  store: RoomStoreApi;
  watcher: WatcherSync;
  forwarding: BridgeForwarding;
  testHandle?: RoomTestHandle;
  destroy(): Promise<void>;
};

export type CreateRoomConnectionOptions = {
  roomsUrl: string;
  bridge: Pick<Bridge, 'send'>;
  store?: RoomStoreApi;
  fetchGrant?: (roomId: string) => Promise<RoomGrant>;
  fetchSnapshot?: SnapshotFetcher;
  clientFactory?: RoomClientOptions['clientFactory'];
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
  const removeWatcherMessages = client.subscribe((message) => {
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
    async destroy() {
      removeWatcherMessages();
      forwarding.detach();
      watcher.stop();
      await client.leave(true);
    },
  };
}

async function fetchDesignSnapshot(pin: Parameters<SnapshotFetcher>[0], rev: number): Promise<DesignSnapshot> {
  return api<DesignSnapshot>(
    `/games/${encodeURIComponent(pin.gameId)}/branches/${encodeURIComponent(pin.branchId)}/design?rev=${rev}`,
  );
}
