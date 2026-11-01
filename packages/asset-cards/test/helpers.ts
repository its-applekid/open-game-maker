import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE = fileURLToPath(new URL('./fixtures/library', import.meta.url));

/** A writable copy of the fixture library (the index is written into it). */
export function libraryCopy(): string {
  const root = mkdtempSync(join(tmpdir(), 'asset-cards-'));
  cpSync(FIXTURE, root, { recursive: true });
  return root;
}
