import { spriteFrame } from "./canvas.mjs";
import { continuousRunnerPosition } from "./continuous.mjs";
import {
  builtInReactions,
  storyFrameIndex,
  storyState,
  storyTransform,
} from "./story.mjs";

function lerp(left, right, amount) {
  return left + (right - left) * amount;
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

function localPosition(sprite, tau) {
  if (!sprite.walk) return sprite.at;
  const period = sprite.walk.seconds;
  const phase = ((tau + (sprite.walk.offset ?? 0)) % (2 * period)) / period;
  const amount = phase <= 1 ? phase : 2 - phase;
  return [
    lerp(sprite.at[0], sprite.walk.to[0], amount),
    lerp(sprite.at[1], sprite.walk.to[1], amount),
  ];
}

function storySpec(base, state, at, positions, directions) {
  if (!state) return base;
  const otherId = state.role === "actor" ? state.beat.target : state.beat.actor;
  const other = positions.get(otherId);
  const dir = other
    ? directionFor(directions, other[0] - at[0], other[1] - at[1])
    : base.dir;
  if (state.role === "actor") return { ...base, action: state.beat.action, dir };
  if (!builtInReactions.has(state.beat.reaction)) return { ...base, action: state.beat.reaction, dir };
  return { ...base, dir };
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
  const renderSpec = storySpec(spec, state, at, positions, project.sequence.layout.directions);
  const resolved = await library.resolve(renderSpec);
  const frameIndex = storyFrameIndex(state, tau, spec.fps ?? spriteFps, resolved.n);
  const scale = spec.scale ?? 1;
  const frame = await spriteFrame(library, renderSpec, frameIndex, scale, resolved);
  const transform = storyTransform(state);
  return {
    id,
    at,
    collision: spec.collision,
    frame,
    left: at[0] + cameraX - frame.frameWidth / 2 + frame.offsetX,
    top: at[1] + cameraY - frame.frameHeight + frame.offsetY + transform.offsetY * scale,
    depth: at[1] + (spec.z ?? depthOffset),
  };
}

export async function prepareContinuousFrame({ project, library, tau, width, height, spriteFps }) {
  const runner = continuousRunnerPosition(project.sequence, tau);
  const [runnerX, runnerY] = runner.position;
  const cameraX = width / 2 - runnerX;
  const cameraY = height / 2 - runnerY;
  const positions = new Map();
  const specs = [];

  for (const [index, stop] of project.sequence.stops.entries()) {
    const origin = project.sequence.runner.path.points[index];
    const region = project.regions[stop.region];
    for (const sprite of region.sprites ?? []) {
      const local = localPosition(sprite, tau);
      const at = [origin[0] + local[0], origin[1] + local[1]];
      positions.set(sprite.id, at);
      specs.push({ stop, sprite, at, active: index === runner.index });
    }
  }
  const runnerId = String(project.sequence.runner.ref).split("/").at(-1);
  positions.set("runner", runner.position);
  positions.set(runnerId, runner.position);

  const visible = specs.filter(({ at }) =>
    at[0] + cameraX >= -512 && at[0] + cameraX <= width + 512 &&
    at[1] + cameraY >= -512 && at[1] + cameraY <= height + 512
  );
  const entities = await Promise.all(visible.map(({ stop, sprite, at, active }) =>
    entityFrame({
      id: sprite.id,
      spec: sprite,
      state: active ? storyState(stop.story, sprite.id, runner.localTime) : undefined,
      at,
      positions,
      project,
      library,
      tau: active ? runner.localTime : tau,
      spriteFps,
      cameraX,
      cameraY,
    })
  ));

  const runnerState =
    storyState(runner.stop.story, "runner", runner.localTime) ??
    storyState(runner.stop.story, runnerId, runner.localTime);
  entities.push(await entityFrame({
    id: "runner",
    spec: {
      ...project.sequence.runner,
      dir: directionFor(
        project.sequence.layout.directions,
        runner.to[0] - runner.from[0],
        runner.to[1] - runner.from[1],
      ),
    },
    state: runnerState,
    at: runner.position,
    positions,
    project,
    library,
    tau: runner.localTime,
    spriteFps,
    cameraX,
    cameraY,
    depthOffset: 0.5,
  }));
  entities.sort((left, right) => left.depth - right.depth);
  return { cameraX, cameraY, entities, runner };
}
