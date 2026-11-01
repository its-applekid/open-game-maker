import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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
  return createHash('sha256').update(`${manifest.drop_id}\n${md5s.join('\n')}`).digest('hex');
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

export async function openQueue(assetsRoot: string): Promise<OpenEntry[]> {
  const inbox = join(resolve(assetsRoot), 'inbox');
  const queuePath = join(inbox, 'queue.jsonl');
  let contents: string;
  try {
    contents = await readFile(queuePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const open: OpenEntry[] = [];
  for (const line of contents.split(/\r?\n/).filter(Boolean)) {
    const entry = JSON.parse(line) as QueueEntry;
    const manifestPath = resolveInboxPath(inbox, entry.manifest);
    const intakePath = join(dirname(manifestPath), 'intake.json');
    if (await exists(intakePath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DriveManifest;
    if (manifest.drop_id !== entry.drop_id) throw new Error(`manifest drop id does not match queue entry ${entry.drop_id}`);
    open.push({ entry, manifest, manifestPath, intakePath, fingerprint: fingerprint(manifest) });
  }
  return open;
}

export async function knownLicense(entry: OpenEntry, assetsRoot: string): Promise<string | undefined> {
  const inbox = join(resolve(assetsRoot), 'inbox');
  const filesRoot = entry.manifest.files_root
    ? resolveInboxPath(inbox, entry.manifest.files_root)
    : join(dirname(entry.manifestPath), 'files');
  for (const name of entry.manifest.license_files ?? []) {
    if (name.includes('!/')) continue;
    try {
      const text = await readFile(resolveInboxPath(filesRoot, name), 'utf8');
      if (/kenney/i.test(text) && /(?:cc0|public domain)/i.test(text)) return 'CC0-1.0';
    } catch {
      // Unreadable licence evidence remains a human judgment instead of widening rights.
    }
  }
  return undefined;
}
