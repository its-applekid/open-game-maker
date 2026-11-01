import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { loadEnv } from '@ogm/config';

import { loadIndex } from './build.js';
import { FAMILIES_PATH, StyleFamiliesSchema, computeCoverage, type StyleFamily } from './families.js';
import type { CardIndex } from './types.js';

export const CATALOG_IDS_PATH = fileURLToPath(new URL('../test/fixtures/catalog-ids.json', import.meta.url));

/** Recompute every family's coverage block; `failures` lists what the schema then rejects (a creation choice that lost a must-have). */
export function recompute(index: CardIndex, families: StyleFamily[]): { families: StyleFamily[]; failures: string[] } {
  const next = families.map((f) => ({ ...f, coverage: computeCoverage(index, f) }));
  const checked = StyleFamiliesSchema.safeParse(next);
  const failures = checked.success
    ? []
    : checked.error.issues.map((issue) => {
        const family = typeof issue.path[0] === 'number' ? next[issue.path[0]]?.id : undefined;
        return `${family ?? 'style-families.json'}: ${issue.message}`;
      });
  return { families: next, failures };
}

function table(families: StyleFamily[]): string[] {
  const keys = ['characters', 'environment', 'props', 'ui', 'sfx', 'music'] as const;
  return [
    ['family', ...keys, 'creation_choice'].join('  '),
    ...families.map((f) =>
      [f.id, ...keys.map((key) => (f.coverage[key] ? 'yes' : '-')), f.creation_choice ? 'yes' : '-'].join('  '),
    ),
  ];
}

/** `families:coverage [--root <assets-local>] [--emit-ids]`: exit 1 when a creation choice lacks characters, environment or props. */
async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { root: { type: 'string' }, 'emit-ids': { type: 'boolean', default: false } },
  });
  const env = loadEnv('gm', { OGM_ASSETS_ROOT: { kind: 'path', required: false } });
  const rootArg = values.root ?? env.OGM_ASSETS_ROOT;
  if (!rootArg) {
    console.error('no asset library: pass --root <assets-local> or set OGM_ASSETS_ROOT');
    return 2;
  }
  const root = resolve(rootArg);

  if (values['emit-ids']) {
    const catalog = JSON.parse(readFileSync(resolve(root, 'catalog.json'), 'utf8')) as { packs: { id: string }[] };
    const ids = catalog.packs.map((pack) => pack.id).sort();
    writeFileSync(CATALOG_IDS_PATH, `${JSON.stringify(ids, null, 2)}\n`);
    console.log(`wrote ${ids.length} pack ids to ${CATALOG_IDS_PATH}`);
  }

  const families = JSON.parse(readFileSync(FAMILIES_PATH, 'utf8')) as StyleFamily[];
  const { families: next, failures } = recompute(await loadIndex(root), families);
  writeFileSync(FAMILIES_PATH, `${JSON.stringify(next, null, 2)}\n`);
  for (const line of table(next)) console.log(line);
  for (const failure of failures) console.error(failure);
  return failures.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
