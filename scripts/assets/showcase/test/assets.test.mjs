import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { AssetLibrary } from "../assets.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ogm-showcase-assets-"));
  const extracted = path.join(root, "packs/test-pack/v1/extracted");
  await mkdir(path.join(extracted, "characters/Hero/walk/S"), { recursive: true });
  await mkdir(path.join(extracted, "tiles"), { recursive: true });
  await writeFile(path.join(root, "packs/test-pack/pack.json"), '{"current":"v1"}\n');
  await writeFile(path.join(extracted, "characters/Hero/walk/S/01.png"), "frame-one");
  await writeFile(path.join(extracted, "characters/Hero/walk/S/02.png"), "frame-two");
  await writeFile(path.join(extracted, "tiles/rock.png"), "tile");
  await writeFile(path.join(extracted, "tiles/car_E.png"), "car-east");
  return { root, library: new AssetLibrary({ assetsRoot: root, catalog: [] }) };
}

test("resolves installed pack-relative raw characters and tiles", async () => {
  const { root, library } = await fixture();
  try {
    const character = await library.resolve({
      ref: "raw-char:test-pack|characters/Hero",
      action: "walk",
      dir: "S",
    });
    const tile = await library.resolve({
      ref: "raw-tile:test-pack|tiles/rock.png",
      dir: "S",
    });

    assert.equal(character.n, 2);
    assert.match(character.frame(1).file, /characters\/Hero\/walk\/S\/02\.png$/u);
    assert.match(tile.frame(0).file, /tiles\/rock\.png$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maps diagonal raw tile facings to an installed cardinal source", async () => {
  const { root, library } = await fixture();
  try {
    const tile = await library.resolve({
      ref: "raw-tile:test-pack|tiles/car",
      dir: "NE",
    });
    assert.match(tile.frame(0).file, /tiles\/car_E\.png$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects raw references that escape the installed pack", async () => {
  const { root, library } = await fixture();
  try {
    await assert.rejects(
      library.resolve({ ref: "raw-tile:test-pack|../../outside.png", dir: "S" }),
      /asset path escapes its pack/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects raw references whose pack id escapes the pack root", async () => {
  const { root, library } = await fixture();
  try {
    await assert.rejects(
      library.resolve({ ref: "raw-tile:../../outside|tile.png", dir: "S" }),
      /invalid asset pack/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
