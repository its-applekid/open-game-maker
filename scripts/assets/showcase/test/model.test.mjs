import assert from "node:assert/strict";
import { test } from "vitest";

import { continuousTimeline, validateShowcase } from "../model.mjs";
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

function validContinuousProject() {
  const sheet = (prefix) => ({
    grid: [6, 4],
    sprites: Array.from({ length: 24 }, (_, index) => {
      const suffix = `a${String.fromCharCode(97 + index)}`;
      return {
        id: `${prefix}-${suffix}`,
        ref: `card:test-pack/${prefix}-${suffix}`,
        action: "walk",
        directions,
      };
    }),
  });
  const sheetRefs = (prefix) => sheet(prefix).sprites.map(({ ref }) => ref);
  return {
    sequence: {
      schema: "ogm.set-showcase/2",
      set: "continuous-fixture",
      style_family: "pixel-art",
      loop_seconds: 2,
      layout: {
        projection: "top-down",
        seam: "grid",
        viewport: [64, 64],
        directions,
        background: "#183018",
      },
      world: {
        ground: { ref: "card:test-pack/world-ground", fill: "cover" },
      },
      required_packs: ["test-pack"],
      runner: {
        ref: "card:test-pack/hero",
        action: "walk",
        path: { points: [[0, 0], [32, 0], [0, 0]] },
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
          sheet_sprites: sheetRefs("west-sheet"),
          story: [{ actor: "runner", action: "walk", target: "west-prop", reaction: "bob", timing: [0, 0.4, 0.8] }],
        },
        {
          id: "east",
          region: "regions/east.json",
          sheet: "sheets/east.json",
          start_time: 1,
          tile_sprites: ["card:test-pack/east-ground", "card:test-pack/east-prop"],
          sheet_sprites: sheetRefs("east-sheet"),
          story: [{ actor: "runner", action: "walk", target: "east-prop", reaction: "bob", timing: [0, 0.4, 0.8] }],
        },
      ],
    },
    regions: {
      "regions/west.json": {
        ground: { ref: "card:test-pack/west-ground", fill: "area", size: [32, 64] },
        sprites: [{
          id: "west-prop",
          ref: "card:test-pack/west-prop",
          at: [0, -16],
          collision: { type: "none" },
        }],
      },
      "regions/east.json": {
        ground: { ref: "card:test-pack/east-ground", fill: "area", size: [32, 64] },
        sprites: [{
          id: "east-prop",
          ref: "card:test-pack/east-prop",
          at: [0, -16],
          collision: { type: "none" },
        }],
      },
    },
    sheets: {
      "sheets/west.json": sheet("west-sheet"),
      "sheets/east.json": sheet("east-sheet"),
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

test("rejects missing and malformed collision geometry", () => {
  const project = validProject();
  delete project.sequence.runner.collision;
  project.regions["regions/corner-store.json"].sprites[0].collision = {
    type: "solid",
    footprint: [0, 16],
    offset: [0, Number.POSITIVE_INFINITY],
  };

  const codes = validateShowcase(project).map(({ code }) => code);

  assert.ok(codes.includes("collision.type"));
  assert.ok(codes.includes("collision.footprint"));
  assert.ok(codes.includes("collision.offset"));
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

test("accepts a closed continuous route with one measured speed and 24-sprite sheets", () => {
  const project = validContinuousProject();

  assert.deepEqual(validateShowcase(project), []);
  assert.deepEqual(continuousTimeline(project.sequence), {
    loopSeconds: 2,
    intervals: [
      { id: "west", startTime: 0, seconds: 1, distance: 32, speed: 32, deviation: 0 },
      { id: "east", startTime: 1, seconds: 1, distance: 32, speed: 32, deviation: 0 },
    ],
  });
});

test("preserves intentional continuous-world source reuse while rejecting colocated copies", () => {
  const project = validContinuousProject();
  project.regions["regions/east.json"].sprites[0].ref = "card:test-pack/west-prop";
  project.sequence.stops[1].tile_sprites = [
    "card:test-pack/east-ground",
    "card:test-pack/west-prop",
  ];

  assert.deepEqual(validateShowcase(project), [], "distinct authored instances may reuse one source design");

  project.regions["regions/east.json"].sprites.push({
    ...project.regions["regions/east.json"].sprites[0],
    id: "east-prop-copy",
  });
  assert.ok(validateShowcase(project).some(({ code }) => code === "props.duplicated_placement"));
});

test("accepts ordered ground cells and validates their geometry", () => {
  const project = validContinuousProject();
  const ground = project.regions["regions/west.json"].ground;
  ground.underlay = "#477636";
  ground.bounds_offset = [16, 0];
  ground.grid = { cell: [16, 8], origin: [0, 0] };
  ground.layers = [{
    ref: "card:test-pack/west-road",
    cells: [[0, 0], [1, 0]],
  }];
  project.sequence.stops[0].tile_sprites.push("card:test-pack/west-road");

  assert.deepEqual(validateShowcase(project), []);

  ground.layers[0].cells.push([Number.NaN, 1]);
  ground.bounds_offset = [Number.POSITIVE_INFINITY, 0];
  assert.ok(validateShowcase(project).some(({ code }) => code === "ground.cells"));
  assert.ok(validateShowcase(project).some(({ code }) => code === "ground.bounds_offset"));
});

test("accepts layer-only continuous region ground over the shared world base", () => {
  const project = validContinuousProject();
  const ground = project.regions["regions/west.json"].ground;
  ground.fill = "layers";
  ground.grid = { cell: [16, 8], origin: [0, 0] };
  ground.layers = [{ ref: ground.ref, cells: [[0, 0], [1, 0]] }];
  delete ground.ref;

  assert.deepEqual(validateShowcase(project), []);
});

test("rejects missing or malformed layer-only ground without throwing", () => {
  const project = validContinuousProject();
  const ground = project.regions["regions/west.json"].ground;
  ground.fill = "layers";
  delete ground.ref;

  assert.ok(validateShowcase(project).some(({ code }) => code === "ground.layers"));

  ground.layers = "not-an-array";
  assert.ok(validateShowcase(project).some(({ code }) => code === "ground.layers"));

  ground.layers = [null];
  const issues = validateShowcase(project);
  assert.ok(issues.some(({ code }) => code === "ground.ref"));
  assert.ok(issues.some(({ code }) => code === "ground.cells"));
});

test("rejects continuous routes that cut, drift, duplicate the world, or burn text", () => {
  const project = validContinuousProject();
  project.sequence.runner.path.points[2] = [4, 0];
  project.sequence.stops[1].start_time = 1.2;
  project.sheets["sheets/east.json"].sprites.pop();
  project.sequence.stops[1].sheet_sprites.pop();
  project.regions["regions/east.json"].sprites[0].id = "west-prop";
  project.regions["regions/east.json"].sprites[0].label = "East";

  const codes = validateShowcase(project).map(({ code }) => code);

  assert.ok(codes.includes("runner.loop"));
  assert.ok(codes.includes("runner.cadence"));
  assert.ok(codes.includes("sheet.count"));
  assert.ok(codes.includes("region.entity_ids"));
  assert.ok(codes.includes("media.text_overlay"));
});

test("reserves runner identities across the continuous world", () => {
  const project = validContinuousProject();
  project.regions["regions/west.json"].sprites[0].id = "runner";

  assert.ok(validateShowcase(project).some(({ code }) => code === "region.entity_ids"));
});

test("rejects weather that the continuous compositor cannot draw", () => {
  const project = validContinuousProject();
  project.sequence.stops[0].weather = { kind: "hail", count: 12 };

  assert.ok(validateShowcase(project).some(({ code }) => code === "weather.invalid"));
});

test("accepts layered weather while validating every layer", () => {
  const project = validContinuousProject();
  project.sequence.stops[0].weather = [
    { kind: "embers", seed: "ritual", count: 12 },
    { kind: "snow", seed: "winter", count: 16, wind: 18 },
  ];
  assert.deepEqual(validateShowcase(project), []);

  project.sequence.stops[0].weather.push({ kind: "hail", count: 4 });
  assert.ok(validateShowcase(project).some(({ code }) => code === "weather.invalid"));

  project.sequence.stops[0].weather = [];
  assert.ok(validateShowcase(project).some(({ code }) => code === "weather.invalid"));

  project.sequence.stops[0].weather = [null];
  assert.ok(validateShowcase(project).some(({ code }) => code === "weather.invalid"));

  project.sequence.stops[0].weather = { kind: "rain", count: 4, wind: Number.NaN };
  assert.ok(validateShowcase(project).some(({ code }) => code === "weather.invalid"));
});

test("rejects duplicate or unsafe continuous stop ids before rendering", () => {
  const project = validContinuousProject();
  project.sequence.stops[1].id = project.sequence.stops[0].id;

  assert.ok(validateShowcase(project).some(({ code }) => code === "stops.ids"));
});

test("rejects stop intervals too short to contain a video frame", () => {
  const project = validContinuousProject();
  project.sequence.fps = 2;
  project.sequence.loop_seconds = 0.5;
  project.sequence.runner.path.points = [[0, 0], [8, 0], [0, 0]];
  project.sequence.stops[1].start_time = 0.25;
  for (const stop of project.sequence.stops) stop.story[0].timing = [0, 0.1, 0.2];

  assert.ok(validateShowcase(project).some(({ code }) => code === "runner.cadence"));
});
