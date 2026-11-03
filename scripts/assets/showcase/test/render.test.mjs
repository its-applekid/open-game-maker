import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "vitest";

import { checkShowcase } from "../check.mjs";
import { renderShowcase } from "../render.mjs";
import { inspectGif, topLevelMp4Atoms } from "../verify.mjs";

const execFileAsync = promisify(execFile);
const requireFromAssets = createRequire(
  new URL("../../../../packages/asset-cards/package.json", import.meta.url),
);
const sharp = requireFromAssets("sharp");
const ffmpegAvailable = ["ffmpeg", "ffprobe"].every((command) =>
  spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0
);

async function json(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function buildFixture(root) {
  const extracted = path.join(root, "assets/packs/test-pack/v1/extracted");
  const project = path.join(root, "project");
  await mkdir(extracted, { recursive: true });
  await mkdir(path.join(project, "regions"), { recursive: true });
  await mkdir(path.join(project, "sheets"), { recursive: true });
  await json(path.join(root, "assets/packs/test-pack/pack.json"), { current: "v1" });

  await sharp({
    create: { width: 8, height: 8, channels: 4, background: "#60964f" },
  }).png().toFile(path.join(extracted, "grass.png"));
  await sharp(Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">' +
    '<polygon points="4,0 8,4 4,8 0,4" fill="#60964f"/></svg>',
  )).png().toFile(path.join(extracted, "diamond.png"));
  await sharp({
    create: { width: 8, height: 8, channels: 4, background: "#9b6b43" },
  }).png().toFile(path.join(extracted, "road.png"));
  await sharp({
    create: { width: 8, height: 16, channels: 4, background: "#bd6c3d" },
  }).png().toFile(path.join(extracted, "door.png"));
  await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#467bd8" },
  }).png().toFile(path.join(extracted, "hero.png"));
  await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#d2b94b" },
  }).png().toFile(path.join(extracted, "shopper.png"));

  const animation = (source) => ({
    name: "walk",
    directions: ["down", "left", "right", "up"],
    frames: [0, 1, 2, 3],
    sheets: [{ path: source, frame_w: 16, frame_h: 16 }],
  });
  const card = (id, source, extra = {}) => ({
    id: `t1:${id}@fixture`,
    card_type: "asset",
    collection: { pack_id: "test-pack" },
    source: { files: [{ path: source }] },
    ...extra,
  });
  await json(path.join(root, "catalog.json"), {
    cards: [
      card("grass", "grass.png", { subkind: "terrain" }),
      card("diamond", "diamond.png", { subkind: "terrain" }),
      card("road", "road.png", { subkind: "terrain" }),
      card("door", "door.png", { subkind: "prop" }),
      card("hero", "hero.png", { subkind: "character", sprite: { animations: [animation("hero.png")] } }),
      card("shopper", "shopper.png", { subkind: "character", sprite: { animations: [animation("shopper.png")] } }),
    ],
  });

  await json(path.join(project, "sequence.json"), {
    schema: "ogm.set-showcase/1",
    set: "fixture",
    style_family: "pixel-art",
    fps: 4,
    sprite_fps: 4,
    layout: {
      projection: "top-down",
      seam: "grid",
      viewport: [64, 64],
      directions: ["down", "left", "right", "up"],
    },
    required_packs: ["test-pack"],
    runner: {
      ref: "card:test-pack/hero",
      action: "walk",
      path: { from: [0, 32], to: [64, 32] },
      speed: 64,
      collision: { type: "actor", footprint: [8, 4] },
    },
    stops: [{
      id: "store",
      region: "regions/store.json",
      sheet: "sheets/store.json",
      seconds: 1,
      tile_sprites: ["card:test-pack/grass", "card:test-pack/door"],
      sheet_sprites: ["card:test-pack/shopper"],
      story: [{ actor: "runner", action: "walk", target: "door", reaction: "bob", timing: [0, 0.5, 1] }],
    }],
  });
  await json(path.join(project, "regions/store.json"), {
    ground: { ref: "card:test-pack/grass", fill: "cover" },
    sprites: [{
      id: "door",
      ref: "card:test-pack/door",
      at: [48, 8],
      collision: { type: "solid", footprint: [8, 4] },
    }],
  });
  await json(path.join(project, "sheets/store.json"), {
    sprites: [{
      id: "shopper",
      ref: "card:test-pack/shopper",
      actions: ["walk"],
      directions: ["down", "left", "right", "up"],
    }],
  });
  return { project, assets: path.join(root, "assets"), catalog: path.join(root, "catalog.json") };
}

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
        tile_sprites: ["card:test-pack/west-ground", "card:test-pack/west-prop"],
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
    ground: { ref: "card:test-pack/west-ground", fill: "area", size: [32, 64] },
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

test("renders baked media without a client compositor (requires ffmpeg and ffprobe)", {
  skip: ffmpegAvailable ? false : "ffmpeg and ffprobe are unavailable",
}, async () => {
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
    sequence.runner.scale = 1.1;
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

test("renders layered isometric ground over an opaque underlay (requires ffmpeg and ffprobe)", {
  skip: ffmpegAvailable ? false : "ffmpeg and ffprobe are unavailable",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildFixture(root);
    const sequenceFile = path.join(fixture.project, "sequence.json");
    const sequence = JSON.parse(await readFile(sequenceFile, "utf8"));
    sequence.layout.projection = "isometric";
    sequence.layout.seam = "diamond";
    sequence.stops[0].tile_sprites = [
      "card:test-pack/diamond",
      "card:test-pack/road",
      "card:test-pack/door",
    ];
    await json(sequenceFile, sequence);
    await json(path.join(fixture.project, "regions/store.json"), {
      ground: {
        ref: "card:test-pack/diamond",
        fill: "cover",
        underlay: "#31552f",
        grid: { cell: [8, 8], origin: [32, 32] },
        layers: [{ ref: "card:test-pack/road", cells: [[0, 0]] }],
      },
      sprites: [{
        id: "door",
        ref: "card:test-pack/door",
        at: [48, 8],
        collision: { type: "solid", footprint: [8, 4] },
      }],
    });
    const output = path.join(root, "output");

    const manifest = await renderShowcase({
      projectRoot: fixture.project,
      assetsRoot: fixture.assets,
      catalogFile: fixture.catalog,
      outputRoot: output,
    });
    const poster = await sharp(path.join(output, manifest.stops[0].region.poster))
      .raw()
      .toBuffer();
    const emptyBackground = "28332aff";
    for (const offset of [0, (64 - 1) * 4, (64 * 63) * 4, (64 * 64 - 1) * 4]) {
      const pixel = poster.subarray(offset, offset + 4);
      assert.notEqual(pixel.toString("hex"), emptyBackground);
      assert.equal(pixel[3], 255);
    }
    assert.equal(poster.includes(Buffer.from([0x9b, 0x6b, 0x43, 0xff])), true);
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

test("renders one synchronized continuous region and sheet track (requires ffmpeg and ffprobe)", {
  skip: ffmpegAvailable ? false : "ffmpeg and ffprobe are unavailable",
}, async () => {
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
    const files = await readdir(output);
    assert.equal(files.some((file) => /^(?:west|east)\.(?:region|sheet)\.mp4$/u.test(file)), false);
    assert.equal(files.filter((file) => /^timeline-\d{3}\.png$/u.test(file)).length, 3);
    assert.equal(legacyFiles.some((file) => files.includes(file)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
