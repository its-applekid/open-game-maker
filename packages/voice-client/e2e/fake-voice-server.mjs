import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
]);

function silence(sampleRate, seconds) {
  return Buffer.alloc(sampleRate * seconds * 2).toString('base64');
}

export async function startFakeVoiceServer() {
  const stats = {
    connections: 0,
    audioBytes: [],
    receivedTypes: [],
    confirmedDrafts: [],
  };
  const sockets = new Set();
  const websocket = new WebSocketServer({ noServer: true });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/stats') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(stats));
      return;
    }

    const relative = url.pathname === '/' ? 'e2e/page.html' : url.pathname.slice(1);
    const file = resolve(root, relative);
    if (!file.startsWith(`${root}/`)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/voice') {
      socket.destroy();
      return;
    }
    websocket.handleUpgrade(request, socket, head, (client) => {
      websocket.emit('connection', client, request);
    });
  });

  websocket.on('connection', (socket, request) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    stats.connections += 1;
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.searchParams.get('token') !== 'good') {
      queueMicrotask(() => socket.close(4401, 'unauthorized'));
      return;
    }

    let responseSent = false;
    socket.on('message', (data) => {
      const frame = JSON.parse(data.toString());
      stats.receivedTypes.push(frame.type);

      if (frame.type === 'start') {
        socket.send(
          JSON.stringify({
            v: 1,
            type: 'state',
            state: 'listening',
            capabilities: { text: true },
          }),
        );
      }

      if (frame.type === 'audio') {
        stats.audioBytes.push(Buffer.from(frame.data_b64, 'base64').byteLength);
        if (stats.audioBytes.length >= 5 && !responseSent) {
          responseSent = true;
          socket.send(
            JSON.stringify({
              v: 1,
              type: 'agent_text',
              turn_id: 'turn-1',
              text: 'I made a draft.',
              final: true,
            }),
          );
          socket.send(
            JSON.stringify({
              v: 1,
              type: 'agent_audio',
              turn_id: 'turn-1',
              format: 'pcm_24000',
              data_b64: silence(24_000, 1),
            }),
          );
          socket.send(
            JSON.stringify({
              v: 1,
              type: 'draft',
              draft_id: 'draft-1',
              kind: 'instruction',
              target: { id: 'ticket-42' },
              text: 'Add a locked door.',
              status: 'proposed',
            }),
          );
          setTimeout(() => {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ v: 1, type: 'interrupted', turn_id: 'turn-1' }));
            }
          }, 150);
        }
      }

      if (frame.type === 'confirm_draft') stats.confirmedDrafts.push(frame.draft_id);
    });
  });

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake server has no TCP port');

  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets) socket.terminate();
      websocket.close();
      await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
    },
  };
}
