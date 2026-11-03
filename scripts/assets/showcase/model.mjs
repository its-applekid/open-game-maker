import {
  CONTINUOUS_SHOWCASE_SCHEMA,
  continuousTimeline,
  isContinuousShowcase,
} from "./continuous.mjs";
import { supportedWeatherKinds } from "./weather.mjs";

const SHOWCASE_SCHEMA = "ogm.set-showcase/1";

export { continuousTimeline };

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
  const match = /^(?:card:|sheet:|raw-(?:char|tile|fx):)([^/|]+)(?:[/|]|$)/u.exec(ref ?? "");
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

function validateCollision(spec, path, issues) {
  const collision = spec?.collision;
  if (!collision || !["actor", "solid", "none"].includes(collision.type)) {
    issues.push(issue(
      "collision.type",
      `${path}.collision`,
      "classify every region entity as actor, solid, or none",
    ));
    return;
  }
  if (collision.type === "none") return;
  if (
    !Array.isArray(collision.footprint) ||
    collision.footprint.length !== 2 ||
    collision.footprint.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    issues.push(issue(
      "collision.footprint",
      `${path}.collision.footprint`,
      "actors and solids need a positive [width, depth] world footprint",
    ));
  }
  if (
    collision.offset !== undefined &&
    (!Array.isArray(collision.offset) ||
      collision.offset.length !== 2 ||
      collision.offset.some((value) => !Number.isFinite(value)))
  ) {
    issues.push(issue(
      "collision.offset",
      `${path}.collision.offset`,
      "collision offset must be a finite [x, y] pair",
    ));
  }
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
  validateCollision(runner, "sequence.runner", issues);
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

function finitePair(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function hasRenderedText(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasRenderedText);
  return Object.entries(value).some(([key, nested]) =>
    ["caption", "label", "text", "title"].includes(key) || hasRenderedText(nested)
  );
}

function validateContinuousRunner(sequence, issues) {
  const runner = sequence.runner ?? {};
  if (!runner.ref || runner.action !== "walk") {
    issues.push(issue("runner.walk", "sequence.runner", "the camera-followed hero must use a walk animation"));
  }
  if (!(runner.speed > 0)) {
    issues.push(issue("runner.speed", "sequence.runner.speed", "provide one positive projected-pixel walking speed"));
  }
  validateCollision(runner, "sequence.runner", issues);

  const stops = sequence.stops ?? [];
  const stopIds = stops.map(({ id }) => id);
  if (
    stopIds.some((id) => !/^[a-z0-9][a-z0-9-]*$/u.test(id ?? "")) ||
    new Set(stopIds).size !== stopIds.length
  ) {
    issues.push(issue("stops.ids", "sequence.stops", "stop ids must be unique lowercase filename-safe values"));
  }
  const points = runner.path?.points;
  if (!Array.isArray(points) || points.length !== stops.length + 1 || points.some((point) => !finitePair(point))) {
    issues.push(issue(
      "runner.path",
      "sequence.runner.path.points",
      "provide one finite point per stop plus the closing return point",
    ));
    return;
  }
  if (JSON.stringify(points[0]) !== JSON.stringify(points.at(-1))) {
    issues.push(issue("runner.loop", "sequence.runner.path.points", "the continuous route must end exactly where it starts"));
  }
  if (!(sequence.loop_seconds > 0) || sequence.loop_seconds > 30) {
    issues.push(issue("runner.duration", "sequence.loop_seconds", "the continuous loop must be longer than 0 and at most 30 seconds"));
  }
  const fps = sequence.fps ?? 24;
  if (!Number.isInteger(fps) || fps <= 0) {
    issues.push(issue("sequence.fps", "sequence.fps", "fps must be a positive integer"));
  }

  const starts = stops.map(({ start_time }) => start_time);
  if (
    starts[0] !== 0 ||
    starts.some((start) => !Number.isFinite(start) || start < 0 || start >= sequence.loop_seconds) ||
    starts.some((start, index) => index > 0 && start <= starts[index - 1])
  ) {
    issues.push(issue("stops.start_time", "sequence.stops", "start_time values must begin at 0 and increase inside the loop"));
  }

  if (runner.speed > 0 && sequence.loop_seconds > 0 && starts.every(Number.isFinite)) {
    for (const [index, interval] of continuousTimeline(sequence).intervals.entries()) {
      if (!(interval.seconds >= 1 / fps) || !Number.isFinite(interval.speed) || interval.deviation > 0.02 + Number.EPSILON) {
        issues.push(issue(
          "runner.cadence",
          `sequence.stops[${index}].start_time`,
          `interval renders at ${Number.isFinite(interval.speed) ? interval.speed.toFixed(3) : "invalid"} px/s, more than 2% from ${runner.speed} px/s`,
        ));
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
      beat.timing.length !== 3 ||
      beat.timing[0] < 0 ||
      beat.timing[1] <= beat.timing[0] ||
      beat.timing[2] <= beat.timing[1] ||
      beat.timing[2] > stop.seconds
    ) {
      issues.push(
        issue(
          "story.timing",
          `${path}.timing`,
          "timing must be an increasing [start, contact, end] triple inside the stop",
        ),
      );
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

  const entityIds = (region.sprites ?? []).map(({ id }) => id);
  if (entityIds.some((id) => !id) || new Set(entityIds).size !== entityIds.length) {
    issues.push(
      issue(
        "region.entity_ids",
        `${stop.region}.sprites`,
        "every placed sprite needs a unique stable id",
      ),
    );
  }

  const designUses = new Map();
  for (const [spriteIndex, sprite] of (region.sprites ?? []).entries()) {
    validateCollision(sprite, `${stop.region}.sprites[${spriteIndex}]`, issues);
    const key = designKey(sprite.ref);
    const previous = designUses.get(key);
    if (previous !== undefined) {
      issues.push(issue(
        "props.duplicated",
        `${stop.region}.sprites[${spriteIndex}].ref`,
        `${sprite.ref} duplicates the design at sprites[${previous}]`,
      ));
    } else {
      designUses.set(key, spriteIndex);
    }
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

function validateContinuousStop(stop, index, project, issues, state, seconds) {
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

  if (region.ground?.fill !== "area" || !finitePair(region.ground?.size) || region.ground.size.some((value) => value <= 0)) {
    issues.push(issue("region.area", `${stop.region}.ground`, "continuous regions need a positive area size and fill=area"));
  }
  if (hasRenderedText(region) || hasRenderedText(sheet)) {
    issues.push(issue("media.text_overlay", path, "rendered region and sheet data cannot contain text overlay fields"));
  }
  if (
    stop.weather !== undefined &&
    (!supportedWeatherKinds.has(stop.weather.kind) || !Number.isInteger(stop.weather.count) || stop.weather.count <= 0)
  ) {
    issues.push(issue("weather.invalid", `${path}.weather`, "weather needs a supported kind and positive integer count"));
  }

  const regionRefs = refsFromRegion(region);
  const sheetRefs = refsFromSheet(sheet);
  if (!sameMembers(stop.tile_sprites ?? [], regionRefs)) {
    issues.push(issue("sprites.tile_manifest", `${path}.tile_sprites`, "tile_sprites must exactly list the region references"));
  }
  if (!sameMembers(stop.sheet_sprites ?? [], sheetRefs)) {
    issues.push(issue("sprites.sheet_manifest", `${path}.sheet_sprites`, "sheet_sprites must exactly list the sprite-sheet references"));
  }

  for (const [spriteIndex, sprite] of (region.sprites ?? []).entries()) {
    validateCollision(sprite, `${stop.region}.sprites[${spriteIndex}]`, issues);
    if (!sprite.id || state.entityIds.has(sprite.id)) {
      issues.push(issue("region.entity_ids", `${stop.region}.sprites[${spriteIndex}].id`, "continuous world entity ids must be globally unique"));
    } else {
      state.entityIds.add(sprite.id);
    }
    const key = designKey(sprite.ref);
    if (state.propUses.has(key)) {
      issues.push(issue("props.repeated", path, `${sprite.ref} repeats the world design used by ${state.propUses.get(key)}`));
    } else {
      state.propUses.set(key, stop.id);
    }
  }

  if (!Array.isArray(sheet.sprites) || sheet.sprites.length !== 24) {
    issues.push(issue("sheet.count", `${stop.sheet}.sprites`, "continuous showcase sheets need exactly 24 sprites"));
  }
  const sheetKeys = sheetRefs.map(designKey);
  if (new Set(sheetKeys).size !== sheetKeys.length) {
    issues.push(issue("sheet.duplicated", `${stop.sheet}.sprites`, "all 24 sheet sprites must have distinct source designs"));
  }
  if (
    !Array.isArray(sheet.grid) ||
    !Number.isInteger(sheet.grid[0]) ||
    !Number.isInteger(sheet.grid[1]) ||
    sheet.grid[0] <= 0 ||
    sheet.grid[1] <= 0 ||
    sheet.grid[0] * sheet.grid[1] < 24
  ) {
    issues.push(issue("sheet.grid", `${stop.sheet}.grid`, "grid must contain at least 24 positive cells"));
  }
  const regionKeys = new Set(regionRefs.map(designKey));
  for (const ref of sheetRefs) {
    if (regionKeys.has(designKey(ref))) {
      issues.push(issue("sprites.overlap", path, `${ref} appears in both the living world and its sprite sheet`));
    }
  }
  const expectedDirections = project.sequence.layout?.directions ?? [];
  for (const [spriteIndex, sprite] of (sheet.sprites ?? []).entries()) {
    if (JSON.stringify(sprite.directions ?? []) !== JSON.stringify(expectedDirections)) {
      issues.push(issue("sheet.directions", `${stop.sheet}.sprites[${spriteIndex}].directions`, "sheet sprites must rotate through every set direction"));
    }
  }
  validateStory(stop.story, region, project.sequence, { ...stop, seconds }, path, issues);
}

export function validateShowcase(project) {
  const issues = [];
  const sequence = project?.sequence ?? {};

  if (![SHOWCASE_SCHEMA, CONTINUOUS_SHOWCASE_SCHEMA].includes(sequence.schema)) {
    issues.push(issue("schema.invalid", "sequence.schema", `expected ${SHOWCASE_SCHEMA} or ${CONTINUOUS_SHOWCASE_SCHEMA}`));
  }
  if (!sequence.set || !sequence.style_family) {
    issues.push(issue("identity.missing", "sequence", "set and style_family are required"));
  }

  validateLayout(sequence, issues);
  if (isContinuousShowcase(sequence)) validateContinuousRunner(sequence, issues);
  else validateRunner(sequence, issues);

  const propUses = new Map();
  if (isContinuousShowcase(sequence)) {
    if (sequence.world?.ground?.fill !== "cover" || !sequence.world.ground.ref) {
      issues.push(issue("world.ground", "sequence.world.ground", "continuous worlds need a full-cover base ground"));
    }
    if (hasRenderedText(sequence.world)) {
      issues.push(issue("media.text_overlay", "sequence.world", "rendered world data cannot contain text overlay fields"));
    }
    const timeline = continuousTimeline(sequence);
    const state = {
      entityIds: new Set([
        "runner",
        String(sequence.runner?.ref ?? "").split("/").at(-1),
      ]),
      propUses,
    };
    for (const [index, stop] of (sequence.stops ?? []).entries()) {
      validateContinuousStop(stop, index, project, issues, state, timeline.intervals[index]?.seconds);
    }
  } else {
    for (const [index, stop] of (sequence.stops ?? []).entries()) {
      validateStop(stop, index, project, issues, propUses);
    }
  }
  if (!Array.isArray(sequence.stops) || sequence.stops.length === 0) {
    issues.push(issue("stops.missing", "sequence.stops", "plan at least one showcase region"));
  }

  if (!isContinuousShowcase(sequence)) {
    for (const [key, stops] of propUses) {
      if (unique(stops).length > 1) {
        issues.push(issue("props.repeated", "sequence.stops", `${key} repeats in ${unique(stops).join(", ")}`));
      }
    }
  }

  const usedPacks = new Set([
    packFromRef(sequence.runner?.ref),
    packFromRef(sequence.world?.ground?.ref),
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
