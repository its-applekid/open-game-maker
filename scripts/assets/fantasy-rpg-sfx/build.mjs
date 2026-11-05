#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

export const EXPECTED_CATEGORY_IDS = [
  "footstep-grass",
  "footstep-stone",
  "footstep-wood",
  "footstep-cave",
  "attack-sword",
  "attack-heavy-weapon",
  "attack-bow",
  "impact-combat",
  "shield-block",
  "shield-failed-block",
  "roll",
  "spell-fire",
  "spell-ice",
  "spell-lightning",
  "creature-goblin",
  "creature-undead",
  "object-push",
  "object-collision",
  "loot-pickup",
  "ui",
  "quest-cue",
  "ambience-village",
  "ambience-plains",
  "ambience-forest",
  "ambience-cave",
  "ambience-graveyard",
  "ambience-crypt",
  "combat-vocal-low-gritty",
  "combat-vocal-bright-agile",
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isSafeRelative(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function within(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function loadJson(source) {
  return JSON.parse(await readFile(source, "utf8"));
}

export function validateSelection(selection, expectedCategoryIds = EXPECTED_CATEGORY_IDS) {
  invariant(selection?.schema === "ogm.sound-set-selection/1.0", "invalid selection schema");
  invariant(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selection.id || ""), "invalid selection id");
  invariant(typeof selection.title === "string" && selection.title.length > 0, "selection title is required");
  invariant(
    typeof selection.description === "string" && selection.description.length > 0,
    "selection description is required",
  );
  invariant(
    Number.isFinite(selection.preview_gap_seconds) && selection.preview_gap_seconds >= 0,
    "preview_gap_seconds must be non-negative",
  );
  invariant(Array.isArray(selection.categories), "selection categories are required");

  const ids = selection.categories.map(({ id }) => id);
  if (expectedCategoryIds) {
    invariant(
      JSON.stringify(ids) === JSON.stringify(expectedCategoryIds),
      `category coverage mismatch: expected ${expectedCategoryIds.join(", ")}; got ${ids.join(", ")}`,
    );
  }

  const categoryIds = new Set();
  const allSources = new Set();
  for (const category of selection.categories) {
    invariant(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.id || ""),
      `invalid category id: ${category.id}`,
    );
    invariant(!categoryIds.has(category.id), `duplicate category: ${category.id}`);
    categoryIds.add(category.id);
    invariant(typeof category.title === "string" && category.title.length > 0, `${category.id}: title is required`);
    invariant(typeof category.intent === "string" && category.intent.length > 0, `${category.id}: intent is required`);
    invariant(
      Number.isFinite(category.excerpt_seconds) && category.excerpt_seconds > 0,
      `${category.id}: excerpt_seconds must be positive`,
    );
    invariant(
      Array.isArray(category.sources) && category.sources.length >= 3 && category.sources.length <= 6,
      `${category.id}: expected 3-6 sources`,
    );
    for (const source of category.sources) {
      invariant(
        typeof source.pack === "string" && /^(kenney|sonniss)-/.test(source.pack),
        `${category.id}: source must use an installed Kenney or Sonniss pack`,
      );
      invariant(isSafeRelative(source.path), `${category.id}: unsafe source path: ${source.path}`);
      const key = `${source.pack}\0${source.path}`;
      invariant(!allSources.has(key), `${category.id}: duplicate source: ${source.pack}/${source.path}`);
      allSources.add(key);
    }
  }
  return selection;
}

async function fileHash(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return `sha256:${hash.digest("hex")}`;
}

export async function probeAudioWithFfprobe(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "format=duration:stream=codec_name,sample_rate,channels",
    "-of",
    "json",
    file,
  ]);
  const result = JSON.parse(stdout);
  const stream = result.streams?.[0];
  const duration = Number(result.format?.duration);
  invariant(stream && Number.isFinite(duration), `ffprobe found no decodable audio: ${file}`);
  return {
    channels: Number(stream.channels),
    codec: stream.codec_name,
    duration_seconds: Number(duration.toFixed(3)),
    sample_rate: Number(stream.sample_rate),
  };
}

export async function encodePreviewWithFfmpeg({
  excerptSeconds,
  gapSeconds,
  inputs,
  outputPath,
}) {
  const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y"];
  for (const input of inputs) args.push("-i", input);

  const filters = [];
  const sequence = [];
  for (let index = 0; index < inputs.length; index += 1) {
    filters.push(
      `[${index}:a:0]atrim=duration=${excerptSeconds},asetpts=PTS-STARTPTS,` +
        `aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`,
    );
    sequence.push(`[a${index}]`);
    if (index < inputs.length - 1) {
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${gapSeconds}[s${index}]`);
      sequence.push(`[s${index}]`);
    }
  }
  filters.push(
    `${sequence.join("")}concat=n=${sequence.length}:v=0:a=1,` +
      "loudnorm=I=-18:TP=-1.5:LRA=11[out]",
  );
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "160k",
    outputPath,
  );

  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 4 });
  } catch (error) {
    throw new Error(`ffmpeg preview failed for ${path.basename(outputPath)}: ${error.stderr || error.message}`);
  }
}

async function resolveSources({ assetsRoot, probeAudio, selection }) {
  const catalog = await loadJson(path.join(assetsRoot, "catalog.json"));
  invariant(Array.isArray(catalog.packs), "asset catalog has no packs array");
  const packs = new Map(catalog.packs.map((pack) => [pack.id, pack]));
  const resolved = new Map();

  for (const category of selection.categories) {
    const variations = [];
    for (const [index, source] of category.sources.entries()) {
      const pack = packs.get(source.pack);
      invariant(pack, `${category.id}: missing pack in catalog: ${source.pack}`);
      invariant(isSafeRelative(pack.path), `${category.id}: unsafe catalog pack path: ${pack.path}`);
      invariant(typeof pack.license === "string" && pack.license.length > 0, `${source.pack}: missing license`);
      const absolutePath = path.resolve(assetsRoot, pack.path, source.path);
      invariant(within(assetsRoot, absolutePath), `${category.id}: source escapes assets root`);
      let info;
      try {
        info = await stat(absolutePath);
      } catch {
        throw new Error(`${category.id}: missing source: ${source.pack}/${source.path}`);
      }
      invariant(info.isFile(), `${category.id}: source is not a file: ${source.pack}/${source.path}`);
      const audio = await probeAudio(absolutePath);
      variations.push({
        absolutePath,
        audition: { status: "pending-operator" },
        audio,
        bytes: info.size,
        collection_card: pack.card || null,
        id: `${category.id}-${String(index + 1).padStart(2, "0")}`,
        license: pack.license,
        pack_id: pack.id,
        pack_title: pack.title,
        pack_version: String(pack.version),
        rights_uses: pack.rights_uses || [],
        sha256: await fileHash(absolutePath),
        source_path: path.posix.join(pack.path.replaceAll(path.sep, "/"), source.path.replaceAll(path.sep, "/")),
      });
    }
    resolved.set(category.id, variations);
  }
  return resolved;
}

function categoryCard(selection, category, variations, previewInfo, previewAudio) {
  return {
    schema: "ogm.sound-set-card/1.0",
    id: `${selection.id}/${category.id}`,
    set_id: selection.id,
    category_id: category.id,
    title: category.title,
    intent: category.intent,
    variation_count: variations.length,
    preview: {
      path: `previews/${category.id}.mp3`,
      order: variations.map(({ id }) => id),
      excerpt_seconds: category.excerpt_seconds,
      gap_seconds: selection.preview_gap_seconds,
      bytes: previewInfo.size,
      duration_seconds: previewAudio.duration_seconds,
      audition: { status: "pending-operator" },
    },
    variations: variations.map(({ absolutePath: _absolutePath, ...variation }) => variation),
    provenance: {
      selection: {
        by: "curation",
        input: "selection.json plus installed pack taxonomy and filenames",
        tool: "build-fantasy-rpg-sfx@1.0",
      },
      audition: {
        status: "pending-operator",
        note: "This agent workspace cannot accept audio input; listen to the ordered preview before approval.",
      },
    },
  };
}

function manifestFor(selection, cards) {
  return {
    schema: "ogm.sound-set-manifest/1.0",
    id: selection.id,
    title: selection.title,
    description: selection.description,
    source_policy: "installed-owned-kenney-and-sonniss-packs",
    category_count: cards.length,
    variation_count: cards.reduce((total, card) => total + card.variation_count, 0),
    audition: {
      status: "pending-operator",
      completed_categories: [],
      required_categories: cards.map(({ category_id }) => category_id),
    },
    categories: cards.map((card) => ({
      card: `cards/${card.category_id}.card.json`,
      id: card.category_id,
      preview: card.preview.path,
      title: card.title,
      variation_count: card.variation_count,
    })),
  };
}

function readmeFor(manifest, cards) {
  const lines = [
    `# ${manifest.title}`,
    "",
    manifest.description,
    "",
    "Audition status: pending operator review. Each preview plays the listed variations in order, with a short silent gap.",
    "The previews and source audio are licensed host-local material; do not attach them to a public issue or PR.",
    "",
    `Categories: ${manifest.category_count}; variations: ${manifest.variation_count}.`,
    "",
  ];
  for (const card of cards) {
    lines.push(`## ${card.title}`, "", card.intent, "", `Preview: \`${card.preview.path}\``, "");
    for (const variation of card.variations) {
      lines.push(
        `- \`${variation.id}\` — ${variation.pack_id}@${variation.pack_version}: \`${variation.source_path}\` ` +
          `(${variation.license}, ${variation.audio.duration_seconds}s)`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function replaceOutput(stagingDir, outputDir) {
  const backupDir = `${outputDir}.backup-${process.pid}`;
  await rm(backupDir, { force: true, recursive: true });
  let hadOutput = true;
  try {
    await rename(outputDir, backupDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    hadOutput = false;
  }
  try {
    await rename(stagingDir, outputDir);
  } catch (error) {
    if (hadOutput) await rename(backupDir, outputDir);
    throw error;
  }
  if (hadOutput) await rm(backupDir, { force: true, recursive: true });
}

export async function buildSet({
  assetsRoot,
  encodePreview = encodePreviewWithFfmpeg,
  expectedCategoryIds = EXPECTED_CATEGORY_IDS,
  outputDir,
  probeAudio = probeAudioWithFfprobe,
  selection,
}) {
  validateSelection(selection, expectedCategoryIds);
  const resolved = await resolveSources({ assetsRoot, probeAudio, selection });
  const parent = path.dirname(outputDir);
  await mkdir(parent, { recursive: true });
  const stagingDir = await mkdtemp(path.join(parent, `.${path.basename(outputDir)}-staging-`));
  try {
    await mkdir(path.join(stagingDir, "cards"));
    await mkdir(path.join(stagingDir, "previews"));
    const cards = [];
    for (const category of selection.categories) {
      const variations = resolved.get(category.id);
      const previewPath = path.join(stagingDir, "previews", `${category.id}.mp3`);
      await encodePreview({
        excerptSeconds: category.excerpt_seconds,
        gapSeconds: selection.preview_gap_seconds,
        inputs: variations.map(({ absolutePath }) => absolutePath),
        outputPath: previewPath,
      });
      const previewInfo = await stat(previewPath);
      invariant(previewInfo.isFile() && previewInfo.size > 0, `${category.id}: preview is empty`);
      const previewAudio = await probeAudio(previewPath);
      invariant(previewAudio.duration_seconds > 0, `${category.id}: preview has no playable audio`);
      const card = categoryCard(selection, category, variations, previewInfo, previewAudio);
      cards.push(card);
      await writeJson(path.join(stagingDir, "cards", `${category.id}.card.json`), card);
    }
    const manifest = manifestFor(selection, cards);
    await writeJson(path.join(stagingDir, "manifest.json"), manifest);
    await writeFile(path.join(stagingDir, "README.md"), readmeFor(manifest, cards));
    await replaceOutput(stagingDir, outputDir);
    return manifest;
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true });
    throw error;
  }
}

function parseArgs(argv) {
  const options = {
    assetsRoot: path.join(REPO, "assets-local"),
    outputDir: path.join(REPO, "assets-local/sets/fantasy-rpg-sfx"),
    selectionPath: path.join(HERE, "selection.json"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--assets-root") options.assetsRoot = path.resolve(argv[++index]);
    else if (arg === "--output") options.outputDir = path.resolve(argv[++index]);
    else if (arg === "--selection") options.selectionPath = path.resolve(argv[++index]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selection = await loadJson(options.selectionPath);
  const manifest = await buildSet({ ...options, selection });
  console.log(
    `built ${manifest.category_count} categories and ${manifest.variation_count} variations at ${options.outputDir}`,
  );
  console.log("audition status: pending operator review");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
