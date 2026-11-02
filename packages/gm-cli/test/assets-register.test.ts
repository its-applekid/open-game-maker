import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import { preparedLibrary, useOrc } from './assets-fixture.js';
import { gm, tempDir } from './helpers.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

async function gameRepo(): Promise<{ cwd: string; root: string }> {
  const cwd = tempDir();
  const root = preparedLibrary();
  await useOrc(cwd, root);
  return { cwd, root };
}

function writeAsset(cwd: string, path: string, content: string): void {
  mkdirSync(join(cwd, path, '..'), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function storedBlobs(blobRoot: string): string[] {
  return readdirSync(join(blobRoot, 'blobs/sha256')).filter((name) => !name.endsWith('.json'));
}

function lockEntry(cwd: string, id: string) {
  const lock = JSON.parse(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
  return lock.assets.find((entry) => entry.id === id);
}

describe('gm assets register keeps tier-3 bytes in the blob store (D-ASSETS-REFERENCE)', () => {
  it('moves the file into the blob store and leaves only a blob-sourced lock entry in the repo', async () => {
    const { cwd, root } = await gameRepo();
    const blobRoot = tempDir('gm-blobs-');
    writeAsset(cwd, 'assets/model/boss-door.glb', 'door-bytes');

    const result = await gm(['assets', 'register', 'assets/model/boss-door.glb', '--made-by-agent', '--game', 'g1'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root, OGM_BLOB_ROOT: blobRoot },
    });

    expect(result.code).toBe(0);
    expect(existsSync(join(cwd, 'assets/model/boss-door.glb'))).toBe(false);
    expect(readFileSync(join(blobRoot, 'blobs/sha256', sha('door-bytes')), 'utf8')).toBe('door-bytes');
    expect(lockEntry(cwd, 't3:g1/model/boss-door')).toMatchObject({
      sha256: sha('door-bytes'),
      source: 'blob',
      path: 'assets/model/boss-door.glb',
    });
  });

  it('stores identical bytes once when they are registered twice', async () => {
    const { cwd, root } = await gameRepo();
    const blobRoot = tempDir('gm-blobs-');
    const env = { OGM_ASSETS_ROOT: root, OGM_BLOB_ROOT: blobRoot };
    for (const path of ['assets/model/a.glb', 'assets/model/b.glb']) {
      writeAsset(cwd, path, 'same-bytes');
      expect((await gm(['assets', 'register', path, '--made-by-agent', '--game', 'g1'], { cwd, env })).code).toBe(0);
    }

    expect(storedBlobs(blobRoot)).toEqual([sha('same-bytes')]);
    expect(lockEntry(cwd, 't3:g1/model/a')?.sha256).toBe(lockEntry(cwd, 't3:g1/model/b')?.sha256);
  });

  it('refuses without a blob store and keeps the file and the lock untouched', async () => {
    const { cwd, root } = await gameRepo();
    writeAsset(cwd, 'assets/model/spark.glb', 'spark');
    const lockBefore = readFileSync(join(cwd, 'assets.lock.json'), 'utf8');

    const result = await gm(['assets', 'register', 'assets/model/spark.glb', '--made-by-agent', '--game', 'g1'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });

    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toContain('no blob store');
    expect(readFileSync(join(cwd, 'assets/model/spark.glb'), 'utf8')).toBe('spark');
    expect(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')).toBe(lockBefore);
  });

  it("puts the bytes through the API's daemon blob route with the hook secret inside a sandboxed daemon", async () => {
    const { cwd, root } = await gameRepo();
    const secretFile = join(tempDir('gm-secret-'), 'hook-secret');
    writeFileSync(secretFile, 'daemon-secret\n');
    writeAsset(cwd, 'assets/model/door.glb', 'door-bytes');
    const seen: { method?: string; url?: string; auth?: string; body: string }[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        seen.push({
          method: req.method,
          url: req.url,
          auth: req.headers.authorization,
          body: Buffer.concat(chunks).toString(),
        });
        res.writeHead(201, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address() as AddressInfo;
      const result = await gm(['assets', 'register', 'assets/model/door.glb', '--made-by-agent', '--game', 'g1'], {
        cwd,
        env: {
          OGM_ASSETS_ROOT: root,
          OGM_INTERNAL_URL: `http://127.0.0.1:${port}`,
          OGM_HOOK_SECRET_FILE: secretFile,
        },
      });
      expect(result.code).toBe(0);
    } finally {
      server.close();
    }

    expect(seen).toEqual([
      {
        method: 'PUT',
        url: `/blobs/daemon/sha256/${sha('door-bytes')}`,
        auth: 'Bearer daemon-secret',
        body: 'door-bytes',
      },
    ]);
    expect(existsSync(join(cwd, 'assets/model/door.glb'))).toBe(false);
  });
});
