#!/usr/bin/env node
import { loadAssetLibrary } from "./assets.mjs";
import { validateShowcase } from "./model.mjs";
import { loadProject, parseArgs } from "./project.mjs";
import { builtInReactions } from "./story.mjs";
import { auditShowcaseCollisions, collisionReportLines } from "./collision.mjs";

export async function verifyProjectAssets(project, library) {
  const issues = [];
  async function verify(where, spec) {
    try {
      await library.verify(spec);
    } catch (error) {
      issues.push({ code: "asset.unresolved", path: where, detail: error.message });
    }
  }

  const directions = project.sequence.layout?.directions ?? [];
  for (const direction of directions) {
    await verify(`sequence.runner.${direction}`, {
      ...project.sequence.runner,
      dir: direction,
    });
  }
  for (const stop of project.sequence.stops ?? []) {
    const region = project.regions[stop.region];
    const sheet = project.sheets[stop.sheet];
    if (!region || !sheet) continue;
    await verify(`${stop.region}.ground`, region.ground);
    for (const [index, sprite] of (region.sprites ?? []).entries()) {
      await verify(`${stop.region}.sprites[${index}]`, sprite);
    }
    for (const [index, sprite] of (sheet.sprites ?? []).entries()) {
      for (const action of sprite.actions ?? [sprite.action]) {
        for (const direction of sprite.directions ?? []) {
          await verify(`${stop.sheet}.sprites[${index}]`, {
            ...sprite,
            action,
            dir: direction,
          });
        }
      }
    }
    const runnerIds = new Set([
      "runner",
      String(project.sequence.runner?.ref ?? "").split("/").at(-1),
    ]);
    const spritesById = new Map((region.sprites ?? []).map((sprite) => [sprite.id, sprite]));
    for (const [index, beat] of (stop.story ?? []).entries()) {
      const actor = runnerIds.has(beat.actor)
        ? project.sequence.runner
        : spritesById.get(beat.actor);
      const target = runnerIds.has(beat.target)
        ? project.sequence.runner
        : spritesById.get(beat.target);
      if (actor) {
        for (const direction of directions) {
          await verify(`sequence.stops.${stop.id}.story[${index}].action.${direction}`, {
            ...actor,
            action: beat.action,
            dir: direction,
          });
        }
      }
      if (target && !builtInReactions.has(beat.reaction)) {
        for (const direction of directions) {
          await verify(`sequence.stops.${stop.id}.story[${index}].reaction.${direction}`, {
            ...target,
            action: beat.reaction,
            dir: direction,
          });
        }
      }
    }
  }

  return issues;
}

export async function checkShowcase({ projectRoot, assetsRoot, catalogFile }) {
  const project = await loadProject(projectRoot);
  const issues = validateShowcase(project);
  const library = await loadAssetLibrary({ assetsRoot, catalogFile });
  issues.push(...await verifyProjectAssets(project, library));
  let collisionReport = {
    frames: [],
    issues: [],
    footprintOverlapFrames: 0,
    actorSolidPixelIntersectionFrames: 0,
  };
  if (issues.length === 0) {
    collisionReport = await auditShowcaseCollisions({ project, library });
    issues.push(...collisionReport.issues);
  }

  return { project, issues, collisionReport };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["project", "assets-root", "catalog"]);
  const { project, issues, collisionReport } = await checkShowcase({
    projectRoot: args.project,
    assetsRoot: args["assets-root"],
    catalogFile: args.catalog,
  });
  for (const stop of project.sequence.stops ?? []) {
    const region = project.regions[stop.region];
    const sheet = project.sheets[stop.sheet];
    console.log(`${stop.id}: ${region.sprites?.length ?? 0} region sprites, ${sheet.sprites?.length ?? 0} sheet sprites`);
  }
  for (const line of collisionReportLines(collisionReport)) console.log(line);
  if (issues.length) {
    for (const { code, path, detail } of issues) console.error(`${code} ${path}: ${detail}`);
    process.exitCode = 1;
  } else {
    console.log("showcase check passed");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
