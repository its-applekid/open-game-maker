import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { serveStatic } from '../src/server.js';

describe('serveStatic', () => {
  it('drops a response for an unreadable file and keeps serving', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-serve-'));
    writeFileSync(join(root, 'index.html'), '<p>game</p>');
    writeFileSync(join(root, 'locked.js'), 'x');
    chmodSync(join(root, 'locked.js'), 0o000);
    const server = await serveStatic(root);
    try {
      await fetch(new URL('locked.js', server.url))
        .then((r) => r.text())
        .catch(() => '');
      expect(await (await fetch(server.url)).text()).toBe('<p>game</p>');
    } finally {
      await server.close();
    }
  });
});
