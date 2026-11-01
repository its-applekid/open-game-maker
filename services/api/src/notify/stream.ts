import type { Notification } from '@ogm/contracts';

export interface SSEWriter {
  write(frame: string): Promise<void>;
  close(): Promise<void>;
}

export interface StreamHub {
  publish(userId: string, notification: Notification): void;
  attach(userId: string, writer: SSEWriter): () => void;
  canAttach(userId: string): boolean;
  size(): number;
}

export class StreamCapacityError extends Error {
  constructor() {
    super('too many notification streams');
    this.name = 'StreamCapacityError';
  }
}

export function formatSseFrame(notification: Notification): string {
  return `id: ${notification.id}\nevent: ${notification.kind}\ndata: ${JSON.stringify(notification)}\n\n`;
}

export function createStreamHub(options: { maxPerUser?: number; maxTotal?: number } = {}): StreamHub {
  const maxPerUser = options.maxPerUser ?? 5;
  const maxTotal = options.maxTotal ?? 500;
  const streams = new Map<string, { writer: SSEWriter }[]>();
  let total = 0;

  const remove = (userId: string, entry: { writer: SSEWriter }) => {
    const entries = streams.get(userId);
    if (!entries) return;
    const index = entries.indexOf(entry);
    if (index === -1) return;
    entries.splice(index, 1);
    total -= 1;
    if (entries.length === 0) streams.delete(userId);
  };

  return {
    publish(userId, notification) {
      const frame = formatSseFrame(notification);
      for (const entry of [...(streams.get(userId) ?? [])]) {
        void entry.writer.write(frame).catch(() => {
          remove(userId, entry);
          void entry.writer.close().catch(() => {});
        });
      }
    },
    attach(userId, writer) {
      const entries = streams.get(userId) ?? [];
      while (entries.length >= maxPerUser) {
        const oldest = entries[0]!;
        remove(userId, oldest);
        void oldest.writer.close().catch(() => {});
      }
      if (total >= maxTotal) throw new StreamCapacityError();
      const entry = { writer };
      const current = streams.get(userId) ?? [];
      current.push(entry);
      streams.set(userId, current);
      total += 1;

      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        remove(userId, entry);
      };
    },
    canAttach(userId) {
      return total < maxTotal || (streams.get(userId)?.length ?? 0) >= maxPerUser;
    },
    size() {
      return total;
    },
  };
}
