import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

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

test("renders full-bleed isometric diamond ground (requires ffmpeg and ffprobe)", {
  skip: ffmpegAvailable ? false : "ffmpeg and ffprobe are unavailable",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-test-"));
  try {
    const fixture = await buildFixture(root);
    const sequenceFile = path.join(fixture.project, "sequence.json");
    const sequence = JSON.parse(await readFile(sequenceFile, "utf8"));
    sequence.layout.projection = "isometric";
    sequence.layout.seam = "diamond";
    await json(sequenceFile, sequence);
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
    const expectedGround = Buffer.from([0x60, 0x96, 0x4f, 0xff]);
    for (const offset of [0, (64 - 1) * 4, (64 * 63) * 4, (64 * 64 - 1) * 4]) {
      assert.deepEqual(poster.subarray(offset, offset + 4), expectedGround);
    }
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
