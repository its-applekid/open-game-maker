import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdtemp, open, readlink, realpath, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import type { BlobHash, BlobStore } from '@ogm/blob-store';
import sharp from 'sharp';

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const MEDIA_DIR = join('.gm', 'outbox', 'media');

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const MIN_READ_BUFFER = 64 * 1024;
const run = promisify(execFile);

export class MediaError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MediaError';
  }
}

export type Probed = { bytes: Buffer; mime: string; width: number; height: number; durationMs?: number };
export type MediaOptions = { ffprobe?: string };

// Reads at most the configured limit plus one sentinel byte. The buffer grows only if the descriptor does, so normal
// images do not pay the 25 MiB ceiling while a file that grows after stat still cannot trigger an unbounded read.
async function readMediaBytes(handle: Pick<FileHandle, 'read'>, expectedBytes: number): Promise<Buffer> {
  const limit = MAX_MEDIA_BYTES + 1;
  let bytes = Buffer.allocUnsafe(Math.min(limit, Math.max(MIN_READ_BUFFER, expectedBytes + 1)));
  let offset = 0;
  for (;;) {
    if (offset === bytes.length) {
      if (bytes.length === limit) throw new MediaError('media_too_large');
      const grown = Buffer.allocUnsafe(Math.min(limit, bytes.length * 2));
      bytes.copy(grown, 0, 0, offset);
      bytes = grown;
    }
    const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
    if (offset > MAX_MEDIA_BYTES) throw new MediaError('media_too_large');
  }
  return bytes.subarray(0, offset);
}

// Reads a workspace-relative file that must live inside `<workspace>/.gm/outbox/media/`. The check runs on the opened
// descriptor (its /proc link), so a symlink or a directory swapped in after the check cannot point the read elsewhere.
export async function readOutboxMedia(workspaceRoot: string, relative: string): Promise<Buffer> {
  const candidate = resolve(workspaceRoot, relative);
  if (isAbsolute(relative) || !candidate.startsWith(resolve(workspaceRoot, MEDIA_DIR) + sep)) {
    throw new MediaError('outbox_path_outside_workspace');
  }
  let mediaDir: string;
  try {
    mediaDir = await realpath(join(workspaceRoot, MEDIA_DIR));
  } catch {
    throw new MediaError('outbox_path_outside_workspace');
  }
  if (mediaDir !== join(await realpath(workspaceRoot), MEDIA_DIR))
    throw new MediaError('outbox_path_outside_workspace');

  let handle;
  try {
    handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new MediaError(code === 'ENOENT' ? 'media_missing' : 'outbox_path_outside_workspace');
  }
  try {
    const opened = await readlink(`/proc/self/fd/${handle.fd}`);
    if (!opened.startsWith(mediaDir + sep)) throw new MediaError('outbox_path_outside_workspace');
    const stats = await handle.stat();
    if (!stats.isFile()) throw new MediaError('media_not_a_file');
    if (stats.size > MAX_MEDIA_BYTES) throw new MediaError('media_too_large');
    return await readMediaBytes(handle, stats.size);
  } finally {
    await handle.close();
  }
}

// Sniffs the content, not the name: png, jpeg or webp.
export async function probeImage(bytes: Buffer): Promise<Probed> {
  let metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    throw new MediaError('media_unreadable');
  }
  const mime = metadata.format === undefined ? undefined : IMAGE_MIME[metadata.format];
  if (mime === undefined || !metadata.width || !metadata.height) throw new MediaError('media_unsupported');
  return { bytes, mime, width: metadata.width, height: metadata.height };
}

// H.264 MP4 only (gm-verify's output). ffprobe reads a private copy, never the workspace file.
export async function probeClip(bytes: Buffer, options: MediaOptions = {}): Promise<Probed> {
  const directory = await mkdtemp(join(tmpdir(), 'ogm-chat-probe-'));
  const file = join(directory, 'clip.mp4');
  try {
    await writeFile(file, bytes, { mode: 0o600 });
    let stdout: string;
    try {
      ({ stdout } = await run(
        options.ffprobe ?? '/usr/bin/ffprobe',
        ['-v', 'error', '-show_entries', 'stream=width,height:format=duration,format_name', '-of', 'json', file],
        { timeout: 15_000, maxBuffer: 1024 * 1024 },
      ));
    } catch (error) {
      throw new MediaError(
        (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'ffprobe_unavailable' : 'media_unreadable',
      );
    }
    const report = JSON.parse(stdout) as {
      streams?: { width?: number; height?: number }[];
      format?: { duration?: string; format_name?: string };
    };
    if (!(report.format?.format_name ?? '').split(',').includes('mp4')) throw new MediaError('media_unsupported');
    const video = report.streams?.find((stream) => stream.width && stream.height);
    if (!video?.width || !video.height) throw new MediaError('media_unsupported');
    const seconds = Number(report.format?.duration);
    return {
      bytes,
      mime: 'video/mp4',
      width: video.width,
      height: video.height,
      ...(Number.isFinite(seconds) ? { durationMs: Math.round(seconds * 1000) } : {}),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export type PutMediaResult = { hash: BlobHash; width: number; height: number; durationMs?: number };

// Copies one outbox file into the blob store after it passes the path, size and format checks.
export async function putMedia(
  blobStore: BlobStore,
  workspaceRoot: string,
  relative: string,
  kind: 'image' | 'clip',
  options: MediaOptions = {},
): Promise<PutMediaResult> {
  const bytes = await readOutboxMedia(workspaceRoot, relative);
  const probed = kind === 'image' ? await probeImage(bytes) : await probeClip(bytes, options);
  const { hash } = await blobStore.put(probed.bytes, probed.mime);
  return {
    hash,
    width: probed.width,
    height: probed.height,
    ...(probed.durationMs === undefined ? {} : { durationMs: probed.durationMs }),
  };
}

export function mediaSigner(blobStore: BlobStore, ttlMs = 24 * 60 * 60 * 1000) {
  return async (hash: BlobHash) => (await blobStore.signedGet(hash, new Date(Date.now() + ttlMs))).url;
}
