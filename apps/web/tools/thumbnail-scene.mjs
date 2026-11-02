#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

import { thumbnailSceneSchema } from '@ogm/contracts';
import { chromium } from 'playwright';
import sharp from 'sharp';

import { safeInput, safeOutput } from './thumbnail-paths.mjs';
import { fetchStoreMedia } from './thumbnail-store.mjs';

export { extractItchMedia, fetchStoreMedia } from './thumbnail-store.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const RENDERER_PAGE = resolve(TOOL_DIR, 'thumbnail-scene-page.html');
const MIME = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

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
  if (!['set', 'pack'].includes(target.kind)) throw new Error(`unknown specimen target kind: ${target.kind}`);
  const eligible = cards
    .filter((card) => card.kind === 'sprite')
    .filter((card) => target.kind !== 'set' || card.describe?.set === target.id)
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
      const sheet = selection.variant
        ? animation.sheets.find((item) => item.variant === selection.variant)
        : animation.sheets[0];
      if (!sheet) throw new Error(`${card.id} action ${selection.action} has no variant ${selection.variant}`);
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
  return Promise.all(
    scene.layers.map(async (layer) => {
      const loaded = await loadCard(root, layer.card_id);
      if (loaded.card.describe?.set !== scene.set_id) {
        throw new Error(`${layer.card_id} is not in scene set ${scene.set_id}`);
      }
      if (scene.target.kind === 'pack' && packOf(layer.card_id).pack !== scene.target.id) {
        throw new Error(`${layer.card_id} is not in scene pack ${scene.target.id}`);
      }
      return { layer, ...loaded };
    }),
  );
}

function animationSourcePriority(animation) {
  if (animation.sheets?.length) return 0;
  if (Object.keys(animation.direction_files ?? {}).length) return 1;
  if (animation.files?.some((path) => path.split('/').length >= 3)) return 2;
  return 3;
}

function specimenLayer(card) {
  const animation = [...(card.sprite?.animations ?? [])].sort(
    (left, right) =>
      animationSourcePriority(left) - animationSourcePriority(right) || left.name.localeCompare(right.name),
  )[0];
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
  const stage = await mkdtemp(join(dirname(destination), '.thumbnail-specimen-'));
  const temporary = join(stage, 'specimen.png');
  try {
    await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: '#c8c3b8' } })
      .composite(composite)
      .png()
      .toFile(temporary);
    await rename(temporary, destination);
    return { output: destination, selected: selected.map((card) => card.id) };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function payloadFor(root, serverUrl, scene, compiled, time, sourceCache = new Map()) {
  const layers = [];
  for (const { layer, card, extracted } of compiled) {
    const frame = frameFromCard(card, layer, time);
    if (!frame.path || !card.source?.files?.some((source) => source.path === frame.path))
      throw new Error(`${card.id} frame is not declared in source.files`);
    const cacheKey = `${extracted}\0${frame.path}`;
    let file = sourceCache.get(cacheKey);
    if (!file) {
      file = await safeInput(extracted, frame.path);
      sourceCache.set(cacheKey, file);
    }
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
  const stage = await mkdtemp(join(dirname(target), '.thumbnail-still-'));
  const temporary = join(stage, 'still.png');
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
  } finally {
    await rm(stage, { recursive: true, force: true });
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
      const sourceCache = new Map();
      for (const [index, time] of frameTimes().entries()) {
        await page.evaluate(
          (payload) => globalThis.renderThumbnailScene(payload),
          await payloadFor(root, serverUrl, scene, compiled, time, sourceCache),
        );
        await page.locator('canvas').screenshot({ path: join(stage, `${String(index).padStart(3, '0')}.png`) });
      }
    });
    const stagedStill1024 = join(stage, 'still.1024.png');
    const stagedStill256 = join(stage, 'still.256.png');
    await copyFile(join(stage, '000.png'), stagedStill1024);
    await sharp(stagedStill1024).resize(256, 256, { kernel: 'nearest' }).png().toFile(stagedStill256);
    const args = videoArgs(join(stage, '%03d.png'), join(stage, 'scene.mp4'), join(stage, 'scene.gif'));
    await runFfmpeg(args.mp4);
    await runFfmpeg(args.gif);
    await rename(stagedStill1024, still1024);
    await rename(stagedStill256, still256);
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
    const root = await realpath(resolve(values.root));
    const scene = JSON.parse(await readFile(await safeInput(root, values.scene), 'utf8'));
    process.stdout.write(
      `${JSON.stringify(await renderSceneOutputs({ root: values.root, scene, outputBase: values.output }))}\n`,
    );
    return;
  }
  if (command === 'specimen' && values.root && values.cards && values['target-kind'] && values.output) {
    const root = await realpath(resolve(values.root));
    const document = JSON.parse(await readFile(await safeInput(root, values.cards), 'utf8'));
    const cards = Array.isArray(document) ? document : document.cards;
    if (!Array.isArray(cards)) throw new Error('cards file must be an array or an object with a cards array');
    if (!values['target-id']) throw new Error('specimen requires --target-id');
    const target = { kind: values['target-kind'], id: values['target-id'] };
    process.stdout.write(
      `${JSON.stringify(await renderSpecimen({ root: values.root, cards, target, output: values.output }))}\n`,
    );
    return;
  }
  throw new Error(
    'usage: thumbnail-scene.mjs fetch-store --root DIR --pack ID --page URL | specimen --root DIR --cards FILE --target-kind set|pack --target-id ID --output FILE | render --root DIR --scene FILE --output RELATIVE_BASE',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
