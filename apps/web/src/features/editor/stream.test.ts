import { describe, expect, it, vi } from 'vitest';

import type { Transaction } from '@ogm/contracts/browser';

import { connectTransactionStream } from './stream';

class FakeEventSource {
  readonly listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();
  readonly close = vi.fn();

  addEventListener(name: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  emit(name: string, transaction: Transaction): void {
    const event = new MessageEvent(name, { data: JSON.stringify(transaction) });
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
}

describe('transaction stream', () => {
  it('forwards parsed transactions and closes idempotently', () => {
    const source = new FakeEventSource();
    const receive = vi.fn();
    const transaction = { rev: 5 } as Transaction;
    const stream = connectTransactionStream({
      gameId: 'game',
      branch: 'main',
      after: 4,
      receive,
      open: () => source,
    });

    source.emit('tx', transaction);
    stream.close();
    stream.close();
    source.emit('tx', { rev: 6 } as Transaction);

    expect(receive).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledWith(transaction);
    expect(source.close).toHaveBeenCalledOnce();
  });
});
