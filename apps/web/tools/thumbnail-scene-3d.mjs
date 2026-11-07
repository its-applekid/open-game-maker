#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

import {
  setShowcase3dMediaSchema,
  setShowcase3dSchema,
  thumbnailScene3dSchema,
  thumbnailSheet3dSchema,
} from '@ogm/contracts';
import { chromium } from 'playwright';
import sharp from 'sharp';

import { continuousRunnerPosition, continuousStopState } from '../../../scripts/assets/showcase/continuous.mjs';
import { publishStagedShowcase } from '../../../scripts/assets/showcase/publish.mjs';
import { verifyTrack } from '../../../scripts/assets/showcase/verify.mjs';
import { browserArgs, startStaticServer } from './render-gltf.mjs';
import { safeInput, safeOutput } from './thumbnail-paths.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const SCENE_PAGE = resolve(TOOL_DIR, 'thumbnail-scene-3d-page.html');
const BACKGROUND = '#e9e1cc';
const GROUND = '#c8c3b8';
const DEFAULT_DURATION_MS = 4000;
const DEFAULT_FPS = 24;
const DEFAULT_FRAMES_PER_STOP = 30;
const DEFAULT_SHEET_LIMIT = 12;
const MAX_WORLD_ITEMS = 24;
const REDISTRIBUTION_ORDER = ['none', 'in-build', 'free'];
const AUDIENCE_ORDER = ['private', 'public'];
const KIND_BY_SUBKIND = {
  character: 'character',
  creature: 'creature',
  vehicle: 'vehicle',
  building: 'building',
  nature: 'nature',
  weapon: 'weapon',
  food: 'food',
  prop: 'prop',
};

export function splitCardId(cardId) {
  const match = /^t[1-3]:([^/@]+)\/(.+)@([^@]+)$/.exec(cardId ?? '');
  if (!match) throw new Error(`invalid asset-card id: ${cardId}`);
  return { pack: match[1], key: match[2], version: match[3] };
}

export function coverageTokens(card) {
  return [`category:${card.kind}/${card.subkind}`];
}

export function sceneItemKind(card) {
  return KIND_BY_SUBKIND[card.subkind] ?? 'prop';
}

/**
 * Greedy kind/subkind coverage over a pack's or set's model cards, with card id as the tie-break.
 * The result is always three to six cards, sorted by id so input order never changes the scene.
 */
export function selectSceneCards(cards, target, { minimum = 3, maximum = 6 } = {}) {
  const eligible = cards
    .filter((card) => card.kind === 'model')
    .filter((card) => target.kind !== 'pack' || splitCardId(card.id).pack === target.id)
    .filter((card) => target.kind !== 'set' || card.describe?.set === target.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (eligible.length < minimum) throw new Error(`no renderable 3D cards for ${target.id}`);
  const uncovered = new Set(eligible.flatMap(coverageTokens));
  const selected = [];
  while (uncovered.size && selected.length < maximum) {
    const candidate = eligible
      .filter((card) => !selected.includes(card))
      .map((card) => ({ card, score: coverageTokens(card).filter((token) => uncovered.has(token)).length }))
      .sort((left, right) => right.score - left.score || left.card.id.localeCompare(right.card.id))[0];
    if (!candidate || candidate.score === 0) break;
    selected.push(candidate.card);
    for (const token of coverageTokens(candidate.card)) uncovered.delete(token);
  }
  for (const card of eligible) {
    if (selected.length >= minimum) break;
    if (!selected.includes(card)) selected.push(card);
  }
  return selected.slice(0, maximum).sort((left, right) => left.id.localeCompare(right.id));
}

function lower(order, left, right) {
  return order.indexOf(left) <= order.indexOf(right) ? left : right;
}

/** C3 §5: an asset's rights are its own basis intersected with its collection's, so they never widen. */
export function resolvedRights(card, collections) {
  const parent = card.collection ? collections[card.collection] : undefined;
  const own = card.rights;
  const inherited = parent?.rights;
  if (!own && !inherited) return { audience: 'private', redistribution: 'none' };
  if (!own) return { audience: inherited.audience, redistribution: inherited.redistribution };
  if (!inherited) return { audience: own.audience, redistribution: own.redistribution };
  return {
    audience: lower(AUDIENCE_ORDER, own.audience, inherited.audience),
    redistribution: lower(REDISTRIBUTION_ORDER, own.redistribution, inherited.redistribution),
  };
}

/** A preview whose sources are private or `redistribution: none` stays under the library's private prefix. */
export function previewBase({ cards, collections, base }) {
  const restricted = cards.some((card) => {
    const rights = resolvedRights(card, collections);
    return rights.redistribution === 'none' || rights.audience === 'private';
  });
  return restricted ? `private/${base}` : base;
}

function slugFromKey(key) {
  return (
    key
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function round(value) {
  return Number(value.toFixed(3));
}

export function orbitCamera(camera, angleRad) {
  const [px, py, pz] = camera.position;
  const [tx, ty, tz] = camera.target;
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    position: [round(tx + dx * cos + dz * sin), round(ty + dy), round(tz - dx * sin + dz * cos)],
    target: camera.target,
  };
}

export function sceneFrameTimes(scene) {
  const frames = (scene.duration_ms * scene.fps) / 1000;
  return Array.from({ length: frames }, (_, index) => index / scene.fps);
}

/** A pack scene stands three to six cards on a ground plane and orbits the square camera once. */
export function buildPackScene({ cards, target, set, durationMs = DEFAULT_DURATION_MS, fps = DEFAULT_FPS }) {
  const selected = selectSceneCards(cards, target, { minimum: 3, maximum: 6 });
  const count = selected.length;
  const radius = Math.max(2.2, count * 1.1);
  const items = selected.map((card, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      id: slugFromKey(splitCardId(card.id).key),
      kind: sceneItemKind(card),
      card_id: card.id,
      position: [round(Math.cos(angle) * radius), 0, round(Math.sin(angle) * radius)],
      rotation_y: round(Math.atan2(-Math.cos(angle), -Math.sin(angle))),
      scale: 1,
    };
  });
  const groundSize = round(radius * 2 + 6);
  return thumbnailScene3dSchema.parse({
    schema: 'ogm.thumbnail-scene-3d/1.0',
    set_id: set,
    target,
    canvas: { width: 1024, height: 1024, background: BACKGROUND },
    camera: {
      projection: 'perspective',
      fov_deg: 35,
      position: [round(radius * 1.6), round(radius * 1.1), round(radius * 1.6)],
      target: [0, 1, 0],
      orbit_deg: 360,
    },
    lighting: { mode: 'scene', intensity: 1 },
    duration_ms: durationMs,
    fps,
    ground: { size_m: [groundSize, groundSize], position: [0, 0, 0], colour: GROUND },
    items,
  });
}

function sheetCamera() {
  return { fov_deg: 35, position: [0, 9, 7], target: [0, 0.6, 0] };
}

function buildSheet(cards) {
  const columns = Math.min(4, Math.ceil(Math.sqrt(cards.length)));
  const rows = Math.ceil(cards.length / columns);
  const cell = 2.2;
  const models = cards.map((card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `sheet-${index}-${slugFromKey(splitCardId(card.id).key)}`,
      card_id: card.id,
      position: [round((column - (columns - 1) / 2) * cell), 0, round((row - (rows - 1) / 2) * cell)],
      scale: 1,
    };
  });
  return thumbnailSheet3dSchema.parse({
    schema: 'ogm.thumbnail-sheet-3d/1.0',
    background: BACKGROUND,
    grid: [columns, rows],
    rotate_deg_per_second: 45,
    ground: { size_m: [columns * cell + 2, rows * cell + 2], position: [0, 0, 0], colour: GROUND },
    camera: sheetCamera(),
    models,
  });
}

/**
 * Plan one continuous set showcase: a closed regular-polygon route with one stop per pack, a world
 * that stands one anchor card per pack near its stop, and a synchronized model sheet per stop.
 */
export function buildSetShowcase({
  cards,
  set,
  styleFamily,
  fps = DEFAULT_FPS,
  framesPerStop = DEFAULT_FRAMES_PER_STOP,
  sheetLimit = DEFAULT_SHEET_LIMIT,
}) {
  const setCards = cards.filter((card) => card.kind === 'model' && card.describe?.set === set);
  if (setCards.length === 0) throw new Error(`no renderable 3D cards for set ${set}`);
  const byPack = new Map();
  for (const card of setCards) {
    const { pack } = splitCardId(card.id);
    if (!byPack.has(pack)) byPack.set(pack, []);
    byPack.get(pack).push(card);
  }
  const packs = [...byPack.keys()].sort();
  const hero =
    [...setCards]
      .filter((card) => card.subkind === 'character' || card.subkind === 'creature')
      .sort((left, right) => left.id.localeCompare(right.id))[0] ??
    [...setCards].sort((left, right) => left.id.localeCompare(right.id))[0];

  const stops = [];
  for (const pack of packs) {
    const packCards = byPack.get(pack).sort((left, right) => left.id.localeCompare(right.id));
    if (packCards.length < 2) continue;
    stops.push({ pack, anchor: packCards[0], sheetCards: packCards.slice(1, 1 + sheetLimit) });
  }
  if (stops.length < 2) throw new Error(`set ${set} needs at least two packs with two or more cards`);
  if (packs.length > MAX_WORLD_ITEMS)
    throw new Error(`set ${set} has ${packs.length} packs, over the ${MAX_WORLD_ITEMS}-item world cap`);

  const secondsPerStop = framesPerStop / fps;
  const side = 2.4;
  const stopCount = stops.length;
  const radius = stopCount === 2 ? side / 2 : side / (2 * Math.sin(Math.PI / stopCount));
  const vertices = Array.from({ length: stopCount }, (_, index) => {
    const angle = (index / stopCount) * Math.PI * 2;
    return [round(Math.cos(angle) * radius), round(Math.sin(angle) * radius)];
  });
  const points = [...vertices, vertices[0]];
  const speed = side / secondsPerStop;
  const stopIndexByPack = new Map(stops.map((stop, index) => [stop.pack, index]));

  const worldItems = [];
  let extra = 0;
  for (const pack of packs) {
    const anchor = byPack.get(pack).sort((left, right) => left.id.localeCompare(right.id))[0];
    const stopIndex = stopIndexByPack.get(pack);
    let position;
    if (stopIndex !== undefined) {
      const [vx, vz] = vertices[stopIndex];
      const length = Math.hypot(vx, vz) || 1;
      position = [round(vx - (vx / length) * 1.6), 0, round(vz - (vz / length) * 1.6)];
    } else {
      const angle = (extra / Math.max(1, packs.length)) * Math.PI * 2;
      extra += 1;
      position = [round(Math.cos(angle) * 1.2), 0, round(Math.sin(angle) * 1.2)];
    }
    worldItems.push({
      id: `world-${worldItems.length}-${slugFromKey(splitCardId(anchor.id).key)}`,
      kind: sceneItemKind(anchor),
      card_id: anchor.id,
      position,
      rotation_y: 0,
      scale: 1,
    });
  }

  const loopSeconds = stopCount * secondsPerStop;
  const worldRadius = radius + 6;
  const world = thumbnailScene3dSchema.parse({
    schema: 'ogm.thumbnail-scene-3d/1.0',
    set_id: set,
    target: { kind: 'set', id: set },
    canvas: { width: 1024, height: 1024, background: BACKGROUND },
    camera: { projection: 'perspective', fov_deg: 35, position: [0, 6, 8], target: [0, 1, 0], orbit_deg: 0 },
    lighting: { mode: 'scene', intensity: 1 },
    duration_ms: Math.round(loopSeconds * 1000),
    fps,
    ground: { size_m: [round(worldRadius * 2), round(worldRadius * 2)], position: [0, 0, 0], colour: GROUND },
    items: worldItems,
  });

  const walkClip = (hero.rig?.clips ?? []).find((clip) => clip.canonical === 'walk' || /walk/i.test(clip.name));
  const sequence = setShowcase3dSchema.parse({
    schema: 'ogm.set-showcase-3d/1',
    set,
    ...(styleFamily ? { style_family: styleFamily } : {}),
    fps,
    loop_seconds: loopSeconds,
    layout: {
      viewport: [1024, 1024],
      background: BACKGROUND,
      camera: { fov_deg: 35, height_m: 2.2, distance_m: 5.5 },
    },
    runner: {
      ref: hero.id,
      action: 'walk',
      ...(walkClip ? { clip: walkClip.name } : {}),
      path: { points },
      speed,
      scale: 1,
    },
    world: 'world.json',
    stops: stops.map((stop, index) => ({
      id: stop.pack,
      label: stop.pack,
      start_time: index * secondsPerStop,
      sheet: `sheets/${stop.pack}.json`,
    })),
    required_packs: packs,
  });

  const sheets = new Map(stops.map((stop) => [stop.pack, buildSheet(stop.sheetCards)]));
  return { sequence, world, sheets };
}

function assetUrl(serverUrl, relativePath) {
  return `${serverUrl}/assets/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

async function loadCard(root, cardId) {
  const { pack, key } = splitCardId(cardId);
  const card = JSON.parse(await readFile(await safeInput(root, `packs/${pack}/cards/${key}.card.json`), 'utf8'));
  if (card.id !== cardId) throw new Error(`card file id does not match ${cardId}`);
  const manifest = JSON.parse(await readFile(await safeInput(root, `packs/${pack}/pack.json`), 'utf8'));
  return { card, manifest, pack, key };
}

async function glbPath(root, cardId) {
  const { card, manifest, pack } = await loadCard(root, cardId);
  const primary = (card.source?.files ?? []).find(
    (file) => file.role === 'primary' && /\.(glb|gltf)$/i.test(file.path ?? ''),
  );
  if (!primary) throw new Error(`${cardId} has no canonical glTF`);
  return `packs/${pack}/${manifest.current}/extracted/${primary.path}`;
}

async function loadPackCards(root, pack) {
  const directory = await safeInput(root, `packs/${pack}/cards`);
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const cards = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.card.json')) continue;
    cards.push(JSON.parse(await readFile(join(entry.parentPath, entry.name), 'utf8')));
  }
  return cards;
}

async function loadSetCards(root, set) {
  const packs = await readdir(await safeInput(root, 'packs'), { withFileTypes: true });
  const cards = [];
  for (const pack of packs) {
    if (!pack.isDirectory()) continue;
    try {
      cards.push(...(await loadPackCards(root, pack.name)));
    } catch {
      // a pack without cards is not part of the set
    }
  }
  return cards.filter((card) => card.describe?.set === set);
}

async function loadCollections(root, cards) {
  const collections = {};
  for (const card of cards) {
    const id = card.collection;
    if (!id || collections[id]) continue;
    const pack = /^t[1-3]:([^/@]+)@/.exec(id)?.[1];
    if (!pack) continue;
    try {
      collections[id] = JSON.parse(await readFile(await safeInput(root, `packs/${pack}/collection.card.json`), 'utf8'));
    } catch {
      // a missing collection card resolves to the strict private default
    }
  }
  return collections;
}

function videoArgs({ framePattern, mp4, gif, fps, frames }) {
  return {
    mp4: [
      '-hide_banner',
      '-loglevel',
      'error',
      '-framerate',
      String(fps),
      '-i',
      framePattern,
      '-frames:v',
      String(frames),
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
      String(fps),
      '-i',
      framePattern,
      '-frames:v',
      String(frames),
      '-vf',
      `fps=${fps},scale=256:256:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=none`,
      '-loop',
      '0',
      gif,
    ],
  };
}

function runFfmpeg(args) {
  return new Promise((accept, reject) => {
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

async function scenePage(browser, serverUrl) {
  const page = await browser.newPage({ viewport: { width: 2048, height: 1024 }, deviceScaleFactor: 1 });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === serverUrl || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.goto(`${serverUrl}/scene`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.sceneReady === true);
  return page;
}

async function withScenePage(root, softwareGL, callback) {
  const server = await startStaticServer(root, { page: SCENE_PAGE, pagePath: '/scene' });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: browserArgs(softwareGL) });
    const page = await scenePage(browser, server.url);
    return await callback(page, server.url);
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

async function sceneItems(root, serverUrl, items) {
  const payload = [];
  for (const item of items) {
    payload.push({
      id: item.id,
      url: assetUrl(serverUrl, await glbPath(root, item.card_id)),
      position: item.position,
      rotation_y: item.rotation_y,
      scale: item.scale,
    });
  }
  return payload;
}

export async function renderPackScene({
  root: assetRoot,
  scene: input,
  outputBase,
  softwareGL = process.env.GM_VERIFY_SOFTWARE_GL === '1',
}) {
  const scene = thumbnailScene3dSchema.parse(input);
  const root = await realpath(resolve(assetRoot));
  const still1024 = await safeOutput(root, `${outputBase}.1024.png`);
  const still256 = await safeOutput(root, `${outputBase}.256.png`);
  const mp4 = await safeOutput(root, `${outputBase}.1024.mp4`);
  const gif = await safeOutput(root, `${outputBase}.256.gif`);
  const stage = await mkdtemp(join(dirname(still1024), '.scene-3d-'));
  try {
    await withScenePage(root, softwareGL, async (page, serverUrl) => {
      await page.evaluate((payload) => globalThis.loadScene(payload), {
        background: scene.canvas.background,
        camera: { fov_deg: scene.camera.fov_deg },
        ground: scene.ground,
        items: await sceneItems(root, serverUrl, scene.items),
      });
      const times = sceneFrameTimes(scene);
      for (const [index, time] of times.entries()) {
        const angle = (time / (scene.duration_ms / 1000)) * ((scene.camera.orbit_deg * Math.PI) / 180);
        await page.evaluate((payload) => globalThis.renderRegion(payload), {
          camera: orbitCamera(scene.camera, angle),
          moves: {},
          time,
        });
        await page.locator('canvas#region').screenshot({ path: join(stage, `${String(index).padStart(3, '0')}.png`) });
      }
    });
    const stagedStill1024 = join(stage, 'still.1024.png');
    const stagedStill256 = join(stage, 'still.256.png');
    await copyFile(join(stage, '000.png'), stagedStill1024);
    await sharp(stagedStill1024).resize(256, 256, { kernel: 'nearest' }).png().toFile(stagedStill256);
    const frames = sceneFrameTimes(scene).length;
    const args = videoArgs({
      framePattern: join(stage, '%03d.png'),
      mp4: join(stage, 'scene.mp4'),
      gif: join(stage, 'scene.gif'),
      fps: scene.fps,
      frames,
    });
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

export async function checkShowcase3d({ root: assetRoot, sequencePath }) {
  const root = await realpath(resolve(assetRoot));
  const sequence = setShowcase3dSchema.parse(JSON.parse(await readFile(await safeInput(root, sequencePath), 'utf8')));
  const baseDir = dirname(sequencePath);
  const world = thumbnailScene3dSchema.parse(
    JSON.parse(await readFile(await safeInput(root, join(baseDir, sequence.world)), 'utf8')),
  );
  const sheets = new Map();
  for (const stop of sequence.stops) {
    sheets.set(
      stop.id,
      thumbnailSheet3dSchema.parse(
        JSON.parse(await readFile(await safeInput(root, join(baseDir, stop.sheet)), 'utf8')),
      ),
    );
  }
  const issues = [];
  const worldCards = world.items.map((item) => item.card_id);
  const sheetCards = [...sheets.values()].flatMap((sheet) => sheet.models.map((model) => model.card_id));
  const worldPacks = new Set(worldCards.map((card) => splitCardId(card).pack));
  const sheetPacks = new Set(sheetCards.map((card) => splitCardId(card).pack));
  for (const pack of sequence.required_packs ?? []) {
    if (!worldPacks.has(pack) && !sheetPacks.has(pack)) {
      issues.push({
        code: 'pack.uncovered',
        path: 'required_packs',
        detail: `${pack} is not represented in the world or a sheet`,
      });
    }
  }
  if (new Set(sheetCards).size !== sheetCards.length) {
    issues.push({ code: 'sheet.duplicated', path: 'stops', detail: 'a card appears in more than one sheet' });
  }
  const overlap = sheetCards.filter((card) => worldCards.includes(card));
  if (overlap.length) {
    issues.push({
      code: 'world.sheet_overlap',
      path: 'stops',
      detail: `${overlap[0]} appears in both the world and a sheet`,
    });
  }
  return { sequence, world, sheets, issues };
}

export async function renderShowcase3d({
  root: assetRoot,
  sequencePath,
  outputBase,
  softwareGL = process.env.GM_VERIFY_SOFTWARE_GL === '1',
}) {
  const root = await realpath(resolve(assetRoot));
  const { sequence, world, sheets, issues } = await checkShowcase3d({ root, sequencePath });
  if (issues.length) throw new Error(issues.map(({ code, path, detail }) => `${code} ${path}: ${detail}`).join('\n'));
  const manifestPath = await safeOutput(root, `${outputBase}.manifest.json`);
  const outputDir = dirname(manifestPath);
  const base = basename(outputBase);
  const stage = await mkdtemp(join(outputDir, '.showcase-3d-'));
  const scratch = await mkdtemp(join(tmpdir(), 'ogm-showcase-3d-frames-'));
  const frames = Math.round(sequence.loop_seconds * sequence.fps);
  const firstSheet = sheets.values().next().value;
  try {
    await withScenePage(root, softwareGL, async (page, serverUrl) => {
      const items = await sceneItems(root, serverUrl, world.items);
      items.push({
        id: 'runner',
        url: assetUrl(serverUrl, await glbPath(root, sequence.runner.ref)),
        position: [sequence.runner.path.points[0][0], 0, sequence.runner.path.points[0][1]],
        rotation_y: 0,
        scale: sequence.runner.scale,
        ...(sequence.runner.clip ? { clip: sequence.runner.clip } : {}),
      });
      await page.evaluate((payload) => globalThis.loadScene(payload), {
        background: world.canvas.background,
        camera: { fov_deg: world.camera.fov_deg },
        ground: world.ground,
        items,
      });
      const groups = [];
      for (const stop of sequence.stops) {
        const sheet = sheets.get(stop.id);
        const models = [];
        for (const model of sheet.models) {
          models.push({
            id: model.id,
            url: assetUrl(serverUrl, await glbPath(root, model.card_id)),
            position: model.position,
            scale: model.scale,
          });
        }
        groups.push({ id: stop.id, models });
      }
      await page.evaluate((payload) => globalThis.loadSheet(payload), {
        background: firstSheet.background,
        camera: firstSheet.camera,
        ground: firstSheet.ground,
        groups,
      });
      for (let index = 0; index < frames; index += 1) {
        const time = index / sequence.fps;
        const runner = continuousRunnerPosition(sequence, time);
        const [heroX, heroZ] = runner.position;
        const rotation = Math.atan2(runner.to[0] - runner.from[0], runner.to[1] - runner.from[1]);
        await page.evaluate((payload) => globalThis.renderRegion(payload), {
          camera: {
            position: [
              heroX + sequence.layout.camera.distance_m,
              sequence.layout.camera.height_m,
              heroZ + sequence.layout.camera.distance_m,
            ],
            target: [heroX, sequence.layout.camera.height_m * 0.4, heroZ],
          },
          moves: { runner: { position: [heroX, 0, heroZ], rotation_y: rotation } },
          time,
        });
        await page
          .locator('canvas#region')
          .screenshot({ path: join(scratch, `region-${String(index).padStart(3, '0')}.png`) });
        const state = continuousStopState(sequence, time);
        const sheet = sheets.get(state.stop.id);
        await page.evaluate((payload) => globalThis.renderSheet(payload), {
          ids: sheet.models.map((model) => model.id),
          rotation_y: (time * sheet.rotate_deg_per_second * Math.PI) / 180,
        });
        await page
          .locator('canvas#sheet')
          .screenshot({ path: join(scratch, `sheet-${String(index).padStart(3, '0')}.png`) });
      }
    });

    const region = {
      mp4: `${base}.region.1024.mp4`,
      gif: `${base}.region.256.gif`,
      poster: `${base}.region.poster.png`,
    };
    const sheet = { mp4: `${base}.sheet.1024.mp4`, gif: `${base}.sheet.256.gif`, poster: `${base}.sheet.poster.png` };
    const regionArgs = videoArgs({
      framePattern: join(scratch, 'region-%03d.png'),
      mp4: join(stage, region.mp4),
      gif: join(stage, region.gif),
      fps: sequence.fps,
      frames,
    });
    const sheetArgs = videoArgs({
      framePattern: join(scratch, 'sheet-%03d.png'),
      mp4: join(stage, sheet.mp4),
      gif: join(stage, sheet.gif),
      fps: sequence.fps,
      frames,
    });
    await runFfmpeg(regionArgs.mp4);
    await runFfmpeg(regionArgs.gif);
    await runFfmpeg(sheetArgs.mp4);
    await runFfmpeg(sheetArgs.gif);
    await copyFile(join(scratch, 'region-000.png'), join(stage, region.poster));
    await copyFile(join(scratch, 'sheet-000.png'), join(stage, sheet.poster));

    const timeline = [];
    for (let second = 0; second < Math.ceil(sequence.loop_seconds); second += 1) {
      const index = Math.min(frames - 1, Math.round(second * sequence.fps));
      const file = `${base}.timeline-${String(second).padStart(3, '0')}.png`;
      await copyFile(join(scratch, `region-${String(index).padStart(3, '0')}.png`), join(stage, file));
      timeline.push(file);
    }
    const stops = [];
    for (const stop of sequence.stops) {
      const index = Math.min(frames - 1, Math.round(stop.start_time * sequence.fps));
      const regionPoster = `${base}.${stop.id}.region.poster.png`;
      const sheetPoster = `${base}.${stop.id}.sheet.poster.png`;
      await copyFile(join(scratch, `region-${String(index).padStart(3, '0')}.png`), join(stage, regionPoster));
      await copyFile(join(scratch, `sheet-${String(index).padStart(3, '0')}.png`), join(stage, sheetPoster));
      stops.push({
        id: stop.id,
        ...(stop.label ? { label: stop.label } : {}),
        start_time: stop.start_time,
        region: { poster: regionPoster },
        sheet: { poster: sheetPoster },
      });
    }

    const manifest = setShowcase3dMediaSchema.parse({
      schema: 'ogm.set-showcase-media/3',
      set: sequence.set,
      client_rendering: false,
      duration: sequence.loop_seconds,
      video: { codec: 'h264', pixel_format: 'yuv420p', faststart: true },
      tracks: { region, sheet },
      stops,
      qa: { timeline_fps: 1, timeline },
    });
    const library = { sharp: async () => sharp };
    for (const track of ['region', 'sheet']) {
      const details = await verifyTrack({
        media: manifest.tracks[track],
        output: stage,
        width: 1024,
        height: 1024,
        seconds: sequence.loop_seconds,
        fps: sequence.fps,
        library,
      });
      if (details.length)
        throw new Error(details.map((detail) => `media.invalid tracks.${track}: ${detail}`).join('\n'));
    }
    await writeFile(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await publishStagedShowcase({ staging: stage, output: outputDir });
    await writeFile(await safeOutput(root, `${outputBase}.sequence.json`), `${JSON.stringify(sequence, null, 2)}\n`);
    return manifest;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Writes a set plan next to its base: the world scene, one sheet per stop, and the sequence last so a
 * half-written plan never looks complete. Returns the sequence path callers validate and render.
 */
export async function writeShowcasePlan({ root: assetRoot, base, sequence, world, sheets }) {
  const root = await realpath(resolve(assetRoot));
  const sequencePath = await safeOutput(root, `${base}.sequence.json`);
  const baseDir = dirname(sequencePath);
  await writeFile(join(baseDir, 'world.json'), `${JSON.stringify(world, null, 2)}\n`);
  for (const [id, sheet] of sheets) {
    await writeFile(
      await safeOutput(root, join(baseDir, 'sheets', `${id}.json`)),
      `${JSON.stringify(sheet, null, 2)}\n`,
    );
  }
  await writeFile(sequencePath, `${JSON.stringify(sequence, null, 2)}\n`);
  return `${base}.sequence.json`;
}

/** Builds one pack's square scene under its rights-gated base, then renders stills and loops. */
export async function renderPackArt({
  root: assetRoot,
  pack,
  cards,
  set,
  durationMs,
  fps,
  softwareGL = process.env.GM_VERIFY_SOFTWARE_GL === '1',
}) {
  const root = await realpath(resolve(assetRoot));
  const scene = buildPackScene({ cards, target: { kind: 'pack', id: pack }, set, durationMs, fps });
  const collections = await loadCollections(root, cards);
  const base = previewBase({ cards, collections, base: `packs/${pack}/scene` });
  await writeFile(await safeOutput(root, `${base}.scene.json`), `${JSON.stringify(scene, null, 2)}\n`);
  const outputs = await renderPackScene({ root, scene, outputBase: base, softwareGL });
  return { base, outputs };
}

async function listLibraryPacks(root) {
  const entries = await readdir(await safeInput(root, 'packs'), { withFileTypes: true });
  const packs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const cards = await loadPackCards(root, entry.name);
      if (cards.length) packs.push({ pack: entry.name, cards });
    } catch {
      // a directory without readable cards is not a pack
    }
  }
  return packs;
}

/**
 * Every pack with three or more models and every set with two multi-card packs. A set without that
 * shape is reported instead of silently skipped, so a batch run cannot claim coverage it lacks.
 */
export function batchTargets({ packs, onlyPacks = [], onlySets = [] }) {
  const models = packs.flatMap(({ cards }) => cards.filter((card) => card.kind === 'model'));
  const packTargets = packs
    .map(({ pack, cards }) => ({ kind: 'pack', id: pack, cards: cards.filter((card) => card.kind === 'model') }))
    .filter((target) => target.cards.length >= 3)
    .filter((target) => onlyPacks.length === 0 || onlyPacks.includes(target.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const setIds = [...new Set(models.map((card) => card.describe?.set).filter(Boolean))].sort();
  const setTargets = setIds
    .filter((id) => onlySets.length === 0 || onlySets.includes(id))
    .map((id) => {
      const cards = models.filter((card) => card.describe?.set === id);
      const perPack = new Map();
      for (const card of cards) {
        const { pack } = splitCardId(card.id);
        perPack.set(pack, (perPack.get(pack) ?? 0) + 1);
      }
      const ready = [...perPack.values()].filter((count) => count >= 2).length >= 2;
      return { kind: 'set', id, cards, ready };
    });
  return { packTargets, setTargets };
}

/** Renders every pack scene and set showcase in one run, collecting per-target failures instead of stopping. */
export async function runBatch({
  root: assetRoot,
  onlyPacks = [],
  onlySets = [],
  durationMs,
  fps,
  framesPerStop,
  softwareGL = process.env.GM_VERIFY_SOFTWARE_GL === '1',
}) {
  const root = await realpath(resolve(assetRoot));
  const { packTargets, setTargets } = batchTargets({ packs: await listLibraryPacks(root), onlyPacks, onlySets });
  const results = [];
  for (const target of packTargets) {
    try {
      const art = await renderPackArt({
        root,
        pack: target.id,
        cards: target.cards,
        set: target.cards[0]?.describe?.set ?? target.id,
        durationMs,
        fps,
        softwareGL,
      });
      results.push({ kind: 'pack', id: target.id, ok: true, base: art.base });
    } catch (error) {
      results.push({
        kind: 'pack',
        id: target.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const target of setTargets) {
    if (!target.ready) {
      results.push({
        kind: 'set',
        id: target.id,
        ok: false,
        error: 'a set needs at least two packs with two or more cards',
      });
      continue;
    }
    try {
      const { sequence, world, sheets } = buildSetShowcase({
        cards: target.cards,
        set: target.id,
        fps,
        framesPerStop,
      });
      const collections = await loadCollections(root, target.cards);
      const base = previewBase({ cards: target.cards, collections, base: `sets/${target.id}/showcase` });
      const sequencePath = await writeShowcasePlan({ root, base, sequence, world, sheets });
      await renderShowcase3d({ root, sequencePath, outputBase: base, softwareGL });
      results.push({ kind: 'set', id: target.id, ok: true, base });
    } catch (error) {
      results.push({
        kind: 'set',
        id: target.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) {
      throw new Error('arguments must be --name value pairs');
    }
    values[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, values };
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === 'scene' && values.root && values.pack && values['output-base']) {
    const cards = await loadPackCards(await realpath(resolve(values.root)), values.pack);
    const set = cards[0]?.describe?.set ?? values.set ?? values.pack;
    const art = await renderPackArt({ root: values.root, pack: values.pack, cards, set });
    process.stdout.write(`${JSON.stringify({ base: art.base, ...art.outputs })}\n`);
    return;
  }
  if (command === 'plan' && values.root && values.set && values['output-base']) {
    const cards = await loadSetCards(await realpath(resolve(values.root)), values.set);
    const { sequence, world, sheets } = buildSetShowcase({
      cards,
      set: values.set,
      styleFamily: values['style-family'],
    });
    const collections = await loadCollections(await realpath(resolve(values.root)), cards);
    const base = previewBase({ cards, collections, base: values['output-base'] });
    const sequencePath = await writeShowcasePlan({ root: values.root, base, sequence, world, sheets });
    process.stdout.write(`${JSON.stringify({ base, sequence: sequencePath, stops: sequence.stops.length })}\n`);
    return;
  }
  if (command === 'showcase' && values.root && values.sequence && values['output-base']) {
    process.stdout.write(
      `${JSON.stringify(await renderShowcase3d({ root: values.root, sequencePath: values.sequence, outputBase: values['output-base'] }))}\n`,
    );
    return;
  }
  if (command === 'check' && values.root && values.sequence) {
    const { issues } = await checkShowcase3d({ root: values.root, sequencePath: values.sequence });
    for (const { code, path, detail } of issues) process.stderr.write(`${code} ${path}: ${detail}\n`);
    if (issues.length) process.exitCode = 1;
    else process.stdout.write('showcase check passed\n');
    return;
  }
  if (command === 'batch' && values.root) {
    const results = await runBatch({
      root: values.root,
      onlyPacks: values.packs ? values.packs.split(',') : [],
      onlySets: values.sets ? values.sets.split(',') : [],
      durationMs: values['duration-ms'] ? Number(values['duration-ms']) : undefined,
      fps: values.fps ? Number(values.fps) : undefined,
      framesPerStop: values['frames-per-stop'] ? Number(values['frames-per-stop']) : undefined,
    });
    process.stdout.write(`${JSON.stringify(results)}\n`);
    if (results.some((result) => !result.ok)) process.exitCode = 1;
    return;
  }
  throw new Error(
    'usage: thumbnail-scene-3d.mjs scene --root DIR --pack ID --output-base REL | plan --root DIR --set ID [--style-family F] --output-base REL | showcase --root DIR --sequence FILE --output-base REL | check --root DIR --sequence FILE | batch --root DIR [--packs A,B] [--sets X,Y]',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
