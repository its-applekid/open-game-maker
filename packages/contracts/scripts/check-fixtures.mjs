import { existsSync, readFileSync, readdirSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schemas = new URL('../schemas/', import.meta.url);
const fixtures = new URL('../fixtures/', import.meta.url);
const files = readdirSync(schemas).filter((file) => /\.v\d+\.json$/.test(file)).sort();

if (files.length === 0) throw new Error('No emitted schema fixtures found');

// `<stem>.json` pairs with `fixtures/<stem>.json`; `<family>.<name>.vN.json` pairs with
// `fixtures/<family>/<name>.json` or every file in `fixtures/<family>/<name>/`.
function fixtureFiles(file) {
  const nested = /^([a-z-]+)\.(.+)\.v\d+\.json$/.exec(file);
  if (!nested) return [file];
  const [, family, name] = nested;
  const directory = new URL(`${family}/${name}/`, fixtures);
  if (existsSync(directory)) {
    return readdirSync(directory)
      .filter((entry) => entry.endsWith('.json'))
      .sort()
      .map((entry) => `${family}/${name}/${entry}`);
  }
  return [`${family}/${name}.json`];
}

// Relaxed for valid zod output: enum-keyed records emit `propertyNames` + `required` (strictRequired),
// and string/number unions emit `type: [..]` (allowUnionTypes).
for (const file of files) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(new URL(file, schemas), 'utf8')));
  const pairs = fixtureFiles(file);
  if (pairs.length === 0) throw new Error(`Missing fixture for schemas/${file}`);
  for (const fixturePath of pairs) {
    const fixture = new URL(fixturePath, fixtures);
    if (!existsSync(fixture)) throw new Error(`Missing fixture: fixtures/${fixturePath}`);
    const value = JSON.parse(readFileSync(fixture, 'utf8'));
    if (!validate(value)) {
      throw new Error(`Fixture failed ${fixturePath}: ${JSON.stringify(validate.errors)}`);
    }
  }
}
