import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function html(response: ServerResponse, body: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
}

async function file(response: ServerResponse, path: string, headers: Record<string, string> = {}): Promise<void> {
  response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', ...headers });
  response.end(await readFile(path));
}

const app = createServer(async (request, response) => {
  if (request.url === '/health') return response.end('ok');
  if (request.url === '/app.js') return file(response, `${root}/dist/test/app/main.js`);
  return html(
    response,
    '<!doctype html><meta charset="utf-8"><style>html,body,#game{margin:0;width:100%;height:100%}</style><div id="game"></div><script type="module" src="/app.js"></script>',
  );
});

const game = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1:4174').pathname;
  if (path === '/game.js') return file(response, `${root}/dist/test/stub-game/main.js`);
  if (path === '/game-cache.js') {
    return file(response, `${root}/dist/game-cache.js`, { 'service-worker-allowed': '/g/' });
  }
  if (path === '/forger.html') {
    return html(
      response,
      '<script>parent.postMessage(JSON.stringify({v:1,id:"forged",t:"ready",payload:{protocol:1,manifest:{},marks:[]}}),"http://127.0.0.1:4173")</script>',
    );
  }
  if (path.endsWith('/assets/x.3f9a.glb')) {
    response.writeHead(200, { 'content-type': 'model/gltf-binary', 'cache-control': 'no-store' });
    return response.end('fixture-asset');
  }
  return html(
    response,
    '<!doctype html><meta charset="utf-8"><style>#canvas{width:160px;height:160px;background:#123}</style><button id="relay">relay audio</button><div id="canvas">game canvas</div><script type="module" src="/game.js"></script>',
  );
});

app.listen(4173, '127.0.0.1');
game.listen(4174, '127.0.0.1');

const close = () => {
  app.close();
  game.close();
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
