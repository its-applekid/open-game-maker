import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromAssets = createRequire(
  new URL("../../../../packages/asset-cards/package.json", import.meta.url),
);
const sharp = requireFromAssets("sharp");

export const ffmpegAvailable = ["ffmpeg", "ffprobe"].every(
  (command) => spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0,
);

export async function json(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function buildFixture(root) {
  const extracted = path.join(root, "assets/packs/test-pack/v1/extracted");
  const project = path.join(root, "project");
  await mkdir(extracted, { recursive: true });
  await mkdir(path.join(project, "regions"), { recursive: true });
  await mkdir(path.join(project, "sheets"), { recursive: true });
  await json(path.join(root, "assets/packs/test-pack/pack.json"), { current: "v1" });

  await sharp({
    create: { width: 8, height: 8, channels: 4, background: "#60964f" },
  })
    .png()
    .toFile(path.join(extracted, "grass.png"));
  await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">' +
        '<polygon points="4,0 8,4 4,8 0,4" fill="#60964f"/></svg>',
    ),
  )
    .png()
    .toFile(path.join(extracted, "diamond.png"));
  await sharp({
    create: { width: 8, height: 8, channels: 4, background: "#9b6b43" },
  })
    .png()
    .toFile(path.join(extracted, "road.png"));
  await sharp({
    create: { width: 8, height: 16, channels: 4, background: "#bd6c3d" },
  })
    .png()
    .toFile(path.join(extracted, "door.png"));
  await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#467bd8" },
  })
    .png()
    .toFile(path.join(extracted, "hero.png"));
  await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#d2b94b" },
  })
    .png()
    .toFile(path.join(extracted, "shopper.png"));

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
      card("hero", "hero.png", {
        subkind: "character",
        sprite: { animations: [animation("hero.png")] },
      }),
      card("shopper", "shopper.png", {
        subkind: "character",
        sprite: { animations: [animation("shopper.png")] },
      }),
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
    stops: [
      {
        id: "store",
        region: "regions/store.json",
        sheet: "sheets/store.json",
        seconds: 1,
        tile_sprites: ["card:test-pack/grass", "card:test-pack/door"],
        sheet_sprites: ["card:test-pack/shopper"],
        story: [
          {
            actor: "runner",
            action: "walk",
            target: "door",
            reaction: "bob",
            timing: [0, 0.5, 1],
          },
        ],
      },
    ],
  });
  await json(path.join(project, "regions/store.json"), {
    ground: { ref: "card:test-pack/grass", fill: "cover" },
    sprites: [
      {
        id: "door",
        ref: "card:test-pack/door",
        at: [48, 8],
        collision: { type: "solid", footprint: [8, 4] },
      },
    ],
  });
  await json(path.join(project, "sheets/store.json"), {
    sprites: [
      {
        id: "shopper",
        ref: "card:test-pack/shopper",
        actions: ["walk"],
        directions: ["down", "left", "right", "up"],
      },
    ],
  });
  return {
    project,
    assets: path.join(root, "assets"),
    catalog: path.join(root, "catalog.json"),
  };
}
