/**
 * Scenario CLI: `pnpm --filter @ogm/gm-verify scenario two-client --game <gameDir> [--out <dir>]`.
 * Prints the report path and summary; exits 1 unless the verdict is pass.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { loadEnv } from '@ogm/config';
import { summaryLines } from '@ogm/gm-verify';

import { runTwoClient } from './two-client.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { game: { type: 'string' }, out: { type: 'string' } },
});
const env = loadEnv('gm', { GM_VERIFY_SOFTWARE_GL: { kind: 'bool', required: false } });
/* pnpm runs package scripts in the package directory; paths resolve against where it was invoked. */
// eslint-disable-next-line no-restricted-properties -- INIT_CWD is pnpm's invocation directory, not configuration
const cwd = process.env.INIT_CWD ?? process.cwd();
if (positionals[0] !== 'two-client' || !values.game) {
  console.error('usage: scenario two-client --game <gameDir> [--out <dir>]');
  process.exit(2);
}
const { report, reportPath } = await runTwoClient({
  gameDir: resolve(cwd, values.game),
  out: resolve(cwd, values.out ?? 'shots/two-client'),
  softwareGl: env.GM_VERIFY_SOFTWARE_GL === true,
  log: (line) => console.log(`step ${line}`),
});
for (const line of summaryLines(report)) console.log(line);
console.log(`report ${reportPath}`);
process.exitCode = report.verdict === 'pass' ? 0 : 1;
