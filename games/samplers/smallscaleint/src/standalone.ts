import type { BuildKind } from '@gm/sdk/core';
import { SDK_PROTOCOL } from '@ogm/contracts/bridge';

export function installStandaloneHost(build: BuildKind): void {
  if (window.parent !== window) return;

  const listener = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin || typeof event.data !== 'string') return;
    let message: { t?: unknown };
    try {
      message = JSON.parse(event.data) as { t?: unknown };
    } catch {
      return;
    }
    if (message.t !== 'hello') return;

    window.removeEventListener('message', listener);
    const channel = new MessageChannel();
    channel.port1.onmessage = () => undefined;
    channel.port1.start();
    window.postMessage(
      JSON.stringify({
        v: 1,
        id: 'standalone-hello',
        t: 'hello',
        payload: {
          protocol: SDK_PROTOCOL,
          capabilities: [],
          mode: build === 'test' ? 'test' : 'play',
          build,
          playerIndex: 0,
        },
      }),
      location.origin,
      [channel.port2],
    );
  };

  window.addEventListener('message', listener);
}
