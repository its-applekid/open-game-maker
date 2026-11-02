import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const host = '127.0.0.1';
const port = 10_001;
const fixture = new URL('../fixtures/bridge-game/index.html', import.meta.url);

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${host}:${port}`).pathname;
  if (pathname === '/health') {
    response.writeHead(204).end();
    return;
  }
  if (!pathname.startsWith('/g/') || !pathname.endsWith('/index.html')) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  });
  response.end(await readFile(fixture));
}).listen(port, host, () => {
  process.stdout.write(`bridge fixture listening on http://${host}:${port}\n`);
});
