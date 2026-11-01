import type { ActionFrame, Envelope, GmTestHooks } from '@ogm/contracts';

import type { SendEnvelope } from '../core/host-api.js';

type Payload = Record<string, unknown>;

export function dispatchTest(envelope: Envelope<string, unknown>, hooks: GmTestHooks, send: SendEnvelope): boolean {
  if (!envelope.t.startsWith('test.')) return false;

  try {
    const payload = envelope.payload as Payload;
    let value: unknown;
    switch (envelope.t) {
      case 'test.advanceTime':
        hooks.advanceTime(payload.ms as number);
        break;
      case 'test.renderAt':
        hooks.renderAt(payload.ms as number);
        break;
      case 'test.renderGameToText':
        value = hooks.renderGameToText();
        break;
      case 'test.renderInfo':
        value = hooks.renderInfo();
        break;
      case 'test.hitTest':
        value = hooks.hitTest(payload.nx as number, payload.ny as number);
        break;
      case 'test.setSeed':
        hooks.setSeed(payload.seed as number);
        break;
      case 'test.seed':
        value = hooks.seed();
        break;
      case 'test.inject':
        hooks.inject(payload as ActionFrame);
        break;
      case 'test.probes':
        value = hooks.probes();
        break;
      case 'test.events':
        value = hooks.events(payload.since as number);
        break;
      default:
        return false;
    }
    send('test.result', value === undefined ? { ok: true } : { ok: true, value }, envelope.id);
  } catch (error) {
    send('test.result', { ok: false, error: String(error) }, envelope.id);
  }
  return true;
}
