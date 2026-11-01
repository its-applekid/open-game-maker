import { pathToFileURL } from 'node:url';

import { loadRoomsConfig } from './config.js';
import { createRoomsServer, type RoomsServerBundle } from './server.js';

export async function main(): Promise<RoomsServerBundle> {
  const config = loadRoomsConfig();
  const bundle = createRoomsServer(config);
  await bundle.gameServer.listen(config.port, '127.0.0.1');

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    void bundle.gameServer.gracefullyShutdown(false).finally(() => {
      process.exitCode = 0;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ event: 'server-error', service: 'rooms' }));
    process.exitCode = 1;
  });
}
