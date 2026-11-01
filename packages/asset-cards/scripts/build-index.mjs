#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { buildIndex, writeIndex } from '../dist/index.js';

const root = resolve(process.argv.slice(2).find((argument) => argument !== '--') ?? 'assets-local');
const packs = await stat(join(root, 'packs')).catch(() => null);
if (!packs?.isDirectory()) throw new Error(`asset root must contain an existing packs directory: ${join(root, 'packs')}`);
const index = await buildIndex(root);
if (index.errors.length) {
  for (const error of index.errors) {
    process.stderr.write(`${error.path}: ${error.errors.join('; ')}\n`);
  }
  throw new Error(`refusing to replace the asset index: ${index.errors.length} invalid card(s)`);
}
const output = await writeIndex(root, index);
process.stdout.write(`${index.cards.length} cards, ${index.errors.length} errors -> ${output}\n`);
