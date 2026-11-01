import type { Envelope } from '@ogm/contracts';
import { BridgeError } from './errors.js';
import { waitForHello } from './port.js';
import type { Bridge, Validator } from './types.js';
// prettier-ignore
export interface GameBridgeOptions { hostOrigin: string; validate: Validator; onMessage: (env: Envelope<string, unknown>) => void; helloPayload: unknown; }
let nextHelloId = 0;
// prettier-ignore
export function openGameBridge(opts: GameBridgeOptions): Bridge {
  const gameWindow = window;
  const hello: Envelope<'hello', unknown> = { v: 1, id: `g-${++nextHelloId}`, t: 'hello', payload: opts.helloPayload };
  const timer: { id?: number } = {};
  const cleanup = () => { if (timer.id !== undefined) gameWindow.clearInterval(timer.id); };
  const shell = waitForHello(
    { ...opts, localWindow: gameWindow, origin: opts.hostOrigin, cleanup },
    (event, connect) => { if (event.ports[0]) connect(event.ports[0]); },
  );
  let attempts = 0;
  const postHello = () => {
    if (attempts === 20) return shell.fail(new BridgeError('timeout'));
    attempts += 1;
    gameWindow.parent.postMessage(JSON.stringify(hello), opts.hostOrigin);
  };
  timer.id = gameWindow.setInterval(postHello, 250);
  postHello();
  return shell;
}
