import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { renderShowcase } from "../render.mjs";

const execFileAsync = promisify(execFile);
const requireFromAssets = createRequire(
  new URL("../../../../packages/asset-cards/package.json", import.meta.url),
);
const sharp = requireFromAssets("sharp");

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
    },
    stops: [{
      id: "store",
      region: "regions/store.json",
      sheet: "sheets/store.json",
      seconds: 1,
      tile_sprites: ["card:test-pack/grass", "card:test-pack/door"],
      sheet_sprites: ["card:test-pack/shopper"],
      story: [{ actor: "runner", action: "knock", target: "door", reaction: "open", timing: [0, 1] }],
    }],
  });
  await json(path.join(project, "regions/store.json"), {
    ground: { ref: "card:test-pack/grass", fill: "cover" },
    sprites: [{ id: "door", ref: "card:test-pack/door", at: [48, 32] }],
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

test("renders baked H.264, GIF, and poster media without a client compositor", async () => {
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
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
