import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "vitest";

import { checkShowcase } from "../check.mjs";
import { renderShowcase } from "../render.mjs";
import { inspectGif, topLevelMp4Atoms } from "../verify.mjs";
import { buildFixture, ffmpegAvailable, json } from "./render-fixture.mjs";

const execFileAsync = promisify(execFile);
const requireFromAssets = createRequire(
  new URL("../../../../packages/asset-cards/package.json", import.meta.url),
);
const sharp = requireFromAssets("sharp");
async function buildContinuousFixture(root) {
  const fixture = await buildFixture(root);
  const catalog = JSON.parse(await readFile(fixture.catalog, "utf8"));
  const card = (id, source, extra = {}) => ({
    id: `t1:${id}@fixture`,
    card_type: "asset",
    collection: { pack_id: "test-pack" },
    source: { files: [{ path: source }] },
    ...extra,
  });
  const animation = (source) => ({
    name: "walk",
    directions: ["down", "left", "right", "up"],
    frames: [0, 1, 2, 3],
    sheets: [{ path: source, frame_w: 16, frame_h: 16 }],
  });
  for (const id of ["world-ground", "west-ground", "east-ground"]) {
    catalog.cards.push(card(id, "grass.png", { subkind: "terrain" }));
  }
  for (const id of ["west-prop", "east-prop"]) {
    catalog.cards.push(card(id, "door.png", { subkind: "prop" }));
  }
  const sheet = (prefix) => ({
    grid: [6, 4],
    sprites: Array.from({ length: 24 }, (_, index) => {
      const id = `${prefix}-a${String.fromCharCode(97 + index)}`;
      const source = prefix === "east-sheet" ? "hero.png" : "shopper.png";
      catalog.cards.push(card(id, source, {
        subkind: "character",
        sprite: { animations: [animation(source)] },
      }));
      return {
        id,
        ref: `card:test-pack/${id}`,
        actions: ["walk"],
        directions: ["down", "left", "right", "up"],
      };
    }),
  });
  const westSheet = sheet("west-sheet");
  const eastSheet = sheet("east-sheet");
  await json(fixture.catalog, catalog);
  await json(path.join(fixture.project, "sequence.json"), {
    schema: "ogm.set-showcase/2",
    set: "fixture",
    style_family: "pixel-art",
    fps: 4,
    sprite_fps: 4,
    loop_seconds: 2.2,
    layout: {
      projection: "top-down",
      seam: "grid",
      viewport: [64, 64],
      directions: ["down", "left", "right", "up"],
      background: "#183018",
    },
    world: { ground: { ref: "card:test-pack/world-ground", fill: "cover" } },
    required_packs: ["test-pack"],
    runner: {
      ref: "card:test-pack/hero",
      action: "walk",
      path: { points: [[0, 0], [35.2, 0], [0, 0]] },
      speed: 32,
      collision: { type: "actor", footprint: [8, 4] },
    },
    stops: [
      {
        id: "west",
        region: "regions/west.json",
        sheet: "sheets/west.json",
        start_time: 0,
        tile_sprites: ["card:test-pack/road", "card:test-pack/west-prop"],
        sheet_sprites: westSheet.sprites.map(({ ref }) => ref),
        story: [{ actor: "runner", action: "walk", target: "west-prop", reaction: "bob", timing: [0, 0.4, 0.8] }],
      },
      {
        id: "east",
        region: "regions/east.json",
        sheet: "sheets/east.json",
        start_time: 1.1,
        tile_sprites: ["card:test-pack/east-ground", "card:test-pack/east-prop"],
        sheet_sprites: eastSheet.sprites.map(({ ref }) => ref),
        story: [{ actor: "runner", action: "walk", target: "east-prop", reaction: "bob", timing: [0, 0.4, 0.8] }],
      },
    ],
  });
  await json(path.join(fixture.project, "regions/west.json"), {
    ground: {
      fill: "layers",
      size: [32, 64],
      bounds_offset: [4, 0],
      grid: { cell: [8, 8], origin: [0, 0] },
      layers: [{ ref: "card:test-pack/road", cells: [[0, 0]] }],
    },
    sprites: [{ id: "west-prop", ref: "card:test-pack/west-prop", at: [0, -16], collision: { type: "none" } }],
  });
  await json(path.join(fixture.project, "regions/east.json"), {
    ground: { ref: "card:test-pack/east-ground", fill: "area", size: [32, 64] },
    sprites: [{ id: "east-prop", ref: "card:test-pack/east-prop", at: [0, -16], collision: { type: "none" } }],
  });
  await json(path.join(fixture.project, "sheets/west.json"), westSheet);
  await json(path.join(fixture.project, "sheets/east.json"), eastSheet);
  return fixture;
}

test.skipIf(!ffmpegAvailable)("renders baked media without a client compositor (requires ffmpeg and ffprobe)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildFixture(root);
    const output = path.join(root, "output");
    const manifest = await renderShowcase({
      projectRoot: fixture.project,
      assetsRoot: fixture.assets,
      catalogFile: fixture.catalog,
      outputRoot: output,
    });

    assert.equal(manifest.client_rendering, false);
    assert.equal(manifest.stops.length, 1);
    for (const media of [manifest.stops[0].region, manifest.stops[0].sheet]) {
      await Promise.all(Object.values(media).map((file) => readFile(path.join(output, file))));
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt", "-of", "json",
        path.join(output, media.mp4),
      ]);
      const stream = JSON.parse(stdout).streams[0];
      assert.deepEqual(stream, { codec_name: "h264", pix_fmt: "yuv420p" });

      const mp4 = await readFile(path.join(output, media.mp4));
      const atoms = topLevelMp4Atoms(mp4);
      assert.ok(atoms.indexOf("moov") < atoms.indexOf("mdat"));

      const gif = inspectGif(await readFile(path.join(output, media.gif)));
      assert.equal(gif.width, gif.height);
      assert.equal(gif.loops, 0);
    }

    const manifestFile = path.join(output, "manifest.json");
    const regionFile = path.join(output, manifest.stops[0].region.mp4);
    const publishedManifest = await readFile(manifestFile);
    const publishedRegion = await readFile(regionFile);
    const sequenceFile = path.join(fixture.project, "sequence.json");
    const sequence = JSON.parse(await readFile(sequenceFile, "utf8"));
    sequence.layout.viewport = [63, 63];
    await json(sequenceFile, sequence);

    await assert.rejects(
      renderShowcase({
        projectRoot: fixture.project,
        assetsRoot: fixture.assets,
        catalogFile: fixture.catalog,
        outputRoot: output,
      }),
    );
    assert.deepEqual(await readFile(manifestFile), publishedManifest);
    assert.deepEqual(await readFile(regionFile), publishedRegion);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves the published manifest when asset preflight fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildFixture(root);
    const output = path.join(root, "output");
    const manifestFile = path.join(output, "manifest.json");
    await mkdir(output, { recursive: true });
    await writeFile(manifestFile, "stale\n");
    await json(fixture.catalog, { cards: [] });

    await assert.rejects(
      renderShowcase({
        projectRoot: fixture.project,
        assetsRoot: fixture.assets,
        catalogFile: fixture.catalog,
        outputRoot: output,
      }),
      /asset\.unresolved/u,
    );
    assert.equal(await readFile(manifestFile, "utf8"), "stale\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight rejects a story facing the renderer may select", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildFixture(root);
    const catalog = JSON.parse(await readFile(fixture.catalog, "utf8"));
    const hero = catalog.cards.find(({ id }) => id.startsWith("t1:hero@"));
    hero.sprite.animations[0].directions = ["down"];
    await json(fixture.catalog, catalog);

    const { issues } = await checkShowcase({
      projectRoot: fixture.project,
      assetsRoot: fixture.assets,
      catalogFile: fixture.catalog,
    });

    assert.ok(issues.some(({ code, path: at }) =>
      code === "asset.unresolved" && at === "sequence.runner.left"
    ));
    assert.ok(issues.some(({ code, path: at }) =>
      code === "asset.unresolved" && at.endsWith("story[0].action.left")
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight returns structured issues for malformed ground layers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildContinuousFixture(root);
    const regionFile = path.join(fixture.project, "regions/west.json");
    const region = JSON.parse(await readFile(regionFile, "utf8"));
    region.ground.layers = { invalid: true };
    await json(regionFile, region);

    const { issues } = await checkShowcase({
      projectRoot: fixture.project,
      assetsRoot: fixture.assets,
      catalogFile: fixture.catalog,
    });

    assert.ok(issues.some(({ code }) => code === "ground.layers"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checker audits every rendered frame for collision", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildFixture(root);
    const { issues, collisionReport } = await checkShowcase({
      projectRoot: fixture.project,
      assetsRoot: fixture.assets,
      catalogFile: fixture.catalog,
    });

    assert.deepEqual(issues, []);
    assert.equal(collisionReport.frames.length, 4);
    assert.equal(collisionReport.footprintOverlapFrames, 0);
    assert.equal(collisionReport.actorSolidPixelIntersectionFrames, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renderer rejects a moving footprint collision before encoding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildFixture(root);
    const regionFile = path.join(fixture.project, "regions/store.json");
    const region = JSON.parse(await readFile(regionFile, "utf8"));
    region.sprites[0].at = [32, 32];
    await json(regionFile, region);

    await assert.rejects(
      renderShowcase({
        projectRoot: fixture.project,
        assetsRoot: fixture.assets,
        catalogFile: fixture.catalog,
        outputRoot: path.join(root, "output"),
      }),
      /collision\.footprint_overlap/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.skipIf(!ffmpegAvailable)("renders one synchronized continuous region and sheet track (requires ffmpeg and ffprobe)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildContinuousFixture(root);
    const output = path.join(root, "output");
    await mkdir(output, { recursive: true });
    const legacyFiles = [
      "legacy.region.mp4",
      "legacy.region.gif",
      "legacy.region.poster.png",
      "legacy.sheet.mp4",
      "legacy.sheet.gif",
      "legacy.sheet.poster.png",
    ];
    for (const file of legacyFiles) await writeFile(path.join(output, file), "legacy");
    await json(path.join(output, "manifest.json"), {
      schema: "ogm.set-showcase-media/1",
      stops: [{
        id: "legacy",
        region: {
          mp4: legacyFiles[0],
          gif: legacyFiles[1],
          poster: legacyFiles[2],
        },
        sheet: {
          mp4: legacyFiles[3],
          gif: legacyFiles[4],
          poster: legacyFiles[5],
        },
      }],
    });
    const manifest = await renderShowcase({
      projectRoot: fixture.project,
      assetsRoot: fixture.assets,
      catalogFile: fixture.catalog,
      outputRoot: output,
    });

    assert.equal(manifest.schema, "ogm.set-showcase-media/2");
    assert.equal(manifest.duration, 2.2);
    assert.deepEqual(manifest.stops.map(({ id, start_time: startTime }) => [id, startTime]), [
      ["west", 0],
      ["east", 1.1],
    ]);
    assert.deepEqual(manifest.speed.intervals.map(({ id, speed }) => [id, speed]), [
      ["west", 32],
      ["east", 32],
    ]);
    for (const track of Object.values(manifest.tracks)) {
      await Promise.all(Object.values(track).map((file) => readFile(path.join(output, file))));
    }
    for (const stop of manifest.stops) {
      await readFile(path.join(output, stop.region.poster));
      await readFile(path.join(output, stop.sheet.poster));
    }
    const eastSheet = await sharp(path.join(output, manifest.stops[1].sheet.poster))
      .ensureAlpha()
      .raw()
      .toBuffer();
    assert.equal(eastSheet.includes(Buffer.from([0x46, 0x7b, 0xd8, 0xff])), true);
    const westRegion = await sharp(path.join(output, manifest.stops[0].region.poster))
      .ensureAlpha()
      .raw()
      .toBuffer();
    assert.equal(westRegion.includes(Buffer.from([0x9b, 0x6b, 0x43, 0xff])), true);
    const files = await readdir(output);
    assert.equal(files.some((file) => /^(?:west|east)\.(?:region|sheet)\.mp4$/u.test(file)), false);
    assert.equal(files.filter((file) => /^timeline-\d{3}\.png$/u.test(file)).length, 3);
    assert.equal(legacyFiles.some((file) => files.includes(file)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
