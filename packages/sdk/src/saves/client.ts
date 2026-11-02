import type { SaveData, SaveRevision } from '@ogm/contracts';

import { Outbox, type OutboxEntry, type SaveSlotId } from './outbox.js';
import type { SaveState } from './machine.js';

const KEEPALIVE_LIMIT = 60 * 1024;
const MAX_RETRY_MS = 60_000;

export type SaveInput<S> = SaveData<S> & {
  reason: SaveRevision['reason'];
  label?: string;
};

export type PutResult =
  | { state: 'saved_cloud'; revision: number }
  | { state: 'conflict'; headRevision: number }
  | { state: 'read_only'; heldBy: string | null }
  | { state: 'queued' };

type ListedSlot = {
  slotId: SaveSlotId;
  headRevision: number;
  status: 'ok' | 'needs_migration' | 'unsupported_old' | 'incompatible_after_rollback';
  olderCompatible: number[];
};

export type LoadResult<S> =
  | { status: 'empty' }
  | { status: 'ok'; save: SaveData<S>; revision: number }
  | { status: 'needs_migration'; save: SaveData<S>; revision: number }
  | { status: 'unsupported_old' | 'incompatible_after_rollback'; olderCompatible: number[] };

async function gzipJson(value: unknown): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeJson<S>(bytes: Uint8Array): SaveData<S> {
  return JSON.parse(new TextDecoder().decode(bytes)) as SaveData<S>;
}

export class SaveClient<S> {
  private readonly states = new Map<SaveSlotId, SaveState>();
  private readonly heads = new Map<SaveSlotId, number>();
  private readonly fetcher: typeof globalThis.fetch;
  private readonly onlineTarget: EventTarget;
  private readonly encode: (value: unknown) => Promise<Uint8Array>;
  private sequence: number;
  private draining: Promise<void> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  constructor(
    private readonly options: {
      baseUrl: string;
      gameId: string;
      deviceId: string;
      tabId: string;
      branchId: string;
      buildId: string;
      releaseId?: string;
      outbox: Outbox;
      fetch?: typeof globalThis.fetch;
      onlineTarget?: EventTarget;
      encode?: (value: unknown) => Promise<Uint8Array>;
      now?: () => number;
    },
  ) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onlineTarget = options.onlineTarget ?? window;
    this.encode = options.encode ?? gzipJson;
    this.sequence = this.readSequence();
    this.onlineTarget.addEventListener('online', this.onOnline);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private sequenceKey(): string {
    return `ogm:saves:${this.options.gameId}:${this.options.deviceId}:client-seq`;
  }

  private readSequence(): number {
    try {
      const value = Number(localStorage.getItem(this.sequenceKey()));
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  private nextSequence(): number {
    this.sequence += 1;
    try {
      localStorage.setItem(this.sequenceKey(), String(this.sequence));
    } catch {
      // IndexedDB still preserves the idempotency key for queued retries.
    }
    return this.sequence;
  }

  private transition(slotId: SaveSlotId, state: SaveState): void {
    this.states.set(slotId, state);
  }

  state(slotId: SaveSlotId): SaveState {
    return this.states.get(slotId) ?? 'idle';
  }

  async start(): Promise<void> {
    await this.drain(true);
  }

  async put(
    slotId: SaveSlotId,
    save: SaveInput<S>,
    options: { hidden?: boolean; ifMatch?: number; migratedFromRevision?: number } = {},
  ): Promise<PutResult> {
    this.transition(slotId, 'pending_local');
    const sequence = this.nextSequence();
    const body = await this.encode({ saveSchemaVersion: save.saveSchemaVersion, data: save.data });
    const headers: Record<string, string> = {
      'content-type': 'application/octet-stream',
      'content-encoding': 'gzip',
      'if-match': String(options.ifMatch ?? this.heads.get(slotId) ?? 0),
      'idempotency-key': `${this.options.deviceId}:${sequence}`,
      'x-save-schema': String(save.saveSchemaVersion),
      'x-save-branch': this.options.branchId,
      'x-save-build': this.options.buildId,
      'x-save-reason': save.reason,
    };
    if (this.options.releaseId) headers['x-save-release'] = this.options.releaseId;
    if (save.label) headers['x-save-label'] = save.label;
    if (options.migratedFromRevision !== undefined) {
      headers['x-save-migrated-from'] = String(options.migratedFromRevision);
    }
    const entry: OutboxEntry = {
      key: `${this.options.gameId}:${this.options.deviceId}:${sequence}`,
      gameId: this.options.gameId,
      slotId,
      headers,
      body,
      hidden: options.hidden,
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: this.now(),
    };
    await this.options.outbox.enqueue(entry);
    this.transition(slotId, 'saved_local');
    if (options.hidden && body.byteLength > KEEPALIVE_LIMIT) {
      this.transition(slotId, 'queued');
      return { state: 'queued' };
    }
    return this.sendEntry(entry);
  }

  private readonly onOnline = () => {
    void this.drain(true);
  };

  private scheduleRetry(delay: number): void {
    if (this.retryTimer !== undefined || this.disposed) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.drain();
    }, delay);
  }

  private async sendEntry(entry: OutboxEntry): Promise<PutResult> {
    try {
      const body = entry.body.buffer.slice(
        entry.body.byteOffset,
        entry.body.byteOffset + entry.body.byteLength,
      ) as ArrayBuffer;
      const response = await this.fetcher(
        `${this.options.baseUrl}/saves/${encodeURIComponent(entry.gameId)}/${entry.slotId}`,
        {
          method: 'PUT',
          headers: entry.headers,
          body,
          keepalive: entry.hidden === true && entry.body.byteLength <= KEEPALIVE_LIMIT,
        },
      );
      if (response.ok) {
        const result = (await response.json()) as { revision: number };
        await this.options.outbox.remove(entry.key);
        this.heads.set(entry.slotId, result.revision);
        this.transition(entry.slotId, 'saved_cloud');
        return { state: 'saved_cloud', revision: result.revision };
      }
      if (response.status === 409) {
        const result = (await response.json()) as { headRevision: number };
        await this.options.outbox.keepLocalCopy({
          key: `${entry.key}:conflict`,
          gameId: entry.gameId,
          slotId: entry.slotId,
          label: `Copy from ${this.options.deviceId}`,
          body: entry.body,
          createdAt: this.now(),
        });
        await this.options.outbox.remove(entry.key);
        this.heads.set(entry.slotId, result.headRevision);
        this.transition(entry.slotId, 'conflict');
        return { state: 'conflict', headRevision: result.headRevision };
      }
      if (response.status === 423) {
        const result = (await response.json()) as { heldBy: string | null };
        this.transition(entry.slotId, 'read_only');
        return { state: 'read_only', heldBy: result.heldBy };
      }
    } catch {
      // The entry stays durable and is retried below.
    }

    const attempts = entry.attempts + 1;
    const delay = Math.min(1_000 * 2 ** (attempts - 1), MAX_RETRY_MS);
    await this.options.outbox.enqueue({ ...entry, attempts, nextAttemptAt: this.now() + delay });
    this.transition(entry.slotId, 'queued');
    this.scheduleRetry(delay);
    return { state: 'queued' };
  }

  async drain(force = false): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = (async () => {
      for (const entry of await this.options.outbox.pending()) {
        if (this.state(entry.slotId) === 'read_only') continue;
        if (!force && entry.nextAttemptAt > this.now()) continue;
        await this.sendEntry(entry);
      }
    })();
    try {
      await this.draining;
    } finally {
      this.draining = undefined;
    }
  }

  async load(
    slotId: SaveSlotId,
    context: { schema: number; migratesFrom?: number; migrate?: (save: SaveData<unknown>) => SaveData<S> },
  ): Promise<LoadResult<S>> {
    const query = new URLSearchParams({ schema: String(context.schema) });
    if (context.migratesFrom !== undefined) query.set('migratesFrom', String(context.migratesFrom));
    const listResponse = await this.fetcher(
      `${this.options.baseUrl}/saves/${encodeURIComponent(this.options.gameId)}?${query}`,
    );
    if (!listResponse.ok) throw new Error(`save list failed with ${listResponse.status}`);
    const listed = (await listResponse.json()) as { slots: ListedSlot[] };
    const slot = listed.slots.find((candidate) => candidate.slotId === slotId);
    if (!slot) return { status: 'empty' };
    this.heads.set(slotId, slot.headRevision);
    if (slot.status === 'unsupported_old' || slot.status === 'incompatible_after_rollback') {
      return { status: slot.status, olderCompatible: slot.olderCompatible };
    }

    const saveResponse = await this.fetcher(
      `${this.options.baseUrl}/saves/${encodeURIComponent(this.options.gameId)}/${slotId}`,
    );
    if (!saveResponse.ok) throw new Error(`save load failed with ${saveResponse.status}`);
    const save = decodeJson<unknown>(new Uint8Array(await saveResponse.arrayBuffer()));
    if (slot.status === 'ok') return { status: 'ok', save: save as SaveData<S>, revision: slot.headRevision };
    if (!context.migrate) return { status: 'unsupported_old', olderCompatible: slot.olderCompatible };

    const migrated = context.migrate(save);
    const result = await this.put(
      slotId,
      { ...migrated, reason: 'migration' },
      { ifMatch: slot.headRevision, migratedFromRevision: slot.headRevision },
    );
    if (result.state !== 'saved_cloud') throw new Error(`migration upload ended in ${result.state}`);
    return { status: 'needs_migration', save: migrated, revision: result.revision };
  }

  async lease(takeover = false): Promise<{ expiresAt: string; previousHolder?: string }> {
    const response = await this.fetcher(`${this.options.baseUrl}/saves/${this.options.gameId}/lease`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: this.options.deviceId, tabId: this.options.tabId, takeover }),
    });
    if (!response.ok) throw new Error(`play lease failed with ${response.status}`);
    const result = (await response.json()) as { expiresAt: string; previousHolder?: string };
    for (const [slotId, state] of this.states) if (state === 'read_only') this.transition(slotId, 'idle');
    if (this.heartbeatTimer === undefined) {
      this.heartbeatTimer = setInterval(() => {
        void this.heartbeat().catch(() => undefined);
      }, 15_000);
    }
    await this.drain(true);
    return result;
  }

  private async heartbeat(): Promise<void> {
    await this.fetcher(`${this.options.baseUrl}/saves/${this.options.gameId}/lease/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: this.options.deviceId, tabId: this.options.tabId }),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onlineTarget.removeEventListener('online', this.onOnline);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    this.options.outbox.close();
  }
}
