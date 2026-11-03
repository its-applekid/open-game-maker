import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { blendFrames, canvas, spriteFrame } from "../canvas.mjs";

const requireFromAssets = createRequire(
  new URL("../../../../packages/asset-cards/package.json", import.meta.url),
);
const sharp = requireFromAssets("sharp");

test("sprite scaling rounds fractional destination dimensions consistently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "showcase-canvas-"));
  try {
    const file = path.join(root, "odd-frame.png");
    await sharp({
      create: { width: 3, height: 5, channels: 4, background: "#e86f51" },
    }).png().toFile(file);
    const resolved = { n: 1, frame: () => ({ file }) };
    const library = { sharp: async () => sharp };

    const frame = await spriteFrame(library, {}, 0, 0.5, resolved);

    assert.equal(frame.width, 2);
    assert.equal(frame.height, 3);
    assert.equal(frame.frameWidth, 2);
    assert.equal(frame.frameHeight, 3);
    assert.equal(frame.data.length, 2 * 3 * 4);
    assert.ok(frame.data.every((value, index) => index % 4 !== 3 || value === 255));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blends equal-sized frames at a bounded weight", () => {
  const left = canvas(1, 1, "#000000");
  const right = canvas(1, 1, "#ffffff");
  const target = canvas(1, 1);

  assert.deepEqual([...blendFrames(target, left, right, 0.5).data], [128, 128, 128, 255]);
  assert.deepEqual([...blendFrames(target, left, right, 2).data], [255, 255, 255, 255]);
});
