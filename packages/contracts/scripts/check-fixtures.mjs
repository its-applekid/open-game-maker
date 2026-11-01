import { existsSync, readFileSync, readdirSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schemas = new URL('../schemas/', import.meta.url);
const fixtures = new URL('../fixtures/', import.meta.url);
const files = readdirSync(schemas).filter((file) => /\.v\d+\.json$/.test(file)).sort();

if (files.length === 0) throw new Error('No emitted schema fixtures found');

for (const file of files) {
  const fixture = new URL(file, fixtures);
  if (!existsSync(fixture)) throw new Error(`Missing fixture: fixtures/${file}`);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(new URL(file, schemas), 'utf8')));
  const value = JSON.parse(readFileSync(fixture, 'utf8'));
  if (!validate(value)) {
    throw new Error(`Fixture failed ${file}: ${JSON.stringify(validate.errors)}`);
  }
}
