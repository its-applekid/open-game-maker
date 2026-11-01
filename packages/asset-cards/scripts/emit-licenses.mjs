// Writes data/licenses.json from the built licence table, for the Python callers (scripts/assets/*.py).
import { writeFileSync } from 'node:fs';

const { LICENSES } = await import(new URL('../dist/licenses.js', import.meta.url).href);
writeFileSync(new URL('../data/licenses.json', import.meta.url), `${JSON.stringify(LICENSES, null, 2)}\n`);
