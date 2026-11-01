import { readFile, stat } from 'node:fs/promises';

export type Vendor = 'kenney' | 'synty' | 'unknown';

export async function detectVendor(files: string[]): Promise<Vendor> {
  const normalized = files.map((file) => file.replaceAll('\\', '/').toLowerCase());
  const sourceLayout = normalized.some((file) => /(^|\/)(sourcefiles|source_sprites)(\/|$)/.test(file));
  if (sourceLayout || normalized.some((file) => file.endsWith('.unitypackage'))) {
    return 'synty';
  }
  for (let index = 0; index < files.length; index += 1) {
    if (!/(^|\/)(license|licence)(\.[^/]*)?$/i.test(files[index] ?? '')) continue;
    if ((await stat(files[index] ?? '')).size > 1024 * 1024) continue;
    const text = await readFile(files[index], 'utf8').catch(() => '');
    if (/kenney/i.test(text) && /\bcc0\b|creative commons zero/i.test(text)) {
      return 'kenney';
    }
  }
  return 'unknown';
}
