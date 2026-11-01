import { readFileSync } from 'node:fs';

import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const addFormats = addFormatsModule as unknown as (instance: Ajv2020) => Ajv2020;

/** Validates a value against a committed `schemas/<stem>.json`, as non-TypeScript consumers will. */
export function emittedValidator(stem: string): (value: unknown) => boolean {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(new URL(`../schemas/${stem}.json`, import.meta.url), 'utf8')) as object;
  const validate = ajv.compile(schema);
  return (value) => validate(value) as boolean;
}
