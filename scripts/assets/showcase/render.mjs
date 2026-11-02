#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadAssetLibrary } from "./assets.mjs";
import { blit, canvas, spriteFrame } from "./canvas.mjs";
import { gifArgs, mp4Args, publicationAttributes } from "./media.mjs";
import { validateShowcase } from "./model.mjs";
import { loadProject, parseArgs } from "./project.mjs";

const DEFAULT_FPS = 24;
const DEFAULT_SPRITE_FPS = 12;

function safeId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error(`unsafe stop id ${JSON.stringify(id)}`);
  return id;
}

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}

function runnerPosition(sequence, tau, seconds) {
  const amount = Math.min(1, tau / seconds);
  const { from, to } = sequence.runner.path;
  return [lerp(from[0], to[0], amount), lerp(from[1], to[1], amount)];
}

function facing(sequence) {
  const { from, to } = sequence.runner.path;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const names = sequence.layout.directions;
  if (names.includes("SE")) {
    const octants = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    return octants[Math.round(angle / (Math.PI / 4)) % octants.length];
  }
  const wanted = Math.abs(dx) > Math.abs(dy)
    ? dx >= 0 ? ["right", "E"] : ["left", "W"]
    : dy >= 0 ? ["down", "S"] : ["up", "N"];
  return wanted.find((name) => names.includes(name)) ?? names[0];
}

async function drawGround(target, library, ground, offsetX, offsetY, projection) {
  const tile = await spriteFrame(library, ground, 0, ground.scale ?? 1);
  if (tile.width === 0 || tile.height === 0) throw new Error(`${ground.ref} has an empty ground frame`);
  if (projection === "isometric") {
    const rowHeight = Math.max(1, Math.floor(tile.height / 2));
    const startRow = Math.floor(-tile.height / rowHeight) - 1;
    const endRow = Math.ceil((target.height + tile.height) / rowHeight) + 1;
    for (let row = startRow; row <= endRow; row += 1) {
      const y = row * rowHeight + (((Math.round(offsetY) % rowHeight) + rowHeight) % rowHeight);
      const stagger = row % 2 === 0 ? 0 : tile.width / 2;
      const startX =
        ((Math.round(offsetX - stagger) % tile.width) + tile.width) % tile.width - tile.width + stagger;
      for (let x = startX; x < target.width + tile.width; x += tile.width) blit(target, tile, x, y);
    }
    return;
  }
  const startX = ((Math.round(offsetX) % tile.width) + tile.width) % tile.width - tile.width;
  const startY = ((Math.round(offsetY) % tile.height) + tile.height) % tile.height - tile.height;
  for (let y = startY; y < target.height; y += tile.height) {
    for (let x = startX; x < target.width; x += tile.width) blit(target, tile, x, y);
  }
}

function movingPosition(sprite, tau) {
  if (!sprite.walk) return sprite.at;
  const period = sprite.walk.seconds;
  const phase = ((tau + (sprite.walk.offset ?? 0)) % (2 * period)) / period;
  const amount = phase <= 1 ? phase : 2 - phase;
  return [
    lerp(sprite.at[0], sprite.walk.to[0], amount),
    lerp(sprite.at[1], sprite.walk.to[1], amount),
  ];
}

async function regionFrame({ project, library, stop, tau, width, height, spriteFps }) {
  const region = project.regions[stop.region];
  const target = canvas(width, height, region.background ?? "#28332a");
  const [runnerX, runnerY] = runnerPosition(project.sequence, tau, stop.seconds);
  const cameraX = width / 2 - runnerX;
  const cameraY = height / 2 - runnerY;
  await drawGround(target, library, region.ground, cameraX, cameraY, project.sequence.layout.projection);

  const draws = [];
  for (const sprite of region.sprites ?? []) {
    const resolved = await library.resolve(sprite);
    const frameIndex = Math.floor(tau * (sprite.fps ?? spriteFps)) % resolved.n;
    const frame = await spriteFrame(library, sprite, frameIndex, sprite.scale ?? 1, resolved);
    const [x, y] = movingPosition(sprite, tau);
    draws.push({
      frame,
      left: x + cameraX - frame.frameWidth / 2 + frame.offsetX,
      top: y + cameraY - frame.frameHeight + frame.offsetY,
      depth: y + (sprite.z ?? 0),
    });
  }

  const runnerSpec = { ...project.sequence.runner, dir: facing(project.sequence) };
  const runnerResolved = await library.resolve(runnerSpec);
  const runnerFrame = await spriteFrame(
    library,
    runnerSpec,
    Math.floor(tau * spriteFps) % runnerResolved.n,
    project.sequence.runner.scale ?? 1,
    runnerResolved,
  );
  draws.push({
    frame: runnerFrame,
    left: width / 2 - runnerFrame.frameWidth / 2 + runnerFrame.offsetX,
    top: height / 2 - runnerFrame.frameHeight + runnerFrame.offsetY,
    depth: runnerY + 0.5,
  });
  draws.sort((left, right) => left.depth - right.depth);
  for (const draw of draws) blit(target, draw.frame, draw.left, draw.top);
  return target;
}

async function sheetFrame({ project, library, stop, tau, width, height, spriteFps }) {
  const sheet = project.sheets[stop.sheet];
  const target = canvas(width, height, sheet.background ?? "#d4d0c4");
  const sprites = sheet.sprites ?? [];
  const columns = sheet.grid?.[0] ?? Math.ceil(Math.sqrt(sprites.length));
  const rows = sheet.grid?.[1] ?? Math.ceil(sprites.length / columns);
  const cellWidth = width / columns;
  const cellHeight = height / rows;

  for (const [index, sprite] of sprites.entries()) {
    const directionIndex = Math.floor(tau / (sheet.direction_seconds ?? 1.25));
    const dir = sprite.directions[directionIndex % sprite.directions.length];
    const actions = sprite.actions ?? [sprite.action];
    const action = actions[directionIndex % actions.length];
    const spec = { ...sprite, action, dir };
    const resolved = await library.resolve(spec);
    const frame = await spriteFrame(
      library,
      spec,
      Math.floor(tau * (sprite.fps ?? spriteFps)) % resolved.n,
      sprite.scale ?? 1,
      resolved,
    );
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cellWidth + cellWidth / 2 - frame.frameWidth / 2 + frame.offsetX;
    const top = row * cellHeight + cellHeight / 2 - frame.frameHeight / 2 + frame.offsetY;
    blit(target, frame, left, top);
  }
  return target;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"], ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

function openEncoder(file, width, height, fps) {
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    ...mp4Args({ width, height, fps }),
    "-preset", "veryfast", "-crf", "18", "-threads", "2",
    file,
  ];
  const child = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code} for ${file}`)));
  });
  return {
    async write(data) {
      if (!child.stdin.write(data)) await new Promise((resolve) => child.stdin.once("drain", resolve));
    },
    async close() {
      child.stdin.end();
      await done;
    },
  };
}

async function encodeFallbacks(mp4, gif, poster, frame, library, fps) {
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", mp4,
    ...gifArgs({ fps: Math.min(12, fps) }), gif,
  ]);
  const sharp = await library.sharp();
  await sharp(Buffer.from(frame.data), {
    raw: { width: frame.width, height: frame.height, channels: 4 },
  }).png().toFile(poster);
}

async function renderStop({ project, library, stop, output, fps, spriteFps }) {
  const [width, height] = project.sequence.layout.viewport;
  const id = safeId(stop.id);
  const regionMp4 = path.join(output, `${id}.region.mp4`);
  const sheetMp4 = path.join(output, `${id}.sheet.mp4`);
  const regionEncoder = openEncoder(regionMp4, width, height, fps);
  const sheetEncoder = openEncoder(sheetMp4, width, height, fps);
  const frames = Math.round(stop.seconds * fps);
  let regionPoster;
  let sheetPoster;

  for (let index = 0; index < frames; index += 1) {
    const tau = index / fps;
    const options = { project, library, stop, tau, width, height, spriteFps };
    const [region, sheet] = await Promise.all([regionFrame(options), sheetFrame(options)]);
    await Promise.all([regionEncoder.write(region.data), sheetEncoder.write(sheet.data)]);
    if (index === Math.floor(frames / 2)) {
      regionPoster = region;
      sheetPoster = sheet;
    }
  }
  await Promise.all([regionEncoder.close(), sheetEncoder.close()]);

  const regionGif = path.join(output, `${id}.region.gif`);
  const sheetGif = path.join(output, `${id}.sheet.gif`);
  const regionPng = path.join(output, `${id}.region.poster.png`);
  const sheetPng = path.join(output, `${id}.sheet.poster.png`);
  await Promise.all([
    encodeFallbacks(regionMp4, regionGif, regionPng, regionPoster, library, fps),
    encodeFallbacks(sheetMp4, sheetGif, sheetPng, sheetPoster, library, fps),
  ]);
  return {
    id,
    region: {
      mp4: path.basename(regionMp4), gif: path.basename(regionGif), poster: path.basename(regionPng),
    },
    sheet: {
      mp4: path.basename(sheetMp4), gif: path.basename(sheetGif), poster: path.basename(sheetPng),
    },
  };
}

export async function renderShowcase({ projectRoot, assetsRoot, catalogFile, outputRoot, only }) {
  const project = await loadProject(projectRoot);
  const issues = validateShowcase(project);
  if (issues.length) {
    throw new Error(issues.map(({ code, path, detail }) => `${code} ${path}: ${detail}`).join("\n"));
  }
  const library = await loadAssetLibrary({ assetsRoot, catalogFile });
  const output = path.resolve(outputRoot);
  await mkdir(output, { recursive: true });
  const fps = project.sequence.fps ?? DEFAULT_FPS;
  const spriteFps = project.sequence.sprite_fps ?? DEFAULT_SPRITE_FPS;
  const stops = only
    ? project.sequence.stops.filter(({ id }) => id === only)
    : project.sequence.stops;
  if (only && stops.length !== 1) throw new Error(`unknown stop ${only}`);

  const entries = [];
  for (const stop of stops) {
    console.log(`rendering ${stop.id}`);
    entries.push(await renderStop({ project, library, stop, output, fps, spriteFps }));
  }
  const manifest = {
    schema: "ogm.set-showcase-media/1",
    set: project.sequence.set,
    client_rendering: false,
    video: { codec: "h264", pixel_format: "yuv420p", faststart: true },
    attributes: publicationAttributes,
    stops: entries,
  };
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["project", "assets-root", "catalog", "output"]);
  await renderShowcase({
    projectRoot: args.project,
    assetsRoot: args["assets-root"],
    catalogFile: args.catalog,
    outputRoot: args.output,
    only: args.only,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
