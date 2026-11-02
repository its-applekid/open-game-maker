#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { loadEnv } from '@ogm/config';

import { formatReport, reportFailed, type ConformanceReport } from './report.js';
import { runConformance, type RunOptions } from './runner.js';

export const USAGE =
  'usage: gm-sdk check <gameDir> [--previous <dir>] [--out <dir>] [--json] [--software-gl] [--browser chromium|webkit]';

export type CliIo = {
  out(line: string): void;
  err(line: string): void;
  env?: Record<string, string | undefined>;
  run?: (options: RunOptions) => Promise<ConformanceReport & { outDir: string }>;
};

/** 0: every check passed or is unchecked; 1: a check failed; 2: usage. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        previous: { type: 'string' },
        out: { type: 'string' },
        json: { type: 'boolean' },
        'software-gl': { type: 'boolean' },
        browser: { type: 'string' },
      },
    });
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }
  const [command, gameDir, ...extra] = parsed.positionals;
  const browser = parsed.values.browser ?? 'chromium';
  if (command !== 'check' || !gameDir || extra.length > 0 || (browser !== 'chromium' && browser !== 'webkit')) {
    io.err(USAGE);
    return 2;
  }
  const env = loadEnv('gm', {
    GM_VERIFY_SOFTWARE_GL: { kind: 'bool', required: false },
    XDG_RUNTIME_DIR: { kind: 'path', required: false },
  }, io.env);
  const report = await (io.run ?? runConformance)({
    gameDir,
    outDir: parsed.values.out,
    previousDir: parsed.values.previous,
    softwareGl: parsed.values['software-gl'] === true || env.GM_VERIFY_SOFTWARE_GL === true,
    browser,
    runtimeDir: env.XDG_RUNTIME_DIR,
  });
  if (parsed.values.json) io.out(JSON.stringify(report));
  else {
    for (const line of formatReport(report)) io.out(line);
    io.out(`report: ${report.outDir}/conformance.json`);
  }
  return reportFailed(report) ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
