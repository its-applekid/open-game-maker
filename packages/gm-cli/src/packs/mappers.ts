import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { parseLpcCredits } from './credits-csv.js';
import type { LicenseMap } from './license-map.js';

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function relativePosix(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

async function regularFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error(`mirror contains a link or device: ${relativePosix(root, join(entry.parentPath, entry.name))}`);
    }
    if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
  }
  return files.sort();
}

export async function mapEveryFile(root: string, license: string, attribution: string | null): Promise<LicenseMap> {
  return Object.fromEntries(
    (await regularFiles(root)).map((path) => [relativePosix(root, path), { license, attribution }]),
  );
}

export async function lpcCreditsMap(root: string, includeSa: boolean): Promise<LicenseMap> {
  return parseLpcCredits(await readFile(join(root, 'CREDITS.csv'), 'utf8'), { includeSa });
}

export async function gameIconsMap(root: string): Promise<LicenseMap> {
  const licenseNotes = (
    await Promise.all(['LICENSE', 'LICENSE.md', 'README', 'README.md'].map((name) => readOptional(join(root, name))))
  )
    .filter((text): text is string => text !== undefined)
    .join('\n');
  const cc0Authors = new Set(
    [...licenseNotes.matchAll(/^\s*([\w.-]+)\s*:\s*CC0(?:\s|$)/gim)].map((match) => match[1]!.toLowerCase()),
  );
  const result: LicenseMap = {};
  for (const path of await regularFiles(root)) {
    if (!path.toLowerCase().endsWith('.svg')) continue;
    const local = relativePosix(root, path);
    const parts = local.split('/');
    const author = parts[0] === 'icons' ? parts[1] : parts[0];
    if (!author) continue;
    result[local] = cc0Authors.has(author.toLowerCase())
      ? { license: 'CC0-1.0', attribution: null }
      : { license: 'CC-BY-3.0', attribution: `${author} (game-icons.net)` };
  }
  return result;
}

function supportedFontLicense(value: unknown): 'OFL-1.1' | 'Apache-2.0' | null {
  const raw = typeof value === 'string' ? value : undefined;
  if (!raw) return null;
  if (/\bOFL(?:-1\.1)?\b|SIL OPEN FONT LICENSE(?:,? VERSION)? 1\.1/i.test(raw)) return 'OFL-1.1';
  if (/\bApache-2\.0\b|Apache License(?:,? Version)? 2\.0/i.test(raw)) return 'Apache-2.0';
  return null;
}

export async function fontsourceMap(
  root: string,
): Promise<{ license: string | null; attribution: null; dropped?: string }> {
  let declared: unknown;
  for (const name of ['metadata.json', 'package.json']) {
    const text = await readOptional(join(root, name));
    if (!text) continue;
    const document = JSON.parse(text) as { license?: unknown };
    if (document.license !== undefined) declared = document.license;
    const supported = supportedFontLicense(document.license);
    if (supported) return { license: supported, attribution: null };
  }
  const licenseText = await readOptional(join(root, 'LICENSE'));
  const supported = supportedFontLicense(licenseText);
  if (supported) return { license: supported, attribution: null };
  const shown = typeof declared === 'string' ? declared : (licenseText?.split(/\r?\n/, 1)[0] ?? 'missing');
  return { license: null, attribution: null, dropped: `unmapped Fontsource license "${shown}"` };
}
