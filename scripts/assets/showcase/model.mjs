const SHOWCASE_SCHEMA = "ogm.set-showcase/1";

function issue(code, path, detail) {
  return { code, path, detail };
}

function unique(values) {
  return [...new Set(values)];
}

function sorted(values) {
  return unique(values).sort((left, right) => left.localeCompare(right));
}

function sameMembers(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

export function packFromRef(ref) {
  const match = /^(?:card:|sheet:)([^/|]+)(?:[/|]|$)/u.exec(ref ?? "");
  return match?.[1];
}

export function designKey(ref) {
  return String(ref ?? "")
    .split(/[/|]/u)
    .at(-1)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/u, "")
    .replace(/[^a-z0-9_-]/gu, "")
    .replace(/^\d+/u, "")
    .replace(/(?:[-_/](?:idle|walk|run|attack|down|left|right|up|n|ne|e|se|s|sw|w|nw|\d+))+$/u, "");
}

function refsFromRegion(region) {
  return [region?.ground?.ref, ...(region?.sprites ?? []).map(({ ref }) => ref)].filter(Boolean);
}

function refsFromSheet(sheet) {
  return (sheet?.sprites ?? []).map(({ ref }) => ref).filter(Boolean);
}

function validateLayout(sequence, issues) {
  const layout = sequence.layout ?? {};
  const [width, height] = layout.viewport ?? [];

  if (!Number.isInteger(width) || width <= 0 || width !== height) {
    issues.push(issue("layout.square", "sequence.layout.viewport", "viewport must be a positive square [width, height]"));
  }

  const validPair =
    (layout.projection === "top-down" && layout.seam === "grid") ||
    (layout.projection === "isometric" && layout.seam === "diamond");
  if (!validPair) {
    issues.push(issue("layout.seam", "sequence.layout", "top-down uses grid seams; isometric uses 45-degree diamond seams"));
  }

  if (!Array.isArray(layout.directions) || layout.directions.length < 4) {
    issues.push(issue("layout.directions", "sequence.layout.directions", "provide the set's full direction rotation"));
  }
}

function validateRunner(sequence, issues) {
  const runner = sequence.runner ?? {};
  if (!runner.ref || runner.action !== "walk") {
    issues.push(issue("runner.walk", "sequence.runner", "the camera-followed hero must use a walk animation"));
  }
  if (!Array.isArray(runner.path?.from) || !Array.isArray(runner.path?.to)) {
    issues.push(issue("runner.path", "sequence.runner.path", "provide from/to coordinates that cross the frame"));
  }
  if (!(runner.speed > 0)) {
    issues.push(issue("runner.speed", "sequence.runner.speed", "provide a positive natural walking speed"));
  }
  if (Array.isArray(runner.path?.from) && Array.isArray(runner.path?.to) && runner.speed > 0) {
    const distance = Math.hypot(
      runner.path.to[0] - runner.path.from[0],
      runner.path.to[1] - runner.path.from[1],
    );
    for (const [index, stop] of (sequence.stops ?? []).entries()) {
      const renderedSpeed = distance / stop.seconds;
      if (!Number.isFinite(renderedSpeed) || Math.abs(renderedSpeed - runner.speed) / runner.speed > 0.1) {
        issues.push(
          issue(
            "runner.cadence",
            `sequence.stops[${index}].seconds`,
            `path renders at ${renderedSpeed.toFixed(1)} px/s, not the declared ${runner.speed} px/s`,
          ),
        );
      }
    }
  }
}

function validateStory(story, region, sequence, stop, stopPath, issues) {
  if (!Array.isArray(story) || story.length === 0) {
    issues.push(issue("story.missing", `${stopPath}.story`, "each region needs at least one story beat"));
    return;
  }

  const ids = new Set([
    "runner",
    String(sequence.runner?.ref ?? "").split("/").at(-1),
    ...(region?.sprites ?? []).map(({ id }) => id),
  ]);

  story.forEach((beat, index) => {
    const path = `${stopPath}.story[${index}]`;
    if (!ids.has(beat.actor)) {
      issues.push(issue("story.actor_missing", `${path}.actor`, `unknown actor ${JSON.stringify(beat.actor)}`));
    }
    if (!ids.has(beat.target)) {
      issues.push(issue("story.target_missing", `${path}.target`, `unknown target ${JSON.stringify(beat.target)}`));
    }
    if (beat.actor === beat.target) {
      issues.push(issue("story.air_action", path, "an action must name a distinct in-scene target"));
    }
    if (!beat.action || !beat.reaction) {
      issues.push(issue("story.reaction", path, "story beats need both an action and the target's reaction"));
    }
    if (
      !Array.isArray(beat.timing) ||
      beat.timing.length !== 2 ||
      beat.timing[0] < 0 ||
      beat.timing[1] <= beat.timing[0] ||
      beat.timing[1] > stop.seconds
    ) {
      issues.push(issue("story.timing", `${path}.timing`, "timing must be an increasing [start, end] pair"));
    }
  });
}

function validateStop(stop, index, project, issues, propUses) {
  const path = `sequence.stops[${index}]`;
  const region = project.regions?.[stop.region];
  const sheet = project.sheets?.[stop.sheet];

  if (!region) {
    issues.push(issue("region.missing", `${path}.region`, `missing ${JSON.stringify(stop.region)}`));
    return;
  }
  if (!sheet) {
    issues.push(issue("sheet.missing", `${path}.sheet`, `missing ${JSON.stringify(stop.sheet)}`));
    return;
  }
  if (!(stop.seconds > 0)) {
    issues.push(issue("stop.duration", `${path}.seconds`, "stop duration must be positive"));
  }
  if (region.ground?.fill !== "cover") {
    issues.push(issue("region.full_bleed", `${stop.region}.ground.fill`, "ground must cover every viewport edge"));
  }

  const regionRefs = refsFromRegion(region);
  const sheetRefs = refsFromSheet(sheet);
  if (!sameMembers(stop.tile_sprites ?? [], regionRefs)) {
    issues.push(issue("sprites.tile_manifest", `${path}.tile_sprites`, "tile_sprites must exactly list the region references"));
  }
  if (!sameMembers(stop.sheet_sprites ?? [], sheetRefs)) {
    issues.push(issue("sprites.sheet_manifest", `${path}.sheet_sprites`, "sheet_sprites must exactly list the sprite-sheet references"));
  }

  const sheetKeys = new Set(sheetRefs.map(designKey));
  for (const ref of regionRefs) {
    if (sheetKeys.has(designKey(ref))) {
      issues.push(issue("sprites.overlap", path, `${ref} appears in both the living region and its sprite sheet`));
    }
  }

  const expectedDirections = project.sequence.layout?.directions ?? [];
  if (!Array.isArray(sheet.sprites) || sheet.sprites.length === 0) {
    issues.push(issue("sheet.empty", `${stop.sheet}.sprites`, "each region needs at least one different sheet sprite"));
  }
  if (
    sheet.grid &&
    (!Number.isInteger(sheet.grid[0]) ||
      !Number.isInteger(sheet.grid[1]) ||
      sheet.grid[0] <= 0 ||
      sheet.grid[1] <= 0 ||
      sheet.grid[0] * sheet.grid[1] < (sheet.sprites?.length ?? 0))
  ) {
    issues.push(issue("sheet.grid", `${stop.sheet}.grid`, "grid must have one positive cell per sprite"));
  }
  for (const [spriteIndex, sprite] of (sheet.sprites ?? []).entries()) {
    if (JSON.stringify(sprite.directions ?? []) !== JSON.stringify(expectedDirections)) {
      issues.push(issue("sheet.directions", `${stop.sheet}.sprites[${spriteIndex}].directions`, "sheet sprites must rotate through every set direction"));
    }
  }

  for (const sprite of region.sprites ?? []) {
    const key = designKey(sprite.ref);
    const stops = propUses.get(key) ?? [];
    stops.push(stop.id);
    propUses.set(key, stops);
  }
  validateStory(stop.story, region, project.sequence, stop, path, issues);
}

export function validateShowcase(project) {
  const issues = [];
  const sequence = project?.sequence ?? {};

  if (sequence.schema !== SHOWCASE_SCHEMA) {
    issues.push(issue("schema.invalid", "sequence.schema", `expected ${SHOWCASE_SCHEMA}`));
  }
  if (!sequence.set || !sequence.style_family) {
    issues.push(issue("identity.missing", "sequence", "set and style_family are required"));
  }

  validateLayout(sequence, issues);
  validateRunner(sequence, issues);

  const propUses = new Map();
  for (const [index, stop] of (sequence.stops ?? []).entries()) {
    validateStop(stop, index, project, issues, propUses);
  }
  if (!Array.isArray(sequence.stops) || sequence.stops.length === 0) {
    issues.push(issue("stops.missing", "sequence.stops", "plan at least one showcase region"));
  }

  for (const [key, stops] of propUses) {
    if (unique(stops).length > 1) {
      issues.push(issue("props.repeated", "sequence.stops", `${key} repeats in ${unique(stops).join(", ")}`));
    }
  }

  const usedPacks = new Set([
    packFromRef(sequence.runner?.ref),
    ...(sequence.stops ?? []).flatMap((stop) => [
      ...(stop.tile_sprites ?? []).map(packFromRef),
      ...(stop.sheet_sprites ?? []).map(packFromRef),
    ]),
  ].filter(Boolean));
  for (const pack of sequence.required_packs ?? []) {
    if (!usedPacks.has(pack)) {
      issues.push(issue("pack.uncovered", "sequence.required_packs", `${pack} is not represented in a region or sheet`));
    }
  }

  return issues;
}
