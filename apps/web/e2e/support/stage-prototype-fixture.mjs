import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { stagePrototype } from '../../tools/stage-prototype.mjs';

const root = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'ogm-prototype-browser-'));
const fixture = join(fixtureRoot, 'studio-v0');

try {
  await cp(join(root, 'prototypes', 'studio-v0'), fixture, { recursive: true });
  await Promise.all([
    mkdir(join(fixture, 'art'), { recursive: true }),
    mkdir(join(fixture, 'demo'), { recursive: true }),
    mkdir(join(fixture, 'town'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(fixture, 'art', 'logo-big.webp'), ''),
    writeFile(join(fixture, 'demo', 'index.html'), '<!doctype html><title>Prototype demo fixture</title>'),
    writeFile(join(fixture, 'town', 'index.html'), '<!doctype html><title>Prototype town fixture</title>'),
  ]);
  await stagePrototype(fixture, join(root, 'prototypes', 'ui-v0', 'site'), join(root, 'apps', 'web', 'dist', 'proto'));
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
