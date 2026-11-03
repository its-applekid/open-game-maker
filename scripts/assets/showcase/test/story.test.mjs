import assert from "node:assert/strict";
import { test } from "vitest";

import { storyFrameIndex, storyState, storyTransform } from "../story.mjs";

const story = [
  {
    actor: "hero",
    action: "attack",
    target: "gate",
    reaction: "bob",
    timing: [1, 2, 4],
  },
];

test("stages a one-shot action before contact and reaction after contact", () => {
  assert.equal(storyState(story, "hero", 0.5), undefined);
  assert.deepEqual(storyState(story, "hero", 1.5), {
    beat: story[0],
    role: "actor",
    phase: "action",
    progress: 0.5,
  });
  assert.deepEqual(storyState(story, "gate", 2.5), {
    beat: story[0],
    role: "target",
    phase: "reaction",
    progress: 0.25,
  });
  assert.equal(storyState(story, "gate", 4), undefined);
});

test("built-in reactions settle instead of looping", () => {
  const atContact = storyTransform(storyState(story, "gate", 2));
  const afterContact = storyTransform(storyState(story, "gate", 2.5));
  const nearEnd = storyTransform(storyState(story, "gate", 3.9));

  assert.equal(atContact.offsetY, 0);
  assert.ok(afterContact.offsetY < 0);
  assert.ok(Math.abs(nearEnd.offsetY) < 1);
});

test("story clips advance once while ambient clips keep looping", () => {
  const actor = storyState(story, "hero", 1.75);
  const target = storyState(story, "gate", 3.75);

  assert.equal(storyFrameIndex(undefined, 1.75, 4, 4), 3);
  assert.equal(storyFrameIndex(actor, 1.75, 4, 3), 2);
  assert.equal(storyFrameIndex(target, 3.75, 4, 3), 2);

  const hold = [{ ...story[0], reaction: "hold" }];
  const heldTarget = storyState(hold, "gate", 3.75);
  assert.equal(storyFrameIndex(heldTarget, 3.75, 4, 3), 2);
});
