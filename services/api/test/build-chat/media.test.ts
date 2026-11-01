import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, open, readFile, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { MAX_MEDIA_BYTES, MediaError, probeClip, putMedia } from '../../src/build-chat/media.js';
import { makeDeps } from '../helpers.js';
import { FIXTURES } from './setup.js';

const fixture = (name: string) => fileURLToPath(new URL(name, FIXTURES));

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ogm-chat-ws-'));
  await mkdir(join(root, '.gm', 'outbox', 'media'), { recursive: true });
  await copyFile(fixture('tiny.png'), join(root, '.gm/outbox/media/tiny.png'));
  await copyFile(fixture('tiny.mp4'), join(root, '.gm/outbox/media/tiny.mp4'));
  return root;
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof MediaError ? error.code : String(error)),
  );

describe('outbox media', () => {
  it('copies an image into the blob store with its size', async () => {
    const { blobStore } = makeDeps();
    const root = await workspace();
    const media = await putMedia(blobStore, root, '.gm/outbox/media/tiny.png', 'image');
    expect(media).toMatchObject({ width: 64, height: 48 });
    expect(await blobStore.head(media.hash)).toMatchObject({ mime: 'image/png' });
  });

  it.skipIf(!existsSync('/usr/bin/ffprobe'))('reads a clip size and duration with ffprobe', async () => {
    const { blobStore } = makeDeps();
    const media = await putMedia(blobStore, await workspace(), '.gm/outbox/media/tiny.mp4', 'clip');
    expect(media).toMatchObject({ width: 64, height: 48, durationMs: 1000 });
    expect(await blobStore.head(media.hash)).toMatchObject({ mime: 'video/mp4' });
  });

  // Runs where ffprobe is not installed: the parsing and the MP4-only rule do not depend on the binary.
  it('takes the clip size from the video stream and rejects non-MP4 containers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ogm-fake-ffprobe-'));
    const fake = (report: unknown) => {
      const file = join(dir, `ffprobe-${Math.random().toString(36).slice(2)}`);
      return writeFile(file, `#!/bin/sh\necho '${JSON.stringify(report)}'\n`)
        .then(() => chmod(file, 0o700))
        .then(() => file);
    };
    const mp4 = await fake({
      streams: [{}, { width: 640, height: 360 }],
      format: { format_name: 'mov,mp4,m4a', duration: '4.2506' },
    });
    expect(await probeClip(Buffer.from('x'), { ffprobe: mp4 })).toMatchObject({
      width: 640,
      height: 360,
      durationMs: 4251,
      mime: 'video/mp4',
    });
    const webm = await fake({ streams: [{ width: 640, height: 360 }], format: { format_name: 'matroska,webm' } });
    expect(await code(probeClip(Buffer.from('x'), { ffprobe: webm }))).toBe('media_unsupported');
    expect(await code(probeClip(Buffer.from('x'), { ffprobe: join(dir, 'missing') }))).toBe('ffprobe_unavailable');
  });

  // The sandboxed agent controls every byte of the workspace; none of these may read outside its media directory.
  it.each([
    ['a parent traversal', '.gm/outbox/media/../../../../../etc/passwd'],
    ['an absolute path', '/etc/passwd'],
    ['a file outside the media directory', '.gm/outbox/chat.jsonl'],
  ])('rejects %s', async (_label, relative) => {
    const { blobStore } = makeDeps();
    const root = await workspace();
    await writeFile(join(root, '.gm/outbox/chat.jsonl'), '{}\n');
    expect(await code(putMedia(blobStore, root, relative, 'image'))).toBe('outbox_path_outside_workspace');
  });

  it('rejects a symlink that leaves the media directory', async () => {
    const { blobStore } = makeDeps();
    const root = await workspace();
    const secret = join(await mkdtemp(join(tmpdir(), 'ogm-secret-')), 'secret.png');
    await copyFile(fixture('tiny.png'), secret);
    await symlink(secret, join(root, '.gm/outbox/media/link.png'));
    expect(await code(putMedia(blobStore, root, '.gm/outbox/media/link.png', 'image'))).toBe(
      'outbox_path_outside_workspace',
    );
  });

  it('rejects a media directory that is itself a symlink out of the workspace', async () => {
    const { blobStore } = makeDeps();
    const root = await mkdtemp(join(tmpdir(), 'ogm-chat-ws-'));
    const elsewhere = await mkdtemp(join(tmpdir(), 'ogm-elsewhere-'));
    await copyFile(fixture('tiny.png'), join(elsewhere, 'tiny.png'));
    await mkdir(join(root, '.gm', 'outbox'), { recursive: true });
    await symlink(elsewhere, join(root, '.gm/outbox/media'));
    expect(await code(putMedia(blobStore, root, '.gm/outbox/media/tiny.png', 'image'))).toBe(
      'outbox_path_outside_workspace',
    );
  });

  it('rejects files over 25 MiB before reading them', async () => {
    const { blobStore } = makeDeps();
    const root = await workspace();
    const big = join(root, '.gm/outbox/media/big.png');
    await writeFile(big, await readFile(fixture('tiny.png')));
    await truncate(big, 30 * 1024 * 1024);
    expect(await code(putMedia(blobStore, root, '.gm/outbox/media/big.png', 'image'))).toBe('media_too_large');
  });

  it('bounds descriptor reads even if the file grows after its initial stat', async () => {
    const { blobStore } = makeDeps();
    const root = await workspace();
    const big = join(root, '.gm/outbox/media/growing.png');
    await writeFile(big, await readFile(fixture('tiny.png')));
    const handle = await open(big, 'r');
    const prototype = Object.getPrototypeOf(handle) as typeof handle;
    await handle.close();
    const originalStat = prototype.stat;
    const stat = vi.spyOn(prototype, 'stat').mockImplementation(async function () {
      const result = await originalStat.call(this);
      await truncate(big, MAX_MEDIA_BYTES + 1);
      return result;
    });
    const readFileSpy = vi.spyOn(prototype, 'readFile').mockRejectedValue(new Error('unbounded read'));
    try {
      expect(await code(putMedia(blobStore, root, '.gm/outbox/media/growing.png', 'image'))).toBe('media_too_large');
      expect(readFileSpy).not.toHaveBeenCalled();
    } finally {
      stat.mockRestore();
      readFileSpy.mockRestore();
    }
  });

  it('sniffs content instead of trusting the name', async () => {
    const { blobStore } = makeDeps();
    const root = await workspace();
    await writeFile(join(root, '.gm/outbox/media/fake.png'), 'not an image');
    expect(await code(putMedia(blobStore, root, '.gm/outbox/media/fake.png', 'image'))).toBe('media_unreadable');
  });
});
