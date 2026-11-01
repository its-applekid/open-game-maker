import type { Envelope } from '@ogm/contracts';
import { MessageChannel, type MessagePort as NodeMessagePort } from 'node:worker_threads';

import type { Validator } from '../src/index.js';

export const hello = (id = 'hello-1'): Envelope<'hello', { protocol: number }> => ({
  v: 1,
  id,
  t: 'hello',
  payload: { protocol: 1 },
});

export const message = (id: string): Envelope<string, unknown> => ({ v: 1, id, t: 'test.message', payload: {} });

export const validate: Validator = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Envelope<string, unknown>>;
  return value.v === 1 && typeof value.id === 'string' && typeof value.t === 'string'
    ? (value as Envelope<string, unknown>)
    : null;
};

export function ports(): [MessagePort, MessagePort] {
  const channel = new MessageChannel();
  return [channel.port1 as unknown as MessagePort, channel.port2 as unknown as MessagePort];
}

export function nextData(port: MessagePort): Promise<unknown> {
  return new Promise((resolve) => (port as unknown as NodeMessagePort).once('message', resolve));
}

export function closePorts(...values: MessagePort[]): void {
  for (const port of values) port.close();
}
