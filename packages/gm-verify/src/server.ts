import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, sep } from 'node:path';
import { pipeline } from 'node:stream';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

/** A static file server for a built game on `127.0.0.1` and an ephemeral port; never serves outside `dir`. */
export async function serveStatic(dir: string): Promise<{ url: string; close(): Promise<void> }> {
  const root = realpathSync(dir);
  const server = createServer((req, res) => {
    let path: string;
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
      path = realpathSync(join(root, pathname));
      if (statSync(path).isDirectory()) path = realpathSync(join(path, 'index.html'));
    } catch {
      res.writeHead(404).end();
      return;
    }
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream' });
    /* an unreadable file must drop this response, not crash the runner */
    pipeline(createReadStream(path), res, () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** `gm run` only drives pages on this machine's loopback (T11). */
export function isLoopbackUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
}
