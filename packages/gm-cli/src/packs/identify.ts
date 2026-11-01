import { createHash } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { extname, join, posix as pathPosix, relative, sep } from 'node:path';

import { detectVendor, type Vendor } from './vendor.js';

export type Kind = 'model' | 'anim' | 'sprite' | 'texture' | 'vfx' | 'audio' | 'ui' | 'inspiration';
export type Item = { path: string; kind: Kind; subkind?: string; companions: string[]; role: 'primary' };
export type IdentifyResult = { vendor: Vendor; license: string | null; items: Item[]; dropped: string[]; hashManifest: string };

const EXECUTABLE = new Set(['exe', 'msi', 'dll', 'so', 'dylib', 'sh', 'bat', 'cmd', 'ps1', 'appimage', 'jar', 'apk', 'deb', 'rpm', 'dmg', 'app', 'com', 'scr', 'vbs']);
const MODEL = new Set(['glb', 'gltf', 'fbx', 'obj', 'blend', 'dae', '3ds', 'stl', 'ply', 'usd', 'usdz', 'vox']);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'tga', 'webp', 'psd', 'bmp', 'gif', 'tif', 'tiff', 'exr', 'hdr', 'ktx2', 'dds', 'svg']);
const AUDIO = new Set(['wav', 'ogg', 'mp3', 'flac', 'opus', 'm4a', 'aif', 'aiff']);
const FONT = new Set(['ttf', 'otf', 'woff', 'woff2', 'fnt']);
const MAP = new Set(['fcw', 'fct']);

function relativePosix(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}

async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    const file = join(entry.parentPath, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`links are not allowed in extracted content: ${relativePosix(root, file)}`);
    if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

function classify(path: string): Pick<Item, 'kind' | 'subkind'> | null {
  const extension = extname(path).slice(1).toLowerCase();
  if (MODEL.has(extension)) return { kind: 'model' };
  if (AUDIO.has(extension)) return { kind: 'audio' };
  if (FONT.has(extension)) return { kind: 'ui', subkind: 'font' };
  if (MAP.has(extension)) return { kind: 'inspiration', subkind: 'map' };
  if (IMAGE.has(extension)) {
    if (/(^|\/)textures?(\/|$)/i.test(path)) return { kind: 'texture', subkind: 'material' };
    return { kind: 'sprite', subkind: 'prop' };
  }
  if (extension === 'anim') return { kind: 'anim', subkind: 'humanoid' };
  return null;
}

function modelCompanions(model: string, images: string[]): string[] {
  const modelDirectory = pathPosix.dirname(model);
  const modelStem = pathPosix.basename(model, pathPosix.extname(model)).toLowerCase();
  const textureDirectories = [
    pathPosix.join(modelDirectory, 'textures').toLowerCase(),
    pathPosix.join(pathPosix.dirname(modelDirectory), 'textures').toLowerCase(),
  ];
  return images.filter((image) => {
    const lower = image.toLowerCase();
    const imageStem = pathPosix.basename(lower, pathPosix.extname(lower));
    return imageStem === modelStem || textureDirectories.some((directory) => lower.startsWith(`${directory}/`));
  });
}

async function digest(file: string): Promise<{ sha: string; bytes: number }> {
  const contents = await readFile(file);
  return { sha: createHash('sha256').update(contents).digest('hex'), bytes: contents.length };
}

export async function identify(root: string): Promise<IdentifyResult> {
  const dropped: string[] = [];
  for (const file of await filesUnder(root)) {
    if (!EXECUTABLE.has(extname(file).slice(1).toLowerCase())) continue;
    dropped.push(relativePosix(root, file));
    await rm(file, { force: true });
  }
  const files = await filesUnder(root);
  const vendor = await detectVendor(files);
  const images = files
    .filter((file) => IMAGE.has(extname(file).slice(1).toLowerCase()))
    .map((file) => relativePosix(root, file));
  const items: Item[] = [];
  for (const file of files) {
    const path = relativePosix(root, file);
    const classification = classify(path);
    if (!classification) continue;
    const companions = classification.kind === 'model'
      ? modelCompanions(path, images)
      : [];
    items.push({ path, ...classification, companions: companions.sort(), role: 'primary' });
  }
  const lines: string[] = [];
  for (const file of files) {
    const { sha, bytes } = await digest(file);
    lines.push(`${sha}  ${bytes}  ${relativePosix(root, file)}`);
  }
  return { ...vendor, items, dropped: dropped.sort(), hashManifest: `${lines.sort().join('\n')}\n` };
}
