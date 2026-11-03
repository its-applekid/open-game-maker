import { spriteFrame } from "./canvas.mjs";
import {
  builtInReactions,
  storyFrameIndex,
  storyState,
  storyTransform,
} from "./story.mjs";

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}

export function runnerPosition(sequence, tau, seconds) {
  const amount = Math.min(1, tau / seconds);
  const { from, to } = sequence.runner.path;
  return [lerp(from[0], to[0], amount), lerp(from[1], to[1], amount)];
}

function directionFor(names, dx, dy) {
  if (names.includes("SE")) {
    const octants = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    return octants[Math.round(angle / (Math.PI / 4)) % octants.length];
  }
  const wanted = Math.abs(dx) > Math.abs(dy)
    ? dx >= 0 ? ["right", "E"] : ["left", "W"]
    : dy >= 0 ? ["down", "S"] : ["up", "N"];
  return wanted.find((name) => names.includes(name)) ?? names[0];
}

function facing(sequence) {
  const { from, to } = sequence.runner.path;
  return directionFor(
    sequence.layout.directions,
    to[0] - from[0],
    to[1] - from[1],
  );
}

function storySpec(base, state, at, positions, directions) {
  if (!state) return base;
  const otherId = state.role === "actor" ? state.beat.target : state.beat.actor;
  const other = positions.get(otherId);
  const dir = other
    ? directionFor(directions, other[0] - at[0], other[1] - at[1])
    : base.dir;
  if (state.role === "actor") return { ...base, action: state.beat.action, dir };
  if (!builtInReactions.has(state.beat.reaction)) {
    return { ...base, action: state.beat.reaction, dir };
  }
  return { ...base, dir };
}

function movingPosition(sprite, tau) {
  if (!sprite.walk) return sprite.at;
  const period = sprite.walk.seconds;
  const phase = ((tau + (sprite.walk.offset ?? 0)) % (2 * period)) / period;
  const amount = phase <= 1 ? phase : 2 - phase;
  return [
    lerp(sprite.at[0], sprite.walk.to[0], amount),
    lerp(sprite.at[1], sprite.walk.to[1], amount),
  ];
}

async function entityFrame({
  id,
  spec,
  state,
  at,
  positions,
  project,
  library,
  tau,
  spriteFps,
  cameraX,
  cameraY,
  depthOffset = 0,
}) {
  const renderSpec = storySpec(
    spec,
    state,
    at,
    positions,
    project.sequence.layout.directions,
  );
  const resolved = await library.resolve(renderSpec);
  const frameIndex = storyFrameIndex(
    state,
    tau,
    spec.fps ?? spriteFps,
    resolved.n,
  );
  const scale = spec.scale ?? 1;
  const frame = await spriteFrame(library, renderSpec, frameIndex, scale, resolved);
  const transform = storyTransform(state);
  return {
    id,
    at,
    collision: spec.collision,
    frame,
    left: at[0] + cameraX - frame.frameWidth / 2 + frame.offsetX,
    top:
      at[1] +
      cameraY -
      frame.frameHeight +
      frame.offsetY +
      transform.offsetY * scale,
    depth: at[1] + (spec.z ?? depthOffset),
  };
}

export async function prepareRegionFrame({
  project,
  library,
  stop,
  tau,
  width,
  height,
  spriteFps,
}) {
  const region = project.regions[stop.region];
  const [runnerX, runnerY] = runnerPosition(project.sequence, tau, stop.seconds);
  const cameraX = width / 2 - runnerX;
  const cameraY = height / 2 - runnerY;
  const positions = new Map(
    (region.sprites ?? []).map((sprite) => [sprite.id, movingPosition(sprite, tau)]),
  );
  const runnerId = String(project.sequence.runner.ref).split("/").at(-1);
  positions.set("runner", [runnerX, runnerY]);
  positions.set(runnerId, [runnerX, runnerY]);

  const entities = await Promise.all((region.sprites ?? []).map((sprite) =>
    entityFrame({
      id: sprite.id,
      spec: sprite,
      state: storyState(stop.story, sprite.id, tau),
      at: positions.get(sprite.id),
      positions,
      project,
      library,
      tau,
      spriteFps,
      cameraX,
      cameraY,
    })
  ));

  const runnerState =
    storyState(stop.story, "runner", tau) ??
    storyState(stop.story, runnerId, tau);
  entities.push(await entityFrame({
    id: "runner",
    spec: { ...project.sequence.runner, dir: facing(project.sequence) },
    state: runnerState,
    at: [runnerX, runnerY],
    positions,
    project,
    library,
    tau,
    spriteFps,
    cameraX,
    cameraY,
    depthOffset: 0.5,
  }));
  entities.sort((left, right) => left.depth - right.depth);

  return { cameraX, cameraY, entities };
}
