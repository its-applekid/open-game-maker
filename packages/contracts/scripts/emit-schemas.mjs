import { readdir, readFile, writeFile } from 'node:fs/promises';
import { toJSONSchema } from 'zod';

const dist = new URL('../dist/', import.meta.url);
const schemaDirectory = new URL('../schemas/', import.meta.url);
let emitted = 0;

for (const file of (await readdir(dist)).filter(
  (name) => name.endsWith('.js') && name !== 'index.js' && !name.endsWith('.generated.js'),
)) {
  const module = await import(new URL(file, dist).href);
  // A family exports its stems as `<family>Schemas` (design-log.ts -> designLogSchemas) so barrel names never collide.
  const family = file.slice(0, -'.js'.length).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  for (const [stem, schema] of Object.entries(module[`${family}Schemas`] ?? {})) {
    const jsonSchema = toJSONSchema(schema, { target: 'draft-2020-12' });
    const output = `${JSON.stringify(
      {
        ...jsonSchema,
        $id: `https://open-game-maker-2000.local/schemas/${stem}.json`,
      },
      null,
      2,
    )}\n`;
    const target = new URL(`${stem}.json`, schemaDirectory);
    if (process.argv.includes('--check')) {
      let current;
      try {
        current = await readFile(target, 'utf8');
      } catch {
        throw new Error(`Missing emitted schema: schemas/${stem}.json`);
      }
      if (current !== output) throw new Error(`Emitted schema is stale: schemas/${stem}.json`);
    } else {
      await writeFile(target, output);
    }
    emitted += 1;
  }
}

if (emitted === 0) throw new Error('No contract schema families were emitted');
