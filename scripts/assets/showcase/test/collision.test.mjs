import assert from "node:assert/strict";
import test from "node:test";

import { inspectCollisionFrame } from "../collision.mjs";

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
