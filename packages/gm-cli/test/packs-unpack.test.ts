import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { afterEach, describe, expect, it } from 'vitest';

import { unpack } from '../src/packs/unpack.js';

const temporary: string[] = [];
const caps = { maxMembers: 100, maxUnpackedMb: 2, maxRatio: 100 };

async function directory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('unpack', () => {
  it('preflights every zip member so a late traversal leaves the destination empty', async () => {
    const root = await directory('gm-unpack-zip-');
    const archive = join(root, 'hostile.zip');
    const destination = join(root, 'out');
    await mkdir(destination);
    const zip = new AdmZip();
    zip.addFile('safe.txt', Buffer.from('safe'));
    zip.addFile('aa/escape.txt', Buffer.from('escape'));
    const bytes = zip.toBuffer();
    const safe = Buffer.from('aa/escape.txt');
    const hostile = Buffer.from('../escape.txt');
    for (let offset = bytes.indexOf(safe); offset >= 0; offset = bytes.indexOf(safe, offset + hostile.length)) {
      hostile.copy(bytes, offset);
    }
    await writeFile(archive, bytes);

    await expect(unpack(archive, destination, caps)).rejects.toThrow(/escape|unsafe|path/i);
    expect(await readdir(destination)).toEqual([]);
  });

  it('refuses tar links before extraction', async () => {
    const root = await directory('gm-unpack-tar-');
    const source = join(root, 'source');
    const destination = join(root, 'out');
    await mkdir(source);
    await mkdir(destination);
    await writeFile(join(source, 'target.txt'), 'target');
    await symlink('target.txt', join(source, 'link.txt'));
    const archive = join(root, 'hostile.tgz');
    await tar.c({ gzip: true, cwd: source, file: archive }, ['target.txt', 'link.txt']);

    await expect(unpack(archive, destination, caps)).rejects.toThrow(/link/i);
    expect(await readdir(destination)).toEqual([]);
  });

  it('refuses a tar compression bomb before publishing any files', async () => {
    const root = await directory('gm-unpack-ratio-');
    const source = join(root, 'source');
    const destination = join(root, 'out');
    await mkdir(source);
    await mkdir(destination);
    await writeFile(join(source, 'zeros.bin'), Buffer.alloc(2 * 1024 * 1024));
    const archive = join(root, 'bomb.tgz');
    await tar.c({ gzip: true, cwd: source, file: archive }, ['zeros.bin']);

    await expect(unpack(archive, destination, { ...caps, maxUnpackedMb: 3, maxRatio: 2 })).rejects.toThrow(/ratio/i);
    expect(await readdir(destination)).toEqual([]);
  });

  it('extracts one nested archive pass and drops executable files', async () => {
    const root = await directory('gm-unpack-nested-');
    const archive = join(root, 'outer.zip');
    const inner = new AdmZip();
    inner.addFile('model.obj', Buffer.from('o cube'));
    inner.addFile('installer.exe', Buffer.from('MZ'));
    const outer = new AdmZip();
    outer.addFile('wrapper/inner.zip', inner.toBuffer());
    outer.writeZip(archive);

    const result = await unpack(archive, join(root, 'out'), caps);
    expect(result.nested).toBe(1);
    expect(result.dropped).toContain('inner/installer.exe');
    expect(await readFile(join(root, 'out', 'inner', 'model.obj'), 'utf8')).toBe('o cube');
  });
});
