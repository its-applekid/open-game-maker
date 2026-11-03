import { prepareRegionFrame } from "./scene.mjs";

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

  return { footprintOverlaps, actorSolidPixelIntersections };
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
    footprintOverlapFrames: frames.filter(({ footprintOverlaps }) => footprintOverlaps.length).length,
    actorSolidPixelIntersectionFrames: frames.filter(
      ({ actorSolidPixelIntersections }) => actorSolidPixelIntersections.length,
    ).length,
  };
}

export function collisionReportLines(report) {
  return [
    ...report.frames.map((frame) =>
      `${frame.stop} frame ${String(frame.index).padStart(3, "0")} @ ${frame.tau.toFixed(6)}s: ` +
      `footprints=${frame.footprintOverlaps.length} ` +
      `actor-solid-pixels=${frame.actorSolidPixelIntersections.length}`
    ),
    `SUMMARY frames=${report.frames.length} ` +
      `footprint-overlap-frames=${report.footprintOverlapFrames} ` +
      `actor-solid-pixel-intersection-frames=${report.actorSolidPixelIntersectionFrames}`,
  ];
}
