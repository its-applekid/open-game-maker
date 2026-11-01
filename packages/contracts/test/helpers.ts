import { readdirSync, readFileSync } from 'node:fs';

const packageRoot = new URL('../', import.meta.url);

export function loadJson<T = unknown>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, packageRoot), 'utf8')) as T;
}

export function cardFixtureDocs(): Array<{ file: string; doc: unknown }> {
  const directory = new URL('fixtures/cards/', packageRoot);
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, doc: loadJson(`fixtures/cards/${file}`) }));
}

export function negativeFixture(name: string): { file: string; doc: unknown } {
  return {
    file: name,
    doc: loadJson(`fixtures/cards-negative/${name}`),
  };
}
