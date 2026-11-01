import { createHash } from 'node:crypto';
import { lstat, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { licenseFor } from '@ogm/asset-cards';

export type QueueEntry = {
  queued_at?: string;
  drop_id: string;
  name: string;
  revision?: number;
  manifest: string;
};

export type DriveManifest = {
  drop_id: string;
  name: string;
  revision?: number;
  downloaded_at?: string;
  files_root?: string;
  files: Array<{ path: string; md5?: string; previous_quarantine?: string; downloaded?: boolean }>;
  license_files?: string[];
  integrity_ok: boolean;
  problems?: string[];
  usage_rights?: unknown;
};

export type OpenEntry = {
  entry: QueueEntry;
  manifest: DriveManifest;
  manifestPath: string;
  intakePath: string;
  fingerprint: string;
};

function inside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

export function resolveInboxPath(inbox: string, value: string): string {
  if (value.includes('\\') || value.split('/').includes('..') || isAbsolute(value)) {
    throw new Error(`unsafe inbox path ${JSON.stringify(value)}`);
  }
  const path = resolve(inbox, ...value.split('/'));
  if (!inside(inbox, path)) throw new Error(`inbox path escapes library ${JSON.stringify(value)}`);
  return path;
}

function fingerprint(manifest: DriveManifest): string {
  const md5s = manifest.files.map(({ md5 }) => md5 ?? '').sort();
  return createHash('sha256')
    .update(`${manifest.drop_id}\n${md5s.join('\n')}`)
    .digest('hex');
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function openQueue(assetsRoot: string): Promise<{ open: OpenEntry[]; problems: string[] }> {
  const inbox = join(resolve(assetsRoot), 'inbox');
  const queuePath = join(inbox, 'queue.jsonl');
  let contents: string;
  try {
    contents = await readFile(queuePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { open: [], problems: [] };
    throw error;
  }
  const open: OpenEntry[] = [];
  const problems: string[] = [];
  const lines = contents.split(/\r?\n/);
  // The last piece has no newline yet when drive_sync is mid-append; read it on the next poll.
  lines.pop();
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line) as QueueEntry;
      const manifestPath = resolveInboxPath(inbox, entry.manifest);
      const intakePath = join(dirname(manifestPath), 'intake.json');
      if (await exists(intakePath)) continue;
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DriveManifest;
      if (manifest.drop_id !== entry.drop_id)
        throw new Error(`manifest drop id does not match queue entry ${entry.drop_id}`);
      open.push({ entry, manifest, manifestPath, intakePath, fingerprint: fingerprint(manifest) });
    } catch (error) {
      problems.push(`queue line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { open, problems };
}

export async function knownLicense(entry: OpenEntry, assetsRoot: string): Promise<string | undefined> {
  const kenney = licenseFor('kenney');
  if (!kenney?.license_text_sha256) return undefined;
  const inbox = join(resolve(assetsRoot), 'inbox');
  const filesRoot = entry.manifest.files_root
    ? resolveInboxPath(inbox, entry.manifest.files_root)
    : join(dirname(entry.manifestPath), 'files');
  for (const name of entry.manifest.license_files ?? []) {
    if (name.includes('!/') || basename(name).toLowerCase() !== 'license.txt') continue;
    try {
      const path = resolveInboxPath(filesRoot, name);
      const info = await lstat(path);
      if (!info.isFile() || info.size > 1024 * 1024) continue;
      const text = await readFile(path, 'utf8');
      const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
      const hash = createHash('sha256').update(normalized).digest('hex');
      if (hash === kenney.license_text_sha256) return kenney.id;
    } catch {
      // Unreadable licence evidence remains a human judgment instead of widening rights.
    }
  }
  return undefined;
}
