import { access, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

function safeMediaFile(file) {
  return typeof file === "string" && path.basename(file) === file && file !== "manifest.json";
}

function manifestMediaFiles(manifest) {
  const files = [];
  if (manifest?.schema === "ogm.set-showcase-media/1") {
    for (const stop of manifest.stops ?? []) {
      for (const track of [stop.region, stop.sheet]) files.push(...Object.values(track ?? {}));
    }
  } else if (manifest?.schema === "ogm.set-showcase-media/2") {
    for (const track of Object.values(manifest.tracks ?? {})) files.push(...Object.values(track ?? {}));
    for (const stop of manifest.stops ?? []) {
      for (const track of [stop.region, stop.sheet]) files.push(...Object.values(track ?? {}));
    }
    files.push(...(manifest.qa?.timeline ?? []));
  }
  return new Set(files.filter(safeMediaFile));
}

async function existingManifest(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function publishStagedShowcase({ staging, output }) {
  const manifestFile = path.join(output, "manifest.json");
  const stagedManifest = path.join(staging, "manifest.json");
  const previous = await existingManifest(manifestFile);
  const stagedFiles = (await readdir(staging)).filter((file) => file !== "manifest.json");
  const nextFiles = new Set(stagedFiles);
  const ownedFiles = new Set([...stagedFiles, ...manifestMediaFiles(previous)]);
  const backup = await mkdtemp(path.join(output, ".showcase-backup-"));
  const backedUp = [];

  try {
    for (const file of ownedFiles) {
      const target = path.join(output, file);
      if (!await exists(target)) continue;
      await rename(target, path.join(backup, file));
      backedUp.push(file);
    }
    for (const file of stagedFiles) {
      await rename(path.join(staging, file), path.join(output, file));
    }
    if (await exists(manifestFile)) {
      await rename(manifestFile, path.join(backup, "manifest.json"));
      backedUp.push("manifest.json");
    }
    await rename(stagedManifest, manifestFile);
  } catch (error) {
    for (const file of [...nextFiles, "manifest.json"]) {
      await rm(path.join(output, file), { force: true });
    }
    for (const file of backedUp) {
      await rename(path.join(backup, file), path.join(output, file));
    }
    throw error;
  } finally {
    await rm(backup, { recursive: true, force: true });
  }
}
