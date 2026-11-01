import { basename } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

import { checkDocuments, type CheckResult } from '../validate.js';

export type CliIo = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

const packageRoot = new URL('../../', import.meta.url);

function formatResult(result: CheckResult): string {
  return `${result.ok ? 'ok  ' : 'FAIL'} ${result.check}  ${basename(result.file)}${
    result.ok ? '' : `  ${result.message ?? ''}`
  }`;
}

export function run(args: string[], io: CliIo = { stdout: console.log, stderr: console.error }): number {
  const useFixtures = !args.includes('--no-fixtures');
  const requested = args.filter((arg) => arg !== '--no-fixtures');
  const fixtureFiles = useFixtures
    ? readdirSync(new URL('fixtures/cards/', packageRoot))
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => new URL(`fixtures/cards/${file}`, packageRoot))
    : [];
  const files: Array<string | URL> = [...fixtureFiles, ...requested];

  let docs;
  try {
    docs = files.map((file) => ({
      file: basename(file instanceof URL ? file.pathname : file),
      doc: JSON.parse(readFileSync(file, 'utf8')) as unknown,
    }));
  } catch (error) {
    io.stderr(`validate-cards: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  io.stdout('schemas compiled (draft 2020-12, strict mode)');
  const checked = checkDocuments(docs);
  for (const result of checked.results) io.stdout(formatResult(result));
  const failures = checked.results.filter((result) => !result.ok).length;
  io.stdout(failures > 0 ? `\n${failures} failure(s)` : '\nall checks passed');
  return failures > 0 ? 1 : 0;
}
