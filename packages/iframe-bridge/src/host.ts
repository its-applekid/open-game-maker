import type { Envelope } from '@ogm/contracts/bridge';
import { waitForHello } from './port.js';
import type { Bridge, Validator } from './types.js';
// prettier-ignore
export interface HostBridgeOptions { gameOrigin: string; validate: Validator; onMessage: (env: Envelope<string, unknown>) => void; hello: Envelope<'hello', unknown>; }
// prettier-ignore
export function openHostBridge(iframe: HTMLIFrameElement, opts: HostBridgeOptions): Bridge {
  const frame = iframe.contentWindow!;
  return waitForHello(
    { ...opts, localWindow: window, origin: opts.gameOrigin, source: frame },
    (_event, connect) => {
      const channel = new MessageChannel();
      frame.postMessage(JSON.stringify(opts.hello), opts.gameOrigin, [channel.port2]);
      connect(channel.port1);
    },
  );
}
