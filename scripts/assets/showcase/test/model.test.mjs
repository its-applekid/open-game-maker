import assert from "node:assert/strict";
import test from "node:test";

import { validateShowcase } from "../model.mjs";
import { gifArgs, mp4Args, publicationAttributes } from "../media.mjs";

const directions = ["down", "left", "right", "up"];

function validProject() {
  return {
    sequence: {
      schema: "ogm.set-showcase/1",
      set: "limezu-modern",
      style_family: "modern-pixel-art",
      layout: {
        projection: "top-down",
        seam: "grid",
        viewport: [256, 256],
        directions,
      },
      required_packs: ["limezu-modern-exteriors", "limezu-modern-characters"],
      runner: {
        ref: "card:limezu-modern-characters/hero",
        action: "walk",
        path: { from: [-24, 128], to: [280, 128] },
        speed: 48,
        collision: { type: "actor", footprint: [12, 8] },
      },
      stops: [
        {
          id: "corner-store",
          region: "regions/corner-store.json",
          sheet: "sheets/corner-store.json",
          seconds: 6,
          tile_sprites: [
            "card:limezu-modern-exteriors/asphalt",
            "card:limezu-modern-exteriors/storefront",
          ],
          sheet_sprites: ["card:limezu-modern-characters/shopper"],
          story: [
            {
              actor: "hero",
              action: "knock",
              target: "shop-door",
              reaction: "open",
              timing: [1, 2.5, 4],
            },
          ],
        },
      ],
    },
    regions: {
      "regions/corner-store.json": {
        ground: {
          ref: "card:limezu-modern-exteriors/asphalt",
          fill: "cover",
        },
        sprites: [
          {
            id: "shop-door",
            ref: "card:limezu-modern-exteriors/storefront",
            at: [128, 72],
            collision: { type: "solid", footprint: [48, 16] },
          },
        ],
      },
    },
    sheets: {
      "sheets/corner-store.json": {
        sprites: [
          {
            id: "shopper",
            ref: "card:limezu-modern-characters/shopper",
            action: "walk",
            directions,
          },
        ],
      },
    },
  };
}

test("accepts a full-bleed scene with a walking runner and explicit story reaction", () => {
  const issues = validateShowcase(validProject());

  assert.deepEqual(issues, []);
});

test("accepts isometric worlds only with diamond seams", () => {
  const project = validProject();
  project.sequence.layout.projection = "isometric";
  project.sequence.layout.seam = "diamond";

  assert.deepEqual(validateShowcase(project), []);
  project.sequence.layout.seam = "grid";
  assert.ok(validateShowcase(project).some(({ code }) => code === "layout.seam"));
});

test("rejects empty edges, air attacks, and scene/sheet sprite overlap", () => {
  const project = validProject();
  project.regions["regions/corner-store.json"].ground.fill = "contain";
  project.sequence.stops[0].story[0].target = "missing-target";
  project.sequence.stops[0].sheet_sprites.push(
    "card:alternate-resolution/storefront",
  );
  project.sheets["sheets/corner-store.json"].sprites.push({
    id: "storefront-sheet",
    ref: "card:alternate-resolution/storefront",
    action: "idle",
    directions,
  });
  project.sheets["sheets/corner-store.json"].sprites[0].directions = [...directions].reverse();

  const codes = validateShowcase(project).map(({ code }) => code);

  assert.ok(codes.includes("region.full_bleed"));
  assert.ok(codes.includes("story.target_missing"));
  assert.ok(codes.includes("sprites.overlap"));
  assert.ok(codes.includes("sheet.directions"));
});

test("rejects uncovered packs and repeated props between regions", () => {
  const project = validProject();
  project.sequence.required_packs.push("limezu-modern-farm");
  project.sequence.stops.push({
    id: "second-corner",
    region: "regions/second-corner.json",
    sheet: "sheets/second-corner.json",
    seconds: 6,
    tile_sprites: [
      "card:limezu-modern-exteriors/asphalt",
      "card:limezu-modern-exteriors/storefront",
    ],
    sheet_sprites: [],
    story: [
      {
        actor: "runner",
        action: "walk",
        target: "shop-door-two",
        reaction: "wave",
        timing: [0, 1.5, 3],
      },
    ],
  });
  project.regions["regions/second-corner.json"] = {
    ground: {
      ref: "card:limezu-modern-exteriors/asphalt",
      fill: "cover",
    },
    sprites: [
      {
        id: "shop-door-two",
        ref: "card:limezu-modern-exteriors/storefront",
        at: [96, 64],
      },
    ],
  };
  project.sheets["sheets/second-corner.json"] = { sprites: [] };

  const issues = validateShowcase(project);

  assert.ok(issues.some(({ code, detail }) =>
    code === "pack.uncovered" && detail.includes("limezu-modern-farm")
  ));
  assert.ok(issues.some(({ code, detail }) =>
    code === "props.repeated" && detail.includes("storefront")
  ));
});

test("rejects unstable entity ids and story timing without a contact point", () => {
  const project = validProject();
  project.regions["regions/corner-store.json"].sprites.push({
    id: "shop-door",
    ref: "card:limezu-modern-exteriors/sign",
    at: [32, 32],
  });
  project.sequence.stops[0].tile_sprites.push(
    "card:limezu-modern-exteriors/sign",
  );
  project.sequence.stops[0].story[0].timing = [1, 4];

  const codes = validateShowcase(project).map(({ code }) => code);

  assert.ok(codes.includes("region.entity_ids"));
  assert.ok(codes.includes("story.timing"));
});

test("rejects a duplicate design inside one region", () => {
  const project = validProject();
  project.regions["regions/corner-store.json"].sprites.push({
    id: "shop-door-copy",
    ref: "card:alternate-resolution/storefront",
    at: [32, 32],
    collision: { type: "solid", footprint: [48, 16] },
  });
  project.sequence.stops[0].tile_sprites.push(
    "card:alternate-resolution/storefront",
  );

  assert.ok(validateShowcase(project).some(({ code }) => code === "props.duplicated"));
});

test("publishes phone-ready H.264 video with GIF fallback", () => {
  const video = mp4Args({ width: 256, height: 256, fps: 24 });
  const gif = gifArgs({ fps: 12 });

  assert.ok(video.includes("libx264"));
  assert.ok(video.includes("yuv420p"));
  assert.ok(video.includes("+faststart"));
  assert.ok(gif.includes("0"), "GIF output should loop forever");
  assert.deepEqual(publicationAttributes, {
    autoPlay: true,
    loop: true,
    muted: true,
    playsInline: true,
  });
});
