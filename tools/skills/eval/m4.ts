import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { filesUnder, isSourceFile } from './files.js';
import { flattenRenderKeys } from './m6.js';

export interface MechanicCheck {
  id: string;
  keys: string[];
  grep: string[];
}

function sourceText(dir: string): string {
  return filesUnder(dir, isSourceFile)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
    .toLowerCase();
}

const normalized = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function detectUnaskedMechanics(options: {
  gameDir: string;
  expectedMechanics: string[];
  renderState: unknown;
  checklist: MechanicCheck[];
}): Promise<{ unasked: string[] }> {
  const asked = options.expectedMechanics.join('\n').toLowerCase();
  const text = sourceText(join(options.gameDir, 'src'));
  const renderKeys = flattenRenderKeys(options.renderState).map(normalized);
  const unasked: string[] = [];

  for (const mechanic of options.checklist) {
    const phrases = [mechanic.id, ...mechanic.keys, ...mechanic.grep].map((value) => value.toLowerCase());
    if (phrases.some((phrase) => asked.includes(phrase))) continue;
    const foundKey = mechanic.keys.some((key) => {
      const wanted = normalized(key);
      return renderKeys.some((path) => path === wanted || path.endsWith(wanted));
    });
    const foundSource = mechanic.grep.some((term) => text.includes(term.toLowerCase()));
    if (foundKey || foundSource) unasked.push(mechanic.id);
  }

  return { unasked: unasked.sort() };
}
