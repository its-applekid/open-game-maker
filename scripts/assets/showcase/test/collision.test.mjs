import assert from "node:assert/strict";
import { test } from "vitest";

import { inspectCollisionFrame, inspectRouteCorridor } from "../collision.mjs";

function opaqueFrame(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  return { data, width, height };
}

function entity({ id, type, at, depth = at[1], left, top, footprint = [8, 4] }) {
  return {
    id,
    at,
    depth,
    left,
    top,
    frame: opaqueFrame(8, 8),
    collision: { type, footprint },
  };
}

test("reports full-footprint overlap even when anchors differ", () => {
  const report = inspectCollisionFrame([
    entity({ id: "tent-a", type: "solid", at: [10, 10], left: 6, top: 2 }),
    entity({ id: "tent-b", type: "solid", at: [17, 10], left: 13, top: 2 }),
  ]);

  assert.deepEqual(report.footprintOverlaps.map(({ ids }) => ids), [["tent-a", "tent-b"]]);
});

test("allows touching footprint edges but rejects an actor drawn through a foreground solid", () => {
  const report = inspectCollisionFrame([
    entity({ id: "counter", type: "solid", at: [10, 10], depth: 10, left: 6, top: 2 }),
    entity({ id: "shopper", type: "actor", at: [18, 10], depth: 11, left: 10, top: 2 }),
  ]);

  assert.deepEqual(report.footprintOverlaps, []);
  assert.equal(report.actorSolidPixelIntersections.length, 1);
  assert.deepEqual(report.actorSolidPixelIntersections[0].ids, ["shopper", "counter"]);
  assert.equal(report.actorSolidPixelIntersections[0].pixels, 32);
});

test("permits pixel occlusion when the actor is depth-sorted behind the solid", () => {
  const report = inspectCollisionFrame([
    entity({ id: "counter", type: "solid", at: [10, 10], depth: 10, left: 6, top: 2 }),
    entity({ id: "shopper", type: "actor", at: [18, 10], depth: 9, left: 10, top: 2 }),
  ]);

  assert.deepEqual(report.footprintOverlaps, []);
  assert.deepEqual(report.actorSolidPixelIntersections, []);
});

test("reports any later-drawn sprite that covers the continuous runner", () => {
  const report = inspectCollisionFrame([
    entity({ id: "runner", type: "actor", at: [10, 10], depth: 9, left: 6, top: 2 }),
    entity({ id: "tree-canopy", type: "none", at: [18, 10], depth: 10, left: 10, top: 2 }),
  ]);

  assert.deepEqual(report.runnerOcclusions, [{ ids: ["runner", "tree-canopy"], pixels: 32 }]);
});

test("route corridor allows a boundary touch but rejects a closing-segment crossing", () => {
  const points = [[0, 0], [20, 0], [20, 20], [0, 0]];
  const runnerFootprint = [4, 4];
  const touching = inspectRouteCorridor({
    points,
    runnerFootprint,
    placements: [{
      id: "touching-fence",
      at: [15, 6],
      collision: { type: "solid", footprint: [4, 4] },
    }],
  });
  assert.deepEqual(touching, []);

  const crossing = inspectRouteCorridor({
    points,
    runnerFootprint,
    placements: [{
      id: "closing-tree",
      at: [10, 10],
      collision: { type: "none", footprint: [4, 4] },
    }],
  });
  assert.deepEqual(crossing, [{ entity: "closing-tree", segment: 2 }]);

  const bottomAnchoredOverlap = inspectRouteCorridor({
    points: [[0, 13], [20, 13]],
    runnerFootprint,
    placements: [{
      id: "lower-tree",
      at: [10, 10],
      collision: { type: "solid", footprint: [4, 4] },
    }],
  });
  assert.deepEqual(bottomAnchoredOverlap, [{ entity: "lower-tree", segment: 0 }]);

  const bottomBoundary = inspectRouteCorridor({
    points: [[0, 14], [20, 14]],
    runnerFootprint,
    placements: [{
      id: "lower-boundary-tree",
      at: [10, 10],
      collision: { type: "solid", footprint: [4, 4] },
    }],
  });
  assert.deepEqual(bottomBoundary, []);

  const sweptCrossing = inspectRouteCorridor({
    points: [[0, 0], [20, 0]],
    runnerFootprint,
    placements: [{
      id: "walking-actor",
      at: [10, -10],
      walk: { to: [10, 10] },
      collision: { type: "actor", footprint: [4, 4] },
    }],
  });
  assert.deepEqual(sweptCrossing, [{ entity: "walking-actor", segment: 0 }]);
});
