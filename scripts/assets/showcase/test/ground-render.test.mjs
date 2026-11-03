import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { loadAssetLibrary } from "../assets.mjs";
import { canvas } from "../canvas.mjs";
import { drawGroundBase } from "../ground.mjs";
import { renderShowcase } from "../render.mjs";
import { buildFixture, ffmpegAvailable, json } from "./render-fixture.mjs";

const requireFromAssets = createRequire(
  new URL("../../../../packages/asset-cards/package.json", import.meta.url),
);
const sharp = requireFromAssets("sharp");

function paddedTile(width, height, paint) {
  const data = Buffer.alloc(width * height * 4);
  const pixel = (x, y) => {
    const offset = (y * width + x) * 4;
    data.set([0x60, 0x96, 0x4f, 0xff], offset);
  };
  paint(pixel);
  return data;
}

async function loadPaddedGround(root, paint) {
  const fixture = await buildFixture(root);
  const file = path.join(root, "assets/packs/test-pack/v1/extracted/grass.png");
  await sharp(paddedTile(20, 16, paint), {
    raw: { width: 20, height: 16, channels: 4 },
  }).png().toFile(file);
  return {
    fixture,
    library: await loadAssetLibrary({
      assetsRoot: fixture.assets,
      catalogFile: fixture.catalog,
    }),
  };
}

function assertNoUnderlay(frame) {
  for (let index = 0; index < frame.data.length; index += 4) {
    assert.notDeepEqual([...frame.data.subarray(index, index + 3)], [0x31, 0x55, 0x2f]);
  }
}

test("paints an opaque underlay for layer-only ground", async () => {
  const frame = canvas(4, 4);
  await drawGroundBase(
    frame,
    {},
    { fill: "layers", underlay: "#31552f" },
    0,
    0,
    "isometric",
  );

  for (let index = 0; index < frame.data.length; index += 4) {
    assert.deepEqual([...frame.data.subarray(index, index + 4)], [0x31, 0x55, 0x2f, 0xff]);
  }
});

test("fills padded top-down tiles by their painted pitch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-ground-pitch-test-"));
  try {
    const { library } = await loadPaddedGround(root, (pixel) => {
      for (let y = 5; y < 11; y += 1) {
        for (let x = 4; x < 16; x += 1) pixel(x, y);
      }
    });
    const frame = canvas(37, 37);
    await drawGroundBase(
      frame,
      library,
      { ref: "card:test-pack/grass", fill: "cover", underlay: "#31552f" },
      0,
      0,
      "top-down",
    );
    assertNoUnderlay(frame);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps the painted pitch for non-power-of-two isometric tiles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-ground-pitch-test-"));
  try {
    const widths = [4, 8, 12, 12, 8, 4];
    const { library } = await loadPaddedGround(root, (pixel) => {
      widths.forEach((rowWidth, row) => {
        const left = 4 + (12 - rowWidth) / 2;
        for (let x = left; x < left + rowWidth; x += 1) pixel(x, 5 + row);
      });
    });
    const frame = canvas(37, 37);
    await drawGroundBase(
      frame,
      library,
      { ref: "card:test-pack/grass", fill: "cover", underlay: "#31552f" },
      0,
      0,
      "isometric",
    );
    assertNoUnderlay(frame);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.skipIf(!ffmpegAvailable)("renders layered isometric ground without transparent-frame holes (requires ffmpeg and ffprobe)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-ground-test-"));
  try {
    const fixture = await buildFixture(root);
    await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
          '<rect x="4" y="6" width="8" height="4" fill="#60964f"/></svg>',
      ),
    )
      .png()
      .toFile(path.join(root, "assets/packs/test-pack/v1/extracted/diamond.png"));
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
    assert.equal(poster.includes(Buffer.from([0x31, 0x55, 0x2f, 0xff])), false);
    assert.equal(poster.includes(Buffer.from([0x9b, 0x6b, 0x43, 0xff])), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
