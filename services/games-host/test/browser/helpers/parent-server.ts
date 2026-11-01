import { createServer, type Server } from 'node:http';
import { once } from 'node:events';

export interface TestServer {
  close(): Promise<void>;
  origin: string;
}

export async function startTestServer(handler: Parameters<typeof createServer>[0]): Promise<TestServer> {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server did not bind a TCP port');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function closeServer(server: Server): Promise<void> {
  server.close();
  await once(server, 'close');
}
