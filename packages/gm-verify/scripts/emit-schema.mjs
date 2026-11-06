import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { toJSONSchema } from 'zod';

const { ALWAYS_UNCHECKED, schemas } = await import('../dist/report.js');
const directory = new URL('../schemas/', import.meta.url);
await mkdir(directory, { recursive: true });

for (const [stem, schema] of Object.entries(schemas)) {
  const jsonSchema = toJSONSchema(schema, { target: 'draft-2020-12' });
  if (stem === 'verify-report.v1') {
    jsonSchema.properties.unchecked.allOf = ALWAYS_UNCHECKED.map((item) => ({ contains: { const: item } }));
    /* `seats` defaults to an empty list in the schema itself, so a report written before N6 must stay valid here too. */
    jsonSchema.required = jsonSchema.required.filter((key) => key !== 'seats');
  }
  const output = `${JSON.stringify(
    { ...jsonSchema, $id: `https://open-game-maker-2000.local/schemas/${stem}.json` },
    null,
    2,
  )}\n`;
  const target = new URL(`${stem}.json`, directory);
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
}
