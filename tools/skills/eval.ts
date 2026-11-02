#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runEvalMain } from './eval/runner.js';

export { parseOptions, runEvaluation, runEvalMain } from './eval/runner.js';
export type { EvalOptions, EvalRun } from './eval/types.js';

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runEvalMain(process.argv.slice(2));
}
