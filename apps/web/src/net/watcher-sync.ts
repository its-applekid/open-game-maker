import type { Envelope, RoomPin, RoomState, DesignTx as RoomDesignTx } from '@ogm/contracts';
import { apply, type DesignDoc, type Patch } from '@ogm/design-log';

import type { RoomStoreApi } from './room-store';

export type DesignSnapshot = { rev: number; doc: DesignDoc };
export type SnapshotFetcher = (pin: RoomPin, rev: number) => Promise<DesignSnapshot>;
export type DesignBridge = { send(envelope: Envelope<string, unknown>): void };

export type WatcherSyncOptions = {
  bridge: DesignBridge;
  fetchSnapshot: SnapshotFetcher;
  store: RoomStoreApi;
};

let envelopeSequence = 0;

export class WatcherSync {
  private readonly bridge: DesignBridge;
  private readonly fetchSnapshot: SnapshotFetcher;
  private readonly store: RoomStoreApi;
  private readonly pending = new Map<number, RoomDesignTx>();
  private pin?: RoomPin;
  private currentDoc: DesignDoc | null = null;
  private currentRev = -1;
  private requestedRev = -1;
  private fetchInFlight?: { generation: number; promise: Promise<void> };
  private gapTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;

  constructor(options: WatcherSyncOptions) {
    this.bridge = options.bridge;
    this.fetchSnapshot = options.fetchSnapshot;
    this.store = options.store;
  }

  get appliedRev(): number {
    return this.currentRev;
  }

  get doc(): DesignDoc | null {
    return this.currentDoc;
  }

  async onWelcome(state: RoomState): Promise<void> {
    const generation = ++this.generation;
    this.pin = state.pin;
    this.pending.clear();
    this.currentDoc = null;
    this.currentRev = -1;
    this.requestedRev = state.lastRev;
    this.clearGapTimer();
    await this.requestSnapshot(state.lastRev, generation);
  }

  onTransaction(transaction: RoomDesignTx): void {
    if (transaction.rev <= this.currentRev) return;
    this.pending.set(transaction.rev, transaction);
    if (this.currentDoc === null) return;
    this.drain();
  }

  onResync(fromRev: number): Promise<void> {
    const target = Math.max(fromRev, this.store.getState().lastRev ?? 0, this.highestPending());
    return this.requestSnapshot(target);
  }

  reapply(): void {
    if (this.currentDoc !== null && this.currentRev >= 0) this.sendApply([], this.currentDoc, this.currentRev);
  }

  stop(): void {
    this.generation += 1;
    this.pin = undefined;
    this.pending.clear();
    this.currentDoc = null;
    this.currentRev = -1;
    this.requestedRev = -1;
    this.clearGapTimer();
  }

  private requestSnapshot(targetRev: number, generation = this.generation): Promise<void> {
    if (this.pin === undefined || generation !== this.generation) return Promise.resolve();
    this.requestedRev = Math.max(this.requestedRev, targetRev);
    if (this.fetchInFlight?.generation === generation) return this.fetchInFlight.promise;
    const pin = this.pin;
    const promise = this.fetchLoop(pin, generation).finally(() => {
      if (this.fetchInFlight?.promise === promise) this.fetchInFlight = undefined;
    });
    this.fetchInFlight = { generation, promise };
    return promise;
  }

  private async fetchLoop(pin: RoomPin, generation: number): Promise<void> {
    while (generation === this.generation) {
      const target = this.requestedRev;
      const snapshot = await this.fetchWithRetries(pin, target, generation);
      if (generation !== this.generation || snapshot === undefined) return;
      this.installSnapshot(snapshot);
      if (this.currentRev >= this.requestedRev) return;
      if (this.requestedRev === target) {
        this.scheduleGapFetch();
        return;
      }
    }
  }

  private async fetchWithRetries(pin: RoomPin, rev: number, generation: number): Promise<DesignSnapshot | undefined> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (generation !== this.generation) return undefined;
      try {
        const snapshot = await this.fetchSnapshot(pin, rev);
        return generation === this.generation ? snapshot : undefined;
      } catch {
        // Three immediate attempts keep failure bounded; the next room resync can try again.
      }
    }
    if (generation === this.generation) this.store.getState().connection('desynced');
    return undefined;
  }

  private installSnapshot(snapshot: DesignSnapshot): void {
    this.currentDoc = snapshot.doc;
    this.currentRev = snapshot.rev;
    for (const rev of this.pending.keys()) if (rev <= snapshot.rev) this.pending.delete(rev);
    if (this.store.getState().status === 'desynced') this.store.getState().connection('connected');
    this.sendApply([], snapshot.doc, snapshot.rev);
    this.drain();
  }

  private drain(): void {
    while (this.currentDoc !== null) {
      const nextRev = this.currentRev + 1;
      const transaction = this.pending.get(nextRev);
      if (transaction === undefined) break;
      this.pending.delete(nextRev);
      const patches = normalizePatches(transaction.patches);
      try {
        this.currentDoc = apply(this.currentDoc, patches);
      } catch {
        this.store.getState().connection('desynced');
        void this.requestSnapshot(Math.max(this.store.getState().lastRev ?? 0, transaction.rev));
        return;
      }
      this.currentRev = transaction.rev;
      this.sendApply(patches, this.currentDoc, transaction.rev);
    }

    if (this.highestPending() > this.currentRev + 1) this.scheduleGapFetch();
    else this.clearGapTimer();
  }

  private scheduleGapFetch(): void {
    if (this.gapTimer !== undefined) return;
    this.gapTimer = setTimeout(() => {
      this.gapTimer = undefined;
      const target = Math.max(this.store.getState().lastRev ?? 0, this.highestPending());
      void this.requestSnapshot(target);
    }, 2_000);
  }

  private clearGapTimer(): void {
    if (this.gapTimer !== undefined) clearTimeout(this.gapTimer);
    this.gapTimer = undefined;
  }

  private highestPending(): number {
    return this.pending.size === 0 ? -1 : Math.max(...this.pending.keys());
  }

  private sendApply(patches: Patch[], doc: DesignDoc, rev: number): void {
    envelopeSequence += 1;
    this.bridge.send({
      v: 1,
      id: `room-design-${envelopeSequence}`,
      t: 'design.apply',
      payload: { rev, doc, patches },
    });
  }
}

function normalizePatches(patches: RoomDesignTx['patches']): Patch[] {
  return patches.map((patch) => ({
    op: patch.op,
    path: Array.isArray(patch.path) ? patch.path : pointerPath(patch.path),
    ...(Object.hasOwn(patch, 'value') ? { value: patch.value } : {}),
  }));
}

function pointerPath(pointer: string): string[] {
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}
