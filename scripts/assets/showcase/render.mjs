#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadAssetLibrary } from "./assets.mjs";
import { blendFrames, blit, canvas, spriteFrame } from "./canvas.mjs";
import { auditShowcaseCollisions } from "./collision.mjs";
import { prepareContinuousFrame } from "./continuous-scene.mjs";
import {
  continuousTimeline,
  isContinuousShowcase,
} from "./continuous.mjs";
import { drawGround } from "./ground.mjs";
import { verifyProjectAssets } from "./check.mjs";
import { gifArgs, mp4Args, publicationAttributes } from "./media.mjs";
import { validateShowcase } from "./model.mjs";
import { loadProject, parseArgs } from "./project.mjs";
import { publishStagedShowcase } from "./publish.mjs";
import { prepareRegionFrame } from "./scene.mjs";
import { fittedSheetScale } from "./sheet.mjs";
import { verifyShowcaseMedia } from "./verify.mjs";
import { drawWeatherLayers } from "./weather.mjs";

const DEFAULT_FPS = 24;
const DEFAULT_SPRITE_FPS = 12;

function safeId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error(`unsafe stop id ${JSON.stringify(id)}`);
  return id;
}

async function regionFrame({ project, library, stop, tau, width, height, spriteFps }) {
  const region = project.regions[stop.region];
  const target = canvas(width, height, region.background ?? "#28332a");
  const { cameraX, cameraY, entities } = await prepareRegionFrame({
    project,
    library,
    stop,
    tau,
    width,
    height,
    spriteFps,
  });
  await drawGround(target, library, region.ground, cameraX, cameraY, project.sequence.layout.projection);
  for (const entity of entities) blit(target, entity.frame, entity.left, entity.top);
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
    const frameIndex = Math.floor(tau * (sprite.fps ?? spriteFps)) % resolved.n;
    const natural = await spriteFrame(library, spec, frameIndex, 1, resolved);
    const scale = fittedSheetScale(natural, cellWidth, cellHeight, sprite.scale);
    const frame = scale === 1 ? natural : await spriteFrame(
      library,
      spec,
      frameIndex,
      scale,
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

async function continuousRegionFrame({ project, library, tau, width, height, spriteFps }) {
  const target = canvas(width, height, project.sequence.layout.background ?? "#28332a");
  const prepared = await prepareContinuousFrame({
    project,
    library,
    tau,
    width,
    height,
    spriteFps,
  });
  const projection = project.sequence.layout.projection;
  await drawGround(
    target,
    library,
    project.sequence.world.ground,
    prepared.cameraX,
    prepared.cameraY,
    projection,
  );
  const regionGround = (stop, index) => {
    const ground = project.regions[stop.region].ground;
    const [centerX, centerY] = project.sequence.runner.path.points[index];
    return {
      ground,
      offsetX: centerX + prepared.cameraX,
      offsetY: centerY + prepared.cameraY,
    };
  };
  const weatherBlend = prepared.runner.localTime / prepared.runner.interval.seconds;
  const nextIndex = (prepared.runner.index + 1) % project.sequence.stops.length;
  const nextStop = project.sequence.stops[nextIndex];
  const grounds = [
    regionGround(prepared.runner.stop, prepared.runner.index),
    regionGround(nextStop, nextIndex),
  ];
  const groundFrames = grounds.map(() => ({ ...target, data: target.data.slice() }));
  await Promise.all(grounds.map(({ ground, offsetX, offsetY }, index) =>
    drawGround(groundFrames[index], library, ground, offsetX, offsetY, projection)
  ));
  blendFrames(target, groundFrames[0], groundFrames[1], weatherBlend);
  drawWeatherLayers(
    target,
    prepared.runner.stop.weather,
    tau,
    project.sequence.loop_seconds,
    1 - weatherBlend,
  );
  drawWeatherLayers(target, nextStop.weather, tau, project.sequence.loop_seconds, weatherBlend);
  for (const entity of prepared.entities) blit(target, entity.frame, entity.left, entity.top);
  return { frame: target, runner: prepared.runner };
}

async function writePng(frame, file, library) {
  const sharp = await library.sharp();
  await sharp(Buffer.from(frame.data), {
    raw: { width: frame.width, height: frame.height, channels: 4 },
  }).png().toFile(file);
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
  let failure;
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code} for ${file}`)));
  });
  void done.catch((error) => {
    failure = error;
  });
  child.stdin.on("error", (error) => {
    failure ??= error;
  });
  return {
    async write(data) {
      if (failure) throw failure;
      if (!child.stdin.write(data)) {
        await Promise.race([
          once(child.stdin, "drain"),
          done.then(
            () => {
              throw new Error(`ffmpeg closed before all frames were written for ${file}`);
            },
            (error) => {
              throw error;
            },
          ),
        ]);
      }
      if (failure) throw failure;
    },
    async close() {
      if (!child.stdin.destroyed) child.stdin.end();
      await done;
    },
    async abort() {
      if (!child.stdin.destroyed) child.stdin.destroy();
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await done.catch(() => {});
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

  try {
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
  } catch (error) {
    await Promise.allSettled([regionEncoder.abort(), sheetEncoder.abort()]);
    await Promise.allSettled([
      rm(regionMp4, { force: true }),
      rm(sheetMp4, { force: true }),
    ]);
    throw error;
  }

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

async function renderContinuous({ project, library, output, fps, spriteFps }) {
  const [width, height] = project.sequence.layout.viewport;
  const regionMp4 = path.join(output, "showcase.region.mp4");
  const sheetMp4 = path.join(output, "showcase.sheet.mp4");
  const regionEncoder = openEncoder(regionMp4, width, height, fps);
  const sheetEncoder = openEncoder(sheetMp4, width, height, fps);
  const frames = Math.round(project.sequence.loop_seconds * fps);
  const stopPosters = new Map();
  const timeline = [];
  let regionPoster;
  let sheetPoster;

  try {
    for (let index = 0; index < frames; index += 1) {
      const tau = index / fps;
      const { frame: region, runner } = await continuousRegionFrame({
        project,
        library,
        tau,
        width,
        height,
        spriteFps,
      });
      const sheet = await sheetFrame({
        project,
        library,
        stop: runner.stop,
        tau: runner.localTime,
        width,
        height,
        spriteFps,
      });
      await Promise.all([regionEncoder.write(region.data), sheetEncoder.write(sheet.data)]);
      if (index === 0) {
        regionPoster = region;
        sheetPoster = sheet;
      }
      if (!stopPosters.has(runner.stop.id)) {
        stopPosters.set(runner.stop.id, { region, sheet });
      }
      if (index % fps === 0) {
        const file = `timeline-${String(timeline.length).padStart(3, "0")}.png`;
        await writePng(region, path.join(output, file), library);
        timeline.push(file);
      }
    }
    await Promise.all([regionEncoder.close(), sheetEncoder.close()]);
  } catch (error) {
    await Promise.allSettled([regionEncoder.abort(), sheetEncoder.abort()]);
    await Promise.allSettled([rm(regionMp4, { force: true }), rm(sheetMp4, { force: true })]);
    throw error;
  }

  const region = {
    mp4: path.basename(regionMp4),
    gif: "showcase.region.gif",
    poster: "showcase.region.poster.png",
  };
  const sheet = {
    mp4: path.basename(sheetMp4),
    gif: "showcase.sheet.gif",
    poster: "showcase.sheet.poster.png",
  };
  await Promise.all([
    encodeFallbacks(regionMp4, path.join(output, region.gif), path.join(output, region.poster), regionPoster, library, fps),
    encodeFallbacks(sheetMp4, path.join(output, sheet.gif), path.join(output, sheet.poster), sheetPoster, library, fps),
  ]);

  const stops = [];
  for (const stop of project.sequence.stops) {
    const posters = stopPosters.get(stop.id);
    const regionPosterFile = `${safeId(stop.id)}.region.poster.png`;
    const sheetPosterFile = `${safeId(stop.id)}.sheet.poster.png`;
    await Promise.all([
      writePng(posters.region, path.join(output, regionPosterFile), library),
      writePng(posters.sheet, path.join(output, sheetPosterFile), library),
    ]);
    stops.push({
      id: stop.id,
      ...(stop.scene ? { label: stop.scene } : {}),
      start_time: stop.start_time,
      region: { poster: regionPosterFile },
      sheet: { poster: sheetPosterFile },
    });
  }
  const speed = continuousTimeline(project.sequence);
  return {
    schema: "ogm.set-showcase-media/2",
    set: project.sequence.set,
    client_rendering: false,
    duration: project.sequence.loop_seconds,
    video: { codec: "h264", pixel_format: "yuv420p", faststart: true },
    attributes: publicationAttributes,
    tracks: { region, sheet },
    stops,
    speed: {
      unit: "projected-px/s",
      declared: project.sequence.runner.speed,
      intervals: speed.intervals.map(({ id, startTime, seconds, distance, speed: measured, deviation }) => ({
        id,
        start_time: startTime,
        seconds,
        distance,
        speed: measured,
        deviation,
      })),
    },
    qa: { timeline_fps: 1, timeline },
  };
}

export async function renderShowcase({ projectRoot, assetsRoot, catalogFile, outputRoot, only }) {
  const project = await loadProject(projectRoot);
  const output = path.resolve(outputRoot);
  const manifestFile = path.join(output, "manifest.json");
  await mkdir(output, { recursive: true });
  const issues = validateShowcase(project);
  if (issues.length) {
    throw new Error(issues.map(({ code, path, detail }) => `${code} ${path}: ${detail}`).join("\n"));
  }
  const library = await loadAssetLibrary({ assetsRoot, catalogFile });
  const assetIssues = await verifyProjectAssets(project, library);
  if (assetIssues.length) {
    throw new Error(assetIssues.map(({ code, path: at, detail }) => `${code} ${at}: ${detail}`).join("\n"));
  }
  const fps = project.sequence.fps ?? DEFAULT_FPS;
  const spriteFps = project.sequence.sprite_fps ?? DEFAULT_SPRITE_FPS;
  const stops = only
    ? project.sequence.stops.filter(({ id }) => id === only)
    : project.sequence.stops;
  if (only && stops.length !== 1) throw new Error(`unknown stop ${only}`);
  const collisionReport = await auditShowcaseCollisions({ project, library, stops });
  if (collisionReport.issues.length) {
    throw new Error(collisionReport.issues.map(
      ({ code, path: at, detail }) => `${code} ${at}: ${detail}`,
    ).join("\n"));
  }

  const staging = await mkdtemp(path.join(output, ".showcase-staging-"));
  try {
    if (isContinuousShowcase(project.sequence)) {
      if (only) throw new Error("continuous showcases render as one loop and do not support --only");
      const manifest = await renderContinuous({ project, library, output: staging, fps, spriteFps });
      const mediaIssues = await verifyShowcaseMedia({ manifest, output: staging, project, library });
      if (mediaIssues.length) {
        throw new Error(mediaIssues.map(({ path: at, detail }) => `media.invalid ${at}: ${detail}`).join("\n"));
      }
      const stagedManifest = path.join(staging, "manifest.json");
      await writeFile(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
      await publishStagedShowcase({ staging, output });
      return manifest;
    }
    const entries = [];
    for (const stop of stops) {
      console.log(`rendering ${stop.id}`);
      entries.push(await renderStop({ project, library, stop, output: staging, fps, spriteFps }));
    }
    const manifest = {
      schema: "ogm.set-showcase-media/1",
      set: project.sequence.set,
      client_rendering: false,
      video: { codec: "h264", pixel_format: "yuv420p", faststart: true },
      attributes: publicationAttributes,
      stops: entries,
    };
    const mediaIssues = await verifyShowcaseMedia({ manifest, output: staging, project, library });
    if (mediaIssues.length) {
      throw new Error(mediaIssues.map(({ path: at, detail }) => `media.invalid ${at}: ${detail}`).join("\n"));
    }

    const stagedManifest = path.join(staging, "manifest.json");
    await writeFile(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(manifestFile, { force: true });
    for (const entry of entries) {
      for (const media of [entry.region, entry.sheet]) {
        for (const file of Object.values(media)) {
          await rename(path.join(staging, file), path.join(output, file));
        }
      }
    }
    await rename(stagedManifest, manifestFile);
    return manifest;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
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
