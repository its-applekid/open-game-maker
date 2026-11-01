import { randomBytes } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

import { licenseFor } from '@ogm/asset-cards';

import { createCards } from './cards.js';
import { confirmCollection } from './confirm.js';
import { identify } from './identify.js';
import { unpack, type UnpackCaps } from './unpack.js';

export class PackRefusal extends Error {}

export type ImportOptions = {
  assetsRoot: string;
  cwd: string;
  input?: string;
  id: string;
  version?: string;
  license?: string;
  inspiration: boolean;
  fromQueue?: string;
};

type QueueEntry = { drop_id: string; name: string; manifest: string };
type ManifestFile = { path: string; downloaded?: boolean; previous_quarantine?: string };
type DriveManifest = {
  drop_id: string;
  name: string;
  revision?: number;
  downloaded_at?: string;
  integrity_ok: boolean;
  problems?: string[];
  files_root?: string;
  files: ManifestFile[];
  source?: { drive_id?: string };
  quarantine?: string;
};

const CAPS: UnpackCaps = { maxMembers: 200_000, maxUnpackedMb: 32_768, maxRatio: 200 };
const ARCHIVE = /\.(?:zip|7z|rar|tar|tgz|tar\.gz|unitypackage)$/i;

function safeSegment(value: string, label: string, pattern: RegExp): string {
  if (!pattern.test(value) || value.includes('..')) throw new PackRefusal(`${label} is unsafe: ${JSON.stringify(value)}`);
  return value;
}

function inside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !fromRoot.startsWith('/'));
}

function resolveInside(root: string, relativePath: string): string {
  if (relativePath.includes('\\') || relativePath.split('/').includes('..')) throw new PackRefusal(`unsafe relative path ${JSON.stringify(relativePath)}`);
  const path = resolve(root, ...relativePath.split('/'));
  if (!inside(root, path)) throw new PackRefusal(`path escapes asset inbox: ${JSON.stringify(relativePath)}`);
  return path;
}

function dateOnly(value?: string): string {
  return value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function defaultVersion(manifest?: DriveManifest): string {
  return manifest ? `${dateOnly(manifest.downloaded_at)}-r${manifest.revision ?? 0}` : dateOnly();
}

async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
  }
  return files.sort();
}

async function copyExclusive(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
}

async function assembleQueueSource(assetsRoot: string, dropId: string, target: string): Promise<{ manifest: DriveManifest; intakePath: string }> {
  const inbox = join(assetsRoot, 'inbox');
  const queuePath = join(inbox, 'queue.jsonl');
  const entries = (await readFile(queuePath, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as QueueEntry)
    .filter((entry) => entry.drop_id === dropId);
  const entry = entries.at(-1);
  if (!entry) throw new PackRefusal(`queue drop not found: ${dropId}`);
  const manifestPath = resolveInside(inbox, entry.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DriveManifest;
  if (manifest.drop_id !== dropId) throw new PackRefusal(`queue manifest drop id does not match ${dropId}`);
  if (!manifest.integrity_ok) throw new PackRefusal(`queue integrity check failed: ${(manifest.problems ?? ['unknown problem']).join('; ')}`);
  const currentRoot = manifest.files_root ? resolveInside(inbox, manifest.files_root) : join(dirname(manifestPath), 'files');
  for (const file of manifest.files) {
    const source = file.downloaded === false && file.previous_quarantine
      ? resolveInside(inbox, `quarantine/${file.previous_quarantine}/files/${file.path}`)
      : resolveInside(currentRoot, file.path);
    await copyExclusive(source, resolveInside(target, file.path));
  }
  return { manifest, intakePath: relative(assetsRoot, join(dirname(manifestPath), 'intake.json')).split(sep).join('/') };
}

async function copyExtracted(source: string, extracted: string): Promise<{ nested: number; dropped: string[] }> {
  const info = await lstat(source);
  if (info.isFile()) {
    if (ARCHIVE.test(source)) return unpack(source, extracted, CAPS);
    await mkdir(extracted, { recursive: true });
    await copyExclusive(source, join(extracted, basename(source)));
    return { nested: 0, dropped: [] };
  }
  await mkdir(extracted, { recursive: true });
  let nested = 0;
  const dropped: string[] = [];
  for (const file of await filesUnder(source)) {
    const path = relative(source, file);
    if (!ARCHIVE.test(file)) {
      await copyExclusive(file, join(extracted, path));
      continue;
    }
    const archiveTarget = await mkdtemp(join(dirname(extracted), '.archive-'));
    const result = await unpack(file, archiveTarget, CAPS);
    nested += 1 + result.nested;
    dropped.push(...result.dropped.map((droppedPath) => `${path}!/${droppedPath}`));
    const destination = join(extracted, dirname(path) === '.' ? '' : dirname(path));
    await mkdir(destination, { recursive: true });
    await cp(archiveTarget, destination, { recursive: true, force: false, errorOnExist: true });
    await rm(archiveTarget, { recursive: true, force: true });
  }
  return { nested, dropped };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  try {
    if ((await readFile(path, 'utf8')) === contents) return;
  } catch {
    // New file.
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`);
  await writeFile(temporary, contents, { flag: 'wx' });
  await rename(temporary, path);
}

async function writeText(path: string, contents: string): Promise<void> {
  try {
    if ((await readFile(path, 'utf8')) === contents) return;
  } catch {
    // New file.
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function originalNames(root: string): Promise<string[]> {
  return (await filesUnder(root)).map((file) => relative(root, file).split(sep).join('/'));
}

function titleFromId(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function publishCards(packRoot: string, cards: Awaited<ReturnType<typeof createCards>>): Promise<void> {
  await writeJson(join(packRoot, 'collection.card.json'), cards.collection);
  for (const card of cards.assets) {
    const local = card.id.split('/').at(-1)?.split('@')[0] ?? randomBytes(5).toString('hex');
    await writeJson(join(packRoot, 'cards', `${local}.card.json`), card);
  }
}

export async function importPack(options: ImportOptions) {
  const id = safeSegment(options.id, 'pack id', /^[a-z0-9][a-z0-9-]*$/);
  const topDir = join(options.assetsRoot, options.inspiration ? 'inspiration' : 'packs');
  await mkdir(topDir, { recursive: true });
  const staging = await mkdtemp(join(topDir, `.${id}.import-`));
  const stagedPack = join(staging, 'pack');
  let manifest: DriveManifest | undefined;
  let intakePath: string | undefined;
  let directFormat: 'directory' | 'archive' = 'directory';
  try {
    await mkdir(stagedPack);
    const source = join(staging, 'source');
    if (options.fromQueue) {
      await mkdir(source);
      ({ manifest, intakePath } = await assembleQueueSource(options.assetsRoot, options.fromQueue, source));
    } else {
      if (!options.input) throw new PackRefusal('an input directory or archive is required');
      const input = resolve(options.cwd, options.input);
      await stat(input).catch(() => {
        throw new PackRefusal(`input does not exist: ${input}`);
      });
      const inputInfo = await lstat(input);
      if (inputInfo.isDirectory()) await cp(input, source, { recursive: true, force: false, errorOnExist: true });
      else {
        await mkdir(source);
        await copyExclusive(input, join(source, basename(input)));
        directFormat = ARCHIVE.test(input) ? 'archive' : 'directory';
      }
    }
    const version = safeSegment(options.version ?? defaultVersion(manifest), 'version', /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    const stagedVersion = join(stagedPack, version);
    const originals = join(stagedVersion, 'originals');
    const extracted = join(stagedVersion, 'extracted');
    await copyExclusive(source, originals);
    const unpacked = await copyExtracted(source, extracted);
    const identified = await identify(extracted);
    const hashName = 'hash-manifest.txt';
    await writeText(join(stagedVersion, hashName), identified.hashManifest);
    const top = options.inspiration ? 'inspiration' : 'packs';
    const cards = await createCards({
      assetsRoot: options.assetsRoot,
      top,
      id,
      title: manifest?.name ?? titleFromId(id),
      version,
      vendor: identified.vendor,
      origin: manifest ? 'drive-drop' : 'vendor-pack',
      extracted,
      items: identified.items,
      hashManifest: hashName,
      date: dateOnly(manifest?.downloaded_at),
    });
    const types: Record<string, number> = {};
    for (const file of await filesUnder(extracted)) {
      const extension = extname(file).slice(1).toLowerCase() || 'none';
      types[extension] = (types[extension] ?? 0) + 1;
    }
    const pack = {
      id,
      vendor: identified.vendor,
      title: manifest?.name ?? titleFromId(id),
      license: 'NOASSERTION',
      current: version,
      versions: {
        [version]: {
          format: options.fromQueue ? 'drive-drop' : directFormat,
          originals: await originalNames(originals),
          extracted_files: (await filesUnder(extracted)).length,
          file_types: types,
          added: dateOnly(manifest?.downloaded_at),
          nested_archives: unpacked.nested,
          dropped: [...new Set([...unpacked.dropped, ...identified.dropped])].sort(),
        },
      },
      ...(manifest
        ? {
            source: {
              type: 'google-drive',
              drive_id: manifest.source?.drive_id ?? manifest.drop_id,
              quarantine: manifest.quarantine,
              intake_path: intakePath,
            },
          }
        : {}),
    };
    await writeJson(join(stagedPack, 'pack.json'), pack);
    await publishCards(stagedPack, cards);

    const packRoot = join(topDir, id);
    try {
      await lstat(packRoot);
      const targetVersion = join(packRoot, version);
      try {
        const existing = await readFile(join(targetVersion, hashName), 'utf8');
        if (existing !== identified.hashManifest) throw new PackRefusal(`version ${version} already exists with different content`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await rename(stagedVersion, targetVersion);
      }
      const existingPack = JSON.parse(await readFile(join(packRoot, 'pack.json'), 'utf8')) as typeof pack;
      await writeJson(join(packRoot, 'pack.json'), {
        ...existingPack,
        ...pack,
        versions: { ...existingPack.versions, ...pack.versions },
      });
      await publishCards(packRoot, cards);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await rename(stagedPack, packRoot);
    }

    let status: 'quarantined' | 'awaiting-license' | 'imported' = manifest ? 'awaiting-license' : 'quarantined';
    let license = options.license ?? identified.license ?? undefined;
    const row = license ? licenseFor(license) : undefined;
    if (row?.confirmed) {
      await confirmCollection({
        assetsRoot: options.assetsRoot,
        collectionId: cards.collection.id,
        license: row.id,
        confirmedBy: row.confirmed.by,
      });
      status = 'imported';
      license = row.id;
    } else if (intakePath) {
      await writeJson(resolveInside(options.assetsRoot, intakePath), {
        status: 'awaiting-license',
        collection: cards.collection.id,
        license: license ?? null,
        usage_rights: cards.collection.rights,
        confirmed_by: null,
        date: dateOnly(manifest?.downloaded_at),
        notes: 'A named human must confirm the license before this collection leaves quarantine.',
      });
    }
    return {
      collection: cards.collection.id,
      status,
      license: license ?? null,
      cards: cards.assets.length,
      counts: cards.collection.collection_info?.counts ?? {},
      flags: cards.validationErrors,
      dropped: [...new Set([...unpacked.dropped, ...identified.dropped])].sort(),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
