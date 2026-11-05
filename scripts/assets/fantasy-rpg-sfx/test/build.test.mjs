import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXPECTED_CATEGORY_IDS,
  buildSet,
  loadJson,
  probeAudioWithFfprobe,
  validateSelection,
} from "../build.mjs";

const created = [];
const ffmpegAvailable = ["ffmpeg", "ffprobe"].every(
  (command) => spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0,
);

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(created.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function scratch() {
  const base = process.env.TMPDIR || tmpdir();
  const dir = await mkdtemp(path.join(base, "fantasy-rpg-sfx-test-"));
  created.push(dir);
  return dir;
}

function minimalSelection(paths = ["one.wav", "two.wav", "three.wav"]) {
  return {
    schema: "ogm.sound-set-selection/1.0",
    id: "test-set",
    title: "Test set",
    description: "Synthetic fixture.",
    preview_gap_seconds: 0.25,
    categories: [
      {
        id: "test-cue",
        title: "Test cue",
        intent: "Exercise the set builder.",
        excerpt_seconds: 2,
        sources: paths.map((sourcePath) => ({ pack: "kenney-test", path: sourcePath })),
      },
    ],
  };
}

function wav(frequency = 440) {
  const sampleRate = 8_000;
  const samples = 800;
  const dataBytes = samples * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples; index += 1) {
    bytes.writeInt16LE(
      Math.round(Math.sin((index / sampleRate) * Math.PI * frequency * 2) * 8_000),
      44 + index * 2,
    );
  }
  return bytes;
}

async function syntheticAssets(root) {
  const extracted = path.join(root, "packs/kenney-test/1/extracted");
  await mkdir(extracted, { recursive: true });
  for (const name of ["one.wav", "two.wav", "three.wav"]) {
    await writeFile(path.join(extracted, name), `audio:${name}`);
  }
  await writeFile(
    path.join(root, "catalog.json"),
    `${JSON.stringify({
      packs: [
        {
          id: "kenney-test",
          title: "Kenney test pack",
          version: "1",
          license: "CC0-1.0",
          path: "packs/kenney-test/1/extracted",
          card: "packs/kenney-test/collection.card.json",
          rights_uses: ["in-game", "edit-audio"],
        },
      ],
    })}\n`,
  );
}

describe("selection contract", () => {
  it("covers every requested cue with three to six unique installed-pack sources", async () => {
    const selection = await loadJson(new URL("../selection.json", import.meta.url));

    expect(validateSelection(selection)).toEqual(selection);
    expect(selection.categories.map(({ id }) => id)).toEqual(EXPECTED_CATEGORY_IDS);
    expect(selection.categories.every(({ sources }) => sources.length >= 3 && sources.length <= 6)).toBe(
      true,
    );
  });

  it("rejects sources outside the installed packs and unsafe source paths", () => {
    const absolute = minimalSelection(["/packs/one.wav", "two.wav", "three.wav"]);
    expect(() => validateSelection(absolute, ["test-cue"])).toThrow(/unsafe source path/);

    const traversal = minimalSelection(["audio/../../one.wav", "two.wav", "three.wav"]);
    expect(() => validateSelection(traversal, ["test-cue"])).toThrow(/unsafe source path/);

    const unowned = minimalSelection(["one.wav", "two.wav", "three.wav"]);
    unowned.categories[0].sources[0].pack = "itch-unknown-pack";
    expect(() => validateSelection(unowned, ["test-cue"])).toThrow(
      /installed Kenney or Sonniss pack/,
    );
  });

  it("rejects duplicate files and incomplete variation sets", () => {
    const duplicate = minimalSelection(["one.wav", "one.wav", "two.wav"]);
    expect(() => validateSelection(duplicate, ["test-cue"])).toThrow(/duplicate source/);

    const tooSmall = minimalSelection(["one.wav", "two.wav"]);
    expect(() => validateSelection(tooSmall, ["test-cue"])).toThrow(/3-6 sources/);

    const missingDescription = minimalSelection();
    delete missingDescription.description;
    expect(() => validateSelection(missingDescription, ["test-cue"])).toThrow(/description is required/);
  });
});

describe("set build", () => {
  it("writes cards, a manifest, a browsable list and an ordered preview", async () => {
    const root = await scratch();
    const assetsRoot = path.join(root, "assets-local");
    const outputDir = path.join(root, "set");
    await syntheticAssets(assetsRoot);

    const previewCalls = [];
    await buildSet({
      assetsRoot,
      outputDir,
      selection: minimalSelection(),
      expectedCategoryIds: ["test-cue"],
      probeAudio: async () => ({ channels: 2, codec: "pcm_s16le", duration_seconds: 1.25, sample_rate: 48_000 }),
      encodePreview: async (request) => {
        previewCalls.push(request);
        await writeFile(request.outputPath, "preview");
      },
    });

    const manifest = JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8"));
    const card = JSON.parse(await readFile(path.join(outputDir, "cards/test-cue.card.json"), "utf8"));
    const readme = await readFile(path.join(outputDir, "README.md"), "utf8");

    expect(manifest.audition.status).toBe("pending-operator");
    expect(manifest.categories).toEqual([
      expect.objectContaining({ id: "test-cue", preview: "previews/test-cue.mp3", variation_count: 3 }),
    ]);
    expect(card.variations).toHaveLength(3);
    expect(card.variations[0]).toEqual(
      expect.objectContaining({
        audition: { status: "pending-operator" },
        license: "CC0-1.0",
        pack_id: "kenney-test",
        pack_version: "1",
        sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        source_path: "packs/kenney-test/1/extracted/one.wav",
      }),
    );
    expect(readme).toContain("previews/test-cue.mp3");
    expect(readme).toContain("Audition status: pending operator review");
    expect(previewCalls).toEqual([
      expect.objectContaining({ excerptSeconds: 2, gapSeconds: 0.25, inputs: expect.any(Array) }),
    ]);
  });

  it.skipIf(!ffmpegAvailable)(
    "encodes and probes an ordered preview with ffmpeg and ffprobe (requires ffmpeg and ffprobe)",
    async () => {
      const root = await scratch();
      const assetsRoot = path.join(root, "assets-local");
      const outputDir = path.join(root, "set");
      await syntheticAssets(assetsRoot);

      const extracted = path.join(assetsRoot, "packs/kenney-test/1/extracted");
      await Promise.all(
        [220, 330, 440].map((frequency, index) =>
          writeFile(path.join(extracted, ["one.wav", "two.wav", "three.wav"][index]), wav(frequency)),
        ),
      );

      await buildSet({
        assetsRoot,
        outputDir,
        selection: minimalSelection(),
        expectedCategoryIds: ["test-cue"],
      });

      const preview = await probeAudioWithFfprobe(path.join(outputDir, "previews/test-cue.mp3"));
      expect(preview).toMatchObject({ channels: 2, codec: "mp3", sample_rate: 48_000 });
      expect(preview.duration_seconds).toBeGreaterThan(0);
    },
  );

  it("preflights every source and preserves an existing output on failure", async () => {
    const root = await scratch();
    const assetsRoot = path.join(root, "assets-local");
    const outputDir = path.join(root, "set");
    await syntheticAssets(assetsRoot);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "sentinel.txt"), "keep");

    const missing = minimalSelection(["one.wav", "two.wav", "missing.wav"]);
    await expect(
      buildSet({
        assetsRoot,
        outputDir,
        selection: missing,
        expectedCategoryIds: ["test-cue"],
        probeAudio: async () => ({
          channels: 2,
          codec: "pcm_s16le",
          duration_seconds: 1,
          sample_rate: 48_000,
        }),
      }),
    ).rejects.toThrow(/missing source/);
    expect(await readFile(path.join(outputDir, "sentinel.txt"), "utf8")).toBe("keep");
  });
});
