import assert from "node:assert/strict";
import { test } from "vitest";

import { fittedSheetScale } from "../sheet.mjs";

test("sheet sprites grow with integer nearest-neighbor scale without clipping", () => {
  assert.equal(fittedSheetScale({ width: 24, height: 32 }, 160, 160), 4);
  assert.equal(fittedSheetScale({ width: 80, height: 120 }, 160, 160), 1);
  assert.equal(fittedSheetScale({ width: 240, height: 120 }, 160, 160), 1);
});

test("an explicit sheet scale remains bounded by the cell", () => {
  assert.equal(fittedSheetScale({ width: 32, height: 32 }, 160, 160, 2), 2);
  assert.equal(fittedSheetScale({ width: 72, height: 72 }, 160, 160, 4), 1);
});
