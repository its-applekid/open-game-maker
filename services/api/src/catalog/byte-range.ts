import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

/** A media file on disk, already confined to the assets root by the route that resolved it. */
export type MediaFile = { path: string; bytes: number; mime: string };

/** `bytes=a-b`, `bytes=a-` or `bytes=-n`, clamped to the file; `undefined` for a malformed or unsatisfiable range. */
export function byteRange(value: string, bytes: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || bytes === 0) return undefined;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length <= 0) return undefined;
    return { start: Math.max(0, bytes - length), end: bytes - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : bytes - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= bytes || requestedEnd < start)
    return undefined;
  return { start, end: Math.min(requestedEnd, bytes - 1) };
}

/**
 * Streams a media file with `Accept-Ranges: bytes`: a whole file for 200, the requested slice for 206, or a 416 that
 * names the total when the range cannot be satisfied. A phone starts playing before the whole file arrives.
 */
export function streamMedia(file: MediaFile, requested: string | undefined): Response {
  const headers: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=300',
    'Content-Type': file.mime,
  };
  const body = (start?: number, end?: number) =>
    Readable.toWeb(createReadStream(file.path, { start, end })) as ReadableStream;
  if (!requested) {
    headers['Content-Length'] = String(file.bytes);
    return new Response(body(), { status: 200, headers });
  }
  const range = byteRange(requested, file.bytes);
  if (!range) {
    headers['Content-Range'] = `bytes */${file.bytes}`;
    return new Response(null, { status: 416, headers });
  }
  headers['Content-Length'] = String(range.end - range.start + 1);
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.bytes}`;
  return new Response(body(range.start, range.end), { status: 206, headers });
}
