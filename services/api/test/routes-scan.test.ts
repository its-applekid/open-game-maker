import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app/app.js';
import { scanRoutes } from '../src/app/routes-scan.js';
import { makeApp, makeDeps } from './helpers.js';

// Temp contexts live inside the package so their `import 'hono'` resolves like a real context.
const roots: string[] = [];
function tempRoot(contexts: Record<string, Record<string, string>>): URL {
  const root = mkdtempSync(join(import.meta.dirname, '.scan-'));
  roots.push(root);
  for (const [context, files] of Object.entries(contexts)) {
    mkdirSync(join(root, context), { recursive: true });
    for (const [name, source] of Object.entries(files)) writeFileSync(join(root, context, name), source);
  }
  return pathToFileURL(`${root}/`);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ping = `import { Hono } from 'hono';\nexport default new Hono().get('/ping', (c) => c.text('pong'));\n`;

async function scan(root: URL) {
  const deps = makeDeps();
  const app = createApp(deps);
  return { app, deps, ...(await scanRoutes(app, { deps, root })) };
}

describe('scanRoutes', () => {
  it('mounts a context by its directory name under /api/v1', async () => {
    const { app, mounted } = await scan(tempRoot({ 'zz-test': { 'routes.ts': ping } }));
    expect(mounted).toEqual([{ prefix: '/api/v1/zz-test', file: 'zz-test/routes.ts' }]);
    const response = await app.request('/api/v1/zz-test/ping');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pong');
  });

  it('ignores contexts without routes.ts, stray files and the app directory', async () => {
    const { mounted } = await scan(
      tempRoot({
        empty: { 'service.ts': ping },
        app: { 'routes.ts': ping },
        Bad_Name: { 'routes.ts': ping },
      }),
    );
    expect(mounted).toEqual([]);
  });

  it('honours an exported prefix and runs setup with the deps first', async () => {
    const source = `import { Hono } from 'hono';
export const prefix = '/internal/x';
let seen = 'no';
export function setup(deps) { seen = deps.version; }
export default new Hono().get('/seen', (c) => c.text(seen));
`;
    const { app } = await scan(tempRoot({ x: { 'routes.ts': source } }));
    expect(await (await app.request('/internal/x/seen')).text()).toBe('test-version');
    expect((await app.request('/api/v1/x/seen')).status).toBe(404);
  });

  it('fails boot naming the file when the default export is not a Hono app', async () => {
    const root = tempRoot({ broken: { 'routes.ts': 'export default { fetch() {} };\n' } });
    await expect(scan(root)).rejects.toThrow(/broken\/routes\.ts: default export must be a Hono app/);
  });

  it('fails boot when two contexts claim one prefix', async () => {
    const same = `import { Hono } from 'hono';\nexport const prefix = '/same';\nexport default new Hono();\n`;
    await expect(scan(tempRoot({ a: { 'routes.ts': same }, b: { 'routes.ts': same } }))).rejects.toThrow(
      /prefix \/same is already mounted/,
    );
  });

  it('allows contexts with non-overlapping absolute routes to share the root prefix', async () => {
    const first = `import { Hono } from 'hono';\nexport const prefix = '/';\nexport default new Hono().get('/one', (c) => c.text('one'));\n`;
    const second = `import { Hono } from 'hono';\nexport const prefix = '/';\nexport const allowSharedPrefix = true;\nexport default new Hono().get('/two', (c) => c.text('two'));\n`;
    const { app, mounted } = await scan(tempRoot({ a: { 'routes.ts': first }, b: { 'routes.ts': second } }));
    expect(mounted.map(({ prefix }) => prefix)).toEqual(['/', '/']);
    expect(await (await app.request('/one')).text()).toBe('one');
    expect(await (await app.request('/two')).text()).toBe('two');
  });

  it('mounts the shipped contexts', async () => {
    const { mounted } = await makeApp();
    expect(mounted.map(({ prefix }) => prefix)).toEqual(['/blobs', '/', '/']);
  });
});
