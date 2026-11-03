import { prepareRegionFrame } from "./scene.mjs";
import { prepareContinuousFrame } from "./continuous-scene.mjs";
import { isContinuousShowcase } from "./continuous.mjs";

function footprintBounds(entity) {
  const [width, depth] = entity.collision.footprint;
  const [offsetX, offsetY] = entity.collision.offset ?? [0, 0];
  const anchorX = entity.at[0] + offsetX;
  const anchorY = entity.at[1] + offsetY;
  return {
    left: anchorX - width / 2,
    right: anchorX + width / 2,
    top: anchorY - depth,
    bottom: anchorY,
  };
}

function boundsOverlap(left, right) {
  return left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top;
}

function alphaIntersection(left, right) {
  const leftX = Math.round(left.left);
  const leftY = Math.round(left.top);
  const rightX = Math.round(right.left);
  const rightY = Math.round(right.top);
  const x0 = Math.max(leftX, rightX);
  const y0 = Math.max(leftY, rightY);
  const x1 = Math.min(leftX + left.frame.width, rightX + right.frame.width);
  const y1 = Math.min(leftY + left.frame.height, rightY + right.frame.height);
  let pixels = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const leftAlpha = left.frame.data[((y - leftY) * left.frame.width + x - leftX) * 4 + 3];
      const rightAlpha = right.frame.data[((y - rightY) * right.frame.width + x - rightX) * 4 + 3];
      if (leftAlpha > 16 && rightAlpha > 16) pixels += 1;
    }
  }
  return pixels;
}

function pairs(values) {
  const result = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      result.push([values[left], values[right]]);
    }
  }
  return result;
}

export function inspectCollisionFrame(entities) {
  const collidable = entities.filter(({ collision }) =>
    collision?.type === "actor" || collision?.type === "solid"
  );
  const footprintOverlaps = [];
  for (const [left, right] of pairs(collidable)) {
    if (boundsOverlap(footprintBounds(left), footprintBounds(right))) {
      footprintOverlaps.push({ ids: [left.id, right.id] });
    }
  }

  const actors = collidable.filter(({ collision }) => collision.type === "actor");
  const solids = collidable.filter(({ collision }) => collision.type === "solid");
  const actorSolidPixelIntersections = [];
  for (const actor of actors) {
    for (const solid of solids) {
      if (actor.depth < solid.depth) continue;
      const pixels = alphaIntersection(actor, solid);
      if (pixels > 0) {
        actorSolidPixelIntersections.push({ ids: [actor.id, solid.id], pixels });
      }
    }
  }

  const runnerIndex = entities.findIndex(({ id }) => id === "runner");
  const runner = entities[runnerIndex];
  const runnerOcclusions = [];
  if (runner) {
    for (const foreground of entities.slice(runnerIndex + 1)) {
      const pixels = alphaIntersection(runner, foreground);
      if (pixels > 0) runnerOcclusions.push({ ids: [runner.id, foreground.id], pixels });
    }
  }

  return { footprintOverlaps, actorSolidPixelIntersections, runnerOcclusions };
}

function openAxisRange(start, end, minimum, maximum) {
  const delta = end - start;
  if (delta === 0) return start > minimum && start < maximum ? [-Infinity, Infinity] : undefined;
  const first = (minimum - start) / delta;
  const second = (maximum - start) / delta;
  return [Math.min(first, second), Math.max(first, second)];
}

function segmentCrossesOpenBounds(from, to, bounds) {
  const x = openAxisRange(from[0], to[0], bounds.left, bounds.right);
  const y = openAxisRange(from[1], to[1], bounds.top, bounds.bottom);
  if (!x || !y) return false;
  return Math.max(0, x[0], y[0]) < Math.min(1, x[1], y[1]);
}

function placementBounds(placement) {
  const starts = footprintBounds(placement);
  if (!placement.walk?.to) return starts;
  const ends = footprintBounds({ ...placement, at: placement.walk.to });
  return {
    left: Math.min(starts.left, ends.left),
    right: Math.max(starts.right, ends.right),
    top: Math.min(starts.top, ends.top),
    bottom: Math.max(starts.bottom, ends.bottom),
  };
}

export function inspectRouteCorridor({ points, runnerFootprint, runnerOffset = [0, 0], placements }) {
  const [runnerWidth, runnerDepth] = runnerFootprint;
  const [runnerOffsetX, runnerOffsetY] = runnerOffset;
  const intersections = [];
  for (const placement of placements) {
    if (!placement.collision?.footprint) continue;
    const bounds = placementBounds(placement);
    const expanded = {
      left: bounds.left - runnerWidth / 2 - runnerOffsetX,
      right: bounds.right + runnerWidth / 2 - runnerOffsetX,
      top: bounds.top - runnerOffsetY,
      bottom: bounds.bottom + runnerDepth - runnerOffsetY,
    };
    for (let segment = 0; segment < points.length - 1; segment += 1) {
      if (segmentCrossesOpenBounds(points[segment], points[segment + 1], expanded)) {
        intersections.push({ entity: placement.id, segment });
        break;
      }
    }
  }
  return intersections;
}

function continuousPlacements(project) {
  return project.sequence.stops.flatMap((stop, index) => {
    const origin = project.sequence.runner.path.points[index];
    return (project.regions[stop.region]?.sprites ?? []).map((sprite) => ({
      ...sprite,
      at: [origin[0] + sprite.at[0], origin[1] + sprite.at[1]],
      ...(sprite.walk?.to ? {
        walk: {
          ...sprite.walk,
          to: [origin[0] + sprite.walk.to[0], origin[1] + sprite.walk.to[1]],
        },
      } : {}),
    }));
  });
}

function reportIssue(code, path, detail) {
  return { code, path, detail };
}

function pairDetails(values) {
  return values.map(({ ids, pixels }) =>
    pixels === undefined ? ids.join("/") : `${ids.join("/")} (${pixels} px)`
  ).join(", ");
}

export async function auditShowcaseCollisions({ project, library, stops }) {
  const fps = project.sequence.fps ?? 24;
  const spriteFps = project.sequence.sprite_fps ?? 12;
  const [width, height] = project.sequence.layout.viewport;
  const frames = [];
  const issues = [];

  if (isContinuousShowcase(project.sequence)) {
    const corridorIntersections = inspectRouteCorridor({
      points: project.sequence.runner.path.points,
      runnerFootprint: project.sequence.runner.collision.footprint,
      runnerOffset: project.sequence.runner.collision.offset,
      placements: continuousPlacements(project),
    });
    for (const intersection of corridorIntersections) {
      issues.push(reportIssue(
        "collision.route_corridor",
        `sequence.runner.path.segments[${intersection.segment}]`,
        intersection.entity,
      ));
    }
    if (issues.length) {
      return {
        frames,
        issues,
        corridorIntersections,
        footprintOverlapFrames: 0,
        actorSolidPixelIntersectionFrames: 0,
        runnerOcclusionFrames: 0,
      };
    }
    const frameCount = Math.round(project.sequence.loop_seconds * fps);
    for (let index = 0; index < frameCount; index += 1) {
      const tau = index / fps;
      const { entities, runner } = await prepareContinuousFrame({
        project,
        library,
        tau,
        width,
        height,
        spriteFps,
      });
      const inspected = inspectCollisionFrame(entities);
      const frame = { stop: runner.stop.id, index, tau, ...inspected };
      frames.push(frame);
      const framePath = `sequence.frames[${index}]`;
      if (inspected.footprintOverlaps.length) {
        issues.push(reportIssue(
          "collision.footprint_overlap",
          framePath,
          pairDetails(inspected.footprintOverlaps),
        ));
      }
      if (inspected.actorSolidPixelIntersections.length) {
        issues.push(reportIssue(
          "collision.actor_solid_pixels",
          framePath,
          pairDetails(inspected.actorSolidPixelIntersections),
        ));
      }
      if (inspected.runnerOcclusions.length) {
        issues.push(reportIssue(
          "collision.runner_occlusion",
          framePath,
          pairDetails(inspected.runnerOcclusions),
        ));
      }
    }
    return {
      frames,
      issues,
      corridorIntersections,
      footprintOverlapFrames: frames.filter(({ footprintOverlaps }) => footprintOverlaps.length).length,
      actorSolidPixelIntersectionFrames: frames.filter(
        ({ actorSolidPixelIntersections }) => actorSolidPixelIntersections.length,
      ).length,
      runnerOcclusionFrames: frames.filter(({ runnerOcclusions }) => runnerOcclusions.length).length,
    };
  }

  for (const stop of stops ?? project.sequence.stops ?? []) {
    const frameCount = Math.round(stop.seconds * fps);
    for (let index = 0; index < frameCount; index += 1) {
      const tau = index / fps;
      const { entities } = await prepareRegionFrame({
        project,
        library,
        stop,
        tau,
        width,
        height,
        spriteFps,
      });
      const inspected = inspectCollisionFrame(entities);
      const frame = { stop: stop.id, index, tau, ...inspected };
      frames.push(frame);
      const framePath = `sequence.stops.${stop.id}.frames[${index}]`;
      if (inspected.footprintOverlaps.length) {
        issues.push(reportIssue(
          "collision.footprint_overlap",
          framePath,
          pairDetails(inspected.footprintOverlaps),
        ));
      }
      if (inspected.actorSolidPixelIntersections.length) {
        issues.push(reportIssue(
          "collision.actor_solid_pixels",
          framePath,
          pairDetails(inspected.actorSolidPixelIntersections),
        ));
      }
    }
  }

  return {
    frames,
    issues,
    corridorIntersections: [],
    footprintOverlapFrames: frames.filter(({ footprintOverlaps }) => footprintOverlaps.length).length,
    actorSolidPixelIntersectionFrames: frames.filter(
      ({ actorSolidPixelIntersections }) => actorSolidPixelIntersections.length,
    ).length,
    runnerOcclusionFrames: 0,
  };
}

export function collisionReportLines(report) {
  return [
    ...report.frames.map((frame) =>
      `${frame.stop} frame ${String(frame.index).padStart(3, "0")} @ ${frame.tau.toFixed(6)}s: ` +
      `footprints=${frame.footprintOverlaps.length} ` +
      `actor-solid-pixels=${frame.actorSolidPixelIntersections.length} ` +
      `runner-occlusions=${frame.runnerOcclusions?.length ?? 0}`
    ),
    `SUMMARY frames=${report.frames.length} ` +
      `corridor-intersections=${report.corridorIntersections?.length ?? 0} ` +
      `footprint-overlap-frames=${report.footprintOverlapFrames} ` +
      `actor-solid-pixel-intersection-frames=${report.actorSolidPixelIntersectionFrames} ` +
      `runner-occlusion-frames=${report.runnerOcclusionFrames ?? 0}`,
  ];
}
