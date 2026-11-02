#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

import { safeInput, safeOutput } from './thumbnail-paths.mjs';

const require = createRequire(import.meta.url);
const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const RENDERER_PAGE = resolve(TOOL_DIR, 'render-gltf-page.html');
const THREE_ROOT = resolve(dirname(require.resolve('three')), '..');

const MIME = {
  '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function sendFile(response, root, requested) {
  const candidate = resolve(root, `.${requested}`);
  if (!inside(root, candidate)) {
    response.writeHead(404).end('not found');
    return;
  }
  let canonical;
  try {
    canonical = await realpath(candidate);
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  if (!inside(root, canonical)) {
    response.writeHead(404).end('not found');
    return;
  }
  const stream = createReadStream(canonical);
  stream.once('error', () => response.writeHead(404).end('not found'));
  stream.once('open', () => {
    response.writeHead(200, { 'Content-Type': MIME[extname(candidate).toLowerCase()] ?? 'application/octet-stream' });
    stream.pipe(response);
  });
}

export async function startStaticServer(assetRoot) {
  const root = await realpath(resolve(assetRoot));
  const threeRoot = await realpath(THREE_ROOT);
  const renderer = await readFile(RENDERER_PAGE);
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('bad path');
      return;
    }
    if (pathname === '/' || pathname === '/renderer') {
      response.writeHead(200, { 'Content-Type': MIME['.html'] }).end(renderer);
      return;
    }
    if (pathname.startsWith('/assets/')) {
      void sendFile(response, root, pathname.slice('/assets'.length));
      return;
    }
    if (pathname.startsWith('/three/')) {
      void sendFile(response, threeRoot, pathname.slice('/three'.length));
      return;
    }
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

export function rigWithId(rig) {
  if (!rig) return null;
  const bones = [...rig.bones].sort(
    (left, right) => left.name.localeCompare(right.name) || String(left.parent).localeCompare(String(right.parent)),
  );
  const signature = bones.map((bone) => `${bone.name}\0${bone.parent ?? ''}`).join('\n');
  return {
    rig_type: rig.type,
    rig_id: `rig:${createHash('sha256').update(signature).digest('hex').slice(0, 12)}`,
    joint_count: rig.bones.length,
    bones,
  };
}

function browserArgs(softwareGL) {
  return softwareGL
    ? ['--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'];
}

class RenderTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`render timed out after ${timeoutMs}ms`);
    this.code = 'RENDER_TIMEOUT';
  }
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function rendererPage(browser, serverUrl) {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === serverUrl || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.goto(`${serverUrl}/renderer`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.rendererReady === true);
  return page;
}

export async function renderJobs({
  root: assetRoot,
  jobs,
  softwareGL = process.env.GM_VERIFY_SOFTWARE_GL === '1',
  timeoutMs = 30_000,
}) {
  const root = await realpath(resolve(assetRoot));
  const server = await startStaticServer(root);
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ headless: true, args: browserArgs(softwareGL) });
    let page = await rendererPage(browser, server.url);
    for (const job of jobs) {
      try {
        const output = await safeOutput(root, job.output);
        const assetUrl = `${server.url}/assets/${job.path
          .split('/')
          .map((part) => encodeURIComponent(part))
          .join('/')}`;
        const measured = await withTimeout(
          page.evaluate((url) => globalThis.renderModel(url), assetUrl),
          job.timeoutMs ?? timeoutMs,
        );
        await mkdir(dirname(output), { recursive: true });
        await page.locator('canvas').screenshot({ path: output });
        results.push({
          path: job.path,
          ok: true,
          analysis: { ...measured, rig: rigWithId(measured.rig) },
          output: job.output,
        });
      } catch (error) {
        results.push({ path: job.path, ok: false, error: error instanceof Error ? error.message : String(error) });
        if (error?.code === 'RENDER_TIMEOUT') {
          await page.close().catch(() => {});
          page = await rendererPage(browser, server.url);
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
  return results;
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function relativeWebPath(from, to) {
  return relative(dirname(from), to).split(sep).join('/');
}

function lineupHtml(title, htmlPath, items) {
  const cards = items
    .map((item) => {
      const src = htmlEscape(relativeWebPath(htmlPath, item.thumbnailPath));
      const label = htmlEscape(item.label);
      return `<figure><img src="${src}" alt="${label}" loading="lazy"><figcaption>${label}</figcaption></figure>`;
    })
    .join('\n      ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${htmlEscape(title)}</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; background: #e9e1cc; color: #29251f; }
      body { margin: 0; padding: 2rem; }
      h1 { margin: 0 0 1.5rem; font-size: clamp(1.5rem, 3vw, 2.5rem); }
      main { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 1rem; }
      figure { margin: 0; overflow: hidden; border: 1px solid #c8bda7; border-radius: .5rem; background: #fffaf0; }
      img { display: block; width: 100%; height: auto; aspect-ratio: 1; object-fit: contain; background: #e9e1cc; }
      figcaption { padding: .65rem .8rem; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <h1>${htmlEscape(title)}</h1>
    <main aria-label="${htmlEscape(title)} model lineup">
      ${cards}
    </main>
  </body>
</html>
`;
}

async function lineupPng(output, title, items) {
  const columns = 4;
  const cardWidth = 256;
  const imageSize = 224;
  const labelHeight = 40;
  const gap = 16;
  const titleHeight = 80;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const width = columns * cardWidth + (columns + 1) * gap;
  const height = titleHeight + rows * (imageSize + labelHeight) + (rows + 1) * gap;
  const titleSvg = Buffer.from(
    `<svg width="${width}" height="${titleHeight}"><text x="${gap}" y="52" font-family="sans-serif" font-size="32" fill="#29251f">${htmlEscape(title)}</text></svg>`,
  );
  const composite = [{ input: titleSvg, left: 0, top: 0 }];
  for (const [index, item] of items.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = gap + column * (cardWidth + gap);
    const top = titleHeight + gap + row * (imageSize + labelHeight + gap);
    const image = await sharp(item.thumbnailPath)
      .resize(imageSize, imageSize, { fit: 'contain', background: '#e9e1cc' })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${cardWidth}" height="${labelHeight}"><text x="8" y="27" font-family="sans-serif" font-size="16" fill="#29251f">${htmlEscape(item.label.slice(0, 28))}</text></svg>`,
    );
    composite.push({ input: image, left: left + (cardWidth - imageSize) / 2, top });
    composite.push({ input: label, left, top: top + imageSize });
  }
  await sharp({ create: { width, height, channels: 3, background: '#fffaf0' } })
    .composite(composite)
    .png()
    .toFile(output);
}

export async function buildLineups({ root: assetRoot, lineups }) {
  const root = await realpath(resolve(assetRoot));
  const results = [];
  for (const lineup of lineups) {
    try {
      const output = await safeOutput(root, lineup.output);
      const html = await safeOutput(root, lineup.html);
      const items = await Promise.all(
        lineup.items.map(async (item) => ({ ...item, thumbnailPath: await safeInput(root, item.thumbnail) })),
      );
      await lineupPng(output, lineup.title, items);
      await writeFile(html, lineupHtml(lineup.title, html, items));
      results.push({ output: lineup.output, html: lineup.html, ok: true });
    } catch (error) {
      results.push({ output: lineup.output, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined)
      throw new Error('usage: render-gltf.mjs --root DIR --jobs FILE');
    values[name.slice(2)] = value;
  }
  if (!values.root || !values.jobs) throw new Error('usage: render-gltf.mjs --root DIR --jobs FILE');
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const document = JSON.parse(await readFile(resolve(args.jobs), 'utf8'));
  const jobs = Array.isArray(document) ? document : document.jobs;
  if (!Array.isArray(jobs)) throw new Error('jobs file must be an array or an object with a jobs array');
  const results = await renderJobs({ root: args.root, jobs });
  for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
  const lineups = Array.isArray(document) ? [] : (document.lineups ?? []);
  if (!Array.isArray(lineups)) throw new Error('lineups must be an array');
  const lineupResults = await buildLineups({ root: args.root, lineups });
  for (const result of lineupResults) process.stdout.write(`${JSON.stringify({ type: 'lineup', ...result })}\n`);
  if ([...results, ...lineupResults].some((result) => !result.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
