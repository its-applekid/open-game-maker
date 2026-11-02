#!/usr/bin/env node
import { loadAssetLibrary } from "./assets.mjs";
import { validateShowcase } from "./model.mjs";
import { loadProject, parseArgs } from "./project.mjs";

export async function checkShowcase({ projectRoot, assetsRoot, catalogFile }) {
  const project = await loadProject(projectRoot);
  const issues = validateShowcase(project);
  const library = await loadAssetLibrary({ assetsRoot, catalogFile });

  async function verify(where, spec) {
    try {
      await library.verify(spec);
    } catch (error) {
      issues.push({ code: "asset.unresolved", path: where, detail: error.message });
    }
  }

  await verify("sequence.runner", project.sequence.runner);
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
  }

  return { project, issues };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["project", "assets-root", "catalog"]);
  const { project, issues } = await checkShowcase({
    projectRoot: args.project,
    assetsRoot: args["assets-root"],
    catalogFile: args.catalog,
  });
  for (const stop of project.sequence.stops ?? []) {
    const region = project.regions[stop.region];
    const sheet = project.sheets[stop.sheet];
    console.log(`${stop.id}: ${region.sprites?.length ?? 0} region sprites, ${sheet.sprites?.length ?? 0} sheet sprites`);
  }
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
