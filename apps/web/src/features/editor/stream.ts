import type { Transaction } from '@ogm/contracts';

import { openTransactionStream, parseTransactionEvent } from './api';

type TransactionEventListener = (event: MessageEvent<string>) => void;

export type TransactionEventSource = {
  addEventListener(name: string, listener: TransactionEventListener): void;
  removeEventListener(name: string, listener: TransactionEventListener): void;
  close(): void;
};

export type TransactionStreamOptions = {
  gameId: string;
  branch: string;
  after: number;
  receive(transaction: Transaction): void;
  onError?(): void;
  open?(gameId: string, branch: string, after: number): TransactionEventSource;
};

export function connectTransactionStream(options: TransactionStreamOptions): { close(): void } {
  const source = (options.open ?? defaultOpen)(options.gameId, options.branch, options.after);
  const receive: TransactionEventListener = (event) => options.receive(parseTransactionEvent(event));
  const error: TransactionEventListener = () => options.onError?.();
  source.addEventListener('tx', receive);
  source.addEventListener('error', error);
  let closed = false;

  return {
    close() {
      if (closed) return;
      closed = true;
      source.removeEventListener('tx', receive);
      source.removeEventListener('error', error);
      source.close();
    },
  };
}

function defaultOpen(gameId: string, branch: string, after: number): TransactionEventSource {
  return openTransactionStream(gameId, branch, after) as unknown as TransactionEventSource;
}
