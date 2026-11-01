import { readFile } from 'node:fs/promises';

export type Vendor = 'kenney' | 'synty' | 'unknown';

export async function detectVendor(files: string[]): Promise<{ vendor: Vendor; license: string | null }> {
  const normalized = files.map((file) => file.replaceAll('\\', '/').toLowerCase());
  const sourceLayout = normalized.some((file) => /(^|\/)(sourcefiles|source_sprites)(\/|$)/.test(file));
  if (sourceLayout || normalized.some((file) => file.endsWith('.unitypackage'))) {
    return { vendor: 'synty', license: 'LicenseRef-synty-personal' };
  }
  for (let index = 0; index < files.length; index += 1) {
    if (!/(^|\/)(license|licence)(\.[^/]*)?$/i.test(files[index] ?? '')) continue;
    const text = await readFile(files[index], 'utf8').catch(() => '');
    if (/kenney/i.test(text) && /\bcc0\b|creative commons zero/i.test(text)) {
      return { vendor: 'kenney', license: 'CC0-1.0' };
    }
  }
  return { vendor: 'unknown', license: null };
}
