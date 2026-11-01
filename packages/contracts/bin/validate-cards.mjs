#!/usr/bin/env node
import { existsSync } from 'node:fs';

const entry = new URL('../dist/bin/validate-cards.js', import.meta.url);
if (!existsSync(entry)) {
  console.error('validate-cards: build output missing; run: pnpm --filter @ogm/contracts build');
  process.exit(2);
}

const { run } = await import(entry.href);
process.exitCode = run(process.argv.slice(2));
