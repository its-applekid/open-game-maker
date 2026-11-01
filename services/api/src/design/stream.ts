import type { Transaction } from '@ogm/contracts';

export type TransactionListener = (transaction: Transaction) => void;

export interface DesignStreamHub {
  publish(branchId: string, transaction: Transaction): void;
  subscribe(branchId: string, listener: TransactionListener): () => void;
  size(): number;
}

export function formatTransactionFrame(transaction: Transaction): string {
  return `id: ${transaction.rev}\nevent: tx\ndata: ${JSON.stringify(transaction)}\n\n`;
}

export function createDesignStreamHub(): DesignStreamHub {
  const listeners = new Map<string, Set<TransactionListener>>();

  return {
    publish(branchId, transaction) {
      for (const listener of listeners.get(branchId) ?? []) listener(transaction);
    },
    subscribe(branchId, listener) {
      const branchListeners = listeners.get(branchId) ?? new Set<TransactionListener>();
      branchListeners.add(listener);
      listeners.set(branchId, branchListeners);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        branchListeners.delete(listener);
        if (branchListeners.size === 0) listeners.delete(branchId);
      };
    },
    size() {
      let total = 0;
      for (const branchListeners of listeners.values()) total += branchListeners.size;
      return total;
    },
  };
}
