#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

import { thumbnailSceneSchema } from '@ogm/contracts';
import { chromium } from 'playwright';
import sharp from 'sharp';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const RENDERER_PAGE = resolve(TOOL_DIR, 'thumbnail-scene-page.html');
const PAGE_LIMIT = 2 * 1024 * 1024;
const MEDIA_LIMIT = 20 * 1024 * 1024;
const MEDIA_COUNT_LIMIT = 64;
const MIME = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function safeInput(root, requested) {
  const lexical = resolve(root, requested);
  if (!inside(root, lexical)) throw new Error('input escapes the selected root');
  const canonical = await realpath(lexical);
  if (!inside(root, canonical)) throw new Error('input escapes the selected root');
  return canonical;
}

async function safeOutput(root, requested) {
  const lexical = resolve(root, requested);
  if (!inside(root, lexical)) throw new Error('output escapes the selected root');
  await mkdir(dirname(lexical), { recursive: true });
  const parent = await realpath(dirname(lexical));
  if (!inside(root, parent)) throw new Error('output parent escapes the selected root');
  const output = resolve(parent, basename(lexical));
  try {
    if ((await lstat(output)).isSymbolicLink()) throw new Error('output is a symbolic link');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return output;
}

function packOf(cardId) {
  const match = /^t[1-3]:([^/@]+)(?:\/(.+))?@([^@]+)$/.exec(cardId);
  if (!match || !match[2]) throw new Error(`invalid asset-card id: ${cardId}`);
  return { pack: match[1], relative: match[2] };
}

function coverageTokens(card, target) {
  const tokens = [`category:${card.kind}/${card.subkind}`];
  if (target.kind === 'set') {
    tokens.push(`world:${card.describe?.world ?? 'unknown'}`, `pack:${packOf(card.id).pack}`);
  }
  return tokens;
}

export function selectSpecimenCards(cards, target) {
  const eligible = cards
    .filter((card) => card.kind === 'sprite')
    .filter((card) => target.kind !== 'pack' || packOf(card.id).pack === target.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (eligible.length === 0) throw new Error(`no renderable cards for ${target.id ?? 'set'}`);
  const uncovered = new Set(eligible.flatMap((card) => coverageTokens(card, target)));
  const selected = [];
  while (uncovered.size) {
    const candidate = eligible
      .filter((card) => !selected.includes(card))
      .map((card) => ({ card, score: coverageTokens(card, target).filter((token) => uncovered.has(token)).length }))
      .sort((left, right) => right.score - left.score || left.card.id.localeCompare(right.card.id))[0];
    if (!candidate || candidate.score === 0) break;
    selected.push(candidate.card);
    for (const token of coverageTokens(candidate.card, target)) uncovered.delete(token);
  }
  return selected;
}

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
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > byteLimit) throw new Error(`${kind} response exceeds byte limit`);
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
    const temporary = join(store, `.media-${process.pid}.json`);
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporary, join(store, 'media.json'));
    return manifest;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export function projectPoint(grid, offset = [0, 0]) {
  return [512 + (grid[0] - grid[1]) * 64 + offset[0], 256 + (grid[0] + grid[1]) * 32 - grid[2] * 32 + offset[1]];
}

export function frameTimes() {
  return Array.from({ length: 96 }, (_, index) => index / 24);
}

export function videoArgs(framePattern, mp4, gif) {
  return {
    mp4: [
      '-hide_banner',
      '-loglevel',
      'error',
      '-framerate',
      '24',
      '-i',
      framePattern,
      '-frames:v',
      '96',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      mp4,
    ],
    gif: [
      '-hide_banner',
      '-loglevel',
      'error',
      '-framerate',
      '24',
      '-i',
      framePattern,
      '-frames:v',
      '96',
      '-vf',
      'fps=24,scale=256:256:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=none',
      '-loop',
      '0',
      gif,
    ],
  };
}

async function loadCard(root, cardId) {
  const parts = packOf(cardId);
  const cardPath = await safeInput(root, `packs/${parts.pack}/cards/${parts.relative}.card.json`);
  const card = JSON.parse(await readFile(cardPath, 'utf8'));
  if (card.id !== cardId) throw new Error(`card file id does not match ${cardId}`);
  const manifest = JSON.parse(await readFile(await safeInput(root, `packs/${parts.pack}/pack.json`), 'utf8'));
  const extracted = await safeInput(root, `packs/${parts.pack}/${manifest.current}/extracted`);
  return { card, extracted };
}

function frameFromCard(card, layer, time) {
  const selection = layer.selection;
  const animation = selection.action
    ? card.sprite?.animations?.find((item) => item.name === selection.action)
    : undefined;
  if (selection.action && !animation) throw new Error(`${card.id} has no action ${selection.action}`);
  let frame = selection.frame;
  if (animation) {
    if (!animation.frames?.length) throw new Error(`${card.id} action ${selection.action} has no frames`);
    const advance = layer.playback ? Math.floor(time * layer.playback.fps) + layer.playback.phase_frames : 0;
    const index = (selection.frame + advance) % animation.frames.length;
    frame = animation.frames[index];
    if (animation.sheets?.length) {
      const sheet = animation.sheets.find((item) => item.variant === selection.variant) ?? animation.sheets[0];
      const row = animation.directions?.indexOf(selection.direction);
      if (row === undefined || row < 0)
        throw new Error(`${card.id} action ${selection.action} has no direction ${selection.direction}`);
      return {
        path: sheet.path,
        crop: { x: frame * sheet.frame_w, y: row * sheet.frame_h, width: sheet.frame_w, height: sheet.frame_h },
      };
    }
    const directed = animation.direction_files?.[selection.direction];
    if (directed) return { path: directed[frame] };
    if (animation.files) return { path: animation.files[frame] };
  }
  if (card.sprite?.facings) {
    const path = card.sprite.facings[selection.direction];
    if (!path) throw new Error(`${card.id} has no facing ${selection.direction}`);
    return { path };
  }
  return { path: card.source?.files?.[frame]?.path };
}

async function compiledLayers(root, scene) {
  return Promise.all(scene.layers.map(async (layer) => ({ layer, ...(await loadCard(root, layer.card_id)) })));
}

function specimenLayer(card) {
  const animation = [...(card.sprite?.animations ?? [])].sort((left, right) => left.name.localeCompare(right.name))[0];
  const directions = animation?.directions ?? Object.keys(card.sprite?.facings ?? {}).sort();
  const direction = directions.includes('S') ? 'S' : directions[0];
  return {
    selection: {
      action: animation?.name,
      direction,
      frame: 0,
      variant: animation?.sheets?.map((sheet) => sheet.variant).sort()[0],
    },
  };
}

export async function renderSpecimen({ root: assetRoot, cards, target, output }) {
  const root = await realpath(resolve(assetRoot));
  const selected = selectSpecimenCards(cards, target);
  const frames = [];
  for (const selectedCard of selected) {
    const { card, extracted } = await loadCard(root, selectedCard.id);
    const frame = frameFromCard(card, specimenLayer(card), 0);
    if (!frame.path || !card.source?.files?.some((source) => source.path === frame.path))
      throw new Error(`${card.id} frame is not declared in source.files`);
    const path = await safeInput(extracted, frame.path);
    const image = sharp(path);
    const metadata = await image.metadata();
    const width = frame.crop?.width ?? metadata.width;
    const height = frame.crop?.height ?? metadata.height;
    if (!width || !height) throw new Error(`${card.id} frame has no image dimensions`);
    frames.push({ path, crop: frame.crop, width, height });
  }
  const largest = Math.max(...frames.map((frame) => Math.max(frame.width, frame.height)));
  const scale = largest <= 64 ? 4 : largest <= 128 ? 2 : 1;
  const cell = largest * scale + 32;
  const columns = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const composite = [];
  for (const [index, frame] of frames.entries()) {
    let image = sharp(frame.path);
    if (frame.crop)
      image = image.extract({
        left: frame.crop.x,
        top: frame.crop.y,
        width: frame.crop.width,
        height: frame.crop.height,
      });
    const input = await image
      .resize(frame.width * scale, frame.height * scale, { kernel: 'nearest' })
      .png()
      .toBuffer();
    const column = index % columns;
    const row = Math.floor(index / columns);
    composite.push({
      input,
      left: column * cell + Math.floor((cell - frame.width * scale) / 2),
      top: row * cell + Math.floor((cell - frame.height * scale) / 2),
    });
  }
  const destination = await safeOutput(root, output);
  const temporary = `${destination}.tmp-${process.pid}.png`;
  try {
    await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: '#c8c3b8' } })
      .composite(composite)
      .png()
      .toFile(temporary);
    await rename(temporary, destination);
    return { output: destination, selected: selected.map((card) => card.id) };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function payloadFor(root, serverUrl, scene, compiled, time) {
  const layers = [];
  for (const { layer, card, extracted } of compiled) {
    const frame = frameFromCard(card, layer, time);
    if (!frame.path || !card.source?.files?.some((source) => source.path === frame.path))
      throw new Error(`${card.id} frame is not declared in source.files`);
    const file = await safeInput(extracted, frame.path);
    const rootRelative = relative(root, file).split(sep).map(encodeURIComponent).join('/');
    const [anchorX, anchorY] = projectPoint(layer.position.grid, layer.position.offset_px);
    layers.push({
      id: layer.id,
      url: `${serverUrl}/assets/${rootRelative}`,
      crop: frame.crop,
      anchorX,
      anchorY,
      scale: layer.position.scale,
      zOrder: layer.z_order,
    });
  }
  return { background: scene.canvas.background, layers };
}

async function sendFile(response, root, requested) {
  try {
    const file = await safeInput(root, requested);
    response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
}

async function startServer(root) {
  const page = await readFile(RENDERER_PAGE);
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    if (pathname === '/renderer') return void response.writeHead(200, { 'Content-Type': 'text/html' }).end(page);
    if (pathname.startsWith('/assets/')) return void sendFile(response, root, pathname.slice('/assets/'.length));
    response.writeHead(404).end('not found');
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('renderer did not receive a loopback port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((accept, reject) => server.close((error) => (error ? reject(error) : accept()))),
  };
}

function browserArgs(softwareGL) {
  return softwareGL
    ? ['--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'];
}

async function withRenderer(root, scene, softwareGL, callback) {
  const server = await startServer(root);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: browserArgs(softwareGL) });
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
    await page.route('**/*', async (route) =>
      new URL(route.request().url()).origin === server.url ? route.continue() : route.abort('blockedbyclient'),
    );
    await page.goto(`${server.url}/renderer`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.rendererReady === true);
    await callback(page, server.url, await compiledLayers(root, scene));
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

export async function renderStill({
  root: assetRoot,
  scene: input,
  output,
  softwareGL = process.env.GM_VERIFY_SOFTWARE_GL === '1',
}) {
  const scene = thumbnailSceneSchema.parse(input);
  const root = await realpath(resolve(assetRoot));
  const target = await safeOutput(root, output);
  const temporary = `${target}.tmp-${process.pid}.png`;
  try {
    await withRenderer(root, scene, softwareGL, async (page, serverUrl, compiled) => {
      await page.evaluate(
        (payload) => globalThis.renderThumbnailScene(payload),
        await payloadFor(root, serverUrl, scene, compiled, 0),
      );
      await page.locator('canvas').screenshot({ path: temporary });
    });
    await rename(temporary, target);
    return target;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function runFfmpeg(args) {
  await new Promise((accept, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) =>
      reject(
        error.code === 'ENOENT' ? new Error('ffmpeg is required; install it with: sudo apt install ffmpeg') : error,
      ),
    );
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`)),
    );
  });
}

export async function renderSceneOutputs({
  root: assetRoot,
  scene: input,
  outputBase,
  softwareGL = process.env.GM_VERIFY_SOFTWARE_GL === '1',
}) {
  const scene = thumbnailSceneSchema.parse(input);
  const root = await realpath(resolve(assetRoot));
  const still1024 = await safeOutput(root, `${outputBase}.1024.png`);
  const still256 = await safeOutput(root, `${outputBase}.256.png`);
  const mp4 = await safeOutput(root, `${outputBase}.1024.mp4`);
  const gif = await safeOutput(root, `${outputBase}.256.gif`);
  const stage = await mkdtemp(join(dirname(still1024), '.thumbnail-scene-'));
  try {
    await withRenderer(root, scene, softwareGL, async (page, serverUrl, compiled) => {
      for (const [index, time] of frameTimes().entries()) {
        await page.evaluate(
          (payload) => globalThis.renderThumbnailScene(payload),
          await payloadFor(root, serverUrl, scene, compiled, time),
        );
        await page.locator('canvas').screenshot({ path: join(stage, `${String(index).padStart(3, '0')}.png`) });
      }
    });
    await copyFile(join(stage, '000.png'), still1024);
    const still256Temporary = `${still256}.tmp-${process.pid}.png`;
    await sharp(still1024).resize(256, 256, { kernel: 'nearest' }).png().toFile(still256Temporary);
    await rename(still256Temporary, still256);
    const args = videoArgs(join(stage, '%03d.png'), join(stage, 'scene.mp4'), join(stage, 'scene.gif'));
    await runFfmpeg(args.mp4);
    await runFfmpeg(args.gif);
    await rename(join(stage, 'scene.mp4'), mp4);
    await rename(join(stage, 'scene.gif'), gif);
    return { still1024, still256, mp4, gif };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined)
      throw new Error('arguments must be --name value pairs');
    values[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, values };
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === 'fetch-store' && values.root && values.pack && values.page) {
    process.stdout.write(
      `${JSON.stringify(await fetchStoreMedia({ root: values.root, packId: values.pack, pageUrl: values.page }))}\n`,
    );
    return;
  }
  if (command === 'render' && values.root && values.scene && values.output) {
    const scene = JSON.parse(await readFile(resolve(values.scene), 'utf8'));
    process.stdout.write(
      `${JSON.stringify(await renderSceneOutputs({ root: values.root, scene, outputBase: values.output }))}\n`,
    );
    return;
  }
  if (command === 'specimen' && values.root && values.cards && values['target-kind'] && values.output) {
    const document = JSON.parse(await readFile(resolve(values.cards), 'utf8'));
    const cards = Array.isArray(document) ? document : document.cards;
    if (!Array.isArray(cards)) throw new Error('cards file must be an array or an object with a cards array');
    const target = { kind: values['target-kind'], ...(values['target-id'] ? { id: values['target-id'] } : {}) };
    process.stdout.write(
      `${JSON.stringify(await renderSpecimen({ root: values.root, cards, target, output: values.output }))}\n`,
    );
    return;
  }
  throw new Error(
    'usage: thumbnail-scene.mjs fetch-store --root DIR --pack ID --page URL | specimen --root DIR --cards FILE --target-kind set|pack [--target-id ID] --output FILE | render --root DIR --scene FILE --output RELATIVE_BASE',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
