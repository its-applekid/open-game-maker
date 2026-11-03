import assert from "node:assert/strict";
import { test } from "vitest";

import { canvas } from "../canvas.mjs";
import { drawWeather } from "../weather.mjs";

test("continuous weather is deterministic, animated, and full-frame safe", () => {
  const weather = { kind: "rain", seed: "closed-loop", count: 32 };
  const first = canvas(96, 96, "#102030");
  const same = canvas(96, 96, "#102030");
  const later = canvas(96, 96, "#102030");

  drawWeather(first, weather, 0.25);
  drawWeather(same, weather, 0.25);
  drawWeather(later, weather, 0.75);

  assert.deepEqual(first.data, same.data);
  assert.notDeepEqual(first.data, later.data);
  assert.equal(first.data.length, 96 * 96 * 4);
});

test("supported weather kinds alter the frame without changing opacity", () => {
  for (const kind of ["rain", "dust", "falling-leaves", "pollen", "embers"]) {
    const frame = canvas(64, 64, "#102030");
    const before = Buffer.from(frame.data);
    drawWeather(frame, { kind, seed: kind, count: 16 }, 0.5);
    assert.notDeepEqual(frame.data, before, kind);
    for (let index = 3; index < frame.data.length; index += 4) {
      assert.equal(frame.data[index], 255, `${kind} alpha at ${index}`);
    }
  }
});

test("weather returns to its exact first frame at the showcase loop boundary", () => {
  for (const kind of ["rain", "dust", "falling-leaves", "pollen", "embers"]) {
    const first = canvas(64, 64, "#102030");
    const wrapped = canvas(64, 64, "#102030");
    const weather = { kind, seed: `loop-${kind}`, count: 16 };
    drawWeather(first, weather, 0, 24);
    drawWeather(wrapped, weather, 24, 24);
    assert.deepEqual(wrapped.data, first.data, kind);
  }
});

test("zero-opacity weather leaves the underlying frame unchanged", () => {
  const frame = canvas(64, 64, "#102030");
  const before = new Uint8Array(frame.data);
  drawWeather(frame, { kind: "rain", seed: "blend", count: 32 }, 0.5, 24, 0);
  assert.deepEqual(frame.data, before);
});
