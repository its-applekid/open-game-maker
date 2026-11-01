// Per-job wake-ups for open chat streams. A publish carries no row: each stream re-reads the store past its own cursor,
// so a row written between a stream's replay and its subscription is never lost or sent twice.
export interface ChatHub {
  publish(jobId: string): void;
  subscribe(jobId: string, wake: () => void): () => void;
  canSubscribe(jobId: string): boolean;
}

export function createChatHub(options: { maxPerJob?: number; maxTotal?: number } = {}): ChatHub {
  const maxPerJob = options.maxPerJob ?? 10;
  const maxTotal = options.maxTotal ?? 500;
  const listeners = new Map<string, Set<() => void>>();
  let total = 0;

  return {
    publish(jobId) {
      for (const wake of [...(listeners.get(jobId) ?? [])]) wake();
    },
    subscribe(jobId, wake) {
      const set = listeners.get(jobId) ?? new Set();
      listeners.set(jobId, set);
      set.add(wake);
      total += 1;
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        set.delete(wake);
        total -= 1;
        if (set.size === 0) listeners.delete(jobId);
      };
    },
    canSubscribe(jobId) {
      return total < maxTotal && (listeners.get(jobId)?.size ?? 0) < maxPerJob;
    },
  };
}

export function formatChatFrame(seq: number, message: unknown): string {
  return `id: ${seq}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`;
}
