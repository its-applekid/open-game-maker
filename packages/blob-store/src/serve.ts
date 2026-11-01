import { FsBlobStore, getFsBlobPathPrefix, type BlobStore } from './fs-store.js';
import { type BlobHash } from './hash.js';
import { normalizePathPrefix, verifySignedGet } from './sign.js';

export function parseBlobRequest(url: URL, pathPrefix = '/blobs'): { hash: BlobHash; exp: number; sig: string } | null {
  let prefix: string;
  try {
    prefix = normalizePathPrefix(pathPrefix);
  } catch {
    return null;
  }

  const pathStart = `${prefix}/sha256/`;
  const hex = url.pathname.startsWith(pathStart) ? url.pathname.slice(pathStart.length) : '';
  const expValues = url.searchParams.getAll('exp');
  const sigValues = url.searchParams.getAll('sig');
  if (!/^[0-9a-f]{64}$/.test(hex) || expValues.length !== 1 || sigValues.length !== 1 || !/^\d+$/.test(expValues[0])) {
    return null;
  }

  const exp = Number(expValues[0]);
  if (!Number.isSafeInteger(exp)) return null;
  return { hash: `sha256:${hex}`, exp, sig: sigValues[0] };
}

export async function serveBlob(
  store: BlobStore,
  key: string,
  url: URL,
  nowMs = Date.now(),
): Promise<{
  status: 200 | 403 | 404;
  headers: Record<string, string>;
  stream?: NodeJS.ReadableStream;
}> {
  const prefix = store instanceof FsBlobStore ? getFsBlobPathPrefix(store) : '/blobs';
  const request = parseBlobRequest(url, prefix);
  if (!request) return { status: 404, headers: {} };

  if (!verifySignedGet(key, request, nowMs).ok) {
    return { status: 403, headers: { 'Cache-Control': 'no-store' } };
  }

  const opened = await store.open(request.hash);
  if (!opened) return { status: 404, headers: {} };

  return {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': 'sandbox',
      'Content-Disposition': 'inline',
      'Content-Length': String(opened.ref.bytes),
      'Content-Type': opened.ref.mime,
      ETag: `"${opened.ref.hash.slice('sha256:'.length)}"`,
      'X-Content-Type-Options': 'nosniff',
    },
    stream: opened.stream,
  };
}
