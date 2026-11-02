import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import { safeOutput } from './thumbnail-paths.mjs';

const PAGE_LIMIT = 2 * 1024 * 1024;
const MEDIA_LIMIT = 20 * 1024 * 1024;
const MEDIA_COUNT_LIMIT = 64;

function validItchPage(url, expectedHost) {
  return (
    url.protocol === 'https:' &&
    /^[a-z0-9-]+\.itch\.io$/.test(url.hostname) &&
    (!expectedHost || url.hostname === expectedHost)
  );
}

function validMediaUrl(url) {
  return url.protocol === 'https:' && url.hostname === 'img.itch.zone' && !url.username && !url.password;
}

export function extractItchMedia(html, pageUrl) {
  const found = [];
  const attributes = /(?:content|src)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(attributes)) {
    let url;
    try {
      url = new URL(match[1], pageUrl);
    } catch {
      continue;
    }
    if (!validMediaUrl(url)) continue;
    url.hash = '';
    url.search = '';
    if (!found.includes(url.href)) found.push(url.href);
  }
  return found;
}

async function boundedResponse(url, { fetchImpl, kind, expectedHost, byteLimit }) {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (kind === 'page' ? !validItchPage(current, expectedHost) : !validMediaUrl(current))
      throw new Error(`${kind} host is not allowlisted`);
    const response = await fetchImpl(current.href, {
      redirect: 'manual',
      credentials: 'omit',
      signal: globalThis.AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`${kind} redirect has no location`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`${kind} fetch returned HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > byteLimit) throw new Error(`${kind} response exceeds byte limit`);
    if (!response.body) throw new Error(`${kind} response has no body`);
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > byteLimit) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`${kind} response exceeds byte limit`);
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks, bytes);
    return { body, response, url: current };
  }
  throw new Error(`${kind} redirect limit exceeded`);
}

function imageExtension(contentType, body) {
  const type = contentType.split(';', 1)[0].trim().toLowerCase();
  if (type === 'image/png' && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (type === 'image/gif' && ['GIF87a', 'GIF89a'].includes(body.subarray(0, 6).toString('ascii'))) return 'gif';
  if (type === 'image/jpeg' && body[0] === 0xff && body[1] === 0xd8) return 'jpg';
  if (
    type === 'image/webp' &&
    body.subarray(0, 4).toString('ascii') === 'RIFF' &&
    body.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'webp';
  throw new Error(`media response is not a verified supported image (${type || 'no content type'})`);
}

export async function fetchStoreMedia({
  root: assetRoot,
  packId,
  pageUrl,
  fetchImpl = globalThis.fetch,
  fetchedAt = new Date().toISOString(),
}) {
  const root = await realpath(resolve(assetRoot));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packId)) throw new Error('pack id must be a slug');
  const page = new URL(pageUrl);
  if (!validItchPage(page) || page.search || page.hash || page.username || page.password)
    throw new Error('page URL must be a plain HTTPS itch.io creator page');
  const store = await safeOutput(root, `packs/${packId}/store/media.json`).then(dirname);
  const stage = await mkdtemp(join(dirname(store), '.thumbnail-store-'));
  try {
    const pageResult = await boundedResponse(page, {
      fetchImpl,
      kind: 'page',
      expectedHost: page.hostname,
      byteLimit: PAGE_LIMIT,
    });
    if (!pageResult.response.headers.get('content-type')?.toLowerCase().startsWith('text/html'))
      throw new Error('store page is not HTML');
    const urls = extractItchMedia(pageResult.body.toString('utf8'), pageResult.url);
    if (urls.length === 0) throw new Error('store page contains no allowlisted image media');
    if (urls.length > MEDIA_COUNT_LIMIT) throw new Error('store page exceeds media count limit');
    const media = [];
    for (const sourceUrl of urls) {
      const result = await boundedResponse(sourceUrl, { fetchImpl, kind: 'media', byteLimit: MEDIA_LIMIT });
      const extension = imageExtension(result.response.headers.get('content-type') ?? '', result.body);
      const digest = createHash('sha256').update(result.body).digest('hex');
      const filename = `${digest.slice(0, 20)}.${extension}`;
      await writeFile(join(stage, filename), result.body);
      media.push({
        source_url: sourceUrl,
        path: filename,
        sha256: `sha256:${digest}`,
        bytes: result.body.length,
        content_type: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      });
    }
    const fallback = [...media].sort(
      (left, right) =>
        Number(right.path.endsWith('.gif')) - Number(left.path.endsWith('.gif')) || left.path.localeCompare(right.path),
    )[0];
    const manifest = {
      schema: 'ogm.vendor-store-media/1.0',
      pack_id: packId,
      page_url: page.href,
      fetched_at: fetchedAt,
      provenance: 'vendor-metadata',
      media,
      selected_fallback: fallback.path,
    };
    await mkdir(store, { recursive: true });
    for (const item of media) await rename(join(stage, item.path), join(store, item.path));
    const temporary = join(stage, `.media-${process.pid}.json`);
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporary, join(store, 'media.json'));
    return manifest;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
